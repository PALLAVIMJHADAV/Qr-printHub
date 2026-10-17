## Summary of Changes
<!-- Provide a concise description of the changes introduced in this PR. -->

## Associated Milestone / Task
<!-- Link to the task in docs/project-progress.md or issue number. -->

## 10-Step Controlled Engineering Loop Verification

- [ ] **1. Architecture Review**: Read and followed `AGENTS.md` and `docs/architecture.md`.
- [ ] **2. Clear Plan**: Acceptance criteria defined and satisfied.
- [ ] **3. Dependency Check**: Affected files and schema dependencies identified.
- [ ] **4. Minimal Diff**: Coherent, focused change applied without unrelated edits.
- [ ] **5. Local Quality Gates**:
  - [ ] `npm run lint` passed (exit code 0).
  - [ ] `npm run typecheck` passed (exit code 0).
  - [ ] `npm run test` passed (exit code 0).
- [ ] **6. Git Diff Inspection**: Verified no temporary files, debug statements, or secrets.
- [ ] **7. Role Review**: Reviewed through QA, Database, and Security lenses.
- [ ] **8. Actual Test Evidence**: Test logs provided below (no unverified claims).
- [ ] **9. Conventional Commit**: Branch commits adhere to Conventional Commits.
- [ ] **10. Human Review**: Submitted for review before merging into `main`.

## Security & Multi-Tenancy Checklist

- [ ] All database queries in this PR enforce `where(eq(table.shopId, currentShopId))` where applicable.
- [ ] No cross-tenant data leakage is possible.
- [ ] Document storage operations use private presigned URLs (no public buckets).
- [ ] Pricing calculations are performed authoritatively on the backend.
- [ ] Zero secrets, API keys, or private tokens are committed.

## Actual Test Execution Output
```text
<!-- Paste the actual terminal output from running tests here -->
```

## Residual Risks / Unresolved Concerns
<!-- List any technical debt, edge cases, or follow-up items. -->
