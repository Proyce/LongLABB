export const ADVANCED_MARKET_TELEMETRY_CONFIG = {
  enabled: true,
  strictAdvancedMarketTelemetry: false,

  version: "advanced-market-telemetry-v1",

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

  bollinger: {
    period: 20,
    stdDev: 2,
  },

  keltner: {
    period: 20,
    atrPeriod: 14,
    multiplier: 1.5,
  },

  marketStructure: {
    swingLookback: 3,
    structureLookback: 30,
    breakoutLookback: 20,
  },

  oi: {
    shortWindowMs: 60_000,
    mediumWindowMs: 5 * 60_000,
    longWindowMs: 15 * 60_000,
    minDeltaPct: 0.25,
  },

  liquidation: {
    enabled: true,
    source: "binance-force-order-stream-if-available",
    shortWindowMs: 60_000,
    mediumWindowMs: 5 * 60_000,
  },

  volumeFlow: {
    mfiPeriod: 14,
    cmfPeriod: 20,
    obvSlopeLookback: 5,
    mfiSlopeLookback: 3,
    cmfSlopeLookback: 3,
  },

  thresholds: {
    bandTouchPct: 0.15,
    bandExtensionPct: 0.5,
    squeezeWidthPct: 1.5,

    mfiOversold: 20,
    mfiLow: 35,
    mfiHigh: 65,
    mfiOverbought: 80,

    cmfBullish: 0.05,
    cmfBearish: -0.05,

    obvSlopeFlatPct: 0.05,
  },
};

const FLATTEN_TIMEFRAMES = ["1m", "3m", "5m", "15m"];
const STRUCTURE_PRIMARY_TIMEFRAMES = ["1m", "3m", "5m"];
const STRUCTURE_ALL_TIMEFRAMES = ["1m", "3m", "5m", "15m"];

function finiteNumberOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fixedOrNull(value, digits = 4) {
  const n = finiteNumberOrNull(value);
  return n == null ? null : Number(n.toFixed(digits));
}

function clampScore(value) {
  return Math.max(-100, Math.min(100, value));
}

function pctDiff(value, baseline, digits = 4) {
  const v = finiteNumberOrNull(value);
  const b = finiteNumberOrNull(baseline);
  if (v == null || b == null || !b) return null;
  return fixedOrNull(((v - b) / b) * 100, digits);
}

function getClosedKlines(klines, useClosedCandlesOnly = true) {
  if (!Array.isArray(klines)) return [];
  if (!useClosedCandlesOnly) return klines;
  return klines.length > 1 ? klines.slice(0, -1) : [];
}

function isKlineArray(input) {
  return Array.isArray(input?.[0]);
}

function numericValuesFromInput(input, config = ADVANCED_MARKET_TELEMETRY_CONFIG) {
  if (!Array.isArray(input)) return [];
  if (isKlineArray(input)) {
    return getClosedKlines(input, config.useClosedCandlesOnly)
      .map(k => finiteNumberOrNull(k?.[4]))
      .filter(v => v != null);
  }
  return input.map(finiteNumberOrNull).filter(v => v != null);
}

function validKlines(input, useClosedCandlesOnly = true) {
  return getClosedKlines(input, useClosedCandlesOnly).filter(k =>
    finiteNumberOrNull(k?.[1]) != null &&
    finiteNumberOrNull(k?.[2]) != null &&
    finiteNumberOrNull(k?.[3]) != null &&
    finiteNumberOrNull(k?.[4]) != null &&
    finiteNumberOrNull(k?.[5]) != null
  );
}

function latestClose(klines) {
  const last = klines?.length ? klines[klines.length - 1] : null;
  return finiteNumberOrNull(last?.[4]);
}

function latestHigh(klines) {
  const last = klines?.length ? klines[klines.length - 1] : null;
  return finiteNumberOrNull(last?.[2]);
}

function latestLow(klines) {
  const last = klines?.length ? klines[klines.length - 1] : null;
  return finiteNumberOrNull(last?.[3]);
}

function average(values) {
  if (!Array.isArray(values) || !values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const numeric = values.map(Number);
  if (numeric.some(v => !Number.isFinite(v))) return null;

  const multiplier = 2 / (period + 1);
  let current = average(numeric.slice(0, period));

  for (let i = period; i < numeric.length; i++) {
    current = ((numeric[i] - current) * multiplier) + current;
  }

  return current;
}

function computeTrueRanges(klines) {
  if (!Array.isArray(klines) || klines.length < 2) return [];
  const out = [];

  for (let i = 1; i < klines.length; i++) {
    const high = finiteNumberOrNull(klines[i]?.[2]);
    const low = finiteNumberOrNull(klines[i]?.[3]);
    const prevClose = finiteNumberOrNull(klines[i - 1]?.[4]);

    if (high == null || low == null || prevClose == null) continue;

    out.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    ));
  }

  return out;
}

function computeAtr(klines, period) {
  const trs = computeTrueRanges(klines);
  if (trs.length < period) return null;
  return average(trs.slice(-period));
}

function normalizeBandOptions(period, stdDev, config) {
  if (period && typeof period === "object") {
    const opts = period;
    return {
      period: opts.period ?? opts.bollinger?.period ?? ADVANCED_MARKET_TELEMETRY_CONFIG.bollinger.period,
      stdDev: opts.stdDev ?? opts.bollinger?.stdDev ?? ADVANCED_MARKET_TELEMETRY_CONFIG.bollinger.stdDev,
      config: { ...ADVANCED_MARKET_TELEMETRY_CONFIG, ...opts },
    };
  }

  return { period, stdDev, config };
}

export function computeBollingerBands(
  input,
  period = ADVANCED_MARKET_TELEMETRY_CONFIG.bollinger.period,
  stdDev = ADVANCED_MARKET_TELEMETRY_CONFIG.bollinger.stdDev,
  config = ADVANCED_MARKET_TELEMETRY_CONFIG,
) {
  const normalized = normalizeBandOptions(period, stdDev, config);
  period = normalized.period;
  stdDev = normalized.stdDev;
  config = normalized.config;

  const values = numericValuesFromInput(input, config);

  if (values.length < period) {
    return {
      upper: null,
      middle: null,
      lower: null,
      widthPct: null,
      notEnoughCandles: true,
    };
  }

  const window = values.slice(-period);
  const middle = average(window);
  const variance = average(window.map(v => (v - middle) ** 2));
  const std = Math.sqrt(variance);
  const upper = middle + (stdDev * std);
  const lower = middle - (stdDev * std);
  const widthPct = middle ? ((upper - lower) / middle) * 100 : null;

  return {
    upper: fixedOrNull(upper, 8),
    middle: fixedOrNull(middle, 8),
    lower: fixedOrNull(lower, 8),
    widthPct: fixedOrNull(widthPct, 4),
    notEnoughCandles: false,
  };
}

function normalizeKeltnerOptions(period, atrPeriod, multiplier, config) {
  if (period && typeof period === "object") {
    const opts = period;
    return {
      period: opts.period ?? opts.keltner?.period ?? ADVANCED_MARKET_TELEMETRY_CONFIG.keltner.period,
      atrPeriod: opts.atrPeriod ?? opts.keltner?.atrPeriod ?? ADVANCED_MARKET_TELEMETRY_CONFIG.keltner.atrPeriod,
      multiplier: opts.multiplier ?? opts.keltner?.multiplier ?? ADVANCED_MARKET_TELEMETRY_CONFIG.keltner.multiplier,
      config: { ...ADVANCED_MARKET_TELEMETRY_CONFIG, ...opts },
    };
  }

  return { period, atrPeriod, multiplier, config };
}

export function computeKeltnerChannels(
  input,
  period = ADVANCED_MARKET_TELEMETRY_CONFIG.keltner.period,
  atrPeriod = ADVANCED_MARKET_TELEMETRY_CONFIG.keltner.atrPeriod,
  multiplier = ADVANCED_MARKET_TELEMETRY_CONFIG.keltner.multiplier,
  config = ADVANCED_MARKET_TELEMETRY_CONFIG,
) {
  const normalized = normalizeKeltnerOptions(period, atrPeriod, multiplier, config);
  period = normalized.period;
  atrPeriod = normalized.atrPeriod;
  multiplier = normalized.multiplier;
  config = normalized.config;

  const klines = validKlines(input, config.useClosedCandlesOnly);
  const closes = klines.map(k => finiteNumberOrNull(k?.[4])).filter(v => v != null);

  if (klines.length < Math.max(period, atrPeriod + 1) || closes.length < period) {
    return {
      upper: null,
      middle: null,
      lower: null,
      widthPct: null,
      atr: null,
      notEnoughCandles: true,
    };
  }

  const middle = ema(closes, period);
  const atr = computeAtr(klines, atrPeriod);

  if (middle == null || atr == null) {
    return {
      upper: null,
      middle: fixedOrNull(middle, 8),
      lower: null,
      widthPct: null,
      atr: fixedOrNull(atr, 8),
      notEnoughCandles: true,
    };
  }

  const upper = middle + (multiplier * atr);
  const lower = middle - (multiplier * atr);
  const widthPct = middle ? ((upper - lower) / middle) * 100 : null;

  return {
    upper: fixedOrNull(upper, 8),
    middle: fixedOrNull(middle, 8),
    lower: fixedOrNull(lower, 8),
    widthPct: fixedOrNull(widthPct, 4),
    atr: fixedOrNull(atr, 8),
    notEnoughCandles: false,
  };
}

