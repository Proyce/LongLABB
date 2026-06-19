import { describe, expect, it } from 'vitest';
import { deriveMacdBullishExpansion } from './longWinningSignals.js';
import { buildLongEntryResearchSnapshot } from './buildLongEntryResearchSnapshot.js';
import { LONG_TRADE_EXPORT_COLUMNS } from '../export/longTradeExportSchema.js';

describe('Defect 5 — macdBullishExpansion is genuinely tri-state', () => {
  it('returns true for a positive, rising histogram', () => {
    expect(deriveMacdBullishExpansion({ macdHistogram1m: 0.002, macdHistogramSlope1m: 0.001 })).toBe(true);
  });
  it('returns explicit FALSE for a positive but falling histogram (via slope)', () => {
    expect(deriveMacdBullishExpansion({ macdHistogram1m: 0.002, macdHistogramSlope1m: -0.001 })).toBe(false);
  });
  it('returns explicit FALSE for a negative histogram', () => {
    expect(deriveMacdBullishExpansion({ macdHistogram1m: -0.002, macdHistogramSlope1m: 0.001 })).toBe(false);
  });
  it('computes the delta from a previous histogram when no slope is given', () => {
    expect(deriveMacdBullishExpansion({ macdHistogram1m: 0.001, macdHistogramPrev1m: 0.003 })).toBe(false);
    expect(deriveMacdBullishExpansion({ macdHistogram1m: 0.003, macdHistogramPrev1m: 0.001 })).toBe(true);
  });
  it('returns explicit FALSE for a bearish/contracting state', () => {
    expect(deriveMacdBullishExpansion({ macdHistogramState1m: 'NEGATIVE_CONTRACTING' })).toBe(false);
  });
  it('still returns null only when genuinely unknown', () => {
    expect(deriveMacdBullishExpansion({})).toBe(null);
  });
});

describe('Defect 1 — data-quality verdict driver is named', () => {
  const build = extra => {
    const r = buildLongEntryResearchSnapshot({
      baseTrade: { id: 'x', symbol: 'X', entryTime: Date.now(), entryPrice: 0.1, leverage: 5, longParentBucket: 'TOP_LOSER_LONGS' },
      entryTelemetry: {
        hasGreenConfirmation: true, hasRedDanger: false, entryCvdLabel: 'BULL', spreadPct: 0.01, atrPct: 0.8,
        immediateGreenImpulse: true, last3TicksDirection: 'UP', ...extra,
      },
      marketRegime: { btcRegime: 'UPTREND', btcTacticalDirectionLabel: 'UP' },
      marketContext: {}, sessionContext: { sessionId: 's' },
    });
    return r.flattened ?? r;
  };

  it('names the missing required field that drives INCOMPLETE', () => {
    const f = build({ atrPct: null });
    expect(f.longFilterDataQuality).toBe('INCOMPLETE');
    expect(f.longDataQualityVerdictDriver).toBe('MISSING_REQUIRED_FIELD');
    expect(f.longDataQualityPrimaryMissingField).toBe('atrPct');
    expect(f.longDataQualityMissingRequiredCount).toBe(1);
  });

  it('reports NONE/driver cleanly when no required field is missing', () => {
    const f = build({});
    expect(f.longDataQualityMissingRequiredCount).toBe(0);
    expect(f.longDataQualityPrimaryMissingField).toBe(null);
    expect(['NONE', 'LOW_OPTIONAL_COVERAGE_OR_STALE']).toContain(f.longDataQualityVerdictDriver);
  });
});

describe('New diagnostics are wired into the export schema', () => {
  it('registers the data-quality driver columns', () => {
    const keys = new Set(LONG_TRADE_EXPORT_COLUMNS.map(c => c.key));
    for (const k of ['longDataQualityMissingRequiredCount', 'longDataQualityPrimaryMissingField', 'longDataQualityVerdictDriver']) {
      expect(keys.has(k), `missing export column: ${k}`).toBe(true);
    }
  });
});
