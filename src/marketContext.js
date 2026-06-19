// BTC market context telemetry.
// This module mirrors entryTelemetry.js: compute a nested snapshot, flatten
// selected fields onto the trade object, and expose CSV headers/row helpers.

export const MARKET_CONTEXT_CONFIG = {
  enabled: true,
  strictMarketContext: false,

  sourceExchange: "binance",
  marketType: "futures",
  btcSymbol: "BTCUSDT",

  refreshMs: 15_000,
  maxContextAgeMs: 30_000,

  useClosedCandlesOnly: true,

  candleLimits: {
    "5m": 60,
    "15m": 60,
    "30m": 60,
    "1h": 80,
    "2h": 80,
    "4h": 80,
  },

  directionThresholds: {
    "5m": 0.08,
    "15m": 0.12,
    "30m": 0.18,
    "1h": 0.25,
    "2h": 0.35,
    "4h": 0.50,
  },

  vwap: {
    lookback15m: 20,
    lookback1h: 20,
    flatThresholdPct: 0.05,
  },

  ema: {
    fastPeriod: 20,
    slowPeriod: 50,
    flatThresholdPct: 0.10,
  },

  atr: {
    period: 14,
  },
};

const n = v => v == null ? null : Number(v);

export function getClosedKlines(klines, useClosedCandlesOnly = true) {
  if (!Array.isArray(klines)) return [];
  if (!useClosedCandlesOnly) return klines;
  return klines.length > 1 ? klines.slice(0, -1) : [];
}

export function latestClosedKline(klines, config = MARKET_CONTEXT_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  return closed.length ? closed[closed.length - 1] : null;
}

export function closeOf(k) {
  return k ? Number(k[4]) : null;
}

export function openOf(k) {
  return k ? Number(k[1]) : null;
}

export function computeChangePct(klines, config = MARKET_CONTEXT_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  if (closed.length < 2) return null;

  const last = closed[closed.length - 1];
  const prev = closed[closed.length - 2];

  const lastClose = Number(last[4]);
  const prevClose = Number(prev[4]);

  if (!prevClose) return null;

  return Number((((lastClose - prevClose) / prevClose) * 100).toFixed(4));
}

export function classifyDirection(changePct, thresholdPct) {
  if (changePct == null || Number.isNaN(changePct)) return "UNKNOWN";

  if (changePct > thresholdPct) return "UP";
  if (changePct < -thresholdPct) return "DOWN";

  return "FLAT";
}

export function classifyCandleColor(klines, config = MARKET_CONTEXT_CONFIG) {
  const k = latestClosedKline(klines, config);
  if (!k) return "UNKNOWN";

  const open = Number(k[1]);
  const close = Number(k[4]);

  if (close > open) return "GREEN";
  if (close < open) return "RED";

  return "DOJI";
}

export function computeVwap(klines, lookback, config = MARKET_CONTEXT_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  const window = closed.slice(-lookback);

  if (window.length < 2) {
    return { vwap: null, warning: "NOT_ENOUGH_CANDLES_FOR_BTC_VWAP" };
  }

  let num = 0;
  let den = 0;

  for (const k of window) {
    const high = Number(k[2]);
    const low = Number(k[3]);
    const close = Number(k[4]);
    const volume = Number(k[5]);

    const typicalPrice = (high + low + close) / 3;

    num += typicalPrice * volume;
    den += volume;
  }

  if (den <= 0) {
    return { vwap: null, warning: "ZERO_VOLUME_FOR_BTC_VWAP" };
  }

  return {
    vwap: Number((num / den).toFixed(8)),
    warning: null,
  };
}

export function classifyVwapPosition(
  price,
  vwap,
  thresholdPct = MARKET_CONTEXT_CONFIG.vwap.flatThresholdPct,
) {
  if (price == null || vwap == null || !vwap) {
    return { priceVsVwapPct: null, label: "UNKNOWN" };
  }

  const pct = Number((((price - vwap) / vwap) * 100).toFixed(4));

  const label =
    pct > thresholdPct ? "ABOVE_VWAP" :
    pct < -thresholdPct ? "BELOW_VWAP" :
    "AT_VWAP";

  return { priceVsVwapPct: pct, label };
}