export function classifyBandExtension(
  priceOrParams,
  bandsArg = null,
  prefixArg = "BB",
  touchPctArg = ADVANCED_MARKET_TELEMETRY_CONFIG.thresholds.bandTouchPct,
) {
  const params = priceOrParams && typeof priceOrParams === "object" && !Array.isArray(priceOrParams)
    ? priceOrParams
    : {
        price: priceOrParams,
        ...(bandsArg ?? {}),
        prefix: prefixArg,
        touchPct: touchPctArg,
      };

  const price = finiteNumberOrNull(params.price);
  const upper = finiteNumberOrNull(params.upper ?? params.bbUpper ?? params.kcUpper);
  const lower = finiteNumberOrNull(params.lower ?? params.bbLower ?? params.kcLower);
  const prefix = params.prefix ?? prefixArg ?? "BB";
  const touchPct = finiteNumberOrNull(params.touchPct) ?? touchPctArg;

  if (price == null || upper == null || lower == null || !upper || !lower) {
    return `${prefix}_UNKNOWN`;
  }

  if (price > upper) return `${prefix}_ABOVE_UPPER`;
  if (price >= upper * (1 - touchPct / 100)) return `${prefix}_TOUCHING_UPPER`;
  if (price < lower) return `${prefix}_BELOW_LOWER`;
  if (price <= lower * (1 + touchPct / 100)) return `${prefix}_TOUCHING_LOWER`;

  return prefix === "KC" ? "KC_INSIDE_CHANNEL" : "BB_INSIDE_BANDS";
}

function classifyBandExpansion(currentWidthPct, previousWidthPct) {
  const current = finiteNumberOrNull(currentWidthPct);
  const previous = finiteNumberOrNull(previousWidthPct);
  if (current == null || previous == null || !previous) return "UNKNOWN";

  const deltaPct = ((current - previous) / previous) * 100;
  if (deltaPct > 5) return "EXPANDING";
  if (deltaPct < -5) return "CONTRACTING";
  return "FLAT";
}

export function classifySqueezeState({
  bb,
  kc,
  previousBb = null,
  previousKc = null,
} = {}) {
  const squeezeOn = (
    bb?.upper != null &&
    bb?.lower != null &&
    kc?.upper != null &&
    kc?.lower != null &&
    bb.upper <= kc.upper &&
    bb.lower >= kc.lower
  );

  const previousSqueezeOn = (
    previousBb?.upper != null &&
    previousBb?.lower != null &&
    previousKc?.upper != null &&
    previousKc?.lower != null &&
    previousBb.upper <= previousKc.upper &&
    previousBb.lower >= previousKc.lower
  );

  const squeezeReleased = previousSqueezeOn && !squeezeOn;
  const label = squeezeOn ? "SQUEEZE_ON" : squeezeReleased ? "SQUEEZE_RELEASED" : "NO_SQUEEZE";

  return {
    squeezeOn,
    squeezeReleased,
    label,
    bandExpansion: classifyBandExpansion(bb?.widthPct, previousBb?.widthPct),
  };
}

function emptyExtensionTelemetry(notEnoughCandles = true) {
  return {
    bbUpper: null,
    bbMiddle: null,
    bbLower: null,
    bbWidthPct: null,
    priceVsBbUpperPct: null,
    priceVsBbMiddlePct: null,
    priceVsBbLowerPct: null,
    bbExtension: "BB_UNKNOWN",

    kcUpper: null,
    kcMiddle: null,
    kcLower: null,
    kcWidthPct: null,
    priceVsKcUpperPct: null,
    priceVsKcMiddlePct: null,
    priceVsKcLowerPct: null,
    kcExtension: "KC_UNKNOWN",

    squeezeOn: false,
    squeezeReleased: false,
    bandExpansion: "UNKNOWN",
    notEnoughCandles,
  };
}

function computeExtensionForKlines(klines, entryPrice, config) {
  const closed = validKlines(klines, config.useClosedCandlesOnly);
  const price = finiteNumberOrNull(entryPrice) ?? latestClose(closed);

  if (!closed.length || price == null) {
    return emptyExtensionTelemetry(true);
  }

  const noSliceConfig = { ...config, useClosedCandlesOnly: false };
  const bb = computeBollingerBands(
    closed,
    config.bollinger.period,
    config.bollinger.stdDev,
    noSliceConfig,
  );
  const previousBb = computeBollingerBands(
    closed.slice(0, -1),
    config.bollinger.period,
    config.bollinger.stdDev,
    noSliceConfig,
  );
  const kc = computeKeltnerChannels(
    closed,
    config.keltner.period,
    config.keltner.atrPeriod,
    config.keltner.multiplier,
    noSliceConfig,
  );
  const previousKc = computeKeltnerChannels(
    closed.slice(0, -1),
    config.keltner.period,
    config.keltner.atrPeriod,
    config.keltner.multiplier,
    noSliceConfig,
  );
  const squeeze = classifySqueezeState({ bb, kc, previousBb, previousKc });

  return {
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    bbWidthPct: bb.widthPct,
    priceVsBbUpperPct: pctDiff(price, bb.upper),
    priceVsBbMiddlePct: pctDiff(price, bb.middle),
    priceVsBbLowerPct: pctDiff(price, bb.lower),
    bbExtension: classifyBandExtension({
      price,
      upper: bb.upper,
      lower: bb.lower,
      prefix: "BB",
      touchPct: config.thresholds.bandTouchPct,
    }),

    kcUpper: kc.upper,
    kcMiddle: kc.middle,
    kcLower: kc.lower,
    kcWidthPct: kc.widthPct,
    priceVsKcUpperPct: pctDiff(price, kc.upper),
    priceVsKcMiddlePct: pctDiff(price, kc.middle),
    priceVsKcLowerPct: pctDiff(price, kc.lower),
    kcExtension: classifyBandExtension({
      price,
      upper: kc.upper,
      lower: kc.lower,
      prefix: "KC",
      touchPct: config.thresholds.bandTouchPct,
    }),

    squeezeOn: squeeze.squeezeOn,
    squeezeReleased: squeeze.squeezeReleased,
    bandExpansion: squeeze.bandExpansion,
    notEnoughCandles: bb.notEnoughCandles || kc.notEnoughCandles,
  };
}

export function computeExtensionTelemetry({
  klinesByInterval,
  entryPrice = null,
} = {}, config = ADVANCED_MARKET_TELEMETRY_CONFIG) {
  const extension = {};

  for (const tf of config.timeframes) {
    extension[tf] = computeExtensionForKlines(
      klinesByInterval?.[tf] ?? null,
      entryPrice,
      config,
    );
  }

  return extension;
}

export function computeSwingPoints(
  klines,
  lookback = ADVANCED_MARKET_TELEMETRY_CONFIG.marketStructure.swingLookback,
  configOrUseClosedCandlesOnly = false,
) {
  const useClosedCandlesOnly = typeof configOrUseClosedCandlesOnly === "object"
    ? configOrUseClosedCandlesOnly.useClosedCandlesOnly ?? false
    : Boolean(configOrUseClosedCandlesOnly);
  const rows = validKlines(klines, useClosedCandlesOnly);
  const swingHighs = [];
  const swingLows = [];

  if (rows.length < (lookback * 2) + 1) {
    return { swingHighs, swingLows };
  }

  for (let i = lookback; i < rows.length - lookback; i++) {
    const high = finiteNumberOrNull(rows[i]?.[2]);
    const low = finiteNumberOrNull(rows[i]?.[3]);
    const left = rows.slice(i - lookback, i);
    const right = rows.slice(i + 1, i + lookback + 1);

    const higherThanLeft = left.every(k => high > finiteNumberOrNull(k?.[2]));
    const higherThanRight = right.every(k => high > finiteNumberOrNull(k?.[2]));
    const lowerThanLeft = left.every(k => low < finiteNumberOrNull(k?.[3]));
    const lowerThanRight = right.every(k => low < finiteNumberOrNull(k?.[3]));

    if (high != null && higherThanLeft && higherThanRight) {
      swingHighs.push({ index: i, price: high, ts: finiteNumberOrNull(rows[i]?.[0]) });
    }

    if (low != null && lowerThanLeft && lowerThanRight) {
      swingLows.push({ index: i, price: low, ts: finiteNumberOrNull(rows[i]?.[0]) });
    }
  }

  return { swingHighs, swingLows };
}

function lastTwoSwingPrices(points) {
  const last = points?.length ? points[points.length - 1].price : null;
  const previous = points?.length > 1 ? points[points.length - 2].price : null;
  return { last, previous };
}

