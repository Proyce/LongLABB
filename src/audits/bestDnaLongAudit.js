// ─── BEST DNA LONG AUDIT ─────────────────────────────────────────────────────
// Mirror of bestDnaAudit.js with all signal polarities inverted for LONG trades.
// CVD BULL = good; green impulse = good; last3 UP = good; BTC up = good.
// LOG ONLY — must never affect execution.

import { normalizeLongMicroMomentumLabel, CANONICAL_LONG_MICRO } from '../scoring/longMicroMomentumNormalizer.js';

export const BEST_DNA_LONG_VERSION = "BEST_DNA_LONG_V1";

export const BEST_DNA_LONG_HIGH_MIN   = 70;
export const BEST_DNA_LONG_SNIPER_MIN = 85;
export const BEST_DNA_LONG_ELITE_MIN  = 95;

export const BEST_DNA_LONG_OBSERVER_CONFIG = Object.freeze({
  useBestDnaLongEntryGate: false,
  useLongPostFee10EntryGate: false,
  useBestDnaLongForLeverage: false,
  useBestDnaLongForPositionSizing: false,
});

const round4 = n => Number.isFinite(Number(n)) ? parseFloat(Number(n).toFixed(4)) : null;
const clamp  = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const uniq   = arr => [...new Set((arr ?? []).filter(Boolean))];

function finiteNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) { return v === true; }
function upper(v) { return typeof v === "string" ? v.toUpperCase() : ""; }

function hasLabel(list, label) {
  if (Array.isArray(list)) return list.includes(label);
  if (typeof list === "string") return list.includes(label);
  return false;
}

function macdBullish(sample) {
  const state = upper(sample?.macdHistogramState1m);
  const macd  = finiteNumberOrNull(sample?.macdHistogram1m);
  const delta = finiteNumberOrNull(sample?.macdHistogramDelta1m);
  return (
    state.includes("POSITIVE_EXPANDING") ||
    state.includes("BULLISH_EXPANDING") ||
    (macd != null && delta != null && macd > 0 && delta > 0)
  );
}

function macdRolloverUp(sample) {
  const state = upper(sample?.macdHistogramState1m);
  const delta = finiteNumberOrNull(sample?.macdHistogramDelta1m);
  return macdBullish(sample) || state.includes("BULLISH") || state.includes("RISING") || (delta != null && delta > 0);
}

function rsiRolloverUp(sample) {
  const d1  = finiteNumberOrNull(sample?.rsi1mDelta);
  const d3  = finiteNumberOrNull(sample?.rsi3mDelta);
  const spread = finiteNumberOrNull(sample?.rsiSpread1m3m);
  return (
    bool(sample?.hasRsiRolloverUp) ||
    bool(sample?.hasRsiRollover) ||
    d1 > 0 ||
    (d1 > 0 && spread > 0) ||
    (d1 > 0 && d3 > 0)
  );
}

function rsiRisingStrong(sample) {
  const d1 = finiteNumberOrNull(sample?.rsi1mDelta);
  return (
    upper(sample?.rsiDirectionAfterEntry) === "RISING" ||
    upper(sample?.rsiSlope1m) === "RISING" ||
    d1 >= 2
  );
}

function failedBreakdown(sample) {
  return (
    bool(sample?.failedBreakdown1m) ||
    bool(sample?.failedBreakdown3m) ||
    bool(sample?.failedBreakdown) ||
    bool(sample?.hasLoserFailedBreakdown)
  );
}

function greenConfirmation(sample) {
  return (
    bool(sample?.immediateGreenImpulse) ||
    bool(sample?.greenImpulseDetected) ||
    sample?.candleColorAtEntry === "GREEN" ||
    sample?.last3TicksDirection === "UP" ||
    bool(sample?.hasGreenConfirmation)
  );
}

function noRedImpulse(sample) {
  return sample?.redImpulseDetected !== true && sample?.immediateRedImpulse !== true;
}

function cvdNotBear(sample) {
  return sample?.entryCvdLabel !== "BEAR";
}

function isAboveVwap(sample) {
  const label = sample?.entryPriceVsVwapLabel ?? sample?.longVwapContextLabel ?? sample?.topGainerVwapContextLabel;
  return (
    label === "ABOVE_VWAP" ||
    label === "AT_VWAP" ||
    label === "ABOVE_VWAP_GREEN_SUPPORT" ||
    label === "GAINER_ABOVE_VWAP_SUPPORT_LONG" ||
    finiteNumberOrNull(sample?.entryPriceVsVwapPct) > 0.05
  );
}

