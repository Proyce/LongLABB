import { describe, expect, it } from 'vitest';
import {
  makeProfitLockProtectionDefaults,
  synchronizeSimulatedProfitLockProtection,
  evaluateLongProfitLockBreach,
  PROFIT_LOCK_PROTECTION_STATE,
  PROFIT_LOCK_PROTECTION_VENUE,
} from './profitLockProtection.js';

describe('profit lock protection state machine', () => {
  const trade = {
    id: 't1', symbol: 'AAAUSDT', entryPrice: 100, leverage: 5, closed: false,
    ...makeProfitLockProtectionDefaults(),
  };

  it('does not call a calculated floor protected until the local protection is installed', () => {
    const out = synchronizeSimulatedProfitLockProtection(trade, {
      profitLockActive: true,
      profitLockLevelPrice: 101,
      profitLockLevelMarginPct: 5,
      profitLockStage: 'S1',
    }, 1000);
    expect(out.profitLockProtectionState).toBe(PROFIT_LOCK_PROTECTION_STATE.PROTECTED);
    expect(out.profitLockProtectionVenue).toBe(PROFIT_LOCK_PROTECTION_VENUE.SIMULATED_LOCAL_STOP);
    expect(out.profitLockProtectionVerified).toBe(true);
    expect(out.profitLockProtectionModeHonestLabel).toBe('SIMULATED_LOCAL_STOP');
  });

  it('never lowers a LONG floor', () => {
    const armed = {
      ...trade,
      profitLockStrategyActive: true,
      profitLockActive: true,
      profitLockProtectionVerified: true,
      profitLockProtectionState: PROFIT_LOCK_PROTECTION_STATE.PROTECTED,
      profitLockProtectedFloorPrice: 102,
      profitLockProtectedFloorMarginPct: 10,
    };
    const out = synchronizeSimulatedProfitLockProtection(armed, {
      profitLockActive: true,
      profitLockLevelPrice: 101,
      profitLockLevelMarginPct: 5,
      profitLockStage: 'STALE_S1',
    }, 2000);
    expect(out.profitLockProtectionVerified).toBe(true);
    expect(armed.profitLockProtectedFloorPrice).toBe(102);
    expect(out.profitLockProtectionState).toBe(PROFIT_LOCK_PROTECTION_STATE.PROTECTED);
  });

  it('keeps an armed lock active even when the latest strategy update no longer reports active', () => {
    const armed = {
      ...trade,
      profitLockStrategyActive: true,
      profitLockActive: true,
      profitLockProtectedFloorPrice: 101,
      profitLockProtectedFloorMarginPct: 5,
      profitLockProtectionVerified: true,
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

  it('does not fabricate a precise crossing timestamp for REST polling', () => {
    const breach = evaluateLongProfitLockBreach({
      trade: { ...trade, profitLockStrategyActive: true, profitLockProtectedFloorPrice: 101 },
      currentPrice: 100,
      observedAt: 9000,
      source: 'REST_POLL',
    });
    expect(breach.profitLockFloorCrossedAt).toBeNull();
    expect(breach.profitLockCrossToLocalDetectionLatencyMs).toBeNull();
    expect(breach.profitLockCrossTimePrecision).toBe('UNKNOWN_BETWEEN_POLLS');
  });
});
