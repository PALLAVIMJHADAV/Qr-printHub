# Architecture Decision Records (ADRs)

This document captures the foundational architectural decisions for QR-PrintHub.

---

## ADR-001: Modular Monolith vs Microservices

### Status: Accepted
### Context
QR-PrintHub is a new product requiring rapid development, clear domain boundaries, and strong transaction consistency across orders, payments, document storage, and print queues. Managing distributed transactions and independent deployments across microservices would introduce excessive operational overhead and latency.

### Decision
Implement QR-PrintHub as a **Modular Monolith** in TypeScript / Node.js.
- Domain modules reside in `src/modules/*` with strict public interfaces.
- Inter-module communication occurs via in-process typed service interfaces or domain events.
- Shared infrastructure (database, cache, storage client) is centralized in `src/core/*`.

### Consequences
- **Positive**: Single deployment unit, simplified debugging, transactional integrity across entities, zero network latency between modules.
- **Negative**: Requires strict discipline to prevent tight coupling between module internals.

---

## ADR-002: Multi-Tenancy Strategy (Logical Row-Level Isolation)

### Status: Accepted
### Context
The platform supports multiple merchant organizations and individual print shops. We evaluated:
1. Database-per-tenant (costly, hard to migrate at scale).
2. Schema-per-tenant (Postgres schema overhead, complex migrations).
3. Logical row-level tenant isolation in a shared schema with `shop_id` / `merchant_id` foreign keys.

### Decision
Adopt **Logical Row-Level Multi-Tenancy** in a shared PostgreSQL database.
- Every tenant-scoped entity must declare `shop_id` (and `merchant_id` where appropriate).
- High-priority indexes (`shop_id, status`, `shop_id, created_at`) are created on all tenant tables.
- All service methods and repository queries must enforce tenant filters via middleware `TenantGuard`.
- Dedicated integration tests continuously verify cross-tenant data isolation.

### Consequences
- **Positive**: Lightweight scaling, unified migrations, consolidated reporting.
- **Negative**: Risk of developer error bypassing tenant filters. Mitigated by automated tenant-leak test suites and PR security reviews.

---

## ADR-003: Ephemeral Private Storage & Automated Document Purge

### Status: Accepted
### Context
Customer documents (PDFs) contain sensitive personal, academic, or business information. Storing files permanently exposes customer data to compliance violations (GDPR/DPDP) and incurs unnecessary storage costs.

### Decision
All customer documents are **ephemeral** and stored strictly in private S3/MinIO buckets.
- Uploads and downloads use short-lived presigned URLs (TTL $\le$ 5 minutes).
- Once a print job is `COMPLETED` or after a 2-hour TTL expiration, a BullMQ background worker permanently deletes the S3 object (`DeleteObjectCommand`).
- An immutable audit entry records the deletion event without storing the file contents.

### Consequences
- **Positive**: Minimal liability, compliance by design, optimized storage utilization.
- **Negative**: Customers cannot re-print expired jobs without re-uploading. This is by design.

---

## ADR-004: Authoritative Server-Side Pricing Engine

### Status: Accepted
### Context
Clients (browsers/mobile apps) allow users to select page ranges, color options, paper formats, and finishing. If the client calculates or submits the final price, malicious users could tamper with HTTP requests to underpay.

### Decision
All pricing calculations are **authoritative and server-side**.
- The client submits document references and requested options.
- The server validates actual PDF page counts via `pdf-lib` and matches them against the shop's active rate card.
- Prices are calculated in integer cents/paise and sealed in an order quote with a cryptographically signed HMAC or database quote ID.
- Payment gateways are initialized using server-verified amounts only.

### Consequences
- **Positive**: Zero pricing tampering, consistent calculation logic.
- **Negative**: Requires server-side page inspection before generating payment sessions.

---

## ADR-005: Drizzle ORM & PostgreSQL 16 for Schema Management

### Status: Accepted
### Context
We required an ORM that provides:
1. Compile-time type safety with zero runtime overhead.
2. Explicit, reviewable SQL migrations.
3. Clean support for PostgreSQL features (JSONB, UUIDs, compound indexes).

### Decision
Standardize on **PostgreSQL 16** and **Drizzle ORM** with `drizzle-kit`.
- Schemas are written in TypeScript (`src/modules/*/schema.ts`).
- Migrations are generated into `drizzle/` and checked into version control.
- Raw queries without type checking are prohibited.

### Consequences
- **Positive**: Blazing fast runtime performance, transparent SQL generation, type-safe queries.
- **Negative**: Migration generation must be executed explicitly via `npm run db:generate`.
