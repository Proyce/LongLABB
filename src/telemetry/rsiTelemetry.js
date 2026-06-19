export const RSI_TELEMETRY_CONFIG = {
  enabled: true,
  strictRsiTelemetry: false,

  version: "rsi-telemetry-v1",

  rsiPeriod: 14,

  timeframes: ["1m", "3m", "5m", "15m", "30m", "1h"],

  optionalTimeframes: ["2h", "4h"],

  candleLimits: {
    "1m": 120,
    "3m": 120,
    "5m": 120,
    "15m": 120,
    "30m": 120,
    "1h": 120,
    "2h": 120,
    "4h": 120,
  },

  useClosedCandlesOnly: true,

  minRsiCandles: 16,
  preferredRsiCandles: 60,

  slopeLookback: 3,

  bucketThresholds: {
    oversold: 30,
    low: 40,
    neutralLow: 40,
    neutralHigh: 55,
    high: 70,
    extreme: 80,
  },

  slopeThresholdPct: 0.25,

  crossLevels: {
    overbought: 70,
    hot: 60,
    midline: 50,
    low: 40,
    oversold: 30,
  },

  divergenceLookback: 10,

  warnings: {
    warnIfRsiMissing: true,
    warnIfNotEnoughCandles: true,
  },
};

const RSI_TELEMETRY_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h"];

function rsiFieldName(tf) {
  return `rsi${tf}`;
}

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getClosedKlines(klines, useClosedCandlesOnly = true) {
  if (!Array.isArray(klines)) return [];
  if (!useClosedCandlesOnly) return klines;
  return klines.length > 1 ? klines.slice(0, -1) : [];
}

export function computeRsiSeries(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) {
    return [];
  }

  const rsis = [];

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const firstRs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  rsis.push(100 - 100 / (1 + firstRs));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    rsis.push(Number(rsi.toFixed(4)));
  }

  return rsis;
}

export function computeRsi(closes, period = 14) {
  const series = computeRsiSeries(closes, period);
  return series.length ? series[series.length - 1] : null;
}

export function classifyRsiBucket(rsi) {
  if (rsi == null || Number.isNaN(rsi)) return "UNKNOWN";

  if (rsi <= 30) return "OVERSOLD";
  if (rsi < 40) return "LOW";
  if (rsi < 55) return "NEUTRAL";
  if (rsi < 70) return "HIGH";
  if (rsi < 80) return "OVERBOUGHT";

  return "EXTREME";
}

export function classifyRsiSlope(delta, threshold = RSI_TELEMETRY_CONFIG.slopeThresholdPct) {
  if (delta == null || Number.isNaN(delta)) return "UNKNOWN";

  if (delta > threshold) return "RISING";
  if (delta < -threshold) return "FALLING";

  return "FLAT";
}

export function crossedDown(prev, current, level) {
  return prev != null && current != null && prev > level && current <= level;
}

export function crossedUp(prev, current, level) {
  return prev != null && current != null && prev < level && current >= level;
}

export function computeRsiCrossEvents(previousRsi, rsi) {
  return {
    crossedDown70: crossedDown(previousRsi, rsi, 70),
    crossedDown60: crossedDown(previousRsi, rsi, 60),
    crossedDown50: crossedDown(previousRsi, rsi, 50),
    crossedUp30: crossedUp(previousRsi, rsi, 30),
    crossedUp40: crossedUp(previousRsi, rsi, 40),
    crossedUp50: crossedUp(previousRsi, rsi, 50),
  };
}

export function computeRsiSpreads(values) {
  const diff = (left, right) => {
    const l = finiteNumberOrNull(values?.[left]?.rsi);
    const r = finiteNumberOrNull(values?.[right]?.rsi);
    return l != null && r != null ? Number((l - r).toFixed(4)) : null;
  };

  return {
    rsiSpread1m3m: diff("1m", "3m"),
    rsiSpread3m5m: diff("3m", "5m"),
    rsiSpread5m15m: diff("5m", "15m"),
    rsiSpread15m1h: diff("15m", "1h"),
  };
}

