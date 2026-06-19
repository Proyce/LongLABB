// ─── LONG FILTER COMPARE MODE ─────────────────────────────────────────────────
// Compares two filter configurations, each evaluated through the REAL registry
// engine (applyLongFilterState). Default metric is feeAdjustedNormPnlPct
// (spec §19/§21). Live Runner fields are never used as entry-time evidence here;
// the metric and stats are outcome fields only.

import { applyLongFilterState } from "./longFilterEngine.js";
import { LONG_FILTER_REGISTRY } from "./longFilterRegistry.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";

const DEFAULT_METRIC_FIELD = "feeAdjustedNormPnlPct";

function tradeId(t) {
  return t.id ?? `${t.symbol}_${t.entryTime}`;
}

function metricValue(t, metricField) {
  const v = t?.[metricField];
  return typeof v === "number" ? v : null;
}

function mean(xs) {
  if (!xs.length) return null;
  return parseFloat((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(4));
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return parseFloat((s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2).toFixed(4));
}

function profitFactor(values) {
  const gains = values.filter(v => v > 0).reduce((s, v) => s + v, 0);
  const losses = Math.abs(values.filter(v => v < 0).reduce((s, v) => s + v, 0));
  if (losses === 0) return gains > 0 ? Infinity : null;
  return parseFloat((gains / losses).toFixed(3));
}

function statsFor(trades, metricField) {
  const values = trades.map(t => metricValue(t, metricField)).filter(v => v != null);
  const feeWins = values.filter(v => v > 0).length;
  const slTrades = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS).length;
  return {
    tradeCount: trades.length,
    avgMetric: mean(values),
    medianMetric: median(values),
    feeWinRatePct: trades.length ? parseFloat((feeWins / trades.length * 100).toFixed(1)) : 0,
    slRatePct: trades.length ? parseFloat((slTrades / trades.length * 100).toFixed(1)) : 0,
    profitFactor: profitFactor(values),
  };
}

function bucketStats(trades, metricField, bucket) {
  const subset = trades.filter(t => t.longParentBucket === bucket);
  return statsFor(subset, metricField);
}

function breakdownBy(trades, field) {
  const out = {};
  for (const t of trades) {
    const key = t?.[field] ?? "UNKNOWN";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

// Positive vs negative SESSIONS — guards against a config looking good only
// because of one exceptional session (review Compare item 8).
function sessionPositivity(trades, metricField) {
  const bySession = {};
  for (const t of trades) {
    const v = metricValue(t, metricField);
    if (v == null) continue;
    const sid = t.sessionId ?? "NO_SESSION";
    (bySession[sid] ??= []).push(v);
  }
  const sessions = Object.values(bySession);
  const positive = sessions.filter(vs => mean(vs) > 0).length;
  return {
    sessionCount: sessions.length,
    positiveSessionCount: positive,
    negativeSessionCount: sessions.length - positive,
  };
}

function sideStats(trades, metricField) {
  return {
    ...statsFor(trades, metricField),
    topGainer: bucketStats(trades, metricField, "TOP_GAINER_LONGS"),
    topLoser:  bucketStats(trades, metricField, "TOP_LOSER_LONGS"),
    ...sessionPositivity(trades, metricField),
    leverageBreakdown:   breakdownBy(trades, "leverage"),
    closeReasonBreakdown: breakdownBy(trades, "closeReason"),
    runStopBreakdown:     breakdownBy(trades.filter(t => ["RUN_STOP", "APP_SHUTDOWN"].includes(t.canonicalCloseReason ?? t.closeReason)), "closeReasonDetail"),
    autoEndBreakdown:    breakdownBy(trades.filter(t => t.legacyCloseReason === "AUTO_END"), "closeReasonDetail"),
    timeoutBreakdown:    breakdownBy(trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.TIMEOUT), "closeReasonDetail"),
    slBreakdown:         breakdownBy(trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS), "closeReasonDetail"),
  };
}

/**
 * Compares configuration A and configuration B over the same trade corpus.
 * Both configurations are evaluated through the real engine.
 *
 * @param {Object[]} trades
 * @param {Object} stateA - filter state for configuration A
 * @param {Object} stateB - filter state for configuration B
 * @param {Object} [opts]
 * @param {string} [opts.metricField=feeAdjustedNormPnlPct]
 * @param {Array}  [opts.registry=LONG_FILTER_REGISTRY]
 */
export function compareFilterConfigurations(trades, stateA, stateB, opts = {}) {
  const metricField = opts.metricField ?? DEFAULT_METRIC_FIELD;
  const registry = opts.registry ?? LONG_FILTER_REGISTRY;

  const resA = applyLongFilterState(trades, stateA, registry);
  const resB = applyLongFilterState(trades, stateB, registry);

  const idsA = new Set(resA.trades.map(tradeId));
  const idsB = new Set(resB.trades.map(tradeId));

  const overlap = [...idsA].filter(id => idsB.has(id));
  const aOnly = [...idsA].filter(id => !idsB.has(id));
  const bOnly = [...idsB].filter(id => !idsA.has(id));

  return {
    metricField,
    a: sideStats(resA.trades, metricField),
    b: sideStats(resB.trades, metricField),
    overlapCount: overlap.length,
    aOnlyCount: aOnly.length,
    bOnlyCount: bOnly.length,
  };
}
