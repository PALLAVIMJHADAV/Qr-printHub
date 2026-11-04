import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildServer } from '../../src/server.ts';
import { db, orders, printJobs, queryClient } from '../../src/core/database/index.js';
import { config } from '../../src/core/config/index.js';

describe('WhatsApp Printing & Webhook Ingestion Suite', () => {
  let app: FastifyInstance;
  let shopId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    const shopRes = await app.inject({
      method: 'GET',
      url: '/api/v1/public/shops/QR_CAMPUS_NORTH_LIB_01',
    });
    expect(shopRes.statusCode).toBe(200);
    const shopBody = JSON.parse(shopRes.body);
    shopId = shopBody.data.id;
  });

  afterAll(async () => {
    await app.close();
    await queryClient.end();
  });

  it('GET /api/v1/public/whatsapp/webhook verifies Meta Cloud API challenge token', async () => {
    // Valid verify token
    const validRes = await app.inject({
      method: 'GET',
      url: `/api/v1/public/whatsapp/webhook?hub.mode=subscribe&hub.challenge=test_challenge_12345&hub.verify_token=${config.WHATSAPP_VERIFY_TOKEN}`,
    });
    expect(validRes.statusCode).toBe(200);
    expect(validRes.body).toBe('test_challenge_12345');

    // Invalid verify token -> 403
    const invalidRes = await app.inject({
      method: 'GET',
      url: `/api/v1/public/whatsapp/webhook?hub.mode=subscribe&hub.challenge=test_challenge_12345&hub.verify_token=wrong_token`,
    });
    expect(invalidRes.statusCode).toBe(403);
  });

  it('POST /api/v1/public/whatsapp/webhook processes incoming customer document with color & copy caption', async () => {
    const customerPhone = '+919876543210';
    const payload = {
      shopId,
      senderPhone: customerPhone,
      filename: 'Machine_Learning_Notes.pdf',
      caption: 'Please print 2 copies color double sided',
      pageCount: 6,
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/whatsapp/webhook',
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.customerPhone).toBe(customerPhone);
    expect(body.data.orderCode).toMatch(/^QP-/);
    expect(body.data.colorMode).toBe('COLOR');
    expect(body.data.duplexMode).toBe('DUPLEX');
    expect(body.data.copies).toBe(2);
    expect(body.data.pages).toBe(6);
    expect(body.data.totalAmountCents).toBeGreaterThan(0);
    expect(body.data.replyMessage).toContain(body.data.orderCode);
    expect(body.data.replyMessage).toContain('Color');

    // Verify print job was automatically enqueued in the shop print queue
    const queuedJobs = await db
      .select()
      .from(printJobs)
      .where(eq(printJobs.orderId, body.data.orderId));
    expect(queuedJobs.length).toBe(1);
    expect(queuedJobs[0].status).toBe('QUEUED');
    expect(queuedJobs[0].shopId).toBe(shopId);

    // Verify order customerPhone is recorded for shop staff identification
    const [savedOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, body.data.orderId));
    expect(savedOrder.customerPhone).toBe(customerPhone);
    expect(savedOrder.paymentGatewayProvider).toBe('whatsapp');
  });

  it('POST /api/v1/public/whatsapp/webhook handles standard Meta WhatsApp Cloud API format', async () => {
    const metaPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550234567',
                  phone_number_id: '10992384',
                },
                messages: [
                  {
                    from: '919812345678',
                    id: 'wamid.HBgLOTE5ODEyMzQ1Njc4FQIAEhgWM0VCMDEyMzQ1Njc4',
                    timestamp: '1678901234',
                    type: 'document',
                    document: {
                      filename: 'Lab_Report_Sem6.pdf',
                      mime_type: 'application/pdf',
                      caption: '1 copy bw',
                      id: 'media_id_9921',
                    },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/public/whatsapp/webhook?shopId=${shopId}`,
      payload: metaPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.customerPhone).toBe('919812345678');
    expect(body.data.filename).toBe('Lab_Report_Sem6.pdf');
    expect(body.data.colorMode).toBe('BW');
    expect(body.data.replyMessage).toContain('Lab_Report_Sem6.pdf');
  });

  it('POST /api/v1/public/whatsapp/quick-drop allows Shop Staff to ingest file directly from WhatsApp Web', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/whatsapp/quick-drop',
      payload: {
        shopId,
        filename: 'Direct_WhatsApp_Web_Customer.pdf',
        senderPhone: '+919988776655',
        caption: '3 copies bw',
        pageCount: 10,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.filename).toBe('Direct_WhatsApp_Web_Customer.pdf');
    expect(body.data.copies).toBe(3);
    expect(body.data.pages).toBe(10);
    expect(body.data.replyMessage).toContain(body.data.orderCode);
  });
});

