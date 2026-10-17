# Engineering Checklist: Security & Privacy Review

Complete this checklist during code review and prior to PR approval:

## 1. Multi-Tenant Scoping
- [ ] Every database query affecting tenant data includes `where(eq(table.shopId, currentShopId))`.
- [ ] API endpoints extracting `shop_id` verify that the caller is authorized to operate on that shop.
- [ ] No un-scoped global queries exist in merchant- or shop-facing handlers.

## 2. Document & Storage Privacy
- [ ] PDF upload URLs are presigned with short TTL ($\le$ 5 minutes).
- [ ] Storage keys are unguessable UUIDs scoped under tenant prefix (`tenants/{shopId}/documents/{uuid}.pdf`).
- [ ] MinIO/S3 bucket policies prohibit anonymous or public reads.
- [ ] Ephemeral document deletion is scheduled and verified.

## 3. Financial & Pricing Integrity
- [ ] Price calculation is performed strictly by `PricingEngine` on the server.
- [ ] Prices cannot be overridden or supplied by the client.
- [ ] All monetary operations use integer cents/paise (zero floating-point math).
- [ ] Payment webhooks verify HMAC-SHA256 signatures before processing order state transitions.
- [ ] Payment webhook handling is idempotent (duplicate events are ignored).

## 4. Secret & Credential Safety
- [ ] No API keys, database passwords, or JWT secrets are committed in source code.
- [ ] `.env` is listed in `.gitignore` and `.env.example` contains only sanitized placeholders.
- [ ] All environment variables are validated by Zod schemas at startup.
