import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db, merchants, shops, users, orders } from '../../core/database/index.js';

export class PlatformService {
  /**
   * Fetches global platform-wide SaaS metrics for the Platform Super Admin
   */
  static async getPlatformAnalytics() {
    const [merchantCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(merchants);

    const [shopCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shops);

    const [orderMetrics] = await db
      .select({
        totalOrders: sql<number>`count(*)::int`,
        totalGmvCents: sql<number>`coalesce(sum(${orders.totalAmountCents}), 0)::int`,
      })
      .from(orders);

    // SaaS MRR calculation: Starter = ₹2,499/mo, Pro = ₹5,999/mo, Enterprise = ₹14,999/mo
    const merchantList = await db.select().from(merchants);
    const mrrCents = merchantList.reduce((acc, m) => {
      const plan = m.subscriptionTier;
      if (plan === 'ENTERPRISE') return acc + 1499900;
      if (plan === 'PRO') return acc + 599900;
      return acc + 249900;
    }, 0);

    return {
      totalMerchants: merchantCount?.count || 0,
      activeShops: shopCount?.count || 0,
      totalOrders: orderMetrics?.totalOrders || 0,
      totalGmvCents: orderMetrics?.totalGmvCents || 0,
      mrrCents,
    };
  }

  /**
   * Lists all merchant organizations with their subscription tier, shops count, and revenue
   */
  static async listMerchants() {
    const list = await db
      .select({
        id: merchants.id,
        name: merchants.name,
        slug: merchants.slug,
        email: merchants.email,
        status: merchants.status,
        subscriptionTier: merchants.subscriptionTier,
        createdAt: merchants.createdAt,
      })
      .from(merchants);

    // Enhance each merchant with shop counts and total orders
    const enhanced = await Promise.all(
      list.map(async (m) => {
        const [shopData] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(shops)
          .where(eq(shops.merchantId, m.id));

        return {
          ...m,
          shopCount: shopData?.count || 0,
        };
      })
    );

    return enhanced;
  }

  /**
   * Onboards a new print business client (Merchant) with an initial shop and owner account
   */
  static async createMerchant(params: {
    businessName: string;
    ownerEmail: string;
    ownerName: string;
    subscriptionTier: 'STARTER' | 'PRO' | 'ENTERPRISE';
    initialShopName: string;
    city: string;
  }) {
    const slug = params.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const shopSlug = params.initialShopName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const qrToken = `QR_${slug.toUpperCase().slice(0, 8)}_${Date.now().toString().slice(-4)}`;

    // 1. Create Merchant Entity
    const [merchant] = await db
      .insert(merchants)
      .values({
        name: params.businessName,
        slug,
        email: params.ownerEmail,
        status: 'ACTIVE',
        subscriptionTier: params.subscriptionTier,
        payoutAccount: { status: 'PENDING_VERIFICATION' },
      })
      .returning();

    // 2. Create Owner User
    const defaultPassword = await bcrypt.hash('Merchant123!', 10);
    const [owner] = await db
      .insert(users)
      .values({
        merchantId: merchant.id,
        name: params.ownerName,
        email: params.ownerEmail,
        passwordHash: defaultPassword,
        role: 'MERCHANT_ADMIN',
      })
      .returning();

    // 3. Create Initial Physical Shop
    const [shop] = await db
      .insert(shops)
      .values({
        merchantId: merchant.id,
        name: params.initialShopName,
        slug: shopSlug,
        qrCodeToken: qrToken,
        city: params.city,
        isOpen: true,
      })
      .returning();

    return {
      merchant,
      owner: { id: owner.id, email: owner.email, name: owner.name },
      initialShop: shop,
    };
  }
}