function isBelowVwap(sample) {
  const label = sample?.entryPriceVsVwapLabel ?? sample?.longVwapContextLabel;
  return (
    label === "BELOW_VWAP" ||
    finiteNumberOrNull(sample?.entryPriceVsVwapPct) < -0.05
  );
}

function vwapReclaimConfirmed(sample) {
  return (
    sample?.longVwapContextLabel === "VWAP_RECLAIM" ||
    sample?.vwapStateAtEntry === "RECLAIM_CONFIRMED" ||
    hasLabel(sample?.entryQualityWarningLabels, "VWAP_RECLAIM_CONFIRMED")
  );
}

function activeSellerReturnWarning(sample) {
  return (
    bool(sample?.sellerReturnDetectedAfterEntry) ||
    sample?.redPressureLabel === "IMMEDIATE_RED_ACTIVE" ||
    sample?.redPressureLabel === "RED_IMPULSE_ACTIVE"
  );
}

function blowoffExtreme(sample) {
  return (
    bool(sample?.blowoffExtreme) ||
    sample?.topGainerPumpPhaseLabel === "GAINER_BLOWOFF_EXTREME"
  );
}

function highBlowoffPressure(sample) {
  return (
    bool(sample?.hasGainerBlowoffDanger) ||
    ["HIGH", "EXTREME"].includes(sample?.topGainerBlowoffRiskLabel)
  );
}

function addGene(bucket, points, code, text = code) {
  bucket.push(`${code}(${points > 0 ? "+" : ""}${points}): ${text}`);
  return points;
}

// ── Universal DNA — signal polarities inverted from short bestDna ────────────

