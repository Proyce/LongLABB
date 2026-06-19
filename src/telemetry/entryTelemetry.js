// ─── ENTRY TELEMETRY CONFIG ──────────────────────────────────────────────────
export const ENTRY_TELEMETRY_CONFIG = {
  enabled: true,
  strictEntryTelemetry: false,

  vwapTimeframe: "5m",
  vwapLookback: 20,

  entryCandleTimeframe: "1m",

  priceVsVwapFlatThresholdPct: 0.05,

  impulseBodyWeakPct: 45,
  impulseBodyMediumPct: 55,
  impulseBodyStrongPct: 70,
  impulseRangeAtrMultiplier: 0.35,

  bounceNearLowMaxPct: 15,
  bounceMidMaxPct: 40,
  bounceExtendedMaxPct: 80,
};

// ─── VWAP TELEMETRY ──────────────────────────────────────────────────────────

/**
 * Compute VWAP and price-vs-VWAP from klines (any interval).
 * Returns structured result including missingFields and warnings arrays.
 */
export function computeVwapTelemetry(klines, entryPrice, config = ENTRY_TELEMETRY_CONFIG) {
  const warnings = [];
  const missing = [];
  const window = `${config.vwapTimeframe}:${config.vwapLookback}`;

  if (!klines || klines.length < 2) {
    warnings.push(`Not enough ${config.vwapTimeframe} candles for VWAP`);
    missing.push("vwap", "priceVsVwapPct", "priceVsVwapLabel");
    return { vwap: null, vwapWindow: window, priceVsVwapPct: null, priceVsVwapLabel: "UNKNOWN", missingFields: missing, warnings };
  }

  let num = 0, den = 0;
  for (const k of klines) {
    const tp = (parseFloat(k[2]) + parseFloat(k[3]) + parseFloat(k[4])) / 3;
    const vol = parseFloat(k[5]);
    num += tp * vol;
    den += vol;
  }

  if (den <= 0) {
    warnings.push("Zero volume in VWAP window");
    missing.push("vwap", "priceVsVwapPct", "priceVsVwapLabel");
    return { vwap: null, vwapWindow: window, priceVsVwapPct: null, priceVsVwapLabel: "UNKNOWN", missingFields: missing, warnings };
  }

  const vwap = num / den;
  const priceVsVwapPct = parseFloat(((entryPrice - vwap) / vwap * 100).toFixed(4));
  const threshold = config.priceVsVwapFlatThresholdPct;
  const priceVsVwapLabel =
    priceVsVwapPct > threshold  ? "ABOVE_VWAP" :
    priceVsVwapPct < -threshold ? "BELOW_VWAP" : "AT_VWAP";

  return {
    vwap: parseFloat(vwap.toFixed(8)),
    vwapWindow: window,
    priceVsVwapPct,
    priceVsVwapLabel,
    missingFields: [],
    warnings: [],
  };
}

// ─── CANDLE TELEMETRY ─────────────────────────────────────────────────────────

/**
 * Compute entry candle telemetry from the last CLOSED 1m candle (klines[-2]).
 * klines[-1] is the currently open candle; klines[-2] is the last closed one.
 */
