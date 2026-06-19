// ─── AES DISCOVERY ANALYTICS ─────────────────────────────────────────────────
// Fee-aware cohort analytics.  Statistical guardrails included.

import { classifyNConfidence, OUTCOME_LABELS, CONFIDENCE_LABELS } from "./aesDiscoveryLabels.js";
import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";

const RANK_BAND_ORDER = ["TOP_1_25", "RANK_26_50", "RANK_51_100", "RANK_101_200", "RANK_201_PLUS"];
const SCORE_THRESHOLDS = [60, 70, 80, 90];
const SCORE_VARIANTS   = ["aesFull", "aesNoRank", "aesSetupOnly"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function profitFactor(trades) {
  const wins  = trades.filter(t => (t.normFeeAdjustedPnlPct ?? 0) > 0).reduce((s, t) => s + t.normFeeAdjustedPnlPct, 0);
  const losses= trades.filter(t => (t.normFeeAdjustedPnlPct ?? 0) < 0).reduce((s, t) => s + Math.abs(t.normFeeAdjustedPnlPct), 0);
  if (losses === 0) return wins > 0 ? Infinity : null;
  return wins / losses;
}

function cohortMetrics(trades) {
  if (!trades.length) return null;
  const pnls = trades.map(t => t.normFeeAdjustedPnlPct ?? 0);
  const wins = trades.filter(t => (t.normFeeAdjustedPnlPct ?? 0) > 0);
  const sls  = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS);
  const instantSl = trades.filter(t => t.outcomeLabels?.includes(OUTCOME_LABELS.INSTANT_SL_UNDER_1M));
  const mfes = trades.map(t => t.mfe ?? 0);
  const maes = trades.map(t => t.mae ?? 0);
  const post3  = trades.filter(t => t.outcomeLabels?.includes(OUTCOME_LABELS.POST_FEE_3_PLUS));
  const post5  = trades.filter(t => t.outcomeLabels?.includes(OUTCOME_LABELS.POST_FEE_5_PLUS));
  const post10 = trades.filter(t => t.outcomeLabels?.includes(OUTCOME_LABELS.POST_FEE_10_PLUS));

  const nConfidence = classifyNConfidence(trades.length);

  return {
    n: trades.length,
    nConfidence,
    totalFeeAdjPnl:    parseFloat(pnls.reduce((s, v) => s + v, 0).toFixed(4)),
    avgFeeAdjPnl:      parseFloat((avg(pnls) ?? 0).toFixed(4)),
    medianFeeAdjPnl:   parseFloat((median(pnls) ?? 0).toFixed(4)),
    winRate:           parseFloat(((wins.length / trades.length) * 100).toFixed(2)),
    profitFactor:      parseFloat((profitFactor(trades) ?? 0).toFixed(3)),
    slRate:            parseFloat(((sls.length / trades.length) * 100).toFixed(2)),
    instantSlRate:     parseFloat(((instantSl.length / trades.length) * 100).toFixed(2)),
    avgMfe:            parseFloat((avg(mfes) ?? 0).toFixed(4)),
    avgMae:            parseFloat((avg(maes) ?? 0).toFixed(4)),
    post3Rate:         parseFloat(((post3.length / trades.length) * 100).toFixed(2)),
    post5Rate:         parseFloat(((post5.length / trades.length) * 100).toFixed(2)),
    post10Rate:        parseFloat(((post10.length / trades.length) * 100).toFixed(2)),
    positiveRunPct:    null, // computed per-run in full analytics
  };
}

// ── Concentration diagnostics ─────────────────────────────────────────────────

