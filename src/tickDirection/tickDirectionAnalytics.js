import { getAtrTier } from "./tickDirectionLabels.js";

export const TICK_ACCURACY_HORIZONS = ["1s", "3s", "5s", "10s", "30s", "60s"];

function pct(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row) ?? "UNKNOWN";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

export function summarizeTickPredictionRows(rows) {
  const summary = {};
  for (const horizon of TICK_ACCURACY_HORIZONS) {
    const evaluatedRows = rows.filter(row => row[`marketTickForwardPrice${horizon}`] != null);
    const results = evaluatedRows.map(row => row[`marketTickPredictionResult${horizon}`]).filter(Boolean);
    const correct = results.filter(value => value === "CORRECT").length;
    const wrong = results.filter(value => value === "WRONG").length;
    const directional = correct + wrong;
    const moves = rows.map(row => Number(row[`marketTickForwardMoveBps${horizon}`])).filter(Number.isFinite);
    summary[horizon] = {
      n: results.length,
      coveragePct: pct(evaluatedRows.length, rows.length),
      correctPct: pct(correct, directional),
      wrongPct: pct(wrong, directional),
      neutralTargetPct: pct(results.filter(value => value === "NEUTRAL_TARGET").length, results.length),
      averageForwardMoveBps: moves.length
        ? Number((moves.reduce((sum, value) => sum + value, 0) / moves.length).toFixed(3))
        : null,
    };
  }
  return summary;
}

export function buildTickDirectionAnalytics(samples = []) {
  const rows = samples.filter(sample => sample?.entryTickSnapshotVersion);
  const qualityCounts = rows.reduce((counts, row) => {
    const key = row.entryTickDataQuality ?? "UNKNOWN";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const byAtrTier = [...groupBy(rows, row => row.marketTickAtrTier ?? getAtrTier(row.atrPct)).entries()]
    .map(([atrTier, trades]) => ({ atrTier, trades: trades.length, horizons: summarizeTickPredictionRows(trades) }));
  const byPattern = [...groupBy(rows, row => row.marketTickPrimaryPattern).entries()]
    .map(([pattern, trades]) => ({
      pattern,
      trades: trades.length,
      horizons: summarizeTickPredictionRows(trades),
      winRatePct: pct(trades.filter(row => Number(row.feeAdjustedNormPnlPct) > 0).length,
        trades.filter(row => Number.isFinite(Number(row.feeAdjustedNormPnlPct))).length),
    }))
    .sort((left, right) => right.trades - left.trades);
  const confidenceBuckets = [
    [0, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 89], [90, 100],
  ].map(([min, max]) => {
    const trades = rows.filter(row => {
      const value = Number(row.marketTickDirectionConfidenceScore);
      return Number.isFinite(value) && value >= min && value <= max;
    });
    return { bucket: `${min}-${max}`, trades: trades.length, horizons: summarizeTickPredictionRows(trades) };
  });
  const bySource = [...groupBy(rows, row => row.entryTickCanonicalSource).entries()]
    .map(([source, trades]) => ({ source, trades: trades.length, horizons: summarizeTickPredictionRows(trades) }));
  const byAgreement = [...groupBy(rows, row => row.marketTickTradeBookAgreement3s).entries()]
    .map(([agreement, trades]) => ({ agreement, trades: trades.length, horizons: summarizeTickPredictionRows(trades) }));
  const confusion5s = [...groupBy(rows, row => row.marketTickDirectionVerdict).entries()]
    .map(([prediction, trades]) => ({
      prediction,
      up: trades.filter(row => row.marketTickForwardDirection5s === "UP").length,
      neutral: trades.filter(row => row.marketTickForwardDirection5s === "NEUTRAL").length,
      down: trades.filter(row => row.marketTickForwardDirection5s === "DOWN").length,
      n: trades.filter(row => row.marketTickForwardDirection5s).length,
    }));
  const comparableLegacy = rows.filter(row =>
    row.last3ClosedCandlesDirection &&
    row.marketTickDirection3s &&
    !["INSUFFICIENT", "MIXED", "FLAT"].includes(row.marketTickDirection3s)
  );
  const legacyComparison = {
    comparable: comparableLegacy.length,
    agreement3sPct: pct(
      comparableLegacy.filter(row => row.last3ClosedCandlesDirection === row.marketTickDirection3s).length,
      comparableLegacy.length,
    ),
    reversal3sCount: comparableLegacy.filter(row =>
      (row.last3ClosedCandlesDirection === "UP" && row.marketTickDirection3s === "DOWN") ||
      (row.last3ClosedCandlesDirection === "DOWN" && row.marketTickDirection3s === "UP")
    ).length,
  };
  const hypothesisIds = new Set(rows.flatMap(row => Array.isArray(row.longTickResearchHypothesesMatched)
    ? row.longTickResearchHypothesesMatched
    : []));
  const hypotheses = [...hypothesisIds].map(id => {
    const trades = rows.filter(row => row.longTickResearchHypothesesMatched?.includes?.(id));
    return { id, trades: trades.length, status: trades.length >= 20 ? "VALIDATING" : "EARLY_RESEARCH", horizons: summarizeTickPredictionRows(trades) };
  }).sort((left, right) => right.trades - left.trades);
  return {
    trades: rows.length,
    qualityCounts,
    byAtrTier,
    byPattern,
    confidenceBuckets,
    bySource,
    byAgreement,
    confusion5s,
    legacyComparison,
    hypotheses,
    coveragePct: samples.length ? pct(rows.length, samples.length) : 0,
  };
}
