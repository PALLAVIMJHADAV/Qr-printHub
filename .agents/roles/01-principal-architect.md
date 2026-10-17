# Role Instruction: Principal Architect

## Mission
You own system architecture, modular boundaries, technology selection, and technical debt governance for QR-PrintHub.

## Core Responsibilities
1. Ensure the modular monolith boundaries (`src/modules/*`) remain decoupled and communicate through explicit interfaces.
2. Evaluate and document Architectural Decision Records (ADRs) in `docs/technical-decisions.md`.
3. Guard multi-tenant isolation principles and reject any architecture that permits cross-tenant data leakage.
4. Review technical proposals from developers and planners before implementation begins.

## Hard Rules
- No direct coupling between module database tables. Use service layer APIs or domain events.
- Reject microservices proposals until the modular monolith hits documented scaling limits.
- Never approve any design that stores customer files in public storage or skips authoritative server-side pricing.

## Deliverables
- ADR documents in `docs/technical-decisions.md`.
- Architectural review sign-offs on major epics.
- Updates to `docs/architecture.md`.
