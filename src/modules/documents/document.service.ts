import { randomUUID } from 'crypto';
import { eq, and, lte, ne } from 'drizzle-orm';
import { db, documents, auditLogs } from '../../core/database/index.js';
import { S3Service } from './s3.service.js';
import { config } from '../../core/config/index.js';

export class DocumentService {
  /**
   * Initializes a private upload intent and returns a presigned S3 PUT URL
   */
  static async createUploadIntent(params: {
    shopId: string;
    filename: string;
    fileSizeBytes: number;
    mimeType?: string;
  }) {
    const documentId = randomUUID();
    const sanitizedFilename = params.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `tenants/${params.shopId}/documents/${documentId}_${sanitizedFilename}`;

    // Retention expiry: current time + configured retention hours (default: 2 hours)
    const expiresAt = new Date(Date.now() + config.DOCUMENT_RETENTION_HOURS * 60 * 60 * 1000);

    const [doc] = await db
      .insert(documents)
      .values({
        id: documentId,
        shopId: params.shopId,
        originalFilename: sanitizedFilename,
        storageKey,
        mimeType: params.mimeType || 'application/pdf',
        fileSizeBytes: params.fileSizeBytes,
        pageCount: 1, // Default, updated on verification
        status: 'UPLOADED',
        expiresAt,
      })
      .returning();

    const uploadUrl = await S3Service.getPresignedUploadUrl(storageKey, params.mimeType || 'application/pdf');

    // Audit log
    await db.insert(auditLogs).values({
      shopId: params.shopId,
      actorType: 'CUSTOMER',
      action: 'DOCUMENT_UPLOAD_INTENT',
      metadata: { documentId: doc.id, filename: sanitizedFilename, fileSizeBytes: params.fileSizeBytes },
    });

    return {
      documentId: doc.id,
      storageKey: doc.storageKey,
      uploadUrl,
      expiresAt: doc.expiresAt.toISOString(),
    };
  }

  /**
   * Updates document verified page count after client uploads the file
   */
  static async verifyDocument(documentId: string, pageCount: number) {
    const [doc] = await db
      .update(documents)
      .set({
        pageCount: Math.max(1, pageCount),
        status: 'VERIFIED',
      })
      .where(eq(documents.id, documentId))
      .returning();

    return doc;
  }

  /**
   * Hard-deletes expired customer documents from S3 and updates database status
   */
  static async purgeExpiredDocuments(): Promise<number> {
    const now = new Date();
    const expiredDocs = await db
      .select()
      .from(documents)
      .where(and(lte(documents.expiresAt, now), ne(documents.status, 'PURGED')))
      .limit(50);

    let purgedCount = 0;
    for (const doc of expiredDocs) {
      try {
        await S3Service.deleteDocument(doc.storageKey);
        await db.update(documents).set({ status: 'PURGED' }).where(eq(documents.id, doc.id));

        await db.insert(auditLogs).values({
          shopId: doc.shopId,
          actorType: 'SYSTEM',
          action: 'DOCUMENT_PURGED',
          metadata: { documentId: doc.id, storageKey: doc.storageKey, reason: 'TTL_EXPIRED' },
        });

        purgedCount++;
      } catch (err) {
        console.error(`Failed to purge document ${doc.id}:`, err);
      }
    }

    return purgedCount;
  }
}
