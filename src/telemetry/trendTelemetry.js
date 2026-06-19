export const TREND_TELEMETRY_CONFIG = {
  enabled: true,
  strictTrendTelemetry: false,

  version: "trend-telemetry-v1",

  useClosedCandlesOnly: true,

  timeframes: ["1m", "3m", "5m", "15m", "30m", "1h"],

  optionalTimeframes: ["2h", "4h"],

  candleLimits: {
    "1m": 160,
    "3m": 160,
    "5m": 160,
    "15m": 160,
    "30m": 160,
    "1h": 160,
    "2h": 160,
    "4h": 160,
  },

  emaPeriods: [9, 20, 50],
  emaSlopeLookback: 3,

  adxPeriod: 14,
  adxSlopeLookback: 3,

  macd: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    histogramSlopeLookback: 3,
  },

  thresholds: {
    emaSlopeFlatPct: 0.03,

    priceNearEmaPct: 0.08,

    adxWeak: 15,
    adxEmerging: 20,
    adxStrong: 25,
    adxVeryStrong: 35,

    dmiBiasMinSpread: 3,

    macdHistogramFlatThreshold: 0.000001,
  },

  minCandles: {
    ema50: 55,
    adx14: 35,
    macd: 40,
  },
};

const TREND_REQUIRED_ADX_MACD_TIMEFRAMES = ["1m", "3m", "5m", "15m"];

function finiteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fixedOrNull(value, digits = 4) {
  return value == null || Number.isNaN(value)
    ? null
    : Number(Number(value).toFixed(digits));
}

function getClosedKlines(klines, useClosedCandlesOnly = true) {
  if (!Array.isArray(klines)) return [];
  if (!useClosedCandlesOnly) return klines;
  return klines.length > 1 ? klines.slice(0, -1) : [];
}

function closesFromKlines(klines) {
  return klines
    .map(k => finiteNumberOrNull(k?.[4]))
    .filter(v => v != null);
}

function latestClose(klines) {
  const last = klines.length ? klines[klines.length - 1] : null;
  return finiteNumberOrNull(last?.[4]);
}

function pctDiff(value, baseline) {
  if (value == null || baseline == null || !baseline) return null;
  return fixedOrNull(((value - baseline) / baseline) * 100, 4);
}

function slopePctFromSeries(series, lookback) {
  if (!Array.isArray(series) || series.length <= lookback) return null;

  const current = series[series.length - 1];
  const previous = series[series.length - 1 - lookback];

  return pctDiff(current, previous);
}

function classifyPointSlope(delta, threshold = 0.000001) {
  if (delta == null || Number.isNaN(delta)) return "UNKNOWN";
  if (delta > threshold) return "RISING";
  if (delta < -threshold) return "FALLING";
  return "FLAT";
}

function emptyEmaTelemetry(notEnoughCandles = true) {
  return {
    ema9: null,
    ema20: null,
    ema50: null,
    priceVsEma9Pct: null,
    priceVsEma20Pct: null,
    priceVsEma50Pct: null,
    ema9SlopePct: null,
    ema20SlopePct: null,
    ema50SlopePct: null,
    emaStack: "UNKNOWN",
    emaPricePosition: "UNKNOWN",
    emaSlopeBias: "UNKNOWN",
    notEnoughCandles,
  };
}

function emptyAdxDmiTelemetry(notEnoughCandles = true) {
  return {
    adx: null,
    plusDi: null,
    minusDi: null,
    adx14: null,
    plusDi14: null,
    minusDi14: null,
    diSpread: null,
    adxSlope: "UNKNOWN",
    adxStrength: "UNKNOWN",
    dmiBias: "UNKNOWN",
    notEnoughCandles,
  };
}

function emptyMacdTelemetry(notEnoughCandles = true) {
  return {
    macdLine: null,
    macdSignal: null,
    macdHistogram: null,
    macdHistogramDelta: null,
    macdHistogramSlope: "UNKNOWN",
    macdHistogramState: "UNKNOWN",
    notEnoughCandles,
  };
}

export function computeEmaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];

  const numeric = values.map(Number);
  if (numeric.some(v => !Number.isFinite(v))) return [];

  const multiplier = 2 / (period + 1);
  const series = [];

  const seed = numeric.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  series.push(seed);

  for (let i = period; i < numeric.length; i++) {
    const ema = (numeric[i] - series[series.length - 1]) * multiplier + series[series.length - 1];
    series.push(Number(ema.toFixed(8)));
  }

  return series;
}

export function computeEma(values, period) {
  const series = computeEmaSeries(values, period);
  return series.length ? series[series.length - 1] : null;
}

export function classifyEmaStack({ ema9, ema20, ema50 }) {
  if ([ema9, ema20, ema50].some(v => v == null)) return "UNKNOWN";

  if (ema9 < ema20 && ema20 < ema50) return "BEARISH_STACK";
  if (ema9 > ema20 && ema20 > ema50) return "BULLISH_STACK";

  return "MIXED_STACK";
}

export function classifyEmaSlope(
  slopePct,
  flatThresholdPct = TREND_TELEMETRY_CONFIG.thresholds.emaSlopeFlatPct,
) {
  if (slopePct == null || Number.isNaN(slopePct)) return "UNKNOWN";
  if (slopePct > flatThresholdPct) return "RISING";
  if (slopePct < -flatThresholdPct) return "FALLING";
  return "FLAT";
}

export function classifyEmaPricePosition({ price, ema9, ema20, ema50 }) {
  if ([price, ema9, ema20, ema50].some(v => v == null)) return "UNKNOWN";

  if (price < ema9 && price < ema20) return "BELOW_FAST_EMA";
  if (price > ema9 && price > ema20) return "ABOVE_FAST_EMA";

  return "BETWEEN_EMAS";
}

