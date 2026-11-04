import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildServer } from '../../src/server.ts';
import { db, orders, documents, printJobs, queryClient } from '../../src/core/database/index.js';
import { config } from '../../src/core/config/index.js';

describe('Payment Gateway & Webhook Verification Suite', () => {
  let app: FastifyInstance;
  let shopId: string;
  let testDocId: string;
  let testOrderId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Resolve demo shop
    const shopRes = await app.inject({
      method: 'GET',
      url: '/api/v1/public/shops/QR_CAMPUS_NORTH_LIB_01',
    });
    expect(shopRes.statusCode).toBe(200);
    const shopBody = JSON.parse(shopRes.body);
    shopId = shopBody.data.id;

    // 2. Create a test uploaded document
    const [doc] = await db
      .insert(documents)
      .values({
        shopId,
        originalFilename: 'test_contract.pdf',
        storageKey: `tenants/${shopId}/documents/test_${Date.now()}.pdf`,
        fileSizeBytes: 1024,
        pageCount: 4,
        status: 'VERIFIED',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      })
      .returning();
    testDocId = doc.id;

    // 3. Create checkout order in PENDING_PAYMENT
    const checkoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/public/orders/checkout',
      payload: {
        shopId,
        documentId: testDocId,
        paperSize: 'A4',
        colorMode: 'BW',
        duplexMode: 'SIMPLEX',
        copies: 1,
        customerPhone: '+919876543210',
        customerEmail: 'student@campus.edu',
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkoutBody = JSON.parse(checkoutRes.body);
    testOrderId = checkoutBody.data.orderId;
    expect(checkoutBody.data.status).toBe('PENDING_PAYMENT');
  });

  afterAll(async () => {
    await app.close();
    await queryClient.end();
  });

  it('POST /api/v1/public/payments/create-session generates gateway order session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/payments/create-session',
      payload: {
        orderId: testOrderId,
        provider: 'razorpay',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.orderId).toBe(testOrderId);
    expect(body.data.provider).toBe('razorpay');
    expect(body.data.gatewayOrderId).toMatch(/^order_rzp_/);
    expect(body.data.amountCents).toBeGreaterThan(0);
    expect(body.data.keyId).toBe(config.RAZORPAY_KEY_ID);
  });

  it('POST /api/v1/public/payments/verify rejects invalid client signature (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/payments/verify',
      payload: {
        orderId: testOrderId,
        paymentId: 'pay_tampered_12345',
        gatewayOrderId: 'order_rzp_mock123',
        signature: 'invalid_sha256_hash_value_here',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('POST /api/v1/public/payments/webhook rejects unauthorized requests without signature (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/payments/webhook?provider=razorpay',
      payload: {
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_123' } } },
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
  });

  it('POST /api/v1/public/payments/webhook processes Razorpay payment.captured with valid HMAC', async () => {
    // 1. Fetch current gateway order ID
    const [currOrder] = await db.select().from(orders).where(eq(orders.id, testOrderId));
    const gatewayOrderId = currOrder.paymentGatewayOrderId;
    const gatewayPaymentId = `pay_rzp_${Date.now()}`;

    // 2. Build mock Razorpay webhook payload
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: gatewayPaymentId,
            order_id: gatewayOrderId,
            amount: currOrder.totalAmountCents,
            currency: 'INR',
            status: 'captured',
            notes: {
              orderId: testOrderId,
            },
          },
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayload);

    // 3. Generate valid HMAC-SHA256 signature
    const signature = crypto
      .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    // 4. Send webhook
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature,
      },
      payload: rawBody,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PAID');
    expect(body.data.orderId).toBe(testOrderId);
    expect(body.data.duplicate).toBe(false);

    // 5. Verify database state: order is PAID and job is QUEUED
    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, testOrderId));
    expect(updatedOrder.status).toBe('PAID');
    expect(updatedOrder.paymentGatewayPaymentId).toBe(gatewayPaymentId);

    const queuedJobs = await db.select().from(printJobs).where(eq(printJobs.orderId, testOrderId));
    expect(queuedJobs.length).toBe(1);
    expect(queuedJobs[0].status).toBe('QUEUED');
  });

  it('POST /api/v1/public/payments/webhook handles idempotent duplicate delivery safely', async () => {
    // Replay the exact same webhook for the already paid order
    const [currOrder] = await db.select().from(orders).where(eq(orders.id, testOrderId));
    const gatewayOrderId = currOrder.paymentGatewayOrderId;
    const gatewayPaymentId = currOrder.paymentGatewayPaymentId;

    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: gatewayPaymentId,
            order_id: gatewayOrderId,
            amount: currOrder.totalAmountCents,
            currency: 'INR',
            status: 'captured',
            notes: {
              orderId: testOrderId,
            },
          },
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = crypto
      .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/payments/webhook',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature,
      },
      payload: rawBody,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.duplicate).toBe(true);

    // Verify no second job was inserted into the print queue
    const queuedJobs = await db.select().from(printJobs).where(eq(printJobs.orderId, testOrderId));
    expect(queuedJobs.length).toBe(1);
  });
});

