// ─── LONG FILTER ANALYTICS ────────────────────────────────────────────────────
// Fee-aware cohort summary functions for the LongLAB Filters subsystem.
// All analytics are LOG_ONLY / RESEARCH_ONLY.
// Default metric: fee-adjusted normalized PnL. Every cohort obeys the selected metric.

import {
  getGrossMarginPnlPct,
  getNetMarginPnlPct,
  isNetWinner,
  isFeeFlipped,
} from "../fees/feeSelectors.js";
import { PNL_METRIC, LONG_SCOPE, getSampleBadge } from "./longFilterConstants.js";
import { getLongFilterOutcomePnl } from "./longFilterEngine.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";

// ─── CORE PNL SELECTORS ───────────────────────────────────────────────────────

function selectPnl(trade, metric) {
  const { pnlValue, pnlMetricAvailable } = getLongFilterOutcomePnl(trade, metric);
  return pnlMetricAvailable ? pnlValue : null;
}

function closedTrades(trades, metric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  return trades.filter(t => {
    const finalized = t.isFinalOutcome === true || t.closed === true;
    return finalized && selectPnl(t, metric) != null;
  });
}

// ─── MEDIAN HELPER ────────────────────────────────────────────────────────────

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
    : parseFloat(sorted[mid].toFixed(2));
}

// ─── PER-SET / PER-RUN / PER-SESSION CONSISTENCY ─────────────────────────────

function buildConsistencyStats(trades, pnlMetric) {
  const byRun = {};
  const bySession = {};
  const byDataset = {};

  for (const t of trades) {
    const netPnl = selectPnl(t, pnlMetric);
    if (netPnl === null) continue;

    const run = t.run ?? 0;
    if (!byRun[run]) byRun[run] = { pnls: [] };
    byRun[run].pnls.push(netPnl);

    const session = t.sessionId ?? "NO_SESSION";
    if (!bySession[session]) bySession[session] = { pnls: [] };
    bySession[session].pnls.push(netPnl);

    const dataset = t.archiveId ?? t.datasetId ?? "NO_DATASET";
    if (!byDataset[dataset]) byDataset[dataset] = { pnls: [] };
    byDataset[dataset].pnls.push(netPnl);
  }

  const runs = Object.values(byRun);
  const sessions = Object.values(bySession);
  const datasets = Object.values(byDataset);

  const positiveRunCount = runs.filter(r => r.pnls.reduce((s, v) => s + v, 0) > 0).length;
  const positiveSessionCount = sessions.filter(s => s.pnls.reduce((a, v) => a + v, 0) > 0).length;
  const positiveDatasetCount = datasets.filter(d => d.pnls.reduce((a, v) => a + v, 0) > 0).length;

  return {
    runCount: runs.length,
    positiveRuns: positiveRunCount,
    positiveRunRate: runs.length ? parseFloat((positiveRunCount / runs.length * 100).toFixed(1)) : 0,
    sessionCount: sessions.length,
    positiveSessions: positiveSessionCount,
    positiveSessionRate: sessions.length ? parseFloat((positiveSessionCount / sessions.length * 100).toFixed(1)) : 0,
    datasetCount: datasets.length,
    positiveDatasets: positiveDatasetCount,
    positiveDatasetRate: datasets.length ? parseFloat((positiveDatasetCount / datasets.length * 100).toFixed(1)) : 0,
  };
}

// ─── CORE COHORT SUMMARY ──────────────────────────────────────────────────────

