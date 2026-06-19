import { computeCandidateRunnerScore } from "../scoring/candidateRunner/candidateRunner.scorer.js";

export const BEST_DNA_VERSION = "BEST_DNA_V1";
export const POST_FEE_10_SCORE_VERSION_V2 = "POST_FEE_10_V2";
export const RUNNER_CAPTURE_VERSION = "RUNNER_CAPTURE_V1";

export const BEST_DNA_HIGH_MIN = 70;
export const BEST_DNA_SNIPER_MIN = 85;
export const BEST_DNA_ELITE_MIN = 95;

export const BEST_DNA_OBSERVER_CONFIG = Object.freeze({
  useBestDnaEntryGate: false,
  usePostFee10EntryGate: false,
  useRunnerScoreForForcedExit: false,
  useBestDnaForLeverage: false,
  useBestDnaForPositionSizing: false,
});

const round4 = n => Number.isFinite(Number(n)) ? parseFloat(Number(n).toFixed(4)) : null;
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const uniq = arr => [...new Set((arr ?? []).filter(Boolean))];

function finiteNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  return v === true;
}

function upper(v) {
  return typeof v === "string" ? v.toUpperCase() : "";
}

function hasLabel(list, label) {
  if (Array.isArray(list)) return list.includes(label);
  if (typeof list === "string") return list.includes(label);
  return false;
}

function macdBearish(sample) {
  const state = upper(sample?.macdHistogramState1m);
  const macd = finiteNumberOrNull(sample?.macdHistogram1m);
  const delta = finiteNumberOrNull(sample?.macdHistogramDelta1m);
  return (
    state.includes("NEGATIVE_EXPANDING") ||
    state.includes("BEARISH_ROLLOVER") ||
    (macd != null && delta != null && macd < 0 && delta < 0)
  );
}

function macdRollover(sample) {
  const state = upper(sample?.macdHistogramState1m);
  const delta = finiteNumberOrNull(sample?.macdHistogramDelta1m);
  return macdBearish(sample) || state.includes("ROLLOVER") || state.includes("SHRINKING") || (delta != null && delta < 0);
}

function rsiRollover(sample) {
  const d1 = finiteNumberOrNull(sample?.rsi1mDelta);
  const d3 = finiteNumberOrNull(sample?.rsi3mDelta);
  const spread = finiteNumberOrNull(sample?.rsiSpread1m3m);
  return bool(sample?.hasRsiRollover) || d1 < 0 || (d1 < 0 && spread < 0) || (d1 < 0 && d3 < 0);
}

function rsiFalling(sample) {
  return rsiRollover(sample) || upper(sample?.rsiDirectionAfterEntry) === "FALLING" || upper(sample?.rsiSlope1m) === "FALLING";
}

function rsiRisingStrong(sample) {
  const d1 = finiteNumberOrNull(sample?.rsi1mDelta);
  return upper(sample?.rsiDirectionAfterEntry) === "RISING" || upper(sample?.rsiSlope1m) === "RISING" || d1 >= 2;
}

function failedBreakout(sample) {
  return (
    bool(sample?.failedBreakout1m) ||
    bool(sample?.failedBreakout3m) ||
    bool(sample?.failedBreakout) ||
    bool(sample?.hasGainerFailedBreakout)
  );
}

function redConfirmation(sample) {
  return (
    bool(sample?.immediateRedImpulse) ||
    bool(sample?.redImpulseDetected) ||
    sample?.candleColorAtEntry === "RED" ||
    sample?.last3TicksDirection === "DOWN" ||
    bool(sample?.hasRedConfirmation)
  );
}

function noGreenImpulse(sample) {
  return sample?.greenImpulseDetected !== true && sample?.immediateGreenImpulse !== true;
}

function cvdNotBull(sample) {
  return sample?.cvdLabel !== "BULL";
}

function isBelowVwap(sample) {
  const label = sample?.priceVsVwapLabel ?? sample?.vwapContextLabel ?? sample?.topGainerVwapContextLabel;
  return label === "BELOW_VWAP" ||
    label === "BELOW_VWAP_WITH_RED_CONFIRMATION" ||
    label === "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION" ||
    bool(sample?.hasGainerVwapLoss) ||
    finiteNumberOrNull(sample?.priceVsVwapPct) < -0.05;
}

function isAboveVwap(sample) {
  const label = sample?.priceVsVwapLabel ?? sample?.vwapContextLabel ?? sample?.topGainerVwapContextLabel;
  return label === "ABOVE_VWAP" ||
    label === "ABOVE_VWAP_GREEN_DANGER" ||
    label === "ABOVE_VWAP_REJECTION_SETUP" ||
    label === "GAINER_ABOVE_VWAP_CONTINUATION_DANGER" ||
    label === "GAINER_ABOVE_VWAP_HOT_FADE" ||
    finiteNumberOrNull(sample?.priceVsVwapPct) > 0.05;
}

function vwapReclaim(sample) {
  return (
    sample?.vwapContextLabel === "VWAP_RECLAIM" ||
    sample?.topGainerVwapContextLabel === "VWAP_RECLAIM" ||
    hasLabel(sample?.entryQualityWarningLabels, "VWAP_RECLAIM") ||
    hasLabel(sample?.topGainerQualityWarningLabels, "VWAP_RECLAIM")
  );
}

function activeBuyerReturnWarning(sample) {
  return (
    bool(sample?.buyerReturnDetectedAfterEntry) ||
    sample?.greenPressureLabel === "IMMEDIATE_GREEN_ACTIVE" ||
    sample?.greenPressureLabel === "GREEN_IMPULSE_ACTIVE" ||
    sample?.greenPressureLabel === "GREEN_PRESSURE_WITHOUT_REJECTION" ||
    sample?.vwapContextLabel === "ABOVE_VWAP_GREEN_DANGER" ||
    sample?.topGainerVwapContextLabel === "GAINER_ABOVE_VWAP_CONTINUATION_DANGER"
  );
}

function pumpStillHot(sample) {
  return bool(sample?.pumpStillHot) || sample?.topGainerPumpPhaseLabel === "GAINER_PUMP_STILL_HOT";
}

function highContinuationPressure(sample) {
  return (
    bool(sample?.hasGainerContinuationDanger) ||
    ["HIGH", "EXTREME", "GAINER_CONTINUATION_HIGH", "GAINER_CONTINUATION_EXTREME"].includes(sample?.continuationPressureLabel) ||
    ["HIGH", "EXTREME", "GAINER_CONTINUATION_HIGH", "GAINER_CONTINUATION_EXTREME"].includes(sample?.topGainerContinuationPressureLabel)
  );
}

function addGene(bucket, points, code, text = code) {
  bucket.push(`${code}(${points > 0 ? "+" : ""}${points}): ${text}`);
  return points;
}