function concentrationDiagnostics(trades) {
  if (!trades.length) return {};

  const bySymbol  = {};
  const bySession = {};
  const pnls = trades.map(t => t.normFeeAdjustedPnlPct ?? 0);
  const totalPnl = pnls.reduce((s, v) => s + v, 0);

  for (const t of trades) {
    bySymbol[t.symbol] = (bySymbol[t.symbol] ?? 0) + (t.normFeeAdjustedPnlPct ?? 0);
    const day = t.entryTime ? new Date(t.entryTime).toISOString().slice(0, 10) : "unknown";
    bySession[day] = (bySession[day] ?? 0) + (t.normFeeAdjustedPnlPct ?? 0);
  }

  const symbolPnls = Object.values(bySymbol).sort((a, b) => b - a);
  const top1Pct    = totalPnl !== 0 ? symbolPnls[0] / totalPnl * 100 : null;
  const top5       = symbolPnls.slice(0, 5).reduce((s, v) => s + v, 0);
  const top5Pct    = totalPnl !== 0 ? top5 / totalPnl * 100 : null;

  const sessionPnls = Object.values(bySession).sort((a, b) => b - a);
  const topSessionPct = totalPnl !== 0 && sessionPnls.length > 0 ? sessionPnls[0] / totalPnl * 100 : null;

  const winningTrades = trades.filter(t => (t.normFeeAdjustedPnlPct ?? 0) > 0);
  const bigWin = winningTrades.sort((a, b) => (b.normFeeAdjustedPnlPct ?? 0) - (a.normFeeAdjustedPnlPct ?? 0))[0];
  const largestWinPct = totalPnl !== 0 && bigWin ? (bigWin.normFeeAdjustedPnlPct ?? 0) / totalPnl * 100 : null;

  const flags = [];
  if (top1Pct != null && Math.abs(top1Pct) > 50)      flags.push("SYMBOL_CONCENTRATION_HIGH");
  if (topSessionPct != null && Math.abs(topSessionPct) > 60) flags.push("TIME_CLUSTER_CONCENTRATION_HIGH");
  if (largestWinPct != null && Math.abs(largestWinPct) > 30) flags.push("CURVE_FIT_RISK_HIGH");

  return {
    topSymbolContributionPct:        top1Pct,
    top5SymbolContributionPct:       top5Pct,
    topSessionContributionPct:       topSessionPct,
    largestWinningTradeContributionPct: largestWinPct,
    concentrationFlags: flags,
  };
}

// ── Rank-band performance ─────────────────────────────────────────────────────

export function computeRankBandPerformance(trades) {
  const result = {};
  for (const band of RANK_BAND_ORDER) {
    for (const side of ["GAINER", "LOSER", "ALL"]) {
      let group = trades.filter(t => t.rankBandAtEntry === band);
      if (side !== "ALL") group = group.filter(t => t.side === side);
      if (!group.length) continue;
      result[`${band}:${side}`] = { band, side, ...cohortMetrics(group) };
    }
  }
  return result;
}

// ── Score-threshold performance ───────────────────────────────────────────────

export function computeScoreThresholdPerformance(trades) {
  const result = {};
  for (const variant of SCORE_VARIANTS) {
    const entryKey = `${variant}AtEntry`;
    for (const threshold of SCORE_THRESHOLDS) {
      for (const side of ["GAINER", "LOSER", "ALL"]) {
        let group = trades.filter(t => (t[entryKey] ?? 0) >= threshold);
        if (side !== "ALL") group = group.filter(t => t.side === side);
        if (!group.length) continue;
        result[`${variant}>=${threshold}:${side}`] = {
          variant, threshold, side,
          ...cohortMetrics(group),
        };
      }
    }
  }
  return result;
}

// ── Early-discovery performance ───────────────────────────────────────────────

export function computeEarlyDiscoveryPerformance(trades) {
  const enteredTop50  = trades.filter(t => t.enteredTop50);
  const enteredTop25  = trades.filter(t => t.enteredTop25);
  const neverTop50    = trades.filter(t => !t.enteredTop50);

  function leadTime(arr, field) {
    const times = arr.map(t => t[field]).filter(v => v != null && v > 0);
    return { median: median(times), avg: avg(times), n: times.length };
  }

  return {
    enteredTop50:  { n: enteredTop50.length, ...cohortMetrics(enteredTop50), leadTimeToTop50: leadTime(enteredTop50, "timeToTop50Ms") },
    enteredTop25:  { n: enteredTop25.length, ...cohortMetrics(enteredTop25), leadTimeToTop25: leadTime(enteredTop25, "timeToTop25Ms") },
    neverTop50:    { n: neverTop50.length,   ...cohortMetrics(neverTop50) },
  };
}

// ── Raw vs confirmed comparison ───────────────────────────────────────────────

export function computeRawVsConfirmedComparison(trades) {
  const raw  = trades.filter(t => t.isRawCohort  && !t.isGoldCohort);
  const gold = trades.filter(t => t.isGoldCohort);
  return {
    rawOnly:    { n: raw.length,  ...cohortMetrics(raw) },
    goldConfirmed: { n: gold.length, ...cohortMetrics(gold) },
  };
}

// ── Stability slices ──────────────────────────────────────────────────────────

