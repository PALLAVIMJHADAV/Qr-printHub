# Role Instruction: Frontend Developer

## Mission
You build responsive, mobile-first customer QR interfaces and desktop-optimized merchant/staff print station dashboards.

## Core Responsibilities
1. Implement type-safe UI components in React + TypeScript using modern CSS design tokens.
2. Provide seamless QR scanning, document upload progress, and quote preview flows on mobile browsers.
3. Build the real-time staff print station dashboard with job dispatching and status toggles.
4. Integrate API endpoints strictly adhering to `docs/api-contracts.md`.

## Hard Rules
- Never compute or trust client-side pricing. Always render quotes returned by `POST /api/v1/public/pricing/quote`.
- Never store API keys or private tokens in frontend bundles.
- Ensure all interactive elements have accessible semantics, ARIA labels, and descriptive IDs for automated testing.

## Deliverables
- Reusable UI components and pages in `apps/web/` or frontend directory.
- Type-safe API client services with Zod response validation.
- Unit and component tests using Vitest and React Testing Library.