function computeUniversalBestDna(sample, positiveGenes, penaltyGenes) {
  let score = 0;
  const atr = finiteNumberOrNull(sample?.atrPct);
  const rank = finiteNumberOrNull(sample?.entryRankInBucket) ?? finiteNumberOrNull(sample?.entryRank);
  const red = redConfirmation(sample);
  const noGreen = noGreenImpulse(sample);
  const failed = failedBreakout(sample);
  const microLabel = sample?.microMomentumLabel ?? sample?.topGainerMicroExhaustionLabel;
  const spread = finiteNumberOrNull(sample?.spreadPct);
  const volAccel = finiteNumberOrNull(sample?.volAccel);

  if (atr >= 1.0) score += addGene(positiveGenes, 24, "ATR_GE_1");
  else if (atr >= 0.6) score += addGene(positiveGenes, 15, "ATR_0_6_TO_1");
  else if (atr >= 0.2) score += addGene(positiveGenes, 5, "ATR_0_2_TO_0_6");

  if (failed) score += addGene(positiveGenes, 18, "FAILED_BREAKOUT");
  if (bool(sample?.immediateRedImpulse)) score += addGene(positiveGenes, 12, "IMMEDIATE_RED_IMPULSE");
  if (bool(sample?.redImpulseDetected)) score += addGene(positiveGenes, 10, "RED_IMPULSE_DETECTED");
  if (sample?.last3TicksDirection === "DOWN") score += addGene(positiveGenes, 8, "LAST_3_TICKS_DOWN");
  if (red) score += addGene(positiveGenes, 6, "RED_CONFIRMATION");
  if (noGreen) score += addGene(positiveGenes, 10, "NO_GREEN_IMPULSE");

  if (sample?.cvdLabel === "BEAR") score += addGene(positiveGenes, 8, "CVD_BEAR");
  else if (sample?.cvdLabel === "NEUT") score += addGene(positiveGenes, 5, "CVD_NEUT");

  if (bool(sample?.shortGateWouldPass) || bool(sample?.shortGatePass)) score += addGene(positiveGenes, 10, "SHORT_GATE_PASS");
  if (spread != null && spread <= 0.05) score += addGene(positiveGenes, 4, "CLEAN_SPREAD");
  if (rank != null && rank <= 10) score += addGene(positiveGenes, 6, "ENTRY_RANK_LE_10");
  else if (rank != null && rank <= 15) score += addGene(positiveGenes, 3, "ENTRY_RANK_11_TO_15");

  if (microLabel === "MICRO_MULTI_CONFIRM" || microLabel === "GAINER_MICRO_MULTI_CONFIRM") {
    score += addGene(positiveGenes, 8, "MICRO_MULTI_CONFIRM");
  }
  if (macdRollover(sample)) score += addGene(positiveGenes, 7, "MACD_BEARISH_ROLLOVER");
  if (rsiRollover(sample)) score += addGene(positiveGenes, 6, "RSI_ROLLOVER");
  if (isBelowVwap(sample) && red) score += addGene(positiveGenes, 6, "BELOW_VWAP_RED_CONFIRMATION");

  if (bool(sample?.immediateGreenImpulse)) score += addGene(penaltyGenes, -28, "IMMEDIATE_GREEN_IMPULSE");
  else if (bool(sample?.greenImpulseDetected)) score += addGene(penaltyGenes, -20, "GREEN_IMPULSE_DETECTED");

  if (sample?.cvdLabel === "BULL") score += addGene(penaltyGenes, -18, "CVD_BULL");
  if (!red) score += addGene(penaltyGenes, -12, "NO_RED_CONFIRMATION");
  if (sample?.shortGateWouldPass === false || sample?.shortGatePass === false) score += addGene(penaltyGenes, -10, "SHORT_GATE_FAIL");
  if (microLabel === "MICRO_NO_CONFIRMATION" && sample?.shortGateWouldPass !== false) {
    score += addGene(penaltyGenes, -12, "MICRO_NO_CONFIRMATION");
  }
  if (isAboveVwap(sample) && volAccel > 0 && !red) score += addGene(penaltyGenes, -20, "ABOVE_VWAP_BUYER_ACCEL_NO_RED");
  if (spread != null && spread > 0.05) score += addGene(penaltyGenes, -10, "WIDE_SPREAD");
  if (bool(sample?.thinBook) || hasLabel(sample?.warningFlags, "THIN_BOOK")) score += addGene(penaltyGenes, -15, "THIN_BOOK");
  if (vwapReclaim(sample)) score += addGene(penaltyGenes, -16, "VWAP_RECLAIM");
  if (sample?.entryTimingGrade === "F" || sample?.entryTiming?.entryTimingGrade === "F") score += addGene(penaltyGenes, -18, "ENTRY_TIMING_GRADE_F");
  if (activeBuyerReturnWarning(sample)) score += addGene(penaltyGenes, -20, "ACTIVE_BUYER_RETURN_WARNING");

  return score;
}

function computeGainerBestDna(sample, positiveGenes, penaltyGenes) {
  if (sample?.shortParentBucket !== "TOP_GAINER_SHORTS") return 0;

  let score = 0;
  const exh = finiteNumberOrNull(sample?.topGainerExhaustionScore ?? sample?.exhaustionScore);
  const quality = finiteNumberOrNull(sample?.topGainerExhaustionQualityScore ?? sample?.exhaustionQualityScore);
  const failed = failedBreakout(sample);
  const red = redConfirmation(sample);

  if (exh >= 80) score += addGene(positiveGenes, 14, "GAINER_EXH80");
  if (quality >= 120) score += addGene(positiveGenes, 18, "GAINER_Q120");
  if (exh >= 80 && quality >= 120) score += addGene(positiveGenes, 6, "GAINER_EXH80_Q120_COMBO");
  if (failed) score += addGene(positiveGenes, 8, "GAINER_FAILED_BREAKOUT");
  if (sample?.topGainerThesisLaneLabel === "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT" || bool(sample?.classicExhaustion)) {
    score += addGene(positiveGenes, 7, "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT");
  }
  if (sample?.topGainerMicroExhaustionLabel === "GAINER_MICRO_MULTI_CONFIRM" || bool(sample?.gainerMicroMultiConfirm)) {
    score += addGene(positiveGenes, 8, "GAINER_MICRO_MULTI_CONFIRM");
  }
  if (sample?.candleColorAtEntry === "RED") score += addGene(positiveGenes, 10, "GAINER_FIRST_MEANINGFUL_RED");
  if ((sample?.topGainerVwapContextLabel === "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION" || bool(sample?.hasGainerVwapLoss)) && red) {
    score += addGene(positiveGenes, 7, "GAINER_VWAP_LOSS_RED_CONFIRMATION");
  }
  if (sample?.topGainerVwapContextLabel === "GAINER_ABOVE_VWAP_HOT_FADE" || sample?.vwapContextLabel === "ABOVE_VWAP_REJECTION_SETUP") {
    score += addGene(positiveGenes, 5, "GAINER_ABOVE_VWAP_REJECTION_SETUP");
  }
  if (["GAINER_PUMP_ROLLOVER_STARTING", "GAINER_PUMP_EXHAUSTION_CONFIRMED"].includes(sample?.topGainerPumpPhaseLabel)) {
    score += addGene(positiveGenes, 6, "GAINER_PUMP_ROLLOVER_EXHAUSTION");
  }

  if (pumpStillHot(sample)) score += addGene(penaltyGenes, -22, "GAINER_PUMP_STILL_HOT");
  if (highContinuationPressure(sample)) score += addGene(penaltyGenes, -22, "GAINER_CONTINUATION_PRESSURE_HIGH");
  if (sample?.hasGainerExhaustionConfirmation === false || sample?.topGainerMicroExhaustionLabel === "GAINER_MICRO_NO_EXHAUSTION_CONFIRMATION") {
    score += addGene(penaltyGenes, -18, "GAINER_NO_EXHAUSTION_CONFIRMATION");
  }
  if (sample?.topGainerVwapContextLabel === "GAINER_ABOVE_VWAP_CONTINUATION_DANGER") {
    score += addGene(penaltyGenes, -18, "GAINER_VWAP_CONTINUATION_DANGER");
  }
  if (isAboveVwap(sample) && finiteNumberOrNull(sample?.volAccel) > 0 && activeBuyerReturnWarning(sample)) {
    score += addGene(penaltyGenes, -20, "GAINER_ABOVE_VWAP_ACTIVE_BUYER_ACCEL");
  }
  if (quality != null && quality < 60) score += addGene(penaltyGenes, -10, "GAINER_QUALITY_LT_60");

  return score;
}