export function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;

  const k = 2 / (period + 1);

  let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }

  return Number(emaVal.toFixed(8));
}

export function computeEmaSlopePct(closes, period) {
  if (!Array.isArray(closes) || closes.length < period + 2) return null;

  const current = ema(closes, period);
  const previous = ema(closes.slice(0, -1), period);

  if (current == null || previous == null || !previous) return null;

  return Number((((current - previous) / previous) * 100).toFixed(4));
}

export function classifyEmaStructure(
  emaFast,
  emaSlow,
  flatThresholdPct = MARKET_CONTEXT_CONFIG.ema.flatThresholdPct,
) {
  if (emaFast == null || emaSlow == null || !emaSlow) return "UNKNOWN";

  const diffPct = ((emaFast - emaSlow) / emaSlow) * 100;

  if (diffPct > flatThresholdPct) return "BULLISH";
  if (diffPct < -flatThresholdPct) return "BEARISH";

  return "FLAT";
}

export function computeAtrPct(
  klines,
  period = MARKET_CONTEXT_CONFIG.atr.period,
  config = MARKET_CONTEXT_CONFIG,
) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);

  if (closed.length < period + 1) return null;

  const recent = closed.slice(-(period + 1));

  const trs = [];

  for (let i = 1; i < recent.length; i++) {
    const high = Number(recent[i][2]);
    const low = Number(recent[i][3]);
    const prevClose = Number(recent[i - 1][4]);

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );

    trs.push(tr);
  }

  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  const close = Number(recent[recent.length - 1][4]);

  if (!close) return null;

  return Number(((atr / close) * 100).toFixed(4));
}

export function classifyBtcAlignment(direction15m, direction1h, direction2h) {
  const dirs = [direction15m, direction1h, direction2h];

  if (dirs.some(d => d === "UNKNOWN")) return "UNKNOWN";

  const up = dirs.filter(d => d === "UP").length;
  const down = dirs.filter(d => d === "DOWN").length;
  const flat = dirs.filter(d => d === "FLAT").length;

  if (down === 3) return "ALL_DOWN";
  if (down === 2) return "MOSTLY_DOWN";

  if (up === 3) return "ALL_UP";
  if (up === 2) return "MOSTLY_UP";

  if (flat >= 2) return "CHOP";

  return "MIXED";
}

export function classifyBtcRegime({
  alignment,
  priceVsVwap1hLabel,
  emaStructure1h,
}) {
  if (alignment === "ALL_DOWN") {
    return "BTC_STRONG_DOWN";
  }

  if (
    alignment === "MOSTLY_DOWN" &&
    priceVsVwap1hLabel !== "ABOVE_VWAP" &&
    emaStructure1h !== "BULLISH"
  ) {
    return "BTC_WEAK_DOWN";
  }

  if (alignment === "ALL_UP") {
    return "BTC_STRONG_UP";
  }

  if (
    alignment === "MOSTLY_UP" &&
    priceVsVwap1hLabel !== "BELOW_VWAP" &&
    emaStructure1h !== "BEARISH"
  ) {
    return "BTC_WEAK_UP";
  }

  if (alignment === "CHOP") {
    return "BTC_CHOP";
  }

  return "BTC_MIXED";
}

export function computeShortTailwindScore(ctx) {
  let score = 0;

  if (ctx.direction15m === "DOWN") score += 20;
  if (ctx.direction15m === "UP") score -= 20;

  if (ctx.direction1h === "DOWN") score += 30;
  if (ctx.direction1h === "UP") score -= 30;

  if (ctx.direction2h === "DOWN") score += 30;
  if (ctx.direction2h === "UP") score -= 30;

  if (ctx.priceVsVwap1hLabel === "BELOW_VWAP") score += 10;
  if (ctx.priceVsVwap1hLabel === "ABOVE_VWAP") score -= 10;

  if (ctx.emaStructure1h === "BEARISH") score += 10;
  if (ctx.emaStructure1h === "BULLISH") score -= 10;

  return Math.max(-100, Math.min(100, score));
}