export function computeRsiDivergence(klines, rsiSeries, lookback = 10) {
  const closed = getClosedKlines(klines, true);

  if (!closed.length || !rsiSeries.length || closed.length < lookback + 2 || rsiSeries.length < lookback + 2) {
    return {
      bearish: false,
      bullish: false,
      warning: "NOT_ENOUGH_CANDLES_FOR_RSI_DIVERGENCE",
    };
  }

  const priceWindow = closed.slice(-lookback);
  const rsiWindow = rsiSeries.slice(-lookback);

  const midpoint = Math.floor(lookback / 2);
  const firstHalfPrice = priceWindow.slice(0, midpoint);
  const secondHalfPrice = priceWindow.slice(midpoint);

  const firstHalfRsi = rsiWindow.slice(0, midpoint);
  const secondHalfRsi = rsiWindow.slice(midpoint);

  const firstHigh = Math.max(...firstHalfPrice.map(k => Number(k[2])));
  const secondHigh = Math.max(...secondHalfPrice.map(k => Number(k[2])));

  const firstLow = Math.min(...firstHalfPrice.map(k => Number(k[3])));
  const secondLow = Math.min(...secondHalfPrice.map(k => Number(k[3])));

  const firstRsiHigh = Math.max(...firstHalfRsi);
  const secondRsiHigh = Math.max(...secondHalfRsi);

  const firstRsiLow = Math.min(...firstHalfRsi);
  const secondRsiLow = Math.min(...secondHalfRsi);

  const bearish = secondHigh > firstHigh && secondRsiHigh < firstRsiHigh;
  const bullish = secondLow < firstLow && secondRsiLow > firstRsiLow;

  return {
    bearish,
    bullish,
    warning: null,
  };
}

export function computeMultiTfRsiDivergence(klinesByInterval, seriesByInterval, config = RSI_TELEMETRY_CONFIG) {
  const divergence = {
    bearishRsiDivergence1m: false,
    bearishRsiDivergence3m: false,
    bearishRsiDivergence5m: false,
    bearishRsiDivergence15m: false,
    bullishRsiDivergence1m: false,
    bullishRsiDivergence3m: false,
    bullishRsiDivergence5m: false,
    bullishRsiDivergence15m: false,
  };

  for (const tf of ["1m", "3m", "5m", "15m"]) {
    const result = computeRsiDivergence(
      klinesByInterval?.[tf] ?? null,
      seriesByInterval?.[tf] ?? [],
      config.divergenceLookback,
    );
    divergence[`bearishRsiDivergence${tf}`] = result.bearish;
    divergence[`bullishRsiDivergence${tf}`] = result.bullish;
  }

  return divergence;
}

function emptyTimeframeTelemetry(tf) {
  return {
    timeframe: tf,
    rsi: null,
    bucket: "UNKNOWN",
    slope: "UNKNOWN",
    delta: null,
    previousRsi: null,
    crossedDown70: false,
    crossedDown60: false,
    crossedDown50: false,
    crossedUp30: false,
    crossedUp40: false,
    crossedUp50: false,
    notEnoughCandles: true,
  };
}