export function computeCandleTelemetry(klines1m, config = ENTRY_TELEMETRY_CONFIG) {
  const missing = [];
  const warnings = [];
  const tf = config.entryCandleTimeframe;

  if (!klines1m || klines1m.length < 2) {
    warnings.push("Entry candle unavailable at trade creation");
    missing.push(
      "entryCandleOpen", "entryCandleHigh", "entryCandleLow", "entryCandleClose",
      "candleColorAtEntry", "candleBodyPct", "upperWickPct", "lowerWickPct",
    );
    return {
      entryTimeframe: tf,
      entryCandleOpen: null, entryCandleHigh: null, entryCandleLow: null,
      entryCandleClose: null, entryCandleVolume: null,
      candleColorAtEntry: "UNKNOWN",
      candleBodyPct: null, upperWickPct: null, lowerWickPct: null, candleRangePct: null,
      missingFields: missing, warnings,
    };
  }

  // klines[-2] = last fully closed candle
  const k = klines1m[klines1m.length - 2];
  const open   = parseFloat(k[1]);
  const high   = parseFloat(k[2]);
  const low    = parseFloat(k[3]);
  const close  = parseFloat(k[4]);
  const volume = parseFloat(k[5]);

  const range = high - low;

  if (range <= 0 || close <= 0) {
    warnings.push("Candle has zero or negative range; body/wick metrics unavailable");
    missing.push("candleBodyPct", "upperWickPct", "lowerWickPct", "candleRangePct");
    return {
      entryTimeframe: tf,
      entryCandleOpen: open, entryCandleHigh: high, entryCandleLow: low,
      entryCandleClose: close, entryCandleVolume: volume,
      candleColorAtEntry: "DOJI",
      candleBodyPct: null, upperWickPct: null, lowerWickPct: null, candleRangePct: null,
      missingFields: missing, warnings,
    };
  }

  const body      = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;

  const candleBodyPct  = parseFloat((body      / range * 100).toFixed(2));
  const upperWickPct   = parseFloat((upperWick / range * 100).toFixed(2));
  const lowerWickPct   = parseFloat((lowerWick / range * 100).toFixed(2));
  const candleRangePct = parseFloat((range      / close * 100).toFixed(4));

  const candleColorAtEntry =
    close > open ? "GREEN" :
    close < open ? "RED"   : "DOJI";

  return {
    entryTimeframe: tf,
    entryCandleOpen: open, entryCandleHigh: high, entryCandleLow: low,
    entryCandleClose: close, entryCandleVolume: volume,
    candleColorAtEntry,
    candleBodyPct, upperWickPct, lowerWickPct, candleRangePct,
    missingFields: [], warnings: [],
  };
}

// ─── IMPULSE TELEMETRY ────────────────────────────────────────────────────────

/**
 * Compute impulse flags from candle shape and ATR.
 */
export function computeImpulseTelemetry(candleTelemetry, atrPct, config = ENTRY_TELEMETRY_CONFIG) {
  const { candleBodyPct, candleColorAtEntry, candleRangePct } = candleTelemetry;

  if (candleBodyPct == null || candleColorAtEntry === "UNKNOWN") {
    return {
      redImpulseDetected: false,
      greenImpulseDetected: false,
      impulseDirection: "UNKNOWN",
      impulseStrength: "UNKNOWN",
      impulseScore: null,
    };
  }

  const { impulseBodyMediumPct: med, impulseBodyWeakPct: weak, impulseBodyStrongPct: strong } = config;

  const redImpulseDetected   = candleColorAtEntry === "RED"   && candleBodyPct >= med;
  const greenImpulseDetected = candleColorAtEntry === "GREEN" && candleBodyPct >= med;

  const impulseDirection =
    redImpulseDetected   ? "RED"   :
    greenImpulseDetected ? "GREEN" : "NONE";

  const impulseStrength =
    candleBodyPct >= strong ? "STRONG" :
    candleBodyPct >= med    ? "MEDIUM" :
    candleBodyPct >= weak   ? "WEAK"   : "NONE";

  let impulseScore = null;
  if (candleRangePct != null) {
    const raw = candleBodyPct * (candleRangePct / Math.max(atrPct ?? 0, 0.0001));
    impulseScore = parseFloat(Math.min(raw, 500).toFixed(4));
  }

  return { redImpulseDetected, greenImpulseDetected, impulseDirection, impulseStrength, impulseScore };
}

// ─── BOUNCE CONTEXT TELEMETRY ─────────────────────────────────────────────────

/**
 * Classify bounce context using spec thresholds (different from legacy getBounceContext labels).
 */
