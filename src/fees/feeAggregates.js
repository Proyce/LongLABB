// ─── FEE AGGREGATES ───────────────────────────────────────────────────────────
// Aggregate fee statistics for runs, sessions, sets, symbols, and leverage.

import {
  getGrossMarginPnlPct,
  getNetMarginPnlPct,
  getTradingFeeMarginPct,
  isGrossWinner,
  isNetWinner,
  isFeeFlipped,
  isClosed,
} from "./feeSelectors.js";

function r(n) { return parseFloat(n.toFixed(4)); }

function baseAggregate(trades) {
  const closed = trades.filter(isClosed);
  const n = closed.length;

  if (n === 0) {
    return {
      tradeCount: 0,
      closedCount: 0,
      grossPnlSum: 0,
      netPnlSum: 0,
      feeSum: 0,
      grossWins: 0,
      netWins: 0,
      grossWinRate: 0,
      netWinRate: 0,
      feeFlipCount: 0,
      avgGrossPnl: 0,
      avgNetPnl: 0,
      avgFeeMarginPct: 0,
      feeBurdenPct: null,
      feeFlipRate: 0,
      feeModelIds: [],
      hasMixedFeeModels: false,
    };
  }

  let grossSum = 0, netSum = 0, feeSum = 0;
  let grossWins = 0, netWins = 0, flips = 0;
  const modelIds = new Set();

  for (const t of closed) {
    const gross = getGrossMarginPnlPct(t) ?? 0;
    const net   = getNetMarginPnlPct(t)   ?? 0;
    const fee   = getTradingFeeMarginPct(t) ?? 0;

    grossSum += gross;
    netSum   += net;
    feeSum   += fee;

    if (isGrossWinner(t)) grossWins++;
    if (isNetWinner(t))   netWins++;
    if (isFeeFlipped(t))  flips++;

    if (t.feeModelId) modelIds.add(t.feeModelId);
  }

  const modelArr = [...modelIds];

  return {
    tradeCount:   n,
    closedCount:  n,
    grossPnlSum:  r(grossSum),
    netPnlSum:    r(netSum),
    feeSum:       r(feeSum),
    grossWins,
    netWins,
    grossWinRate: r(grossWins / n * 100),
    netWinRate:   r(netWins   / n * 100),
    feeFlipCount: flips,
    feeFlipRate:  r(flips / n * 100),
    avgGrossPnl:  r(grossSum / n),
    avgNetPnl:    r(netSum   / n),
    avgFeeMarginPct: r(feeSum / n),
    feeBurdenPct: grossSum > 0 ? r(feeSum / grossSum * 100) : null,
    feeModelIds:  modelArr,
    hasMixedFeeModels: modelArr.length > 1,
    feeModelSummary: modelArr.length > 1 ? "MIXED_FEE_MODE" : (modelArr[0] ?? "UNKNOWN"),
  };
}

export function aggregateTradeFees(trades) {
  return baseAggregate(trades ?? []);
}

export function aggregateRunFees(trades, runId) {
  const filtered = (trades ?? []).filter(t => String(t.run ?? t.runId ?? "") === String(runId));
  return { runId, ...baseAggregate(filtered) };
}

export function aggregateSetFees(trades, setId) {
  const filtered = (trades ?? []).filter(t => String(t.set ?? t.setId ?? "") === String(setId));
  return { setId, ...baseAggregate(filtered) };
}

export function aggregateSessionFees(trades, sessionId) {
  const filtered = (trades ?? []).filter(t => String(t.sessionId ?? "") === String(sessionId));
  return { sessionId, ...baseAggregate(filtered) };
}

export function aggregateSymbolFees(trades) {
  const groups = {};
  for (const t of (trades ?? [])) {
    if (!isClosed(t)) continue;
    const sym = t.symbol ?? "UNKNOWN";
    if (!groups[sym]) groups[sym] = [];
    groups[sym].push(t);
  }
  return Object.entries(groups).map(([symbol, ts]) => ({
    symbol,
    ...baseAggregate(ts),
  })).sort((a, b) => b.tradeCount - a.tradeCount);
}

export function aggregateLeverageFees(trades) {
  const groups = {};
  for (const t of (trades ?? [])) {
    if (!isClosed(t)) continue;
    const lev = String(t.leverage ?? "UNKNOWN");
    if (!groups[lev]) groups[lev] = [];
    groups[lev].push(t);
  }
  return Object.entries(groups).map(([leverage, ts]) => ({
    leverage: Number(leverage) || leverage,
    ...baseAggregate(ts),
  })).sort((a, b) => Number(a.leverage) - Number(b.leverage));
}

/**
 * Build full run fee summaries for a set of trades.
 * Groups by run, returns sorted array.
 */
export function buildRunFeeSummaries(trades) {
  const runs = new Set((trades ?? []).map(t => String(t.run ?? t.runId ?? "0")));
  return [...runs].map(runId => aggregateRunFees(trades, runId))
    .sort((a, b) => Number(a.runId) - Number(b.runId));
}
