# Engineering Checklist: Tenant Isolation Verification

Multi-tenancy isolation is a core security invariant in QR-PrintHub. Cross-shop data leakage is a critical P0 bug.

## Verification Checklist

### 1. Data Model Verification
- [ ] Table definition includes `shop_id` (foreign key referencing `shops.id`, not null).
- [ ] Table has a compound index covering `(shop_id, status)` or `(shop_id, created_at)`.
- [ ] Cascading deletes are configured safely (a deleted shop cleans up its orders and jobs).

### 2. Service & Repository Verification
- [ ] Service functions require `shopId: string` as an explicit parameter.
- [ ] Database query builder calls explicitly include `eq(table.shopId, shopId)` in the `where` clause.
- [ ] Find-by-ID queries ALWAYS check both `id` AND `shopId` (`and(eq(table.id, id), eq(table.shopId, shopId))`).
- [ ] Updates and deletes require both `id` AND `shopId` in the condition.

### 3. Automated Test Verification
- [ ] An isolation test creates entities for `Shop_A` and `Shop_B`.
- [ ] The test asserts that a request with `Shop_A` credentials returns `404 Not Found` or `403 Forbidden` when attempting to read `Shop_B` entity `id`.
- [ ] The test asserts that a list query for `Shop_A` contains zero records from `Shop_B`.
- [ ] The test asserts that a print station queue query for `Shop_A` never returns jobs queued for `Shop_B`.
