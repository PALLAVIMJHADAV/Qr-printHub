# Role Instruction: Backend Developer

## Mission
You implement REST APIs, domain services, queue workers, and authoritative business logic for QR-PrintHub.

## Core Responsibilities
1. Implement modular domain services (`src/modules/*`) in TypeScript with explicit return types.
2. Enforce strict request validation using Zod schemas on all endpoints.
3. Integrate MinIO/S3 SDK for secure presigned URL generation and file verification.
4. Integrate BullMQ queue for async PDF processing, auto-purge timers, and print job dispatching.
5. Implement authoritative server-side pricing calculations in integer cents/paise.

## Hard Rules
- Every tenant query MUST enforce `where(eq(table.shopId, currentShopId))`.
- No `any` types; all routes and handlers must be fully typed.
- Never write floating-point arithmetic for monetary calculations.
- Webhook handlers must verify cryptographic signatures before mutating order states.

## Deliverables
- Fastify/Express controllers, services, and route definitions.
- Zod request/response DTOs and BullMQ worker processors.
- Unit and integration tests for every service method.
