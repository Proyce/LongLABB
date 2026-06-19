// Market breadth engine — rate-limit-conscious
import { MARKET_REGIME_CONFIG } from "./marketRegime.config.js";
import { classifyBreadthLabel } from "./marketRegime.labels.js";

const { breadth: BREADTH_CFG } = MARKET_REGIME_CONFIG;

function getClosedKlines(klines) {
  if (!Array.isArray(klines)) return [];
  return klines.length > 1 ? klines.slice(0, -1) : [];
}

function fin(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function computeVwap(klines, lookback = 20) {
  const closed = getClosedKlines(klines);
  const window = closed.slice(-lookback);
  if (window.length < 2) return null;
  let num = 0, den = 0;
  for (const k of window) {
    const high = fin(k[2]), low = fin(k[3]), close = fin(k[4]), vol = fin(k[5]);
    if (high == null || low == null || close == null || vol == null) continue;
    const tp = (high + low + close) / 3;
    num += tp * vol; den += vol;
  }
  return den > 0 ? num / den : null;
}

function computeEma(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function computeReturn(klines, bars) {
  const closed = getClosedKlines(klines);
  if (closed.length < bars + 1) return null;
  const current = fin(closed[closed.length - 1]?.[4]);
  const prev    = fin(closed[closed.length - 1 - bars]?.[4]);
  if (current == null || prev == null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function computeAdxBias(klines) {
  const closed = getClosedKlines(klines);
  if (closed.length < 35) return null;
  const period = 14;
  const trs = [], plusDms = [], minusDms = [];
  for (let i = 1; i < closed.length; i++) {
    const H = fin(closed[i][2]), L = fin(closed[i][3]), pH = fin(closed[i-1][2]), pL = fin(closed[i-1][3]), pC = fin(closed[i-1][4]);
    if (!H || !L || !pH || !pL || !pC) continue;
    trs.push(Math.max(H - L, Math.abs(H - pC), Math.abs(L - pC)));
    const up = H - pH, down = pL - L;
    plusDms.push(up > down && up > 0 ? up : 0);
    minusDms.push(down > up && down > 0 ? down : 0);
  }
  if (trs.length < period) return null;
  let sTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let sP  = plusDms.slice(0, period).reduce((a, b) => a + b, 0);
  let sM  = minusDms.slice(0, period).reduce((a, b) => a + b, 0);
  for (let i = period; i < trs.length; i++) {
    sTR = sTR - sTR / period + trs[i];
    sP  = sP  - sP  / period + plusDms[i];
    sM  = sM  - sM  / period + minusDms[i];
  }
  if (!sTR) return null;
  const pDI = (sP / sTR) * 100;
  const mDI = (sM / sTR) * 100;
  return mDI > pDI + 3 ? "BEARISH_DMI" : pDI > mDI + 3 ? "BULLISH_DMI" : "NEUTRAL_DMI";
}

export function computeBreadthMetrics({ symbolKlinesMap5m, symbolKlinesMap15m, computedAt = Date.now(), config = MARKET_REGIME_CONFIG }) {
  const breadthCfg = config.breadth;
  const symbols = Object.keys(symbolKlinesMap5m ?? {}).filter(s => !breadthCfg.excludeSymbols.includes(s));

  if (symbols.length < breadthCfg.minValidSymbols) {
    return {
      validSymbolCount:     symbols.length,
      breadthValidSymbolCount: symbols.length,
      pctRed5m:             null,
      pctRed15m:            null,
      pctBelowVwap5m:       null,
      pctBelowVwap15m:      null,
      pctBelowEma20_15m:    null,
      pctBearishEmaStack15m: null,
      pctBearishDmi5m:      null,
      medianReturn5m:       null,
      medianReturn15m:      null,
      advanceDeclineRatio:  null,
      breadthDirectionScore: null,
      breadth5mUpCount:     null,
      breadth5mDownCount:   null,
      breadth15mUpCount:    null,
      breadth15mDownCount:  null,
      breadthLabel:         "BREADTH_INSUFFICIENT",
      breadthStale:         false,
      breadthFreshness:     "LIVE",
      computedAt,
      symbolsUsed:          symbols,
      warnings:             ["INSUFFICIENT_SYMBOLS"],
      breadthWarnings:      ["INSUFFICIENT_SYMBOLS"],
    };
  }

  let redCount5m = 0, redCount15m = 0;
  let belowVwap5m = 0, belowVwap15m = 0;
  let belowEma20_15m = 0, bearishEmaStack15m = 0, bearishDmi5m = 0;
  const returns5m = [], returns15m = [];
  let advances = 0, declines = 0;
  let valid = 0;

  for (const sym of symbols) {
    const k5  = symbolKlinesMap5m?.[sym];
    const k15 = symbolKlinesMap15m?.[sym];
    if (!k5 || !k15) continue;

    valid++;
    const closed5  = getClosedKlines(k5);
    const closed15 = getClosedKlines(k15);

    // 5m red
    if (closed5.length >= 2) {
      const last = closed5[closed5.length - 1];
      if (fin(last[4]) < fin(last[1])) redCount5m++;
    }

    // 15m red
    if (closed15.length >= 2) {
      const last = closed15[closed15.length - 1];
      if (fin(last[4]) < fin(last[1])) redCount15m++;
    }

    // VWAP position 5m
    const vwap5 = computeVwap(k5, 20);
    if (vwap5 != null && closed5.length) {
      const price = fin(closed5[closed5.length - 1]?.[4]);
      if (price != null && price < vwap5) belowVwap5m++;
    }

    // VWAP position 15m
    const vwap15 = computeVwap(k15, 20);
    if (vwap15 != null && closed15.length) {
      const price = fin(closed15[closed15.length - 1]?.[4]);
      if (price != null && price < vwap15) belowVwap15m++;
    }

    // EMA20 position 15m
    const closes15 = closed15.map(k => fin(k[4])).filter(v => v != null);
    const ema20_15 = computeEma(closes15, 20);
    const ema50_15 = computeEma(closes15, 50);
    if (ema20_15 != null && closes15.length) {
      const price = closes15[closes15.length - 1];
      if (price < ema20_15) belowEma20_15m++;
      if (ema20_15 < ema50_15) bearishEmaStack15m++;
    }

    // Bearish DMI 5m
    const dmiBias5 = computeAdxBias(k5);
    if (dmiBias5 === "BEARISH_DMI") bearishDmi5m++;

    // Returns
    const r5  = computeReturn(k5,  3);
    const r15 = computeReturn(k15, 3);
    if (r5  != null) { returns5m.push(r5);   if (r5  > 0) advances++; else declines++; }
    if (r15 != null) returns15m.push(r15);
  }

  if (valid === 0) {
    return {
      validSymbolCount: 0,
      breadthValidSymbolCount: 0,
      breadthLabel: "BREADTH_INSUFFICIENT",
      breadthDirectionScore: null,
      breadth5mUpCount: null,
      breadth5mDownCount: null,
      breadth15mUpCount: null,
      breadth15mDownCount: null,
      breadthStale: false,
      breadthFreshness: "LIVE",
      computedAt,
      symbolsUsed: symbols,
      warnings: ["NO_VALID_SYMBOLS"],
      breadthWarnings: ["NO_VALID_SYMBOLS"],
    };
  }

  const pct = n => Number((n / valid * 100).toFixed(1));

  returns5m.sort((a, b) => a - b);
  returns15m.sort((a, b) => a - b);
  const median5m  = returns5m.length  ? returns5m[Math.floor(returns5m.length / 2)]   : null;
  const median15m = returns15m.length ? returns15m[Math.floor(returns15m.length / 2)] : null;
  const advDecRatio = declines > 0 ? Number((advances / declines).toFixed(2)) : null;

  // Direction score: negative = bearish breadth (good for shorts)
  const bearPct5m  = redCount5m  / valid;
  const bearPct15m = redCount15m / valid;
  const vwapBear   = belowVwap15m / valid;
  const emaBear    = belowEma20_15m / valid;
  const dmiB       = bearishDmi5m / valid;

  const rawScore = -(
    (bearPct5m  - 0.5) * 60 +
    (bearPct15m - 0.5) * 60 +
    (vwapBear   - 0.5) * 40 +
    (emaBear    - 0.5) * 40 +
    (dmiB       - 0.5) * 40
  ) / 2.4;

  const breadthDirectionScore = Math.max(-100, Math.min(100, Math.round(-rawScore)));
  const breadthLabel = classifyBreadthLabel(breadthDirectionScore);

  return {
    validSymbolCount:     valid,
    breadthValidSymbolCount: valid,
    pctRed5m:             pct(redCount5m),
    pctRed15m:            pct(redCount15m),
    pctBelowVwap5m:       pct(belowVwap5m),
    pctBelowVwap15m:      pct(belowVwap15m),
    pctBelowEma20_15m:    pct(belowEma20_15m),
    pctBearishEmaStack15m: pct(bearishEmaStack15m),
    pctBearishDmi5m:      pct(bearishDmi5m),
    medianReturn5m:       median5m   != null ? Number(median5m.toFixed(4))  : null,
    medianReturn15m:      median15m  != null ? Number(median15m.toFixed(4)) : null,
    advanceDeclineRatio:  advDecRatio,
    breadthDirectionScore,
    breadth5mUpCount:     valid - redCount5m,
    breadth5mDownCount:   redCount5m,
    breadth15mUpCount:    valid - redCount15m,
    breadth15mDownCount:  redCount15m,
    breadthLabel,
    breadthStale:         false,
    breadthFreshness:     "LIVE",
    computedAt,
    symbolsUsed:          symbols.slice(0, valid),
    warnings:             [],
    breadthWarnings:      [],
  };
}
