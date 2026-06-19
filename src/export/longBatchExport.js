// ─── LONG BATCH ANALYSIS EXPORT ──────────────────────────────────────────────
// Builds an analysis-first export package for one autorun batch (up to 20 runs).
// The ZIP is assembled in a Web Worker by longBatchExport.worker.js.
// LOG ONLY — export code must never mutate runtime trade state.

import { LONG_TRADE_EXPORT_COLUMNS } from './longTradeExportSchema.js';
import {
  buildLongTradeCsvString,
  buildLongTradeJsonLinesString,
  buildLongTradeJsonRows,
  prepareLongTradesForExport,
} from './longTradeExport.js';
import { longFeeAdjustedNormPnlPct } from './runOutcomeRanking.js';
import { LONG_TRADE_EXPORT_VERSION, LONG_RESEARCH_VERSION_STAMP } from '../research/longResearchSchemaVersions.js';
import { buildExceptionalForensicEvent } from '../telemetry/telemetryCompaction.js';
import {
  TICK_DIRECTION_CONFIG,
  TICK_DIRECTION_STREAM_SCHEMA_VERSION,
  TICK_DIRECTION_VERSION,
} from '../tickDirection/tickDirection.config.js';

export const LONG_BATCH_EXPORT_VERSION = 'LONG_BATCH_ANALYSIS_V4_TICK_DIRECTION_V1';
export const LONG_BATCH_RUN_LIMIT = 20;

export const LONG_BATCH_HEAVY_FORENSIC_FIELDS = Object.freeze([
  'entryResearchSnapshot',
  'longComboDetails',
  'longWinningSetupMatchDetails',
  'entrySnapshotFieldStatus',
  'entryTickSnapshot',
]);

export const LONG_BATCH_ANALYSIS_COLUMNS = Object.freeze(
  LONG_TRADE_EXPORT_COLUMNS.filter(column => !LONG_BATCH_HEAVY_FORENSIC_FIELDS.includes(column.key)),
);

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRun(value) {
  const n = finiteNumber(value);
  return n == null ? null : n;
}

function stableTradeId(trade, index = 0) {
  return String(
    trade?.tradeId ?? trade?.id ?? `${trade?.symbol ?? 'UNKNOWN'}:${trade?.entryTime ?? index}`,
  );
}

function compareTradeFreshness(left, right) {
  const leftFinal = left?.closed === true ? 1 : 0;
  const rightFinal = right?.closed === true ? 1 : 0;
  if (leftFinal !== rightFinal) return leftFinal - rightFinal;
  return Number(left?.closedAt ?? left?.lastPriceUpdateAt ?? left?.entryTime ?? 0)
    - Number(right?.closedAt ?? right?.lastPriceUpdateAt ?? right?.entryTime ?? 0);
}

export function dedupeLongTradesForAnalysis(trades) {
  const byId = new Map();
  (Array.isArray(trades) ? trades : []).forEach((trade, index) => {
    const id = stableTradeId(trade, index);
    const current = byId.get(id);
    if (!current || compareTradeFreshness(current, trade) <= 0) byId.set(id, trade);
  });
  return [...byId.values()];
}

