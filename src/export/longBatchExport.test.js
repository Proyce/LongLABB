import { describe, expect, it } from 'vitest';
import {
  buildLongBatchAnalysisFiles,
  buildLongBatchDescriptors,
  dedupeLongTradesForAnalysis,
  selectLongBatchTrades,
  LONG_BATCH_HEAVY_FORENSIC_FIELDS,
} from './longBatchExport.js';

function trade(overrides = {}) {
  const run = overrides.run ?? 1;
  const cycle = overrides.autoRunCycle ?? run;
  return {
    id: overrides.id ?? `trade-${run}-${cycle}`,
    run,
    symbol: overrides.symbol ?? `SYM${run}USDT`,
    autoRunId: overrides.autoRunId ?? 'auto-batch-1',
    autoRunCycle: cycle,
    entrySource: 'AUTO_RUN',
    entryTime: 1_700_000_000_000 + run * 1_000,
    closedAt: 1_700_000_060_000 + run * 1_000,
    closed: true,
    leverage: 5,
    entryPrice: 100,
    currentPrice: 101,
    exitPrice: 101,
    feeAdjustedNormPnlPct: overrides.feeAdjustedNormPnlPct ?? 0.25,
    feeAdjustedMarginPnlPct: overrides.feeAdjustedMarginPnlPct ?? 1.25,
    rawNormPnlPct: 0.35,
    rawMarginPnlPct: 1.75,
    canonicalCloseReason: overrides.canonicalCloseReason ?? 'TIMEOUT',
    closeReason: overrides.closeReason ?? 'TIMEOUT',
    leaderboardSide: overrides.leaderboardSide ?? (run % 2 ? 'LOSERS' : 'GAINERS'),
    strategyResearchEligible: overrides.strategyResearchEligible ?? true,
    ...overrides,
  };
}

