# QR-PrintHub Project Progress & Roadmap Tracker

## 1. Roadmap Milestones

| Phase | Milestone | Focus Area | Status |
| :---: | :--- | :--- | :---: |
| **Phase 1** | **Engineering Harness Setup** | Rules, roles, quality gates, docs, git controls, docker services | **In Progress** |
| **Phase 2** | **Core Database & Schema** | Drizzle ORM, multi-tenant tables, migrations, seeds, test DB | Planned |
| **Phase 3** | **Auth & Merchant Management** | JWT/RBAC, shop profiles, QR generation, rate card catalog | Planned |
| **Phase 4** | **Document Storage & Pricing** | Presigned S3 uploads, PDF page inspector, authoritative pricing | Planned |
| **Phase 5** | **Orders & Payment Verification** | Order state machine, checkout, idempotent webhooks | Planned |
| **Phase 6** | **Print Queue & Print Station** | BullMQ queue, staff print station dashboard, printer agent | Planned |
| **Phase 7** | **Retention Purge & Audit** | Ephemeral document worker, cryptographic purge, audit trail | Planned |
| **Phase 8** | **Production Hardening** | E2E Playwright tests, security penetration check, observability | Planned |

---

## 2. Phase 1 Task Tracker: Engineering Harness Setup

- [x] Repository inspection & toolchain verification (Node.js 22, npm 10, Docker 29, Git).
- [x] Switch to feature branch `feat/harness-setup`.
- [x] Establish `.gitignore` protecting secrets, binaries, build outputs, and local S3 data.
- [x] Establish `.env.example` with sanitized variables and Zod configuration blueprint.
- [x] Establish `AGENTS.md` master engineering constitution.
- [x] Define `docker-compose.yml` for local backing services (PostgreSQL 16, Redis 7, MinIO S3).
- [x] Author comprehensive documentation suite (`architecture.md`, `development-setup.md`, `technical-decisions.md`, `api-contracts.md`).
- [ ] Author pull request template `.github/pull_request_template.md`.
- [ ] Author continuous integration pipeline `.github/workflows/ci.yml`.
- [ ] Author automated security scanner `.github/workflows/security-scan.yml`.
- [ ] Author specialized agent roles (`.agents/roles/*.md`).
- [ ] Author engineering checklists (`.agents/checklists/*.md`).
- [ ] Validate harness with Docker config and Git staging review.
- [ ] Create initial commit on `feat/harness-setup`.

---

## 3. Definition of Done (DoD) Verification Checklist

Before marking any task complete and merging into `main`:

```markdown
- [ ] 1. Acceptance criteria verified against specification.
- [ ] 2. Smallest coherent diff applied (< 250 LOC preferred).
- [ ] 3. TypeScript compilation succeeds (`tsc --noEmit`) with zero errors.
- [ ] 4. ESLint and Prettier checks pass with zero warnings.
- [ ] 5. Unit and integration tests pass with 100% exit code 0.
- [ ] 6. Multi-tenant isolation verified (all queries scoped with shop_id).
- [ ] 7. No secrets or credentials exposed in code or git history.
- [ ] 8. Documentation, API contracts, and ADRs updated.
- [ ] 9. Conventional Commit message used.
- [ ] 10. Pull request reviewed and approved by human engineer.
```