function computeUniversalBestDnaLong(sample, positiveGenes, penaltyGenes) {
  let score = 0;
  const atr    = finiteNumberOrNull(sample?.atrPct);
  const rank   = finiteNumberOrNull(sample?.entryRankInBucket) ?? finiteNumberOrNull(sample?.entryRank);
  const green  = greenConfirmation(sample);
  const noRed  = noRedImpulse(sample);
  const failed = failedBreakdown(sample);
  const microLabelRaw = sample?.longMicroMomentumLabel ?? sample?.microMomentumLabel ?? null;
  const { canonical: microCanonical } = normalizeLongMicroMomentumLabel(microLabelRaw);
  const spread = finiteNumberOrNull(sample?.spreadPct);
  const volAccel = finiteNumberOrNull(sample?.volAccel);

  if (atr >= 1.0) score += addGene(positiveGenes, 24, "ATR_GE_1");
  else if (atr >= 0.6) score += addGene(positiveGenes, 15, "ATR_0_6_TO_1");
  else if (atr >= 0.2) score += addGene(positiveGenes, 5, "ATR_0_2_TO_0_6");

  if (failed) score += addGene(positiveGenes, 18, "FAILED_BREAKDOWN");
  if (bool(sample?.immediateGreenImpulse)) score += addGene(positiveGenes, 12, "IMMEDIATE_GREEN_IMPULSE");
  if (bool(sample?.greenImpulseDetected)) score += addGene(positiveGenes, 10, "GREEN_IMPULSE_DETECTED");
  if (sample?.last3TicksDirection === "UP") score += addGene(positiveGenes, 8, "LAST_3_TICKS_UP");
  if (green) score += addGene(positiveGenes, 6, "GREEN_CONFIRMATION");
  if (noRed)  score += addGene(positiveGenes, 10, "NO_RED_IMPULSE");

  if (sample?.entryCvdLabel === "BULL") score += addGene(positiveGenes, 8, "CVD_BULL");
  else if (sample?.entryCvdLabel === "NEUT") score += addGene(positiveGenes, 5, "CVD_NEUT");

  if (bool(sample?.longGateWouldPass)) score += addGene(positiveGenes, 10, "LONG_GATE_PASS");
  if (spread != null && spread <= 0.05) score += addGene(positiveGenes, 4, "CLEAN_SPREAD");
  if (rank != null && rank <= 10) score += addGene(positiveGenes, 6, "ENTRY_RANK_LE_10");
  else if (rank != null && rank <= 15) score += addGene(positiveGenes, 3, "ENTRY_RANK_11_TO_15");

  if (microCanonical === CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM) {
    score += addGene(positiveGenes, 8, "MICRO_MULTI_CONFIRM");
  }
  if (macdRolloverUp(sample)) score += addGene(positiveGenes, 7, "MACD_BULLISH_ROLLOVER");
  if (rsiRolloverUp(sample))  score += addGene(positiveGenes, 6, "RSI_ROLLOVER_UP");
  if (isAboveVwap(sample) && green) score += addGene(positiveGenes, 6, "ABOVE_VWAP_GREEN_CONFIRMATION");

  // Penalties (inverted from short version)
  if (bool(sample?.immediateRedImpulse)) score += addGene(penaltyGenes, -28, "IMMEDIATE_RED_IMPULSE");
  else if (bool(sample?.redImpulseDetected)) score += addGene(penaltyGenes, -20, "RED_IMPULSE_DETECTED");

  if (sample?.entryCvdLabel === "BEAR") score += addGene(penaltyGenes, -18, "CVD_BEAR");
  if (!green) score += addGene(penaltyGenes, -12, "NO_GREEN_CONFIRMATION");
  if (sample?.longGateWouldPass === false) score += addGene(penaltyGenes, -10, "LONG_GATE_FAIL");
  if (microCanonical === CANONICAL_LONG_MICRO.NO_CONFIRMATION && sample?.longGateWouldPass !== false) {
    score += addGene(penaltyGenes, -12, "MICRO_NO_CONFIRMATION");
  }
  if (isBelowVwap(sample) && volAccel > 0 && !green) score += addGene(penaltyGenes, -20, "BELOW_VWAP_SELLER_ACCEL_NO_GREEN");
  if (spread != null && spread > 0.05) score += addGene(penaltyGenes, -10, "WIDE_SPREAD");
  if (bool(sample?.thinBook) || hasLabel(sample?.warningFlags, "THIN_BOOK")) score += addGene(penaltyGenes, -15, "THIN_BOOK");
  if (sample?.entryTimingGrade === "F") score += addGene(penaltyGenes, -18, "ENTRY_TIMING_GRADE_F");
  if (activeSellerReturnWarning(sample)) score += addGene(penaltyGenes, -20, "ACTIVE_SELLER_RETURN_WARNING");

  return score;
}

// ── Gainer long specific (TOP_GAINER_LONGS) ──────────────────────────────────

