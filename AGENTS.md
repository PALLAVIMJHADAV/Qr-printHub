# AGENTS.md — QR-PrintHub Development Constitution

## 1. Project Purpose & Architecture

QR-PrintHub is an enterprise-grade, multi-tenant QR-based printing management platform.
Customers scan shop-specific QR codes, configure print parameters, securely upload documents, pay online, and have their jobs queued and printed at designated partner print shops or kiosks.

### Architecture Style: Modular Monolith
The platform begins as a modular monolith. All domains live in a single repository with clear boundaries, decoupling, and strict interface contracts:

```
src/
├── core/                  # Cross-cutting concerns (database, logger, config, errors, queue)
├── modules/
│   ├── auth/              # Multi-tenant authentication, RBAC, JWTs, API tokens
│   ├── merchants/         # Merchant organizations, shops, operating hours, printers
│   ├── catalog/           # Paper sizes, color modes, finishings, price rate cards
│   ├── documents/         # S3/MinIO presigned URLs, PDF page counting, validation, auto-purge
│   ├── pricing/           # Authoritative server-side pricing calculation engine
│   ├── orders/            # Order state machine, checkout, transaction records
│   ├── payments/          # Webhook handlers, HMAC verification, idempotency, refund flow
│   ├── queue/             # BullMQ print queue, prioritization, dispatching
│   ├── print-stations/    # Staff print station web UI & desktop polling/agent protocol
│   └── audit/             # Tamper-evident audit logging for access, financial, and doc lifecycle
```

---

## 2. Approved Technology Stack

- **Language**: TypeScript 5.x across frontend and backend for strict compile-time type safety.
- **Backend**: Node.js 22 LTS with Fastify or Express + TypeScript.
- **Frontend**: React + Vite (or Next.js) with strict TypeScript and modern CSS design tokens.
- **Database**: PostgreSQL 16+ with Drizzle ORM (strictly typed schema, lightweight, explicit migrations).
- **Caching & Queues**: Redis 7+ with BullMQ for job processing and file purge timers.
- **Object Storage**: S3-compatible private storage (MinIO locally, AWS S3 / Cloudflare R2 in production).
- **Validation**: Zod for all request/response DTOs, environment configs, and domain events.
- **Testing**: Vitest for unit/integration tests; Supertest for API integration; Playwright for E2E.
- **Containerization**: Docker Compose for backing services (PostgreSQL, Redis, MinIO).

---

## 3. Code Organization & Naming Conventions

- **File Names**: `kebab-case` (`pricing-calculator.ts`, `print-job.service.ts`, `tenant-guard.ts`).
- **Classes, Types, Interfaces**: `PascalCase` (`PrintJobService`, `CreateOrderDto`, `RateCard`).
- **Functions, Methods, Variables**: `camelCase` (`calculateOrderTotal`, `currentShopId`, `pageCount`).
- **Constants & Enums**: `UPPER_SNAKE_CASE` (`MAX_DOCUMENT_PAGES`, `ORDER_STATUS_PENDING`).
- **Database Tables & Columns**: `snake_case` (`orders`, `shop_id`, `created_at`, `total_amount_cents`).
- **Monetary Values**: All currency amounts must be stored and calculated as integer cents/paise (no floating-point money).
- **Explicit Types**: Every function must declare return types. `any` is strictly prohibited.

---

## 4. Multi-Tenant Isolation & Security Requirements

1. **Tenant Hierarchy**: `Platform Admins` -> `Merchants` -> `Shops` -> `Staff / Customers`.
2. **Mandatory Query Scoping**:
   - Every shop-level and customer-level query MUST enforce `where(eq(table.shopId, currentShopId))`.
   - Cross-tenant data leakage is a critical P0 violation.
3. **Storage Security**:
   - Storage buckets must NEVER be public.
   - Uploads and downloads use short-lived HMAC pre-signed URLs (maximum 5 minutes TTL).
   - Document keys must be cryptographically unguessable (`tenants/{shopId}/documents/{uuid4}.pdf`).
4. **Authoritative Pricing**:
   - Clients specify parameters (file, page selection, color/BW, copies, duplex/simplex).
   - The backend counts pages from the verified PDF and calculates prices authoritatively.
   - Never trust pricing data sent from the client.
5. **Document Retention Policy**:
   - Uploaded customer documents are ephemeral.
   - Files MUST be permanently deleted after successful print completion or after expiration (default 2 hours).
   - Cryptographic wipe / S3 deletion must be verified and logged in the audit trail.