export function computeBounceContextTelemetry(bounceFromLow, config = ENTRY_TELEMETRY_CONFIG) {
  if (bounceFromLow == null) {
    return { bounceContext: "UNKNOWN", bounceContextSource: "bounceFromLow-threshold-v1" };
  }
  const { bounceNearLowMaxPct: nearMax, bounceMidMaxPct: midMax, bounceExtendedMaxPct: extMax } = config;
  const bounceContext =
    bounceFromLow < nearMax ? "NEAR_LOW_POSSIBLE_BOUNCE" :
    bounceFromLow < midMax  ? "MID_BOUNCE"               :
    bounceFromLow < extMax  ? "EXTENDED_BOUNCE"           : "DEEP_FROM_LOW";
  return { bounceContext, bounceContextSource: "bounceFromLow-threshold-v1" };
}

// ─── ENTRY TIMING REASON ─────────────────────────────────────────────────────

/**
 * Classify entry timing reason for SHORT entries based on VWAP position and impulse state.
 */
export function computeEntryTimingReason(priceVsVwapLabel, redImpulseDetected, greenImpulseDetected, hasCandleData) {
  if (!hasCandleData)                    return "CANDLE_UNKNOWN";
  if (priceVsVwapLabel === "UNKNOWN")    return "VWAP_UNKNOWN";
  // Green impulse (upward momentum against a short) is the most specific ABOVE_VWAP case
  if (priceVsVwapLabel === "ABOVE_VWAP" && greenImpulseDetected) return "ABOVE_VWAP_GREEN_IMPULSE";
  if (priceVsVwapLabel === "ABOVE_VWAP" && !redImpulseDetected)  return "ABOVE_VWAP_NO_RED_IMPULSE";
  if (priceVsVwapLabel === "BELOW_VWAP" && redImpulseDetected)   return "BELOW_VWAP_RED_IMPULSE";
  if (priceVsVwapLabel === "BELOW_VWAP" && !redImpulseDetected)  return "BELOW_VWAP_NO_IMPULSE";
  return "UNKNOWN";
}

// ─── FULL ENTRY TELEMETRY SNAPSHOT ───────────────────────────────────────────

const REQUIRED_FIELDS = [
  "vwap", "priceVsVwapPct", "priceVsVwapLabel",
  "entryCandleOpen", "entryCandleHigh", "entryCandleLow", "entryCandleClose",
  "candleColorAtEntry", "candleBodyPct", "upperWickPct", "lowerWickPct",
];

/**
 * Build the complete EntryTelemetrySnapshot.
 *
 * @param {object} params
 * @param {Array|null}  params.klines1m      - 1m klines (≥2 for candle; ≥1 otherwise)
 * @param {Array|null}  params.klines5m      - 5m klines for VWAP
 * @param {number}      params.entryPrice
 * @param {string}      params.side          - "SHORT" | "LONG"
 * @param {string}      params.symbol
 * @param {number|null} params.entryRank
 * @param {number|null} params.bounceFromLow
 * @param {number|null} params.cvdRatio
 * @param {string|null} params.cvdLabel
 * @param {number|null} params.atrPct
 * @param {number|null} params.volAccel
 * @param {number|null} params.spreadPct
 * @param {number|null} params.oiVal
 * @param {number|null} params.distFromHigh
 * @param {number|null} params.change24h
 * @param {number|null} params.quoteVol
 * @param {object}      config
 */
