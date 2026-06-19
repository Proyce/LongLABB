// â”€â”€â”€ FILTER ANALYTICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Display-only analytics for the Filters tab.
// These functions never affect live entries or candidate selection.

import { getGrossMarginPnlPct, getNetMarginPnlPct, isNetWinner, isFeeFlipped } from "../fees/feeSelectors.js";
import { getLongFilterOutcomePnl } from "./longFilterEngine.js";
import { PNL_METRIC } from "./longFilterConstants.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";

export function computeLockToSlRatio({ profitLockCount, trailCount, slCount }) {
  return parseFloat(((profitLockCount + trailCount) / Math.max(slCount, 1)).toFixed(2));
}

function buildSummary(key, trades, pnls) {
  const n = trades.length;
  const netPnl = pnls.reduce((s, v) => s + v, 0);
  const avgPnl = n ? netPnl / n : 0;
  const sorted = [...pnls].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const medianPnl = n === 0 ? 0 : n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const wins = pnls.filter(p => p > 0).length;
  const sls = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS).length;
  const locks = trades.filter(t => t.closeReason === "PROFIT_LOCK").length;
  const trails = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.TRAILING_EXIT).length;
  return {
    key,
    trades: n,
    netPnl: parseFloat(netPnl.toFixed(2)),
    avgPnl: parseFloat(avgPnl.toFixed(2)),
    medianPnl: parseFloat(medianPnl.toFixed(2)),
    winRate: n ? parseFloat((wins / n * 100).toFixed(1)) : 0,
    slRate: n ? parseFloat((sls / n * 100).toFixed(1)) : 0,
    profitLockRate: n ? parseFloat((locks / n * 100).toFixed(1)) : 0,
    trailRate: n ? parseFloat((trails / n * 100).toFixed(1)) : 0,
    lockToSlRatio: computeLockToSlRatio({ profitLockCount: locks, trailCount: trails, slCount: sls }),
  };
}

function tradeClosedPnl(t, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const { pnlValue, pnlMetricAvailable } = getLongFilterOutcomePnl(t, pnlMetric);
  return pnlMetricAvailable ? pnlValue : null;
}


export function summarizeByField(trades, fieldName, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const groups = {};
  for (const t of trades) {
    const pnl = tradeClosedPnl(t, pnlMetric);
    if (pnl === null) continue;
    const key = String(t[fieldName] ?? "UNKNOWN");
    if (!groups[key]) groups[key] = { trades: [], pnls: [] };
    groups[key].trades.push(t);
    groups[key].pnls.push(pnl);
  }
  return Object.entries(groups)
    .map(([key, { trades, pnls }]) => buildSummary(key, trades, pnls))
    .sort((a, b) => b.trades - a.trades);
}

export function summarizeByArrayField(trades, fieldName, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const groups = {};
  for (const t of trades) {
    const pnl = tradeClosedPnl(t, pnlMetric);
    if (pnl === null) continue;
    const arr = t[fieldName];
    const keys = Array.isArray(arr) && arr.length > 0 ? arr.map(String) : ["NONE"];
    for (const key of keys) {
      if (!groups[key]) groups[key] = { trades: [], pnls: [] };
      groups[key].trades.push(t);
      groups[key].pnls.push(pnl);
    }
  }
  return Object.entries(groups)
    .map(([key, { trades, pnls }]) => buildSummary(key, trades, pnls))
    .sort((a, b) => b.trades - a.trades);
}


const GREEN_PRESSURE_ACTIVE_LABELS = new Set([
  "GREEN_IMPULSE_ACTIVE",
  "IMMEDIATE_GREEN_ACTIVE",
  "GREEN_PRESSURE_WITHOUT_REJECTION",
  "GREEN_PRESSURE_WITH_RSI_ROLLOVER",
]);