function buildCohortRow(key, label, trades, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const n = trades.length;
  if (!n) {
    return {
      key, label, trades: 0,
      grossTotal: 0, grossAvg: 0, grossMedian: 0,
      netAfterFeesTotal: 0, netAfterFeesAvg: 0, netAfterFeesMedian: 0,
      netAfterFeesWinRate: 0, feeFlipCount: 0, feeFlipRate: 0,
      netAfterAllCostsTotal: 0, netAfterAllCostsAvg: 0, netAfterAllCostsMedian: 0,
      netAfterAllCostsWinRate: 0,
      grossProfit: 0, grossLoss: 0, profitFactor: 0, payoffRatio: 0,
      slRate: 0, profitLockRate: 0, trailRate: 0, timeoutRate: 0, lockToSlRatio: 0,
      avgMfe: 0, medianMfe: 0, avgMae: 0, medianMae: 0, mfeGivebackAvg: 0,
      runCount: 0, positiveRuns: 0, positiveRunRate: 0,
      sessionCount: 0, positiveSessions: 0, positiveSessionRate: 0,
      datasetCount: 0, positiveDatasets: 0, positiveDatasetRate: 0,
      loserBucketCount: 0, gainerBucketCount: 0,
      knownCoveragePct: 0, entryFinalCoveragePct: 0,
      sampleBadge: getSampleBadge(0),
      feeCoverageAvailable: false,
    };
  }

  // Gross PnL
  const grossPnls = trades.map(t => getGrossMarginPnlPct(t)).filter(v => v != null);
  const grossTotal = parseFloat(grossPnls.reduce((s, v) => s + v, 0).toFixed(2));
  const grossAvg = grossPnls.length ? parseFloat((grossTotal / grossPnls.length).toFixed(2)) : 0;
  const grossMedian = median(grossPnls);
  const grossWins = grossPnls.filter(p => p > 0);
  const grossLosses = grossPnls.filter(p => p <= 0);
  const grossProfit = parseFloat(grossWins.reduce((s, v) => s + v, 0).toFixed(2));
  const grossLoss = parseFloat(Math.abs(grossLosses.reduce((s, v) => s + v, 0)).toFixed(2));
  const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : null;
  const avgWin = grossWins.length ? grossProfit / grossWins.length : 0;
  const avgLoss = grossLosses.length ? grossLoss / grossLosses.length : 0;
  const payoffRatio = avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : null;

  // Selected research metric. Never substitute another unit when unavailable.
  const netPnls = trades.map(t => selectPnl(t, pnlMetric)).filter(v => v != null);
  const netTotal = parseFloat(netPnls.reduce((s, v) => s + v, 0).toFixed(2));
  const netAvg = netPnls.length ? parseFloat((netTotal / netPnls.length).toFixed(2)) : 0;
  const netMedian = median(netPnls);
  const netWins = netPnls.filter(p => p > 0).length;
  const feeFlips = trades.filter(t => isFeeFlipped(t)).length;
  const metricUnavailableCount = trades.length - netPnls.length;

  // Net after all costs
  const allCostPnls = trades
    .map(t => typeof t.netAfterAllCostsMarginPnlPct === "number" ? t.netAfterAllCostsMarginPnlPct : null)
    .filter(v => v != null);
  const allCostTotal = parseFloat(allCostPnls.reduce((s, v) => s + v, 0).toFixed(2));
  const allCostAvg = allCostPnls.length ? parseFloat((allCostTotal / allCostPnls.length).toFixed(2)) : 0;
  const allCostMedian = median(allCostPnls);
  const allCostWins = allCostPnls.filter(p => p > 0).length;

  // Exit types
  const sls = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS);
  const locks = trades.filter(t => t.closeReason === "PROFIT_LOCK");
  const trails = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.TRAILING_EXIT);
  const timeouts = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.TIMEOUT);
  const lockToSlRatio = parseFloat(((locks.length + trails.length) / Math.max(sls.length, 1)).toFixed(2));

  // MFE / MAE
  const mfeVals = trades.map(t => t.mfe ?? 0);
  const maeVals = trades.map(t => t.mae ?? 0);
  const mfeGivebacks = trades.map(t => (t.mfe ?? 0) - (getGrossMarginPnlPct(t) ?? 0)).filter(v => v >= 0);

  // Bucket split
  const loserBucketCount = trades.filter(t => t.longParentBucket === LONG_SCOPE.TOP_LOSER_LONGS).length;
  const gainerBucketCount = trades.filter(t => t.longParentBucket === LONG_SCOPE.TOP_GAINER_LONGS).length;

  // Coverage
  const knownSnapshotCount = trades.filter(t => t.longFilterSnapshotVersion != null).length;
  const entryFinalCount = trades.filter(t => t.longFilterSnapshotTiming === "ENTRY_FINAL").length;
  const feeCoverageCount = netPnls.length;

  const consistency = buildConsistencyStats(trades, pnlMetric);

  return {
    key,
    label,
    trades: n,
    knownCoveragePct: parseFloat((knownSnapshotCount / n * 100).toFixed(1)),
    entryFinalCoveragePct: parseFloat((entryFinalCount / n * 100).toFixed(1)),
    feeCoverageAvailable: feeCoverageCount > 0,
    selectedPnlMetric: pnlMetric,
    metricAvailableCount: netPnls.length,
    metricUnavailableCount,

    // Gross
    grossTotal,
    grossAvg,
    grossMedian,
    grossProfit,
    grossLoss,
    profitFactor,
    payoffRatio,

    // Net after fees
    netAfterFeesTotal: netTotal,
    netAfterFeesAvg: netAvg,
    netAfterFeesMedian: netMedian,
    netAfterFeesWinRate: netPnls.length ? parseFloat((netWins / netPnls.length * 100).toFixed(1)) : 0,
    feeFlipCount: feeFlips,
    feeFlipRate: n ? parseFloat((feeFlips / n * 100).toFixed(1)) : 0,

    // Net after all costs
    netAfterAllCostsTotal: allCostTotal,
    netAfterAllCostsAvg: allCostAvg,
    netAfterAllCostsMedian: allCostMedian,
    netAfterAllCostsWinRate: allCostPnls.length ? parseFloat((allCostWins / allCostPnls.length * 100).toFixed(1)) : 0,

    // Exit breakdown
    slRate: parseFloat((sls.length / n * 100).toFixed(1)),
    profitLockRate: parseFloat((locks.length / n * 100).toFixed(1)),
    trailRate: parseFloat((trails.length / n * 100).toFixed(1)),
    timeoutRate: parseFloat((timeouts.length / n * 100).toFixed(1)),
    lockToSlRatio,

    // MFE / MAE
    avgMfe: parseFloat((mfeVals.reduce((s, v) => s + v, 0) / n).toFixed(2)),
    medianMfe: median(mfeVals),
    avgMae: parseFloat((maeVals.reduce((s, v) => s + v, 0) / n).toFixed(2)),
    medianMae: median(maeVals),
    mfeGivebackAvg: mfeGivebacks.length ? parseFloat((mfeGivebacks.reduce((s, v) => s + v, 0) / mfeGivebacks.length).toFixed(2)) : 0,

    // Consistency
    ...consistency,

    // Bucket split
    loserBucketCount,
    gainerBucketCount,

    // Sample quality
    sampleBadge: getSampleBadge(n),
  };
}