export function classifyMarketStructure(input = {}) {
  const highPair = input.swingHighs ? lastTwoSwingPrices(input.swingHighs) : {};
  const lowPair = input.swingLows ? lastTwoSwingPrices(input.swingLows) : {};
  const lastSwingHigh = finiteNumberOrNull(input.lastSwingHigh ?? highPair.last);
  const previousSwingHigh = finiteNumberOrNull(input.previousSwingHigh ?? highPair.previous);
  const lastSwingLow = finiteNumberOrNull(input.lastSwingLow ?? lowPair.last);
  const previousSwingLow = finiteNumberOrNull(input.previousSwingLow ?? lowPair.previous);

  if (
    lastSwingHigh == null ||
    previousSwingHigh == null ||
    lastSwingLow == null ||
    previousSwingLow == null
  ) {
    return "UNKNOWN";
  }

  const higherHigh = lastSwingHigh > previousSwingHigh;
  const higherLow = lastSwingLow > previousSwingLow;
  const lowerHigh = lastSwingHigh < previousSwingHigh;
  const lowerLow = lastSwingLow < previousSwingLow;

  if (higherHigh && higherLow) return "UPTREND";
  if (lowerHigh && lowerLow) return "DOWNTREND";

  const highChangePct = Math.abs(pctDiff(lastSwingHigh, previousSwingHigh) ?? 0);
  const lowChangePct = Math.abs(pctDiff(lastSwingLow, previousSwingLow) ?? 0);
  if (highChangePct <= 0.25 && lowChangePct <= 0.25) return "RANGE";

  return "CHOP";
}

function emptyMarketStructureTelemetry(notEnoughCandles = true) {
  return {
    structure: "UNKNOWN",
    lastSwingHigh: null,
    lastSwingLow: null,
    previousSwingHigh: null,
    previousSwingLow: null,
    brokeRecentLow: false,
    brokeRecentHigh: false,
    failedBreakout: false,
    failedBreakdown: false,
    lowerHighConfirmed: false,
    lowerLowConfirmed: false,
    higherHighConfirmed: false,
    higherLowConfirmed: false,
    structureBreakDirection: "UNKNOWN",
    notEnoughCandles,
  };
}

export function computeMarketStructureTelemetry(
  klines,
  entryPrice = null,
  config = ADVANCED_MARKET_TELEMETRY_CONFIG,
) {
  const { swingLookback, breakoutLookback } = config.marketStructure;
  const closed = validKlines(klines, config.useClosedCandlesOnly);

  if (closed.length < Math.max((swingLookback * 2) + 3, 6)) {
    return emptyMarketStructureTelemetry(true);
  }

  const swingPoints = computeSwingPoints(closed, swingLookback, false);
  const highPair = lastTwoSwingPrices(swingPoints.swingHighs);
  const lowPair = lastTwoSwingPrices(swingPoints.swingLows);
  const price = finiteNumberOrNull(entryPrice) ?? latestClose(closed);
  const lastClose = latestClose(closed);
  const currentHigh = latestHigh(closed);
  const currentLow = latestLow(closed);
  const priorWindow = closed.slice(-(breakoutLookback + 1), -1);
  const recentLow = priorWindow.length
    ? Math.min(...priorWindow.map(k => finiteNumberOrNull(k?.[3])).filter(v => v != null))
    : null;
  const recentHigh = priorWindow.length
    ? Math.max(...priorWindow.map(k => finiteNumberOrNull(k?.[2])).filter(v => v != null))
    : null;

  const brokeRecentLow = price != null && recentLow != null ? price < recentLow : false;
  const brokeRecentHigh = price != null && recentHigh != null ? price > recentHigh : false;
  const failedBreakout = (
    currentHigh != null &&
    recentHigh != null &&
    lastClose != null &&
    currentHigh > recentHigh &&
    lastClose < recentHigh
  );
  const failedBreakdown = (
    currentLow != null &&
    recentLow != null &&
    lastClose != null &&
    currentLow < recentLow &&
    lastClose > recentLow
  );

  const lowerHighConfirmed = highPair.last != null && highPair.previous != null
    ? highPair.last < highPair.previous
    : false;
  const lowerLowConfirmed = lowPair.last != null && lowPair.previous != null
    ? lowPair.last < lowPair.previous
    : false;
  const higherHighConfirmed = highPair.last != null && highPair.previous != null
    ? highPair.last > highPair.previous
    : false;
  const higherLowConfirmed = lowPair.last != null && lowPair.previous != null
    ? lowPair.last > lowPair.previous
    : false;
  const structure = classifyMarketStructure({
    lastSwingHigh: highPair.last,
    previousSwingHigh: highPair.previous,
    lastSwingLow: lowPair.last,
    previousSwingLow: lowPair.previous,
  });

  const structureBreakDirection = brokeRecentLow ? "DOWN" : brokeRecentHigh ? "UP" : "NONE";

  return {
    structure,
    lastSwingHigh: highPair.last ?? null,
    lastSwingLow: lowPair.last ?? null,
    previousSwingHigh: highPair.previous ?? null,
    previousSwingLow: lowPair.previous ?? null,
    brokeRecentLow,
    brokeRecentHigh,
    failedBreakout,
    failedBreakdown,
    lowerHighConfirmed,
    lowerLowConfirmed,
    higherHighConfirmed,
    higherLowConfirmed,
    structureBreakDirection,
    notEnoughCandles: false,
  };
}

export function classifyOiPressure(
  paramsOrPriceDeltaPct,
  oiDeltaPctArg = null,
  minDeltaPctArg = ADVANCED_MARKET_TELEMETRY_CONFIG.oi.minDeltaPct,
) {
  const params = paramsOrPriceDeltaPct && typeof paramsOrPriceDeltaPct === "object"
    ? paramsOrPriceDeltaPct
    : {
        priceDeltaPct: paramsOrPriceDeltaPct,
        oiDeltaPct: oiDeltaPctArg,
        minDeltaPct: minDeltaPctArg,
      };

  const priceDeltaPct = finiteNumberOrNull(params.priceDeltaPct);
  const oiDeltaPct = finiteNumberOrNull(params.oiDeltaPct);
  const minDeltaPct = finiteNumberOrNull(params.minDeltaPct) ?? minDeltaPctArg;
  const priceFlatThresholdPct = finiteNumberOrNull(params.priceFlatThresholdPct) ?? 0.05;

  if (priceDeltaPct == null || oiDeltaPct == null) return "OI_UNKNOWN";
  if (Math.abs(oiDeltaPct) < minDeltaPct) return "OI_UNKNOWN";

  const priceDirection =
    priceDeltaPct > priceFlatThresholdPct ? "PRICE_UP" :
    priceDeltaPct < -priceFlatThresholdPct ? "PRICE_DOWN" :
    "PRICE_FLAT";
  const oiDirection = oiDeltaPct > 0 ? "OI_UP" : "OI_DOWN";

  return `${priceDirection}_${oiDirection}`;
}

function normalizeSnapshotStore(store, symbol) {
  if (Array.isArray(store)) return store;
  return store?.[symbol] ?? [];
}

function latestOiSnapshot(snapshots, computedAt) {
  const valid = snapshots
    .filter(x => finiteNumberOrNull(x?.oi) != null && finiteNumberOrNull(x?.ts) != null && x.ts <= computedAt)
    .sort((a, b) => a.ts - b.ts);

  return valid.length ? valid[valid.length - 1] : null;
}

function nearestHistoricalSnapshot(snapshots, targetTs, computedAt) {
  const candidates = snapshots.filter(x =>
    finiteNumberOrNull(x?.oi) != null &&
    finiteNumberOrNull(x?.ts) != null &&
    x.ts <= computedAt - 1000
  );

  if (!candidates.length) return null;

  return candidates.reduce((best, x) => {
    if (!best) return x;
    return Math.abs(x.ts - targetTs) < Math.abs(best.ts - targetTs) ? x : best;
  }, null);
}

function computeOiWindow({ currentOi, currentPrice, previousSnapshot, config }) {
  const previousOi = finiteNumberOrNull(previousSnapshot?.oi);
  const previousPrice = finiteNumberOrNull(previousSnapshot?.price);

  if (currentOi == null || previousOi == null || !previousOi) {
    return {
      previousOi: null,
      delta: null,
      deltaPct: null,
      divergence: "OI_UNKNOWN",
    };
  }

  const delta = currentOi - previousOi;
  const deltaPct = (delta / previousOi) * 100;
  const priceDeltaPct = currentPrice != null && previousPrice != null && previousPrice
    ? ((currentPrice - previousPrice) / previousPrice) * 100
    : null;

  return {
    previousOi: fixedOrNull(previousOi, 8),
    delta: fixedOrNull(delta, 8),
    deltaPct: fixedOrNull(deltaPct, 4),
    divergence: classifyOiPressure({
      priceDeltaPct,
      oiDeltaPct: deltaPct,
      minDeltaPct: config.oi.minDeltaPct,
    }),
  };
}