export function classifyRsiSetupLabels({ values, spreads, divergence }) {
  const r1 = values["1m"];
  const r3 = values["3m"];
  const r5 = values["5m"];
  const r15 = values["15m"];

  let shortScore = 0;
  let longScore = 0;
  const shortLabels = [];
  const longLabels = [];

  if (
    r1?.slope === "FALLING" &&
    r3?.slope === "FALLING" &&
    r5?.rsi >= 60
  ) {
    shortScore += 25;
    shortLabels.push("RSI_SHORT_LOWER_TF_ROLLOVER");
  }

  if (
    r1?.crossedDown70 ||
    r3?.crossedDown70 ||
    r5?.crossedDown70
  ) {
    shortScore += 20;
    shortLabels.push("RSI_SHORT_COOLING_FROM_OVERBOUGHT");
  }

  if (
    r15?.rsi >= 65 &&
    ["FALLING", "FLAT"].includes(r5?.slope)
  ) {
    shortScore += 15;
    shortLabels.push("RSI_SHORT_HTF_OVERHEATED");
  }

  if (
    divergence?.bearishRsiDivergence3m ||
    divergence?.bearishRsiDivergence5m ||
    divergence?.bearishRsiDivergence15m
  ) {
    shortScore += 25;
    shortLabels.push("RSI_SHORT_BEARISH_DIVERGENCE");
  }

  if (
    r1?.rsi <= 30 &&
    r3?.rsi <= 35 &&
    r5?.rsi <= 40
  ) {
    shortScore -= 30;
    shortLabels.push("RSI_SHORT_LATE_OVERSOLD_DANGER");
  }

  if (
    r1?.slope === "RISING" &&
    r3?.slope === "RISING" &&
    r5?.slope === "RISING"
  ) {
    shortScore -= 35;
    shortLabels.push("RSI_SHORT_MOMENTUM_STILL_RISING");
  }

  if (
    r1?.crossedUp30 ||
    r3?.crossedUp30 ||
    r5?.crossedUp30
  ) {
    longScore += 20;
    longLabels.push("RSI_LONG_RECOVERY_FROM_OVERSOLD");
  }

  if (
    r1?.slope === "RISING" &&
    r3?.slope === "RISING" &&
    r5?.slope === "RISING"
  ) {
    longScore += 25;
    longLabels.push("RSI_LONG_MOMENTUM_EXPANSION");
  }

  if (
    divergence?.bullishRsiDivergence3m ||
    divergence?.bullishRsiDivergence5m ||
    divergence?.bullishRsiDivergence15m
  ) {
    longScore += 25;
    longLabels.push("RSI_LONG_BULLISH_DIVERGENCE");
  }

  const rsiShortSetupLabel = shortLabels.length
    ? shortLabels.join("|")
    : "RSI_SHORT_NEUTRAL";

  const rsiLongSetupLabel = longLabels.length
    ? longLabels.join("|")
    : "RSI_LONG_NEUTRAL";

  const rsiCompositeLabel =
    shortScore > longScore && shortScore >= 25 ? "RSI_SHORT_BIAS" :
    longScore > shortScore && longScore >= 25 ? "RSI_LONG_BIAS" :
    "RSI_MIXED_OR_NEUTRAL";

  return {
    rsiShortSetupLabel,
    rsiLongSetupLabel,
    rsiCompositeLabel,
    rsiShortScore: Math.max(-100, Math.min(100, shortScore)),
    rsiLongScore: Math.max(-100, Math.min(100, longScore)),
  };
}

