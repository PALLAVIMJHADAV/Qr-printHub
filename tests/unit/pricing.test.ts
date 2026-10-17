import { describe, it, expect } from 'vitest';
import { PricingService } from '../../src/modules/pricing/pricing.service.js';

describe('Authoritative Pricing Engine', () => {
  const mockShopId = '00000000-0000-0000-0000-000000000001';

  it('calculates deterministic pricing for single copy B&W A4', async () => {
    const quote = await PricingService.calculateQuote({
      shopId: mockShopId,
      pages: 10,
      copies: 1,
      colorMode: 'BW',
      duplexMode: 'SIMPLEX',
      paperSize: 'A4',
    });

    expect(quote.pages).toBe(10);
    expect(quote.copies).toBe(1);
    expect(quote.unitPriceCents).toBeGreaterThan(0);
    expect(quote.totalAmountCents).toBe(10 * quote.unitPriceCents);
    expect(quote.currency).toBe('INR');
  });

  it('calculates pricing with multiple copies', async () => {
    const quote = await PricingService.calculateQuote({
      shopId: mockShopId,
      pages: 5,
      copies: 3,
      colorMode: 'BW',
      duplexMode: 'SIMPLEX',
      paperSize: 'A4',
    });

    expect(quote.totalAmountCents).toBe(15 * quote.unitPriceCents);
  });

  it('applies higher pricing for color mode', async () => {
    const bwQuote = await PricingService.calculateQuote({
      shopId: mockShopId,
      pages: 10,
      copies: 1,
      colorMode: 'BW',
      duplexMode: 'SIMPLEX',
      paperSize: 'A4',
    });

    const colorQuote = await PricingService.calculateQuote({
      shopId: mockShopId,
      pages: 10,
      copies: 1,
      colorMode: 'COLOR',
      duplexMode: 'SIMPLEX',
      paperSize: 'A4',
    });

    expect(colorQuote.unitPriceCents).toBeGreaterThan(bwQuote.unitPriceCents);
    expect(colorQuote.totalAmountCents).toBeGreaterThan(bwQuote.totalAmountCents);
  });
});