export function classifyTradeBias(score) {
  if (score >= 60) return "STRONG_TAILWIND";
  if (score >= 25) return "WEAK_TAILWIND";
  if (score > -25) return "NEUTRAL";
  if (score > -60) return "WEAK_HEADWIND";
  return "STRONG_HEADWIND";
}

export function computeBtcConflictFlags(ctx) {
  const flags = [];

  if (ctx.direction15m === "UP" && ctx.direction1h === "DOWN") {
    flags.push("BTC_15M_UP_1H_DOWN");
  }

  if (ctx.direction15m === "DOWN" && ctx.direction2h === "UP") {
    flags.push("BTC_15M_DOWN_2H_UP");
  }

  if (
    ctx.direction15m === "UP" &&
    ctx.direction1h === "UP" &&
    ctx.direction2h === "UP"
  ) {
    flags.push("BTC_ALL_UP_SHORT_HEADWIND");
  }

  if (
    ctx.direction15m === "DOWN" &&
    ctx.direction1h === "DOWN" &&
    ctx.direction2h === "DOWN"
  ) {
    flags.push("BTC_ALL_DOWN_SHORT_TAILWIND");
  }

  if (ctx.priceVsVwap1hLabel === "ABOVE_VWAP" && ctx.direction1h === "DOWN") {
    flags.push("BTC_1H_DOWN_BUT_ABOVE_VWAP");
  }

  if (ctx.priceVsVwap1hLabel === "BELOW_VWAP" && ctx.direction1h === "UP") {
    flags.push("BTC_1H_UP_BUT_BELOW_VWAP");
  }

  return flags;
}