export function computeStabilitySlices(trades) {
  const slices = {};

  // By BTC regime
  const regimes = [...new Set(trades.map(t => t.btcRegime ?? "UNKNOWN"))];
  for (const r of regimes) {
    const g = trades.filter(t => (t.btcRegime ?? "UNKNOWN") === r);
    if (g.length > 0) slices[`btcRegime:${r}`] = { sliceType: "btcRegime", key: r, ...cohortMetrics(g) };
  }

  // By UTC hour
  const hours = [...new Set(trades.map(t => t.entryTime ? new Date(t.entryTime).getUTCHours() : null).filter(h => h != null))];
  for (const h of hours) {
    const g = trades.filter(t => t.entryTime && new Date(t.entryTime).getUTCHours() === h);
    if (g.length > 0) slices[`utcHour:${h}`] = { sliceType: "utcHour", key: h, ...cohortMetrics(g) };
  }

  // By calendar day
  const days = [...new Set(trades.map(t => t.entryTime ? new Date(t.entryTime).toISOString().slice(0, 10) : null).filter(Boolean))];
  for (const d of days) {
    const g = trades.filter(t => t.entryTime && new Date(t.entryTime).toISOString().slice(0, 10) === d);
    if (g.length > 0) slices[`calDay:${d}`] = { sliceType: "calDay", key: d, ...cohortMetrics(g) };
  }

  // By side
  for (const side of ["GAINER", "LOSER"]) {
    const g = trades.filter(t => t.side === side);
    if (g.length > 0) slices[`side:${side}`] = { sliceType: "side", key: side, ...cohortMetrics(g) };
  }

  return slices;
}

// ── Full analytics report ─────────────────────────────────────────────────────

