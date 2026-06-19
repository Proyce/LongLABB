// ─── LONG RESEARCH-ONLY END-TO-END SAFETY TEST ────────────────────────────────
// Verifies the full research pipeline never affects execution.
// Tests the complete lifecycle: build → assert safety → export.

import { describe, it, expect } from 'vitest';
import { buildResearchEnrichedTrade } from '../research/buildResearchEnrichedTrade.js';
import { buildLongTradeJsonBlob } from '../export/longTradeExport.js';
import { assertLongResearchOnly, LONG_RESEARCH_ONLY_CONFIG } from './assertLongResearchOnly.js';

function makeHardDangerTelemetry() {
  return {
    id:               'e2e-safety-test-001',
    symbol:           'SOLUSDT',
    entryPrice:       150.0,
    entryTime:        1_718_100_000_000,
    leverage:         10,
    longParentBucket: 'TOP_GAINER_LONGS',
    closed:           false,

    // Hard danger signals
    immediateRedImpulse:   true,
    immediateGreenImpulse: false,
    hasGreenConfirmation:  false,
    hasRedDanger:          true,
    entryCvdLabel:         'BEAR',
    longMicroMomentumLabel: 'MICRO_RED_IMPULSE',
    spreadPct:             0.8,
    atrPct:                2.5,
    longGateWouldPass:     false,
    longGateEligibility:   'RESEARCH_REJECT',
  };
}

describe('LongLAB research-only end-to-end safety', () => {
  it('hard-danger trade is built without throwing', () => {
    const baseTrade     = { id: 'e2e-1', symbol: 'SOLUSDT', longParentBucket: 'TOP_GAINER_LONGS', closed: false };
    const entryTelemetry = makeHardDangerTelemetry();

    expect(() => buildResearchEnrichedTrade({
      baseTrade, entryTelemetry,
      marketContext: {}, marketRegime: {},
      computedAt: Date.now(),
    })).not.toThrow();
  });

  it('enriched trade has entryResearchSnapshot', () => {
    const trade = buildResearchEnrichedTrade({
      baseTrade:       { id: 'e2e-2', symbol: 'SOLUSDT', closed: false },
      entryTelemetry:  makeHardDangerTelemetry(),
      marketContext: {}, marketRegime: {},
      computedAt: 1_718_100_000_000,
    });

    expect(trade.entryResearchSnapshot).toBeDefined();
    expect(typeof trade.entryResearchSnapshot).toBe('object');
  });

  it('canAffectExecution is always false', () => {
    const trade = buildResearchEnrichedTrade({
      baseTrade:       { id: 'e2e-3', symbol: 'SOLUSDT', closed: false },
      entryTelemetry:  makeHardDangerTelemetry(),
      marketContext: {}, marketRegime: {},
      computedAt: 1_718_100_000_000,
    });

    expect(trade.entryResearchSnapshot.canAffectExecution).toBe(false);
    expect(trade.entryResearchSnapshot.executionApplied).toBe(false);
    expect(trade.entryResearchSnapshot.logOnly).toBe(true);
  });

  it('research-only config never violates invariants', () => {
    expect(() => assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG)).not.toThrow();
  });

  it('snapshot is frozen — no downstream mutation possible', () => {
    const trade = buildResearchEnrichedTrade({
      baseTrade:       { id: 'e2e-4', symbol: 'SOLUSDT', closed: false },
      entryTelemetry:  makeHardDangerTelemetry(),
      marketContext: {}, marketRegime: {},
      computedAt: 1_718_100_000_000,
    });

    expect(Object.isFrozen(trade.entryResearchSnapshot)).toBe(true);
  });

  it('JSON export produces valid blob from enriched trade', () => {
    const trade = buildResearchEnrichedTrade({
      baseTrade:       { id: 'e2e-5', symbol: 'SOLUSDT', closed: false },
      entryTelemetry:  makeHardDangerTelemetry(),
      marketContext: {}, marketRegime: {},
      computedAt: 1_718_100_000_000,
    });

    // Simulate closed trade
    const closedTrade = {
      ...trade,
      closed: true,
      closeReason: 'AUTO_END',
      finalPnlPct: 1.5,
      feeAdjustedNormPnlPct: 1.1,
    };

    const blob = buildLongTradeJsonBlob([closedTrade]);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(10);
    expect(blob.type).toContain('json');
  });

  it('all entryPolicyCanAffectExecution flags are false', () => {
    expect(LONG_RESEARCH_ONLY_CONFIG.entryPolicyCanAffectExecution).toBe(false);
    expect(LONG_RESEARCH_ONLY_CONFIG.longGateCanAffectExecution).toBe(false);
    expect(LONG_RESEARCH_ONLY_CONFIG.longAesCanAffectExecution).toBe(false);
    expect(LONG_RESEARCH_ONLY_CONFIG.longAuditCanAffectExecution).toBe(false);
    expect(LONG_RESEARCH_ONLY_CONFIG.longMarketContextCanAffectExecution).toBe(false);
    expect(LONG_RESEARCH_ONLY_CONFIG.longMarketBreadthCanAffectExecution).toBe(false);
    expect(LONG_RESEARCH_ONLY_CONFIG.longRunnerCanAffectExecution).toBe(false);
    expect(LONG_RESEARCH_ONLY_CONFIG.longPostFee10CanAffectExecution).toBe(false);
  });
});
