import { describe, expect, it } from 'vitest';
import {
  makeProfitLockProtectionDefaults,
  synchronizeSimulatedProfitLockProtection,
  evaluateLongProfitLockBreach,
  PROFIT_LOCK_PROTECTION_STATE,
  PROFIT_LOCK_PROTECTION_VENUE,
  PROFIT_LOCK_PROTECTION_MODE,
} from './profitLockProtection.js';

describe('profit lock protection state machine', () => {
  const trade = {
    id: 't1', symbol: 'AAAUSDT', entryPrice: 100, leverage: 5, closed: false,
    ...makeProfitLockProtectionDefaults(),
  };

  it('arms LOCAL_WATCH protection and sets mode correctly (V2)', () => {
    const out = synchronizeSimulatedProfitLockProtection(trade, {
      profitLockActive: true,
      profitLockLevelPrice: 101,
      profitLockLevelMarginPct: 5,
      profitLockStage: 'S1',
    }, 1000);
    expect(out.profitLockProtectionState).toBe(PROFIT_LOCK_PROTECTION_STATE.PROTECTED);
    // V2: local watcher is never "verified" (no exchange acknowledgement)
    expect(out.profitLockProtectionVerified).toBe(false);
    expect(out.profitLockOrderSubmitted).toBe(false);
    expect(out.profitLockOrderAcknowledged).toBe(false);
    expect(out.profitLockOrderResting).toBe(false);
    expect(out.profitLockProtectionMode).toBe(PROFIT_LOCK_PROTECTION_MODE.LOCAL_WATCH);
    expect(out.profitLockProtectedFloorPrice).toBe(101);
  });

  it('never lowers a LONG floor', () => {
    const armed = {
      ...trade,
      profitLockStrategyActive: true,
      profitLockActive: true,
      profitLockProtectionVerified: false,
      profitLockProtectionState: PROFIT_LOCK_PROTECTION_STATE.PROTECTED,
      profitLockProtectedFloorPrice: 102,
      profitLockProtectedFloorMarginPct: 10,
    };
    const out = synchronizeSimulatedProfitLockProtection(armed, {
      profitLockActive: true,
      profitLockLevelPrice: 101,  // lower floor — must be rejected
      profitLockLevelMarginPct: 5,
      profitLockStage: 'STALE_S1',
    }, 2000);
    // Floor must not be lowered
    expect(out.profitLockProtectedFloorPrice).toBe(102);
    expect(out.profitLockProtectionState).toBe(PROFIT_LOCK_PROTECTION_STATE.PROTECTED);
  });

  it('keeps an armed lock active even when the latest strategy update no longer reports active', () => {
    const armed = {
      ...trade,
      profitLockStrategyActive: true,
      profitLockActive: true,
      profitLockProtectedFloorPrice: 101,
      profitLockProtectedFloorMarginPct: 5,
      profitLockProtectionVerified: false,
    };
    const out = synchronizeSimulatedProfitLockProtection(armed, {
      profitLockActive: false,
      profitLockLevelPrice: null,
    }, 3000);
    expect(out.profitLockStrategyActive).toBe(true);
    expect(out.profitLockProtectionState).toBe(PROFIT_LOCK_PROTECTION_STATE.PROTECTED);
  });

  it('closes on a breached floor even after the trade is already negative', () => {
    const breach = evaluateLongProfitLockBreach({
      trade: {
        ...trade,
        profitLockStrategyActive: true,
        profitLockActive: true,
        profitLockProtectedFloorPrice: 101,
      },
      currentPrice: 99,
      observedAt: 5000,
      source: 'BOOK_TICKER',
    });
    expect(breach.shouldCloseImmediately).toBe(true);
    expect(breach.profitLockFloorBreachedInLoss).toBe(true);
    expect(breach.profitLockCloseBlockedByPositivePnlGuard).toBe(false);
    expect(breach.profitLockProtectionState).toBe(PROFIT_LOCK_PROTECTION_STATE.FLOOR_BREACHED_UNCLOSED);
  });

  it('does not produce a precise crossing estimate for REST polling (first observation)', () => {
    const breach = evaluateLongProfitLockBreach({
      trade: { ...trade, profitLockStrategyActive: true, profitLockProtectedFloorPrice: 101 },
      currentPrice: 100,
      observedAt: 9000,
      source: 'REST_POLL',
    });
    // V2: no previous observation → crossEstimateAt is null; upper bound is set
    expect(breach.profitLockCrossEstimateAt).toBeNull();
    expect(breach.profitLockCrossUpperBoundAt).toBe(9000);
    expect(breach.profitLockDetectionLatencyEstimateMs).toBeNull();
    expect(breach.profitLockCrossTimePrecision).toBe('FIRST_OBSERVATION_BELOW_FLOOR');
  });
});