function sortRuns(runs) {
  return [...runs].sort((a, b) => a - b);
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function descriptorDates(trades) {
  const timestamps = trades
    .flatMap(trade => [finiteNumber(trade?.entryTime), finiteNumber(trade?.closedAt)])
    .filter(value => value != null);
  if (!timestamps.length) return { startedAt: null, endedAt: null };
  return {
    startedAt: new Date(Math.min(...timestamps)).toISOString(),
    endedAt: new Date(Math.max(...timestamps)).toISOString(),
  };
}

function batchLabel({ autoRunId, runs, index = 0 }) {
  const first = runs[0] ?? '?';
  const last = runs[runs.length - 1] ?? '?';
  const range = first === last ? `Run ${first}` : `Runs ${first}–${last}`;
  return autoRunId
    ? `${range} · Auto batch${index > 0 ? ` part ${index + 1}` : ''}`
    : `${range} · Legacy/manual batch`;
}

export function buildLongBatchDescriptors(trades, { runLimit = LONG_BATCH_RUN_LIMIT } = {}) {
  const source = dedupeLongTradesForAnalysis(trades);
  const autoGroups = new Map();
  const manual = [];

  for (const trade of source) {
    const autoRunId = trade?.autoRunId != null && String(trade.autoRunId).trim() !== ''
      ? String(trade.autoRunId)
      : null;
    if (!autoRunId) {
      manual.push(trade);
      continue;
    }
    if (!autoGroups.has(autoRunId)) autoGroups.set(autoRunId, []);
    autoGroups.get(autoRunId).push(trade);
  }

  const descriptors = [];

  for (const [autoRunId, groupTrades] of autoGroups.entries()) {
    const runs = sortRuns(new Set(groupTrades.map(trade => normalizeRun(trade?.runId ?? trade?.run)).filter(run => run != null)));
    chunk(runs, runLimit).forEach((runChunk, index) => {
      const runSet = new Set(runChunk.map(String));
      const selected = groupTrades.filter(trade => runSet.has(String(normalizeRun(trade?.runId ?? trade?.run))));
      const dates = descriptorDates(selected);
      descriptors.push({
        id: `auto:${autoRunId}:${index}`,
        autoRunId,
        sourceType: 'AUTO_RUN',
        partIndex: index,
        label: batchLabel({ autoRunId, runs: runChunk, index }),
        runs: runChunk,
        runCount: runChunk.length,
        tradeCount: selected.length,
        completeTwentyRuns: runChunk.length === runLimit,
        ...dates,
      });
    });
  }

  const manualRuns = sortRuns(new Set(manual.map(trade => normalizeRun(trade?.runId ?? trade?.run)).filter(run => run != null)));
  chunk(manualRuns, runLimit).forEach((runChunk, index) => {
    const runSet = new Set(runChunk.map(String));
    const selected = manual.filter(trade => runSet.has(String(normalizeRun(trade?.runId ?? trade?.run))));
    const dates = descriptorDates(selected);
    const first = runChunk[0] ?? 'unknown';
    const last = runChunk[runChunk.length - 1] ?? 'unknown';
    descriptors.push({
      id: `manual:${first}-${last}:${index}`,
      autoRunId: null,
      sourceType: 'MANUAL_OR_LEGACY',
      partIndex: index,
      label: batchLabel({ autoRunId: null, runs: runChunk, index }),
      runs: runChunk,
      runCount: runChunk.length,
      tradeCount: selected.length,
      completeTwentyRuns: runChunk.length === runLimit,
      ...dates,
    });
  });

  return descriptors.sort((left, right) => {
    const leftTime = Date.parse(left.startedAt ?? '') || 0;
    const rightTime = Date.parse(right.startedAt ?? '') || 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return (right.runs[0] ?? 0) - (left.runs[0] ?? 0);
  });
}

export function selectLongBatchTrades(trades, descriptor) {
  if (!descriptor) return [];
  const runSet = new Set((descriptor.runs ?? []).map(String));
  return dedupeLongTradesForAnalysis(trades).filter(trade => {
    const run = normalizeRun(trade?.runId ?? trade?.run);
    if (run == null || !runSet.has(String(run))) return false;
    const autoRunId = trade?.autoRunId != null && String(trade.autoRunId).trim() !== ''
      ? String(trade.autoRunId)
      : null;
    return descriptor.autoRunId ? autoRunId === descriptor.autoRunId : autoRunId == null;
  });
}

function csvCell(value) {
  const string = value == null ? '' : String(value);
  return /[",\n\r]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

function rowsToCsv(headers, rows) {
  return [
    headers.map(csvCell).join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n');
}

const RUN_SUMMARY_HEADERS = Object.freeze([
  'run', 'totalTrades', 'closedTrades', 'activeTrades', 'researchEligibleClosed', 'excludedClosed',
  'gainers', 'losers', 'uniqueSymbols', 'totalFeeAdjustedNormPnlPct', 'avgFeeAdjustedNormPnlPct',
  'feeAdjustedWinRatePct', 'bestFeeAdjustedNormPnlPct', 'worstFeeAdjustedNormPnlPct',
  'stopLossCount', 'profitLockCount', 'trailingExitCount', 'timeoutCount', 'runStopCount',
  'startedAt', 'endedAt',
]);
const EXIT_SUMMARY_HEADERS = Object.freeze([
  'closeReason', 'tradeCount', 'researchEligibleCount', 'avgFeeAdjustedNormPnlPct',
  'totalFeeAdjustedNormPnlPct', 'feeAdjustedWinRatePct',
]);
const SIDE_SUMMARY_HEADERS = Object.freeze([
  'side', 'tradeCount', 'closedCount', 'activeCount', 'researchEligibleCount',
  'avgFeeAdjustedNormPnlPct', 'totalFeeAdjustedNormPnlPct', 'feeAdjustedWinRatePct',
]);
const SIGNAL_SUMMARY_HEADERS = Object.freeze([
  'category', 'signalId', 'matchedTradeCount', 'researchEligibleClosedCount',
  'avgFeeAdjustedNormPnlPct', 'totalFeeAdjustedNormPnlPct', 'feeAdjustedWinRatePct',
  'positiveRunRatePct', 'observedRunCount',
]);

function closeReasonOf(trade) {
  return String(trade?.canonicalCloseReason ?? trade?.closeReason ?? (trade?.closed ? 'UNKNOWN' : 'ACTIVE'));
}

function sideOf(trade) {
  const explicit = String(trade?.leaderboardSide ?? trade?.longParentBucket ?? '').toUpperCase();
  if (explicit.includes('GAINER')) return 'GAINERS';
  if (explicit.includes('LOSER')) return 'LOSERS';
  return explicit || 'UNKNOWN';
}

function isResearchEligible(trade) {
  if (trade?.strategyResearchEligible === false) return false;
  return trade?.finalizationDataQuality !== 'INVALID';
}

function summarizeRun(run, trades) {
  const closed = trades.filter(trade => trade?.closed === true);
  const eligible = closed.filter(isResearchEligible);
  const pnls = eligible.map(longFeeAdjustedNormPnlPct).filter(Number.isFinite);
  const total = pnls.reduce((sum, pnl) => sum + pnl, 0);
  const winners = pnls.filter(pnl => pnl > 0).length;
  const startTimes = trades.map(trade => finiteNumber(trade?.entryTime)).filter(value => value != null);
  const endTimes = trades.flatMap(trade => [finiteNumber(trade?.closedAt), finiteNumber(trade?.entryTime)]).filter(value => value != null);
  const reasons = closed.reduce((result, trade) => {
    const reason = closeReasonOf(trade);
    result[reason] = (result[reason] ?? 0) + 1;
    return result;
  }, {});
  const symbols = new Set(trades.map(trade => trade?.symbol).filter(Boolean));

  return {
    run,
    totalTrades: trades.length,
    closedTrades: closed.length,
    activeTrades: trades.length - closed.length,
    researchEligibleClosed: eligible.length,
    excludedClosed: closed.length - eligible.length,
    gainers: trades.filter(trade => sideOf(trade) === 'GAINERS').length,
    losers: trades.filter(trade => sideOf(trade) === 'LOSERS').length,
    uniqueSymbols: symbols.size,
    totalFeeAdjustedNormPnlPct: Number(total.toFixed(6)),
    avgFeeAdjustedNormPnlPct: pnls.length ? Number((total / pnls.length).toFixed(6)) : null,
    feeAdjustedWinRatePct: pnls.length ? Number(((winners / pnls.length) * 100).toFixed(4)) : null,
    bestFeeAdjustedNormPnlPct: pnls.length ? Math.max(...pnls) : null,
    worstFeeAdjustedNormPnlPct: pnls.length ? Math.min(...pnls) : null,
    stopLossCount: Object.entries(reasons).filter(([key]) => key.includes('STOP') || key === 'SL').reduce((sum, [, value]) => sum + value, 0),
    profitLockCount: reasons.PROFIT_LOCK ?? 0,
    trailingExitCount: reasons.TRAILING_EXIT ?? reasons.TRAIL ?? 0,
    timeoutCount: reasons.TIMEOUT ?? 0,
    runStopCount: (reasons.RUN_STOP ?? 0) + (reasons.APP_SHUTDOWN ?? 0),
    startedAt: startTimes.length ? new Date(Math.min(...startTimes)).toISOString() : null,
    endedAt: endTimes.length ? new Date(Math.max(...endTimes)).toISOString() : null,
  };
}

function summarizeQuality(trades) {
  const counts = {};
  const add = key => { counts[key] = (counts[key] ?? 0) + 1; };
  for (const trade of trades) {
    if (trade?.strategyResearchEligible === false) add(`EXCLUDED:${trade?.strategyResearchExclusionReason ?? 'UNKNOWN'}`);
    const quality = trade?.longFilterDataQuality ?? trade?.finalizationDataQuality;
    if (quality && quality !== 'COMPLETE') add(`QUALITY:${quality}`);
    if (trade?.entrySnapshotCompletenessStatus && trade.entrySnapshotCompletenessStatus !== 'COMPLETE') {
      add(`SNAPSHOT:${trade.entrySnapshotCompletenessStatus}`);
    }
  }
  return Object.entries(counts)
    .map(([issue, count]) => ({ issue, count }))
    .sort((left, right) => right.count - left.count || left.issue.localeCompare(right.issue));
}


function summarizeFieldCoverage(projectedRows, columns = LONG_BATCH_ANALYSIS_COLUMNS) {
  const total = projectedRows.length;
  return columns.map(column => {
    let presentCount = 0;
    for (const row of projectedRows) {
      const value = row[column.key];
      const present = value !== null && value !== undefined && value !== '';
      if (present) presentCount += 1;
    }
    return {
      key: column.key,
      header: column.header,
      presentCount,
      missingCount: total - presentCount,
      coveragePct: total ? Number(((presentCount / total) * 100).toFixed(4)) : null,
    };
  }).sort((left, right) => (left.coveragePct ?? 101) - (right.coveragePct ?? 101) || left.key.localeCompare(right.key));
}

function summarizeExitReasons(trades) {
  const groups = new Map();
  for (const trade of trades.filter(item => item?.closed === true)) {
    const reason = closeReasonOf(trade);
    if (!groups.has(reason)) groups.set(reason, []);
    groups.get(reason).push(trade);
  }
  return [...groups.entries()].map(([closeReason, rows]) => {
    const eligible = rows.filter(isResearchEligible);
    const pnls = eligible.map(longFeeAdjustedNormPnlPct).filter(Number.isFinite);
    const total = pnls.reduce((sum, pnl) => sum + pnl, 0);
    return {
      closeReason,
      tradeCount: rows.length,
      researchEligibleCount: eligible.length,
      avgFeeAdjustedNormPnlPct: pnls.length ? Number((total / pnls.length).toFixed(6)) : null,
      totalFeeAdjustedNormPnlPct: Number(total.toFixed(6)),
      feeAdjustedWinRatePct: pnls.length ? Number((pnls.filter(pnl => pnl > 0).length / pnls.length * 100).toFixed(4)) : null,
    };
  }).sort((left, right) => right.tradeCount - left.tradeCount || left.closeReason.localeCompare(right.closeReason));
}

function summarizeSides(trades) {
  return ['GAINERS', 'LOSERS', 'UNKNOWN'].map(side => {
    const rows = trades.filter(trade => sideOf(trade) === side);
    const closed = rows.filter(trade => trade?.closed === true);
    const eligible = closed.filter(isResearchEligible);
    const pnls = eligible.map(longFeeAdjustedNormPnlPct).filter(Number.isFinite);
    const total = pnls.reduce((sum, pnl) => sum + pnl, 0);
    return {
      side,
      tradeCount: rows.length,
      closedCount: closed.length,
      activeCount: rows.length - closed.length,
      researchEligibleCount: eligible.length,
      avgFeeAdjustedNormPnlPct: pnls.length ? Number((total / pnls.length).toFixed(6)) : null,
      totalFeeAdjustedNormPnlPct: Number(total.toFixed(6)),
      feeAdjustedWinRatePct: pnls.length ? Number((pnls.filter(pnl => pnl > 0).length / pnls.length * 100).toFixed(4)) : null,
    };
  }).filter(row => row.tradeCount > 0);
}

const SIGNAL_ARRAY_FIELDS = Object.freeze([
  ['POSITIVE_COMBO', 'longCombosPositiveMatched'],
  ['ANTI_COMBO', 'longCombosAntiMatched'],
  ['WINNING_SETUP', 'longWinningSetupMatchedIds'],
  ['EVIDENCE_FAMILY', 'positiveEvidenceFamilies'],
  ['NEGATIVE_EVIDENCE_FAMILY', 'negativeEvidenceFamilies'],
]);

function normalizeSignalList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {}
    return value.split(/[|,;]/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function summarizeSignals(trades) {
  const buckets = new Map();
  for (const trade of trades) {
    for (const [category, field] of SIGNAL_ARRAY_FIELDS) {
      for (const signalId of normalizeSignalList(trade?.[field])) {
        const key = `${category}:${signalId}`;
        if (!buckets.has(key)) buckets.set(key, { category, signalId, trades: [] });
        buckets.get(key).trades.push(trade);
      }
    }
  }
  return [...buckets.values()].map(bucket => {
    const closed = bucket.trades.filter(trade => trade?.closed === true && isResearchEligible(trade));
    const pnls = closed.map(longFeeAdjustedNormPnlPct).filter(Number.isFinite);
    const total = pnls.reduce((sum, pnl) => sum + pnl, 0);
    const runs = new Map();
    for (const trade of closed) {
      const run = normalizeRun(trade?.runId ?? trade?.run);
      const pnl = longFeeAdjustedNormPnlPct(trade);
      if (run != null && Number.isFinite(pnl)) runs.set(run, (runs.get(run) ?? 0) + pnl);
    }
    return {
      category: bucket.category,
      signalId: bucket.signalId,
      matchedTradeCount: bucket.trades.length,
      researchEligibleClosedCount: closed.length,
      avgFeeAdjustedNormPnlPct: pnls.length ? Number((total / pnls.length).toFixed(6)) : null,
      totalFeeAdjustedNormPnlPct: Number(total.toFixed(6)),
      feeAdjustedWinRatePct: pnls.length ? Number((pnls.filter(pnl => pnl > 0).length / pnls.length * 100).toFixed(4)) : null,
      positiveRunRatePct: runs.size ? Number(([...runs.values()].filter(value => value > 0).length / runs.size * 100).toFixed(4)) : null,
      observedRunCount: runs.size,
    };
  }).sort((left, right) => right.matchedTradeCount - left.matchedTradeCount || left.signalId.localeCompare(right.signalId));
}

function summarizeObservedVersions(trades) {
  const versionFields = [
    'tradeSchemaVersion',
    'entrySnapshotSchemaVersion',
    'scoreRegistryVersion',
    'filterRegistryVersion',
    'labelRegistryVersion',
    'comboRegistryVersion',
    'antiComboRegistryVersion',
    'winningSetupRegistryVersion',
    'marketContextVersion',
    'exitSystemVersion',
    'feeModelVersion',
    'pnlModelVersion',
  ];
  const result = {};
  for (const field of versionFields) {
    const counts = {};
    for (const trade of trades) {
      const value = trade?.[field];
      if (value == null || value === '') continue;
      counts[String(value)] = (counts[String(value)] ?? 0) + 1;
    }
    result[field] = counts;
  }
  return result;
}

function slugify(value) {
  return String(value ?? 'batch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'batch';
}

export function buildLongBatchAnalysisFiles(trades, descriptor, options = {}) {
  const selectedRaw = options.alreadySelected
    ? dedupeLongTradesForAnalysis(trades)
    : selectLongBatchTrades(trades, descriptor);
  const sideFilter = String(options.sideFilter ?? 'all').toLowerCase();
  const sideSelected = sideFilter === 'all'
    ? selectedRaw
    : selectedRaw.filter(trade => sideOf(trade).toLowerCase() === sideFilter);
  const prepared = prepareLongTradesForExport(sideSelected);
  const researchClean = prepared.filter(trade => trade?.closed === true && isResearchEligible(trade));
  const excluded = prepared.filter(trade => trade?.closed === true && !isResearchEligible(trade));
  const active = prepared.filter(trade => trade?.closed !== true);
  const projectedRows = buildLongTradeJsonRows(prepared, { prepared: true, columns: LONG_BATCH_ANALYSIS_COLUMNS });
  const runs = descriptor?.runs ?? [];
  const runSummaries = runs.map(run => summarizeRun(
    run,
    prepared.filter(trade => normalizeRun(trade?.runId ?? trade?.run) === run),
  ));
  const qualitySummary = summarizeQuality(prepared);
  const generatedAt = new Date().toISOString();
  const slug = slugify(`${descriptor?.autoRunId ?? descriptor?.id}-${runs[0] ?? 'x'}-${runs[runs.length - 1] ?? 'x'}-${sideFilter}`);
  const root = `longlab_${slug}`;
  const masterCsv = buildLongTradeCsvString(prepared, { prepared: true, columns: LONG_BATCH_ANALYSIS_COLUMNS });
  const masterJsonl = projectedRows.map(row => JSON.stringify(row)).join('\n');
  const fieldCoverage = summarizeFieldCoverage(projectedRows);
  const exitSummary = summarizeExitReasons(prepared);
  const sideSummary = summarizeSides(prepared);
  const signalSummary = summarizeSignals(prepared);
  const observedVersions = summarizeObservedVersions(prepared);
  const forensicEvents = prepared.map(buildExceptionalForensicEvent).filter(Boolean);
  const forensicJsonl = forensicEvents.map(event => JSON.stringify(event)).join('\n');

  const batchPnl = prepared
    .filter(trade => trade?.closed === true && isResearchEligible(trade))
    .map(longFeeAdjustedNormPnlPct)
    .filter(Number.isFinite);
  const totalPnl = batchPnl.reduce((sum, value) => sum + value, 0);
  const batchSummary = {
    exportFormatVersion: LONG_BATCH_EXPORT_VERSION,
    tradeExportSchemaVersion: LONG_TRADE_EXPORT_VERSION,
    generatedAt,
    batch: descriptor,
    sideFilter,
    tradeCount: prepared.length,
    closedTradeCount: prepared.filter(trade => trade?.closed === true).length,
    activeTradeCount: prepared.filter(trade => trade?.closed !== true).length,
    researchEligibleClosedCount: researchClean.length,
    excludedClosedCount: excluded.length,
    uniqueTradeCount: new Set(prepared.map(stableTradeId)).size,
    uniqueSymbolCount: new Set(prepared.map(trade => trade?.symbol).filter(Boolean)).size,
    totalFeeAdjustedNormPnlPct: Number(totalPnl.toFixed(6)),
    avgFeeAdjustedNormPnlPct: batchPnl.length ? Number((totalPnl / batchPnl.length).toFixed(6)) : null,
    feeAdjustedWinRatePct: batchPnl.length
      ? Number(((batchPnl.filter(value => value > 0).length / batchPnl.length) * 100).toFixed(4))
      : null,
    runSummaries,
    qualitySummary,
    observedVersions,
  };

  const manifest = {
    format: LONG_BATCH_EXPORT_VERSION,
    purpose: 'Analysis-first LongLAB batch export',
    generatedAt,
    selectedBatch: descriptor,
    sideFilter,
    counts: {
      runs: runs.length,
      trades: prepared.length,
      forensicEvents: forensicEvents.length,
      files: 0,
    },
    telemetryStorageProfile: 'LONG_TELEMETRY_V9_COMPACT',
    canonicalVersions: LONG_RESEARCH_VERSION_STAMP,
    tickDirectionVersion: TICK_DIRECTION_VERSION,
    tickDirectionConfig: TICK_DIRECTION_CONFIG,
    tickDirectionWindowDefinitions: {
      countWindows: TICK_DIRECTION_CONFIG.countWindows,
      timeWindowsMs: TICK_DIRECTION_CONFIG.timeWindowsMs,
      outcomeHorizonsMs: TICK_DIRECTION_CONFIG.outcomeHorizonsMs,
    },
    tickDirectionThresholds: {
      flatThresholdBps: TICK_DIRECTION_CONFIG.flatThresholdBps,
      cleanDirectionEfficiencyMin: TICK_DIRECTION_CONFIG.cleanDirectionEfficiencyMin,
      cleanDirectionDominanceMin: TICK_DIRECTION_CONFIG.cleanDirectionDominanceMin,
      staleAfterMs: TICK_DIRECTION_CONFIG.staleAfterMs,
    },
    tickDirectionNeutralTargetRule: 'max(0.5 bps, entrySpreadPct * 10000 * 0.5)',
    tickDirectionStreamSchemaVersion: TICK_DIRECTION_STREAM_SCHEMA_VERSION,
    files: {
      masterCsv: `${root}/master/trades.csv`,
      masterJsonl: `${root}/master/trades.jsonl`,
      researchCleanCsv: `${root}/research_clean/closed_trades.csv`,
      researchCleanJsonl: `${root}/research_clean/closed_trades.jsonl`,
      excludedCsv: `${root}/excluded/excluded_trades.csv`,
      activeCsv: `${root}/active/open_trades.csv`,
      runSummaryCsv: `${root}/summary/run_summary.csv`,
      batchSummaryJson: `${root}/summary/batch_summary.json`,
      qualitySummaryCsv: `${root}/summary/data_quality_summary.csv`,
      fieldCoverageCsv: `${root}/summary/field_coverage.csv`,
      exitSummaryCsv: `${root}/summary/exit_summary.csv`,
      sideSummaryCsv: `${root}/summary/side_summary.csv`,
      signalSummaryCsv: `${root}/summary/signal_summary.csv`,
      schemaJson: `${root}/schema/columns.json`,
      versionsJson: `${root}/schema/observed_versions.json`,
      analysisContractJson: `${root}/schema/analysis_contract.json`,
      forensicExitEventsJsonl: `${root}/forensics/exit_events.jsonl`,
      perRunDirectory: `${root}/runs/`,
    },
  };

  const files = {
    [`${root}/README_ANALYSIS.md`]: [
      '# LongLAB batch analysis export',
      '',
      `- Batch: ${descriptor?.label ?? descriptor?.id ?? 'Unknown'}`,
      `- Runs: ${runs.join(', ') || 'None'}`,
      `- Run count: ${runs.length}/${LONG_BATCH_RUN_LIMIT}`,
      `- Trades: ${prepared.length}`,
      `- Side filter: ${sideFilter.toUpperCase()}`,
      `- Generated: ${generatedAt}`,
      '',
      '## Recommended analysis order',
      '',
      '1. `summary/batch_summary.json` for the batch headline.',
      '2. `summary/run_summary.csv` for cross-run consistency.',
      '3. `research_clean/closed_trades.csv` for fee-aware strategy research.',
      '4. `summary/signal_summary.csv` for combo/setup/evidence ranking.',
      '5. `master/trades.csv` for the complete operational book.',
      '6. `master/trades.jsonl` for fast Python/streaming ingestion.',
      '7. `runs/run_*.csv` for individual-run inspection.',
      '8. `summary/data_quality_summary.csv` and `field_coverage.csv` before trusting any subgroup.',
      '9. `forensics/exit_events.jsonl` for sparse exceptional lifecycle evidence.',
      '',
      'The master files are deduplicated by trade ID and retain the newest/final state.',
      'The V9 master contract is compact: raw tick histories and duplicate nested objects are excluded from trade rows.',
      'Exceptional lifecycle evidence is persisted sparsely in `forensics/exit_events.jsonl`.',
      'Missing telemetry remains missing; it is not converted to a false rule match.',
      'Research-clean files contain only closed, strategyResearchEligible trades.',
      'Excluded and active records remain available in separate folders for operational auditing.',
    ].join('\n'),
    [`${root}/manifest.json`]: JSON.stringify(manifest, null, 2),
    [`${root}/master/trades.csv`]: masterCsv,
    [`${root}/master/trades.jsonl`]: masterJsonl,
    [`${root}/research_clean/closed_trades.csv`]: buildLongTradeCsvString(researchClean, { prepared: true, columns: LONG_BATCH_ANALYSIS_COLUMNS }),
    [`${root}/research_clean/closed_trades.jsonl`]: buildLongTradeJsonLinesString(researchClean, { prepared: true, columns: LONG_BATCH_ANALYSIS_COLUMNS }),
    [`${root}/excluded/excluded_trades.csv`]: buildLongTradeCsvString(excluded, { prepared: true, columns: LONG_BATCH_ANALYSIS_COLUMNS }),
    [`${root}/active/open_trades.csv`]: buildLongTradeCsvString(active, { prepared: true, columns: LONG_BATCH_ANALYSIS_COLUMNS }),
    [`${root}/forensics/exit_events.jsonl`]: forensicJsonl,
    [`${root}/summary/run_summary.csv`]: rowsToCsv(RUN_SUMMARY_HEADERS, runSummaries),
    [`${root}/summary/batch_summary.json`]: JSON.stringify(batchSummary, null, 2),
    [`${root}/summary/data_quality_summary.csv`]: rowsToCsv(['issue', 'count'], qualitySummary),
    [`${root}/summary/field_coverage.csv`]: rowsToCsv(['key', 'header', 'presentCount', 'missingCount', 'coveragePct'], fieldCoverage),
    [`${root}/summary/exit_summary.csv`]: rowsToCsv(EXIT_SUMMARY_HEADERS, exitSummary),
    [`${root}/summary/side_summary.csv`]: rowsToCsv(SIDE_SUMMARY_HEADERS, sideSummary),
    [`${root}/summary/signal_summary.csv`]: rowsToCsv(SIGNAL_SUMMARY_HEADERS, signalSummary),
    [`${root}/schema/columns.json`]: JSON.stringify({
      exportSchemaVersion: LONG_TRADE_EXPORT_VERSION,
      columns: LONG_BATCH_ANALYSIS_COLUMNS.map(column => ({ key: column.key, header: column.header })),
      omittedHeavyForensicFields: LONG_BATCH_HEAVY_FORENSIC_FIELDS,
      telemetryStorageProfile: 'LONG_TELEMETRY_V9_COMPACT',
      canonicalVersions: LONG_RESEARCH_VERSION_STAMP,
      tickDirectionVersion: TICK_DIRECTION_VERSION,
    }, null, 2),
    [`${root}/schema/observed_versions.json`]: JSON.stringify(observedVersions, null, 2),
    [`${root}/schema/analysis_contract.json`]: JSON.stringify({
      primaryMetric: 'feeAdjustedNormPnlPct',
      researchEligibility: 'closed === true && strategyResearchEligible !== false && finalizationDataQuality !== INVALID',
      deduplication: 'Newest/final state per tradeId/id',
      missingValuePolicy: 'Missing is preserved as missing and is never converted to false',
      payloadPolicy: 'Selected batch only; compact V8 scalar rows with sparse exceptional forensics and manifest-level static metadata',
      runBatchSize: LONG_BATCH_RUN_LIMIT,
      sideFilter,
    }, null, 2),
  };

  const tradesByRun = new Map(runs.map(run => [run, []]));
  for (const trade of prepared) {
    const tradeRun = normalizeRun(trade?.runId ?? trade?.run);
    if (tradesByRun.has(tradeRun)) tradesByRun.get(tradeRun).push(trade);
  }
  for (const run of runs) {
    const runTrades = tradesByRun.get(run) ?? [];
    const runName = String(run).replace(/[^a-zA-Z0-9_-]+/g, '_');
    files[`${root}/runs/run_${runName}.csv`] = buildLongTradeCsvString(runTrades, { prepared: true, columns: LONG_BATCH_ANALYSIS_COLUMNS });
  }

  manifest.counts.files = Object.keys(files).length;
  files[`${root}/manifest.json`] = JSON.stringify(manifest, null, 2);

  return {
    files,
    fileName: `${root}.zip`,
    manifest,
    batchSummary,
  };
}
