// Regression tests locking the four P0 review fixes:
//   1. single canonical filter-snapshot version (no V1/V4 split)
//   2. explicit PnL metrics; normalized default; no silent margin substitution
//   3. dedicated Post-Fee preview scorer (not routed through Best DNA)
//   4. compact filter snapshot (no full-trade duplication)

import { describe, it, expect } from 'vitest';
import { buildResearchEnrichedTrade } from './buildResearchEnrichedTrade.js';
import { getLongFilterOutcomePnl } from '../filters/longFilterEngine.js';
import { PNL_METRIC, DEFAULT_PNL_METRIC } from '../filters/longFilterConstants.js';
import { DEFAULT_LONG_FILTER_STATE } from '../filters/longFilterState.js';
import { LONG_FILTER_SNAPSHOT_VERSION } from './longResearchSchemaVersions.js';
import {
  tickerPostFee10PreviewAssessment,
  tickerBestDnaPreviewAssessment,
} from './longPreviewScorers.js';

const STRONG_PARAMS = {
  baseTrade: {
    id: 'p0', symbol: 'ADAUSDT', entryPrice: 0.45,
    entryTime: 1_718_000_000_000, leverage: 5, longParentBucket: 'TOP_LOSER_LONGS',
  },
  entryTelemetry: {
    immediateGreenImpulse: true, greenImpulseDetected: true, entryCvdLabel: 'BULL',
    spreadPct: 0.05, atrPct: 1.2, longMicroMomentumLabel: 'MICRO_GREEN_IMPULSE',
    hasGreenConfirmation: true, hasRedDanger: false, longVwapContextLabel: 'VWAP_SUPPORT_HOLD',
    entryPriceVsVwapLabel: 'ABOVE_VWAP', hasRsiRolloverUp: true,
    btcMicroDirectionLabel: 'UP', btcTacticalDirectionLabel: 'UP',
  },
  marketContext: { btcMicroDirectionLabel: 'UP' },
  sessionContext: { sessionId: 's' },
  computedAt: 1_718_000_100_000,
};

describe('P0#1: single canonical filter-snapshot version', () => {
  it('top-level and nested snapshot report the SAME canonical version', () => {
    const t = buildResearchEnrichedTrade(STRONG_PARAMS);
    const nested = t.entryResearchSnapshot.filterSnapshot.longFilterSnapshotVersion;
    expect(t.longFilterSnapshotVersion).toBe(LONG_FILTER_SNAPSHOT_VERSION);
    expect(nested).toBe(LONG_FILTER_SNAPSHOT_VERSION);
    expect(nested).toBe(t.longFilterSnapshotVersion);
  });

  it('constants module re-exports the canonical version (no legacy literal)', async () => {
    const { LONG_FILTER_SNAPSHOT_VERSION: fromConstants } =
      await import('../filters/longFilterConstants.js');
    expect(fromConstants).toBe(LONG_FILTER_SNAPSHOT_VERSION);
    expect(fromConstants).not.toBe('long-filter-snapshot-v1');
  });
});

