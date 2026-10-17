import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { queryClient } from '../../src/core/database/index.js';

describe('QR-PrintHub End-to-End API Suite', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await queryClient.end();
  });

  it('GET /health returns 200 OK', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('qr-printhub-api');
  });

  it('GET /api/v1/public/shops/QR_CAMPUS_NORTH_LIB_01 resolves shop profile & rate catalog', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/public/shops/QR_CAMPUS_NORTH_LIB_01',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('North Campus Central Library');
    expect(body.data.rates.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/public/pricing/quote calculates authoritative quote', async () => {
    const shopResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/public/shops/QR_CAMPUS_NORTH_LIB_01',
    });
    const shop = JSON.parse(shopResponse.body).data;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/public/pricing/quote',
      payload: {
        shopId: shop.id,
        pages: 8,
        copies: 2,
        colorMode: 'BW',
        duplexMode: 'SIMPLEX',
        paperSize: 'A4',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.pages).toBe(8);
    expect(body.data.copies).toBe(2);
    expect(body.data.totalAmountCents).toBeGreaterThan(0);
  });

  it('POST /api/v1/public/documents/upload-intent returns presigned S3 PUT URL', async () => {
    const shopResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/public/shops/QR_CAMPUS_NORTH_LIB_01',
    });
    const shop = JSON.parse(shopResponse.body).data;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/public/documents/upload-intent',
      payload: {
        shopId: shop.id,
        filename: 'thesis_final.pdf',
        fileSizeBytes: 2048576,
        mimeType: 'application/pdf',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.uploadUrl).toContain('http');
    expect(body.data.storageKey).toContain(shop.id);
  });
});