function classifyOiShortLabel(divergence) {
  if (divergence === "PRICE_UP_OI_UP") return "OI_SHORT_CROWDED_LONGS_POSSIBLE";
  if (divergence === "PRICE_DOWN_OI_UP") return "OI_SHORT_FRESH_SHORT_PRESSURE";
  if (divergence === "PRICE_DOWN_OI_DOWN") return "OI_SHORT_UNWIND_WARNING";
  return "OI_SHORT_NEUTRAL";
}

function classifyOiLongLabel(divergence) {
  if (divergence === "PRICE_DOWN_OI_UP") return "OI_LONG_CROWDED_SHORTS_POSSIBLE";
  if (divergence === "PRICE_UP_OI_UP") return "OI_LONG_FRESH_LONG_PRESSURE";
  if (divergence === "PRICE_UP_OI_DOWN") return "OI_LONG_SHORT_COVERING";
  return "OI_LONG_NEUTRAL";
}

export function computeOiDeltaTelemetry({
  symbol,
  entryPrice = null,
  oiCurrent = null,
  oiSnapshotsBySymbol = null,
  computedAt = Date.now(),
} = {}, config = ADVANCED_MARKET_TELEMETRY_CONFIG) {
  const snapshots = normalizeSnapshotStore(oiSnapshotsBySymbol, symbol);
  const latest = latestOiSnapshot(snapshots, computedAt);
  const currentOi = finiteNumberOrNull(oiCurrent) ?? finiteNumberOrNull(latest?.oi);
  const currentPrice = finiteNumberOrNull(entryPrice) ?? finiteNumberOrNull(latest?.price);

  const one = computeOiWindow({
    currentOi,
    currentPrice,
    previousSnapshot: nearestHistoricalSnapshot(snapshots, computedAt - config.oi.shortWindowMs, computedAt),
    config,
  });
  const five = computeOiWindow({
    currentOi,
    currentPrice,
    previousSnapshot: nearestHistoricalSnapshot(snapshots, computedAt - config.oi.mediumWindowMs, computedAt),
    config,
  });
  const fifteen = computeOiWindow({
    currentOi,
    currentPrice,
    previousSnapshot: nearestHistoricalSnapshot(snapshots, computedAt - config.oi.longWindowMs, computedAt),
    config,
  });
  const oiPressureLabel = five.divergence !== "OI_UNKNOWN"
    ? five.divergence
    : one.divergence !== "OI_UNKNOWN"
      ? one.divergence
      : fifteen.divergence;

  const warnings = [];
  if ([one, five, fifteen].some(x => x.deltaPct == null)) {
    warnings.push("OI_DELTA_HISTORY_INCOMPLETE");
  }

  return {
    oiCurrent: fixedOrNull(currentOi, 8),
    oiPrevious1m: one.previousOi,
    oiPrevious5m: five.previousOi,
    oiPrevious15m: fifteen.previousOi,

    openInterestDelta1m: one.delta,
    openInterestDelta5m: five.delta,
    openInterestDelta15m: fifteen.delta,

    openInterestDelta1mPct: one.deltaPct,
    openInterestDelta5mPct: five.deltaPct,
    openInterestDelta15mPct: fifteen.deltaPct,

    oiPriceDivergence1m: one.divergence,
    oiPriceDivergence5m: five.divergence,
    oiPriceDivergence15m: fifteen.divergence,

    oiPressureLabel,
    oiShortLabel: classifyOiShortLabel(oiPressureLabel),
    oiLongLabel: classifyOiLongLabel(oiPressureLabel),
    warnings,
  };
}

export function classifyLiquidationPressure({
  longLiquidationUsd = null,
  shortLiquidationUsd = null,
  dominanceThresholdPct = 10,
} = {}) {
  const longUsd = finiteNumberOrNull(longLiquidationUsd);
  const shortUsd = finiteNumberOrNull(shortLiquidationUsd);

  if (longUsd == null || shortUsd == null) return "UNKNOWN";

  const total = longUsd + shortUsd;
  if (total <= 0) return "BALANCED";

  const dominance = Math.abs(longUsd - shortUsd) / total * 100;
  if (dominance < dominanceThresholdPct) return "BALANCED";
  return longUsd > shortUsd ? "LONG_LIQUIDATIONS_DOMINANT" : "SHORT_LIQUIDATIONS_DOMINANT";
}

function emptyLiquidationPressureTelemetry() {
  return {
    sourceAvailable: false,
    longLiquidationUsd1m: null,
    shortLiquidationUsd1m: null,
    netLiquidationUsd1m: null,
    longLiquidationUsd5m: null,
    shortLiquidationUsd5m: null,
    netLiquidationUsd5m: null,
    liquidationPressure1m: "UNKNOWN",
    liquidationPressure5m: "UNKNOWN",
    liquidationSpike1m: false,
    liquidationSpike5m: false,
    warnings: ["LIQUIDATION_SOURCE_UNAVAILABLE"],
  };
}

function summarizeLiquidations(events, sinceTs) {
  let longLiquidationUsd = 0;
  let shortLiquidationUsd = 0;
  const warnings = [];

  for (const event of events.filter(x => x.ts >= sinceTs)) {
    const side = String(event.side ?? "").toUpperCase();
    const notional = finiteNumberOrNull(event.notionalUsd)
      ?? (finiteNumberOrNull(event.price) != null && finiteNumberOrNull(event.qty) != null
        ? finiteNumberOrNull(event.price) * finiteNumberOrNull(event.qty)
        : null);

    if (notional == null) continue;

    if (side === "SELL") {
      longLiquidationUsd += notional;
    } else if (side === "BUY") {
      shortLiquidationUsd += notional;
    } else {
      warnings.push("LIQUIDATION_SIDE_MAPPING_UNKNOWN");
    }
  }

  return {
    longLiquidationUsd: fixedOrNull(longLiquidationUsd, 4),
    shortLiquidationUsd: fixedOrNull(shortLiquidationUsd, 4),
    netLiquidationUsd: fixedOrNull(longLiquidationUsd - shortLiquidationUsd, 4),
    warnings,
  };
}

export function computeLiquidationPressureTelemetry({
  symbol,
  liquidationSnapshotsBySymbol = null,
  computedAt = Date.now(),
} = {}, config = ADVANCED_MARKET_TELEMETRY_CONFIG) {
  const events = normalizeSnapshotStore(liquidationSnapshotsBySymbol, symbol)
    .filter(x => finiteNumberOrNull(x?.ts) != null && x.ts <= computedAt);

  if (!events.length) {
    return emptyLiquidationPressureTelemetry();
  }

  const one = summarizeLiquidations(events, computedAt - config.liquidation.shortWindowMs);
  const five = summarizeLiquidations(events, computedAt - config.liquidation.mediumWindowMs);
  const warnings = [...new Set([...one.warnings, ...five.warnings])];

  return {
    sourceAvailable: true,
    longLiquidationUsd1m: one.longLiquidationUsd,
    shortLiquidationUsd1m: one.shortLiquidationUsd,
    netLiquidationUsd1m: one.netLiquidationUsd,
    longLiquidationUsd5m: five.longLiquidationUsd,
    shortLiquidationUsd5m: five.shortLiquidationUsd,
    netLiquidationUsd5m: five.netLiquidationUsd,
    liquidationPressure1m: classifyLiquidationPressure({
      longLiquidationUsd: one.longLiquidationUsd,
      shortLiquidationUsd: one.shortLiquidationUsd,
    }),
    liquidationPressure5m: classifyLiquidationPressure({
      longLiquidationUsd: five.longLiquidationUsd,
      shortLiquidationUsd: five.shortLiquidationUsd,
    }),
    liquidationSpike1m: false,
    liquidationSpike5m: false,
    warnings,
  };
}

export function computeMfiSeries(klines, period = ADVANCED_MARKET_TELEMETRY_CONFIG.volumeFlow.mfiPeriod) {
  const rows = validKlines(klines, false);
  if (rows.length < period + 1) return [];

  const typicalPrices = rows.map(k =>
    (finiteNumberOrNull(k?.[2]) + finiteNumberOrNull(k?.[3]) + finiteNumberOrNull(k?.[4])) / 3
  );
  const volumes = rows.map(k => finiteNumberOrNull(k?.[5]) ?? 0);
  const positiveFlow = [];
  const negativeFlow = [];

  for (let i = 1; i < rows.length; i++) {
    const rawFlow = typicalPrices[i] * volumes[i];
    if (typicalPrices[i] > typicalPrices[i - 1]) {
      positiveFlow.push(rawFlow);
      negativeFlow.push(0);
    } else if (typicalPrices[i] < typicalPrices[i - 1]) {
      positiveFlow.push(0);
      negativeFlow.push(rawFlow);
    } else {
      positiveFlow.push(0);
      negativeFlow.push(0);
    }
  }

  const out = [];
  for (let i = period - 1; i < positiveFlow.length; i++) {
    const pos = positiveFlow.slice(i - period + 1, i + 1).reduce((sum, v) => sum + v, 0);
    const neg = negativeFlow.slice(i - period + 1, i + 1).reduce((sum, v) => sum + v, 0);
    const mfi = neg === 0 ? 100 : 100 - (100 / (1 + pos / neg));
    out.push(fixedOrNull(mfi, 4));
  }

  return out;
}

