import { pgTable, uuid, varchar, text, boolean, integer, timestamp, jsonb, index, uniqueIndex, } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
// ==============================================================================
// 1. MERCHANTS (Top-level Organization / Tenant)
// ==============================================================================
export const merchants = pgTable('merchants', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('ACTIVE'), // ACTIVE, SUSPENDED, TRIAL
    subscriptionTier: varchar('subscription_tier', { length: 50 }).notNull().default('PRO'), // STARTER, PRO, ENTERPRISE
    payoutAccount: jsonb('payout_account').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex('merchant_slug_idx').on(table.slug),
]);
// ==============================================================================
// 2. SHOPS (Physical Store Locations / Kiosks with dedicated QR Codes)
// ==============================================================================
export const shops = pgTable('shops', {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id')
        .notNull()
        .references(() => merchants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    qrCodeToken: varchar('qr_code_token', { length: 255 }).notNull().unique(),
    address: text('address'),
    city: varchar('city', { length: 100 }),
    isOpen: boolean('is_open').notNull().default(true),
    operatingHours: jsonb('operating_hours').default({ open: '08:00', close: '22:00' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('shop_merchant_id_idx').on(table.merchantId),
    uniqueIndex('shop_qr_code_idx').on(table.qrCodeToken),
]);
// ==============================================================================
// 3. USERS (Platform Admins, Merchant Owners, Shop Operators / Staff)
// ==============================================================================
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull().default('SHOP_STAFF'), // PLATFORM_ADMIN, MERCHANT_ADMIN, SHOP_STAFF
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('user_merchant_idx').on(table.merchantId),
    index('user_shop_idx').on(table.shopId),
    uniqueIndex('user_email_idx').on(table.email),
]);
// ==============================================================================
// 4. RATE CARDS (Shop-specific Print Pricing Rules)
// ==============================================================================
export const rateCards = pgTable('rate_cards', {
    id: uuid('id').defaultRandom().primaryKey(),
    shopId: uuid('shop_id')
        .notNull()
        .references(() => shops.id, { onDelete: 'cascade' }),
    paperSize: varchar('paper_size', { length: 50 }).notNull().default('A4'), // A4, A3, LEGAL, PHOTO
    colorMode: varchar('color_mode', { length: 50 }).notNull().default('BW'), // BW, COLOR
    duplexMode: varchar('duplex_mode', { length: 50 }).notNull().default('SIMPLEX'), // SIMPLEX, DUPLEX
    pricePerPageCents: integer('price_per_page_cents').notNull().default(100), // In integer cents/paise
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('rate_cards_shop_idx').on(table.shopId),
]);
// ==============================================================================
// 5. DOCUMENTS (Uploaded Customer PDFs - Ephemeral Retention)
// ==============================================================================
export const documents = pgTable('documents', {
    id: uuid('id').defaultRandom().primaryKey(),
    shopId: uuid('shop_id')
        .notNull()
        .references(() => shops.id, { onDelete: 'cascade' }),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    storageKey: varchar('storage_key', { length: 512 }).notNull().unique(),
    mimeType: varchar('mime_type', { length: 100 }).notNull().default('application/pdf'),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    pageCount: integer('page_count').notNull().default(1),
    status: varchar('status', { length: 50 }).notNull().default('UPLOADED'), // UPLOADED, VERIFIED, PURGED
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('document_shop_idx').on(table.shopId),
    index('document_status_idx').on(table.status),
    index('document_expires_idx').on(table.expiresAt),
]);
// ==============================================================================
// 6. ORDERS (Customer Print Orders & State Machine)
// ==============================================================================
export const orders = pgTable('orders', {
    id: uuid('id').defaultRandom().primaryKey(),
    shopId: uuid('shop_id')
        .notNull()
        .references(() => shops.id, { onDelete: 'cascade' }),
    orderCode: varchar('order_code', { length: 50 }).notNull().unique(), // e.g., "QP-4821"
    customerPhone: varchar('customer_phone', { length: 50 }),
    customerEmail: varchar('customer_email', { length: 255 }),
    subtotalAmountCents: integer('subtotal_amount_cents').notNull(),
    discountAmountCents: integer('discount_amount_cents').notNull().default(0),
    totalAmountCents: integer('total_amount_cents').notNull(),
    currency: varchar('currency', { length: 10 }).notNull().default('INR'),
    status: varchar('status', { length: 50 }).notNull().default('PENDING_PAYMENT'), // DRAFT, QUOTED, PENDING_PAYMENT, PAID, QUEUED, PRINTING, COMPLETED, CANCELLED, REFUNDED
    paymentGatewayProvider: varchar('payment_gateway_provider', { length: 50 }).default('mock'),
    paymentGatewayOrderId: varchar('payment_gateway_order_id', { length: 255 }),
    paymentGatewayPaymentId: varchar('payment_gateway_payment_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('order_shop_status_idx').on(table.shopId, table.status),
    index('order_created_at_idx').on(table.createdAt),
    uniqueIndex('order_code_idx').on(table.orderCode),
]);
// ==============================================================================
// 7. ORDER ITEMS (Specific document & print parameters per order)
// ==============================================================================
export const orderItems = pgTable('order_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
        .notNull()
        .references(() => orders.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
        .notNull()
        .references(() => documents.id, { onDelete: 'cascade' }),
    paperSize: varchar('paper_size', { length: 50 }).notNull().default('A4'),
    colorMode: varchar('color_mode', { length: 50 }).notNull().default('BW'),
    duplexMode: varchar('duplex_mode', { length: 50 }).notNull().default('SIMPLEX'),
    pageRange: varchar('page_range', { length: 100 }).default('all'),
    pagesPerCopy: integer('pages_per_copy').notNull(),
    copies: integer('copies').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    totalPriceCents: integer('total_price_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('order_item_order_idx').on(table.orderId),
    index('order_item_doc_idx').on(table.documentId),
]);
// ==============================================================================
// 8. PRINT JOBS (Durable Queue Execution & Physical Station Dispatch)
// ==============================================================================
export const printJobs = pgTable('print_jobs', {
    id: uuid('id').defaultRandom().primaryKey(),
    shopId: uuid('shop_id')
        .notNull()
        .references(() => shops.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
        .notNull()
        .references(() => orders.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 50 }).notNull().default('QUEUED'), // QUEUED, ASSIGNED, PRINTING, COMPLETED, FAILED
    assignedStaffId: uuid('assigned_staff_id').references(() => users.id),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('print_job_shop_status_idx').on(table.shopId, table.status),
]);
// ==============================================================================
// 9. AUDIT LOGS (Immutable Security & Financial Audit Trail)
// ==============================================================================
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'cascade' }),
    actorType: varchar('actor_type', { length: 50 }).notNull(), // CUSTOMER, STAFF, SYSTEM, ADMIN
    actorId: varchar('actor_id', { length: 255 }),
    action: varchar('action', { length: 100 }).notNull(), // DOCUMENT_UPLOAD, PRICE_QUOTE, PAYMENT_RECEIVED, JOB_DISPATCHED, JOB_COMPLETED, DOCUMENT_PURGED
    metadata: jsonb('metadata').default({}),
    ipAddress: varchar('ip_address', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('audit_shop_idx').on(table.shopId),
    index('audit_action_idx').on(table.action),
    index('audit_created_at_idx').on(table.createdAt),
]);
// ==============================================================================
// DRIZZLE RELATIONS (For type-safe joins and nested queries)
// ==============================================================================
export const merchantsRelations = relations(merchants, ({ many }) => ({
    shops: many(shops),
    users: many(users),
}));
export const shopsRelations = relations(shops, ({ one, many }) => ({
    merchant: one(merchants, {
        fields: [shops.merchantId],
        references: [merchants.id],
    }),
    rateCards: many(rateCards),
    users: many(users),
    orders: many(orders),
    documents: many(documents),
    printJobs: many(printJobs),
}));
export const ordersRelations = relations(orders, ({ one, many }) => ({
    shop: one(shops, {
        fields: [orders.shopId],
        references: [shops.id],
    }),
    items: many(orderItems),
    printJobs: many(printJobs),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
    order: one(orders, {
        fields: [orderItems.orderId],
        references: [orders.id],
    }),
    document: one(documents, {
        fields: [orderItems.documentId],
        references: [documents.id],
    }),
}));