export function computeRsiTelemetry({
  symbol,
  side = "SHORT",
  klinesByInterval,
  computedAt = Date.now(),
}, config = RSI_TELEMETRY_CONFIG) {
  const warnings = [];
  const missingFields = [];
  const values = {};
  const seriesByInterval = {};
  const intervals = [...config.timeframes, ...config.optionalTimeframes];

  for (const tf of intervals) {
    const klines = klinesByInterval?.[tf] ?? null;
    const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
    const closes = closed.map(k => Number(k[4])).filter(Number.isFinite);

    if (closes.length < config.minRsiCandles) {
      values[tf] = emptyTimeframeTelemetry(tf);
      seriesByInterval[tf] = [];
      missingFields.push(rsiFieldName(tf));
      warnings.push(`NOT_ENOUGH_CANDLES_FOR_RSI_${tf}`);
      continue;
    }

    const series = computeRsiSeries(closes, config.rsiPeriod);
    seriesByInterval[tf] = series;

    const rsi = series.length ? series[series.length - 1] : null;
    const previousRsi = series.length > config.slopeLookback
      ? series[series.length - 1 - config.slopeLookback]
      : null;

    const delta = rsi != null && previousRsi != null
      ? Number((rsi - previousRsi).toFixed(4))
      : null;

    values[tf] = {
      timeframe: tf,
      rsi,
      bucket: classifyRsiBucket(rsi),
      slope: classifyRsiSlope(delta, config.slopeThresholdPct),
      delta,
      previousRsi,
      ...computeRsiCrossEvents(previousRsi, rsi),
      notEnoughCandles: false,
    };
  }

  const spreads = computeRsiSpreads(values);
  const divergence = computeMultiTfRsiDivergence(klinesByInterval, seriesByInterval, config);

  const labelsAndScores = classifyRsiSetupLabels({
    side,
    values,
    spreads,
    divergence,
  });

  const required = config.timeframes;
  const telemetryComplete = required.every(tf => values[tf]?.rsi != null);

  return {
    version: config.version,
    computedAt,
    symbol,
    side,
    period: config.rsiPeriod,
    timeframes: config.timeframes,
    useClosedCandlesOnly: config.useClosedCandlesOnly,

    values,
    spreads,
    divergence,

    labels: {
      rsiShortSetupLabel: labelsAndScores.rsiShortSetupLabel,
      rsiLongSetupLabel: labelsAndScores.rsiLongSetupLabel,
      rsiCompositeLabel: labelsAndScores.rsiCompositeLabel,
    },

    scores: {
      rsiShortScore: labelsAndScores.rsiShortScore,
      rsiLongScore: labelsAndScores.rsiLongScore,
    },

    telemetryComplete,
    missingFields,
    warnings,
  };
}

export const RSI_TELEMETRY_DEFAULTS = {
  rsiTelemetry: null,
  rsiTelemetryComplete: false,
  rsiMissingFields: [],
  rsiWarnings: [],

  rsi1m: null,
  rsi3m: null,
  rsi5m: null,
  rsi15m: null,
  rsi30m: null,
  rsi1h: null,
  rsi2h: null,
  rsi4h: null,

  rsi1mBucket: "UNKNOWN",
  rsi3mBucket: "UNKNOWN",
  rsi5mBucket: "UNKNOWN",
  rsi15mBucket: "UNKNOWN",
  rsi30mBucket: "UNKNOWN",
  rsi1hBucket: "UNKNOWN",
  rsi2hBucket: "UNKNOWN",
  rsi4hBucket: "UNKNOWN",

  rsi1mSlope: "UNKNOWN",
  rsi3mSlope: "UNKNOWN",
  rsi5mSlope: "UNKNOWN",
  rsi15mSlope: "UNKNOWN",
  rsi30mSlope: "UNKNOWN",
  rsi1hSlope: "UNKNOWN",
  rsi2hSlope: "UNKNOWN",
  rsi4hSlope: "UNKNOWN",

  rsi1mDelta: null,
  rsi3mDelta: null,
  rsi5mDelta: null,
  rsi15mDelta: null,
  rsi30mDelta: null,
  rsi1hDelta: null,
  rsi2hDelta: null,
  rsi4hDelta: null,

  rsi1mCrossedDown70: false,
  rsi3mCrossedDown70: false,
  rsi5mCrossedDown70: false,
  rsi15mCrossedDown70: false,

  rsi1mCrossedDown60: false,
  rsi3mCrossedDown60: false,
  rsi5mCrossedDown60: false,

  rsi1mCrossedUp30: false,
  rsi3mCrossedUp30: false,
  rsi5mCrossedUp30: false,

  rsi1mCrossedUp40: false,
  rsi3mCrossedUp40: false,
  rsi5mCrossedUp40: false,

  rsiSpread1m3m: null,
  rsiSpread3m5m: null,
  rsiSpread5m15m: null,
  rsiSpread15m1h: null,

  bearishRsiDivergence1m: false,
  bearishRsiDivergence3m: false,
  bearishRsiDivergence5m: false,
  bearishRsiDivergence15m: false,

  bullishRsiDivergence1m: false,
  bullishRsiDivergence3m: false,
  bullishRsiDivergence5m: false,
  bullishRsiDivergence15m: false,

  rsiShortSetupLabel: "RSI_SHORT_UNKNOWN",
  rsiLongSetupLabel: "RSI_LONG_UNKNOWN",
  rsiCompositeLabel: "RSI_UNKNOWN",

  rsiShortScore: 0,
  rsiLongScore: 0,
};