function computeGainerBestDnaLong(sample, positiveGenes, penaltyGenes) {
  if (sample?.longParentBucket !== "TOP_GAINER_LONGS") return 0;

  let score = 0;
  const cq = finiteNumberOrNull(sample?.topGainerContinuationQualityScore ?? sample?.topGainerExhaustionQualityScore);
  const cs = finiteNumberOrNull(sample?.topGainerContinuationScore ?? sample?.topGainerExhaustionScore);
  const green = greenConfirmation(sample);
  const higherLow = bool(sample?.hasGainerHigherLow) || bool(sample?.higherLow1m) || bool(sample?.higherLow3m);

  if (cs >= 80) score += addGene(positiveGenes, 14, "GAINER_CONTINUATION_80");
  if (cq >= 120) score += addGene(positiveGenes, 18, "GAINER_QUALITY_120");
  if (cs >= 80 && cq >= 120) score += addGene(positiveGenes, 6, "GAINER_CONT80_Q120_COMBO");
  if (higherLow) score += addGene(positiveGenes, 8, "GAINER_HIGHER_LOW");
  if (sample?.topGainerThesisLaneLabel === "TOP_GAINER_HIGHER_LOW_LONG" || bool(sample?.higherLowConfirmed)) {
    score += addGene(positiveGenes, 7, "TOP_GAINER_HIGHER_LOW_LONG");
  }
  if (sample?.topGainerMicroLabel === "GAINER_MICRO_MULTI_CONFIRM_LONG") {
    score += addGene(positiveGenes, 8, "GAINER_MICRO_MULTI_CONFIRM_LONG");
  }
  if (sample?.candleColorAtEntry === "GREEN") score += addGene(positiveGenes, 10, "GAINER_FIRST_GREEN_CANDLE");
  if ((isAboveVwap(sample) || vwapReclaimConfirmed(sample)) && green) {
    score += addGene(positiveGenes, 7, "GAINER_VWAP_SUPPORT_GREEN");
  }
  if (sample?.topGainerVwapContextLabel === "GAINER_ABOVE_VWAP_SUPPORT_LONG") {
    score += addGene(positiveGenes, 5, "GAINER_ABOVE_VWAP_SUPPORT_LONG");
  }
  if (["GAINER_GREEN_REACCELERATION_LONG", "GAINER_BREAKOUT_RETEST_CONFIRMED"].includes(sample?.topGainerPumpPhaseLabel)) {
    score += addGene(positiveGenes, 6, "GAINER_CONTINUATION_PHASE");
  }

  // Penalties
  if (blowoffExtreme(sample)) score += addGene(penaltyGenes, -22, "GAINER_BLOWOFF_EXTREME");
  if (highBlowoffPressure(sample)) score += addGene(penaltyGenes, -22, "GAINER_BLOWOFF_PRESSURE_HIGH");
  if (sample?.hasGainerContinuationConfirmation === false) {
    score += addGene(penaltyGenes, -18, "GAINER_NO_CONTINUATION_CONFIRMATION");
  }
  if (sample?.topGainerVwapContextLabel === "GAINER_VWAP_LOSS_AFTER_PUMP") {
    score += addGene(penaltyGenes, -18, "GAINER_VWAP_LOSS_AFTER_PUMP");
  }
  if (isBelowVwap(sample) && finiteNumberOrNull(sample?.volAccel) > 0 && activeSellerReturnWarning(sample)) {
    score += addGene(penaltyGenes, -20, "GAINER_BELOW_VWAP_ACTIVE_SELLER_ACCEL");
  }
  if (cq != null && cq < 60) score += addGene(penaltyGenes, -10, "GAINER_QUALITY_LT_60");

  return score;
}

// ── Loser long specific (TOP_LOSER_LONGS) ────────────────────────────────────

function computeLoserBestDnaLong(sample, positiveGenes, penaltyGenes) {
  if (sample?.longParentBucket !== "TOP_LOSER_LONGS") return 0;

  let score = 0;
  const rank  = finiteNumberOrNull(sample?.entryRankInBucket) ?? finiteNumberOrNull(sample?.entryRank);
  const spread = finiteNumberOrNull(sample?.spreadPct);
  const atr   = finiteNumberOrNull(sample?.atrPct);
  const greenImpulse = bool(sample?.immediateGreenImpulse) || bool(sample?.greenImpulseDetected);

  if (bool(sample?.longGateWouldPass)) score += addGene(positiveGenes, 12, "LOSER_LONG_GATE_PASS");
  if (greenImpulse) score += addGene(positiveGenes, 10, "LOSER_GREEN_IMPULSE");
  if (isAboveVwap(sample) && greenConfirmation(sample)) score += addGene(positiveGenes, 8, "LOSER_ABOVE_VWAP_GREEN");
  if (sample?.entryCvdLabel === "BULL") score += addGene(positiveGenes, 4, "LOSER_CVD_BULL");
  if (atr >= 0.6) score += addGene(positiveGenes, 6, "LOSER_ATR_GE_0_6");
  if (spread != null && spread <= 0.05) score += addGene(positiveGenes, 4, "LOSER_CLEAN_SPREAD");
  if (rank != null && rank <= 15) score += addGene(positiveGenes, 4, "LOSER_ENTRY_RANK_LE_15");
  if (macdBullish(sample)) score += addGene(positiveGenes, 5, "LOSER_MACD_BULLISH_EXPANSION");
  if (bool(sample?.failedBreakdown1m) || bool(sample?.failedBreakdown3m)) {
    score += addGene(positiveGenes, 8, "LOSER_FAILED_BREAKDOWN_REVERSAL");
  }

  // Penalties
  if (sample?.longSubBucket === "TOP_LOSER_FALLING_KNIFE_DANGER" || bool(sample?.isFallingKnife)) {
    score += addGene(penaltyGenes, -22, "TOP_LOSER_FALLING_KNIFE_DANGER");
  }
  const loserMicroRaw = sample?.longMicroMomentumLabel ?? sample?.microMomentumLabel ?? null;
  const { canonical: loserMicroCanonical } = normalizeLongMicroMomentumLabel(loserMicroRaw);
  if (hasLabel(sample?.longGateFailReasons, "NO_MICRO_MOMENTUM") || loserMicroCanonical === CANONICAL_LONG_MICRO.NO_CONFIRMATION) {
    score += addGene(penaltyGenes, -18, "NO_MICRO_MOMENTUM");
  }
  if (sample?.entryPriceVsVwapLabel === "BELOW_VWAP" && !greenConfirmation(sample)) {
    score += addGene(penaltyGenes, -20, "BELOW_VWAP_NO_GREEN_REVERSAL");
  }
  if (
    sample?.topLoserLongSubBucket === "TOP_LOSER_CVD_BEAR_DANGER" ||
    (sample?.entryCvdLabel === "BEAR" && !greenConfirmation(sample))
  ) score += addGene(penaltyGenes, -15, "CVD_BEAR_NO_GREEN_CHASE");
  if (sample?.longSubBucket === "TOP_LOSER_RED_REACCELERATION_DANGER") {
    score += addGene(penaltyGenes, -10, "RED_REACCELERATION_CONTEXT");
  }
  if (bool(sample?.sameSymbolFastReentryAfterLoss)) score += addGene(penaltyGenes, -15, "SAME_SYMBOL_FAST_REENTRY_AFTER_LOSS");

  return score;
}