// ─── SUMMARY BY FIELD ─────────────────────────────────────────────────────────

/**
 * Groups closed trades by a single field value and builds fee-aware cohort rows.
 * Default sort: netAfterFeesTotal descending.
 */
export function summarizeByLongField(trades, fieldName, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const groups = {};
  const closed = closedTrades(trades, pnlMetric);

  for (const t of closed) {
    const key = String(t[fieldName] ?? "UNKNOWN");
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  return Object.entries(groups)
    .map(([key, ts]) => buildCohortRow(key, key, ts, pnlMetric))
    .sort((a, b) => b.netAfterFeesTotal - a.netAfterFeesTotal);
}

/**
 * Groups closed trades by an array field (each element is a separate cohort).
 * Default sort: netAfterFeesTotal descending.
 */
export function summarizeByLongArrayField(trades, fieldName, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const groups = {};
  const closed = closedTrades(trades, pnlMetric);

  for (const t of closed) {
    const arr = t[fieldName];
    const keys = Array.isArray(arr) && arr.length > 0 ? arr.map(String) : ["NONE"];
    for (const key of keys) {
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
  }

  return Object.entries(groups)
    .map(([key, ts]) => buildCohortRow(key, key, ts, pnlMetric))
    .sort((a, b) => b.netAfterFeesTotal - a.netAfterFeesTotal);
}

/**
 * Builds a single aggregate cohort row for all given trades.
 * Used for the "current filter result" overview.
 */
export function buildLongCohortSummary(trades, label = "All", pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const closed = closedTrades(trades, pnlMetric);
  return buildCohortRow("ALL", label, closed, pnlMetric);
}

/**
 * Sorts a cohort summary array by the given key and direction.
 */
export function sortCohortSummary(rows, key = "netAfterFeesTotal", direction = "desc") {
  return [...rows].sort((a, b) => {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    return direction === "desc" ? bv - av : av - bv;
  });
}

// ─── FEE COVERAGE SUMMARY ─────────────────────────────────────────────────────

export function buildFeeCoverageSummary(trades, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const closed = trades.filter(t => t.isFinalOutcome === true || t.closed === true);
  const n = closed.length;
  // Only count canonical fee-adjusted field — no silent feeDrag fallback (spec §15.4)
  const withNet = closed.filter(t => selectPnl(t, pnlMetric) != null).length;
  const withAllCost = closed.filter(t => typeof t.netAfterAllCostsMarginPnlPct === "number").length;
  const feeFlips = closed.filter(t => isFeeFlipped(t)).length;
  return {
    totalClosed: n,
    withNetFeeData: withNet,
    withAllCostData: withAllCost,
    netFeeCoveragePct: n ? parseFloat((withNet / n * 100).toFixed(1)) : 0,
    allCostCoveragePct: n ? parseFloat((withAllCost / n * 100).toFixed(1)) : 0,
    feeFlipCount: feeFlips,
    feeFlipRate: n ? parseFloat((feeFlips / n * 100).toFixed(1)) : 0,
  };
}

// ─── EXPORTS ALSO NEEDED BY FILTERTAB ─────────────────────────────────────────

// Preserve the legacy fee-neutral helpers for run summary (still needed by UI)
export { computeLockToSlRatio } from "./filterAnalytics.js";

// ─── FIELD INFORMATIVENESS AUDIT ─────────────────────────────────────────────

/**
 * Detects constant or near-constant telemetry at cohort/run level. A field is
 * treated as uninformative when one value occupies at least thresholdPct of
 * known records. This is diagnostic only.
 */
export function analyzeFieldInformativeness(trades, field, thresholdPct = 95) {
  const values = trades
    .map(trade => trade?.[field])
    .filter(value => value !== null && value !== undefined && value !== "");
  const counts = new Map();
  for (const value of values) {
    const key = typeof value === "object" ? JSON.stringify(value) : String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const dominantPct = values.length ? Number((dominant[1] / values.length * 100).toFixed(1)) : 0;
  const isInformative = values.length > 0 && counts.size > 1 && dominantPct < thresholdPct;
  return Object.freeze({
    field,
    knownCount: values.length,
    distinctValueCount: counts.size,
    dominantValue: dominant[0],
    dominantPct,
    thresholdPct,
    isInformative,
    status: values.length === 0
      ? "NO_DATA"
      : isInformative ? "INFORMATIVE" : "CONSTANT_OR_NEAR_CONSTANT",
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}

// ─── CURATED WINNING SETUP ANALYTICS ─────────────────────────────────────────

/**
 * Compact, fee-aware metrics used by the curated Winning Setups cards.
 * The input must already be filtered by the canonical engine.
 */
export function buildWinningSetupAnalytics(trades, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const summary = buildLongCohortSummary(trades, "Winning setup", pnlMetric);
  const metricTrades = trades.filter(t => selectPnl(t, pnlMetric) != null);
  const metricPnls = metricTrades.map(t => selectPnl(t, pnlMetric));
  const positive = metricPnls.filter(v => v > 0).reduce((sum, value) => sum + value, 0);
  const negative = Math.abs(metricPnls.filter(v => v < 0).reduce((sum, value) => sum + value, 0));
  const feeAdjustedProfitFactor = negative > 0
    ? parseFloat((positive / negative).toFixed(2))
    : positive > 0 ? null : 0;

  const byBucket = bucket => {
    const bucketTrades = metricTrades.filter(t => t.longParentBucket === bucket);
    const pnls = bucketTrades.map(t => selectPnl(t, pnlMetric));
    const total = pnls.reduce((sum, value) => sum + value, 0);
    return {
      trades: bucketTrades.length,
      avg: bucketTrades.length ? parseFloat((total / bucketTrades.length).toFixed(4)) : null,
      winRate: bucketTrades.length
        ? parseFloat((pnls.filter(value => value > 0).length / bucketTrades.length * 100).toFixed(1))
        : null,
    };
  };

  const keyFields = [
    "longGateScore",
    "longGateTier",
    "longMicroMomentumLabel",
    "longCombosPositiveMatched",
    "longCombosAntiMatched",
  ];
  const coverageRows = trades.map(trade => keyFields.some(field => trade[field] != null));
  const coveragePct = coverageRows.length
    ? parseFloat((coverageRows.filter(Boolean).length / coverageRows.length * 100).toFixed(1))
    : 0;

  const meanField = field => {
    const values = trades.map(trade => Number(trade?.[field])).filter(Number.isFinite);
    return values.length
      ? parseFloat((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
      : null;
  };

  const confidenceInformativeness = analyzeFieldInformativeness(trades, "confidence");

  return {
    ...summary,
    tradeCount: summary.trades,
    metricCount: metricTrades.length,
    total: summary.netAfterFeesTotal,
    avg: summary.netAfterFeesAvg,
    median: summary.netAfterFeesMedian,
    avgFeeAdjustedNormPnl: summary.netAfterFeesAvg,
    totalFeeAdjustedNormPnl: summary.netAfterFeesTotal,
    winRatePct: summary.netAfterFeesWinRate,
    slRatePct: summary.slRate,
    profitFactor: feeAdjustedProfitFactor,
    feeAdjustedProfitFactor,
    positiveSessionCount: summary.positiveSessions,
    negativeSessionCount: Math.max(0, summary.sessionCount - summary.positiveSessions),
    sessionCount: summary.sessionCount,
    positiveRunCount: summary.positiveRuns,
    runCount: summary.runCount,
    topGainer: byBucket(LONG_SCOPE.TOP_GAINER_LONGS),
    topLoser: byBucket(LONG_SCOPE.TOP_LOSER_LONGS),
    dataCoveragePct: coveragePct,
    longAesV1Avg: meanField("longAesScore"),
    longAesV2Avg: meanField("longAesScoreV2Shadow"),
    bestDnaV1Avg: meanField("bestDnaLongScore"),
    bestDnaV2Avg: meanField("bestDnaLongScoreV2Shadow"),
    uncalibratedConfidenceCount: trades.filter(trade =>
      trade.longAesConfidenceCalibrationStatus === "UNCALIBRATED"
    ).length,
    confidenceInformativeness,
  };
}
