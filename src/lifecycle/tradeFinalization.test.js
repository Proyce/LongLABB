import { describe, expect, it } from 'vitest';
import { prepareLongTradeFinalization, validateFinalPrice } from './tradeFinalization.js';

describe('trade finalization truth', () => {
  it('rejects a missing final price timestamp', () => {
    const out = validateFinalPrice({ entryPrice: 100, finalPrice: 101, finalPriceTimestamp: null, now: 1000 });
    expect(out.valid).toBe(false);
    expect(out.errors).toContain('MISSING_FINAL_PRICE_TIMESTAMP');
  });

  it('rejects stale final prices', () => {
    const out = validateFinalPrice({ entryPrice: 100, finalPrice: 101, finalPriceTimestamp: 0, now: 40_001, maxAgeMs: 30_000 });
    expect(out.errors).toContain('STALE_FINAL_PRICE');
  });

  it('can explicitly detect a frozen entry-price fallback', () => {
    const out = validateFinalPrice({ entryPrice: 100, finalPrice: 100, finalPriceTimestamp: 1000, now: 1000, allowUnchangedPrice: false });
    expect(out.errors).toContain('FROZEN_FINAL_PRICE');
    expect(out.autoEndUsedEntryPriceFallback).toBe(false);
  });

  it('returns canonical and compatibility PnL units', () => {
    const out = prepareLongTradeFinalization({
      trade: { entryPrice: 100, leverage: 5 },
      finalPrice: 102,
      finalPriceTimestamp: 1000,
      now: 1000,
      roundTripFeePct: 0.10,
      slippagePct: 0,
    });
    expect(out.ok).toBe(true);
    expect(out.pnl.priceMovePct).toBe(2);
    expect(out.pnl.grossLeveragedPnlPct).toBe(10);
    expect(out.pnl.feeAdjustedNormPnlPct).toBe(1.9);
    expect(out.pnl.feeAdjustedLeveragedPnlPct).toBe(9.5);
  });
});