function computeLoserBestDna(sample, positiveGenes, penaltyGenes) {
  if (sample?.shortParentBucket !== "TOP_LOSER_SHORTS") return 0;

  let score = 0;
  const rank = finiteNumberOrNull(sample?.entryRankInBucket) ?? finiteNumberOrNull(sample?.entryRank);
  const spread = finiteNumberOrNull(sample?.spreadPct);
  const atr = finiteNumberOrNull(sample?.atrPct);
  const redImpulse = bool(sample?.immediateRedImpulse) || bool(sample?.redImpulseDetected);

  if (bool(sample?.shortGateWouldPass) || bool(sample?.shortGatePass)) score += addGene(positiveGenes, 12, "LOSER_SHORT_GATE_PASS");
  if (redImpulse) score += addGene(positiveGenes, 10, "LOSER_RED_IMPULSE");
  if (isBelowVwap(sample) && redConfirmation(sample)) score += addGene(positiveGenes, 8, "LOSER_BELOW_VWAP_RED");
  if (sample?.cvdLabel === "BEAR") score += addGene(positiveGenes, 4, "LOSER_CVD_BEAR");
  if (atr >= 0.6) score += addGene(positiveGenes, 6, "LOSER_ATR_GE_0_6");
  if (spread != null && spread <= 0.05) score += addGene(positiveGenes, 4, "LOSER_CLEAN_SPREAD");
  if (rank != null && rank <= 15) score += addGene(positiveGenes, 4, "LOSER_ENTRY_RANK_LE_15");
  if (macdBearish(sample)) score += addGene(positiveGenes, 5, "LOSER_MACD_NEGATIVE_EXPANSION");

  if (sample?.topLoserThesisLaneLabel === "TOP_LOSER_BLIND_WEAKNESS_SHORT" || bool(sample?.isBlindWeaknessShort)) {
    score += addGene(penaltyGenes, -22, "TOP_LOSER_BLIND_WEAKNESS_SHORT");
  }
  if (hasLabel(sample?.shortGateFailReasons, "NO_MICRO_MOMENTUM") || sample?.microMomentumLabel === "MICRO_NO_CONFIRMATION") {
    score += addGene(penaltyGenes, -18, "NO_MICRO_MOMENTUM");
  }
  if (sample?.vwapContextLabel === "BELOW_VWAP_WITH_GREEN_DANGER") {
    score += addGene(penaltyGenes, -20, "BELOW_VWAP_WITH_GREEN_DANGER");
  }
  if (
    sample?.topLoserThesisLaneLabel === "TOP_LOSER_BEARISH_CHASE_WARNING" ||
    hasLabel(sample?.entryQualityWarningLabels, "NEAR_LOW_CORPSE_CHASE")
  ) score += addGene(penaltyGenes, -15, "BEARISH_CORPSE_CHASE");
  if (sample?.topLoserThesisLaneLabel === "TOP_LOSER_BTC_BOUNCE_TRAP_WARNING" || bool(sample?.isBtcBounceTrapRisk)) {
    score += addGene(penaltyGenes, -10, "BTC_BOUNCE_TRAP_CONTEXT");
  }
  if (bool(sample?.sameSymbolFastReentryAfterLoss)) score += addGene(penaltyGenes, -15, "SAME_SYMBOL_FAST_REENTRY_AFTER_LOSS");

  return score;
}

export function classifyBestDnaTier(score) {
  const s = clamp(finiteNumberOrNull(score) ?? 0);
  if (s >= 95) return "BEST_DNA_ELITE";
  if (s >= 85) return "BEST_DNA_SNIPER";
  if (s >= 70) return "BEST_DNA_HIGH";
  if (s >= 55) return "BEST_DNA_CANDIDATE";
  if (s >= 40) return "BEST_DNA_WATCH";
  return "BEST_DNA_LOW";
}

export function classifyPostFee10Tier(score) {
  const s = clamp(finiteNumberOrNull(score) ?? 0);
  if (s >= 95) return "POST_FEE_10_ELITE";
  if (s >= 85) return "POST_FEE_10_SNIPER";
  if (s >= 75) return "POST_FEE_10_HIGH";
  if (s >= 65) return "POST_FEE_10_CANDIDATE";
  if (s >= 50) return "POST_FEE_10_WATCH";
  return "POST_FEE_10_LOW";
}

export function classifyRunnerCaptureTier(score) {
  const s = clamp(finiteNumberOrNull(score) ?? 0);
  if (s >= 90) return "RUNNER_POTENTIAL_ELITE";
  if (s >= 75) return "RUNNER_POTENTIAL_SNIPER";
  if (s >= 60) return "RUNNER_POTENTIAL_HIGH";
  if (s >= 40) return "RUNNER_POTENTIAL_WATCH";
  return "RUNNER_POTENTIAL_LOW";
}

export function computeBestDnaScore(sample) {
  const positiveGenes = [];
  const penaltyGenes = [];
  const rawScore =
    computeUniversalBestDna(sample, positiveGenes, penaltyGenes) +
    computeGainerBestDna(sample, positiveGenes, penaltyGenes) +
    computeLoserBestDna(sample, positiveGenes, penaltyGenes);

  return Object.freeze({
    rawScore,
    score: Math.round(clamp(rawScore)),
    positiveGenes: uniq(positiveGenes),
    penaltyGenes: uniq(penaltyGenes),
  });
}