export function flattenRsiTelemetry(snapshot) {
  if (!snapshot) return RSI_TELEMETRY_DEFAULTS;

  const v = snapshot.values ?? {};
  const s = snapshot.spreads ?? {};
  const d = snapshot.divergence ?? {};
  const labels = snapshot.labels ?? {};
  const scores = snapshot.scores ?? {};

  return {
    rsiTelemetry: snapshot,
    rsiTelemetryComplete: snapshot.telemetryComplete,
    rsiMissingFields: snapshot.missingFields ?? [],
    rsiWarnings: snapshot.warnings ?? [],

    rsi1m: v["1m"]?.rsi ?? null,
    rsi3m: v["3m"]?.rsi ?? null,
    rsi5m: v["5m"]?.rsi ?? null,
    rsi15m: v["15m"]?.rsi ?? null,
    rsi30m: v["30m"]?.rsi ?? null,
    rsi1h: v["1h"]?.rsi ?? null,
    rsi2h: v["2h"]?.rsi ?? null,
    rsi4h: v["4h"]?.rsi ?? null,

    rsi1mBucket: v["1m"]?.bucket ?? "UNKNOWN",
    rsi3mBucket: v["3m"]?.bucket ?? "UNKNOWN",
    rsi5mBucket: v["5m"]?.bucket ?? "UNKNOWN",
    rsi15mBucket: v["15m"]?.bucket ?? "UNKNOWN",
    rsi30mBucket: v["30m"]?.bucket ?? "UNKNOWN",
    rsi1hBucket: v["1h"]?.bucket ?? "UNKNOWN",
    rsi2hBucket: v["2h"]?.bucket ?? "UNKNOWN",
    rsi4hBucket: v["4h"]?.bucket ?? "UNKNOWN",

    rsi1mSlope: v["1m"]?.slope ?? "UNKNOWN",
    rsi3mSlope: v["3m"]?.slope ?? "UNKNOWN",
    rsi5mSlope: v["5m"]?.slope ?? "UNKNOWN",
    rsi15mSlope: v["15m"]?.slope ?? "UNKNOWN",
    rsi30mSlope: v["30m"]?.slope ?? "UNKNOWN",
    rsi1hSlope: v["1h"]?.slope ?? "UNKNOWN",
    rsi2hSlope: v["2h"]?.slope ?? "UNKNOWN",
    rsi4hSlope: v["4h"]?.slope ?? "UNKNOWN",

    rsi1mDelta: v["1m"]?.delta ?? null,
    rsi3mDelta: v["3m"]?.delta ?? null,
    rsi5mDelta: v["5m"]?.delta ?? null,
    rsi15mDelta: v["15m"]?.delta ?? null,
    rsi30mDelta: v["30m"]?.delta ?? null,
    rsi1hDelta: v["1h"]?.delta ?? null,
    rsi2hDelta: v["2h"]?.delta ?? null,
    rsi4hDelta: v["4h"]?.delta ?? null,

    rsi1mCrossedDown70: v["1m"]?.crossedDown70 ?? false,
    rsi3mCrossedDown70: v["3m"]?.crossedDown70 ?? false,
    rsi5mCrossedDown70: v["5m"]?.crossedDown70 ?? false,
    rsi15mCrossedDown70: v["15m"]?.crossedDown70 ?? false,

    rsi1mCrossedDown60: v["1m"]?.crossedDown60 ?? false,
    rsi3mCrossedDown60: v["3m"]?.crossedDown60 ?? false,
    rsi5mCrossedDown60: v["5m"]?.crossedDown60 ?? false,

    rsi1mCrossedUp30: v["1m"]?.crossedUp30 ?? false,
    rsi3mCrossedUp30: v["3m"]?.crossedUp30 ?? false,
    rsi5mCrossedUp30: v["5m"]?.crossedUp30 ?? false,

    rsi1mCrossedUp40: v["1m"]?.crossedUp40 ?? false,
    rsi3mCrossedUp40: v["3m"]?.crossedUp40 ?? false,
    rsi5mCrossedUp40: v["5m"]?.crossedUp40 ?? false,

    rsiSpread1m3m: s.rsiSpread1m3m ?? null,
    rsiSpread3m5m: s.rsiSpread3m5m ?? null,
    rsiSpread5m15m: s.rsiSpread5m15m ?? null,
    rsiSpread15m1h: s.rsiSpread15m1h ?? null,

    bearishRsiDivergence1m: d.bearishRsiDivergence1m ?? false,
    bearishRsiDivergence3m: d.bearishRsiDivergence3m ?? false,
    bearishRsiDivergence5m: d.bearishRsiDivergence5m ?? false,
    bearishRsiDivergence15m: d.bearishRsiDivergence15m ?? false,

    bullishRsiDivergence1m: d.bullishRsiDivergence1m ?? false,
    bullishRsiDivergence3m: d.bullishRsiDivergence3m ?? false,
    bullishRsiDivergence5m: d.bullishRsiDivergence5m ?? false,
    bullishRsiDivergence15m: d.bullishRsiDivergence15m ?? false,

    rsiShortSetupLabel: labels.rsiShortSetupLabel ?? "RSI_SHORT_UNKNOWN",
    rsiLongSetupLabel: labels.rsiLongSetupLabel ?? "RSI_LONG_UNKNOWN",
    rsiCompositeLabel: labels.rsiCompositeLabel ?? "RSI_UNKNOWN",

    rsiShortScore: scores.rsiShortScore ?? 0,
    rsiLongScore: scores.rsiLongScore ?? 0,
  };
}

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

