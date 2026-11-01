import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.ts';
import { queryClient } from '../../src/core/database/index.js';

describe('RBAC & Multi-Tenant Security Suite', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let staffToken: string;
  let staffShopId: string;
  let merchantToken: string;
  let merchantId: string;

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

    // 3. Obtain Merchant Admin token
    const merchantLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'rajesh@campusprints.com',
        password: 'Password123!',
      },
    });
    expect(merchantLoginRes.statusCode).toBe(200);
    const merchantData = JSON.parse(merchantLoginRes.body);
    merchantToken = merchantData.data.token;
    merchantId = merchantData.data.user.merchantId;
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

  // ============================================================================
  // 4. HIERARCHICAL RBAC DELEGATION (MERCHANT CREATES & ASSIGNS STAFF RBAC)
  // ============================================================================
  let newShopId: string;
  let newStaffId: string;
  const newStaffEmail = `staff_${Date.now()}@campusprints.com`;
  const newStaffPassword = 'Password123!';

  it('Merchant Admin creates a new physical shop location', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/shops',
      headers: {
        authorization: `Bearer ${merchantToken}`,
      },
      payload: {
        name: 'South Campus Media Center',
        city: 'Mumbai',
        address: 'Ground Floor, Media Block',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('South Campus Media Center');
    newShopId = body.data.id;
  });

  it('Merchant Admin provisions a SHOP_STAFF user bound to the new shop', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/staff',
      headers: {
        authorization: `Bearer ${merchantToken}`,
      },
      payload: {
        shopId: newShopId,
        name: 'Vikas Sharma',
        email: newStaffEmail,
        password: newStaffPassword,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('SHOP_STAFF');
    expect(body.data.shopId).toBe(newShopId);
    newStaffId = body.data.id;
  });

  it('SHOP_STAFF cannot create RBAC or staff accounts (403 Forbidden)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/staff',
      headers: {
        authorization: `Bearer ${staffToken}`,
      },
      payload: {
        shopId: newShopId,
        name: 'Rogue Staff',
        email: 'rogue@campusprints.com',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('Merchant Admin cannot assign staff to a foreign shop belonging to another merchant', async () => {
    const foreignShopId = '00000000-0000-0000-0000-000000000099';
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/staff',
      headers: {
        authorization: `Bearer ${merchantToken}`,
      },
      payload: {
        shopId: foreignShopId,
        name: 'Cross Tenant Staff',
        email: `cross_${Date.now()}@example.com`,
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
  });

  it('Newly provisioned staff can log in and access their assigned shop queue', async () => {
    // Log in as the new staff member
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: newStaffEmail,
        password: newStaffPassword,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginData = JSON.parse(loginRes.body);
    const newStaffToken = loginData.data.token;
    expect(loginData.data.user.role).toBe('SHOP_STAFF');
    expect(loginData.data.user.shopId).toBe(newShopId);

    // Access their assigned shop queue -> 200 OK
    const queueRes = await app.inject({
      method: 'GET',
      url: `/api/v1/print-stations/queue?shopId=${newShopId}`,
      headers: {
        authorization: `Bearer ${newStaffToken}`,
      },
    });
    expect(queueRes.statusCode).toBe(200);

    // Attempting to access another shop's queue -> 403 CROSS_TENANT_ACCESS_DENIED
    const unauthorizedQueueRes = await app.inject({
      method: 'GET',
      url: `/api/v1/print-stations/queue?shopId=${staffShopId}`,
      headers: {
        authorization: `Bearer ${newStaffToken}`,
      },
    });
    expect(unauthorizedQueueRes.statusCode).toBe(403);
    const unauthorizedBody = JSON.parse(unauthorizedQueueRes.body);
    expect(unauthorizedBody.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
  });

  it('Merchant Admin can list and delete staff in their organization', async () => {
    // List staff
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/staff',
      headers: {
        authorization: `Bearer ${merchantToken}`,
      },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.data.some((s: any) => s.id === newStaffId)).toBe(true);

    // Delete staff
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/merchant/staff/${newStaffId}`,
      headers: {
        authorization: `Bearer ${merchantToken}`,
      },
    });
    expect(deleteRes.statusCode).toBe(200);
    const deleteBody = JSON.parse(deleteRes.body);
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.data.deletedStaffId).toBe(newStaffId);
  });
});