export function computeEntryTelemetry(params, config = ENTRY_TELEMETRY_CONFIG) {
  const {
    klines1m, klines5m, entryPrice, side = "SHORT", symbol,
    entryRank = null, bounceFromLow = null, cvdRatio = null, cvdLabel = null,
    atrPct = null, volAccel = null, spreadPct = null, oiVal = null,
    distFromHigh = null, change24h = null, quoteVol = null,
  } = params;

  const allMissing = [];
  const allWarnings = [];

  const vwap      = computeVwapTelemetry(klines5m, entryPrice, config);
  const candle    = computeCandleTelemetry(klines1m, config);
  const impulse   = computeImpulseTelemetry(candle, atrPct, config);
  const bounce    = computeBounceContextTelemetry(bounceFromLow, config);

  allMissing.push(...vwap.missingFields, ...candle.missingFields);
  allWarnings.push(...vwap.warnings,     ...candle.warnings);

  const hasCandleData = candle.candleColorAtEntry !== "UNKNOWN";
  const entryTimingReason = computeEntryTimingReason(
    vwap.priceVsVwapLabel,
    impulse.redImpulseDetected,
    impulse.greenImpulseDetected,
    hasCandleData,
  );

  const criticalMissing = allMissing.filter(f => REQUIRED_FIELDS.includes(f));
  const telemetryComplete = criticalMissing.length === 0;

  return {
    version: "entry-telemetry-v1",
    computedAt: Date.now(),
    symbol,
    side,
    entryPrice,
    entryRank,

    // Existing signals copied into snapshot
    cvdRatio,
    cvdLabel:     cvdLabel ?? "UNKNOWN",
    atrPct,
    volAccel,
    spreadPct,
    oiVal,
    bounceFromLow,
    distFromHigh,
    change24h,
    quoteVol,

    // VWAP
    vwap:              vwap.vwap,
    vwapWindow:        vwap.vwapWindow,
    priceVsVwapPct:    vwap.priceVsVwapPct,
    priceVsVwapLabel:  vwap.priceVsVwapLabel,

    // Candle
    entryTimeframe:     candle.entryTimeframe,
    entryCandleOpen:    candle.entryCandleOpen,
    entryCandleHigh:    candle.entryCandleHigh,
    entryCandleLow:     candle.entryCandleLow,
    entryCandleClose:   candle.entryCandleClose,
    entryCandleVolume:  candle.entryCandleVolume,
    candleColorAtEntry: candle.candleColorAtEntry,
    candleBodyPct:      candle.candleBodyPct,
    upperWickPct:       candle.upperWickPct,
    lowerWickPct:       candle.lowerWickPct,
    candleRangePct:     candle.candleRangePct,

    // Impulse
    redImpulseDetected:   impulse.redImpulseDetected,
    greenImpulseDetected: impulse.greenImpulseDetected,
    impulseDirection:     impulse.impulseDirection,
    impulseStrength:      impulse.impulseStrength,
    impulseScore:         impulse.impulseScore,

    // Entry timing
    entryTimingReason,

    // Bounce context (new labels, distinct from legacy getBounceContext)
    bounceContext:       bounce.bounceContext,
    bounceContextSource: bounce.bounceContextSource,

    // Quality
    telemetryComplete,
    missingTelemetryFields: allMissing,
    telemetryWarnings:      allWarnings,
  };
}

// ─── CSV HELPERS ─────────────────────────────────────────────────────────────

/**
 * Escape a single CSV cell value: wrap in quotes if it contains comma/quote/newline.
 */
export function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize an array as a pipe-delimited string safe for CSV cells.
 */
export function pipeSeparated(arr) {
  if (!arr || arr.length === 0) return "";
  return arr.map(x => String(x).replace(/\|/g, " ")).join("|");
}

/**
 * Return the new CSV column headers for entry telemetry.
 */
export const ENTRY_TELEMETRY_CSV_HEADERS = [
  "entryTelemetryVersion",
  "telemetryComplete",
  "missingTelemetryFields",
  "telemetryWarnings",
  "vwap",
  "vwapWindow",
  "entryTelemetryPriceVsVwapPct",
  "priceVsVwapLabel",
  "entryTimeframe",
  "entryCandleOpen",
  "entryCandleHigh",
  "entryCandleLow",
  "entryCandleClose",
  "entryCandleVolume",
  "candleColorAtEntry",
  "candleBodyPct",
  "upperWickPct",
  "lowerWickPct",
  "candleRangePct",
  "redImpulseDetected",
  "greenImpulseDetected",
  "impulseDirection",
  "impulseStrength",
  "impulseScore",
  "entryTimingReason",
  "entryBounceContext",
  "bounceContextSource",
];

/**
 * Return CSV cell values for entry telemetry columns, in ENTRY_TELEMETRY_CSV_HEADERS order.
 */