// ── Tier classifiers ──────────────────────────────────────────────────────────

export function classifyBestDnaLongTier(score) {
  const s = clamp(finiteNumberOrNull(score) ?? 0);
  if (s >= 95) return "BEST_DNA_LONG_ELITE";
  if (s >= 85) return "BEST_DNA_LONG_SNIPER";
  if (s >= 70) return "BEST_DNA_LONG_HIGH";
  if (s >= 55) return "BEST_DNA_LONG_CANDIDATE";
  if (s >= 40) return "BEST_DNA_LONG_WATCH";
  return "BEST_DNA_LONG_LOW";
}

export function computeBestDnaLongScore(sample) {
  const positiveGenes = [];
  const penaltyGenes  = [];
  const rawScore =
    computeUniversalBestDnaLong(sample, positiveGenes, penaltyGenes) +
    computeGainerBestDnaLong(sample, positiveGenes, penaltyGenes) +
    computeLoserBestDnaLong(sample, positiveGenes, penaltyGenes);

  return Object.freeze({
    rawScore,
    score: Math.round(clamp(rawScore)),
    positiveGenes: uniq(positiveGenes),
    penaltyGenes:  uniq(penaltyGenes),
  });
}

export function classifyBestDnaLongLabels(sample, context = {}) {
  const score = finiteNumberOrNull(context.score ?? context.bestDnaLongScore) ?? 0;
  const labels = [];
  const primaryCandidates = [];
  const isGainer = sample?.longParentBucket === "TOP_GAINER_LONGS";
  const isLoser  = sample?.longParentBucket === "TOP_LOSER_LONGS";
  const failed   = failedBreakdown(sample);
  const green    = greenConfirmation(sample);
  const noRed    = noRedImpulse(sample);
  const notBear  = cvdNotBear(sample);
  const atr      = finiteNumberOrNull(sample?.atrPct);
  const spread   = finiteNumberOrNull(sample?.spreadPct);
  const greenImpulse = bool(sample?.immediateGreenImpulse) || bool(sample?.greenImpulseDetected);
  const longGate = bool(sample?.longGateWouldPass);
  const higherLow = bool(sample?.hasGainerHigherLow) || bool(sample?.higherLow1m);

  if (isGainer) {
    const cq = finiteNumberOrNull(sample?.topGainerContinuationQualityScore ?? sample?.topGainerExhaustionQualityScore);
    const cs = finiteNumberOrNull(sample?.topGainerContinuationScore ?? sample?.topGainerExhaustionScore);
    if (cs >= 80) labels.push("GAINER_BEST_DNA_LONG_CONT80");
    if (isGainer && cs >= 80 && cq >= 120 && green && noRed && notBear) {
      labels.push("GAINER_BEST_DNA_LONG_CONT_Q120");
      primaryCandidates.push("GAINER_BEST_DNA_LONG_CONT_Q120");
    }
    if (sample?.candleColorAtEntry === "GREEN") labels.push("GAINER_BEST_DNA_LONG_FIRST_GREEN");
    if (higherLow) labels.push("GAINER_BEST_DNA_LONG_HIGHER_LOW");
    if (isGainer && higherLow && green && noRed && notBear && score >= BEST_DNA_LONG_SNIPER_MIN) {
      labels.push("GAINER_BEST_DNA_LONG_HIGHER_LOW_SNIPER");
      primaryCandidates.push("GAINER_BEST_DNA_LONG_HIGHER_LOW_SNIPER");
    }
    if (sample?.topGainerThesisLaneLabel === "TOP_GAINER_HIGHER_LOW_LONG") {
      labels.push("GAINER_BEST_DNA_LONG_CLASSIC_CONTINUATION");
    }
    if (!primaryCandidates.length && score < BEST_DNA_LONG_HIGH_MIN) labels.push("GAINER_BEST_DNA_LONG_NOT_READY");
  }

  if (isLoser) {
    if (greenImpulse && noRed && notBear) {
      labels.push("LOSER_BEST_DNA_LONG_VELOCITY");
      primaryCandidates.push("LOSER_BEST_DNA_LONG_VELOCITY");
    }
    if (isLoser && longGate && greenImpulse && noRed && notBear) {
      labels.push("LOSER_BEST_DNA_LONG_VELOCITY_LONGGATE");
      primaryCandidates.push("LOSER_BEST_DNA_LONG_VELOCITY_LONGGATE");
    }
    if (isLoser && longGate && greenImpulse && noRed && notBear && atr >= 1.0 && spread != null && spread <= 0.05) {
      labels.push("LOSER_BEST_DNA_LONG_ATR1_SNIPER");
      primaryCandidates.unshift("LOSER_BEST_DNA_LONG_ATR1_SNIPER");
    }
    if (isAboveVwap(sample) && green) labels.push("LOSER_BEST_DNA_LONG_ABOVE_VWAP_GREEN");
    if (!primaryCandidates.length && score < BEST_DNA_LONG_HIGH_MIN) labels.push("LOSER_BEST_DNA_LONG_NOT_READY");
  }

  const primaryLabel = primaryCandidates[0] ?? labels.find(l => !l.endsWith("_NOT_READY")) ?? labels[0] ?? null;
  return {
    bestDnaLongPrimaryLabel: primaryLabel,
    bestDnaLongLabels: uniq(labels),
  };
}