export const RSI_TELEMETRY_CSV_HEADERS = [
  "rsiTelemetryComplete",
  "rsiMissingFields",
  "rsiWarnings",

  "rsi1m",
  "rsi3m",
  "rsi5m",
  "rsi15m",
  "rsi30m",
  "rsi1h",
  "rsi2h",
  "rsi4h",

  "rsi1mBucket",
  "rsi3mBucket",
  "rsi5mBucket",
  "rsi15mBucket",
  "rsi30mBucket",
  "rsi1hBucket",

  "rsi1mSlope",
  "rsi3mSlope",
  "rsi5mSlope",
  "rsi15mSlope",
  "rsi30mSlope",
  "rsi1hSlope",

  "rsi1mDelta",
  "rsi3mDelta",
  "rsi5mDelta",
  "rsi15mDelta",
  "rsi30mDelta",
  "rsi1hDelta",

  "rsi1mCrossedDown70",
  "rsi3mCrossedDown70",
  "rsi5mCrossedDown70",
  "rsi15mCrossedDown70",

  "rsi1mCrossedDown60",
  "rsi3mCrossedDown60",
  "rsi5mCrossedDown60",

  "rsi1mCrossedUp30",
  "rsi3mCrossedUp30",
  "rsi5mCrossedUp30",

  "rsiSpread1m3m",
  "rsiSpread3m5m",
  "rsiSpread5m15m",
  "rsiSpread15m1h",

  "bearishRsiDivergence1m",
  "bearishRsiDivergence3m",
  "bearishRsiDivergence5m",
  "bearishRsiDivergence15m",

  "bullishRsiDivergence1m",
  "bullishRsiDivergence3m",
  "bullishRsiDivergence5m",
  "bullishRsiDivergence15m",

  "rsiShortSetupLabel",
  "rsiLongSetupLabel",
  "rsiCompositeLabel",
  "rsiShortScore",
  "rsiLongScore",
];

