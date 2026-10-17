import { eq, and, desc, inArray } from 'drizzle-orm';
import { db, printJobs, orders, orderItems, documents, auditLogs } from '../../core/database/index.js';
import { S3Service } from '../documents/s3.service.js';

export class PrintStationService {
  /**
   * Fetches active print queue for a specific shop (Scoped strictly by shopId)
   */
  static async getQueue(shopId: string) {
    const jobs = await db
      .select({
        jobId: printJobs.id,
        status: printJobs.status,
        createdAt: printJobs.createdAt,
        orderId: orders.id,
        orderCode: orders.orderCode,
        customerPhone: orders.customerPhone,
        totalAmountCents: orders.totalAmountCents,
      })
      .from(printJobs)
      .innerJoin(orders, eq(printJobs.orderId, orders.id))
      .where(
        and(
          eq(printJobs.shopId, shopId),
          inArray(printJobs.status, ['QUEUED', 'PRINTING'])
        )
      )
      .orderBy(desc(printJobs.createdAt));

    // Enhance each job with its document details
    const enhancedJobs = await Promise.all(
      jobs.map(async (job) => {
        const items = await db
          .select({
            documentId: documents.id,
            originalFilename: documents.originalFilename,
            pageCount: documents.pageCount,
            paperSize: orderItems.paperSize,
            colorMode: orderItems.colorMode,
            duplexMode: orderItems.duplexMode,
            copies: orderItems.copies,
          })
          .from(orderItems)
          .innerJoin(documents, eq(orderItems.documentId, documents.id))
          .where(eq(orderItems.orderId, job.orderId));

        return { ...job, items };
      })
    );

    return enhancedJobs;
  }

  /**
   * Generates single-use ephemeral download URL (60s TTL) for staff printer
   */
  static async getDownloadTicket(jobId: string, shopId: string) {
    const [job] = await db
      .select()
      .from(printJobs)
      .where(and(eq(printJobs.id, jobId), eq(printJobs.shopId, shopId)))
      .limit(1);

    if (!job) {
      throw new Error('Print job not found or does not belong to this shop');
    }

    // Fetch the document
    const [item] = await db
      .select({
        storageKey: documents.storageKey,
        originalFilename: documents.originalFilename,
      })
      .from(orderItems)
      .innerJoin(documents, eq(orderItems.documentId, documents.id))
      .where(eq(orderItems.orderId, job.orderId))
      .limit(1);

    if (!item) {
      throw new Error('Associated document not found');
    }

    // 60-second single-use download token
    const downloadUrl = await S3Service.getPresignedDownloadUrl(item.storageKey, 60);

    // Update job status to PRINTING
    await db
      .update(printJobs)
      .set({ status: 'PRINTING', startedAt: new Date() })
      .where(eq(printJobs.id, jobId));

    return {
      jobId: job.id,
      filename: item.originalFilename,
      downloadUrl,
      expiresInSeconds: 60,
    };
  }

  /**
   * Marks print job complete and immediately triggers customer document purge
   */
  static async completeJob(jobId: string, shopId: string) {
    const [job] = await db
      .update(printJobs)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(and(eq(printJobs.id, jobId), eq(printJobs.shopId, shopId)))
      .returning();

    if (!job) {
      throw new Error('Print job not found');
    }

    // Mark order complete
    await db
      .update(orders)
      .set({ status: 'COMPLETED', updatedAt: new Date() })
      .where(eq(orders.id, job.orderId));

    // Audit log
    await db.insert(auditLogs).values({
      shopId,
      actorType: 'STAFF',
      action: 'JOB_COMPLETED',
      metadata: { printJobId: job.id, orderId: job.orderId },
    });

    // Hard-delete document from S3 immediately upon successful completion
    const items = await db
      .select({
        docId: documents.id,
        storageKey: documents.storageKey,
      })
      .from(orderItems)
      .innerJoin(documents, eq(orderItems.documentId, documents.id))
      .where(eq(orderItems.orderId, job.orderId));

    for (const item of items) {
      try {
        await S3Service.deleteDocument(item.storageKey);
        await db.update(documents).set({ status: 'PURGED' }).where(eq(documents.id, item.docId));
        await db.insert(auditLogs).values({
          shopId,
          actorType: 'SYSTEM',
          action: 'DOCUMENT_PURGED',
          metadata: { documentId: item.docId, reason: 'JOB_COMPLETED' },
        });
      } catch (err) {
        console.error(`Failed to delete document ${item.docId} upon job completion:`, err);
      }
    }

    return { success: true, jobId: job.id, status: 'COMPLETED' };
  }
}
