import { eq, and } from 'drizzle-orm';
import { db, orders, orderItems, printJobs, documents, auditLogs } from '../../core/database/index.js';
import { PricingService } from '../pricing/pricing.service.js';

export class OrderService {
  /**
   * Generates a 4-digit human-friendly order code (e.g., QP-4912)
   */
  private static generateOrderCode(): string {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    return `QP-${randomDigits}`;
  }

  /**
   * Creates a verified order checkout with authoritative pricing
   */
  static async createCheckout(params: {
    shopId: string;
    documentId: string;
    paperSize: 'A4' | 'A3' | 'LEGAL' | 'PHOTO';
    colorMode: 'BW' | 'COLOR';
    duplexMode: 'SIMPLEX' | 'DUPLEX';
    copies: number;
    customerPhone?: string;
    customerEmail?: string;
  }) {
    // 1. Fetch document and verify existence
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, params.documentId), eq(documents.shopId, params.shopId)))
      .limit(1);

    if (!doc) {
      throw new Error('Document not found or does not belong to this shop');
    }

    if (doc.status === 'PURGED') {
      throw new Error('Document has expired and was purged');
    }

    // 2. Authoritatively calculate price on server
    const quote = await PricingService.calculateQuote({
      shopId: params.shopId,
      pages: doc.pageCount,
      copies: params.copies,
      colorMode: params.colorMode,
      duplexMode: params.duplexMode,
      paperSize: params.paperSize,
    });

    // 3. Create Order
    const orderCode = this.generateOrderCode();
    const [order] = await db
      .insert(orders)
      .values({
        shopId: params.shopId,
        orderCode,
        customerPhone: params.customerPhone || null,
        customerEmail: params.customerEmail || null,
        subtotalAmountCents: quote.totalAmountCents,
        discountAmountCents: 0,
        totalAmountCents: quote.totalAmountCents,
        currency: 'INR',
        status: 'PENDING_PAYMENT',
        paymentGatewayProvider: 'mock',
        paymentGatewayOrderId: `mock_order_${Date.now()}`,
      })
      .returning();

    // 4. Create Order Item
    await db.insert(orderItems).values({
      orderId: order.id,
      documentId: doc.id,
      paperSize: params.paperSize,
      colorMode: params.colorMode,
      duplexMode: params.duplexMode,
      pageRange: 'all',
      pagesPerCopy: doc.pageCount,
      copies: params.copies,
      unitPriceCents: quote.unitPriceCents,
      totalPriceCents: quote.totalAmountCents,
    });

    // 5. Audit log
    await db.insert(auditLogs).values({
      shopId: params.shopId,
      actorType: 'CUSTOMER',
      action: 'ORDER_CHECKOUT_CREATED',
      metadata: { orderId: order.id, orderCode, totalAmountCents: order.totalAmountCents },
    });

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      totalAmountCents: order.totalAmountCents,
      currency: order.currency,
      status: order.status,
      pages: doc.pageCount,
      copies: params.copies,
      paymentGatewayOrderId: order.paymentGatewayOrderId,
    };
  }

  /**
   * Confirms payment and enqueues job for shop print station
   */
  static async confirmPayment(orderId: string, paymentId?: string) {
    const [order] = await db
      .update(orders)
      .set({
        status: 'PAID',
        paymentGatewayPaymentId: paymentId || `mock_pay_${Date.now()}`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    if (!order) {
      throw new Error('Order not found');
    }

    // Automatically create a Print Job in QUEUED status
    const [job] = await db
      .insert(printJobs)
      .values({
        shopId: order.shopId,
        orderId: order.id,
        status: 'QUEUED',
      })
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      shopId: order.shopId,
      actorType: 'SYSTEM',
      action: 'PAYMENT_RECEIVED',
      metadata: { orderId: order.id, printJobId: job.id, amountCents: order.totalAmountCents },
    });

    return { order, job };
  }

  /**
   * Fetches order status for customer tracking screen
   */
  static async getOrderStatus(orderCode: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderCode, orderCode))
      .limit(1);

    if (!order) {
      return null;
    }

    const items = await db
      .select({
        id: orderItems.id,
        paperSize: orderItems.paperSize,
        colorMode: orderItems.colorMode,
        duplexMode: orderItems.duplexMode,
        pagesPerCopy: orderItems.pagesPerCopy,
        copies: orderItems.copies,
        totalPriceCents: orderItems.totalPriceCents,
        originalFilename: documents.originalFilename,
      })
      .from(orderItems)
      .innerJoin(documents, eq(orderItems.documentId, documents.id))
      .where(eq(orderItems.orderId, order.id));

    return {
      order,
      items,
    };
  }
}