export function computeMarketContext({
  btcKlinesByInterval,
  source = "binance-futures",
  computedAt = Date.now(),
}, config = MARKET_CONTEXT_CONFIG) {
  const warnings = [];

  const k5m  = btcKlinesByInterval?.["5m"]  ?? null;
  const k15m = btcKlinesByInterval?.["15m"] ?? null;
  const k30m = btcKlinesByInterval?.["30m"] ?? null;
  const k1h  = btcKlinesByInterval?.["1h"]  ?? null;
  const k2h  = btcKlinesByInterval?.["2h"]  ?? null;
  const k4h  = btcKlinesByInterval?.["4h"]  ?? null;

  const latest1h = latestClosedKline(k1h, config);
  const price = latest1h ? Number(latest1h[4]) : null;

  const change5mPct  = computeChangePct(k5m, config);
  const change15mPct = computeChangePct(k15m, config);
  const change30mPct = computeChangePct(k30m, config);
  const change1hPct  = computeChangePct(k1h, config);
  const change2hPct  = computeChangePct(k2h, config);
  const change4hPct  = computeChangePct(k4h, config);

  const direction5m  = classifyDirection(change5mPct,  config.directionThresholds["5m"]);
  const direction15m = classifyDirection(change15mPct, config.directionThresholds["15m"]);
  const direction30m = classifyDirection(change30mPct, config.directionThresholds["30m"]);
  const direction1h  = classifyDirection(change1hPct,  config.directionThresholds["1h"]);
  const direction2h  = classifyDirection(change2hPct,  config.directionThresholds["2h"]);
  const direction4h  = classifyDirection(change4hPct,  config.directionThresholds["4h"]);

  const candleColor5m  = classifyCandleColor(k5m, config);
  const candleColor15m = classifyCandleColor(k15m, config);
  const candleColor30m = classifyCandleColor(k30m, config);
  const candleColor1h  = classifyCandleColor(k1h, config);
  const candleColor2h  = classifyCandleColor(k2h, config);
  const candleColor4h  = classifyCandleColor(k4h, config);

  const vwap15mResult = computeVwap(k15m, config.vwap.lookback15m, config);
  const vwap1hResult  = computeVwap(k1h,  config.vwap.lookback1h,  config);

  if (vwap15mResult.warning) warnings.push(vwap15mResult.warning);
  if (vwap1hResult.warning) warnings.push(vwap1hResult.warning);

  const vwap15m = vwap15mResult.vwap;
  const vwap1h  = vwap1hResult.vwap;

  const vwap15mPos = classifyVwapPosition(price, vwap15m, config.vwap.flatThresholdPct);
  const vwap1hPos  = classifyVwapPosition(price, vwap1h,  config.vwap.flatThresholdPct);

  const closes15m = getClosedKlines(k15m, config.useClosedCandlesOnly).map(k => Number(k[4]));
  const closes1h  = getClosedKlines(k1h,  config.useClosedCandlesOnly).map(k => Number(k[4]));
  const closes2h  = getClosedKlines(k2h,  config.useClosedCandlesOnly).map(k => Number(k[4]));

  const ema20_15m = ema(closes15m, 20);
  const ema50_15m = ema(closes15m, 50);
  const ema20_1h  = ema(closes1h,  20);
  const ema50_1h  = ema(closes1h,  50);
  const ema20_2h  = ema(closes2h,  20);
  const ema50_2h  = ema(closes2h,  50);

  const emaSlope15mPct = computeEmaSlopePct(closes15m, 20);
  const emaSlope1hPct  = computeEmaSlopePct(closes1h,  20);
  const emaSlope2hPct  = computeEmaSlopePct(closes2h,  20);

  const emaStructure15m = classifyEmaStructure(ema20_15m, ema50_15m, config.ema.flatThresholdPct);
  const emaStructure1h  = classifyEmaStructure(ema20_1h,  ema50_1h,  config.ema.flatThresholdPct);
  const emaStructure2h  = classifyEmaStructure(ema20_2h,  ema50_2h,  config.ema.flatThresholdPct);

  const atrPct15m = computeAtrPct(k15m, config.atr.period, config);
  const atrPct1h  = computeAtrPct(k1h,  config.atr.period, config);
  const atrPct2h  = computeAtrPct(k2h,  config.atr.period, config);

  const baseBtc = {
    symbol: "BTCUSDT",
    marketType: "FUTURES",
    price,
    computedAt,

    change5mPct,
    change15mPct,
    change30mPct,
    change1hPct,
    change2hPct,
    change4hPct,

    direction5m,
    direction15m,
    direction30m,
    direction1h,
    direction2h,
    direction4h,

    candleColor5m,
    candleColor15m,
    candleColor30m,
    candleColor1h,
    candleColor2h,
    candleColor4h,

    vwap15m,
    vwap1h,
    priceVsVwap15mPct: vwap15mPos.priceVsVwapPct,
    priceVsVwap1hPct: vwap1hPos.priceVsVwapPct,
    priceVsVwap15mLabel: vwap15mPos.label,
    priceVsVwap1hLabel: vwap1hPos.label,

    ema20_15m,
    ema50_15m,
    ema20_1h,
    ema50_1h,
    ema20_2h,
    ema50_2h,

    emaSlope15mPct,
    emaSlope1hPct,
    emaSlope2hPct,

    emaStructure15m,
    emaStructure1h,
    emaStructure2h,

    atrPct15m,
    atrPct1h,
    atrPct2h,
  };

  const alignment = classifyBtcAlignment(direction15m, direction1h, direction2h);

  const regime = classifyBtcRegime({
    alignment,
    priceVsVwap1hLabel: baseBtc.priceVsVwap1hLabel,
    emaStructure1h,
  });

  const tempForScore = {
    ...baseBtc,
    alignment,
    regime,
  };

  const shortTailwindScore = computeShortTailwindScore(tempForScore);
  const longTailwindScore = -shortTailwindScore;

  const shortBias = classifyTradeBias(shortTailwindScore);
  const longBias = classifyTradeBias(longTailwindScore);

  const btc = {
    ...baseBtc,
    alignment,
    regime,
    shortBias,
    longBias,
    shortTailwindScore,
    longTailwindScore,
    conflictFlags: computeBtcConflictFlags({
      ...baseBtc,
      alignment,
      regime,
      shortBias,
      longBias,
      shortTailwindScore,
      longTailwindScore,
    }),
    warnings,
  };

  const stale = price == null || alignment === "UNKNOWN" || regime === "UNKNOWN";
  const staleReason = stale ? "BTC_CONTEXT_INCOMPLETE" : null;

  return {
    version: "market-context-v1",
    computedAt,
    source,
    stale,
    staleReason,
    btc,
  };
}