export function classifyBestDnaLabels(sample, context = {}) {
  const score = finiteNumberOrNull(context.score ?? context.bestDnaScore) ?? 0;
  const labels = [];
  const primaryCandidates = [];
  const isGainer = sample?.shortParentBucket === "TOP_GAINER_SHORTS";
  const isLoser = sample?.shortParentBucket === "TOP_LOSER_SHORTS";
  const failed = failedBreakout(sample);
  const red = redConfirmation(sample);
  const noGreen = noGreenImpulse(sample);
  const notBull = cvdNotBull(sample);
  const atr = finiteNumberOrNull(sample?.atrPct);
  const spread = finiteNumberOrNull(sample?.spreadPct);
  const exh = finiteNumberOrNull(sample?.topGainerExhaustionScore ?? sample?.exhaustionScore);
  const quality = finiteNumberOrNull(sample?.topGainerExhaustionQualityScore ?? sample?.exhaustionQualityScore);
  const redImpulse = bool(sample?.immediateRedImpulse) || bool(sample?.redImpulseDetected);
  const shortGate = bool(sample?.shortGateWouldPass) || bool(sample?.shortGatePass);

  if (isGainer) {
    if (exh >= 80) labels.push("GAINER_BEST_DNA_EXH80");
    if (isGainer && exh >= 80 && quality >= 120 && red && noGreen && notBull) {
      labels.push("GAINER_BEST_DNA_EXH_Q120");
      primaryCandidates.push("GAINER_BEST_DNA_EXH_Q120");
    }
    if (sample?.candleColorAtEntry === "RED") labels.push("GAINER_BEST_DNA_FIRST_RED");
    if (failed) labels.push("GAINER_BEST_DNA_FAILED_BREAKOUT");
    if (isGainer && failed && red && noGreen && notBull && score >= BEST_DNA_SNIPER_MIN) {
      labels.push("GAINER_BEST_DNA_FAILED_BREAKOUT_SNIPER");
      primaryCandidates.push("GAINER_BEST_DNA_FAILED_BREAKOUT_SNIPER");
    }
    if (sample?.topGainerThesisLaneLabel === "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT") {
      labels.push("GAINER_BEST_DNA_CLASSIC_EXHAUSTION");
    }
    if (sample?.topGainerMicroExhaustionLabel === "GAINER_MICRO_MULTI_CONFIRM") {
      labels.push("GAINER_BEST_DNA_MICRO_MULTI_CONFIRM");
    }
    if (!primaryCandidates.length && score < BEST_DNA_HIGH_MIN) labels.push("GAINER_BEST_DNA_NOT_READY");
  }

  if (isLoser) {
    if (redImpulse && noGreen && notBull) {
      labels.push("LOSER_BEST_DNA_VELOCITY");
      primaryCandidates.push("LOSER_BEST_DNA_VELOCITY");
    }
    if (isLoser && shortGate && redImpulse && noGreen && notBull) {
      labels.push("LOSER_BEST_DNA_VELOCITY_SHORTGATE");
      primaryCandidates.push("LOSER_BEST_DNA_VELOCITY_SHORTGATE");
    }
    if (isLoser && shortGate && redImpulse && noGreen && notBull && atr >= 1.0 && spread != null && spread <= 0.05) {
      labels.push("LOSER_BEST_DNA_ATR1_SNIPER");
      primaryCandidates.unshift("LOSER_BEST_DNA_ATR1_SNIPER");
    }
    if (isBelowVwap(sample) && red) labels.push("LOSER_BEST_DNA_BELOW_VWAP_RED");
    if (!primaryCandidates.length && score < BEST_DNA_HIGH_MIN) labels.push("LOSER_BEST_DNA_NOT_READY");
  }

  const primaryLabel = primaryCandidates[0] ?? labels.find(l => !l.endsWith("_NOT_READY")) ?? labels[0] ?? null;
  return {
    bestDnaPrimaryLabel: primaryLabel,
    bestDnaLabels: uniq(labels),
  };
}

export function computePostFee10PotentialScoreV2(sample) {
  const positiveGenes = [];
  const penaltyGenes = [];
  const bestDna = finiteNumberOrNull(sample?.bestDnaScore) ?? computeBestDnaScore(sample).score;
  let rawScore = 0;
  const atr = finiteNumberOrNull(sample?.atrPct);
  const rank = finiteNumberOrNull(sample?.entryRankInBucket) ?? finiteNumberOrNull(sample?.entryRank);
  const spread = finiteNumberOrNull(sample?.spreadPct);
  const volAccel = finiteNumberOrNull(sample?.volAccel);
  const red = redConfirmation(sample);
  const noGreen = noGreenImpulse(sample);

  if (atr >= 1.0) rawScore += addGene(positiveGenes, 22, "POST_FEE_10_ATR_GE_1");
  else if (atr >= 0.6) rawScore += addGene(positiveGenes, 15, "POST_FEE_10_ATR_GE_0_6");
  if (failedBreakout(sample)) rawScore += addGene(positiveGenes, 16, "POST_FEE_10_FAILED_BREAKOUT");
  if (bool(sample?.immediateRedImpulse)) rawScore += addGene(positiveGenes, 14, "POST_FEE_10_IMMEDIATE_RED");
  if (bool(sample?.redImpulseDetected)) rawScore += addGene(positiveGenes, 12, "POST_FEE_10_RED_IMPULSE");
  if (bool(sample?.shortGateWouldPass) || bool(sample?.shortGatePass)) rawScore += addGene(positiveGenes, 10, "POST_FEE_10_SHORT_GATE_PASS");
  if (noGreen) rawScore += addGene(positiveGenes, 10, "POST_FEE_10_NO_GREEN");
  if (red) rawScore += addGene(positiveGenes, 6, "POST_FEE_10_RED_CONFIRMATION");
  if (sample?.cvdLabel === "BEAR") rawScore += addGene(positiveGenes, 6, "POST_FEE_10_CVD_BEAR");
  else if (sample?.cvdLabel === "NEUT") rawScore += addGene(positiveGenes, 3, "POST_FEE_10_CVD_NEUT");
  if (rank != null && rank <= 10) rawScore += addGene(positiveGenes, 5, "POST_FEE_10_ENTRY_RANK_LE_10");
  if (spread != null && spread <= 0.05) rawScore += addGene(positiveGenes, 4, "POST_FEE_10_CLEAN_SPREAD");
  if (bestDna >= BEST_DNA_SNIPER_MIN) rawScore += addGene(positiveGenes, 10, "POST_FEE_10_BEST_DNA_SNIPER");
  if (bestDna >= BEST_DNA_ELITE_MIN) rawScore += addGene(positiveGenes, 5, "POST_FEE_10_BEST_DNA_ELITE");

  if (bool(sample?.immediateGreenImpulse)) rawScore += addGene(penaltyGenes, -30, "POST_FEE_10_IMMEDIATE_GREEN");
  else if (bool(sample?.greenImpulseDetected)) rawScore += addGene(penaltyGenes, -22, "POST_FEE_10_GREEN_IMPULSE");
  if (sample?.cvdLabel === "BULL") rawScore += addGene(penaltyGenes, -16, "POST_FEE_10_CVD_BULL");
  if (!red) rawScore += addGene(penaltyGenes, -14, "POST_FEE_10_NO_RED_CONFIRMATION");
  if (isAboveVwap(sample) && volAccel > 0) rawScore += addGene(penaltyGenes, -20, "POST_FEE_10_ABOVE_VWAP_BUYER_ACCEL");
  if (pumpStillHot(sample)) rawScore += addGene(penaltyGenes, -20, "POST_FEE_10_PUMP_STILL_HOT");
  if (sample?.shortGateWouldPass === false || sample?.shortGatePass === false) rawScore += addGene(penaltyGenes, -10, "POST_FEE_10_SHORT_GATE_FAIL");
  if (spread != null && spread > 0.05) rawScore += addGene(penaltyGenes, -10, "POST_FEE_10_WIDE_SPREAD");

  const score = Math.round(clamp(rawScore));
  const tier = classifyPostFee10Tier(score);
  const labels = [
    tier,
    score >= 65 ? "POST_FEE_10_CANDIDATE" : null,
    score >= 85 ? "POST_FEE_10_SNIPER" : null,
    score >= 95 ? "POST_FEE_10_ELITE" : null,
  ];

  return Object.freeze({
    rawScore,
    score,
    tier,
    labels: uniq(labels),
    positiveGenes: uniq(positiveGenes),
    penaltyGenes: uniq(penaltyGenes),
  });
}