export function computeObvSeries(klines) {
  const rows = validKlines(klines, false);
  if (!rows.length) return [];

  const out = [0];
  for (let i = 1; i < rows.length; i++) {
    const close = finiteNumberOrNull(rows[i]?.[4]);
    const previousClose = finiteNumberOrNull(rows[i - 1]?.[4]);
    const volume = finiteNumberOrNull(rows[i]?.[5]) ?? 0;
    const previousObv = out[out.length - 1];

    if (close > previousClose) out.push(fixedOrNull(previousObv + volume, 4));
    else if (close < previousClose) out.push(fixedOrNull(previousObv - volume, 4));
    else out.push(previousObv);
  }

  return out;
}

export function computeCmfSeries(klines, period = ADVANCED_MARKET_TELEMETRY_CONFIG.volumeFlow.cmfPeriod) {
  const rows = validKlines(klines, false);
  if (rows.length < period) return [];

  const mfv = rows.map(k => {
    const high = finiteNumberOrNull(k?.[2]);
    const low = finiteNumberOrNull(k?.[3]);
    const close = finiteNumberOrNull(k?.[4]);
    const volume = finiteNumberOrNull(k?.[5]) ?? 0;
    const range = high - low;
    const multiplier = range ? (((close - low) - (high - close)) / range) : 0;
    return multiplier * volume;
  });
  const volumes = rows.map(k => finiteNumberOrNull(k?.[5]) ?? 0);
  const out = [];

  for (let i = period - 1; i < rows.length; i++) {
    const mfvSum = mfv.slice(i - period + 1, i + 1).reduce((sum, v) => sum + v, 0);
    const volumeSum = volumes.slice(i - period + 1, i + 1).reduce((sum, v) => sum + v, 0);
    out.push(volumeSum ? fixedOrNull(mfvSum / volumeSum, 4) : null);
  }

  return out;
}

function classifyPointSlope(delta, threshold = 0.0001) {
  if (delta == null || Number.isNaN(delta)) return "UNKNOWN";
  if (delta > threshold) return "RISING";
  if (delta < -threshold) return "FALLING";
  return "FLAT";
}

function slopeFromSeries(series, lookback, threshold = 0.0001) {
  if (!Array.isArray(series) || series.length <= lookback) return "UNKNOWN";
  const current = finiteNumberOrNull(series[series.length - 1]);
  const previous = finiteNumberOrNull(series[series.length - 1 - lookback]);
  if (current == null || previous == null) return "UNKNOWN";
  return classifyPointSlope(current - previous, threshold);
}

function obvSlopeFromSeries(series, lookback, flatPct) {
  if (!Array.isArray(series) || series.length <= lookback) return "UNKNOWN";
  const current = finiteNumberOrNull(series[series.length - 1]);
  const previous = finiteNumberOrNull(series[series.length - 1 - lookback]);
  if (current == null || previous == null) return "UNKNOWN";
  if (!previous) return classifyPointSlope(current - previous, 0.0001);
  const deltaPct = ((current - previous) / Math.abs(previous)) * 100;
  return classifyPointSlope(deltaPct, flatPct);
}

function classifyMfiBucket(mfi, config = ADVANCED_MARKET_TELEMETRY_CONFIG) {
  if (mfi == null || Number.isNaN(Number(mfi))) return "UNKNOWN";
  if (mfi <= config.thresholds.mfiOversold) return "OVERSOLD";
  if (mfi < config.thresholds.mfiLow) return "LOW";
  if (mfi < config.thresholds.mfiHigh) return "NEUTRAL";
  if (mfi < config.thresholds.mfiOverbought) return "HIGH";
  return "OVERBOUGHT";
}

function classifyCmfBias(cmf, config = ADVANCED_MARKET_TELEMETRY_CONFIG) {
  if (cmf == null || Number.isNaN(Number(cmf))) return "UNKNOWN";
  if (cmf >= config.thresholds.cmfBullish) return "BUY_PRESSURE";
  if (cmf <= config.thresholds.cmfBearish) return "SELL_PRESSURE";
  return "NEUTRAL";
}

function classifyObvDivergence(klines, obvSeries, lookback = 10) {
  const rows = validKlines(klines, false);
  if (rows.length <= lookback || obvSeries.length <= lookback) return "UNKNOWN";

  const currentClose = finiteNumberOrNull(rows[rows.length - 1]?.[4]);
  const previousClose = finiteNumberOrNull(rows[rows.length - 1 - lookback]?.[4]);
  const currentObv = finiteNumberOrNull(obvSeries[obvSeries.length - 1]);
  const previousObv = finiteNumberOrNull(obvSeries[obvSeries.length - 1 - lookback]);

  if ([currentClose, previousClose, currentObv, previousObv].some(v => v == null)) return "UNKNOWN";
  if (currentClose > previousClose && currentObv < previousObv) return "BEARISH_OBV_DIVERGENCE";
  if (currentClose < previousClose && currentObv > previousObv) return "BULLISH_OBV_DIVERGENCE";
  return "NONE";
}

export function classifyVolumeFlowBias({
  mfiSlope = "UNKNOWN",
  obvSlope = "UNKNOWN",
  cmfBias = "UNKNOWN",
} = {}) {
  if (cmfBias === "BUY_PRESSURE") return "BUY_PRESSURE";
  if (cmfBias === "SELL_PRESSURE") return "SELL_PRESSURE";
  if (mfiSlope === "RISING" && obvSlope === "RISING") return "BUY_PRESSURE";
  if (mfiSlope === "FALLING" && obvSlope === "FALLING") return "SELL_PRESSURE";
  if ([mfiSlope, obvSlope, cmfBias].some(v => v === "UNKNOWN")) return "UNKNOWN";
  return "NEUTRAL";
}

function emptyVolumeFlowTelemetry(notEnoughCandles = true) {
  return {
    mfi14: null,
    mfiSlope: "UNKNOWN",
    mfiBucket: "UNKNOWN",
    obv: null,
    obvSlope: "UNKNOWN",
    obvDivergence: "UNKNOWN",
    cmf20: null,
    cmfSlope: "UNKNOWN",
    cmfBias: "UNKNOWN",
    volumeFlowBias: "UNKNOWN",
    notEnoughCandles,
  };
}

function computeVolumeFlowForKlines(klines, config) {
  const closed = validKlines(klines, config.useClosedCandlesOnly);
  if (!closed.length) return emptyVolumeFlowTelemetry(true);

  const mfiSeries = computeMfiSeries(closed, config.volumeFlow.mfiPeriod);
  const obvSeries = computeObvSeries(closed);
  const cmfSeries = computeCmfSeries(closed, config.volumeFlow.cmfPeriod);
  const mfi14 = mfiSeries.length ? mfiSeries[mfiSeries.length - 1] : null;
  const obv = obvSeries.length ? obvSeries[obvSeries.length - 1] : null;
  const cmf20 = cmfSeries.length ? cmfSeries[cmfSeries.length - 1] : null;
  const mfiSlope = slopeFromSeries(mfiSeries, config.volumeFlow.mfiSlopeLookback, 0.25);
  const obvSlope = obvSlopeFromSeries(
    obvSeries,
    config.volumeFlow.obvSlopeLookback,
    config.thresholds.obvSlopeFlatPct,
  );
  const cmfSlope = slopeFromSeries(cmfSeries, config.volumeFlow.cmfSlopeLookback, 0.005);
  const cmfBias = classifyCmfBias(cmf20, config);

  return {
    mfi14,
    mfiSlope,
    mfiBucket: classifyMfiBucket(mfi14, config),
    obv,
    obvSlope,
    obvDivergence: classifyObvDivergence(closed, obvSeries),
    cmf20,
    cmfSlope,
    cmfBias,
    volumeFlowBias: classifyVolumeFlowBias({ mfiSlope, obvSlope, cmfBias }),
    notEnoughCandles: mfi14 == null || obv == null || cmf20 == null,
  };
}

export function computeVolumeFlowTelemetry(input = {}, config = ADVANCED_MARKET_TELEMETRY_CONFIG) {
  if (input?.klinesByInterval) {
    const out = {};
    for (const tf of config.timeframes) {
      out[tf] = computeVolumeFlowForKlines(input.klinesByInterval?.[tf] ?? null, config);
    }
    return out;
  }

  return computeVolumeFlowForKlines(input, config);
}

