// Per-timeframe indicator computation. Reuses trendTelemetry.js functions.
import {
  computeEmaTelemetry,
  computeAdxDmiTelemetry,
  computeMacdTelemetry,
} from "../telemetry/trendTelemetry.js";
import {
  getClosedKlines,
  computeVwap,
  computeAtrPct,
} from "../marketContext.js";
import { MARKET_REGIME_CONFIG } from "./marketRegime.config.js";
import { classifyDirectionScore } from "./marketRegime.labels.js";

const fin = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const pctDiff = (a, b) => (a != null && b != null && b !== 0) ? Number(((a - b) / b * 100).toFixed(4)) : null;

// ── ATR median for volatility ratio ───────────────────────────────────────────

export function computeAtrRatioToMedian(klines, period = 14, lookback = 50, config = MARKET_REGIME_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  if (closed.length < period + lookback) return null;

  const recent = closed.slice(-(lookback + period));
  const atrs = [];

  for (let i = period; i < recent.length; i++) {
    const window = recent.slice(i - period, i + 1);
    const trs = [];
    for (let j = 1; j < window.length; j++) {
      const high = fin(window[j][2]), low = fin(window[j][3]), prevClose = fin(window[j - 1][4]);
      if (high == null || low == null || prevClose == null) continue;
      trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    if (trs.length >= period) atrs.push(trs.reduce((a, b) => a + b, 0) / trs.length);
  }

  if (!atrs.length) return null;
  const sorted = [...atrs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const current = atrs[atrs.length - 1];
  return median > 0 ? Number((current / median).toFixed(4)) : null;
}

// ── Multi-bar returns ─────────────────────────────────────────────────────────

export function computeMultiBarReturns(klines, config = MARKET_REGIME_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  const closes = closed.map(k => fin(k[4])).filter(v => v != null);
  if (closes.length < 7) return { return1BarPct: null, return3BarPct: null, return6BarPct: null };

  const last  = closes[closes.length - 1];
  const prev1 = closes[closes.length - 2];
  const prev3 = closes[closes.length - 4];
  const prev6 = closes[closes.length - 7];

  return {
    return1BarPct: pctDiff(last, prev1),
    return3BarPct: pctDiff(last, prev3),
    return6BarPct: pctDiff(last, prev6),
  };
}

// ── Range efficiency (directional efficiency of price movement) ────────────────

export function computeRangeEfficiency(klines, lookback = 20, config = MARKET_REGIME_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  if (closed.length < lookback + 1) return null;

  const window = closed.slice(-lookback);
  const opens  = window.map(k => fin(k[1])).filter(v => v != null);
  const closes = window.map(k => fin(k[4])).filter(v => v != null);
  const highs  = window.map(k => fin(k[2])).filter(v => v != null);
  const lows   = window.map(k => fin(k[3])).filter(v => v != null);

  if (opens.length < lookback || closes.length < lookback) return null;

  const netMove    = Math.abs(closes[closes.length - 1] - opens[0]);
  const maxHigh    = Math.max(...highs);
  const minLow     = Math.min(...lows);
  const totalRange = maxHigh - minLow;

  return totalRange > 0 ? Number((netMove / totalRange).toFixed(4)) : 0;
}

// ── Market structure (pivot swing detection) ──────────────────────────────────

export function detectMarketStructure(klines, pivotWindow = 5, config = MARKET_REGIME_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  if (closed.length < pivotWindow * 4) return "UNKNOWN";

  const highs  = closed.map(k => fin(k[2]));
  const lows   = closed.map(k => fin(k[3]));
  const closes = closed.map(k => fin(k[4]));
  const len    = closed.length;

  const pivotHighs = [];
  const pivotLows  = [];

  for (let i = pivotWindow; i < len - pivotWindow; i++) {
    const h = highs[i];
    if (h == null) continue;
    const leftH  = highs.slice(i - pivotWindow, i).filter(v => v != null);
    const rightH = highs.slice(i + 1, i + pivotWindow + 1).filter(v => v != null);
    if (leftH.length && rightH.length && h > Math.max(...leftH) && h > Math.max(...rightH)) {
      pivotHighs.push({ i, price: h });
    }

    const l = lows[i];
    if (l == null) continue;
    const leftL  = lows.slice(i - pivotWindow, i).filter(v => v != null);
    const rightL = lows.slice(i + 1, i + pivotWindow + 1).filter(v => v != null);
    if (leftL.length && rightL.length && l < Math.min(...leftL) && l < Math.min(...rightL)) {
      pivotLows.push({ i, price: l });
    }
  }

  if (pivotHighs.length < 2 && pivotLows.length < 2) return "UNKNOWN";

  const lastTwoPH = pivotHighs.slice(-2);
  const lastTwoPL = pivotLows.slice(-2);

  const hh = lastTwoPH.length === 2 && lastTwoPH[1].price > lastTwoPH[0].price;
  const hl  = lastTwoPL.length === 2 && lastTwoPL[1].price > lastTwoPL[0].price;
  const lh  = lastTwoPH.length === 2 && lastTwoPH[1].price < lastTwoPH[0].price;
  const ll  = lastTwoPL.length === 2 && lastTwoPL[1].price < lastTwoPL[0].price;

  const latestClose    = closes[len - 1];
  const prevStructHigh = lastTwoPH.length ? lastTwoPH[lastTwoPH.length - 1].price : null;
  const prevStructLow  = lastTwoPL.length ? lastTwoPL[lastTwoPL.length - 1].price : null;

  if (hh && hl) {
    if (latestClose != null && prevStructLow != null && latestClose < prevStructLow) return "BEARISH_BREAK_OF_STRUCTURE";
    return "HH_HL";
  }
  if (lh && ll) {
    if (latestClose != null && prevStructHigh != null && latestClose > prevStructHigh) return "BULLISH_BREAK_OF_STRUCTURE";
    return "LH_LL";
  }
  if ((hh && ll) || (lh && hl)) return "RANGE_STRUCTURE";
  if (hh && !hl && ll) return "STRUCTURE_TRANSITION";
  if (lh && !ll && hl) return "STRUCTURE_TRANSITION";

  return "UNKNOWN";
}

// ── Shared trendConfig for reuse ──────────────────────────────────────────────

function makeTrendConfig(config) {
  return {
    useClosedCandlesOnly: config.useClosedCandlesOnly ?? true,
    emaSlopeLookback: 3,
    adxPeriod: 14,
    adxSlopeLookback: 3,
    thresholds: {
      emaSlopeFlatPct:          config.thresholds?.emaSlopeFlatPct ?? 0.03,
      priceNearEmaPct:          0.08,
      adxWeak: 15, adxEmerging: 20, adxStrong: 25, adxVeryStrong: 35,
      dmiBiasMinSpread:         3,
      macdHistogramFlatThreshold: 0.000001,
    },
    minCandles: { ema50: 55, adx14: 35, macd: 40 },
    emaPeriods: [9, 20, 50],
    macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, histogramSlopeLookback: 3 },
  };
}

// ── Direction score per timeframe (sync) ──────────────────────────────────────

export function computeTimeframeDirectionScoreSync({ klines, config = MARKET_REGIME_CONFIG }) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  if (!closed || closed.length < 10) return { score: null, components: {}, label: "UNKNOWN" };

  const closes = closed.map(k => fin(k[4])).filter(v => v != null);
  if (closes.length < 10) return { score: null, components: {}, label: "UNKNOWN" };

  const { return1BarPct, return3BarPct, return6BarPct } = computeMultiBarReturns(klines, config);

  const r1 = return1BarPct ?? 0;
  const r3 = return3BarPct ?? 0;
  const r6 = return6BarPct ?? 0;
  const returnComp = Math.max(-100, Math.min(100, (r1 * 8 + r3 * 5 + r6 * 3) * 2));

  const trendConfig = makeTrendConfig(config);

  const emaTel  = computeEmaTelemetry(klines, null, trendConfig);
  const adxTel  = computeAdxDmiTelemetry(klines, trendConfig);
  const macdTel = computeMacdTelemetry(klines, trendConfig);

  let emaComp = 0;
  if (emaTel.emaStack === "BEARISH_STACK") emaComp = -80;
  else if (emaTel.emaStack === "BULLISH_STACK") emaComp = 80;
  if (emaTel.ema20SlopePct != null) emaComp += Math.max(-30, Math.min(30, emaTel.ema20SlopePct * 20));
  emaComp = Math.max(-100, Math.min(100, emaComp));

  let dmiComp = 0;
  if (adxTel.dmiBias === "BEARISH_DMI") dmiComp = -Math.min(100, (adxTel.diSpread ?? 0) * 3);
  else if (adxTel.dmiBias === "BULLISH_DMI") dmiComp = Math.min(100, (adxTel.diSpread ?? 0) * 3);

  let macdComp = 0;
  const macdState = macdTel.macdHistogramState ?? "";
  if (macdState === "NEGATIVE_EXPANDING")   macdComp = -80;
  else if (macdState === "NEGATIVE_SHRINKING") macdComp = -30;
  else if (macdState === "POSITIVE_EXPANDING") macdComp = 80;
  else if (macdState === "POSITIVE_SHRINKING") macdComp = 30;

  const vwapResult = computeVwap(klines, 20, { useClosedCandlesOnly: true });
  const latestClosed = closed[closed.length - 1];
  const currentPrice = latestClosed ? fin(latestClosed[4]) : null;
  let vwapComp = 0;
  let priceVsVwapPct = null;
  if (vwapResult.vwap != null && currentPrice != null) {
    priceVsVwapPct = Number(((currentPrice - vwapResult.vwap) / vwapResult.vwap * 100).toFixed(4));
    if (priceVsVwapPct < -0.05) vwapComp = -70;
    else if (priceVsVwapPct > 0.05) vwapComp = 70;
  }

  const raw = returnComp * 0.35 + emaComp * 0.25 + dmiComp * 0.15 + macdComp * 0.15 + vwapComp * 0.10;
  const score = Math.max(-100, Math.min(100, Math.round(raw)));

  return {
    score,
    label: classifyDirectionScore(score),
    components: {
      returnComp: Math.round(returnComp),
      emaComp:    Math.round(emaComp),
      dmiComp:    Math.round(dmiComp),
      macdComp:   Math.round(macdComp),
      vwapComp:   Math.round(vwapComp),
    },
    ema9:           emaTel.ema9,
    ema20:          emaTel.ema20,
    ema50:          emaTel.ema50,
    emaStack:       emaTel.emaStack,
    ema20SlopePct:  emaTel.ema20SlopePct,
    ema50SlopePct:  emaTel.ema50SlopePct,
    adx14:          adxTel.adx14,
    plusDi14:       adxTel.plusDi14,
    minusDi14:      adxTel.minusDi14,
    dmiBias:        adxTel.dmiBias,
    adxStrength:    adxTel.adxStrength,
    diSpread:       adxTel.diSpread,
    macdHistogram:       macdTel.macdHistogram,
    macdHistogramDelta:  macdTel.macdHistogramDelta,
    macdHistogramState:  macdTel.macdHistogramState,
    vwap:               vwapResult.vwap,
    priceVsVwapPct,
    priceVsVwapLabel: priceVsVwapPct == null ? "UNKNOWN" : priceVsVwapPct < -0.05 ? "BELOW_VWAP" : priceVsVwapPct > 0.05 ? "ABOVE_VWAP" : "AT_VWAP",
    candleColor:    latestClosed
      ? (fin(latestClosed[4]) > fin(latestClosed[1]) ? "GREEN" : fin(latestClosed[4]) < fin(latestClosed[1]) ? "RED" : "DOJI")
      : "UNKNOWN",
    atrPct:          computeAtrPct(klines, 14, { useClosedCandlesOnly: true }),
    atrRatioToMedian: computeAtrRatioToMedian(klines, 14, 50, config),
    rangeEfficiency:  computeRangeEfficiency(klines, 20, config),
    return1BarPct,
    return3BarPct,
    return6BarPct,
  };
}

export function weightedDirectionScore(timeframeScores, weights) {
  let total = 0;
  let totalWeight = 0;
  for (const [tf, weight] of Object.entries(weights)) {
    const s = timeframeScores[tf]?.score;
    if (s != null && Number.isFinite(s)) {
      total       += s * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight === 0) return null;
  return Math.round(total / totalWeight);
}