function pnlNormPctAtPrice(snapshot, price) {
  const entry = finiteNumberOrNull(snapshot?.entryPrice);
  const p = finiteNumberOrNull(price);
  if (!entry || p == null) return null;
  return ((entry - p) / entry) * 100;
}

function adverseNormPctAtPrice(snapshot, price) {
  const entry = finiteNumberOrNull(snapshot?.entryPrice);
  const p = finiteNumberOrNull(price);
  if (!entry || p == null) return null;
  return ((p - entry) / entry) * 100;
}

function firstTimeToMfeNorm(snapshot, targetPct) {
  const existing = finiteNumberOrNull(snapshot?.[`timeToMfe${String(targetPct).replace(".", "")}NormMs`]);
  if (existing != null) return existing;

  const history = Array.isArray(snapshot?.priceHistory) ? snapshot.priceHistory : [];
  const entryTime = finiteNumberOrNull(snapshot?.entryTime);
  if (entryTime == null) return null;
  for (const point of history) {
    const pnl = pnlNormPctAtPrice(snapshot, point?.p);
    const ts = finiteNumberOrNull(point?.t);
    if (pnl != null && pnl >= targetPct && ts != null) return Math.max(0, ts - entryTime);
  }
  return null;
}

function maeBeforeMfe1Norm(snapshot, timeToMfe1NormMs) {
  const existing = finiteNumberOrNull(snapshot?.maeBeforeMfe1NormPct);
  if (existing != null) return existing;

  const history = Array.isArray(snapshot?.priceHistory) ? snapshot.priceHistory : [];
  const entryTime = finiteNumberOrNull(snapshot?.entryTime);
  if (entryTime == null || timeToMfe1NormMs == null) return null;
  const cutoff = entryTime + timeToMfe1NormMs;
  let mae = 0;
  for (const point of history) {
    const ts = finiteNumberOrNull(point?.t);
    if (ts == null || ts > cutoff) continue;
    const adverse = adverseNormPctAtPrice(snapshot, point?.p);
    if (adverse != null) mae = Math.max(mae, adverse);
  }
  return round4(mae);
}

function currentNormPnl(snapshot) {
  const direct =
    finiteNumberOrNull(snapshot?.currentNormPnlPct) ??
    finiteNumberOrNull(snapshot?.normalizedPnlPct) ??
    finiteNumberOrNull(snapshot?.normPnlPct);
  if (direct != null) return direct;
  return pnlNormPctAtPrice(snapshot, snapshot?.currentPrice);
}

export function computeRunnerCapturePotential(snapshot) {
  const positiveGenes = [];
  const penaltyGenes = [];
  let rawScore = 0;
  const now = finiteNumberOrNull(snapshot?.evaluatedAtMs) ?? finiteNumberOrNull(snapshot?.ts) ?? Date.now();
  const entryTime = finiteNumberOrNull(snapshot?.entryTime);
  const elapsedMs = finiteNumberOrNull(snapshot?.timeSinceEntryMs) ?? (entryTime != null ? Math.max(0, now - entryTime) : null);
  const mfe =
    finiteNumberOrNull(snapshot?.normalizedMfePct) ??
    finiteNumberOrNull(snapshot?.mfeNormPct) ??
    finiteNumberOrNull(snapshot?.mfe) ??
    0;
  const current = currentNormPnl(snapshot);
  const t05 = firstTimeToMfeNorm(snapshot, 0.5);
  const t1 = firstTimeToMfeNorm(snapshot, 1);
  const t2 = firstTimeToMfeNorm(snapshot, 2);
  const t3 = firstTimeToMfeNorm(snapshot, 3);
  const maeBefore1 = maeBeforeMfe1Norm(snapshot, t1);
  const velocity = finiteNumberOrNull(snapshot?.mfeVelocityNormPctPerMin) ??
    (elapsedMs > 0 ? round4(mfe / (elapsedMs / 60_000)) : null);

  if (t05 != null && t05 <= 30_000) rawScore += addGene(positiveGenes, 8, "RUNNER_MFE_05_WITHIN_30S");
  if (t1 != null && t1 <= 60_000) rawScore += addGene(positiveGenes, 12, "RUNNER_MFE_1_WITHIN_60S");
  if (t2 != null && t2 <= 120_000) rawScore += addGene(positiveGenes, 16, "RUNNER_MFE_2_WITHIN_120S");
  if (mfe >= 3 || t3 != null) rawScore += addGene(positiveGenes, 12, "RUNNER_MFE_GE_3");
  if (maeBefore1 != null && maeBefore1 <= 0.30) rawScore += addGene(positiveGenes, 8, "RUNNER_LOW_MAE_BEFORE_MFE1");
  if (velocity != null && velocity >= 1.0) rawScore += addGene(positiveGenes, 10, "RUNNER_STRONG_MFE_VELOCITY");
  if (isBelowVwap(snapshot) || bool(snapshot?.failedReclaim) || bool(snapshot?.lowerHighFailedReclaim)) {
    rawScore += addGene(positiveGenes, 6, "RUNNER_BELOW_VWAP_FAILED_RECLAIM");
  }
  if (snapshot?.cvdLabel === "BEAR" || snapshot?.cvdLabel === "NEUT" || ["BEAR", "NEUT"].includes(snapshot?.cvdAfterEntry)) {
    rawScore += addGene(positiveGenes, 6, "RUNNER_CVD_NOT_BULLISH");
  }
  if (macdBearish(snapshot)) rawScore += addGene(positiveGenes, 6, "RUNNER_MACD_NEGATIVE_EXPANDING");
  if (rsiFalling(snapshot)) rawScore += addGene(positiveGenes, 4, "RUNNER_RSI_FALLING");
  if (snapshot?.greenImpulseDetectedAfterEntry !== true && snapshot?.immediateGreenImpulseAfterEntry !== true && snapshot?.greenImpulseDetected !== true) {
    rawScore += addGene(positiveGenes, 8, "RUNNER_NO_GREEN_AFTER_ENTRY");
  }
  if (bool(snapshot?.profitLockActive) || bool(snapshot?.lockArmed) || finiteNumberOrNull(snapshot?.activeLockFloorMarginPct) != null) {
    rawScore += addGene(positiveGenes, 4, "RUNNER_PROFIT_LOCK_ARMED");
  }

  const buyerReturn =
    bool(snapshot?.buyerReturnDetectedAfterEntry) ||
    bool(snapshot?.greenImpulseDetectedAfterEntry) ||
    bool(snapshot?.immediateGreenImpulseAfterEntry) ||
    bool(snapshot?.greenImpulseDetected) ||
    bool(snapshot?.immediateGreenImpulse);
  if (buyerReturn) rawScore += addGene(penaltyGenes, -20, "RUNNER_GREEN_IMPULSE_RETURNS");
  if (snapshot?.cvdLabel === "BULL" || snapshot?.cvdAfterEntry === "BULL") rawScore += addGene(penaltyGenes, -16, "RUNNER_CVD_FLIPS_BULL");
  if (vwapReclaim(snapshot) || snapshot?.vwapAfterEntry === "RECLAIM") rawScore += addGene(penaltyGenes, -16, "RUNNER_VWAP_RECLAIM");
  if (bool(snapshot?.largeLowerWickBounce) || finiteNumberOrNull(snapshot?.lowerWickBouncePct) >= 0.5) {
    rawScore += addGene(penaltyGenes, -12, "RUNNER_LARGE_LOWER_WICK_BOUNCE");
  }
  if (upper(snapshot?.macdHistogramState1m).includes("SHRINKING") && !macdBearish(snapshot)) {
    rawScore += addGene(penaltyGenes, -10, "RUNNER_MACD_SHRINKS_AGAINST_SHORT");
  }
  if (rsiRisingStrong(snapshot)) rawScore += addGene(penaltyGenes, -10, "RUNNER_RSI_RISES_STRONGLY");
  const lockFloor = finiteNumberOrNull(snapshot?.currentLockFloorNormPct) ??
    finiteNumberOrNull(snapshot?.activeLockFloorMarginPct) ??
    finiteNumberOrNull(snapshot?.profitLockLevelMarginPct);
  if (lockFloor != null && current != null && current < lockFloor) {
    rawScore += addGene(penaltyGenes, -15, "RUNNER_GIVEBACK_THROUGH_REQUIRED_FLOOR");
  }

  const score = Math.round(clamp(rawScore));
  const tier = classifyRunnerCaptureTier(score);
  const labels = [
    score >= 40 ? "RUNNER_CAPTURE_WATCH" : null,
    score >= 60 ? "RUNNER_CAPTURE_HIGH" : null,
    score >= 75 ? "RUNNER_CAPTURE_SNIPER" : null,
    score >= 90 ? "RUNNER_CAPTURE_ELITE" : null,
    t05 != null && t05 <= 30_000 ? "FAST_LOCK_CANDIDATE" : null,
    (bool(snapshot?.profitLockActive) || lockFloor != null) && score >= 60 ? "SAFE_FLOOR_CANDIDATE" : null,
    (mfe >= 2 || t2 != null) && score >= 60 ? "RUNNER_TRAIL_CANDIDATE" : null,
    buyerReturn || snapshot?.cvdLabel === "BULL" || vwapReclaim(snapshot) ? "RUNNER_BUYER_RETURN_DANGER" : null,
    (score >= 60 && (buyerReturn || snapshot?.cvdLabel === "BULL" || vwapReclaim(snapshot))) ? "DIRTY_RUNNER_RESEARCH_ONLY" : null,
  ];

  return Object.freeze({
    runnerCapturePotentialScoreRaw: rawScore,
    runnerCapturePotentialScore: score,
    runnerCapturePotentialTier: tier,
    runnerCaptureLabels: uniq(labels),
    runnerCapturePositiveGenes: uniq(positiveGenes),
    runnerCapturePenaltyGenes: uniq(penaltyGenes),
    runnerCaptureScoreVersion: RUNNER_CAPTURE_VERSION,
    mfeVelocityNormPctPerMin: velocity,
    timeToMfe05NormMs: t05,
    timeToMfe1NormMs: t1,
    timeToMfe2NormMs: t2,
    timeToMfe3NormMs: t3,
    maeBeforeMfe1NormPct: maeBefore1,
    buyerReturnDetectedAfterEntry: buyerReturn,
    dirtyRunnerResearchOnly: labels.includes("DIRTY_RUNNER_RESEARCH_ONLY"),
  });
}

