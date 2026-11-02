import crypto from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db, orders } from "../../core/database/index.js";
import { config } from "../../core/config/index.js";
import { OrderService } from "../orders/order.service.js";

export interface PaymentSessionResult {
  orderId: string;
  orderCode: string;
  amountCents: number;
  currency: string;
  provider: "mock" | "razorpay" | "stripe";
  gatewayOrderId: string;
  keyId?: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
}

export interface VerifyClientPaymentParams {
  orderId: string;
  paymentId: string;
  gatewayOrderId: string;
  signature: string;
}

export interface WebhookProcessingParams {
  provider: "mock" | "razorpay" | "stripe";
  rawBody: string;
  signature: string;
  event: any;
}

export class PaymentService {
  /**
   * Safe comparison avoiding timing attacks
   */
  private static timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Initializes a payment checkout session for a customer order
   */
  static async createPaymentSession(
    orderId: string,
    preferredProvider?: "mock" | "razorpay" | "stripe",
  ): Promise<PaymentSessionResult> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      const err: any = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }

    if (order.status !== "PENDING_PAYMENT") {
      const err: any = new Error(
        `Order cannot be paid in status: ${order.status}`,
      );
      err.statusCode = 400;
      throw err;
    }

    const provider =
      preferredProvider ||
      (config.PAYMENT_GATEWAY_PROVIDER as "mock" | "razorpay" | "stripe") ||
      "mock";

    let gatewayOrderId = order.paymentGatewayOrderId;
    if (!gatewayOrderId || !gatewayOrderId.startsWith(provider)) {
      if (provider === "razorpay") {
        gatewayOrderId = `order_rzp_${Date.now().toString().slice(-8)}_${Math.random().toString(36).substring(2, 6)}`;
      } else if (provider === "stripe") {
        gatewayOrderId = `cs_test_${Date.now().toString().slice(-8)}_${Math.random().toString(36).substring(2, 6)}`;
      } else {
        gatewayOrderId = `mock_order_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      }

      await db
        .update(orders)
        .set({
          paymentGatewayProvider: provider,
          paymentGatewayOrderId: gatewayOrderId,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    }

    let keyId: string | undefined;
    if (provider === "razorpay") {
      keyId = config.RAZORPAY_KEY_ID;
    }

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      amountCents: order.totalAmountCents,
      currency: order.currency,
      provider,
      gatewayOrderId,
      keyId,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
    };
  }

  /**
   * Cryptographically verifies client-submitted payment signatures (e.g. Razorpay checkout modal)
   */
  static async verifyClientSignature(params: VerifyClientPaymentParams) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, params.orderId))
      .limit(1);

    if (!order) {
      const err: any = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }

    if (order.status === "PAID" || order.status === "QUEUED") {
      return { success: true, alreadyPaid: true, orderId: order.id };
    }

    const provider = order.paymentGatewayProvider || "mock";
    let secret = config.PAYMENT_WEBHOOK_SECRET;
    if (provider === "razorpay") {
      secret = config.RAZORPAY_KEY_SECRET;
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${params.gatewayOrderId}|${params.paymentId}`)
      .digest("hex");

    const isValid = this.timingSafeCompare(expectedSignature, params.signature);
    if (!isValid) {
      const err: any = new Error(
        "Invalid payment signature verification failed",
      );
      err.code = "INVALID_SIGNATURE";
      err.statusCode = 400;
      throw err;
    }

    // Confirm payment and transition state to PAID & QUEUED
    return await OrderService.confirmPayment(order.id, params.paymentId);
  }

  /**
   * Cryptographically verifies HMAC SHA-256 webhook signatures from Razorpay, Stripe, or Mock
   */
  static verifyWebhookSignature(
    rawPayload: string,
    signature: string,
    provider: "mock" | "razorpay" | "stripe",
  ): boolean {
    if (!signature) return false;

    if (provider === "razorpay") {
      const expected = crypto
        .createHmac("sha256", config.RAZORPAY_WEBHOOK_SECRET)
        .update(rawPayload)
        .digest("hex");
      return this.timingSafeCompare(expected, signature);
    }

    if (provider === "stripe") {
      // Stripe signature header format: t=timestamp,v1=signature
      const parts = signature
        .split(",")
        .reduce<Record<string, string>>((acc, part) => {
          const [k, v] = part.split("=");
          if (k && v) acc[k.trim()] = v.trim();
          return acc;
        }, {});

      const timestamp = parts["t"];
      const v1Sig = parts["v1"];
      if (!timestamp || !v1Sig) return false;

      // Check replay window (tolerance: 5 minutes)
      const nowSeconds = Math.floor(Date.now() / 1000);
      const toleranceSeconds = 300;
      if (Math.abs(nowSeconds - parseInt(timestamp, 10)) > toleranceSeconds) {
        return false;
      }

      const signedPayload = `${timestamp}.${rawPayload}`;
      const expected = crypto
        .createHmac("sha256", config.STRIPE_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest("hex");
      return this.timingSafeCompare(expected, v1Sig);
    }

    // Default Mock Provider
    const expected = crypto
      .createHmac("sha256", config.PAYMENT_WEBHOOK_SECRET)
      .update(rawPayload)
      .digest("hex");
    return this.timingSafeCompare(expected, signature);
  }

  /**
   * Ingests and idempotently processes payment gateway webhooks
   */
  static async processWebhook(params: WebhookProcessingParams) {
    // 1. Verify HMAC Signature
    const isValid = this.verifyWebhookSignature(
      params.rawBody,
      params.signature,
      params.provider,
    );
    if (!isValid) {
      const err: any = new Error(
        "Cryptographic webhook signature verification failed",
      );
      err.code = "INVALID_WEBHOOK_SIGNATURE";
      err.statusCode = 401;
      throw err;
    }

    // 2. Extract Gateway Payment & Order identifiers
    let gatewayOrderId: string | undefined;
    let gatewayPaymentId: string | undefined;
    let orderId: string | undefined;

    const event = params.event;
    if (params.provider === "razorpay") {
      // Razorpay payment.captured or order.paid
      const paymentEntity = event?.payload?.payment?.entity;
      gatewayPaymentId = paymentEntity?.id;
      gatewayOrderId =
        paymentEntity?.order_id || event?.payload?.order?.entity?.id;
      orderId = paymentEntity?.notes?.orderId;
    } else if (params.provider === "stripe") {
      // Stripe checkout.session.completed or payment_intent.succeeded
      const sessionObj = event?.data?.object;
      gatewayPaymentId = sessionObj?.payment_intent || sessionObj?.id;
      gatewayOrderId = sessionObj?.id;
      orderId = sessionObj?.metadata?.orderId;
    } else {
      // Mock gateway format
      gatewayPaymentId =
        event?.paymentId ||
        event?.paymentGatewayPaymentId ||
        `mock_pay_${Date.now()}`;
      gatewayOrderId = event?.gatewayOrderId || event?.paymentGatewayOrderId;
      orderId = event?.orderId;
    }

    // 3. Locate Target Order
    const conditions = [];
    if (orderId) conditions.push(eq(orders.id, orderId));
    if (gatewayOrderId)
      conditions.push(eq(orders.paymentGatewayOrderId, gatewayOrderId));

    if (conditions.length === 0) {
      const err: any = new Error("Webhook missing order reference identifiers");
      err.statusCode = 400;
      throw err;
    }

    const [targetOrder] = await db
      .select()
      .from(orders)
      .where(or(...conditions))
      .limit(1);

    if (!targetOrder) {
      const err: any = new Error(
        `Order reference not found for gatewayOrderId: ${gatewayOrderId}`,
      );
      err.statusCode = 404;
      throw err;
    }

    // 4. Idempotency Check (Prevent duplicate state transitions or duplicate print queues)
    if (
      targetOrder.status === "PAID" ||
      targetOrder.status === "QUEUED" ||
      targetOrder.status === "PRINTING" ||
      targetOrder.status === "COMPLETED"
    ) {
      return {
        success: true,
        duplicate: true,
        orderId: targetOrder.id,
        orderCode: targetOrder.orderCode,
        message: "Webhook already processed (Idempotent)",
      };
    }

    // 5. Authoritatively transition order and queue for print station
    const result = await OrderService.confirmPayment(
      targetOrder.id,
      gatewayPaymentId,
    );

    return {
      success: true,
      duplicate: false,
      orderId: targetOrder.id,
      orderCode: targetOrder.orderCode,
      status: result.order.status,
      printJobId: result.job.id,
    };
  }
}
