import { describe, expect, it } from 'vitest';
import { resolveFreshFinalPrice, prepareLongTradeFinalization, prepareLongTradeFinalizationWithRefresh } from './tradeFinalization.js';
import { finalizeLongTrade } from './longTradeLifecycle.js';

describe('finalization stale-price freshness guard', () => {
  const now = 1_000_000_000;

  it('passes through a fresh price untouched', () => {
    const r = resolveFreshFinalPrice({ finalPrice: 10, finalPriceTimestamp: now - 2_000, now });
    expect(r.finalPriceRefreshAttempted).toBe(false);
    expect(r.finalPriceTimestamp).toBe(now - 2_000);
  });

  it('re-stamps a stale close-trigger price to now (synchronous fallback)', () => {
    const r = resolveFreshFinalPrice({ finalPrice: 10, finalPriceTimestamp: now - 90_000, now, closeTriggeredAtNow: true });
    expect(r.finalPriceRefreshSucceeded).toBe(true);
    expect(r.finalPriceTimestamp).toBe(now);
    expect(r.finalPricePreRefreshAgeMs).toBe(90_000);
  });

  it('prevents STALE_FINAL_PRICE for a stale-but-current close', () => {
    const trade = { entryPrice: 10, leverage: 5 };
    const fresh = resolveFreshFinalPrice({ finalPrice: 10.5, finalPriceTimestamp: now - 90_000, now, closeTriggeredAtNow: true });
    const fin = prepareLongTradeFinalization({ trade, finalPrice: 10.5, finalPriceTimestamp: fresh.finalPriceTimestamp, now });
    expect(fin.ok).toBe(true);
    expect(fin.finalizationFailureCode).toBeNull();
  });

  it('still fails honestly when there is no usable price', async () => {
    const trade = { entryPrice: 10, leverage: 5 };
    const out = await prepareLongTradeFinalizationWithRefresh({ trade, finalPrice: null, finalPriceTimestamp: now - 90_000, now });
    expect(out.ok).toBe(false);
    expect(out.finalizationFailureCode).toBe('INVALID_FINAL_PRICE');
  });

  it('uses an injected REST refresher when stale and price missing', async () => {
    const trade = { entryPrice: 10, leverage: 5, symbol: 'XUSDT' };
    const out = await prepareLongTradeFinalizationWithRefresh({
      trade, finalPrice: null, finalPriceTimestamp: now - 90_000, now,
      refreshPrice: async () => ({ price: 11, timestamp: now, source: 'LOCAL_REST_FALLBACK' }),
    });
    expect(out.ok).toBe(true);
    expect(out.refresh.finalPriceRefreshSucceeded).toBe(true);
  });
});

describe('close-reason normalization (SL no longer leaks raw)', () => {
  it('normalizes raw SL to canonical STOP_LOSS', () => {
    const t = finalizeLongTrade({ entryPrice: 1 }, 'SL', -1.3);
    expect(t.closeReason).toBe('STOP_LOSS');
    expect(t.canonicalCloseReason).toBe('STOP_LOSS');
  });

  it('normalizes TP and TRAIL too', () => {
    expect(finalizeLongTrade({}, 'TP', 1).closeReason).toBe('TAKE_PROFIT');
    expect(finalizeLongTrade({}, 'TRAIL', 1).closeReason).toBe('TRAILING_EXIT');
  });

  it('keeps already-canonical codes verbatim', () => {
    expect(finalizeLongTrade({}, 'PROFIT_LOCK', 0.1).closeReason).toBe('PROFIT_LOCK');
    expect(finalizeLongTrade({}, 'TIMEOUT', -0.2).closeReason).toBe('TIMEOUT');
  });
});