export function evaluateBestDnaAudit(sample) {
  const best = computeBestDnaScore(sample);
  const labels = classifyBestDnaLabels(sample, { score: best.score });
  const postFee = computePostFee10PotentialScoreV2({ ...sample, bestDnaScore: best.score });
  const candidateRunner = computeCandidateRunnerScore({ ...sample, bestDnaScore: best.score });

  return {
    bestDnaScoreRaw: best.rawScore,
    bestDnaScore: best.score,
    bestDnaTier: classifyBestDnaTier(best.score),
    bestDnaPrimaryLabel: labels.bestDnaPrimaryLabel,
    bestDnaLabels: labels.bestDnaLabels,
    bestDnaPositiveGenes: best.positiveGenes,
    bestDnaPenaltyGenes: best.penaltyGenes,
    bestDnaVersion: BEST_DNA_VERSION,

    postFee10PotentialScoreRaw: postFee.rawScore,
    postFee10PotentialScoreV2: postFee.score,
    postFee10PotentialTier: postFee.tier,
    postFee10PotentialLabels: postFee.labels,
    postFee10PositiveGenes: postFee.positiveGenes,
    postFee10PenaltyGenes: postFee.penaltyGenes,
    postFee10ScoreVersion: POST_FEE_10_SCORE_VERSION_V2,

    isBestDnaHigh: best.score >= BEST_DNA_HIGH_MIN,
    isBestDnaSniper: best.score >= BEST_DNA_SNIPER_MIN,
    isBestDnaElite: best.score >= BEST_DNA_ELITE_MIN,
    isPostFee10Candidate: postFee.score >= 65,
    isPostFee10Sniper: postFee.score >= 85,
    isPostFee10Elite: postFee.score >= 95,

    candidateRunnerScoreRaw: candidateRunner.candidateRunnerScoreRaw,
    candidateRunnerScore: candidateRunner.candidateRunnerScore,
    candidateRunnerScoreAtScan: candidateRunner.candidateRunnerScore,
    candidateRunnerScoreAtEntry: candidateRunner.candidateRunnerScore,
    candidateRunnerTier: candidateRunner.candidateRunnerTier,
    candidateRunnerTierAtScan: candidateRunner.candidateRunnerTier,
    candidateRunnerTierAtEntry: candidateRunner.candidateRunnerTier,
    candidateRunnerLabels: candidateRunner.candidateRunnerLabels,
    candidateRunnerLabelsAtScan: candidateRunner.candidateRunnerLabels,
    candidateRunnerLabelsAtEntry: candidateRunner.candidateRunnerLabels,
    candidateRunnerPositiveGenes: candidateRunner.candidateRunnerPositiveGenes,
    candidateRunnerPenaltyGenes: candidateRunner.candidateRunnerPenaltyGenes,
    candidateRunnerEntrySafe: true,
    candidateRunnerScoreVersion: candidateRunner.candidateRunnerScoreVersion,
    candidateRunnerWouldAllow: candidateRunner.candidateRunnerWouldAllow,
    candidateRunnerWouldBlock: candidateRunner.candidateRunnerWouldBlock,
    candidateRunnerEntryMode: candidateRunner.candidateRunnerEntryMode,

    liveRunnerCaptureEntrySafe: false,

    ...BEST_DNA_OBSERVER_CONFIG,
  };
}

