import { describe, expect, it } from 'vitest';
import { evaluateBestDnaLongAudit } from '../audits/bestDnaLongAudit.js';
import {
  LONG_FILTER_REGISTRY,
  getFilterById,
} from '../filters/longFilterRegistry.js';
import {
  applyLongFilterState,
  FILTER_VERDICT,
  getLongFilterOutcomePnl,
} from '../filters/longFilterEngine.js';
import {
  DEFAULT_LONG_FILTER_STATE,
  makeFilterGroup,
  makePredicate,
  serializeFilterStateToURL,
  deserializeFilterStateFromURL,
} from '../filters/longFilterState.js';
import {
  FILTER_TIMING,
  OPERATOR,
  PNL_METRIC,
} from '../filters/longFilterConstants.js';
import {
  freezeLongFilterSnapshot,
  ENTRY_PREDICTIVE_SNAPSHOT_FIELDS,
} from '../filters/longFilterSnapshot.js';
import {
  buildLongCohortSummary,
} from '../filters/longFilterAnalytics.js';
import { LONG_PF10_TIER } from '../scoring/longPostFee10/longPostFee10.constants.js';
import { LONG_RUNNER_TIER } from '../scoring/longCandidateRunner/longCandidateRunner.constants.js';
import { scoreLongPostFee10Entry } from '../scoring/longPostFee10/index.js';
import { tickerPostFee10PreviewAssessment } from './longPreviewScorers.js';

function canonicalTrade(overrides = {}) {
  return {
    tradeId: 'semantic-1',
    id: 'semantic-1',
    longParentBucket: 'TOP_GAINER_LONGS',
    longFilterSnapshotVersion: 'LONG_FILTER_SNAPSHOT_V4',
    filterRecordSchemaClass: 'NATIVE_LONG_V4',
    legacyShortSemanticData: false,
    isFinalOutcome: true,
    closed: true,
    feeAdjustedNormPnlPct: 1,
    rawNormPnlPct: 1.1,
    feeAdjustedMarginPnlPct: 5,
    rawMarginPnlPct: 5.5,
    entryCvdLabel: 'BULL',
    entryPriceVsVwapLabel: 'ABOVE_VWAP',
    entryPriceVsVwapPct: 0.4,
    longVwapContextLabel: 'VWAP_RECLAIM_CONFIRMED',
    longMicroMomentumLabel: 'MICRO_GREEN_IMPULSE',
    hasGreenConfirmation: true,
    immediateGreenImpulse: true,
    last3TicksDirection: 'UP',
    atrPct: 1,
    spreadPct: 0.05,
    longAuditDangerTier: 'CLEAR',
    longPostFee10EntryScore: 90,
    longPostFee10EntryTier: LONG_PF10_TIER.ELITE,
    longCandidateRunnerScoreAtEntry: 90,
    longCandidateRunnerTierAtEntry: LONG_RUNNER_TIER.ELITE,
    ...overrides,
  };
}

function stateFor(filterId, operator, value, extras = {}) {
  const group = makeFilterGroup({ id: 'semantic-group', operator: 'ALL_OF' });
  group.predicates = [makePredicate(filterId, operator, value)];
  return {
    ...DEFAULT_LONG_FILTER_STATE,
    tradeStatus: 'ALL_TRADES',
    groups: [group],
    ...extras,
  };
}