export function buildRunFilterSummary(trades, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const byRun = {};
  for (const t of trades) {
    const run = t.run ?? 0;
    if (!byRun[run]) byRun[run] = [];
    byRun[run].push(t);
  }
  return Object.entries(byRun)
    .map(([run, rs]) => {
      // Research metric defaults to fee-adjusted normalized PnL (§21);
      // finalPnlPct is only a backward-compat fallback inside tradeClosedPnl.
      const closed  = rs.filter(t => t.closed !== false && tradeClosedPnl(t, pnlMetric) != null);
      const passes  = closed.filter(t => t.longGateWouldPass === true);
      const fails   = closed.filter(t => t.longGateWouldPass === false);
      const sls     = closed.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS);
      const locks   = closed.filter(t => t.closeReason === "PROFIT_LOCK");
      const trails  = closed.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.TRAILING_EXIT);
      const timeouts = closed.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.TIMEOUT);
      const wins    = closed.filter(t => tradeClosedPnl(t, pnlMetric) > 0);
      const netWins = wins;
      const flips   = closed.filter(t => isFeeFlipped(t));
      const netPnl  = closed.reduce((s, t) => s + tradeClosedPnl(t, pnlMetric), 0);
      const netAfterFeesPnl = closed.reduce((s, t) => s + (tradeClosedPnl(t, pnlMetric)), 0);
      const passNet = passes.reduce((s, t) => s + tradeClosedPnl(t, pnlMetric), 0);
      const failNet = fails.reduce((s, t) => s + tradeClosedPnl(t, pnlMetric), 0);
      return {
        run: Number(run),
        trades: closed.length,
        grossPnl: parseFloat(netPnl.toFixed(2)),
        netPnl: parseFloat(netPnl.toFixed(2)),           // gross alias (preserved for compat)
        netAfterFeesPnl: parseFloat(netAfterFeesPnl.toFixed(2)),
        winRate: closed.length ? parseFloat((wins.length / closed.length * 100).toFixed(1)) : 0,
        netWinRate: closed.length ? parseFloat((netWins.length / closed.length * 100).toFixed(1)) : 0,
        feeFlipCount: flips.length,
        slCount: sls.length,
        profitLockCount: locks.length,
        trailCount: trails.length,
        timeoutCount: timeouts.length,
        lockToSlRatio: computeLockToSlRatio({ profitLockCount: locks.length, trailCount: trails.length, slCount: sls.length }),
        wouldPassCount: passes.length,
        wouldFailCount: fails.length,
        wouldPassNetPnl: parseFloat(passNet.toFixed(2)),
        wouldFailNetPnl: parseFloat(failNet.toFixed(2)),
        wouldPassAvgPnl: passes.length ? parseFloat((passNet / passes.length).toFixed(2)) : 0,
        wouldFailAvgPnl: fails.length ? parseFloat((failNet / fails.length).toFixed(2)) : 0,
        microMomentumCount: closed.filter(t => t.hasLongMicroMomentum === true || t.hasMicroMomentum === true).length,
        greenConfirmCount: closed.filter(t => t.hasGreenConfirmation === true || t.immediateGreenImpulse === true).length,
        greenPressureCount: closed.filter(t => GREEN_PRESSURE_ACTIVE_LABELS.has(t.greenPressureLabel)).length,
        cvdBullCount: closed.filter(t => t.entryCvdLabel === "BULL").length,
        cvdBullOrNeutCount: closed.filter(t => t.entryCvdLabel === "BULL" || t.entryCvdLabel === "NEUT").length,
        loserCount: closed.filter(t => t.longParentBucket === "TOP_LOSER_LONGS").length,
        gainerCount: closed.filter(t => t.longParentBucket === "TOP_GAINER_LONGS").length,
        loserReversalPassCount: closed.filter(t => t.topLoserReversalWouldPass === true).length,
        gainerContinuationPassCount: closed.filter(t => t.topGainerContinuationWouldPass === true).length,
        gainerBlowoffDangerCount: closed.filter(t => (t.topGainerBlowoffRiskScore ?? 0) >= 30).length,
        positiveComboCount: closed.filter(t => (t.longCombosPositiveCount ?? 0) > 0).length,
        antiComboCount: closed.filter(t => (t.longCombosAntiCount ?? 0) > 0).length,
        gainerNegativeProfitLockCount: closed.filter(t => t.negativeProfitLockExit === true).length,
        gainerMfe20Count: closed.filter(t => (t.exitDiagnosticLabels ?? []).includes("MFE20_CAPTURED")).length,
        gainerMfe20GivenBackCount: closed.filter(t => (t.exitDiagnosticLabels ?? []).includes("MFE20_GIVEN_BACK")).length,
      };
    })
    .sort((a, b) => a.run - b.run);
}

export function buildSummaryWithFee(key, trades, pnls) {
  const base = buildSummary(key, trades, pnls);
  const feeDrags = trades.map(t => t.feeDragPct ?? 0);
  const feeAdjPnls = pnls.map((p, i) => p - feeDrags[i]);
  const feeAdjNet = feeAdjPnls.reduce((s, v) => s + v, 0);
  return {
    ...base,
    feeAdjustedNet: parseFloat(feeAdjNet.toFixed(2)),
    feeAdjustedAvg: trades.length ? parseFloat((feeAdjNet / trades.length).toFixed(2)) : 0,
  };
}