export function feeAdjustedNormPnlPct(trade) {
  const explicit = finiteNumberOrNull(trade?.feeAdjustedNormPnlPct);
  if (explicit != null) return explicit;

  const feeAdjustedFinalPnlPct = finiteNumberOrNull(trade?.feeAdjustedFinalPnlPct);
  const selectedLeverage =
    finiteNumberOrNull(trade?.selectedLeverage) ??
    finiteNumberOrNull(trade?.leverage);
  if (feeAdjustedFinalPnlPct != null && selectedLeverage != null && selectedLeverage !== 0) {
    return round4(feeAdjustedFinalPnlPct / selectedLeverage);
  }

  const normPnlPct = finiteNumberOrNull(trade?.normPnlPct) ?? finiteNumberOrNull(trade?.rawNormPnlPct);
  if (normPnlPct != null) return round4(normPnlPct - 0.10);
  return null;
}

export function feeAdjustedLeveragedPnlPct(trade) {
  return (
    finiteNumberOrNull(trade?.feeAdjustedFinalPnlPct) ??
    finiteNumberOrNull(trade?.feeAdjustedMarginPnlPct) ??
    null
  );
}

export function flattenBestDnaOutcomeFields(trade) {
  const norm = feeAdjustedNormPnlPct(trade);
  const leveraged = feeAdjustedLeveragedPnlPct(trade);
  const isPostFee10PlusWinner = leveraged != null && leveraged >= 10;
  const isNorm2PlusWinner = norm != null && norm >= 2;
  const isNorm3PlusWinner = norm != null && norm >= 3;
  const dirtyRunnerResearchOnly = bool(trade?.dirtyRunnerResearchOnly) ||
    (Array.isArray(trade?.runnerCaptureLabels) && trade.runnerCaptureLabels.includes("DIRTY_RUNNER_RESEARCH_ONLY"));

  let bestDnaOutcomeLabel = "BEST_DNA_OUTCOME_UNKNOWN";
  if (isPostFee10PlusWinner) bestDnaOutcomeLabel = "BEST_DNA_POST_FEE_10_PLUS_WINNER";
  else if (isNorm3PlusWinner) bestDnaOutcomeLabel = "BEST_DNA_NORM3_PLUS_WINNER";
  else if (isNorm2PlusWinner) bestDnaOutcomeLabel = "BEST_DNA_NORM2_PLUS_WINNER";
  else if (leveraged != null && leveraged > 0) bestDnaOutcomeLabel = "BEST_DNA_FEE_ADJUSTED_WIN";
  else if (leveraged != null) bestDnaOutcomeLabel = "BEST_DNA_FEE_ADJUSTED_NON_WINNER";

  return {
    feeAdjustedNormPnlPct: norm,
    feeAdjustedLeveragedPnlPct: leveraged,
    isPostFee10PlusWinner,
    isNorm2PlusWinner,
    isNorm3PlusWinner,
    dirtyRunnerResearchOnly,
    bestDnaOutcomeLabel,
  };
}

function runValue(trade) {
  return trade?.runId ?? trade?.run ?? null;
}

function tradeStableId(trade, index = 0) {
  return String(trade?.tradeId ?? trade?.id ?? `${trade?.symbol ?? "unknown"}:${trade?.entryTime ?? index}`);
}

function compareNormRankedTrades(a, b) {
  const ap = feeAdjustedNormPnlPct(a);
  const bp = feeAdjustedNormPnlPct(b);
  if (bp !== ap) return bp - ap;

  const ac = Number(a?.closedAt ?? Number.MAX_SAFE_INTEGER);
  const bc = Number(b?.closedAt ?? Number.MAX_SAFE_INTEGER);
  if (ac !== bc) return ac - bc;

  const ae = Number(a?.entryTime ?? Number.MAX_SAFE_INTEGER);
  const be = Number(b?.entryTime ?? Number.MAX_SAFE_INTEGER);
  if (ae !== be) return ae - be;

  return tradeStableId(a).localeCompare(tradeStableId(b));
}