function computeStructureLabels(structure) {
  const st1 = structure?.["1m"];
  const st3 = structure?.["3m"];

  const shortLabels = [];
  const longLabels = [];

  if (st1?.brokeRecentLow || st3?.brokeRecentLow) shortLabels.push("STRUCTURE_SHORT_MICRO_BREAKDOWN");
  if (st1?.lowerHighConfirmed || st3?.lowerHighConfirmed) shortLabels.push("STRUCTURE_SHORT_LOWER_HIGH_CONFIRMED");
  if (st3?.structure === "UPTREND" && !st1?.brokeRecentLow) shortLabels.push("STRUCTURE_SHORT_AGAINST_UPTREND");
  if (st1?.brokeRecentHigh || st3?.brokeRecentHigh) longLabels.push("STRUCTURE_LONG_BREAKOUT");
  if (st1?.higherLowConfirmed || st3?.higherLowConfirmed) longLabels.push("STRUCTURE_LONG_HIGHER_LOW_CONFIRMED");

  return {
    structureShortLabel: shortLabels.length ? shortLabels.join("|") : "STRUCTURE_SHORT_NEUTRAL",
    structureLongLabel: longLabels.length ? longLabels.join("|") : "STRUCTURE_LONG_NEUTRAL",
  };
}

export function classifyAdvancedSetupLabels({
  extension,
  structure,
  oiPressure,
  liquidationPressure,
  volumeFlow,
}) {
  let shortScore = 0;
  let longScore = 0;

  const shortLabels = [];
  const longLabels = [];

  const ext1 = extension?.["1m"];
  const ext3 = extension?.["3m"];

  const st1 = structure?.["1m"];
  const st3 = structure?.["3m"];

  const vf1 = volumeFlow?.["1m"];
  const vf3 = volumeFlow?.["3m"];

  if (
    ["BB_ABOVE_UPPER", "BB_TOUCHING_UPPER"].includes(ext3?.bbExtension) &&
    ["KC_ABOVE_UPPER", "KC_TOUCHING_UPPER"].includes(ext3?.kcExtension)
  ) {
    shortScore += 20;
    shortLabels.push("EXTENSION_SHORT_OVEREXTENDED");
  }

  if (
    ext1?.bbExtension === "BB_INSIDE_BANDS" &&
    ext3?.bbExtension === "BB_TOUCHING_UPPER"
  ) {
    shortScore += 15;
    shortLabels.push("EXTENSION_SHORT_LOSING_UPPER_BAND");
  }

  if (
    ["BB_BELOW_LOWER", "BB_TOUCHING_LOWER"].includes(ext1?.bbExtension) &&
    vf1?.mfiBucket === "OVERSOLD"
  ) {
    shortScore -= 25;
    shortLabels.push("EXTENSION_SHORT_LATE_LOWER_BAND_CHASE");
  }

  if (
    st1?.brokeRecentLow ||
    st3?.brokeRecentLow
  ) {
    shortScore += 25;
    shortLabels.push("STRUCTURE_SHORT_MICRO_BREAKDOWN");
  }

  if (
    st1?.lowerHighConfirmed ||
    st3?.lowerHighConfirmed
  ) {
    shortScore += 20;
    shortLabels.push("STRUCTURE_SHORT_LOWER_HIGH_CONFIRMED");
  }

  if (
    st3?.structure === "UPTREND" &&
    !st1?.brokeRecentLow
  ) {
    shortScore -= 25;
    shortLabels.push("STRUCTURE_SHORT_AGAINST_UPTREND");
  }

  if (
    oiPressure?.oiPriceDivergence5m === "PRICE_UP_OI_UP"
  ) {
    shortScore += 15;
    shortLabels.push("OI_SHORT_CROWDED_LONGS_POSSIBLE");
  }

  if (
    oiPressure?.oiPriceDivergence5m === "PRICE_DOWN_OI_UP"
  ) {
    shortScore += 20;
    shortLabels.push("OI_SHORT_FRESH_SHORT_PRESSURE");
  }

  if (
    oiPressure?.oiPriceDivergence5m === "PRICE_DOWN_OI_DOWN"
  ) {
    shortLabels.push("OI_SHORT_UNWIND_WARNING");
  }

  if (
    liquidationPressure?.liquidationPressure1m === "LONG_LIQUIDATIONS_DOMINANT"
  ) {
    shortScore += 15;
    shortLabels.push("LIQUIDATION_SHORT_LONGS_FLUSHING");
  }

  if (
    liquidationPressure?.liquidationPressure1m === "SHORT_LIQUIDATIONS_DOMINANT"
  ) {
    shortScore -= 20;
    shortLabels.push("LIQUIDATION_SHORT_DANGER_SHORTS_SQUEEZING");
  }

  if (
    vf3?.mfiSlope === "FALLING" &&
    vf3?.mfiBucket !== "OVERSOLD"
  ) {
    shortScore += 15;
    shortLabels.push("MFI_SHORT_MONEY_FLOW_FALLING");
  }

  if (
    vf3?.cmfBias === "SELL_PRESSURE"
  ) {
    shortScore += 15;
    shortLabels.push("CMF_SHORT_SELL_PRESSURE");
  }

  if (
    vf3?.obvDivergence === "BEARISH_OBV_DIVERGENCE"
  ) {
    shortScore += 20;
    shortLabels.push("OBV_SHORT_BEARISH_DIVERGENCE");
  }

  if (
    vf1?.mfiSlope === "RISING" &&
    vf3?.cmfBias === "BUY_PRESSURE"
  ) {
    shortScore -= 25;
    shortLabels.push("FLOW_SHORT_DANGER_ACCUMULATION");
  }

  if (
    st1?.brokeRecentHigh ||
    st3?.brokeRecentHigh
  ) {
    longScore += 20;
    longLabels.push("STRUCTURE_LONG_BREAKOUT");
  }

  if (
    vf3?.cmfBias === "BUY_PRESSURE" &&
    vf3?.mfiSlope === "RISING"
  ) {
    longScore += 20;
    longLabels.push("FLOW_LONG_ACCUMULATION");
  }

  const advancedShortSetupLabel = shortLabels.length
    ? shortLabels.join("|")
    : "ADVANCED_SHORT_NEUTRAL";

  const advancedLongSetupLabel = longLabels.length
    ? longLabels.join("|")
    : "ADVANCED_LONG_NEUTRAL";

  const advancedCompositeLabel =
    shortScore > longScore && shortScore >= 25 ? "ADVANCED_SHORT_BIAS" :
    longScore > shortScore && longScore >= 25 ? "ADVANCED_LONG_BIAS" :
    "ADVANCED_MIXED_OR_NEUTRAL";

  return {
    advancedShortSetupLabel,
    advancedLongSetupLabel,
    advancedCompositeLabel,
    advancedShortScore: clampScore(shortScore),
    advancedLongScore: clampScore(longScore),
  };
}

function addTimeframeMissing({
  tf,
  extension,
  structure,
  volumeFlow,
  missingFields,
  warnings,
}) {
  if (extension?.[tf]?.bbUpper == null) {
    missingFields.push(`bb_${tf}`);
    warnings.push(`NOT_ENOUGH_CANDLES_FOR_BB_${tf}`);
  }
  if (extension?.[tf]?.kcUpper == null) {
    missingFields.push(`kc_${tf}`);
    warnings.push(`NOT_ENOUGH_CANDLES_FOR_KC_${tf}`);
  }
  if (structure?.[tf]?.structure === "UNKNOWN") {
    missingFields.push(`structure_${tf}`);
    warnings.push(`NOT_ENOUGH_CANDLES_FOR_STRUCTURE_${tf}`);
  }
  if (volumeFlow?.[tf]?.mfi14 == null) {
    missingFields.push(`mfi_${tf}`);
    warnings.push(`NOT_ENOUGH_CANDLES_FOR_MFI_${tf}`);
  }
  if (volumeFlow?.[tf]?.cmf20 == null) {
    missingFields.push(`cmf_${tf}`);
    warnings.push(`NOT_ENOUGH_CANDLES_FOR_CMF_${tf}`);
  }
}

