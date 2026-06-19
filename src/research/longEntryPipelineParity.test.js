import { describe, it, expect } from 'vitest';
import { buildResearchEnrichedTrade } from './buildResearchEnrichedTrade.js';
import { SNAPSHOT_SCHEMA_VERSION } from './buildLongEntryResearchSnapshot.js';

// ─── SHARED TEST INPUTS ───────────────────────────────────────────────────────

function makeBaseTrade(overrides = {}) {
  return {
    id:               'test-trade-1',
    symbol:           'ADAUSDT',
    entryPrice:       0.45,
    entryTime:        1_718_000_000_000,
    leverage:         5,
    longParentBucket: 'TOP_LOSER_LONGS',
    closed:           false,
    ...overrides,
  };
}

function makeEntryTelemetry(overrides = {}) {
  return {
    immediateGreenImpulse:  true,
    greenImpulseDetected:   true,
    immediateRedImpulse:    false,
    redImpulseDetected:     false,
    entryCvdLabel:          'BULL',
    spreadPct:              0.05,
    atrPct:                 1.2,
    longMicroMomentumLabel: 'MICRO_GREEN_IMPULSE',
    hasGreenConfirmation:   true,
    hasRedDanger:           false,
    longVwapContextLabel:   'VWAP_SUPPORT_HOLD',
    entryPriceVsVwapLabel:  'ABOVE_VWAP',
    hasRsiRolloverUp:       true,
    btcMicroDirectionLabel: 'UP',
    btcTacticalDirectionLabel: 'UP',
    ...overrides,
  };
}

const SHARED_PARAMS = {
  baseTrade:      makeBaseTrade(),
  entryTelemetry: makeEntryTelemetry(),
  marketRegime:   { btcMicroDirectionLabel: 'UP' },
  marketContext:  { btcMicroDirectionLabel: 'UP' },
  sessionContext: { sessionId: 'sess-parity' },
  computedAt:     1_718_000_100_000,
};

// ─── SCHEMA VERSION ───────────────────────────────────────────────────────────

describe('buildResearchEnrichedTrade — schema version', () => {
  it('snapshot schema version matches exported constant', () => {
    const trade = buildResearchEnrichedTrade(SHARED_PARAMS);
    expect(trade.entryResearchSnapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });
});

// ─── MANUAL / BATCH PARITY ────────────────────────────────────────────────────
// Both paths in the app (addSample and startBucketSet) call buildResearchEnrichedTrade.
// Given identical inputs, both must produce identical outputs.

describe('pipeline parity: identical inputs → identical outputs', () => {
  it('two calls with same params produce identical snapshot schema version', () => {
    const a = buildResearchEnrichedTrade(SHARED_PARAMS);
    const b = buildResearchEnrichedTrade(SHARED_PARAMS);
    expect(a.entryResearchSnapshot.schemaVersion).toBe(b.entryResearchSnapshot.schemaVersion);
  });

  it('two calls with same params produce identical data quality verdict', () => {
    const a = buildResearchEnrichedTrade(SHARED_PARAMS);
    const b = buildResearchEnrichedTrade(SHARED_PARAMS);
    expect(a.entryResearchSnapshot?.dataQuality?.verdict).toBe(b.entryResearchSnapshot?.dataQuality?.verdict);
  });

  it('two calls with same params produce identical shadow decision verdict', () => {
    const a = buildResearchEnrichedTrade(SHARED_PARAMS);
    const b = buildResearchEnrichedTrade(SHARED_PARAMS);
    expect(a.entryResearchSnapshot?.shadowDecision?.finalVerdict).toBe(b.entryResearchSnapshot?.shadowDecision?.finalVerdict);
  });

  it('top-level flattened fields match snapshot canonical fields', () => {
    const trade = buildResearchEnrichedTrade(SHARED_PARAMS);
    const snap  = trade.entryResearchSnapshot;

    // Gate (canonical: snapshot.gate)
    expect(snap.gate).toBeDefined();
    expect(trade.longGateWouldPass).toBe(snap.gate.longGateWouldPass);

    // Bucket (canonical: snapshot.bucketClassification)
    expect(snap.bucketClassification).toBeDefined();
    expect(trade.longParentBucket).toBe(snap.bucketClassification.longParentBucket);

    // AES (canonical: snapshot.longAes)
    expect(snap.longAes).toBeDefined();
    expect(trade.longAesTier).toBe(snap.longAes.longAesTier);
    expect(trade.longAesScore).toBe(snap.longAes.longAesScore);

    // Shadow decision (canonical: snapshot.shadowDecision.finalVerdict)
    expect(snap.shadowDecision).toBeDefined();
    expect(trade.longShadowDecision).toBe(snap.shadowDecision.finalVerdict);
  });
});

// ─── SAFETY INVARIANTS ────────────────────────────────────────────────────────

describe('research-only safety invariants', () => {
  it('snapshot.canAffectExecution is always false', () => {
    const trade = buildResearchEnrichedTrade(SHARED_PARAMS);
    expect(trade.entryResearchSnapshot.canAffectExecution).toBe(false);
  });

  it('snapshot.executionApplied is always false', () => {
    const trade = buildResearchEnrichedTrade(SHARED_PARAMS);
    expect(trade.entryResearchSnapshot.executionApplied).toBe(false);
  });

  it('snapshot.logOnly is always true', () => {
    const trade = buildResearchEnrichedTrade(SHARED_PARAMS);
    expect(trade.entryResearchSnapshot.logOnly).toBe(true);
  });

  it('WOULD_BLOCK verdict does not prevent snapshot creation', () => {
    const dangerParams = {
      ...SHARED_PARAMS,
      entryTelemetry: makeEntryTelemetry({
        immediateRedImpulse:   true,
        immediateGreenImpulse: false,
        hasGreenConfirmation:  false,
        hasRedDanger:          true,
        entryCvdLabel:         'BEAR',
      }),
    };
    const trade = buildResearchEnrichedTrade(dangerParams);
    expect(trade.entryResearchSnapshot).toBeDefined();
    expect(trade.entryResearchSnapshot.canAffectExecution).toBe(false);
    expect(trade.entryResearchSnapshot.executionApplied).toBe(false);
  });

  it('snapshot is deeply frozen', () => {
    const trade = buildResearchEnrichedTrade(SHARED_PARAMS);
    expect(Object.isFrozen(trade.entryResearchSnapshot)).toBe(true);
  });
});

// ─── MISSING DATA ─────────────────────────────────────────────────────────────

describe('missing data handling', () => {
  it('does not throw when all optional fields missing', () => {
    expect(() => buildResearchEnrichedTrade({
      baseTrade:      makeBaseTrade(),
      entryTelemetry: {},
      marketRegime:   {},
      marketContext:  {},
      sessionContext: {},
    })).not.toThrow();
  });

  it('entryResearchSnapshot is present even with minimal inputs', () => {
    const trade = buildResearchEnrichedTrade({
      baseTrade:      { symbol: 'ADAUSDT', closed: false },
      entryTelemetry: {},
      marketRegime:   {},
      marketContext:  {},
      sessionContext: {},
    });
    expect(trade.entryResearchSnapshot).toBeDefined();
    expect(trade.entryResearchSnapshot.canAffectExecution).toBe(false);
  });
});