export function flattenMarketContext(snapshot) {
  const btc = snapshot?.btc;

  if (!btc) {
    return {
      ...MARKET_CONTEXT_DEFAULTS,
      marketContext: snapshot ?? null,
      btcContextStale: snapshot?.stale ?? true,
      btcContextStaleReason: snapshot?.staleReason ?? "BTC_CONTEXT_NOT_COMPUTED",
    };
  }

  return {
    marketContext: snapshot,

    btcPrice: btc.price,

    btcChange5mPct: btc.change5mPct,
    btcChange15mPct: btc.change15mPct,
    btcChange30mPct: btc.change30mPct,
    btcChange1hPct: btc.change1hPct,
    btcChange2hPct: btc.change2hPct,
    btcChange4hPct: btc.change4hPct,

    btcDirection5m: btc.direction5m,
    btcDirection15m: btc.direction15m,
    btcDirection30m: btc.direction30m,
    btcDirection1h: btc.direction1h,
    btcDirection2h: btc.direction2h,
    btcDirection4h: btc.direction4h,

    btcCandleColor15m: btc.candleColor15m,
    btcCandleColor1h: btc.candleColor1h,
    btcCandleColor2h: btc.candleColor2h,

    btcPriceVsVwap15mPct: btc.priceVsVwap15mPct,
    btcPriceVsVwap1hPct: btc.priceVsVwap1hPct,
    btcPriceVsVwap15mLabel: btc.priceVsVwap15mLabel,
    btcPriceVsVwap1hLabel: btc.priceVsVwap1hLabel,

    btcEmaSlope15mPct: btc.emaSlope15mPct,
    btcEmaSlope1hPct: btc.emaSlope1hPct,
    btcEmaSlope2hPct: btc.emaSlope2hPct,

    btcEmaStructure15m: btc.emaStructure15m,
    btcEmaStructure1h: btc.emaStructure1h,
    btcEmaStructure2h: btc.emaStructure2h,

    btcAtrPct15m: btc.atrPct15m,
    btcAtrPct1h: btc.atrPct1h,
    btcAtrPct2h: btc.atrPct2h,

    btcRegime: btc.regime,
    btcShortBias: btc.shortBias,
    btcLongBias: btc.longBias,
    btcShortTailwindScore: btc.shortTailwindScore,
    btcLongTailwindScore: btc.longTailwindScore,
    btcAlignment: btc.alignment,

    btcConflictFlags: btc.conflictFlags,
    btcWarnings: btc.warnings,
    btcContextStale: snapshot.stale,
    btcContextStaleReason: snapshot.staleReason,
  };
}

export const MARKET_CONTEXT_DEFAULTS = {
  marketContext: null,

  btcPrice: null,

  btcChange5mPct: null,
  btcChange15mPct: null,
  btcChange30mPct: null,
  btcChange1hPct: null,
  btcChange2hPct: null,
  btcChange4hPct: null,

  btcDirection5m: "UNKNOWN",
  btcDirection15m: "UNKNOWN",
  btcDirection30m: "UNKNOWN",
  btcDirection1h: "UNKNOWN",
  btcDirection2h: "UNKNOWN",
  btcDirection4h: "UNKNOWN",

  btcCandleColor15m: "UNKNOWN",
  btcCandleColor1h: "UNKNOWN",
  btcCandleColor2h: "UNKNOWN",

  btcPriceVsVwap15mPct: null,
  btcPriceVsVwap1hPct: null,
  btcPriceVsVwap15mLabel: "UNKNOWN",
  btcPriceVsVwap1hLabel: "UNKNOWN",

  btcEmaSlope15mPct: null,
  btcEmaSlope1hPct: null,
  btcEmaSlope2hPct: null,

  btcEmaStructure15m: "UNKNOWN",
  btcEmaStructure1h: "UNKNOWN",
  btcEmaStructure2h: "UNKNOWN",

  btcAtrPct15m: null,
  btcAtrPct1h: null,
  btcAtrPct2h: null,

  btcRegime: "UNKNOWN",
  btcShortBias: "UNKNOWN",
  btcLongBias: "UNKNOWN",
  btcShortTailwindScore: 0,
  btcLongTailwindScore: 0,
  btcAlignment: "UNKNOWN",

  btcConflictFlags: [],
  btcWarnings: [],
  btcContextStale: true,
  btcContextStaleReason: "BTC_CONTEXT_NOT_COMPUTED",
};

