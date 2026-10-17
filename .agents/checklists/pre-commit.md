# Engineering Checklist: Pre-Commit Quality Gate

Complete this checklist locally before executing `git commit`:

- [ ] **Working Branch**: Confirmed you are on a feature branch (`feat/*`, `fix/*`, `chore/*`), NOT on `main`.
- [ ] **Smallest Coherent Change**: The diff contains only code necessary for this specific task (< 250 LOC preferred).
- [ ] **Formatting Check**: Code formatted cleanly (`npm run format:check` passes).
- [ ] **Lint Check**: Zero linter errors or warnings (`npm run lint` passes).
- [ ] **Typecheck**: Zero TypeScript compiler errors (`npm run typecheck` passes).
- [ ] **Unit Tests**: All unit tests pass locally with exit code 0 (`npm run test:unit`).
- [ ] **Integration Tests**: Integration tests pass against local Docker test DB (`npm run test:integration`).
- [ ] **Diff Review**: Inspected `git diff` to ensure:
  - No `console.log` or debug statements left behind.
  - No accidental modifications to unrelated files.
  - No plaintext secrets, tokens, or environment files staged.
- [ ] **Conventional Commit**: Commit message adheres to format:
  `<type>(<scope>): <concise description in imperative mood>`