export function computeEmaTelemetry(klines, entryPrice = null, config = TREND_TELEMETRY_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  const closes = closesFromKlines(closed);
  const price = finiteNumberOrNull(entryPrice) ?? latestClose(closed);

  if (!closes.length) return emptyEmaTelemetry(true);

  const emaSeries9 = computeEmaSeries(closes, 9);
  const emaSeries20 = computeEmaSeries(closes, 20);
  const emaSeries50 = computeEmaSeries(closes, 50);

  const ema9 = emaSeries9.length ? emaSeries9[emaSeries9.length - 1] : null;
  const ema20 = emaSeries20.length ? emaSeries20[emaSeries20.length - 1] : null;
  const ema50 = emaSeries50.length ? emaSeries50[emaSeries50.length - 1] : null;

  const ema9SlopePct = slopePctFromSeries(emaSeries9, config.emaSlopeLookback);
  const ema20SlopePct = slopePctFromSeries(emaSeries20, config.emaSlopeLookback);
  const ema50SlopePct = slopePctFromSeries(emaSeries50, config.emaSlopeLookback);

  return {
    ema9,
    ema20,
    ema50,
    priceVsEma9Pct: pctDiff(price, ema9),
    priceVsEma20Pct: pctDiff(price, ema20),
    priceVsEma50Pct: pctDiff(price, ema50),
    ema9SlopePct,
    ema20SlopePct,
    ema50SlopePct,
    emaStack: classifyEmaStack({ ema9, ema20, ema50 }),
    emaPricePosition: classifyEmaPricePosition({ price, ema9, ema20, ema50 }),
    emaSlopeBias: classifyEmaSlope(ema9SlopePct, config.thresholds.emaSlopeFlatPct),
    notEnoughCandles: closes.length < config.minCandles.ema50,
  };
}

export function computeTrueRangeSeries(klines) {
  const result = [];

  if (!Array.isArray(klines)) return result;

  for (let i = 1; i < klines.length; i++) {
    const high = Number(klines[i][2]);
    const low = Number(klines[i][3]);
    const prevClose = Number(klines[i - 1][4]);

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );

    result.push(tr);
  }

  return result;
}

