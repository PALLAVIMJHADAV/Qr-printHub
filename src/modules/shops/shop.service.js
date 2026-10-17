import { eq, or } from 'drizzle-orm';
import { db, shops, rateCards, merchants } from '../../core/database/index.js';
export class ShopService {
    /**
     * Resolves a physical shop and its active catalog by QR code or slug
     */
    static async getShopByCodeOrSlug(codeOrSlug) {
        const [shop] = await db
            .select({
            id: shops.id,
            merchantId: shops.merchantId,
            merchantName: merchants.name,
            name: shops.name,
            slug: shops.slug,
            qrCodeToken: shops.qrCodeToken,
            address: shops.address,
            city: shops.city,
            isOpen: shops.isOpen,
            operatingHours: shops.operatingHours,
        })
            .from(shops)
            .innerJoin(merchants, eq(shops.merchantId, merchants.id))
            .where(or(eq(shops.qrCodeToken, codeOrSlug), eq(shops.slug, codeOrSlug)))
            .limit(1);
        if (!shop) {
            return null;
        }
        // Fetch active rate cards for this shop
        const rates = await db
            .select({
            paperSize: rateCards.paperSize,
            colorMode: rateCards.colorMode,
            duplexMode: rateCards.duplexMode,
            pricePerPageCents: rateCards.pricePerPageCents,
        })
            .from(rateCards)
            .where(eq(rateCards.shopId, shop.id));
        return {
            ...shop,
            rates,
        };
    }
    /**
     * Fetches all shops for an authenticated merchant
     */
    static async getShopsForMerchant(merchantId) {
        return await db
            .select()
            .from(shops)
            .where(eq(shops.merchantId, merchantId));
    }
}