describe('P0#2: explicit PnL metrics, normalized default, no silent substitution', () => {
  const t = { feeAdjustedNormPnlPct: 1, feeAdjustedMarginPnlPct: 5, rawNormPnlPct: 1.2, rawMarginPnlPct: 6, grossMarginPnlPct: 6 };

  it('default research metric is fee-adjusted normalized', () => {
    expect(DEFAULT_PNL_METRIC).toBe(PNL_METRIC.FEE_ADJUSTED_NORMALIZED);
    expect(DEFAULT_LONG_FILTER_STATE.pnlMetric).toBe(PNL_METRIC.FEE_ADJUSTED_NORMALIZED);
  });

  it('normalized metric reads the normalized field, not margin', () => {
    expect(getLongFilterOutcomePnl(t, PNL_METRIC.FEE_ADJUSTED_NORMALIZED).pnlValue).toBe(1);
    expect(getLongFilterOutcomePnl(t, PNL_METRIC.RAW_NORMALIZED).pnlValue).toBe(1.2);
  });

  it('margin metric reads the margin field', () => {
    expect(getLongFilterOutcomePnl(t, PNL_METRIC.FEE_ADJUSTED_MARGIN).pnlValue).toBe(5);
    expect(getLongFilterOutcomePnl(t, PNL_METRIC.RAW_MARGIN).pnlValue).toBe(6);
  });

  it('does NOT substitute margin when the normalized field is missing', () => {
    const marginOnly = { feeAdjustedMarginPnlPct: 5, grossMarginPnlPct: 6 };
    const r = getLongFilterOutcomePnl(marginOnly, PNL_METRIC.FEE_ADJUSTED_NORMALIZED);
    expect(r.pnlValue).toBeNull();
    expect(r.pnlMetricAvailable).toBe(false);
  });

  it('default call (no metric arg) resolves the normalized field', () => {
    expect(getLongFilterOutcomePnl(t).pnlValue).toBe(1);
  });
});

describe('P0#3: dedicated Post-Fee preview scorer', () => {
  const kl = {
    cvdLabel: 'BULL', atrPct: 1.2, spreadPct: 0.05, hasGreenConfirmation: true,
    immediateGreenImpulse: true, greenImpulseDetected: true,
    longMicroMomentumLabel: 'MICRO_GREEN_IMPULSE', longVwapContextLabel: 'VWAP_SUPPORT_HOLD',
    hasRsiRolloverUp: true, last3TicksDirection: 'UP',
  };

  it('preview emits a real Post-Fee score and tier', () => {
    const p = tickerPostFee10PreviewAssessment(kl, { priceChangePercent: '-8' }, 0, 'LOSERS');
    expect(p).not.toBeNull();
    expect(typeof p.longPostFee10EntryScore).toBe('number');
    expect(p.longPostFee10EntryTier).toBeDefined();
  });

  it('preview is marked log-only and cannot affect execution', () => {
    const p = tickerPostFee10PreviewAssessment(kl, {}, 0, 'LOSERS');
    expect(p.sourceTiming).toBe('ENTRY_PREVIEW');
    expect(p.logOnly).toBe(true);
    expect(p.canAffectExecution).toBe(false);
  });

  it('Best DNA preview still does NOT carry Post-Fee fields', () => {
    const dna = tickerBestDnaPreviewAssessment(kl, {}, 0, 'LOSERS');
    expect(dna.longPostFee10EntryScore).toBeUndefined();
  });

  it('returns null for missing CVD (no fabricated score)', () => {
    expect(tickerPostFee10PreviewAssessment({}, {}, 0, 'LOSERS')).toBeNull();
  });
});

describe('P0#4: compact filter snapshot', () => {
  it('snapshot is far smaller than the full trade record', () => {
    const t = buildResearchEnrichedTrade(STRONG_PARAMS);
    const fs = t.entryResearchSnapshot.filterSnapshot;
    const fsKeys = Object.keys(fs).length;
    const tradeKeys = Object.keys(t).length;
    expect(fsKeys).toBeLessThan(tradeKeys);
    // V9 adds a bounded set of entry-frozen tick microstructure scalars while
    // still excluding raw event arrays and the full research snapshot.
    expect(fsKeys).toBeLessThan(160);
  });

  it('compact snapshot keeps canonical fields + shadow verdict, drops legacy', () => {
    const t = buildResearchEnrichedTrade(STRONG_PARAMS);
    const fs = t.entryResearchSnapshot.filterSnapshot;
    expect(fs.longPostFee10EntryScore).not.toBeUndefined();
    expect(fs.longGateScore).not.toBeUndefined();
    expect(fs).toHaveProperty('longShadowDecision');
    expect(fs.longPostFee10Score).toBeUndefined();      // legacy alias gone
    expect(fs.longFilterSnapshotSource).toBe('CANONICAL_REGISTRY_ENTRY_FIELDS');
  });
});