export function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function pipeSeparated(arr) {
  if (!arr || arr.length === 0) return "";
  return arr.map(x => String(x).replace(/\|/g, " ")).join("|");
}

export const MARKET_CONTEXT_CSV_HEADERS = [
  "btcPrice",

  "btcChange5mPct",
  "btcChange15mPct",
  "btcChange30mPct",
  "btcChange1hPct",
  "btcChange2hPct",
  "btcChange4hPct",

  "btcDirection5m",
  "btcDirection15m",
  "btcDirection30m",
  "btcDirection1h",
  "btcDirection2h",
  "btcDirection4h",

  "btcCandleColor15m",
  "btcCandleColor1h",
  "btcCandleColor2h",

  "btcPriceVsVwap15mPct",
  "btcPriceVsVwap1hPct",
  "btcPriceVsVwap15mLabel",
  "btcPriceVsVwap1hLabel",

  "btcEmaSlope15mPct",
  "btcEmaSlope1hPct",
  "btcEmaSlope2hPct",

  "btcEmaStructure15m",
  "btcEmaStructure1h",
  "btcEmaStructure2h",

  "btcAtrPct15m",
  "btcAtrPct1h",
  "btcAtrPct2h",

  "btcRegime",
  "btcShortBias",
  "btcLongBias",
  "btcShortTailwindScore",
  "btcLongTailwindScore",
  "btcAlignment",

  "btcConflictFlags",
  "btcWarnings",
  "btcContextStale",
  "btcContextStaleReason",
];

export function marketContextCSVRow(s) {
  return [
    csvCell(s.btcPrice ?? ""),

    csvCell(s.btcChange5mPct ?? ""),
    csvCell(s.btcChange15mPct ?? ""),
    csvCell(s.btcChange30mPct ?? ""),
    csvCell(s.btcChange1hPct ?? ""),
    csvCell(s.btcChange2hPct ?? ""),
    csvCell(s.btcChange4hPct ?? ""),

    csvCell(s.btcDirection5m ?? ""),
    csvCell(s.btcDirection15m ?? ""),
    csvCell(s.btcDirection30m ?? ""),
    csvCell(s.btcDirection1h ?? ""),
    csvCell(s.btcDirection2h ?? ""),
    csvCell(s.btcDirection4h ?? ""),

    csvCell(s.btcCandleColor15m ?? ""),
    csvCell(s.btcCandleColor1h ?? ""),
    csvCell(s.btcCandleColor2h ?? ""),

    csvCell(s.btcPriceVsVwap15mPct ?? ""),
    csvCell(s.btcPriceVsVwap1hPct ?? ""),
    csvCell(s.btcPriceVsVwap15mLabel ?? ""),
    csvCell(s.btcPriceVsVwap1hLabel ?? ""),

    csvCell(s.btcEmaSlope15mPct ?? ""),
    csvCell(s.btcEmaSlope1hPct ?? ""),
    csvCell(s.btcEmaSlope2hPct ?? ""),

    csvCell(s.btcEmaStructure15m ?? ""),
    csvCell(s.btcEmaStructure1h ?? ""),
    csvCell(s.btcEmaStructure2h ?? ""),

    csvCell(s.btcAtrPct15m ?? ""),
    csvCell(s.btcAtrPct1h ?? ""),
    csvCell(s.btcAtrPct2h ?? ""),

    csvCell(s.btcRegime ?? ""),
    csvCell(s.btcShortBias ?? ""),
    csvCell(s.btcLongBias ?? ""),
    csvCell(s.btcShortTailwindScore ?? ""),
    csvCell(s.btcLongTailwindScore ?? ""),
    csvCell(s.btcAlignment ?? ""),

    csvCell(pipeSeparated(s.btcConflictFlags ?? [])),
    csvCell(pipeSeparated(s.btcWarnings ?? [])),
    csvCell(s.btcContextStale ?? ""),
    csvCell(s.btcContextStaleReason ?? ""),
  ];
}

export { n };