export function computeAdvancedMarketTelemetry({
  symbol,
  side = "SHORT",
  entryPrice = null,
  klinesByInterval,
  oiSnapshotsBySymbol = null,
  liquidationSnapshotsBySymbol = null,
  oiCurrent = null,
  computedAt = Date.now(),
} = {}, config = ADVANCED_MARKET_TELEMETRY_CONFIG) {
  const warnings = [];
  const missingFields = [];

  const extension = computeExtensionTelemetry({ klinesByInterval, entryPrice }, config);

  const structure = {};
  for (const tf of config.timeframes) {
    structure[tf] = computeMarketStructureTelemetry(
      klinesByInterval?.[tf] ?? null,
      entryPrice,
      config,
    );
  }

  const oiPressure = computeOiDeltaTelemetry({
    symbol,
    entryPrice,
    oiCurrent,
    oiSnapshotsBySymbol,
    computedAt,
  }, config);

  const liquidationPressure = computeLiquidationPressureTelemetry({
    symbol,
    liquidationSnapshotsBySymbol,
    computedAt,
  }, config);

  const volumeFlow = computeVolumeFlowTelemetry({ klinesByInterval }, config);
  const labelsAndScores = classifyAdvancedSetupLabels({
    extension,
    structure,
    oiPressure,
    liquidationPressure,
    volumeFlow,
  });
  const structureLabels = computeStructureLabels(structure);

  for (const tf of config.timeframes) {
    addTimeframeMissing({ tf, extension, structure, volumeFlow, missingFields, warnings });
  }

  if (oiPressure.oiCurrent == null) {
    missingFields.push("oiCurrent");
    warnings.push("OI_CURRENT_UNAVAILABLE");
  }

  if (oiPressure.openInterestDelta1mPct == null) missingFields.push("openInterestDelta1mPct");
  if (oiPressure.openInterestDelta5mPct == null) missingFields.push("openInterestDelta5mPct");
  if (oiPressure.openInterestDelta15mPct == null) missingFields.push("openInterestDelta15mPct");

  warnings.push(...(oiPressure.warnings ?? []));
  warnings.push(...(liquidationPressure.warnings ?? []));

  return {
    version: config.version,
    computedAt,
    symbol,
    side,
    timeframes: config.timeframes,
    useClosedCandlesOnly: config.useClosedCandlesOnly,

    extension,
    structure,
    oiPressure,
    liquidationPressure,
    volumeFlow,

    labels: {
      advancedShortSetupLabel: labelsAndScores.advancedShortSetupLabel,
      advancedLongSetupLabel: labelsAndScores.advancedLongSetupLabel,
      advancedCompositeLabel: labelsAndScores.advancedCompositeLabel,
      ...structureLabels,
    },

    scores: {
      advancedShortScore: labelsAndScores.advancedShortScore,
      advancedLongScore: labelsAndScores.advancedLongScore,
    },

    telemetryComplete: missingFields.length === 0,
    missingFields: [...new Set(missingFields)],
    warnings: [...new Set(warnings)],
  };
}

function buildAdvancedDefaults() {
  const defaults = {
    advancedMarketTelemetry: null,
    advancedMarketTelemetryComplete: false,
    advancedMarketMissingFields: [],
    advancedMarketWarnings: [],

    advancedCompositeLabel: "ADVANCED_UNKNOWN",
    advancedShortSetupLabel: "ADVANCED_SHORT_UNKNOWN",
    advancedLongSetupLabel: "ADVANCED_LONG_UNKNOWN",
    advancedShortScore: 0,
    advancedLongScore: 0,

    structureShortLabel: "STRUCTURE_SHORT_UNKNOWN",
    structureLongLabel: "STRUCTURE_LONG_UNKNOWN",

    oiCurrent: null,
    oiPrevious1m: null,
    oiPrevious5m: null,
    oiPrevious15m: null,
    openInterestDelta1m: null,
    openInterestDelta5m: null,
    openInterestDelta15m: null,
    openInterestDelta1mPct: null,
    openInterestDelta5mPct: null,
    openInterestDelta15mPct: null,
    oiPriceDivergence1m: "UNKNOWN",
    oiPriceDivergence5m: "UNKNOWN",
    oiPriceDivergence15m: "UNKNOWN",
    oiPressureLabel: "UNKNOWN",
    oiShortLabel: "UNKNOWN",
    oiLongLabel: "UNKNOWN",

    liquidationPressureSourceAvailable: false,
    longLiquidationUsd1m: null,
    shortLiquidationUsd1m: null,
    netLiquidationUsd1m: null,
    longLiquidationUsd5m: null,
    shortLiquidationUsd5m: null,
    netLiquidationUsd5m: null,
    liquidationPressure1m: "UNKNOWN",
    liquidationPressure5m: "UNKNOWN",
    liquidationSpike1m: false,
    liquidationSpike5m: false,
    liquidationWarnings: [],
  };

  for (const tf of FLATTEN_TIMEFRAMES) {
    defaults[`bbUpper${tf}`] = null;
    defaults[`bbMiddle${tf}`] = null;
    defaults[`bbLower${tf}`] = null;
    defaults[`bbWidth${tf}Pct`] = null;
    defaults[`priceVsBbUpper${tf}Pct`] = null;
    defaults[`priceVsBbMiddle${tf}Pct`] = null;
    defaults[`priceVsBbLower${tf}Pct`] = null;
    defaults[`bbExtension${tf}`] = "UNKNOWN";

    defaults[`kcUpper${tf}`] = null;
    defaults[`kcMiddle${tf}`] = null;
    defaults[`kcLower${tf}`] = null;
    defaults[`kcWidth${tf}Pct`] = null;
    defaults[`priceVsKcUpper${tf}Pct`] = null;
    defaults[`priceVsKcMiddle${tf}Pct`] = null;
    defaults[`priceVsKcLower${tf}Pct`] = null;
    defaults[`kcExtension${tf}`] = "UNKNOWN";

    defaults[`squeezeOn${tf}`] = false;
    defaults[`squeezeReleased${tf}`] = false;
    defaults[`bandExpansion${tf}`] = "UNKNOWN";

    defaults[`structure${tf}`] = "UNKNOWN";
    defaults[`lastSwingHigh${tf}`] = null;
    defaults[`lastSwingLow${tf}`] = null;
    defaults[`previousSwingHigh${tf}`] = null;
    defaults[`previousSwingLow${tf}`] = null;
    defaults[`brokeRecentLow${tf}`] = false;
    defaults[`brokeRecentHigh${tf}`] = false;
    defaults[`failedBreakout${tf}`] = false;
    defaults[`lowerHighConfirmed${tf}`] = false;
    defaults[`lowerLowConfirmed${tf}`] = false;
    defaults[`higherHighConfirmed${tf}`] = false;
    defaults[`higherLowConfirmed${tf}`] = false;
    defaults[`structureBreakDirection${tf}`] = "UNKNOWN";

    defaults[`mfi14_${tf}`] = null;
    defaults[`mfiSlope${tf}`] = "UNKNOWN";
    defaults[`mfiBucket${tf}`] = "UNKNOWN";
    defaults[`obv${tf}`] = null;
    defaults[`obvSlope${tf}`] = "UNKNOWN";
    defaults[`obvDivergence${tf}`] = "UNKNOWN";
    defaults[`cmf20_${tf}`] = null;
    defaults[`cmfSlope${tf}`] = "UNKNOWN";
    defaults[`cmfBias${tf}`] = "UNKNOWN";
    defaults[`volumeFlowBias${tf}`] = "UNKNOWN";
  }

  return defaults;
}

export const ADVANCED_MARKET_TELEMETRY_DEFAULTS = buildAdvancedDefaults();