// ── Main audit entry point ────────────────────────────────────────────────────

export function evaluateBestDnaLongAudit(sample) {
  const best   = computeBestDnaLongScore(sample);
  const labels = classifyBestDnaLongLabels(sample, { score: best.score });

  // Traceability: expose raw, canonical, and alias used for cross-version comparison.
  const microLabelRaw = sample?.longMicroMomentumLabel ?? sample?.microMomentumLabel ?? null;
  const { canonical: microLabelCanonical, aliasUsed: microAliasUsed } = normalizeLongMicroMomentumLabel(microLabelRaw);

  return {
    bestDnaLongScoreRaw: best.rawScore,
    bestDnaLongScore:    best.score,
    bestDnaLongTier:     classifyBestDnaLongTier(best.score),
    bestDnaLongPrimaryLabel: labels.bestDnaLongPrimaryLabel,
    bestDnaLongLabels:   labels.bestDnaLongLabels,
    bestDnaLongPositiveGenes: best.positiveGenes,
    bestDnaLongPenaltyGenes:  best.penaltyGenes,
    bestDnaLongVersion:  BEST_DNA_LONG_VERSION,

    isBestDnaLongHigh:   best.score >= BEST_DNA_LONG_HIGH_MIN,
    isBestDnaLongSniper: best.score >= BEST_DNA_LONG_SNIPER_MIN,
    isBestDnaLongElite:  best.score >= BEST_DNA_LONG_ELITE_MIN,

    // Cross-version micro-label traceability (spec §4.2)
    bestDnaLongMicroLabelRaw:       microLabelRaw,
    bestDnaLongMicroLabelCanonical: microLabelCanonical,
    bestDnaLongMicroAliasUsed:      microAliasUsed,

    ...BEST_DNA_LONG_OBSERVER_CONFIG,
  };
}
