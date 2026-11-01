import { eq, and } from 'drizzle-orm';
import { db, rateCards } from '../../core/database/index.js';
export class PricingService {
    /**
     * Deterministically calculates authoritative price quote based on shop rate card
     */
    static async calculateQuote(input) {
        const pages = Math.max(1, Math.floor(input.pages));
        const copies = Math.max(1, Math.floor(input.copies));
        // Lookup matching rate card for the shop
        const [rateCard] = await db
            .select()
            .from(rateCards)
            .where(and(eq(rateCards.shopId, input.shopId), eq(rateCards.paperSize, input.paperSize), eq(rateCards.colorMode, input.colorMode), eq(rateCards.duplexMode, input.duplexMode)))
            .limit(1);
        // Fallback baseline rate if exact card is not defined
        let unitPriceCents = 100; // ₹1.00 base
        if (rateCard) {
            unitPriceCents = rateCard.pricePerPageCents;
        }
        else {
            if (input.colorMode === 'COLOR')
                unitPriceCents = 500;
            if (input.paperSize === 'A3')
                unitPriceCents *= 3;
            if (input.duplexMode === 'DUPLEX')
                unitPriceCents = Math.round(unitPriceCents * 0.85);
        }
        const totalPages = pages * copies;
        const totalAmountCents = totalPages * unitPriceCents;
        // Quote is valid for 10 minutes
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        return {
            shopId: input.shopId,
            pages,
            copies,
            colorMode: input.colorMode,
            duplexMode: input.duplexMode,
            paperSize: input.paperSize,
            unitPriceCents,
            subtotalCents: totalAmountCents,
            totalAmountCents,
            currency: 'INR',
            expiresAt,
        };
    }
}
