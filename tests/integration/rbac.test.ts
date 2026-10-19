import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.ts';
import { queryClient } from '../../src/core/database/index.js';

describe('RBAC & Multi-Tenant Security Suite', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let staffToken: string;
  let staffShopId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Obtain Platform Admin token
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@qrprinthub.com',
        password: 'Password123!',
      },
    });
    expect(adminLoginRes.statusCode).toBe(200);
    const adminData = JSON.parse(adminLoginRes.body);
    adminToken = adminData.data.token;

    // 2. Obtain Shop Staff token
    const staffLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'pooja@campusprints.com',
        password: 'Password123!',
      },
    });
    expect(staffLoginRes.statusCode).toBe(200);
    const staffData = JSON.parse(staffLoginRes.body);
    staffToken = staffData.data.token;
    staffShopId = staffData.data.user.shopId;
  });

  afterAll(async () => {
    await app.close();
    await queryClient.end();
  });

  // ============================================================================
  // 1. AUTHENTICATION (401 GATING)
  // ============================================================================
  it('GET /api/v1/auth/me returns 401 when no token is supplied', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/auth/me returns 200 with valid session token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('PLATFORM_ADMIN');
    expect(body.data.email).toBe('admin@qrprinthub.com');
  });

  // ============================================================================
  // 2. ROLE-BASED ACCESS CONTROL (403 GATING)
  // ============================================================================
  it('GET /api/v1/platform/analytics rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/analytics',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/platform/analytics rejects SHOP_STAFF with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/analytics',
      headers: {
        authorization: `Bearer ${staffToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('Current role: SHOP_STAFF');
  });

  it('GET /api/v1/platform/analytics allows PLATFORM_ADMIN with 200 OK', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/analytics',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalMerchants).toBeGreaterThanOrEqual(1);
  });

  // ============================================================================
  // 3. MULTI-TENANT ISOLATION TESTS (P0 COMPLIANCE)
  // ============================================================================
  it('GET /api/v1/print-stations/queue allows staff for their assigned shop', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/print-stations/queue?shopId=${staffShopId}`,
      headers: {
        authorization: `Bearer ${staffToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/v1/print-stations/queue blocks staff attempting cross-tenant access with 403', async () => {
    const unauthorizedForeignShopId = '00000000-0000-0000-0000-000000000099';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/print-stations/queue?shopId=${unauthorizedForeignShopId}`,
      headers: {
        authorization: `Bearer ${staffToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
  });

  it('GET /api/v1/print-stations/queue allows PLATFORM_ADMIN to view any shop queue', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/print-stations/queue?shopId=${staffShopId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });
});
