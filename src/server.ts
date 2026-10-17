import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import { config } from './core/config/index.js';
import { AuthService } from './modules/auth/auth.service.js';
import { ShopService } from './modules/shops/shop.service.js';
import { DocumentService } from './modules/documents/document.service.js';
import { PricingService } from './modules/pricing/pricing.service.js';
import { OrderService } from './modules/orders/order.service.js';
import { PrintStationService } from './modules/print-stations/print-station.service.js';
import { PlatformService } from './modules/platform/platform.service.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // 1. Plugins: CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // 2. Plugins: JWT Authentication
  await app.register(jwt, {
    secret: config.JWT_ACCESS_SECRET,
  });

  // 3. Plugins: Swagger API Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'QR-PrintHub API',
        description: 'Enterprise Multi-tenant QR-based Printing SaaS Platform API',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'qr-printhub-api',
      timestamp: new Date().toISOString(),
    };
  });

  // ============================================================================
  // AUTH ROUTES
  // ============================================================================
  app.post('/api/v1/auth/login', async (request, reply) => {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.format() });
    }

    try {
      const user = await AuthService.login(parsed.data.email, parsed.data.password);
      const token = app.jwt.sign(
        { id: user.id, role: user.role, merchantId: user.merchantId, shopId: user.shopId },
        { expiresIn: config.JWT_ACCESS_TTL }
      );

      return reply.send({
        success: true,
        data: { token, user },
      });
    } catch (err: any) {
      return reply.status(401).send({ success: false, error: { message: err.message } });
    }
  });

  // ============================================================================
  // PUBLIC SHOP & QR RESOLUTION
  // ============================================================================
  app.get('/api/v1/public/shops/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const shop = await ShopService.getShopByCodeOrSlug(code);

    if (!shop) {
      return reply.status(404).send({ success: false, error: { message: 'Shop not found for this QR code' } });
    }

    return reply.send({ success: true, data: shop });
  });

  // ============================================================================
  // PUBLIC DOCUMENT UPLOAD INTENT (DIRECT-TO-S3)
  // ============================================================================
  app.post('/api/v1/public/documents/upload-intent', async (request, reply) => {
    const schema = z.object({
      shopId: z.string().uuid(),
      filename: z.string().min(1),
      fileSizeBytes: z.number().max(config.MAX_FILE_SIZE_MB * 1024 * 1024),
      mimeType: z.string().default('application/pdf'),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.format() });
    }

    try {
      const intent = await DocumentService.createUploadIntent(parsed.data);
      return reply.status(201).send({ success: true, data: intent });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: { message: err.message } });
    }
  });

  app.post('/api/v1/public/documents/verify', async (request, reply) => {
    const schema = z.object({
      documentId: z.string().uuid(),
      pageCount: z.number().int().min(1).default(1),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.format() });
    }

    const doc = await DocumentService.verifyDocument(parsed.data.documentId, parsed.data.pageCount);
    return reply.send({ success: true, data: doc });
  });

  // ============================================================================
  // AUTHORITATIVE PRICING ENGINE
  // ============================================================================
  app.post('/api/v1/public/pricing/quote', async (request, reply) => {
    const schema = z.object({
      shopId: z.string().uuid(),
      pages: z.number().int().min(1),
      copies: z.number().int().min(1).default(1),
      colorMode: z.enum(['BW', 'COLOR']).default('BW'),
      duplexMode: z.enum(['SIMPLEX', 'DUPLEX']).default('SIMPLEX'),
      paperSize: z.enum(['A4', 'A3', 'LEGAL', 'PHOTO']).default('A4'),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.format() });
    }

    const quote = await PricingService.calculateQuote(parsed.data);
    return reply.send({ success: true, data: quote });
  });

  // ============================================================================
  // ORDERS & CHECKOUT
  // ============================================================================
  app.post('/api/v1/public/orders/checkout', async (request, reply) => {
    const schema = z.object({
      shopId: z.string().uuid(),
      documentId: z.string().uuid(),
      paperSize: z.enum(['A4', 'A3', 'LEGAL', 'PHOTO']).default('A4'),
      colorMode: z.enum(['BW', 'COLOR']).default('BW'),
      duplexMode: z.enum(['SIMPLEX', 'DUPLEX']).default('SIMPLEX'),
      copies: z.number().int().min(1).default(1),
      customerPhone: z.string().optional(),
      customerEmail: z.string().email().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.format() });
    }

    try {
      const order = await OrderService.createCheckout(parsed.data);
      return reply.status(201).send({ success: true, data: order });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { message: err.message } });
    }
  });

  // Mock / Instant Payment Confirmation
  app.post('/api/v1/public/orders/:orderId/pay', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    try {
      const result = await OrderService.confirmPayment(orderId);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { message: err.message } });
    }
  });

  // Customer Order Status Tracker
  app.get('/api/v1/public/orders/:orderCode', async (request, reply) => {
    const { orderCode } = request.params as { orderCode: string };
    const orderData = await OrderService.getOrderStatus(orderCode);

    if (!orderData) {
      return reply.status(404).send({ success: false, error: { message: 'Order not found' } });
    }

    return reply.send({ success: true, data: orderData });
  });

  // ============================================================================
  // STAFF PRINT STATIONS
  // ============================================================================
  app.get('/api/v1/print-stations/queue', async (request, reply) => {
    const { shopId } = request.query as { shopId?: string };
    if (!shopId) {
      return reply.status(400).send({ success: false, error: { message: 'shopId query parameter is required' } });
    }

    const queue = await PrintStationService.getQueue(shopId);
    return reply.send({ success: true, data: queue });
  });

  app.get('/api/v1/print-stations/jobs/:jobId/download-ticket', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const { shopId } = request.query as { shopId?: string };

    if (!shopId) {
      return reply.status(400).send({ success: false, error: { message: 'shopId query parameter is required' } });
    }

    try {
      const ticket = await PrintStationService.getDownloadTicket(jobId, shopId);
      return reply.send({ success: true, data: ticket });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { message: err.message } });
    }
  });

  app.post('/api/v1/print-stations/jobs/:jobId/complete', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const { shopId } = request.query as { shopId?: string };

    if (!shopId) {
      return reply.status(400).send({ success: false, error: { message: 'shopId query parameter is required' } });
    }

    try {
      const result = await PrintStationService.completeJob(jobId, shopId);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { message: err.message } });
    }
  });

  // Periodic Purge Trigger
  app.post('/api/v1/admin/purge-expired', async () => {
    const count = await DocumentService.purgeExpiredDocuments();
    return { success: true, purgedCount: count };
  });

  // ============================================================================
  // PLATFORM SUPER ADMIN (SaaS Creator - Managing Merchants & Subscriptions)
  // ============================================================================
  app.get('/api/v1/platform/analytics', async () => {
    const analytics = await PlatformService.getPlatformAnalytics();
    return { success: true, data: analytics };
  });

  app.get('/api/v1/platform/merchants', async () => {
    const merchantsList = await PlatformService.listMerchants();
    return { success: true, data: merchantsList };
  });

  app.post('/api/v1/platform/merchants', async (request, reply) => {
    const schema = z.object({
      businessName: z.string().min(2),
      ownerEmail: z.string().email(),
      ownerName: z.string().min(2),
      subscriptionTier: z.enum(['STARTER', 'PRO', 'ENTERPRISE']).default('PRO'),
      initialShopName: z.string().min(2),
      city: z.string().default('Mumbai'),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.format() });
    }

    try {
      const result = await PlatformService.createMerchant(parsed.data);
      return reply.status(201).send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { message: err.message } });
    }
  });

  return app;
}

// Boot server if directly invoked
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  buildServer().then((app) => {
    app.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
      if (err) {
        console.error('Fatal boot error:', err);
        process.exit(1);
      }
      console.log(`🚀 QR-PrintHub Backend API running at ${address}`);
      console.log(`📖 API Documentation available at ${address}/docs`);
    });
  });
}