export function entryTelemetryCSVRow(s) {
  const et = s.entryTelemetry;
  if (!et) {
    return ENTRY_TELEMETRY_CSV_HEADERS.map(() => "");
  }
  return [
    csvCell(et.version),
    csvCell(et.telemetryComplete),
    csvCell(pipeSeparated(et.missingTelemetryFields)),
    csvCell(pipeSeparated(et.telemetryWarnings)),
    csvCell(et.vwap ?? ""),
    csvCell(et.vwapWindow ?? ""),
    csvCell(et.priceVsVwapPct ?? ""),
    csvCell(et.priceVsVwapLabel ?? ""),
    csvCell(et.entryTimeframe ?? ""),
    csvCell(et.entryCandleOpen ?? ""),
    csvCell(et.entryCandleHigh ?? ""),
    csvCell(et.entryCandleLow ?? ""),
    csvCell(et.entryCandleClose ?? ""),
    csvCell(et.entryCandleVolume ?? ""),
    csvCell(et.candleColorAtEntry ?? ""),
    csvCell(et.candleBodyPct ?? ""),
    csvCell(et.upperWickPct ?? ""),
    csvCell(et.lowerWickPct ?? ""),
    csvCell(et.candleRangePct ?? ""),
    csvCell(et.redImpulseDetected),
    csvCell(et.greenImpulseDetected),
    csvCell(et.impulseDirection ?? ""),
    csvCell(et.impulseStrength ?? ""),
    csvCell(et.impulseScore ?? ""),
    csvCell(et.entryTimingReason ?? ""),
    csvCell(et.bounceContext ?? ""),
    csvCell(et.bounceContextSource ?? ""),
  ];
}

/**
 * Build the flattened root-level telemetry fields to spread onto a trade object.
 * These mirror the nested entryTelemetry values for quick FE access and CSV export.
 */
export function flattenEntryTelemetry(snapshot) {
  return {
    entryTelemetry:       snapshot,
    telemetryComplete:    snapshot.telemetryComplete,
    vwap:                 snapshot.vwap,
    vwapWindow:           snapshot.vwapWindow,
    priceVsVwapPct:       snapshot.priceVsVwapPct,
    priceVsVwapLabel:     snapshot.priceVsVwapLabel,
    entryTimeframe:       snapshot.entryTimeframe,
    candleColorAtEntry:   snapshot.candleColorAtEntry,
    candleBodyPct:        snapshot.candleBodyPct,
    upperWickPct:         snapshot.upperWickPct,
    lowerWickPct:         snapshot.lowerWickPct,
    candleRangePct:       snapshot.candleRangePct,
    redImpulseDetected:   snapshot.redImpulseDetected,
    greenImpulseDetected: snapshot.greenImpulseDetected,
    impulseDirection:     snapshot.impulseDirection,
    impulseStrength:      snapshot.impulseStrength,
    impulseScore:         snapshot.impulseScore,
    entryTimingReason:    snapshot.entryTimingReason,
    entryBounceContext:   snapshot.bounceContext,
    bounceContextSource:  snapshot.bounceContextSource,
    missingTelemetryFields: snapshot.missingTelemetryFields,
    telemetryWarnings:    snapshot.telemetryWarnings,
  };
}

/** Default entry state for a newly created trade (before async fetch completes). */
export const ENTRY_TELEMETRY_DEFAULTS = {
  entryTelemetry:       null,
  telemetryComplete:    false,
  vwap:                 null,
  vwapWindow:           null,
  priceVsVwapPct:       null,
  priceVsVwapLabel:     "UNKNOWN",
  entryTimeframe:       null,
  candleColorAtEntry:   "UNKNOWN",
  candleBodyPct:        null,
  upperWickPct:         null,
  lowerWickPct:         null,
  candleRangePct:       null,
  redImpulseDetected:   false,
  greenImpulseDetected: false,
  impulseDirection:     "UNKNOWN",
  impulseStrength:      "UNKNOWN",
  impulseScore:         null,
  entryTimingReason:    "UNKNOWN",
  entryBounceContext:   "UNKNOWN",
  bounceContextSource:  null,
  missingTelemetryFields: [],
  telemetryWarnings:    [],
};