export function assignRunBestNormRanks(trades) {
  const next = trades.map(t => ({
    ...t,
    isRunBest1Norm: false,
    isRunBest3Norm: false,
    runNormRank: null,
    runClosedTradeCount: null,
  }));
  const byId = new Map(next.map((trade, i) => [tradeStableId(trade, i), trade]));
  const grouped = new Map();
  const seen = new Set();

  next.forEach((trade, index) => {
    const group = runValue(trade);
    if (trade?.closed !== true || group == null || group === "") return;
    const pnl = feeAdjustedNormPnlPct(trade);
    if (!Number.isFinite(pnl)) return;
    const id = tradeStableId(trade, index);
    const key = `${group}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!grouped.has(String(group))) grouped.set(String(group), []);
    grouped.get(String(group)).push(trade);
  });

  for (const group of grouped.values()) {
    const ranked = [...group].sort(compareNormRankedTrades);
    ranked.forEach((trade, index) => {
      const target = byId.get(tradeStableId(trade));
      if (!target) return;
      const rank = index + 1;
      target.runNormRank = rank;
      target.isRunBest1Norm = rank === 1;
      target.isRunBest3Norm = rank <= 3;
      target.runClosedTradeCount = ranked.length;
    });
  }

  return next;
}

export const BEST_DNA_DEFAULT_FIELDS = Object.freeze({
  bestDnaScoreRaw: null,
  bestDnaScore: null,
  bestDnaTier: null,
  bestDnaPrimaryLabel: null,
  bestDnaLabels: [],
  bestDnaPositiveGenes: [],
  bestDnaPenaltyGenes: [],
  bestDnaVersion: null,

  postFee10PotentialScoreRaw: null,
  postFee10PotentialScoreV2: null,
  postFee10PotentialTier: null,
  postFee10PotentialLabels: [],
  postFee10PositiveGenes: [],
  postFee10PenaltyGenes: [],
  postFee10ScoreVersion: null,

  isBestDnaHigh: false,
  isBestDnaSniper: false,
  isBestDnaElite: false,
  isPostFee10Candidate: false,
  isPostFee10Sniper: false,
  isPostFee10Elite: false,

  runnerCapturePotentialScoreRaw: null,
  runnerCapturePotentialScore: null,
  runnerCapturePotentialTier: null,
  runnerCaptureLabels: [],
  runnerCapturePositiveGenes: [],
  runnerCapturePenaltyGenes: [],
  runnerCaptureScoreVersion: null,
  runnerScorePeak: null,
  runnerScorePeakAt: null,
  mfeVelocityNormPctPerMin: null,
  timeToMfe05NormMs: null,
  timeToMfe1NormMs: null,
  timeToMfe2NormMs: null,
  timeToMfe3NormMs: null,
  maeBeforeMfe1NormPct: null,
  buyerReturnDetectedAfterEntry: false,
  liveRunnerCaptureEntrySafe: false,

  candidateRunnerScoreRaw: null,
  candidateRunnerScore: null,
  candidateRunnerScoreAtScan: null,
  candidateRunnerScoreAtEntry: null,
  candidateRunnerTier: null,
  candidateRunnerTierAtScan: null,
  candidateRunnerTierAtEntry: null,
  candidateRunnerLabels: [],
  candidateRunnerLabelsAtScan: [],
  candidateRunnerLabelsAtEntry: [],
  candidateRunnerPositiveGenes: [],
  candidateRunnerPenaltyGenes: [],
  candidateRunnerEntrySafe: false,
  candidateRunnerScoreVersion: null,
  candidateRunnerWouldAllow: false,
  candidateRunnerWouldBlock: false,
  candidateRunnerEntryMode: null,

  feeAdjustedNormPnlPct: null,
  feeAdjustedLeveragedPnlPct: null,
  isPostFee10PlusWinner: false,
  isNorm2PlusWinner: false,
  isNorm3PlusWinner: false,
  isRunBest1Norm: false,
  isRunBest3Norm: false,
  runNormRank: null,
  runClosedTradeCount: null,
  dirtyRunnerResearchOnly: false,
  bestDnaOutcomeLabel: null,

  ...BEST_DNA_OBSERVER_CONFIG,
});

export const BEST_DNA_CSV_HEADERS = [
  "bestDnaScoreRaw",
  "bestDnaScore",
  "bestDnaTier",
  "bestDnaPrimaryLabel",
  "bestDnaLabels",
  "bestDnaPositiveGenes",
  "bestDnaPenaltyGenes",
  "bestDnaVersion",
  "postFee10PotentialScoreRaw",
  "postFee10PotentialScoreV2",
  "postFee10PotentialTier",
  "postFee10PotentialLabels",
  "postFee10PositiveGenes",
  "postFee10PenaltyGenes",
  "postFee10ScoreVersion",
  "isBestDnaHigh",
  "isBestDnaSniper",
  "isBestDnaElite",
  "isPostFee10Candidate",
  "isPostFee10Sniper",
  "isPostFee10Elite",
  "runnerCapturePotentialScoreRaw",
  "runnerCapturePotentialScore",
  "runnerCapturePotentialTier",
  "runnerCaptureLabels",
  "runnerCapturePositiveGenes",
  "runnerCapturePenaltyGenes",
  "runnerCaptureScoreVersion",
  "runnerScorePeak",
  "runnerScorePeakAt",
  "mfeVelocityNormPctPerMin",
  "timeToMfe05NormMs",
  "timeToMfe1NormMs",
  "timeToMfe2NormMs",
  "timeToMfe3NormMs",
  "maeBeforeMfe1NormPct",
  "buyerReturnDetectedAfterEntry",
  "liveRunnerCaptureEntrySafe",
  "candidateRunnerScoreRaw",
  "candidateRunnerScore",
  "candidateRunnerScoreAtScan",
  "candidateRunnerScoreAtEntry",
  "candidateRunnerTier",
  "candidateRunnerTierAtScan",
  "candidateRunnerTierAtEntry",
  "candidateRunnerLabels",
  "candidateRunnerLabelsAtScan",
  "candidateRunnerLabelsAtEntry",
  "candidateRunnerPositiveGenes",
  "candidateRunnerPenaltyGenes",
  "candidateRunnerEntrySafe",
  "candidateRunnerScoreVersion",
  "candidateRunnerWouldAllow",
  "candidateRunnerWouldBlock",
  "candidateRunnerEntryMode",
  "runnerScoreSource",
  "runnerScoreDisplayedOnUi",
  "feeAdjustedNormPnlPct",
  "feeAdjustedLeveragedPnlPct",
  "isPostFee10PlusWinner",
  "isNorm2PlusWinner",
  "isNorm3PlusWinner",
  "isRunBest1Norm",
  "isRunBest3Norm",
  "runNormRank",
  "runClosedTradeCount",
  "dirtyRunnerResearchOnly",
  "bestDnaOutcomeLabel",
  "useBestDnaEntryGate",
  "usePostFee10EntryGate",
  "useRunnerScoreForForcedExit",
  "useBestDnaForLeverage",
  "useBestDnaForPositionSizing",
];

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

export function bestDnaCSVRow(s = {}) {
  const row = [
    s.bestDnaScoreRaw,
    s.bestDnaScore,
    s.bestDnaTier,
    s.bestDnaPrimaryLabel,
    jsonArray(s.bestDnaLabels),
    jsonArray(s.bestDnaPositiveGenes),
    jsonArray(s.bestDnaPenaltyGenes),
    s.bestDnaVersion,
    s.postFee10PotentialScoreRaw,
    s.postFee10PotentialScoreV2,
    s.postFee10PotentialTier,
    jsonArray(s.postFee10PotentialLabels),
    jsonArray(s.postFee10PositiveGenes),
    jsonArray(s.postFee10PenaltyGenes),
    s.postFee10ScoreVersion,
    s.isBestDnaHigh,
    s.isBestDnaSniper,
    s.isBestDnaElite,
    s.isPostFee10Candidate,
    s.isPostFee10Sniper,
    s.isPostFee10Elite,
    s.runnerCapturePotentialScoreRaw,
    s.runnerCapturePotentialScore,
    s.runnerCapturePotentialTier,
    jsonArray(s.runnerCaptureLabels),
    jsonArray(s.runnerCapturePositiveGenes),
    jsonArray(s.runnerCapturePenaltyGenes),
    s.runnerCaptureScoreVersion,
    s.runnerScorePeak,
    s.runnerScorePeakAt,
    s.mfeVelocityNormPctPerMin,
    s.timeToMfe05NormMs,
    s.timeToMfe1NormMs,
    s.timeToMfe2NormMs,
    s.timeToMfe3NormMs,
    s.maeBeforeMfe1NormPct,
    s.buyerReturnDetectedAfterEntry,
    s.liveRunnerCaptureEntrySafe ?? false,
    s.candidateRunnerScoreRaw,
    s.candidateRunnerScore,
    s.candidateRunnerScoreAtScan,
    s.candidateRunnerScoreAtEntry,
    s.candidateRunnerTier,
    s.candidateRunnerTierAtScan,
    s.candidateRunnerTierAtEntry,
    jsonArray(s.candidateRunnerLabels),
    jsonArray(s.candidateRunnerLabelsAtScan),
    jsonArray(s.candidateRunnerLabelsAtEntry),
    jsonArray(s.candidateRunnerPositiveGenes),
    jsonArray(s.candidateRunnerPenaltyGenes),
    s.candidateRunnerEntrySafe ?? false,
    s.candidateRunnerScoreVersion,
    s.candidateRunnerWouldAllow ?? false,
    s.candidateRunnerWouldBlock ?? false,
    s.candidateRunnerEntryMode,
    s.entryTime != null ? "ENTRY_SNAPSHOT" : "CANDIDATE_SCAN",
    "candidateRunnerScoreAtScan",
    s.feeAdjustedNormPnlPct,
    s.feeAdjustedLeveragedPnlPct,
    s.isPostFee10PlusWinner,
    s.isNorm2PlusWinner,
    s.isNorm3PlusWinner,
    s.isRunBest1Norm,
    s.isRunBest3Norm,
    s.runNormRank,
    s.runClosedTradeCount,
    s.dirtyRunnerResearchOnly,
    s.bestDnaOutcomeLabel,
    s.useBestDnaEntryGate,
    s.usePostFee10EntryGate,
    s.useRunnerScoreForForcedExit,
    s.useBestDnaForLeverage,
    s.useBestDnaForPositionSizing,
  ];
  return row.map(csvCell);
}