export function summarizeByFieldWithFee(trades, fieldName, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const groups = {};
  for (const t of trades) {
    const pnl = tradeClosedPnl(t, pnlMetric);
    if (pnl === null) continue;
    const key = String(t[fieldName] ?? "UNKNOWN");
    if (!groups[key]) groups[key] = { trades: [], pnls: [] };
    groups[key].trades.push(t);
    groups[key].pnls.push(pnl);
  }
  return Object.entries(groups)
    .map(([key, { trades, pnls }]) => buildSummaryWithFee(key, trades, pnls))
    .sort((a, b) => b.trades - a.trades);
}

// â”€â”€â”€ FEE-AWARE ANALYTICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Use stored feeAdjustedMarginPnlPct when available; fall back to feeDrag calc.

function tradeClosedFeeAdjustedPnl(t, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  return tradeClosedPnl(t, pnlMetric);
}

function buildSummaryFeeAware(key, trades, rawPnls, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const base = buildSummary(key, trades, rawPnls);
  const feeAdjPnls = trades.map((t, i) => {
    const fa = tradeClosedFeeAdjustedPnl(t, pnlMetric);
    return fa != null ? fa : rawPnls[i];
  });
  const n          = trades.length;
  const feeAdjNet  = feeAdjPnls.reduce((s, v) => s + v, 0);
  const feeAdjWins = feeAdjPnls.filter(p => p > 0).length;
  const mfes       = trades.map(t => t.mfe ?? 0);
  const maes       = trades.map(t => t.mae ?? 0);
  const locks      = trades.filter(t => t.closeReason === "PROFIT_LOCK").length;
  const floors     = trades.filter(t => t.floorExitEnforced === true).length;
  return {
    ...base,
    feeAdjustedNet:        parseFloat(feeAdjNet.toFixed(2)),
    avgFeeAdjusted:        n ? parseFloat((feeAdjNet / n).toFixed(2)) : 0,
    feeAdjustedWinRate:    n ? parseFloat((feeAdjWins / n * 100).toFixed(1)) : 0,
    avgMfe:                n ? parseFloat((mfes.reduce((s, v) => s + v, 0) / n).toFixed(2)) : 0,
    avgMae:                n ? parseFloat((maes.reduce((s, v) => s + v, 0) / n).toFixed(2)) : 0,
    profitLockRate:        n ? parseFloat((locks  / n * 100).toFixed(1)) : 0,
    floorExitEnforcedRate: n ? parseFloat((floors / n * 100).toFixed(1)) : 0,
  };
}

export function summarizeByFieldFeeAware(trades, fieldName, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const groups = {};
  for (const t of trades) {
    const pnl = tradeClosedPnl(t, pnlMetric);
    if (pnl === null) continue;
    const key = String(t[fieldName] ?? "UNKNOWN");
    if (!groups[key]) groups[key] = { trades: [], pnls: [] };
    groups[key].trades.push(t);
    groups[key].pnls.push(pnl);
  }
  return Object.entries(groups)
    .map(([key, { trades, pnls }]) => buildSummaryFeeAware(key, trades, pnls, pnlMetric))
    .sort((a, b) => b.trades - a.trades);
}

export function summarizeByBoolFieldFeeAware(trades, fieldName, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const groups = {};
  for (const t of trades) {
    const pnl = tradeClosedPnl(t, pnlMetric);
    if (pnl === null) continue;
    const key = t[fieldName] === true ? "true" : t[fieldName] === false ? "false" : "UNKNOWN";
    if (!groups[key]) groups[key] = { trades: [], pnls: [] };
    groups[key].trades.push(t);
    groups[key].pnls.push(pnl);
  }
  return Object.entries(groups)
    .map(([key, { trades, pnls }]) => buildSummaryFeeAware(key, trades, pnls, pnlMetric))
    .sort((a, b) => b.trades - a.trades);
}

function bucketAesScore(score) {
  if (score <= 24)  return "0-24";
  if (score <= 39)  return "25-39";
  if (score <= 54)  return "40-54";
  if (score <= 69)  return "55-69";
  if (score <= 79)  return "70-79";
  if (score <= 89)  return "80-89";
  return "90-100";
}

function bucketAesConfidence(c) {
  if (c >= 85) return "VERY_HIGH_CONFIDENCE";
  if (c >= 70) return "HIGH_CONFIDENCE";
  if (c >= 40) return "MEDIUM_CONFIDENCE";
  return "LOW_CONFIDENCE";
}

