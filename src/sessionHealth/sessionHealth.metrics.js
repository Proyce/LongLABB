// Session health metrics — normalized fee-aware portfolio calculations
import { computeFeeTelemetry } from "../telemetry/feeTelemetry.js";
import { SESSION_HEALTH_CONFIG } from "./sessionHealth.config.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";

function fin(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export function computeLiveFeeAdjustedNorm(sample) {
  const ep = fin(sample.entryPrice);
  const cp = fin(sample.currentPrice);
  const lv = fin(sample.leverage) || 1;
  if (ep == null || cp == null) return null;
  const rawLiveMarginPct = ((cp - ep) / ep) * 100 * lv;
  const fee = computeFeeTelemetry({ marginPnlPct: rawLiveMarginPct, leverage: lv });
  return fee.feeAdjustedNormPnlPct;
}

export function computeRealizedFeeAdjustedNorm(sample) {
  if (sample.feeAdjustedNormPnlPct != null) return fin(sample.feeAdjustedNormPnlPct);
  const marginPnl = fin(sample.finalPnlPct);
  const lv = fin(sample.leverage) || 1;
  if (marginPnl == null) return null;
  const fee = computeFeeTelemetry({ marginPnlPct: marginPnl, leverage: lv });
  return fee.feeAdjustedNormPnlPct;
}

export function computeSessionMetrics(samples, now, config = SESSION_HEALTH_CONFIG) {
  const active = samples.filter(s => !s.closed);
  const closed = samples.filter(s => s.closed);

  // Rolling recent window: last N closed OR last T minutes, whichever has more trades, capped at max
  const byTime  = closed.filter(s => (now - (s.closedAt ?? s.entryTime)) <= config.recentWindowMs);
  const byCount = closed.slice(-config.recentWindowTrades);
  const recentClosed = (byTime.length >= byCount.length ? byTime : byCount).slice(-config.maxRecentTrades);

  // Live normalized total
  const liveFeeAdjustedNorms = active.map(s => computeLiveFeeAdjustedNorm(s)).filter(v => v != null);
  const liveFeeAdjustedNormTotal = liveFeeAdjustedNorms.reduce((a, b) => a + b, 0);
  const liveFeeAdjustedNormAvg   = liveFeeAdjustedNorms.length
    ? liveFeeAdjustedNormTotal / liveFeeAdjustedNorms.length
    : null;

  // Realized normalized total
  const realizedNorms = closed.map(s => computeRealizedFeeAdjustedNorm(s)).filter(v => v != null);
  const realizedFeeAdjustedNormTotal = realizedNorms.reduce((a, b) => a + b, 0);
  const realizedFeeAdjustedNormAvg   = realizedNorms.length
    ? realizedFeeAdjustedNormTotal / realizedNorms.length
    : null;

  const netFeeAdjustedNormTotal = liveFeeAdjustedNormTotal + realizedFeeAdjustedNormTotal;

  // Active win pct
  const activeWins = liveFeeAdjustedNorms.filter(v => v > 0).length;
  const activeWinPctAfterFees = liveFeeAdjustedNorms.length > 0
    ? activeWins / liveFeeAdjustedNorms.length
    : null;

  // Recent closed stats
  const recentNorms = recentClosed.map(s => computeRealizedFeeAdjustedNorm(s)).filter(v => v != null);
  const recentWins  = recentNorms.filter(v => v > 0);
  const recentLosses = recentNorms.filter(v => v <= 0);
  const recentSlCount = recentClosed.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.STOP_LOSS).length;

  const recentWinRateAfterFees = recentNorms.length > 0 ? recentWins.length / recentNorms.length : null;
  const recentSlRate           = recentClosed.length > 0 ? recentSlCount / recentClosed.length : null;

  const grossProfit = recentWins.reduce((a, b)  => a + b, 0);
  const grossLoss   = recentLosses.reduce((a, b) => a + Math.abs(b), 0);
  const recentProfitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(4)) : null;

  const recentExpectancy = recentNorms.length > 0
    ? Number((recentNorms.reduce((a, b) => a + b, 0) / recentNorms.length).toFixed(4))
    : null;

  // Consecutive losses (most recent closed)
  let consecutiveLosses = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    const norm = computeRealizedFeeAdjustedNorm(closed[i]);
    if (norm != null && norm <= 0) consecutiveLosses++;
    else break;
  }

  // Minutes since last win
  let minutesSinceLastWin = null;
  for (let i = closed.length - 1; i >= 0; i--) {
    const norm = computeRealizedFeeAdjustedNorm(closed[i]);
    if (norm != null && norm > 0) {
      minutesSinceLastWin = (now - (closed[i].closedAt ?? closed[i].entryTime)) / 60_000;
      break;
    }
  }

  // MFE/MAE ratio
  const mfes = recentClosed.map(s => fin(s.mfe)).filter(v => v != null && v > 0);
  const maes = recentClosed.map(s => fin(s.mae)).filter(v => v != null && v > 0);
  const avgMfe = mfes.length ? mfes.reduce((a, b) => a + b, 0) / mfes.length : null;
  const avgMae = maes.length ? maes.reduce((a, b) => a + b, 0) / maes.length : null;
  const recentMfeMaeRatio = avgMae != null && avgMae > 0 && avgMfe != null
    ? Number((avgMfe / avgMae).toFixed(4))
    : null;

  return {
    activeTradeCount:              active.length,
    closedTradeCount:              closed.length,
    recentClosedTradeCount:        recentClosed.length,

    liveFeeAdjustedNormTotal:      Number(liveFeeAdjustedNormTotal.toFixed(4)),
    realizedFeeAdjustedNormTotal:  Number(realizedFeeAdjustedNormTotal.toFixed(4)),
    netFeeAdjustedNormTotal:       Number(netFeeAdjustedNormTotal.toFixed(4)),

    liveFeeAdjustedNormAvg:        liveFeeAdjustedNormAvg   != null ? Number(liveFeeAdjustedNormAvg.toFixed(4))   : null,
    realizedFeeAdjustedNormAvg:    realizedFeeAdjustedNormAvg != null ? Number(realizedFeeAdjustedNormAvg.toFixed(4)) : null,

    activeWinPctAfterFees,
    recentWinRateAfterFees,
    recentSlRate,
    recentProfitFactor,
    recentExpectancy,
    recentMfeMaeRatio,
    consecutiveLosses,
    minutesSinceLastWin:           minutesSinceLastWin != null ? Number(minutesSinceLastWin.toFixed(1)) : null,
  };
}

function classify(value, deadband) {
  if (value == null || !Number.isFinite(value)) return "NEUTRAL";
  if (value > deadband)  return "POSITIVE";
  if (value < -deadband) return "NEGATIVE";
  return "NEUTRAL";
}

export function classifyPnlAxes(metrics, config = SESSION_HEALTH_CONFIG) {
  const { deadbands } = config;
  return {
    liveAxis:     classify(metrics.liveFeeAdjustedNormTotal,     deadbands.live),
    realizedAxis: classify(metrics.realizedFeeAdjustedNormTotal, deadbands.realized),
    netAxis:      classify(metrics.netFeeAdjustedNormTotal,       deadbands.net),
  };
}
