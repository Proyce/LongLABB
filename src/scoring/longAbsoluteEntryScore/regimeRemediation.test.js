import { describe, expect, it } from 'vitest';
import { deriveLongQualityBuckets, deriveLongAtrContext } from '../../research/longEvidenceSemantics.js';
import { computeLongAesConfidenceScore, classifyLongAesConfidenceLabel } from './longAbsoluteEntryScore.labels.js';

describe('LONG quality tier — consensus aggregation', () => {
  it('does NOT promote to ELITE on a single inflated scorer', () => {
    // gate inflated to 92, the other three weak. Old Math.max => ELITE; consensus => WATCH.
    const out = deriveLongQualityBuckets({
      longGateScore: 92, bestDnaLongScore: 40, longPostFee10EntryScore: 42, longCandidateRunnerScoreAtEntry: 38,
    });
    expect(out.longQualityTierV2).not.toBe('ELITE');
    expect(['WATCH', 'REJECT', 'QUALIFIED']).toContain(out.longQualityTierV2);
    expect(out.longQualityTierV2Aggregation).toBe('CONSENSUS_MEDIAN');
  });

  it('promotes to ELITE when scorers agree', () => {
    const out = deriveLongQualityBuckets({
      longGateScore: 92, bestDnaLongScore: 95, longPostFee10EntryScore: 91, longCandidateRunnerScoreAtEntry: 60,
    });
    expect(out.longQualityTierV2).toBe('ELITE');
  });

  it('caps tier at WATCH in HARD_DANGER breadth', () => {
    const out = deriveLongQualityBuckets({
      longGateScore: 95, bestDnaLongScore: 95, longPostFee10EntryScore: 95, longCandidateRunnerScoreAtEntry: 95,
      longMarketBreadthLabel: 'LONG_BREADTH_HARD_DANGER',
    });
    expect(out.longQualityTierV2).toBe('WATCH');
  });

  it('preserves single-score ELITE via median (back-compat)', () => {
    const out = deriveLongQualityBuckets({ longGateScore: 92 });
    expect(out.longQualityTierV2).toBe('ELITE');
  });
});

describe('LONG ATR context — regime-gated boost', () => {
  const boostSample = { atrPct: 0.8, longGateScore: 90, last3TicksDirection: 'UP' };

  it('is a BOOST in a non-hostile regime', () => {
    expect(deriveLongAtrContext(boostSample).longAtrContext).toBe('QUALIFIED_VOLATILITY_BOOST');
  });

  it('becomes DANGER under a headwind', () => {
    expect(deriveLongAtrContext({ ...boostSample, longMarketContextLabel: 'LONG_CONTEXT_STRONG_HEADWIND' }).longAtrContext)
      .toBe('UNQUALIFIED_VOLATILITY_DANGER');
  });

  it('becomes DANGER under hard-danger breadth', () => {
    expect(deriveLongAtrContext({ ...boostSample, longMarketBreadthLabel: 'LONG_BREADTH_HARD_DANGER' }).longAtrContext)
      .toBe('UNQUALIFIED_VOLATILITY_DANGER');
  });
});

describe('LONG AES confidence — signal-based, not coverage', () => {
  it('returns 0 when coverage is below the precondition floor', () => {
    expect(computeLongAesConfidenceScore({ aesScore: 90, featureCoveragePct: 50 })).toBe(0);
  });

  it('varies with score margin at identical (full) coverage', () => {
    const high = computeLongAesConfidenceScore({ aesScore: 85, positiveSignalCount: 5, negativeSignalCount: 0, featureCoveragePct: 100 });
    const low  = computeLongAesConfidenceScore({ aesScore: 40, positiveSignalCount: 0, negativeSignalCount: 4, featureCoveragePct: 100 });
    expect(high).toBeGreaterThan(low);
    expect(high).not.toBe(low);
  });

  it('is no longer pinned at VERY_HIGH for every full-coverage row', () => {
    const weak = computeLongAesConfidenceScore({ aesScore: 48, positiveSignalCount: 1, negativeSignalCount: 2, featureCoveragePct: 100 });
    expect(classifyLongAesConfidenceLabel(weak)).not.toBe('VERY_HIGH_CONFIDENCE');
  });
});

describe('Remediation telemetry is wired into the export schema', () => {
  it('registers every new log-only diagnostic column in the V8 compact export', async () => {
    const { LONG_TRADE_EXPORT_COLUMNS } = await import('../../export/longTradeExportSchema.js');
    const keys = new Set(LONG_TRADE_EXPORT_COLUMNS.map(c => c.key));
    const required = [
      'longGateRegimeVersion', 'longGateRegimePenaltyApplied', 'longGateTierCeilingApplied',
      'longQualityTierV2Aggregation',
      'longMicroConfirmObserved', 'longMicroConfirmReversalLane', 'longMicroConfirmObsVersion',
      'finalPriceRefreshAttempted', 'finalPriceRefreshSucceeded', 'finalPricePreRefreshAgeMs',
      'exitVsRegimeAttribution',
    ];
    for (const k of required) expect(keys.has(k), `missing export column: ${k}`).toBe(true);
  });

  it('flat entry snapshot surfaces gate-regime and micro-confirm diagnostics', async () => {
    const mod = await import('../../research/buildLongEntryResearchSnapshot.js');
    const build = mod.buildLongEntryResearchSnapshot ?? mod.default;
    const snap = build({
      id: 't1', symbol: 'ABCUSDT', longParentBucket: 'TOP_LOSER_LONGS',
      atrPct: 0.8, longMarketBreadthLabel: 'LONG_BREADTH_HARD_DANGER',
      longMarketContextLabel: 'LONG_CONTEXT_STRONG_HEADWIND',
      longMicroMomentumLabel: 'MICRO_NO_LONG_CONFIRMATION',
    });
    const flat = snap?.flattened ?? snap;
    expect(flat).toHaveProperty('longGateRegimeVersion');
    expect(flat).toHaveProperty('longGateTierCeilingApplied');
    expect(flat).toHaveProperty('longMicroConfirmObserved');
    expect(flat.longMicroConfirmObserved).toBe(false); // MICRO_NO_LONG_CONFIRMATION => not confirmed
  });
});