function buildV3ScoreBandSummary(trades, pnlMetric) {
  const groups = {};
  for (const t of trades) {
    const pnl = tradeClosedPnl(t, pnlMetric);
    if (pnl === null) continue;
    const key = bucketAesScore(t.absoluteEntryScore ?? 50);
    if (!groups[key]) groups[key] = { trades: [], pnls: [] };
    groups[key].trades.push(t);
    groups[key].pnls.push(pnl);
  }
  const order = ["0-24", "25-39", "40-54", "55-69", "70-79", "80-89", "90-100"];
  return Object.entries(groups)
    .map(([key, { trades: ts, pnls }]) => buildSummaryFeeAware(key, ts, pnls, pnlMetric))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

function buildV3ConfidenceBandSummary(trades, pnlMetric) {
  const groups = {};
  for (const t of trades) {
    const pnl = tradeClosedPnl(t, pnlMetric);
    if (pnl === null) continue;
    const key = bucketAesConfidence(t.absoluteEntryConfidence ?? 0);
    if (!groups[key]) groups[key] = { trades: [], pnls: [] };
    groups[key].trades.push(t);
    groups[key].pnls.push(pnl);
  }
  return Object.entries(groups)
    .map(([key, { trades: ts, pnls }]) => buildSummaryFeeAware(key, ts, pnls, pnlMetric))
    .sort((a, b) => b.trades - a.trades);
}

function buildV3V2Comparison(trades, pnlMetric) {
  const groups = {};
  for (const t of trades) {
    if (t.legacyAbsoluteEntryTierV2 == null || t.absoluteEntryTier == null) continue;
    const pnl = tradeClosedPnl(t, pnlMetric);
    if (pnl === null) continue;
    const key = `${t.legacyAbsoluteEntryTierV2}â†’${t.absoluteEntryTier}`;
    if (!groups[key]) groups[key] = { trades: [], pnls: [] };
    groups[key].trades.push(t);
    groups[key].pnls.push(pnl);
  }
  return Object.entries(groups)
    .map(([key, { trades: ts, pnls }]) => buildSummaryFeeAware(key, ts, pnls, pnlMetric))
    .sort((a, b) => b.trades - a.trades);
}

export function buildAbsoluteEntryScoreAnalytics(trades, pnlMetric = PNL_METRIC.FEE_ADJUSTED_NORMALIZED) {
  const closed = trades.filter(t => tradeClosedPnl(t, pnlMetric) != null);

  // V3 trades are those with the new version field
  const v3Trades = closed.filter(t => typeof t.absoluteEntryScoreVersion === "string" && t.absoluteEntryScoreVersion.startsWith("aes-v3"));

  return {
    // V2 analytics (preserved for historical trades)
    byAbsoluteEntryTier:     summarizeByFieldFeeAware(closed, "absoluteEntryTier", pnlMetric),
    byAbsoluteEntryGrade:    summarizeByFieldFeeAware(closed, "absoluteEntryGrade", pnlMetric),
    byAbsoluteEntryAction:   summarizeByFieldFeeAware(closed, "absoluteEntryAction", pnlMetric),
    bySniperLabel:           summarizeByFieldFeeAware(closed, "sniperLabel", pnlMetric),
    byLoserSniperLabel:      summarizeByFieldFeeAware(closed, "loserSniperLabel", pnlMetric),
    byGainerSniperLabel:     summarizeByFieldFeeAware(closed, "gainerSniperLabel", pnlMetric),
    byIsSniperCandidate:     summarizeByBoolFieldFeeAware(closed, "isSniperCandidate", pnlMetric),
    byIsSuperSniperCandidate: summarizeByBoolFieldFeeAware(closed, "isSuperSniperCandidate", pnlMetric),
    // V3 analytics
    byAbsoluteEntryV3Tier:       summarizeByFieldFeeAware(v3Trades, "absoluteEntryTier", pnlMetric),
    byAbsoluteEntryEligibility:  summarizeByFieldFeeAware(v3Trades, "absoluteEntryEligibility", pnlMetric),
    byAbsoluteEntryConfidenceBand: buildV3ConfidenceBandSummary(v3Trades, pnlMetric),
    byAbsoluteEntryScoreBand:    buildV3ScoreBandSummary(v3Trades, pnlMetric),
    byAbsoluteEntrySide:         summarizeByFieldFeeAware(v3Trades, "absoluteEntrySide", pnlMetric),
    v2VsV3Comparison:            buildV3V2Comparison(closed, pnlMetric),
  };
}