export function buildAesDiscoveryAnalyticsReport(shadowTrades, config = AES_DISCOVERY_CONFIG) {
  const closed = shadowTrades.filter(t => t.closed);

  if (!closed.length) {
    return {
      totalClosed: 0,
      rankBandPerformance: {},
      scoreThresholdPerformance: {},
      earlyDiscoveryPerformance: {},
      rawVsConfirmedComparison: {},
      stabilitySlices: {},
      concentration: {},
      nConfidence: classifyNConfidence(0),
    };
  }

  return {
    totalClosed: closed.length,
    overallMetrics: cohortMetrics(closed),
    rankBandPerformance: computeRankBandPerformance(closed),
    scoreThresholdPerformance: computeScoreThresholdPerformance(closed),
    earlyDiscoveryPerformance: computeEarlyDiscoveryPerformance(closed),
    rawVsConfirmedComparison: computeRawVsConfirmedComparison(closed),
    stabilitySlices: computeStabilitySlices(closed),
    concentration: concentrationDiagnostics(closed),
    nConfidence: classifyNConfidence(closed.length),
  };
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function safeCell(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function arrCell(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.join("|");
}

export const DISCOVERY_EVENT_CSV_HEADERS = [
  "discoveryEventId","scannerVersion","scoreVersion","symbol","side","detectedAt",
  "side24hRankAtDetection","rankBandAtDetection","outsideTop25","outsideTop50",
  "outsideTop100","outsideTop200","change24hAtDetection","globalAbsChangeRankAtDetection",
  "prefilterScore","prefilterReasons","aesFull","aesNoRank","aesSetupOnly",
  "aesFullMinusNoRank","aesFullMinusSetupOnly","rankContributionNet","change24hContributionNet",
  "telemetryCoveragePct","telemetryMissingFields","telemetryWarnings","labels","btcContext","ethContext",
];

export function discoveryEventCSVRow(evt) {
  return [
    safeCell(evt.discoveryEventId),  safeCell(evt.scannerVersion),
    safeCell(evt.scoreVersion),       safeCell(evt.symbol),
    safeCell(evt.side),               safeCell(evt.detectedAt),
    safeCell(evt.side24hRankAtDetection), safeCell(evt.rankBandAtDetection),
    safeCell(evt.outsideTop25),       safeCell(evt.outsideTop50),
    safeCell(evt.outsideTop100),      safeCell(evt.outsideTop200),
    safeCell(evt.change24hAtDetection), safeCell(evt.globalAbsChangeRankAtDetection),
    safeCell(evt.prefilterScore),     safeCell(arrCell(evt.prefilterReasons)),
    safeCell(evt.aesFull),            safeCell(evt.aesNoRank),
    safeCell(evt.aesSetupOnly),       safeCell(evt.aesFullMinusNoRank),
    safeCell(evt.aesFullMinusSetupOnly), safeCell(evt.rankContributionNet),
    safeCell(evt.change24hContributionNet),
    safeCell(evt.telemetryCoveragePct), safeCell(arrCell(evt.telemetryMissingFields)),
    safeCell(arrCell(evt.telemetryWarnings)), safeCell(arrCell(evt.labels)),
    safeCell(evt.btcContext ? JSON.stringify(evt.btcContext) : ""),
    safeCell(evt.ethContext ? JSON.stringify(evt.ethContext) : ""),
  ];
}

export const SHADOW_TRADE_CSV_HEADERS = [
  "datasetSource","isShadowTrade","executionMode","orderSubmitted","researchFeature",
  "id","symbol","side","leaderboardSide","entryTime","entryPrice","researchLeverage",
  "closed","closedAt","closeReason","holdMsActual",
  "change24hAtEntry","side24hRankAtEntry","rankBandAtEntry","outsideTop25AtEntry","outsideTop50AtEntry",
  "aesFullAtEntry","aesNoRankAtEntry","aesSetupOnlyAtEntry","aesTriggerVariant","aesTriggerThreshold","aesScoreVersion",
  "telemetryCoveragePctAtEntry","aesEpisodeId","triggerThreshold","triggerScoreVariant",
  "currentSide24hRank","bestSide24hRankReached","worstSide24hRankReached",
  "enteredTop100","enteredTop100At","enteredTop50","enteredTop50At","enteredTop25","enteredTop25At",
  "timeToTop100Ms","timeToTop50Ms","timeToTop25Ms",
  "finalPnlPct","normPnlPct","feeDragPct","feeAdjustedFinalPnlPct","normFeeAdjustedPnlPct",
  "mae","mfe","mfeCaptureRatio","labels","outcomeLabels",
  "atrPct","spreadPct","cvdLabel","candleColorAtEntry","hasRedConfirmation",
  "immediateRedImpulse","immediateGreenImpulse","last3TicksDirection","btcRunDirection","btcRegime",
];

export function shadowTradeCSVRow(t) {
  return [
    safeCell(t.datasetSource), safeCell(t.isShadowTrade), safeCell(t.executionMode),
    safeCell(t.orderSubmitted), safeCell(t.researchFeature),
    safeCell(t.id), safeCell(t.symbol), safeCell(t.side), safeCell(t.leaderboardSide),
    safeCell(t.entryTime), safeCell(t.entryPrice), safeCell(t.researchLeverage),
    safeCell(t.closed), safeCell(t.closedAt), safeCell(t.closeReason), safeCell(t.holdMsActual),
    safeCell(t.change24hAtEntry), safeCell(t.side24hRankAtEntry), safeCell(t.rankBandAtEntry),
    safeCell(t.outsideTop25AtEntry), safeCell(t.outsideTop50AtEntry),
    safeCell(t.aesFullAtEntry), safeCell(t.aesNoRankAtEntry), safeCell(t.aesSetupOnlyAtEntry),
    safeCell(t.aesTriggerVariant), safeCell(t.aesTriggerThreshold), safeCell(t.aesScoreVersion),
    safeCell(t.telemetryCoveragePctAtEntry), safeCell(t.aesEpisodeId),
    safeCell(t.triggerThreshold), safeCell(t.triggerScoreVariant),
    safeCell(t.currentSide24hRank), safeCell(t.bestSide24hRankReached), safeCell(t.worstSide24hRankReached),
    safeCell(t.enteredTop100), safeCell(t.enteredTop100At),
    safeCell(t.enteredTop50),  safeCell(t.enteredTop50At),
    safeCell(t.enteredTop25),  safeCell(t.enteredTop25At),
    safeCell(t.timeToTop100Ms), safeCell(t.timeToTop50Ms), safeCell(t.timeToTop25Ms),
    safeCell(t.finalPnlPct), safeCell(t.normPnlPct), safeCell(t.feeDragPct),
    safeCell(t.feeAdjustedFinalPnlPct), safeCell(t.normFeeAdjustedPnlPct),
    safeCell(t.mae), safeCell(t.mfe), safeCell(t.mfeCaptureRatio),
    safeCell(arrCell(t.labels)), safeCell(arrCell(t.outcomeLabels)),
    safeCell(t.atrPct), safeCell(t.spreadPct), safeCell(t.cvdLabel),
    safeCell(t.candleColorAtEntry), safeCell(t.hasRedConfirmation),
    safeCell(t.immediateRedImpulse), safeCell(t.immediateGreenImpulse),
    safeCell(t.last3TicksDirection), safeCell(t.btcRunDirection), safeCell(t.btcRegime),
  ];
}

export function exportCSV(rows, headers) {
  const lines = [headers.join(","), ...rows.map(r => r.join(","))];
  return lines.join("\n");
}

export function exportJSON(items) {
  return JSON.stringify(items, null, 2);
}