export function computeDirectionalMovementSeries(klines) {
  const plusDm = [];
  const minusDm = [];

  if (!Array.isArray(klines)) return { plusDm, minusDm };

  for (let i = 1; i < klines.length; i++) {
    const currentHigh = Number(klines[i][2]);
    const currentLow = Number(klines[i][3]);
    const prevHigh = Number(klines[i - 1][2]);
    const prevLow = Number(klines[i - 1][3]);

    const upMove = currentHigh - prevHigh;
    const downMove = prevLow - currentLow;

    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  return { plusDm, minusDm };
}

export function classifyAdxStrength(adx) {
  if (adx == null || Number.isNaN(adx)) return "UNKNOWN";
  if (adx < TREND_TELEMETRY_CONFIG.thresholds.adxWeak) return "WEAK";
  if (adx < TREND_TELEMETRY_CONFIG.thresholds.adxStrong) return "EMERGING";
  if (adx < TREND_TELEMETRY_CONFIG.thresholds.adxVeryStrong) return "STRONG";
  return "VERY_STRONG";
}

export function classifyDmiBias({
  plusDi,
  minusDi,
  minSpread = TREND_TELEMETRY_CONFIG.thresholds.dmiBiasMinSpread,
}) {
  if (plusDi == null || minusDi == null) return "UNKNOWN";

  const spread = minusDi - plusDi;

  if (spread >= minSpread) return "BEARISH_DMI";
  if (spread <= -minSpread) return "BULLISH_DMI";

  return "NEUTRAL_DMI";
}

export function computeAdxDmiTelemetry(klines, config = TREND_TELEMETRY_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  const period = config.adxPeriod;

  if (closed.length < config.minCandles.adx14) {
    return emptyAdxDmiTelemetry(true);
  }

  const tr = computeTrueRangeSeries(closed);
  const { plusDm, minusDm } = computeDirectionalMovementSeries(closed);

  if (tr.length < period * 2 || plusDm.length !== tr.length || minusDm.length !== tr.length) {
    return emptyAdxDmiTelemetry(true);
  }

  let smoothedTr = tr.slice(0, period).reduce((sum, v) => sum + v, 0);
  let smoothedPlusDm = plusDm.slice(0, period).reduce((sum, v) => sum + v, 0);
  let smoothedMinusDm = minusDm.slice(0, period).reduce((sum, v) => sum + v, 0);

  const dxSeries = [];
  const plusDiSeries = [];
  const minusDiSeries = [];

  for (let i = period - 1; i < tr.length; i++) {
    if (i > period - 1) {
      smoothedTr = smoothedTr - (smoothedTr / period) + tr[i];
      smoothedPlusDm = smoothedPlusDm - (smoothedPlusDm / period) + plusDm[i];
      smoothedMinusDm = smoothedMinusDm - (smoothedMinusDm / period) + minusDm[i];
    }

    const plusDi = smoothedTr ? (smoothedPlusDm / smoothedTr) * 100 : 0;
    const minusDi = smoothedTr ? (smoothedMinusDm / smoothedTr) * 100 : 0;
    const diTotal = plusDi + minusDi;
    const dx = diTotal ? (Math.abs(plusDi - minusDi) / diTotal) * 100 : 0;

    plusDiSeries.push(Number(plusDi.toFixed(4)));
    minusDiSeries.push(Number(minusDi.toFixed(4)));
    dxSeries.push(dx);
  }

  if (dxSeries.length < period) {
    return emptyAdxDmiTelemetry(true);
  }

  const adxSeries = [];
  let adx = dxSeries.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  adxSeries.push(Number(adx.toFixed(4)));

  for (let i = period; i < dxSeries.length; i++) {
    adx = ((adx * (period - 1)) + dxSeries[i]) / period;
    adxSeries.push(Number(adx.toFixed(4)));
  }

  const adx14 = adxSeries.length ? adxSeries[adxSeries.length - 1] : null;
  const plusDi14 = plusDiSeries.length ? plusDiSeries[plusDiSeries.length - 1] : null;
  const minusDi14 = minusDiSeries.length ? minusDiSeries[minusDiSeries.length - 1] : null;
  const diSpread = plusDi14 != null && minusDi14 != null
    ? Number((minusDi14 - plusDi14).toFixed(4))
    : null;
  const priorAdx = adxSeries.length > config.adxSlopeLookback
    ? adxSeries[adxSeries.length - 1 - config.adxSlopeLookback]
    : null;
  const adxDelta = adx14 != null && priorAdx != null
    ? Number((adx14 - priorAdx).toFixed(4))
    : null;

  return {
    adx: adx14,
    plusDi: plusDi14,
    minusDi: minusDi14,
    adx14,
    plusDi14,
    minusDi14,
    diSpread,
    adxSlope: classifyPointSlope(adxDelta, 0.0001),
    adxStrength: classifyAdxStrength(adx14),
    dmiBias: classifyDmiBias({ plusDi: plusDi14, minusDi: minusDi14 }),
    notEnoughCandles: false,
  };
}

export function computeMacdSeries(closes, {
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
} = TREND_TELEMETRY_CONFIG.macd) {
  if (!Array.isArray(closes) || closes.length < slowPeriod + signalPeriod) {
    return {
      macdLine: [],
      signalLine: [],
      histogram: [],
    };
  }

  const numeric = closes.map(Number);
  if (numeric.some(v => !Number.isFinite(v))) {
    return {
      macdLine: [],
      signalLine: [],
      histogram: [],
    };
  }

  const fast = computeEmaSeries(numeric, fastPeriod);
  const slow = computeEmaSeries(numeric, slowPeriod);

  const offset = slow.length - fast.length;
  const alignedFast = offset >= 0 ? fast : fast.slice(Math.abs(offset));
  const alignedSlow = offset >= 0 ? slow.slice(offset) : slow;

  const macdLine = alignedSlow.map((slowVal, i) =>
    Number((alignedFast[i] - slowVal).toFixed(8)),
  );

  const signalLine = computeEmaSeries(macdLine, signalPeriod);

  const histogramOffset = macdLine.length - signalLine.length;
  const alignedMacd = macdLine.slice(histogramOffset);

  const histogram = signalLine.map((signal, i) =>
    Number((alignedMacd[i] - signal).toFixed(8)),
  );

  return {
    macdLine: alignedMacd,
    signalLine,
    histogram,
  };
}

export function classifyMacdHistogramState({
  current,
  previous,
  threshold = TREND_TELEMETRY_CONFIG.thresholds.macdHistogramFlatThreshold,
}) {
  if (current == null || previous == null) return "UNKNOWN";

  const delta = current - previous;

  if (Math.abs(current) <= threshold && Math.abs(delta) <= threshold) {
    return "FLAT";
  }

  if (current > 0 && delta > threshold) return "POSITIVE_EXPANDING";
  if (current > 0 && delta < -threshold) return "POSITIVE_SHRINKING";
  if (current < 0 && delta < -threshold) return "NEGATIVE_EXPANDING";
  if (current < 0 && delta > threshold) return "NEGATIVE_SHRINKING";

  return "FLAT";
}

export function computeMacdTelemetry(klines, config = TREND_TELEMETRY_CONFIG) {
  const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
  const closes = closesFromKlines(closed);

  if (closes.length < config.minCandles.macd) {
    return emptyMacdTelemetry(true);
  }

  const series = computeMacdSeries(closes, config.macd);
  const macdLine = series.macdLine.length ? series.macdLine[series.macdLine.length - 1] : null;
  const macdSignal = series.signalLine.length ? series.signalLine[series.signalLine.length - 1] : null;
  const macdHistogram = series.histogram.length ? series.histogram[series.histogram.length - 1] : null;
  const previousHistogram = series.histogram.length > 1
    ? series.histogram[series.histogram.length - 2]
    : null;
  const slopeBase = series.histogram.length > config.macd.histogramSlopeLookback
    ? series.histogram[series.histogram.length - 1 - config.macd.histogramSlopeLookback]
    : null;
  const macdHistogramDelta = macdHistogram != null && previousHistogram != null
    ? Number((macdHistogram - previousHistogram).toFixed(8))
    : null;
  const slopeDelta = macdHistogram != null && slopeBase != null
    ? Number((macdHistogram - slopeBase).toFixed(8))
    : null;

  return {
    macdLine,
    macdSignal,
    macdHistogram,
    macdHistogramDelta,
    macdHistogramSlope: classifyPointSlope(
      slopeDelta,
      config.thresholds.macdHistogramFlatThreshold,
    ),
    macdHistogramState: classifyMacdHistogramState({
      current: macdHistogram,
      previous: previousHistogram,
      threshold: config.thresholds.macdHistogramFlatThreshold,
    }),
    notEnoughCandles: macdHistogram == null,
  };
}

export function classifyTrendSetupLabels({ ema, adxDmi, macd }) {
  let shortScore = 0;
  let longScore = 0;
  const shortLabels = [];
  const longLabels = [];

  const ema1 = ema?.["1m"];
  const ema3 = ema?.["3m"];
  const adx1 = adxDmi?.["1m"];
  const adx3 = adxDmi?.["3m"];
  const adx5 = adxDmi?.["5m"];
  const macd1 = macd?.["1m"];
  const macd3 = macd?.["3m"];
  const macd5 = macd?.["5m"];

  if (
    ema1?.emaPricePosition === "BELOW_FAST_EMA" &&
    ["FALLING", "FLAT"].includes(ema1?.emaSlopeBias)
  ) {
    shortScore += 20;
    shortLabels.push("EMA_SHORT_FAST_SUPPORT_LOST");
  }

  if (
    ema3?.emaPricePosition === "BELOW_FAST_EMA" &&
    ema3?.emaStack !== "BULLISH_STACK"
  ) {
    shortScore += 20;
    shortLabels.push("EMA_SHORT_3M_CONFIRMING");
  }

  if (
    ema1?.emaStack === "BEARISH_STACK" ||
    ema3?.emaStack === "BEARISH_STACK"
  ) {
    shortScore += 20;
    shortLabels.push("EMA_SHORT_BEARISH_STACK");
  }

  if (
    ema1?.emaPricePosition === "ABOVE_FAST_EMA" &&
    ema3?.emaPricePosition === "ABOVE_FAST_EMA" &&
    ["RISING", "FLAT"].includes(ema1?.emaSlopeBias)
  ) {
    shortScore -= 30;
    shortLabels.push("EMA_SHORT_DANGER_ABOVE_RISING_EMA");
  }

  if (
    ["STRONG", "VERY_STRONG"].includes(adx5?.adxStrength) &&
    adx5?.dmiBias === "BEARISH_DMI"
  ) {
    shortScore += 25;
    shortLabels.push("ADX_SHORT_BEARISH_TREND_CONFIRMED");
  }

  if (
    ["EMERGING", "STRONG", "VERY_STRONG"].includes(adx3?.adxStrength) &&
    adx3?.dmiBias === "BEARISH_DMI"
  ) {
    shortScore += 20;
    shortLabels.push("DMI_SHORT_PRESSURE_RISING");
  }

  if (
    adx3?.dmiBias === "BULLISH_DMI" &&
    ["EMERGING", "STRONG", "VERY_STRONG"].includes(adx3?.adxStrength)
  ) {
    shortScore -= 30;
    shortLabels.push("DMI_SHORT_DANGER_BULLISH_PRESSURE");
  }

  if (
    adx1?.adxStrength === "WEAK" &&
    adx3?.adxStrength === "WEAK"
  ) {
    shortLabels.push("ADX_CHOP_WARNING");
  }

  if (
    ["POSITIVE_SHRINKING", "NEGATIVE_EXPANDING"].includes(macd1?.macdHistogramState)
  ) {
    shortScore += 15;
    shortLabels.push("MACD_SHORT_1M_MOMENTUM_ROLLOVER");
  }

  if (
    ["POSITIVE_SHRINKING", "NEGATIVE_EXPANDING"].includes(macd3?.macdHistogramState)
  ) {
    shortScore += 20;
    shortLabels.push("MACD_SHORT_3M_MOMENTUM_ROLLOVER");
  }

  if (
    macd5?.macdHistogramState === "NEGATIVE_EXPANDING"
  ) {
    shortScore += 20;
    shortLabels.push("MACD_SHORT_5M_BEARISH_EXPANSION");
  }

  if (
    macd1?.macdHistogramState === "POSITIVE_EXPANDING" &&
    macd3?.macdHistogramState === "POSITIVE_EXPANDING"
  ) {
    shortScore -= 25;
    shortLabels.push("MACD_SHORT_DANGER_BULLISH_EXPANSION");
  }

  if (
    ema1?.emaPricePosition === "ABOVE_FAST_EMA" &&
    ema3?.emaPricePosition === "ABOVE_FAST_EMA"
  ) {
    longScore += 20;
    longLabels.push("EMA_LONG_FAST_SUPPORT_HELD");
  }

  if (
    adx3?.dmiBias === "BULLISH_DMI" &&
    ["EMERGING", "STRONG", "VERY_STRONG"].includes(adx3?.adxStrength)
  ) {
    longScore += 25;
    longLabels.push("DMI_LONG_BULLISH_TREND_CONFIRMED");
  }

  if (
    macd1?.macdHistogramState === "POSITIVE_EXPANDING" ||
    macd3?.macdHistogramState === "POSITIVE_EXPANDING"
  ) {
    longScore += 20;
    longLabels.push("MACD_LONG_BULLISH_EXPANSION");
  }

  const trendShortSetupLabel = shortLabels.length
    ? shortLabels.join("|")
    : "TREND_SHORT_NEUTRAL";

  const trendLongSetupLabel = longLabels.length
    ? longLabels.join("|")
    : "TREND_LONG_NEUTRAL";

  const trendCompositeLabel =
    shortScore > longScore && shortScore >= 25 ? "TREND_SHORT_BIAS" :
    longScore > shortScore && longScore >= 25 ? "TREND_LONG_BIAS" :
    "TREND_MIXED_OR_NEUTRAL";

  return {
    trendShortSetupLabel,
    trendLongSetupLabel,
    trendCompositeLabel,
    trendShortScore: Math.max(-100, Math.min(100, shortScore)),
    trendLongScore: Math.max(-100, Math.min(100, longScore)),
  };
}

function addMissingTelemetry({
  tf,
  emaTelemetry,
  adxTelemetry,
  macdTelemetry,
  missingFields,
  warnings,
  isRequired,
}) {
  if (!isRequired) return;

  if (emaTelemetry.notEnoughCandles || emaTelemetry.ema50 == null) {
    missingFields.push(`ema50_${tf}`);
    warnings.push(`NOT_ENOUGH_CANDLES_FOR_EMA_${tf}`);
  }

  if (TREND_REQUIRED_ADX_MACD_TIMEFRAMES.includes(tf) && (adxTelemetry.notEnoughCandles || adxTelemetry.adx14 == null)) {
    missingFields.push(`adx14_${tf}`);
    warnings.push(`NOT_ENOUGH_CANDLES_FOR_ADX_DMI_${tf}`);
  }

  if (TREND_REQUIRED_ADX_MACD_TIMEFRAMES.includes(tf) && (macdTelemetry.notEnoughCandles || macdTelemetry.macdHistogram == null)) {
    missingFields.push(`macd_${tf}`);
    warnings.push(`NOT_ENOUGH_CANDLES_FOR_MACD_${tf}`);
  }
}

export function computeTrendTelemetry({
  symbol,
  side = "SHORT",
  klinesByInterval,
  entryPrice = null,
  computedAt = Date.now(),
}, config = TREND_TELEMETRY_CONFIG) {
  const warnings = [];
  const missingFields = [];
  const ema = {};
  const adxDmi = {};
  const macd = {};
  const intervals = config.timeframes;

  for (const tf of intervals) {
    const klines = klinesByInterval?.[tf] ?? null;
    const closed = getClosedKlines(klines, config.useClosedCandlesOnly);
    const missingKlines = !Array.isArray(klines) || !closed.length;

    ema[tf] = computeEmaTelemetry(klines, entryPrice, config);
    adxDmi[tf] = computeAdxDmiTelemetry(klines, config);
    macd[tf] = computeMacdTelemetry(klines, config);

    if (missingKlines) {
      missingFields.push(`klines_${tf}`);
      warnings.push(`MISSING_KLINES_${tf}`);
    }

    addMissingTelemetry({
      tf,
      emaTelemetry: ema[tf],
      adxTelemetry: adxDmi[tf],
      macdTelemetry: macd[tf],
      missingFields,
      warnings,
      isRequired: true,
    });
  }

  const labelsAndScores = classifyTrendSetupLabels({ ema, adxDmi, macd });
  const telemetryComplete = intervals.every(tf => {
    const emaOk = ema[tf]?.ema50 != null;
    const adxMacdRequired = TREND_REQUIRED_ADX_MACD_TIMEFRAMES.includes(tf);
    const adxOk = !adxMacdRequired || adxDmi[tf]?.adx14 != null;
    const macdOk = !adxMacdRequired || macd[tf]?.macdHistogram != null;
    return emaOk && adxOk && macdOk;
  });

  return {
    version: config.version,
    computedAt,
    symbol,
    side,
    timeframes: config.timeframes,
    useClosedCandlesOnly: config.useClosedCandlesOnly,

    ema,
    adxDmi,
    macd,

    labels: {
      trendShortSetupLabel: labelsAndScores.trendShortSetupLabel,
      trendLongSetupLabel: labelsAndScores.trendLongSetupLabel,
      trendCompositeLabel: labelsAndScores.trendCompositeLabel,
    },

    scores: {
      trendShortScore: labelsAndScores.trendShortScore,
      trendLongScore: labelsAndScores.trendLongScore,
    },

    telemetryComplete,
    missingFields: [...new Set(missingFields)],
    warnings: [...new Set(warnings)],
  };
}

export const TREND_TELEMETRY_DEFAULTS = {
  trendTelemetry: null,
  trendTelemetryComplete: false,
  trendMissingFields: [],
  trendWarnings: [],

  trendCompositeLabel: "TREND_UNKNOWN",
  trendShortSetupLabel: "TREND_SHORT_UNKNOWN",
  trendLongSetupLabel: "TREND_LONG_UNKNOWN",
  trendShortScore: 0,
  trendLongScore: 0,

  ema9_1m: null,
  ema20_1m: null,
  ema50_1m: null,
  ema9_3m: null,
  ema20_3m: null,
  ema50_3m: null,
  ema9_5m: null,
  ema20_5m: null,
  ema50_5m: null,
  ema9_15m: null,
  ema20_15m: null,
  ema50_15m: null,
  ema9_30m: null,
  ema20_30m: null,
  ema50_30m: null,
  ema9_1h: null,
  ema20_1h: null,
  ema50_1h: null,

  priceVsEma9_1mPct: null,
  priceVsEma20_1mPct: null,
  priceVsEma50_1mPct: null,
  priceVsEma9_3mPct: null,
  priceVsEma20_3mPct: null,
  priceVsEma50_3mPct: null,
  priceVsEma9_5mPct: null,
  priceVsEma20_5mPct: null,
  priceVsEma50_5mPct: null,
  priceVsEma9_15mPct: null,
  priceVsEma20_15mPct: null,
  priceVsEma50_15mPct: null,
  priceVsEma9_30mPct: null,
  priceVsEma20_30mPct: null,
  priceVsEma50_30mPct: null,
  priceVsEma9_1hPct: null,
  priceVsEma20_1hPct: null,
  priceVsEma50_1hPct: null,

  ema9Slope1mPct: null,
  ema20Slope1mPct: null,
  ema50Slope1mPct: null,
  ema9Slope3mPct: null,
  ema20Slope3mPct: null,
  ema50Slope3mPct: null,
  ema9Slope5mPct: null,
  ema20Slope5mPct: null,
  ema50Slope5mPct: null,
  ema9Slope15mPct: null,
  ema20Slope15mPct: null,
  ema50Slope15mPct: null,

  emaStack1m: "UNKNOWN",
  emaStack3m: "UNKNOWN",
  emaStack5m: "UNKNOWN",
  emaStack15m: "UNKNOWN",

  emaPricePosition1m: "UNKNOWN",
  emaPricePosition3m: "UNKNOWN",
  emaPricePosition5m: "UNKNOWN",
  emaPricePosition15m: "UNKNOWN",

  emaSlopeBias1m: "UNKNOWN",
  emaSlopeBias3m: "UNKNOWN",
  emaSlopeBias5m: "UNKNOWN",
  emaSlopeBias15m: "UNKNOWN",

  adx14_1m: null,
  adx14_3m: null,
  adx14_5m: null,
  adx14_15m: null,
  adx14_30m: null,
  adx14_1h: null,

  plusDi14_1m: null,
  minusDi14_1m: null,
  plusDi14_3m: null,
  minusDi14_3m: null,
  plusDi14_5m: null,
  minusDi14_5m: null,
  plusDi14_15m: null,
  minusDi14_15m: null,

  diSpread1m: null,
  diSpread3m: null,
  diSpread5m: null,
  diSpread15m: null,

  adxSlope1m: "UNKNOWN",
  adxSlope3m: "UNKNOWN",
  adxSlope5m: "UNKNOWN",
  adxSlope15m: "UNKNOWN",

  adxStrength1m: "UNKNOWN",
  adxStrength3m: "UNKNOWN",
  adxStrength5m: "UNKNOWN",
  adxStrength15m: "UNKNOWN",

  dmiBias1m: "UNKNOWN",
  dmiBias3m: "UNKNOWN",
  dmiBias5m: "UNKNOWN",
  dmiBias15m: "UNKNOWN",

  macdLine1m: null,
  macdSignal1m: null,
  macdHistogram1m: null,
  macdHistogramSlope1m: "UNKNOWN",
  macdHistogramState1m: "UNKNOWN",

  macdLine3m: null,
  macdSignal3m: null,
  macdHistogram3m: null,
  macdHistogramSlope3m: "UNKNOWN",
  macdHistogramState3m: "UNKNOWN",

  macdLine5m: null,
  macdSignal5m: null,
  macdHistogram5m: null,
  macdHistogramSlope5m: "UNKNOWN",
  macdHistogramState5m: "UNKNOWN",

  macdLine15m: null,
  macdSignal15m: null,
  macdHistogram15m: null,
  macdHistogramSlope15m: "UNKNOWN",
  macdHistogramState15m: "UNKNOWN",
};

export function flattenTrendTelemetry(snapshot) {
  if (!snapshot) return TREND_TELEMETRY_DEFAULTS;

  const ema = snapshot.ema ?? {};
  const adx = snapshot.adxDmi ?? {};
  const macd = snapshot.macd ?? {};
  const labels = snapshot.labels ?? {};
  const scores = snapshot.scores ?? {};

  return {
    ...TREND_TELEMETRY_DEFAULTS,

    trendTelemetry: snapshot,
    trendTelemetryComplete: snapshot.telemetryComplete ?? false,
    trendMissingFields: snapshot.missingFields ?? [],
    trendWarnings: snapshot.warnings ?? [],

    trendCompositeLabel: labels.trendCompositeLabel ?? "TREND_UNKNOWN",
    trendShortSetupLabel: labels.trendShortSetupLabel ?? "TREND_SHORT_UNKNOWN",
    trendLongSetupLabel: labels.trendLongSetupLabel ?? "TREND_LONG_UNKNOWN",
    trendShortScore: scores.trendShortScore ?? 0,
    trendLongScore: scores.trendLongScore ?? 0,

    ema9_1m: ema["1m"]?.ema9 ?? null,
    ema20_1m: ema["1m"]?.ema20 ?? null,
    ema50_1m: ema["1m"]?.ema50 ?? null,
    ema9_3m: ema["3m"]?.ema9 ?? null,
    ema20_3m: ema["3m"]?.ema20 ?? null,
    ema50_3m: ema["3m"]?.ema50 ?? null,
    ema9_5m: ema["5m"]?.ema9 ?? null,
    ema20_5m: ema["5m"]?.ema20 ?? null,
    ema50_5m: ema["5m"]?.ema50 ?? null,
    ema9_15m: ema["15m"]?.ema9 ?? null,
    ema20_15m: ema["15m"]?.ema20 ?? null,
    ema50_15m: ema["15m"]?.ema50 ?? null,
    ema9_30m: ema["30m"]?.ema9 ?? null,
    ema20_30m: ema["30m"]?.ema20 ?? null,
    ema50_30m: ema["30m"]?.ema50 ?? null,
    ema9_1h: ema["1h"]?.ema9 ?? null,
    ema20_1h: ema["1h"]?.ema20 ?? null,
    ema50_1h: ema["1h"]?.ema50 ?? null,

    priceVsEma9_1mPct: ema["1m"]?.priceVsEma9Pct ?? null,
    priceVsEma20_1mPct: ema["1m"]?.priceVsEma20Pct ?? null,
    priceVsEma50_1mPct: ema["1m"]?.priceVsEma50Pct ?? null,

    priceVsEma9_3mPct: ema["3m"]?.priceVsEma9Pct ?? null,
    priceVsEma20_3mPct: ema["3m"]?.priceVsEma20Pct ?? null,
    priceVsEma50_3mPct: ema["3m"]?.priceVsEma50Pct ?? null,

    priceVsEma9_5mPct: ema["5m"]?.priceVsEma9Pct ?? null,
    priceVsEma20_5mPct: ema["5m"]?.priceVsEma20Pct ?? null,
    priceVsEma50_5mPct: ema["5m"]?.priceVsEma50Pct ?? null,

    priceVsEma9_15mPct: ema["15m"]?.priceVsEma9Pct ?? null,
    priceVsEma20_15mPct: ema["15m"]?.priceVsEma20Pct ?? null,
    priceVsEma50_15mPct: ema["15m"]?.priceVsEma50Pct ?? null,

    priceVsEma9_30mPct: ema["30m"]?.priceVsEma9Pct ?? null,
    priceVsEma20_30mPct: ema["30m"]?.priceVsEma20Pct ?? null,
    priceVsEma50_30mPct: ema["30m"]?.priceVsEma50Pct ?? null,

    priceVsEma9_1hPct: ema["1h"]?.priceVsEma9Pct ?? null,
    priceVsEma20_1hPct: ema["1h"]?.priceVsEma20Pct ?? null,
    priceVsEma50_1hPct: ema["1h"]?.priceVsEma50Pct ?? null,

    ema9Slope1mPct: ema["1m"]?.ema9SlopePct ?? null,
    ema20Slope1mPct: ema["1m"]?.ema20SlopePct ?? null,
    ema50Slope1mPct: ema["1m"]?.ema50SlopePct ?? null,

    ema9Slope3mPct: ema["3m"]?.ema9SlopePct ?? null,
    ema20Slope3mPct: ema["3m"]?.ema20SlopePct ?? null,
    ema50Slope3mPct: ema["3m"]?.ema50SlopePct ?? null,

    ema9Slope5mPct: ema["5m"]?.ema9SlopePct ?? null,
    ema20Slope5mPct: ema["5m"]?.ema20SlopePct ?? null,
    ema50Slope5mPct: ema["5m"]?.ema50SlopePct ?? null,

    ema9Slope15mPct: ema["15m"]?.ema9SlopePct ?? null,
    ema20Slope15mPct: ema["15m"]?.ema20SlopePct ?? null,
    ema50Slope15mPct: ema["15m"]?.ema50SlopePct ?? null,

    emaStack1m: ema["1m"]?.emaStack ?? "UNKNOWN",
    emaStack3m: ema["3m"]?.emaStack ?? "UNKNOWN",
    emaStack5m: ema["5m"]?.emaStack ?? "UNKNOWN",
    emaStack15m: ema["15m"]?.emaStack ?? "UNKNOWN",

    emaPricePosition1m: ema["1m"]?.emaPricePosition ?? "UNKNOWN",
    emaPricePosition3m: ema["3m"]?.emaPricePosition ?? "UNKNOWN",
    emaPricePosition5m: ema["5m"]?.emaPricePosition ?? "UNKNOWN",
    emaPricePosition15m: ema["15m"]?.emaPricePosition ?? "UNKNOWN",

    emaSlopeBias1m: ema["1m"]?.emaSlopeBias ?? "UNKNOWN",
    emaSlopeBias3m: ema["3m"]?.emaSlopeBias ?? "UNKNOWN",
    emaSlopeBias5m: ema["5m"]?.emaSlopeBias ?? "UNKNOWN",
    emaSlopeBias15m: ema["15m"]?.emaSlopeBias ?? "UNKNOWN",

    adx14_1m: adx["1m"]?.adx14 ?? null,
    adx14_3m: adx["3m"]?.adx14 ?? null,
    adx14_5m: adx["5m"]?.adx14 ?? null,
    adx14_15m: adx["15m"]?.adx14 ?? null,
    adx14_30m: adx["30m"]?.adx14 ?? null,
    adx14_1h: adx["1h"]?.adx14 ?? null,

    plusDi14_1m: adx["1m"]?.plusDi14 ?? null,
    minusDi14_1m: adx["1m"]?.minusDi14 ?? null,
    plusDi14_3m: adx["3m"]?.plusDi14 ?? null,
    minusDi14_3m: adx["3m"]?.minusDi14 ?? null,
    plusDi14_5m: adx["5m"]?.plusDi14 ?? null,
    minusDi14_5m: adx["5m"]?.minusDi14 ?? null,
    plusDi14_15m: adx["15m"]?.plusDi14 ?? null,
    minusDi14_15m: adx["15m"]?.minusDi14 ?? null,

    diSpread1m: adx["1m"]?.diSpread ?? null,
    diSpread3m: adx["3m"]?.diSpread ?? null,
    diSpread5m: adx["5m"]?.diSpread ?? null,
    diSpread15m: adx["15m"]?.diSpread ?? null,

    adxSlope1m: adx["1m"]?.adxSlope ?? "UNKNOWN",
    adxSlope3m: adx["3m"]?.adxSlope ?? "UNKNOWN",
    adxSlope5m: adx["5m"]?.adxSlope ?? "UNKNOWN",
    adxSlope15m: adx["15m"]?.adxSlope ?? "UNKNOWN",

    adxStrength1m: adx["1m"]?.adxStrength ?? "UNKNOWN",
    adxStrength3m: adx["3m"]?.adxStrength ?? "UNKNOWN",
    adxStrength5m: adx["5m"]?.adxStrength ?? "UNKNOWN",
    adxStrength15m: adx["15m"]?.adxStrength ?? "UNKNOWN",

    dmiBias1m: adx["1m"]?.dmiBias ?? "UNKNOWN",
    dmiBias3m: adx["3m"]?.dmiBias ?? "UNKNOWN",
    dmiBias5m: adx["5m"]?.dmiBias ?? "UNKNOWN",
    dmiBias15m: adx["15m"]?.dmiBias ?? "UNKNOWN",

    macdLine1m: macd["1m"]?.macdLine ?? null,
    macdSignal1m: macd["1m"]?.macdSignal ?? null,
    macdHistogram1m: macd["1m"]?.macdHistogram ?? null,
    macdHistogramSlope1m: macd["1m"]?.macdHistogramSlope ?? "UNKNOWN",
    macdHistogramState1m: macd["1m"]?.macdHistogramState ?? "UNKNOWN",

    macdLine3m: macd["3m"]?.macdLine ?? null,
    macdSignal3m: macd["3m"]?.macdSignal ?? null,
    macdHistogram3m: macd["3m"]?.macdHistogram ?? null,
    macdHistogramSlope3m: macd["3m"]?.macdHistogramSlope ?? "UNKNOWN",
    macdHistogramState3m: macd["3m"]?.macdHistogramState ?? "UNKNOWN",

    macdLine5m: macd["5m"]?.macdLine ?? null,
    macdSignal5m: macd["5m"]?.macdSignal ?? null,
    macdHistogram5m: macd["5m"]?.macdHistogram ?? null,
    macdHistogramSlope5m: macd["5m"]?.macdHistogramSlope ?? "UNKNOWN",
    macdHistogramState5m: macd["5m"]?.macdHistogramState ?? "UNKNOWN",

    macdLine15m: macd["15m"]?.macdLine ?? null,
    macdSignal15m: macd["15m"]?.macdSignal ?? null,
    macdHistogram15m: macd["15m"]?.macdHistogram ?? null,
    macdHistogramSlope15m: macd["15m"]?.macdHistogramSlope ?? "UNKNOWN",
    macdHistogramState15m: macd["15m"]?.macdHistogramState ?? "UNKNOWN",
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

export const TREND_TELEMETRY_CSV_HEADERS = [
  "trendTelemetryComplete",
  "trendMissingFields",
  "trendWarnings",
  "trendCompositeLabel",
  "trendShortSetupLabel",
  "trendLongSetupLabel",
  "trendShortScore",
  "trendLongScore",

  "ema9_1m",
  "ema20_1m",
  "ema50_1m",
  "ema9_3m",
  "ema20_3m",
  "ema50_3m",
  "ema9_5m",
  "ema20_5m",
  "ema50_5m",
  "ema9_15m",
  "ema20_15m",
  "ema50_15m",

  "priceVsEma9_1mPct",
  "priceVsEma20_1mPct",
  "priceVsEma50_1mPct",
  "priceVsEma9_3mPct",
  "priceVsEma20_3mPct",
  "priceVsEma50_3mPct",
  "priceVsEma9_5mPct",
  "priceVsEma20_5mPct",
  "priceVsEma50_5mPct",
  "priceVsEma20_15mPct",
  "priceVsEma50_15mPct",

  "emaStack1m",
  "emaStack3m",
  "emaStack5m",
  "emaStack15m",
  "emaPricePosition1m",
  "emaPricePosition3m",
  "emaPricePosition5m",
  "emaPricePosition15m",
  "emaSlopeBias1m",
  "emaSlopeBias3m",
  "emaSlopeBias5m",
  "emaSlopeBias15m",

  "adx14_1m",
  "adx14_3m",
  "adx14_5m",
  "adx14_15m",
  "plusDi14_1m",
  "minusDi14_1m",
  "plusDi14_3m",
  "minusDi14_3m",
  "plusDi14_5m",
  "minusDi14_5m",
  "plusDi14_15m",
  "minusDi14_15m",
  "diSpread1m",
  "diSpread3m",
  "diSpread5m",
  "diSpread15m",
  "adxSlope1m",
  "adxSlope3m",
  "adxSlope5m",
  "adxSlope15m",
  "adxStrength1m",
  "adxStrength3m",
  "adxStrength5m",
  "adxStrength15m",
  "dmiBias1m",
  "dmiBias3m",
  "dmiBias5m",
  "dmiBias15m",

  "macdLine1m",
  "macdSignal1m",
  "macdHistogram1m",
  "macdHistogramSlope1m",
  "macdHistogramState1m",
  "macdLine3m",
  "macdSignal3m",
  "macdHistogram3m",
  "macdHistogramSlope3m",
  "macdHistogramState3m",
  "macdLine5m",
  "macdSignal5m",
  "macdHistogram5m",
  "macdHistogramSlope5m",
  "macdHistogramState5m",
  "macdLine15m",
  "macdSignal15m",
  "macdHistogram15m",
  "macdHistogramSlope15m",
  "macdHistogramState15m",
];

export function trendTelemetryCSVRow(s) {
  return [
    csvCell(s.trendTelemetryComplete ?? ""),
    csvCell(pipeSeparated(s.trendMissingFields ?? [])),
    csvCell(pipeSeparated(s.trendWarnings ?? [])),
    csvCell(s.trendCompositeLabel ?? ""),
    csvCell(s.trendShortSetupLabel ?? ""),
    csvCell(s.trendLongSetupLabel ?? ""),
    csvCell(s.trendShortScore ?? ""),
    csvCell(s.trendLongScore ?? ""),

    csvCell(s.ema9_1m ?? ""),
    csvCell(s.ema20_1m ?? ""),
    csvCell(s.ema50_1m ?? ""),
    csvCell(s.ema9_3m ?? ""),
    csvCell(s.ema20_3m ?? ""),
    csvCell(s.ema50_3m ?? ""),
    csvCell(s.ema9_5m ?? ""),
    csvCell(s.ema20_5m ?? ""),
    csvCell(s.ema50_5m ?? ""),
    csvCell(s.ema9_15m ?? ""),
    csvCell(s.ema20_15m ?? ""),
    csvCell(s.ema50_15m ?? ""),

    csvCell(s.priceVsEma9_1mPct ?? ""),
    csvCell(s.priceVsEma20_1mPct ?? ""),
    csvCell(s.priceVsEma50_1mPct ?? ""),
    csvCell(s.priceVsEma9_3mPct ?? ""),
    csvCell(s.priceVsEma20_3mPct ?? ""),
    csvCell(s.priceVsEma50_3mPct ?? ""),
    csvCell(s.priceVsEma9_5mPct ?? ""),
    csvCell(s.priceVsEma20_5mPct ?? ""),
    csvCell(s.priceVsEma50_5mPct ?? ""),
    csvCell(s.priceVsEma20_15mPct ?? ""),
    csvCell(s.priceVsEma50_15mPct ?? ""),

    csvCell(s.emaStack1m ?? ""),
    csvCell(s.emaStack3m ?? ""),
    csvCell(s.emaStack5m ?? ""),
    csvCell(s.emaStack15m ?? ""),
    csvCell(s.emaPricePosition1m ?? ""),
    csvCell(s.emaPricePosition3m ?? ""),
    csvCell(s.emaPricePosition5m ?? ""),
    csvCell(s.emaPricePosition15m ?? ""),
    csvCell(s.emaSlopeBias1m ?? ""),
    csvCell(s.emaSlopeBias3m ?? ""),
    csvCell(s.emaSlopeBias5m ?? ""),
    csvCell(s.emaSlopeBias15m ?? ""),

    csvCell(s.adx14_1m ?? ""),
    csvCell(s.adx14_3m ?? ""),
    csvCell(s.adx14_5m ?? ""),
    csvCell(s.adx14_15m ?? ""),
    csvCell(s.plusDi14_1m ?? ""),
    csvCell(s.minusDi14_1m ?? ""),
    csvCell(s.plusDi14_3m ?? ""),
    csvCell(s.minusDi14_3m ?? ""),
    csvCell(s.plusDi14_5m ?? ""),
    csvCell(s.minusDi14_5m ?? ""),
    csvCell(s.plusDi14_15m ?? ""),
    csvCell(s.minusDi14_15m ?? ""),
    csvCell(s.diSpread1m ?? ""),
    csvCell(s.diSpread3m ?? ""),
    csvCell(s.diSpread5m ?? ""),
    csvCell(s.diSpread15m ?? ""),
    csvCell(s.adxSlope1m ?? ""),
    csvCell(s.adxSlope3m ?? ""),
    csvCell(s.adxSlope5m ?? ""),
    csvCell(s.adxSlope15m ?? ""),
    csvCell(s.adxStrength1m ?? ""),
    csvCell(s.adxStrength3m ?? ""),
    csvCell(s.adxStrength5m ?? ""),
    csvCell(s.adxStrength15m ?? ""),
    csvCell(s.dmiBias1m ?? ""),
    csvCell(s.dmiBias3m ?? ""),
    csvCell(s.dmiBias5m ?? ""),
    csvCell(s.dmiBias15m ?? ""),

    csvCell(s.macdLine1m ?? ""),
    csvCell(s.macdSignal1m ?? ""),
    csvCell(s.macdHistogram1m ?? ""),
    csvCell(s.macdHistogramSlope1m ?? ""),
    csvCell(s.macdHistogramState1m ?? ""),
    csvCell(s.macdLine3m ?? ""),
    csvCell(s.macdSignal3m ?? ""),
    csvCell(s.macdHistogram3m ?? ""),
    csvCell(s.macdHistogramSlope3m ?? ""),
    csvCell(s.macdHistogramState3m ?? ""),
    csvCell(s.macdLine5m ?? ""),
    csvCell(s.macdSignal5m ?? ""),
    csvCell(s.macdHistogram5m ?? ""),
    csvCell(s.macdHistogramSlope5m ?? ""),
    csvCell(s.macdHistogramState5m ?? ""),
    csvCell(s.macdLine15m ?? ""),
    csvCell(s.macdSignal15m ?? ""),
    csvCell(s.macdHistogram15m ?? ""),
    csvCell(s.macdHistogramSlope15m ?? ""),
    csvCell(s.macdHistogramState15m ?? ""),
  ];
}
