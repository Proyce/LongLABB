import { DEFAULT_POST_FEE_10_CONFIG, POST_FEE_10_SCORE_VERSION, mergePostFee10Config } from "./postFee10.config.js";
import {
  POST_FEE_10_TIER_LABELS,
  classifyPostFee10Tier,
  downgradePostFee10Tier,
} from "./postFee10.labels.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const uniq = arr => [...new Set(arr.filter(Boolean))];

const UNIVERSAL_REQUIRED_INPUTS = [
  "timestamp",
  "symbol",
  "tradeId",
  "leaderboardTab",
  "candleColorAtEntry",
  "immediateRedImpulse",
  "redImpulseDetected",
  "immediateGreenImpulse",
  "greenImpulseDetected",
  "cvdLabel",
  "atrPct",
  "priceVsVwapPct",
  "vwapContextLabel",
  "rsi1m",
  "rsi3m",
  "rsi5m",
  "rsi1mDelta",
  "macdHistogram1m",
  "macdHistogramDelta1m",
  "spreadPct",
  "quoteVolume",
  "thinBook",
  "btcRunDirection",
  "btcRegime",
];

const LOSER_REQUIRED_INPUTS = ["shortGatePass", "entryRank"];
const GAINER_REQUIRED_INPUTS = [
  "exhaustionScore",
  "exhaustionQualityScore",
  "failedBreakout",
  "pumpStillHot",
];

function finiteNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function boolOrNull(v) {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function own(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

function nestedBoolOrNull(primary, fallback, key) {
  if (own(primary, key)) return boolOrNull(primary[key]);
  if (own(fallback, key)) return boolOrNull(fallback[key]);
  return null;
}

function normalizeLeaderboardTab(trade) {
  const raw = String(
    trade?.leaderboardTab ??
    trade?.leaderboardSide ??
    trade?.shortParentBucket ??
    "",
  ).toLowerCase();

  if (raw.includes("gainer")) return "gainers";
  return "losers";
}

function deriveBtcRunDirection(trade) {
  const direct = stringOrNull(trade?.btcRunDirection);
  if (direct) return direct.toUpperCase();

  const directions = [
    trade?.btcDirection5m,
    trade?.btcDirection15m,
    trade?.btcDirection30m,
    trade?.btcDirection1h,
    trade?.btcDirection2h,
  ].map(d => stringOrNull(d)?.toUpperCase()).filter(Boolean);

  const down = directions.filter(d => d === "DOWN").length;
  const up = directions.filter(d => d === "UP").length;
  if (down > up && down > 0) return "DOWN";
  if (up > down && up > 0) return "UP";
  if (directions.length) return "MIXED";

  switch (trade?.btcRegime) {
    case "BTC_STRONG_DOWN":
    case "BTC_WEAK_DOWN":
      return "DOWN";
    case "BTC_STRONG_UP":
    case "BTC_WEAK_UP":
      return "UP";
    case "BTC_CHOP":
      return "CHOP";
    case "BTC_MIXED":
      return "MIXED";
    default:
      return null;
  }
}

function hasLabel(list, needle) {
  if (Array.isArray(list)) return list.includes(needle);
  if (typeof list === "string") return list.includes(needle);
  return false;
}

function buildEntrySnapshotFromTrade(trade, overrides = {}) {
  const entryTelemetry = trade?.entryTelemetry ?? {};
  const entryTiming = trade?.entryTiming ?? {};
  const side = normalizeLeaderboardTab(trade);
  const entryTime = finiteNumberOrNull(trade?.entryTime);
  const evaluatedAtMs = finiteNumberOrNull(overrides.evaluatedAtMs) ?? Date.now();
  const timestamp = overrides.timestamp ??
    (entryTime != null ? new Date(entryTime).toISOString() : new Date(evaluatedAtMs).toISOString());

  const vwapContextLabel =
    stringOrNull(trade?.vwapContextLabel) ??
    stringOrNull(trade?.topGainerVwapContextLabel) ??
    stringOrNull(trade?.priceVsVwapLabel) ??
    stringOrNull(entryTelemetry?.priceVsVwapLabel);

  const topGainerWarnings = Array.isArray(trade?.topGainerQualityWarningLabels)
    ? trade.topGainerQualityWarningLabels
    : [];
  const entryWarnings = Array.isArray(trade?.entryQualityWarningLabels)
    ? trade.entryQualityWarningLabels
    : [];

  const snapshot = {
    timestamp,
    symbol: stringOrNull(trade?.symbol),
    tradeId: String(trade?.tradeId ?? trade?.id ?? ""),
    runId: trade?.runId != null ? String(trade.runId) : trade?.run != null ? String(trade.run) : null,
    setId: trade?.setId != null ? String(trade.setId) : null,
    batchId: trade?.batchId != null ? String(trade.batchId) : trade?.autoRunId != null ? String(trade.autoRunId) : null,

    leaderboardTab: side,

    candleColorAtEntry:
      stringOrNull(entryTelemetry?.candleColorAtEntry) ??
      stringOrNull(trade?.candleColorAtEntry),
    immediateRedImpulse: nestedBoolOrNull(entryTiming, trade, "immediateRedImpulse"),
    redImpulseDetected: nestedBoolOrNull(entryTelemetry, trade, "redImpulseDetected"),
    immediateGreenImpulse: nestedBoolOrNull(entryTiming, trade, "immediateGreenImpulse"),
    greenImpulseDetected: nestedBoolOrNull(entryTelemetry, trade, "greenImpulseDetected"),

    cvdLabel: stringOrNull(trade?.cvdLabel),
    atrPct: finiteNumberOrNull(trade?.atrPct),

    priceVsVwapPct:
      finiteNumberOrNull(trade?.priceVsVwapPct) ??
      finiteNumberOrNull(entryTelemetry?.priceVsVwapPct) ??
      finiteNumberOrNull(entryTiming?.priceVsVwapPct),
    priceVsVwapLabel:
      stringOrNull(trade?.priceVsVwapLabel) ??
      stringOrNull(entryTelemetry?.priceVsVwapLabel),
    vwapContextLabel,

    rsi1m: finiteNumberOrNull(trade?.rsi1m),
    rsi3m: finiteNumberOrNull(trade?.rsi3m),
    rsi5m: finiteNumberOrNull(trade?.rsi5m),
    rsi1mDelta: finiteNumberOrNull(trade?.rsi1mDelta),

    macdHistogram1m: finiteNumberOrNull(trade?.macdHistogram1m),
    macdHistogramDelta1m: finiteNumberOrNull(trade?.macdHistogramDelta1m),
    macdHistogramState1m: stringOrNull(trade?.macdHistogramState1m),

    spreadPct: finiteNumberOrNull(trade?.spreadPct),
    quoteVolume: finiteNumberOrNull(trade?.quoteVolume ?? trade?.quoteVol),
    thinBook: boolOrNull(trade?.thinBook),

    btcRunDirection: deriveBtcRunDirection(trade),
    btcRegime: stringOrNull(trade?.btcRegime),
    btcDirection5m: stringOrNull(trade?.btcDirection5m),
    btcDirection15m: stringOrNull(trade?.btcDirection15m),
    btcDirection1h: stringOrNull(trade?.btcDirection1h),
    btcDirection2h: stringOrNull(trade?.btcDirection2h),
    btcAlignment: stringOrNull(trade?.btcAlignment),

    shortGatePass: boolOrNull(trade?.shortGatePass ?? trade?.shortGateWouldPass),
    entryRank: finiteNumberOrNull(trade?.entryRankInBucket ?? trade?.entryRank),

    exhaustionScore: finiteNumberOrNull(trade?.exhaustionScore ?? trade?.topGainerExhaustionScore),
    exhaustionQualityScore: finiteNumberOrNull(trade?.exhaustionQualityScore ?? trade?.topGainerExhaustionQualityScore),
    failedBreakout: boolOrNull(trade?.failedBreakout ?? trade?.hasGainerFailedBreakout),
    pumpStillHot: boolOrNull(
      trade?.pumpStillHot ??
      (trade?.topGainerPumpPhaseLabel === "GAINER_PUMP_STILL_HOT" ? true : null),
    ),

    last3TicksDirection:
      stringOrNull(entryTiming?.last3TicksDirection) ??
      stringOrNull(trade?.last3TicksDirection),
    lowerHighConfirmed1m: boolOrNull(trade?.lowerHighConfirmed1m ?? trade?.hasGainerLowerHigh),
    lowerHighFailedReclaim: boolOrNull(trade?.lowerHighFailedReclaim),
    failedReclaim: boolOrNull(trade?.failedReclaim),
    vwapLossWithRedConfirmation: boolOrNull(
      trade?.vwapLossWithRedConfirmation ??
      (vwapContextLabel === "BELOW_VWAP_WITH_RED_CONFIRMATION" ||
       vwapContextLabel === "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION" ? true : null),
    ),
    aboveVwapRejectionWithRed: boolOrNull(
      trade?.aboveVwapRejectionWithRed ??
      trade?.hasGainerRedRejection ??
      (vwapContextLabel === "ABOVE_VWAP_REJECTION_SETUP" ? true : null),
    ),
    failedBreakoutWithRed: boolOrNull(
      trade?.failedBreakoutWithRed ??
      (trade?.hasGainerFailedBreakout === true && (
        trade?.hasRedConfirmation === true ||
        trade?.immediateRedImpulse === true ||
        trade?.redImpulseDetected === true
      ) ? true : null),
    ),
    hasRedConfirmation: boolOrNull(trade?.hasRedConfirmation),
    hasMicroMomentum: boolOrNull(trade?.hasMicroMomentum),
    shortGateFail: boolOrNull(trade?.shortGateFail ?? (trade?.shortGateWouldPass === false ? true : null)),
    greenPressureLabel: stringOrNull(trade?.greenPressureLabel),
    volAccel: finiteNumberOrNull(trade?.volAccel),
    dmiBias1m: stringOrNull(trade?.dmiBias1m),
    dmiBias3m: stringOrNull(trade?.dmiBias3m),
    dmiBias5m: stringOrNull(trade?.dmiBias5m),
    adxStrength1m: stringOrNull(trade?.adxStrength1m),
    adxStrength3m: stringOrNull(trade?.adxStrength3m),
    adxStrength5m: stringOrNull(trade?.adxStrength5m),

    gainerMicroMultiConfirm: boolOrNull(
      trade?.gainerMicroMultiConfirm ??
      (trade?.topGainerMicroExhaustionLabel === "GAINER_MICRO_MULTI_CONFIRM" ? true : null),
    ),
    classicExhaustion: boolOrNull(
      trade?.classicExhaustion ??
      (trade?.topGainerThesisLaneLabel === "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT" ? true : null),
    ),
    confirmedVwapRejection: boolOrNull(
      trade?.confirmedVwapRejection ??
      trade?.hasGainerRedRejection ??
      (vwapContextLabel === "ABOVE_VWAP_REJECTION_SETUP" ? true : null),
    ),
    continuationPressureLabel: stringOrNull(trade?.continuationPressureLabel ?? trade?.topGainerContinuationPressureLabel),
    hasGainerContinuationDanger: boolOrNull(trade?.hasGainerContinuationDanger),
    isBlindWeaknessShort: boolOrNull(trade?.isBlindWeaknessShort),
    isStartupStormEntry: boolOrNull(trade?.isStartupStormEntry ?? trade?.bootStartupStormEntry),
    sameSymbolFastReentryAfterLoss: boolOrNull(trade?.sameSymbolFastReentryAfterLoss),
    warningLabels: uniq([...topGainerWarnings, ...entryWarnings, ...(trade?.warningFlags ?? [])]),
  };

  return Object.freeze({ ...snapshot, ...overrides });
}

export function buildPostFee10EntrySnapshot(trade, overrides = {}) {
  return buildEntrySnapshotFromTrade(trade, overrides);
}

function requiredInputsFor(snapshot) {
  return [
    ...UNIVERSAL_REQUIRED_INPUTS,
    ...(snapshot.leaderboardTab === "gainers" ? GAINER_REQUIRED_INPUTS : LOSER_REQUIRED_INPUTS),
  ];
}

function isPresent(value) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim() !== "" && value !== "UNKNOWN";
  return true;
}

function computeCompleteness(snapshot) {
  const fields = requiredInputsFor(snapshot);
  const missingInputs = fields.filter(f => !isPresent(snapshot[f]));
  const inputCompletenessPct = fields.length
    ? Number((((fields.length - missingInputs.length) / fields.length) * 100).toFixed(2))
    : 100;
  return { inputCompletenessPct, missingInputs };
}

function hasFreshRedEvidence(snapshot) {
  return (
    snapshot.immediateRedImpulse === true ||
    snapshot.redImpulseDetected === true ||
    snapshot.candleColorAtEntry === "RED" ||
    snapshot.last3TicksDirection === "DOWN" ||
    snapshot.lowerHighConfirmed1m === true ||
    snapshot.hasRedConfirmation === true
  );
}

function hasRedConfirmation(snapshot) {
  return (
    snapshot.immediateRedImpulse === true ||
    snapshot.redImpulseDetected === true ||
    snapshot.candleColorAtEntry === "RED" ||
    snapshot.hasRedConfirmation === true ||
    snapshot.vwapLossWithRedConfirmation === true ||
    snapshot.aboveVwapRejectionWithRed === true ||
    snapshot.failedBreakoutWithRed === true
  );
}

function isBelowVwap(snapshot) {
  return (
    snapshot.priceVsVwapLabel === "BELOW_VWAP" ||
    snapshot.priceVsVwapPct < -0.05 ||
    snapshot.vwapContextLabel === "BELOW_VWAP_WITH_RED_CONFIRMATION" ||
    snapshot.vwapContextLabel === "BELOW_VWAP_NO_CONFIRMATION" ||
    snapshot.vwapContextLabel === "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION"
  );
}

function isAboveVwap(snapshot) {
  return (
    snapshot.priceVsVwapLabel === "ABOVE_VWAP" ||
    snapshot.priceVsVwapPct > 0.05 ||
    snapshot.vwapContextLabel === "ABOVE_VWAP_REJECTION_SETUP" ||
    snapshot.vwapContextLabel === "ABOVE_VWAP_GREEN_DANGER"
  );
}

function scoreFreshRedEvent(snapshot, out) {
  if (snapshot.immediateRedImpulse === true) {
    out.labels.push("FRESH_RED_EVENT", "IMMEDIATE_RED_IMPULSE");
    out.reasons.push("Immediate red impulse at entry");
    return 20;
  }
  if (snapshot.redImpulseDetected === true) {
    out.labels.push("FRESH_RED_EVENT", "RED_IMPULSE_CONFIRMED");
    out.reasons.push("Red impulse confirmed on entry candle");
    return 18;
  }
  if (snapshot.candleColorAtEntry === "RED") {
    out.labels.push("FRESH_RED_EVENT", "RED_CANDLE_CONFIRMATION");
    out.reasons.push("Entry candle closed red");
    return 14;
  }
  if (snapshot.last3TicksDirection === "DOWN") {
    out.labels.push("FRESH_RED_EVENT");
    out.reasons.push("Last three entry ticks lean down");
    return 10;
  }
  if (snapshot.lowerHighConfirmed1m === true) {
    out.labels.push("FRESH_RED_EVENT");
    out.reasons.push("Lower high confirmed on 1m structure");
    return 6;
  }
  return 0;
}

function scoreAbsenceOfGreen(snapshot, out) {
  if (snapshot.immediateGreenImpulse === false && snapshot.greenImpulseDetected === false) {
    out.labels.push("NO_GREEN_IMPULSE", "NO_IMMEDIATE_GREEN_IMPULSE");
    out.reasons.push("No immediate or detected green impulse at entry");
    return 15;
  }
  if (snapshot.immediateGreenImpulse === false && snapshot.greenImpulseDetected == null) {
    out.labels.push("NO_IMMEDIATE_GREEN_IMPULSE");
    out.reasons.push("Immediate green impulse absent; broader green impulse data missing");
    return 10;
  }
  if (
    snapshot.immediateGreenImpulse === false &&
    snapshot.greenImpulseDetected !== true &&
    ["GREEN_PRESSURE_REJECTED_BY_RED", "GREEN_PRESSURE_WITH_RSI_ROLLOVER"].includes(snapshot.greenPressureLabel)
  ) {
    out.reasons.push("Green pressure was weak or rejected");
    return 5;
  }
  return 0;
}

function scoreCvd(snapshot, out) {
  if (snapshot.cvdLabel === "BEAR") {
    out.labels.push("CVD_BEAR", "CVD_NOT_BULLISH");
    out.reasons.push("CVD is bearish at entry");
    return 15;
  }
  if (snapshot.cvdLabel === "NEUT") {
    out.labels.push("CVD_NEUTRAL_SAFE", "CVD_NOT_BULLISH");
    out.reasons.push("CVD is neutral and not bullish");
    return 10;
  }
  if (!snapshot.cvdLabel && hasFreshRedEvidence(snapshot)) {
    out.reasons.push("CVD missing; other sell-flow evidence is bearish");
    return 3;
  }
  return 0;
}

function scoreAtr(snapshot, out) {
  const atr = snapshot.atrPct;
  if (atr >= 1.0) {
    out.labels.push("ATR_SUPER_ACTIVE");
    out.reasons.push("ATR movement potential is very active");
    return 10;
  }
  if (atr >= 0.6) {
    out.labels.push("ATR_SNIPER_ACTIVE");
    out.reasons.push("ATR movement potential supports a sniper setup");
    return 8;
  }
  if (atr >= 0.2) {
    out.labels.push("ATR_ACTIVE");
    out.reasons.push("ATR movement potential is active enough for broad tracking");
    return 5;
  }
  out.labels.push("ATR_DEAD");
  return 0;
}

function scoreVwapStructure(snapshot, out) {
  const red = hasRedConfirmation(snapshot);
  if (isBelowVwap(snapshot) && red) {
    out.labels.push("BELOW_VWAP_WITH_RED_CONFIRMATION");
    out.reasons.push("Below VWAP with red confirmation");
    return 10;
  }
  if (snapshot.failedBreakoutWithRed === true || (snapshot.failedBreakout === true && red)) {
    out.labels.push("FAILED_BREAKOUT_WITH_RED");
    out.reasons.push("Failed breakout with red confirmation");
    return 10;
  }
  if (snapshot.vwapLossWithRedConfirmation === true) {
    out.labels.push("VWAP_LOSS_WITH_RED_CONFIRMATION");
    out.reasons.push("VWAP loss confirmed by red flow");
    return 9;
  }
  if (snapshot.aboveVwapRejectionWithRed === true) {
    out.labels.push("ABOVE_VWAP_REJECTION_WITH_RED");
    out.reasons.push("Above-VWAP rejection confirmed by red flow");
    return 8;
  }
  if (snapshot.lowerHighFailedReclaim === true || (snapshot.lowerHighConfirmed1m === true && snapshot.failedReclaim === true)) {
    out.labels.push("LOWER_HIGH_FAILED_RECLAIM");
    out.reasons.push("Lower high plus failed reclaim");
    return 7;
  }
  if (isBelowVwap(snapshot) && hasFreshRedEvidence(snapshot)) {
    out.reasons.push("Below VWAP with fresh selling evidence");
    return 5;
  }
  return 0;
}

function scoreMomentum(snapshot, out) {
  let score = 0;
  const macdState = snapshot.macdHistogramState1m ?? "";
  const macd = snapshot.macdHistogram1m;
  const macdDelta = snapshot.macdHistogramDelta1m;

  if ((macd < 0 && macdDelta < 0) || macdState.includes("NEGATIVE_EXPANDING")) {
    score += 4;
    out.labels.push("MACD_NEGATIVE_EXPANDING");
  } else if (
    macdState.includes("ROLLOVER") ||
    macdState.includes("POSITIVE_SHRINKING") ||
    macdState.includes("NEGATIVE_SHRINKING") ||
    macdDelta < 0
  ) {
    score += 3;
    out.labels.push("MACD_ROLLOVER");
  }

  if (snapshot.rsi1mDelta < 0 || snapshot.rsi1mSlope === "FALLING") {
    score += 3;
    out.labels.push("RSI_1M_ROLLOVER");
  }
  if (snapshot.rsi1m != null && snapshot.rsi3m != null && snapshot.rsi1m < snapshot.rsi3m) {
    score += 2;
    out.labels.push("RSI_BEARISH_STACK");
  }
  if (snapshot.rsi3m != null && snapshot.rsi5m != null && snapshot.rsi3m < snapshot.rsi5m) {
    score += 2;
    out.labels.push("RSI_BEARISH_STACK");
  }
  if (snapshot.lowerHighConfirmed1m === true) score += 2;

  const dmiBearish = [snapshot.dmiBias1m, snapshot.dmiBias3m, snapshot.dmiBias5m].some(v => v === "BEARISH_DMI");
  const adxExpanding = [snapshot.adxStrength1m, snapshot.adxStrength3m, snapshot.adxStrength5m]
    .some(v => ["EMERGING", "STRONG", "VERY_STRONG"].includes(v));
  if (dmiBearish && adxExpanding) {
    score += 2;
    out.labels.push("BEARISH_MOMENTUM_EXPANSION");
  }

  if (score > 0) out.reasons.push("Momentum rollover supports the short");
  return Math.min(10, score);
}

function scoreLiquidity(snapshot, out, config) {
  let score = 0;
  if (snapshot.spreadPct != null && snapshot.spreadPct <= config.maximumCleanSpreadPct) {
    score += 2;
    out.labels.push("CLEAN_SPREAD");
  }
  if (snapshot.quoteVolume >= 20_000_000) {
    score += 1;
    out.labels.push("HIGH_LIQUIDITY");
  }
  if (snapshot.quoteVolume >= 30_000_000) score += 1;
  if (snapshot.thinBook === false) {
    score += 1;
    out.labels.push("NO_THIN_BOOK");
  }
  if (score > 0) out.reasons.push("Execution quality is usable");
  return Math.min(5, score);
}

function scoreBtc(snapshot, out) {
  if (snapshot.btcRunDirection === "DOWN") {
    out.labels.push("BTC_ACTUAL_DOWN_TAILWIND");
    out.reasons.push("BTC actual run direction is down");
    return 5;
  }
  if (
    snapshot.btcAlignment === "ALL_DOWN" ||
    snapshot.btcAlignment === "MOSTLY_DOWN" ||
    (snapshot.btcDirection5m === "DOWN" && snapshot.btcDirection15m === "DOWN") ||
    (snapshot.btcDirection15m === "DOWN" && snapshot.btcDirection1h === "DOWN")
  ) {
    out.labels.push("BTC_BEARISH_ALIGNMENT");
    out.reasons.push("BTC lower-timeframe alignment is bearish");
    return 4;
  }
  const dirs = [snapshot.btcDirection5m, snapshot.btcDirection15m, snapshot.btcDirection1h, snapshot.btcDirection2h];
  const down = dirs.filter(v => v === "DOWN").length;
  const up = dirs.filter(v => v === "UP").length;
  if (down > up && down > 0) {
    out.reasons.push("BTC context is mixed but leaning bearish");
    return 3;
  }
  if (snapshot.btcRunDirection === "CHOP" || snapshot.btcRegime === "BTC_CHOP" || snapshot.btcAlignment === "CHOP") {
    out.labels.push("BTC_CHOP_SAFE");
    out.reasons.push("BTC chop is safe enough for observation");
    return 2;
  }
  return 0;
}

function scoreLoserSide(snapshot, out, config) {
  if (snapshot.leaderboardTab !== "losers") return 0;
  let score = 0;
  out.labels.push("LOSER_POST_FEE_10_SETUP");
  if (snapshot.shortGatePass === true) {
    score += 4;
    out.labels.push("LOSER_SHORT_GATE_CONFIRMED");
  }
  if (snapshot.entryRank != null && snapshot.entryRank <= 15) {
    score += 2;
    out.labels.push("LOSER_RANK_QUALITY");
  }
  if (isBelowVwap(snapshot) && hasRedConfirmation(snapshot)) {
    score += 2;
    out.labels.push("LOSER_CONTINUATION_STRUCTURE");
  }
  if (snapshot.spreadPct != null && snapshot.spreadPct <= config.maximumCleanSpreadPct) score += 2;
  if (score > 0) out.reasons.push("Loser-side setup has fresh continuation traits");
  return Math.min(10, score);
}

function scoreGainerSide(snapshot, out) {
  if (snapshot.leaderboardTab !== "gainers") return 0;
  let score = 0;
  out.labels.push("GAINER_POST_FEE_10_EXHAUSTION_SETUP");
  if (snapshot.exhaustionScore >= 80) {
    score += 3;
    out.labels.push("GAINER_EXHAUSTION_80");
  }
  if (snapshot.exhaustionQualityScore >= 120) {
    score += 2;
    out.labels.push("GAINER_EXHAUSTION_QUALITY_120");
  }
  if (snapshot.failedBreakout === true || snapshot.failedBreakoutWithRed === true) {
    score += 2;
    out.labels.push("GAINER_FAILED_BREAKOUT");
  }
  if (snapshot.gainerMicroMultiConfirm === true) {
    score += 2;
    out.labels.push("GAINER_MICRO_MULTI_CONFIRM");
  }
  if (snapshot.classicExhaustion === true || snapshot.confirmedVwapRejection === true || snapshot.vwapLossWithRedConfirmation === true) {
    score += 1;
  }
  if (score > 0) out.reasons.push("Gainer-side exhaustion setup is confirmed");
  return Math.min(10, score);
}

function computePenalties(snapshot, out) {
  let penalty = 0;
  const add = (points, label, reason = label) => {
    penalty += points;
    out.warnings.push(label);
    out.reasons.push(reason);
  };

  if (snapshot.immediateGreenImpulse === true) add(35, "GREEN_IMPULSE_DANGER", "Immediate green impulse is active");
  if (snapshot.cvdLabel === "BULL") add(30, "BULLISH_CVD_DANGER", "CVD is bullish");
  if (snapshot.greenImpulseDetected === true) add(25, "GREEN_IMPULSE_DANGER", "Green impulse detected");
  if (
    isAboveVwap(snapshot) &&
    snapshot.volAccel > 0 &&
    snapshot.aboveVwapRejectionWithRed !== true &&
    snapshot.failedBreakoutWithRed !== true
  ) add(25, "ABOVE_VWAP_BUYER_ACCEL_DANGER", "Above VWAP with buyer volume acceleration and no red rejection");
  if (snapshot.pumpStillHot === true) add(25, "PUMP_STILL_HOT_DANGER", "Pump is still hot");
  if (
    snapshot.hasGainerContinuationDanger === true ||
    ["HIGH", "EXTREME", "GAINER_CONTINUATION_HIGH", "GAINER_CONTINUATION_EXTREME"].includes(snapshot.continuationPressureLabel)
  ) add(25, "CONTINUATION_PRESSURE_DANGER", "Continuation pressure is high");
  if (
    snapshot.vwapContextLabel === "VWAP_RECLAIM" ||
    snapshot.vwapContextLabel === "ABOVE_VWAP_GREEN_DANGER" ||
    hasLabel(snapshot.warningLabels, "VWAP_RECLAIM")
  ) add(20, "VWAP_RECLAIM_DANGER", "VWAP reclaim warning");
  if (snapshot.hasMicroMomentum === false || snapshot.shortGateFail === true || snapshot.shortGatePass === false) {
    add(20, "NO_MICRO_MOMENTUM", "No micro momentum or short gate fail");
  }
  if (snapshot.thinBook === true) add(15, "THIN_BOOK_DANGER", "Thin book danger");
  if (snapshot.spreadPct != null && snapshot.spreadPct > 0.10) add(15, "THIN_BOOK_DANGER", "Spread is wider than 0.10%");
  if (snapshot.isBlindWeaknessShort === true) add(15, "BLIND_WEAKNESS_DANGER", "Blind weakness short");
  if (snapshot.btcRunDirection === "UP") add(15, "BTC_UP_HEADWIND", "BTC actual direction is up");
  if (snapshot.candleColorAtEntry === "GREEN") add(10, "GREEN_IMPULSE_DANGER", "Entry candle is green");
  if (!hasFreshRedEvidence(snapshot)) add(10, "NO_FRESH_SELLING", "No fresh red selling evidence");
  if (snapshot.sameSymbolFastReentryAfterLoss === true) add(10, "SAME_SYMBOL_FAST_REENTRY_AFTER_LOSS", "Same-symbol fast re-entry after loss");
  if (snapshot.isStartupStormEntry === true) add(10, "BOOT_STARTUP_STORM_ENTRY", "Boot/startup storm entry");

  return penalty;
}

function isNoGreenImpulse(snapshot) {
  return snapshot.immediateGreenImpulse === false && snapshot.greenImpulseDetected === false;
}

function addCandidateLabels(snapshot, score, labels, config) {
  const freshRedEvidence = hasFreshRedEvidence(snapshot);
  const noGreenImpulse = isNoGreenImpulse(snapshot);
  const cvdNotBull = snapshot.cvdLabel !== "BULL";
  const thinBookSafe = snapshot.thinBook !== true;
  const postFee10Candidate =
    score >= config.candidateThreshold &&
    snapshot.immediateGreenImpulse !== true &&
    cvdNotBull;
  const postFee10Sniper =
    score >= config.sniperThreshold &&
    (!config.requireFreshRedForSniper || freshRedEvidence) &&
    snapshot.atrPct >= config.minimumAtrSniper &&
    (!config.requireNoImmediateGreenForSniper || noGreenImpulse) &&
    (!config.requireCvdNotBullForSniper || cvdNotBull) &&
    thinBookSafe;

  if (postFee10Candidate) labels.push("POST_FEE_10_CANDIDATE");
  if (postFee10Sniper) labels.push("POST_FEE_10_SNIPER");

  if (
    snapshot.leaderboardTab === "losers" &&
    postFee10Sniper &&
    snapshot.shortGatePass === true &&
    snapshot.spreadPct != null &&
    snapshot.spreadPct <= config.maximumCleanSpreadPct
  ) labels.push("LOSER_POST_FEE_10_SNIPER");

  if (
    snapshot.leaderboardTab === "gainers" &&
    postFee10Sniper &&
    snapshot.exhaustionScore >= 80 &&
    (
      snapshot.failedBreakout === true ||
      snapshot.gainerMicroMultiConfirm === true ||
      snapshot.vwapLossWithRedConfirmation === true
    ) &&
    snapshot.pumpStillHot !== true
  ) labels.push("GAINER_POST_FEE_10_SNIPER");
}

export function calculatePostFee10EntryAssessment(snapshot, configInput = DEFAULT_POST_FEE_10_CONFIG) {
  const config = mergePostFee10Config(configInput);

  if (config.logOnly !== true) {
    throw new Error("POST_FEE_10_DETECTOR_V1 is currently supported only in log-only mode.");
  }

  const labels = [];
  const reasons = [];
  const warnings = [];
  const out = { labels, reasons, warnings };
  const { inputCompletenessPct, missingInputs } = computeCompleteness(snapshot);

  const universalScore =
    scoreFreshRedEvent(snapshot, out) +
    scoreAbsenceOfGreen(snapshot, out) +
    scoreCvd(snapshot, out) +
    scoreAtr(snapshot, out) +
    scoreVwapStructure(snapshot, out) +
    scoreMomentum(snapshot, out) +
    scoreLiquidity(snapshot, out, config) +
    scoreBtc(snapshot, out);

  const sideSpecificScore = snapshot.leaderboardTab === "gainers"
    ? scoreGainerSide(snapshot, out)
    : scoreLoserSide(snapshot, out, config);
  const totalPenalty = computePenalties(snapshot, out);
  const score = clamp(universalScore + sideSpecificScore - totalPenalty, 0, 100);

  let tier = classifyPostFee10Tier(score);
  if (inputCompletenessPct < 70) {
    warnings.push("LOW_SCORE_INPUT_COMPLETENESS");
    tier = downgradePostFee10Tier(tier);
  }

  labels.push(POST_FEE_10_TIER_LABELS[tier]);
  addCandidateLabels(snapshot, score, labels, config);

  const assessment = {
    version: POST_FEE_10_SCORE_VERSION,
    evaluatedAt: new Date().toISOString(),

    score,
    tier,

    universalScore,
    sideSpecificScore,
    totalPenalty,

    labels: uniq(labels),
    reasons: uniq(reasons),
    warnings: uniq(warnings),

    inputCompletenessPct,
    missingInputs: uniq(missingInputs),
  };

  return Object.freeze(assessment);
}

function jsonArray(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function flattenPostFee10EntryAssessment(snapshot, assessment) {
  if (!assessment) return POST_FEE_10_DEFAULT_FIELDS;
  const labels = assessment.labels ?? [];
  return {
    postFee10EntrySnapshot: snapshot ?? null,
    postFee10EntryAssessment: assessment,
    postFee10EntryScoreVersion: assessment.version,
    postFee10EntryScore: assessment.score,
    postFee10EntryTier: assessment.tier,
    postFee10UniversalScore: assessment.universalScore,
    postFee10SideSpecificScore: assessment.sideSpecificScore,
    postFee10PenaltyTotal: assessment.totalPenalty,
    postFee10InputCompletenessPct: assessment.inputCompletenessPct,
    postFee10Candidate: labels.includes("POST_FEE_10_CANDIDATE"),
    postFee10Sniper: labels.includes("POST_FEE_10_SNIPER"),
    loserPostFee10Sniper: labels.includes("LOSER_POST_FEE_10_SNIPER"),
    gainerPostFee10Sniper: labels.includes("GAINER_POST_FEE_10_SNIPER"),
    postFee10EntryLabels: labels,
    postFee10EntryReasons: assessment.reasons ?? [],
    postFee10EntryWarnings: assessment.warnings ?? [],
    postFee10MissingInputs: assessment.missingInputs ?? [],
  };
}

export const POST_FEE_10_DEFAULT_FIELDS = {
  postFee10EntrySnapshot: null,
  postFee10EntryAssessment: null,
  postFee10EntryScoreVersion: null,
  postFee10EntryScore: null,
  postFee10EntryTier: null,
  postFee10UniversalScore: null,
  postFee10SideSpecificScore: null,
  postFee10PenaltyTotal: null,
  postFee10InputCompletenessPct: null,
  postFee10Candidate: false,
  postFee10Sniper: false,
  loserPostFee10Sniper: false,
  gainerPostFee10Sniper: false,
  postFee10EntryLabels: [],
  postFee10EntryReasons: [],
  postFee10EntryWarnings: [],
  postFee10MissingInputs: [],

  postFee10Winner: false,
  normalizedMarginPnlPct: null,
  mfePct: null,
  maePct: null,
  timeToMfe3PctMs: null,
  timeToMfe5PctMs: null,
  timeToMfe10PctMs: null,
  reachedPostFee10: false,
  reachedPostFee10At: null,
  timeToPostFee10Ms: null,
  reachedPostFee10BeforeMae1Pct: null,
  reachedPostFee10BeforeMae2Pct: null,
  bestRankInRun: null,
  bestRankInSet: null,
  bestRankInBatch: null,
  isTop3WinnerInRun: false,
  isTop3WinnerInSet: false,
  isTop3WinnerInBatch: false,
  postFee10LiveConfirmationScore: null,
  postFee10LiveConfirmationLabels: [],
  postFee10LiveConfirmationWarnings: [],
  postFee10LiveConfirmationCheckpoints: [],
};

export const POST_FEE_10_CSV_HEADERS = [
  "postFee10EntryScoreVersion",
  "postFee10EntryScore",
  "postFee10EntryTier",
  "postFee10UniversalScore",
  "postFee10SideSpecificScore",
  "postFee10PenaltyTotal",
  "postFee10InputCompletenessPct",
  "postFee10Candidate",
  "postFee10Sniper",
  "loserPostFee10Sniper",
  "gainerPostFee10Sniper",
  "postFee10EntryLabels",
  "postFee10EntryReasons",
  "postFee10EntryWarnings",
  "postFee10MissingInputs",
  "postFee10Winner",
  "normalizedMarginPnlPct",
  "mfePct",
  "maePct",
  "timeToMfe3PctMs",
  "timeToMfe5PctMs",
  "timeToMfe10PctMs",
  "reachedPostFee10",
  "reachedPostFee10At",
  "timeToPostFee10Ms",
  "reachedPostFee10BeforeMae1Pct",
  "reachedPostFee10BeforeMae2Pct",
  "bestRankInRun",
  "bestRankInSet",
  "bestRankInBatch",
  "isTop3WinnerInRun",
  "isTop3WinnerInSet",
  "isTop3WinnerInBatch",
  "postFee10LiveConfirmationScore",
  "postFee10LiveConfirmationLabels",
  "postFee10LiveConfirmationWarnings",
];

export function postFee10CSVRow(s) {
  return [
    csvCell(s.postFee10EntryScoreVersion ?? s.postFee10ScoreVersion ?? ""),
    csvCell(s.postFee10EntryScore ?? ""),
    csvCell(s.postFee10EntryTier ?? ""),
    csvCell(s.postFee10UniversalScore ?? ""),
    csvCell(s.postFee10SideSpecificScore ?? ""),
    csvCell(s.postFee10PenaltyTotal ?? ""),
    csvCell(s.postFee10InputCompletenessPct ?? ""),
    csvCell(s.postFee10Candidate ?? ""),
    csvCell(s.postFee10Sniper ?? ""),
    csvCell(s.loserPostFee10Sniper ?? ""),
    csvCell(s.gainerPostFee10Sniper ?? ""),
    csvCell(jsonArray(s.postFee10EntryLabels)),
    csvCell(jsonArray(s.postFee10EntryReasons)),
    csvCell(jsonArray(s.postFee10EntryWarnings)),
    csvCell(jsonArray(s.postFee10MissingInputs)),
    csvCell(s.postFee10Winner ?? ""),
    csvCell(s.normalizedMarginPnlPct ?? ""),
    csvCell(s.mfePct ?? ""),
    csvCell(s.maePct ?? ""),
    csvCell(s.timeToMfe3PctMs ?? ""),
    csvCell(s.timeToMfe5PctMs ?? ""),
    csvCell(s.timeToMfe10PctMs ?? ""),
    csvCell(s.reachedPostFee10 ?? ""),
    csvCell(s.reachedPostFee10At ?? ""),
    csvCell(s.timeToPostFee10Ms ?? ""),
    csvCell(s.reachedPostFee10BeforeMae1Pct ?? ""),
    csvCell(s.reachedPostFee10BeforeMae2Pct ?? ""),
    csvCell(s.bestRankInRun ?? ""),
    csvCell(s.bestRankInSet ?? ""),
    csvCell(s.bestRankInBatch ?? ""),
    csvCell(s.isTop3WinnerInRun ?? ""),
    csvCell(s.isTop3WinnerInSet ?? ""),
    csvCell(s.isTop3WinnerInBatch ?? ""),
    csvCell(s.postFee10LiveConfirmationScore ?? ""),
    csvCell(jsonArray(s.postFee10LiveConfirmationLabels)),
    csvCell(jsonArray(s.postFee10LiveConfirmationWarnings)),
  ];
}
