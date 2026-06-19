import { describe, expect, it } from 'vitest';
import {
  classifyLifecycleSymbolFreshness,
  collectStaleLifecycleSymbols,
  buildCriticalRestFallbackTick,
} from './positionPriceWatchdog.js';
import { evaluateLongImmediateExit } from './openPositionLifecycle.js';
import { CLOSE_REASON } from './closeReasons.js';

describe('per-symbol position price watchdog', () => {
  it('does not let activity on one symbol hide another stale position', () => {
    const health = {
      BTCUSDT: { latestTickAgeMs: 100, latestSource: 'AGG_TRADE' },
      VELVETUSDT: { latestTickAgeMs: 120_386, latestSource: null },
    };
    const stale = collectStaleLifecycleSymbols(
      ['BTCUSDT', 'VELVETUSDT'],
      symbol => health[symbol],
      3_000,
    );
    expect(stale.map(item => item.symbol)).toEqual(['VELVETUSDT']);
    expect(stale[0].reason).toBe('SYMBOL_TICK_STALE');
  });

  it('classifies a never-seen symbol as stale immediately', () => {
    expect(classifyLifecycleSymbolFreshness({ symbol: 'LABUSDT', health: {}, staleAfterMs: 3_000 }))
      .toMatchObject({ stale: true, reason: 'NO_SYMBOL_TICK' });
  });

  it('replays the run-79 VELVET delayed-stop pattern and closes on the first fallback tick', () => {
    const checkedAt = Date.parse('2026-06-17T01:26:26.420Z');
    const stale = { latestTickAgeMs: 120_386, reason: 'SYMBOL_TICK_STALE' };
    const tick = buildCriticalRestFallbackTick({
      symbol: 'VELVETUSDT',
      price: 0.4129,
      checkedAt,
      stale,
    });
    const decision = evaluateLongImmediateExit({
      trade: {
        symbol: 'VELVETUSDT',
        entryPrice: 0.4435,
        leverage: 5,
        entryTime: Date.parse('2026-06-17T01:24:26.034Z'),
        holdMs: 300_000,
      },
      currentPrice: tick.price,
      now: tick.receivedAt,
      source: tick.source,
      stopLossPricePct: 1,
      takeProfitPricePct: 3,
      trailingDistancePricePct: 1.5,
    });
    expect(decision.shouldClose).toBe(true);
    expect(decision.reason).toBe(CLOSE_REASON.STOP_LOSS);
    expect(decision.priceMovePct).toBeLessThan(-6.8);
  });
});