export function flattenAdvancedMarketTelemetry(snapshot) {
  if (!snapshot) return ADVANCED_MARKET_TELEMETRY_DEFAULTS;

  const extension = snapshot.extension ?? {};
  const structure = snapshot.structure ?? {};
  const oi = snapshot.oiPressure ?? {};
  const liq = snapshot.liquidationPressure ?? {};
  const flow = snapshot.volumeFlow ?? {};
  const labels = snapshot.labels ?? {};
  const scores = snapshot.scores ?? {};

  const out = {
    ...ADVANCED_MARKET_TELEMETRY_DEFAULTS,

    advancedMarketTelemetry: snapshot,
    advancedMarketTelemetryComplete: snapshot.telemetryComplete ?? false,
    advancedMarketMissingFields: snapshot.missingFields ?? [],
    advancedMarketWarnings: snapshot.warnings ?? [],

    advancedCompositeLabel: labels.advancedCompositeLabel ?? "ADVANCED_UNKNOWN",
    advancedShortSetupLabel: labels.advancedShortSetupLabel ?? "ADVANCED_SHORT_UNKNOWN",
    advancedLongSetupLabel: labels.advancedLongSetupLabel ?? "ADVANCED_LONG_UNKNOWN",
    advancedShortScore: scores.advancedShortScore ?? 0,
    advancedLongScore: scores.advancedLongScore ?? 0,

    structureShortLabel: labels.structureShortLabel ?? "STRUCTURE_SHORT_UNKNOWN",
    structureLongLabel: labels.structureLongLabel ?? "STRUCTURE_LONG_UNKNOWN",

    oiCurrent: oi.oiCurrent ?? null,
    oiPrevious1m: oi.oiPrevious1m ?? null,
    oiPrevious5m: oi.oiPrevious5m ?? null,
    oiPrevious15m: oi.oiPrevious15m ?? null,
    openInterestDelta1m: oi.openInterestDelta1m ?? null,
    openInterestDelta5m: oi.openInterestDelta5m ?? null,
    openInterestDelta15m: oi.openInterestDelta15m ?? null,
    openInterestDelta1mPct: oi.openInterestDelta1mPct ?? null,
    openInterestDelta5mPct: oi.openInterestDelta5mPct ?? null,
    openInterestDelta15mPct: oi.openInterestDelta15mPct ?? null,
    oiPriceDivergence1m: oi.oiPriceDivergence1m ?? "UNKNOWN",
    oiPriceDivergence5m: oi.oiPriceDivergence5m ?? "UNKNOWN",
    oiPriceDivergence15m: oi.oiPriceDivergence15m ?? "UNKNOWN",
    oiPressureLabel: oi.oiPressureLabel ?? "UNKNOWN",
    oiShortLabel: oi.oiShortLabel ?? "UNKNOWN",
    oiLongLabel: oi.oiLongLabel ?? "UNKNOWN",

    liquidationPressureSourceAvailable: liq.sourceAvailable ?? false,
    longLiquidationUsd1m: liq.longLiquidationUsd1m ?? null,
    shortLiquidationUsd1m: liq.shortLiquidationUsd1m ?? null,
    netLiquidationUsd1m: liq.netLiquidationUsd1m ?? null,
    longLiquidationUsd5m: liq.longLiquidationUsd5m ?? null,
    shortLiquidationUsd5m: liq.shortLiquidationUsd5m ?? null,
    netLiquidationUsd5m: liq.netLiquidationUsd5m ?? null,
    liquidationPressure1m: liq.liquidationPressure1m ?? "UNKNOWN",
    liquidationPressure5m: liq.liquidationPressure5m ?? "UNKNOWN",
    liquidationSpike1m: liq.liquidationSpike1m ?? false,
    liquidationSpike5m: liq.liquidationSpike5m ?? false,
    liquidationWarnings: liq.warnings ?? [],
  };

  for (const tf of FLATTEN_TIMEFRAMES) {
    out[`bbUpper${tf}`] = extension[tf]?.bbUpper ?? null;
    out[`bbMiddle${tf}`] = extension[tf]?.bbMiddle ?? null;
    out[`bbLower${tf}`] = extension[tf]?.bbLower ?? null;
    out[`bbWidth${tf}Pct`] = extension[tf]?.bbWidthPct ?? null;
    out[`priceVsBbUpper${tf}Pct`] = extension[tf]?.priceVsBbUpperPct ?? null;
    out[`priceVsBbMiddle${tf}Pct`] = extension[tf]?.priceVsBbMiddlePct ?? null;
    out[`priceVsBbLower${tf}Pct`] = extension[tf]?.priceVsBbLowerPct ?? null;
    out[`bbExtension${tf}`] = extension[tf]?.bbExtension ?? "UNKNOWN";

    out[`kcUpper${tf}`] = extension[tf]?.kcUpper ?? null;
    out[`kcMiddle${tf}`] = extension[tf]?.kcMiddle ?? null;
    out[`kcLower${tf}`] = extension[tf]?.kcLower ?? null;
    out[`kcWidth${tf}Pct`] = extension[tf]?.kcWidthPct ?? null;
    out[`priceVsKcUpper${tf}Pct`] = extension[tf]?.priceVsKcUpperPct ?? null;
    out[`priceVsKcMiddle${tf}Pct`] = extension[tf]?.priceVsKcMiddlePct ?? null;
    out[`priceVsKcLower${tf}Pct`] = extension[tf]?.priceVsKcLowerPct ?? null;
    out[`kcExtension${tf}`] = extension[tf]?.kcExtension ?? "UNKNOWN";

    out[`squeezeOn${tf}`] = extension[tf]?.squeezeOn ?? false;
    out[`squeezeReleased${tf}`] = extension[tf]?.squeezeReleased ?? false;
    out[`bandExpansion${tf}`] = extension[tf]?.bandExpansion ?? "UNKNOWN";

    out[`structure${tf}`] = structure[tf]?.structure ?? "UNKNOWN";
    out[`lastSwingHigh${tf}`] = structure[tf]?.lastSwingHigh ?? null;
    out[`lastSwingLow${tf}`] = structure[tf]?.lastSwingLow ?? null;
    out[`previousSwingHigh${tf}`] = structure[tf]?.previousSwingHigh ?? null;
    out[`previousSwingLow${tf}`] = structure[tf]?.previousSwingLow ?? null;
    out[`brokeRecentLow${tf}`] = structure[tf]?.brokeRecentLow ?? false;
    out[`brokeRecentHigh${tf}`] = structure[tf]?.brokeRecentHigh ?? false;
    out[`failedBreakout${tf}`] = structure[tf]?.failedBreakout ?? false;
    out[`lowerHighConfirmed${tf}`] = structure[tf]?.lowerHighConfirmed ?? false;
    out[`lowerLowConfirmed${tf}`] = structure[tf]?.lowerLowConfirmed ?? false;
    out[`higherHighConfirmed${tf}`] = structure[tf]?.higherHighConfirmed ?? false;
    out[`higherLowConfirmed${tf}`] = structure[tf]?.higherLowConfirmed ?? false;
    out[`structureBreakDirection${tf}`] = structure[tf]?.structureBreakDirection ?? "UNKNOWN";

    out[`mfi14_${tf}`] = flow[tf]?.mfi14 ?? null;
    out[`mfiSlope${tf}`] = flow[tf]?.mfiSlope ?? "UNKNOWN";
    out[`mfiBucket${tf}`] = flow[tf]?.mfiBucket ?? "UNKNOWN";
    out[`obv${tf}`] = flow[tf]?.obv ?? null;
    out[`obvSlope${tf}`] = flow[tf]?.obvSlope ?? "UNKNOWN";
    out[`obvDivergence${tf}`] = flow[tf]?.obvDivergence ?? "UNKNOWN";
    out[`cmf20_${tf}`] = flow[tf]?.cmf20 ?? null;
    out[`cmfSlope${tf}`] = flow[tf]?.cmfSlope ?? "UNKNOWN";
    out[`cmfBias${tf}`] = flow[tf]?.cmfBias ?? "UNKNOWN";
    out[`volumeFlowBias${tf}`] = flow[tf]?.volumeFlowBias ?? "UNKNOWN";
  }

  return out;
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

export const ADVANCED_MARKET_TELEMETRY_CSV_HEADERS = [
  "advancedMarketTelemetryComplete",
  "advancedMarketMissingFields",
  "advancedMarketWarnings",
  "advancedCompositeLabel",
  "advancedShortSetupLabel",
  "advancedLongSetupLabel",
  "advancedShortScore",
  "advancedLongScore",

  "bbExtension1m",
  "bbExtension3m",
  "bbExtension5m",
  "bbExtension15m",
  "bbWidth1mPct",
  "bbWidth3mPct",
  "bbWidth5mPct",
  "bbWidth15mPct",

  "kcExtension1m",
  "kcExtension3m",
  "kcExtension5m",
  "kcExtension15m",
  "kcWidth1mPct",
  "kcWidth3mPct",
  "kcWidth5mPct",
  "kcWidth15mPct",

  "squeezeOn1m",
  "squeezeOn3m",
  "squeezeOn5m",
  "squeezeOn15m",
  "squeezeReleased1m",
  "squeezeReleased3m",
  "squeezeReleased5m",
  "squeezeReleased15m",

  "structure1m",
  "structure3m",
  "structure5m",
  "structure15m",
  "brokeRecentLow1m",
  "brokeRecentLow3m",
  "brokeRecentLow5m",
  "lowerHighConfirmed1m",
  "lowerHighConfirmed3m",
  "lowerHighConfirmed5m",
  "failedBreakout1m",
  "failedBreakout3m",
  "failedBreakout5m",

  "oiCurrent",
  "openInterestDelta1mPct",
  "openInterestDelta5mPct",
  "openInterestDelta15mPct",
  "oiPriceDivergence1m",
  "oiPriceDivergence5m",
  "oiPriceDivergence15m",
  "oiPressureLabel",

  "longLiquidationUsd1m",
  "shortLiquidationUsd1m",
  "netLiquidationUsd1m",
  "liquidationPressure1m",
  "liquidationSpike1m",

  "mfi14_1m",
  "mfi14_3m",
  "mfi14_5m",
  "mfi14_15m",
  "mfiSlope1m",
  "mfiSlope3m",
  "mfiSlope5m",
  "mfiSlope15m",
  "mfiBucket1m",
  "mfiBucket3m",
  "mfiBucket5m",
  "mfiBucket15m",

  "obvSlope1m",
  "obvSlope3m",
  "obvSlope5m",
  "obvSlope15m",
  "obvDivergence1m",
  "obvDivergence3m",
  "obvDivergence5m",

  "cmf20_1m",
  "cmf20_3m",
  "cmf20_5m",
  "cmf20_15m",
  "cmfSlope1m",
  "cmfSlope3m",
  "cmfSlope5m",
  "cmfSlope15m",
  "cmfBias1m",
  "cmfBias3m",
  "cmfBias5m",
  "cmfBias15m",
];

export function advancedMarketTelemetryCSVRow(s = {}) {
  return ADVANCED_MARKET_TELEMETRY_CSV_HEADERS.map(header => {
    if (header === "advancedMarketMissingFields") {
      return csvCell(pipeSeparated(s.advancedMarketMissingFields ?? []));
    }
    if (header === "advancedMarketWarnings") {
      return csvCell(pipeSeparated(s.advancedMarketWarnings ?? []));
    }
    return csvCell(s[header] ?? "");
  });
}

export {
  FLATTEN_TIMEFRAMES as ADVANCED_MARKET_FLATTEN_TIMEFRAMES,
  STRUCTURE_PRIMARY_TIMEFRAMES,
  STRUCTURE_ALL_TIMEFRAMES,
};