export function rsiTelemetryCSVRow(s) {
  return [
    csvCell(s.rsiTelemetryComplete ?? ""),
    csvCell(pipeSeparated(s.rsiMissingFields ?? [])),
    csvCell(pipeSeparated(s.rsiWarnings ?? [])),

    csvCell(s.rsi1m ?? ""),
    csvCell(s.rsi3m ?? ""),
    csvCell(s.rsi5m ?? ""),
    csvCell(s.rsi15m ?? ""),
    csvCell(s.rsi30m ?? ""),
    csvCell(s.rsi1h ?? ""),
    csvCell(s.rsi2h ?? ""),
    csvCell(s.rsi4h ?? ""),

    csvCell(s.rsi1mBucket ?? ""),
    csvCell(s.rsi3mBucket ?? ""),
    csvCell(s.rsi5mBucket ?? ""),
    csvCell(s.rsi15mBucket ?? ""),
    csvCell(s.rsi30mBucket ?? ""),
    csvCell(s.rsi1hBucket ?? ""),

    csvCell(s.rsi1mSlope ?? ""),
    csvCell(s.rsi3mSlope ?? ""),
    csvCell(s.rsi5mSlope ?? ""),
    csvCell(s.rsi15mSlope ?? ""),
    csvCell(s.rsi30mSlope ?? ""),
    csvCell(s.rsi1hSlope ?? ""),

    csvCell(s.rsi1mDelta ?? ""),
    csvCell(s.rsi3mDelta ?? ""),
    csvCell(s.rsi5mDelta ?? ""),
    csvCell(s.rsi15mDelta ?? ""),
    csvCell(s.rsi30mDelta ?? ""),
    csvCell(s.rsi1hDelta ?? ""),

    csvCell(s.rsi1mCrossedDown70 ?? ""),
    csvCell(s.rsi3mCrossedDown70 ?? ""),
    csvCell(s.rsi5mCrossedDown70 ?? ""),
    csvCell(s.rsi15mCrossedDown70 ?? ""),

    csvCell(s.rsi1mCrossedDown60 ?? ""),
    csvCell(s.rsi3mCrossedDown60 ?? ""),
    csvCell(s.rsi5mCrossedDown60 ?? ""),

    csvCell(s.rsi1mCrossedUp30 ?? ""),
    csvCell(s.rsi3mCrossedUp30 ?? ""),
    csvCell(s.rsi5mCrossedUp30 ?? ""),

    csvCell(s.rsiSpread1m3m ?? ""),
    csvCell(s.rsiSpread3m5m ?? ""),
    csvCell(s.rsiSpread5m15m ?? ""),
    csvCell(s.rsiSpread15m1h ?? ""),

    csvCell(s.bearishRsiDivergence1m ?? ""),
    csvCell(s.bearishRsiDivergence3m ?? ""),
    csvCell(s.bearishRsiDivergence5m ?? ""),
    csvCell(s.bearishRsiDivergence15m ?? ""),

    csvCell(s.bullishRsiDivergence1m ?? ""),
    csvCell(s.bullishRsiDivergence3m ?? ""),
    csvCell(s.bullishRsiDivergence5m ?? ""),
    csvCell(s.bullishRsiDivergence15m ?? ""),

    csvCell(s.rsiShortSetupLabel ?? ""),
    csvCell(s.rsiLongSetupLabel ?? ""),
    csvCell(s.rsiCompositeLabel ?? ""),
    csvCell(s.rsiShortScore ?? ""),
    csvCell(s.rsiLongScore ?? ""),
  ];
}

export { RSI_TELEMETRY_TIMEFRAMES };
