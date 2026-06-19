import { describe, expect, it } from 'vitest';
import { evaluateLongImmediateExit, validateLongLifecyclePriceTick } from './openPositionLifecycle.js';
import { CLOSE_REASON } from './closeReasons.js';

describe('independent LONG position lifecycle', () => {
  it('profit-lock breach has priority over SL and works in loss', () => {
    const out = evaluateLongImmediateExit({
      trade: {
        id: 'x', closed: false, entryPrice: 100, leverage: 5, entryTime: 0,
        profitLockStrategyActive: true,
        profitLockProtectedFloorPrice: 101,
      },
      currentPrice: 99,
      now: 1000,
      source: 'BOOK_TICKER',
    });
    expect(out.shouldClose).toBe(true);
    expect(out.reason).toBe(CLOSE_REASON.PROFIT_LOCK);
    expect(out.marginPnlPct).toBe(-5);
    expect(out.lockBreach.profitLockFloorBreachedInLoss).toBe(true);
  });

  it('times out independently of scanner state', () => {
    const out = evaluateLongImmediateExit({
      trade: { id: 'x', closed: false, entryPrice: 100, leverage: 5, entryTime: 0, holdMs: 500 },
      currentPrice: 100.1,
      now: 501,
      source: 'BOOK_TICKER',
    });
    expect(out.shouldClose).toBe(true);
    expect(out.reason).toBe(CLOSE_REASON.TIMEOUT);
  });
});


describe('LONG lifecycle price-integrity gate', () => {
  it('accepts a schema-validated Binance book ticker', () => {
    const out = validateLongLifecyclePriceTick({
      source: 'BOOK_TICKER',
      schemaValidated: true,
      bid: 0.0004196,
      ask: 0.00042,
      mid: 0.0004198,
    });
    expect(out.valid).toBe(true);
    expect(out.price).toBeCloseTo(0.0004198, 12);
  });

  it('rejects the run-77 quantity-as-price shape before MFE or exits can update', () => {
    const out = validateLongLifecyclePriceTick({
      source: 'BOOK_TICKER',
      schemaValidated: false,
      bid: 0.0004196,
      ask: 852212,
      mid: 426106.0002098,
    });
    expect(out.valid).toBe(false);
    expect(out.reason).toBe('UNVALIDATED_BOOK_TICKER_SCHEMA');
  });

  it('rejects even schema-tagged data when bid/ask imply an absurd spread', () => {
    const out = validateLongLifecyclePriceTick({
      source: 'BOOK_TICKER',
      schemaValidated: true,
      bid: 0.0004196,
      ask: 852212,
      mid: 426106.0002098,
    });
    expect(out.valid).toBe(false);
    expect(out.reason).toBe('ABSURD_BOOK_SPREAD');
  });
});