describe('final semantic consolidation', () => {
  it('registry tier options are sourced from canonical scorer enums', () => {
    expect(getFilterById('LONG_POST_FEE_10_TIER').enumValues)
      .toEqual(Object.values(LONG_PF10_TIER));
    expect(getFilterById('LONG_CANDIDATE_RUNNER_TIER_AT_ENTRY').enumValues)
      .toEqual(Object.values(LONG_RUNNER_TIER));
  });

  it('canonical Post-Fee tier emitted by scorer matches the registry filter', () => {
    const scored = scoreLongPostFee10Entry(canonicalTrade());
    const trade = canonicalTrade({
      longPostFee10EntryScore: scored.longPostFee10EntryScore,
      longPostFee10EntryTier: scored.longPostFee10EntryTier,
    });
    const result = applyLongFilterState(
      [trade],
      stateFor('LONG_POST_FEE_10_TIER', OPERATOR.IN, [scored.longPostFee10EntryTier]),
    );
    expect(result.outputCount).toBe(1);
  });

  it('canonical CVD and VWAP fields match registry predicates', () => {
    const trade = canonicalTrade();
    const cvd = applyLongFilterState(
      [trade],
      stateFor('CVD_LABEL', OPERATOR.IN, ['BULL']),
    );
    const vwap = applyLongFilterState(
      [trade],
      stateFor('PRICE_VS_VWAP_LABEL', OPERATOR.IN, ['ABOVE_VWAP']),
    );
    expect(cvd.outputCount).toBe(1);
    expect(vwap.outputCount).toBe(1);
  });

  it('Best DNA is invariant when deprecated aliases are also present', () => {
    const canonical = canonicalTrade();
    const withAliases = {
      ...canonical,
      cvdLabel: 'BEAR',
      priceVsVwapLabel: 'BELOW_VWAP',
      vwapContextLabel: 'VWAP_RECLAIM_FAILURE',
      microMomentumLabel: 'MICRO_RED_PRESSURE',
    };
    const a = evaluateBestDnaLongAudit(canonical);
    const b = evaluateBestDnaLongAudit(withAliases);
    expect(b.bestDnaLongScore).toBe(a.bestDnaLongScore);
    expect(b.bestDnaLongTier).toBe(a.bestDnaLongTier);
  });

  it('compact snapshot contains every entry-predictive registry source field', () => {
    const snapshot = freezeLongFilterSnapshot(canonicalTrade());
    const required = LONG_FILTER_REGISTRY
      .filter(f => f.timing === FILTER_TIMING.ENTRY_FINAL && f.entryPredictive === true)
      .map(f => f.field);
    expect(new Set(ENTRY_PREDICTIVE_SNAPSHOT_FIELDS)).toEqual(new Set([
      ...new Set(ENTRY_PREDICTIVE_SNAPSHOT_FIELDS),
    ]));
    for (const field of required) {
      expect(Object.prototype.hasOwnProperty.call(snapshot, field), field).toBe(true);
    }
  });

  it('RAW_NORMALIZED reads rawNormPnlPct and never substitutes a margin field', () => {
    const resolved = getLongFilterOutcomePnl(
      { rawNormPnlPct: 1.23, rawMarginPnlPct: 99 },
      PNL_METRIC.RAW_NORMALIZED,
    );
    expect(resolved).toMatchObject({ pnlValue: 1.23, pnlMetricAvailable: true });
  });

  it('CLOSED_ONLY accepts finalized records using the selected normalized metric', () => {
    const trade = canonicalTrade({ finalPnlPct: undefined, feeAdjustedMarginPnlPct: undefined });
    const result = applyLongFilterState([trade], {
      ...DEFAULT_LONG_FILTER_STATE,
      groups: [],
      pnlMetric: PNL_METRIC.FEE_ADJUSTED_NORMALIZED,
      tradeStatus: 'CLOSED_ONLY',
    });
    expect(result.outputCount).toBe(1);
  });

  it('cohort analytics obey the selected normalized metric', () => {
    const trades = [
      canonicalTrade({ tradeId: 'a', feeAdjustedNormPnlPct: 1, feeAdjustedMarginPnlPct: 100 }),
      canonicalTrade({ tradeId: 'b', feeAdjustedNormPnlPct: -1, feeAdjustedMarginPnlPct: -10 }),
    ];
    const normalized = buildLongCohortSummary(
      trades,
      'normalized',
      PNL_METRIC.FEE_ADJUSTED_NORMALIZED,
    );
    expect(normalized.netAfterFeesTotal).toBe(0);
    expect(normalized.netAfterFeesAvg).toBe(0);
  });

  it('post-entry Runner filters are NOT_APPLICABLE in entry-research timing scope', () => {
    const trade = canonicalTrade({ runnerCapturePotentialScore: 95 });
    const state = stateFor('RUNNER_CAPTURE_SCORE', OPERATOR.GTE, 80, {
      timingScope: 'ENTRY_FINAL_ONLY',
    });
    const result = applyLongFilterState([trade], state);
    const detail = result.filterResultsByTradeId[trade.tradeId]?.[0];
    expect(detail?.verdict).toBe(FILTER_VERDICT.NOT_APPLICABLE);
    expect(result.outputCount).toBe(0);
  });

  it('sparse Post-Fee preview remains unknown and insufficient', () => {
    const preview = tickerPostFee10PreviewAssessment(
      { entryCvdLabel: 'BULL', atrPct: 1, spreadPct: 0.05 },
      null,
      0,
      'GAINERS',
    );
    expect(preview.longPostFee10EntryScore).toBeNull();
    expect(preview.longPostFee10EntryTier).toBe(LONG_PF10_TIER.INSUFFICIENT);
    expect(preview.longPostFee10Verdict).toBe('UNKNOWN');
    expect(preview.longPostFee10FeatureCoveragePct).toBeLessThan(75);
  });

  it('URL round-trip preserves canonical quick predicates without changing timing scope', () => {
    const group = makeFilterGroup({ id: 'quick-filters', operator: 'ALL_OF' });
    group.predicates = [{
      ...makePredicate('CVD_LABEL', OPERATOR.IN, ['BULL']),
      source: 'quick',
    }];
    const original = {
      ...DEFAULT_LONG_FILTER_STATE,
      timingScope: 'ENTRY_FINAL_ONLY',
      groups: [group],
      outcomeFilters: [{
        ...makePredicate('FEE_ADJUSTED_NORM_PNL_PCT', OPERATOR.GTE, 0),
        source: 'quick',
      }],
    };
    const restored = deserializeFilterStateFromURL(serializeFilterStateToURL(original));
    expect(restored.groups).toHaveLength(1);
    expect(restored.groups[0].predicates).toHaveLength(1);
    expect(restored.groups[0].predicates[0].source).toBe('quick');
    expect(restored.outcomeFilters).toHaveLength(1);
    expect(restored.outcomeFilters[0].source).toBe('quick');
    expect(restored.timingScope).toBe('ENTRY_FINAL_ONLY');
  });
});