describe('Long batch analysis export', () => {
  it('discovers one exact 20-run autorun batch and selects only its trades', () => {
    const trades = Array.from({ length: 20 }, (_, index) => trade({ run: index + 1 }));
    trades.push(trade({ id: 'other', run: 99, autoRunId: 'auto-batch-2' }));

    const descriptors = buildLongBatchDescriptors(trades);
    const descriptor = descriptors.find(item => item.autoRunId === 'auto-batch-1');

    expect(descriptor).toMatchObject({ runCount: 20, completeTwentyRuns: true, tradeCount: 20 });
    expect(selectLongBatchTrades(trades, descriptor)).toHaveLength(20);
  });

  it('splits an oversized autorun into deterministic 20-run parts', () => {
    const trades = Array.from({ length: 25 }, (_, index) => trade({ run: index + 1 }));
    const descriptors = buildLongBatchDescriptors(trades).filter(item => item.autoRunId === 'auto-batch-1');

    expect(descriptors).toHaveLength(2);
    expect(descriptors.map(item => item.runCount).sort((a, b) => b - a)).toEqual([20, 5]);
  });

  it('deduplicates by trade ID and keeps the final/newer state', () => {
    const active = trade({ id: 'same', closed: false, closedAt: null });
    const closed = trade({ id: 'same', closed: true, closedAt: active.entryTime + 90_000 });

    const result = dedupeLongTradesForAnalysis([active, closed]);
    expect(result).toHaveLength(1);
    expect(result[0].closed).toBe(true);
  });

  it('builds an analysis-first package with master files, summaries, schema, and 20 per-run CSVs', () => {
    const trades = Array.from({ length: 20 }, (_, index) => trade({ run: index + 1 }));
    const descriptor = buildLongBatchDescriptors(trades)[0];
    const result = buildLongBatchAnalysisFiles(trades, descriptor, { sideFilter: 'all' });
    const paths = Object.keys(result.files);

    expect(paths.some(path => path.endsWith('/master/trades.csv'))).toBe(true);
    expect(paths.some(path => path.endsWith('/master/trades.jsonl'))).toBe(true);
    expect(paths.some(path => path.endsWith('/summary/run_summary.csv'))).toBe(true);
    expect(paths.some(path => path.endsWith('/summary/batch_summary.json'))).toBe(true);
    expect(paths.some(path => path.endsWith('/schema/columns.json'))).toBe(true);
    expect(paths.filter(path => /\/runs\/run_[^/]+\.csv$/.test(path))).toHaveLength(20);
    expect(result.batchSummary.tradeCount).toBe(20);
    expect(result.manifest.counts.runs).toBe(20);
  });

  it('separates research-clean, excluded, active, and signal-summary records', () => {
    const trades = [
      trade({ run: 1, id: 'clean', longCombosPositiveMatched: ['LONG_UNIVERSAL_CORE_V1'] }),
      trade({
        run: 2,
        id: 'excluded',
        strategyResearchEligible: false,
        strategyResearchExclusionReason: 'FROZEN_FINAL_PRICE',
        longCombosAntiMatched: ['LONG_FALLING_KNIFE_ANTI_V1'],
      }),
      trade({ run: 3, id: 'active', closed: false, closedAt: null }),
    ];
    const descriptor = buildLongBatchDescriptors(trades)[0];
    const result = buildLongBatchAnalysisFiles(trades, descriptor);
    const path = suffix => Object.keys(result.files).find(file => file.endsWith(suffix));

    expect(result.files[path('/research_clean/closed_trades.csv')]).toContain('clean');
    expect(result.files[path('/research_clean/closed_trades.csv')]).not.toContain('excluded');
    expect(result.files[path('/excluded/excluded_trades.csv')]).toContain('excluded');
    expect(result.files[path('/active/open_trades.csv')]).toContain('active');
    expect(result.files[path('/summary/signal_summary.csv')]).toContain('LONG_UNIVERSAL_CORE_V1');
    expect(result.files[path('/summary/signal_summary.csv')]).toContain('LONG_FALLING_KNIFE_ANTI_V1');
    expect(result.batchSummary.researchEligibleClosedCount).toBe(1);
    expect(result.batchSummary.excludedClosedCount).toBe(1);
  });

  it('marks excluded finalizations in the data-quality summary', () => {
    const trades = [
      trade({ run: 1 }),
      trade({
        id: 'frozen',
        run: 2,
        strategyResearchEligible: false,
        strategyResearchExclusionReason: 'FROZEN_FINAL_PRICE',
      }),
    ];
    const descriptor = buildLongBatchDescriptors(trades)[0];
    const result = buildLongBatchAnalysisFiles(trades, descriptor);
    const qualityPath = Object.keys(result.files).find(path => path.endsWith('/summary/data_quality_summary.csv'));

    expect(result.files[qualityPath]).toContain('EXCLUDED:FROZEN_FINAL_PRICE');
  });

  it('builds from an already-selected payload without cloning or scanning unrelated history', () => {
    const selected = Array.from({ length: 20 }, (_, index) => trade({ run: index + 1 }));
    const fullHistory = [
      ...selected,
      ...Array.from({ length: 80 }, (_, index) => trade({
        id: `history-${index}`,
        run: index + 21,
        autoRunId: 'older-history',
      })),
    ];
    const descriptor = buildLongBatchDescriptors(fullHistory).find(item => item.autoRunId === 'auto-batch-1');
    const result = buildLongBatchAnalysisFiles(selected, descriptor, { alreadySelected: true });

    expect(result.batchSummary.tradeCount).toBe(20);
    expect(result.batchSummary.runSummaries).toHaveLength(20);
  });

  it('omits giant nested forensic objects from the analysis ZIP while retaining flattened fields', () => {
    const huge = 'x'.repeat(100_000);
    const trades = [trade({
      run: 1,
      longGateScore: 91,
      entryResearchSnapshot: { huge },
      longComboDetails: [{ huge }],
      longWinningSetupMatchDetails: [{ huge }],
      entrySnapshotFieldStatus: { huge },
    })];
    const descriptor = buildLongBatchDescriptors(trades)[0];
    const result = buildLongBatchAnalysisFiles(trades, descriptor);
    const masterPath = Object.keys(result.files).find(path => path.endsWith('/master/trades.csv'));
    const schemaPath = Object.keys(result.files).find(path => path.endsWith('/schema/columns.json'));
    const master = result.files[masterPath];
    const schema = JSON.parse(result.files[schemaPath]);

    expect(master).toContain('longGateScore');
    expect(master).toContain('91');
    expect(master).not.toContain(huge);
    LONG_BATCH_HEAVY_FORENSIC_FIELDS.forEach(field => {
      expect(schema.omittedHeavyForensicFields).toContain(field);
      expect(schema.columns.some(column => column.key === field)).toBe(false);
    });
  });

  it('stores exceptional lifecycle evidence sparsely and keeps normal trades out of forensics', () => {
    const trades = [
      trade({ run: 1, id: 'normal' }),
      trade({ run: 2, id: 'floor-miss', profitLockFloorMissed: true, boundedExitTickAudit: [[1, 100, 'B', 0]] }),
    ];
    const descriptor = buildLongBatchDescriptors(trades)[0];
    const result = buildLongBatchAnalysisFiles(trades, descriptor);
    const forensicPath = Object.keys(result.files).find(path => path.endsWith('/forensics/exit_events.jsonl'));
    const rows = result.files[forensicPath].trim().split('\n').filter(Boolean).map(JSON.parse);
    expect(rows).toHaveLength(1);
    expect(rows[0].tradeId).toBe('floor-miss');
    expect(result.manifest.counts.forensicEvents).toBe(1);
    expect(result.manifest.telemetryStorageProfile).toBe('LONG_TELEMETRY_V9_COMPACT');
    expect(result.manifest.canonicalVersions.tradeSchemaVersion).toBe('LONG_TRADE_EXPORT_V9');
  });

});