6. **Payment Verification**:
   - Payment status is updated ONLY through verified gateway webhook signatures (HMAC SHA-256) or server-to-server gateway verification.
   - Every webhook event must be idempotent using unique gateway payment IDs.

---

## 5. Testing Requirements

- **Minimum Coverage**: 80% line and branch coverage on business-critical modules (`pricing`, `orders`, `payments`, `documents`).
- **Mandatory Test Suites**:
  1. *Unit Tests*: Pure functions, pricing algorithms, state machine transitions.
  2. *Integration Tests*: API routes against a real PostgreSQL test database (Docker).
  3. *Tenant Isolation Tests*: Explicit tests asserting that Shop A staff cannot access Shop B documents or orders.
  4. *Security Tests*: Tampered PDF files, invalid webhook signatures, expired presigned tokens.
- **Rule of Evidence**: Never claim that a test succeeded without providing actual execution logs and exit codes.

---

## 6. Database Migration Rules

- All schema modifications must be defined in Drizzle schema files and generated using `drizzle-kit generate`.
- Every migration must be tested against a clean database instance.
- Destructive operations (`DROP COLUMN`, `DROP TABLE`) are forbidden without an explicit multi-phase deprecation plan.
- Every relational table must include:
  - `id`: Primary key (`uuid` or `cuid2`).
  - `shop_id` or `merchant_id` (foreign key, indexed) for tenant isolation.
  - `created_at`: Timestamp with timezone (default `now()`).
  - `updated_at`: Timestamp with timezone.

---

## 7. Git Branching & Commit Conventions

- **Protected Main**: `main` is protected. Direct pushes to `main` are strictly forbidden.
- **Branch Naming**:
  - `feat/<module>-<short-description>` (e.g., `feat/pricing-rate-card-calculator`)
  - `fix/<module>-<short-description>` (e.g., `fix/documents-s3-upload-timeout`)
  - `chore/<description>` (e.g., `chore/ci-pipeline-cache`)
- **Conventional Commits**:
  - `feat(...)`: New user-facing feature.
  - `fix(...)`: Bug fix.
  - `docs(...)`: Documentation update.
  - `test(...)`: Adding or modifying tests.
  - `refactor(...)`: Code change without behavior change.
  - `security(...)`: Security vulnerability fix or authorization hardening.

---

## 8. Rules for Secrets & External Services

- **Zero Plaintext Secrets**: No passwords, tokens, API keys, or private keys committed to Git.
- **Configuration Contract**: All configuration must be defined in `.env.example` and parsed through a type-safe Zod schema at application boot.
- **Sandbox by Default**: External integrations (payment gateways, printer hardware, cloud storage) must have local mock or sandbox implementations for offline development.

---

## 9. Definition of Done (DoD) for Every Task

A task is considered **DONE** only when:
1. All acceptance criteria defined in the task plan are implemented.
2. The smallest coherent change was applied (< 250 lines of diff preferred).
3. Unit and integration tests cover the new logic and pass with exit code 0.
4. Linting (`npm run lint`) and TypeScript checks (`npm run typecheck`) pass without errors or warnings.
5. Multi-tenant isolation was verified (no unscoped queries).
6. Security checklist completed (no exposed secrets, safe uploads, validated inputs).
7. Documentation, API contracts, and ADRs updated where applicable.
8. Git commit created on a feature branch following Conventional Commits.
9. Pull Request submitted with test execution logs and verification evidence.

---

## 10. The 10-Step Controlled Engineering Loop

Every agent and human engineer must follow this loop for all work:

1. **Read & Understand**: Review relevant domain rules in `AGENTS.md` and `docs/architecture.md`.
2. **Plan**: Formulate a task plan with clear acceptance criteria and affected file lists.
3. **Identify Dependencies**: Check schema dependencies, migration needs, and downstream effects.
4. **Implement Smallest Change**: Apply focused, cohesive code changes.
5. **Validate Locally**: Run formatting, linting, type checks, and automated tests.
6. **Inspect Diff**: Review `git diff` for stray edits, debug statements, or secrets.
7. **Perform Independent Role Review**: Evaluate through QA, Database, and Security lenses.
8. **Verify Evidence**: Document actual test outputs, coverage, and any residual risks.
9. **Commit**: Create Conventional Commit on the feature branch.
10. **Submit for Approval**: Open Pull Request and wait for human review before merging.
