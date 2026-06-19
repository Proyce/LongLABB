// ─── LONG COMBO REGISTRY V2 ──────────────────────────────────────────────────
// Versioned ENTRY_FINAL signal combos for LONG research.
// LOG ONLY: no combo may affect candidate creation, sizing, leverage or exits.

import { LONG_PF10_TIER } from "../scoring/longPostFee10/longPostFee10.constants.js";
import { LONG_RUNNER_TIER } from "../scoring/longCandidateRunner/longCandidateRunner.constants.js";
import {
  deriveLongMicroUpConfirmation,
  deriveRsiLongMomentumExpansion,
  deriveMacdBullishExpansion,
  normalizeLongCvdLabel,
} from "../research/longWinningSignals.js";

export const LONG_COMBO_REGISTRY_VERSION = "LONG_COMBO_REGISTRY_V4_2026_06";

function makeCombo(comboId, label, check) {
  const combo = (sample) => {
    const { matched, reasons = [], missingConditions = [] } = check(sample ?? {});
    const didMatch = matched === true;
    return {
      matched: didMatch,
      status: didMatch ? "MATCHED" : missingConditions.length ? "NOT_MATCHED" : "INCOMPLETE",
      comboId,
      comboVersion: LONG_COMBO_REGISTRY_VERSION,
      definitionVersion: LONG_COMBO_REGISTRY_VERSION,
      comboTiming: "ENTRY_FINAL",
      snapshotPhase: "ENTRY",
      comboDirection: "LONG",
      label,
      reasons,
      matchedClauses: reasons,
      missingConditions,
      failedClauses: missingConditions,
      unavailableClauses: [],
      logOnly: true,
      canAffectExecution: false,
      executionApplied: false,
    };
  };
  combo.comboId = comboId;
  combo.label = label;
  return combo;
}

function cvdLabel(s) {
  return normalizeLongCvdLabel(s);
}

function hasGreen(s) {
  return s.immediateGreenImpulse === true || s.greenImpulseDetected === true;
}

function noImmediateRed(s) {
  return s.immediateRedImpulse !== true;
}

function isUniversalCore(s) {
  const cvd = cvdLabel(s);
  return hasGreen(s) && ["BULL", "NEUT"].includes(cvd) && noImmediateRed(s);
}

function isFallingKnifeAnti(s) {
  const redImpulse = s.immediateRedImpulse === true && s.redImpulseDetected === true;
  return redImpulse && cvdLabel(s) === "BEAR" &&
    (s.entryPriceVsVwapLabel ?? s.priceVsVwapLabel) === "BELOW_VWAP";
}

function isRedCvdBearAnti(s) {
  return s.immediateRedImpulse === true && cvdLabel(s) === "BEAR";
}

function hasAnyAnti(s) {
  return isFallingKnifeAnti(s) || isRedCvdBearAnti(s);
}

function conditionResult(conditions) {
  const reasons = conditions.filter(c => c.ok).map(c => c.reason);
  const missingConditions = conditions.filter(c => !c.ok).map(c => c.missing);
  return {
    matched: conditions.every(c => c.ok),
    reasons,
    missingConditions,
  };
}

// ─── POSITIVE COMBOS ──────────────────────────────────────────────────────────

export const LONG_UNIVERSAL_CORE_V1 = makeCombo(
  "LONG_UNIVERSAL_CORE_V1",
  "Universal Core (Formal V1)",
  (s) => {
    const cvd = cvdLabel(s);
    return conditionResult([
      { ok: hasGreen(s), reason: "GREEN_IMPULSE", missing: "NEEDS_GREEN_IMPULSE" },
      { ok: ["BULL", "NEUT"].includes(cvd), reason: `CVD_${cvd ?? "UNKNOWN"}`, missing: "NEEDS_CVD_BULL_OR_NEUT" },
      { ok: noImmediateRed(s), reason: "NO_IMMEDIATE_RED", missing: "HAS_IMMEDIATE_RED" },
    ]);
  },
);

export const FIRST_GREEN_DUMP_EXHAUSTION_LONG_V1 = makeCombo(
  "FIRST_GREEN_DUMP_EXHAUSTION_LONG_V1",
  "First Green After Dump Exhaustion",
  (s) => conditionResult([
    { ok: s.longParentBucket === "TOP_LOSER_LONGS", reason: "LOSER_BUCKET", missing: "NEEDS_LOSER_BUCKET" },
    { ok: s.immediateGreenImpulse === true, reason: "FIRST_GREEN", missing: "NEEDS_FIRST_GREEN" },
    { ok: cvdLabel(s) === "BULL", reason: "CVD_BULL", missing: "NEEDS_CVD_BULL" },
    { ok: s.immediateRedImpulse !== true && s.redImpulseDetected !== true, reason: "NO_RED_IMPULSE", missing: "HAS_RED_IMPULSE" },
  ]),
);

export const FAILED_BREAKDOWN_VWAP_RECLAIM_LONG_V1 = makeCombo(
  "FAILED_BREAKDOWN_VWAP_RECLAIM_LONG_V1",
  "Failed Breakdown + VWAP Reclaim",
  (s) => {
    const context = s.vwapLongContextLabel ?? s.longVwapContextLabel;
    const vwapReclaim = [
      "VWAP_RECLAIM_CONFIRMED",
      "VWAP_RECLAIM_ATTEMPT_WITH_BULL",
      "BELOW_VWAP_RECLAIM_ATTEMPT_WITH_BULL",
      "VWAP_RECLAIM_ATTEMPT",
      "BELOW_VWAP_RECLAIM_ATTEMPT",
    ].includes(context) || (s.entryPriceVsVwapLabel ?? s.priceVsVwapLabel) === "ABOVE_VWAP";
    const failedBreakdown = s.failedBreakdown1m === true || s.failedBreakdown3m === true;
    const cvd = cvdLabel(s);
    return conditionResult([
      { ok: failedBreakdown, reason: "FAILED_BREAKDOWN", missing: "NEEDS_FAILED_BREAKDOWN" },
      { ok: vwapReclaim, reason: "VWAP_RECLAIM", missing: "NEEDS_VWAP_RECLAIM" },
      { ok: hasGreen(s), reason: "GREEN_CONFIRM", missing: "NEEDS_GREEN_CONFIRM" },
      { ok: ["BULL", "NEUT"].includes(cvd), reason: `CVD_${cvd ?? "UNKNOWN"}`, missing: "NEEDS_CVD_BULL_OR_NEUT" },
    ]);
  },
);

export const NEGATIVE_FUNDING_SQUEEZE_LONG_V1 = makeCombo(
  "NEGATIVE_FUNDING_SQUEEZE_LONG_V1",
  "Negative Funding Squeeze Setup",
  (s) => {
    const negativeFunding = Number(s.fundingRate ?? s.funding ?? 0) < -0.005;
    const greenOrCvd = hasGreen(s) || cvdLabel(s) === "BULL";
    return conditionResult([
      { ok: negativeFunding, reason: "NEGATIVE_FUNDING", missing: "NEEDS_NEGATIVE_FUNDING" },
      { ok: greenOrCvd, reason: hasGreen(s) ? "GREEN_CONFIRM" : "CVD_BULL", missing: "NEEDS_GREEN_OR_CVD_BULL" },
    ]);
  },
);

export const TOP_GAINER_HIGHER_LOW_CONTINUATION_LONG_V1 = makeCombo(
  "TOP_GAINER_HIGHER_LOW_CONTINUATION_LONG_V1",
  "Gainer Higher Low Continuation",
  (s) => {
    const higherLow = s.higherLow1m === true || s.higherLow3m === true || s.hasGainerHigherLow === true;
    const cvd = cvdLabel(s);
    const noBlowoff = s.topGainerBlowoffRiskScore == null || Number(s.topGainerBlowoffRiskScore) < 40;
    return conditionResult([
      { ok: s.longParentBucket === "TOP_GAINER_LONGS", reason: "GAINER_BUCKET", missing: "NEEDS_GAINER_BUCKET" },
      { ok: higherLow, reason: "HIGHER_LOW", missing: "NEEDS_HIGHER_LOW" },
      { ok: ["BULL", "NEUT"].includes(cvd), reason: `CVD_${cvd ?? "UNKNOWN"}`, missing: "NEEDS_CVD_BULL_OR_NEUT" },
      { ok: noBlowoff, reason: "NO_BLOWOFF", missing: "HAS_BLOWOFF_EXTREME" },
    ]);
  },
);

export const BREAKOUT_RETEST_CONTINUATION_LONG_V1 = makeCombo(
  "BREAKOUT_RETEST_CONTINUATION_LONG_V1",
  "Breakout Retest Continuation",
  (s) => conditionResult([
    { ok: (s.entryPriceVsVwapLabel ?? s.priceVsVwapLabel) === "ABOVE_VWAP", reason: "ABOVE_VWAP", missing: "NEEDS_ABOVE_VWAP" },
    { ok: hasGreen(s), reason: "GREEN_CANDLE", missing: "NEEDS_GREEN_CANDLE" },
    { ok: s.last3TicksDirection === "UP", reason: "TICKS_UP", missing: "NEEDS_TICKS_UP" },
    { ok: cvdLabel(s) === "BULL", reason: "CVD_BULL", missing: "NEEDS_CVD_BULL" },
  ]),
);

export const LONG_UNIVERSAL_CORE_MICRO_UP_V1 = makeCombo(
  "LONG_UNIVERSAL_CORE_MICRO_UP_V1",
  "Universal Core + Narrow Micro-Up",
  (s) => {
    const micro = deriveLongMicroUpConfirmation(s);
    return conditionResult([
      { ok: isUniversalCore(s), reason: "LONG_UNIVERSAL_CORE_V1", missing: "NEEDS_UNIVERSAL_CORE" },
      { ok: micro.longMicroUpConfirmation, reason: "NARROW_MICRO_UP", missing: "NEEDS_NARROW_MICRO_UP" },
    ]);
  },
);

export const LONG_GATE_RSI_MACD_EXPANSION_V1 = makeCombo(
  "LONG_GATE_RSI_MACD_EXPANSION_V1",
  "Gate 90 + RSI + MACD Expansion",
  (s) => conditionResult([
    { ok: Number(s.longGateScore) >= 90, reason: "LONG_GATE_90_PLUS", missing: "NEEDS_LONG_GATE_90" },
    { ok: deriveRsiLongMomentumExpansion(s).rsiLongMomentumExpansion === true, reason: "RSI_LONG_MOMENTUM_EXPANSION", missing: "NEEDS_RSI_LONG_MOMENTUM_EXPANSION" },
    { ok: deriveMacdBullishExpansion(s) === true, reason: "MACD_BULLISH_EXPANSION", missing: "NEEDS_MACD_BULLISH_EXPANSION" },
  ]),
);

export const LONG_PREMIUM_PF10_RUNNER_V1 = makeCombo(
  "LONG_PREMIUM_PF10_RUNNER_V1",
  "Premium Gate + PF10 Elite + Runner Elite",
  (s) => conditionResult([
    { ok: s.longGateTier === "PREMIUM", reason: "GATE_PREMIUM", missing: "NEEDS_GATE_PREMIUM" },
    { ok: s.longPostFee10EntryTier === LONG_PF10_TIER.ELITE, reason: "PF10_ELITE", missing: "NEEDS_PF10_ELITE" },
    { ok: s.longCandidateRunnerTierAtEntry === LONG_RUNNER_TIER.ELITE, reason: "RUNNER_ELITE", missing: "NEEDS_RUNNER_ELITE" },
  ]),
);

export const LONG_GATE_STRONG_MICRO_UP_CLEAN_V1 = makeCombo(
  "LONG_GATE_STRONG_MICRO_UP_CLEAN_V1",
  "Gate >= Strong + Micro-Up + No Anti",
  (s) => {
    const micro = deriveLongMicroUpConfirmation(s);
    return conditionResult([
      { ok: ["PREMIUM", "STRONG"].includes(s.longGateTier), reason: "GATE_GE_STRONG", missing: "NEEDS_GATE_GE_STRONG" },
      { ok: micro.longMicroUpConfirmation, reason: "NARROW_MICRO_UP", missing: "NEEDS_NARROW_MICRO_UP" },
      { ok: !hasAnyAnti(s), reason: "ZERO_ANTI_COMBOS", missing: "HAS_LONG_ANTI_COMBO" },
    ]);
  },
);

export const LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1 = makeCombo(
  "LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1",
  "Bull-Confirmed VWAP Reclaim",
  (s) => {
    const context = s.vwapLongContextLabel ?? s.longVwapContextLabel;
    const reclaim = [
      "VWAP_RECLAIM_CONFIRMED",
      "VWAP_RECLAIM_ATTEMPT_WITH_BULL",
      "BELOW_VWAP_RECLAIM_ATTEMPT_WITH_BULL",
    ].includes(context);
    const micro = deriveLongMicroUpConfirmation(s);
    const cvd = cvdLabel(s);
    return conditionResult([
      { ok: reclaim, reason: "BULL_CONFIRMED_VWAP_RECLAIM", missing: "NEEDS_BULL_CONFIRMED_VWAP_RECLAIM" },
      { ok: micro.longMicroUpConfirmation, reason: "NARROW_MICRO_UP", missing: "NEEDS_NARROW_MICRO_UP" },
      { ok: ["BULL", "NEUT"].includes(cvd), reason: `CVD_${cvd ?? "UNKNOWN"}`, missing: "NEEDS_CVD_NOT_BEAR" },
      { ok: noImmediateRed(s), reason: "NO_IMMEDIATE_RED", missing: "HAS_IMMEDIATE_RED" },
    ]);
  },
);

export const LONG_GAINER_GREEN_REACCELERATION_V1 = makeCombo(
  "LONG_GAINER_GREEN_REACCELERATION_V1",
  "Top Gainer Green Reacceleration",
  (s) => {
    const bucket = s.topGainerLongSubBucket ?? s.longSubBucket;
    const micro = deriveLongMicroUpConfirmation(s);
    return conditionResult([
      { ok: s.longParentBucket === "TOP_GAINER_LONGS", reason: "GAINER_BUCKET", missing: "NEEDS_GAINER_BUCKET" },
      { ok: bucket === "TOP_GAINER_GREEN_REACCELERATION_LONG", reason: "GREEN_REACCELERATION_BUCKET", missing: "NEEDS_GREEN_REACCELERATION_BUCKET" },
      { ok: micro.longMicroUpConfirmation, reason: "NARROW_MICRO_UP", missing: "NEEDS_NARROW_MICRO_UP" },
      { ok: noImmediateRed(s), reason: "NO_IMMEDIATE_RED", missing: "HAS_IMMEDIATE_RED" },
    ]);
  },
);

export const LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1 = makeCombo(
  "LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1",
  "Top Loser Scalp Reversal Confirmed",
  (s) => conditionResult([
    { ok: s.longParentBucket === "TOP_LOSER_LONGS", reason: "LOSER_BUCKET", missing: "NEEDS_LOSER_BUCKET" },
    { ok: (s.topLoserLongThesisLane ?? s.topLoserThesisLaneLabel) === "TOP_LOSER_SCALP_REVERSAL_CANDIDATE", reason: "SCALP_REVERSAL_CANDIDATE", missing: "NEEDS_SCALP_REVERSAL_CANDIDATE" },
    { ok: deriveMacdBullishExpansion(s) === true, reason: "MACD_BULLISH_EXPANSION", missing: "NEEDS_MACD_BULLISH_EXPANSION" },
    { ok: cvdLabel(s) !== "BEAR", reason: "CVD_NOT_BEAR", missing: "HAS_CVD_BEAR" },
    { ok: noImmediateRed(s), reason: "NO_IMMEDIATE_RED", missing: "HAS_IMMEDIATE_RED" },
  ]),
);

// ─── ANTI-COMBOS ──────────────────────────────────────────────────────────────

export const LONG_FALLING_KNIFE_ANTI_V1 = makeCombo(
  "LONG_FALLING_KNIFE_ANTI_V1",
  "Falling Knife Anti-Long",
  (s) => ({
    matched: isFallingKnifeAnti(s),
    reasons: [
      s.immediateRedImpulse === true && s.redImpulseDetected === true ? "RED_IMPULSE_CONFIRMED" : null,
      cvdLabel(s) === "BEAR" ? "CVD_BEAR" : null,
      (s.entryPriceVsVwapLabel ?? s.priceVsVwapLabel) === "BELOW_VWAP" ? "BELOW_VWAP" : null,
      s.last3TicksDirection === "DOWN" ? "TICKS_DOWN" : null,
    ].filter(Boolean),
    missingConditions: [],
  }),
);

export const LONG_RED_CVD_BEAR_ANTI_V1 = makeCombo(
  "LONG_RED_CVD_BEAR_ANTI_V1",
  "Red Candle + CVD Bear Anti-Long",
  (s) => ({
    matched: isRedCvdBearAnti(s),
    reasons: [
      s.immediateRedImpulse === true ? "IMMEDIATE_RED_IMPULSE" : null,
      cvdLabel(s) === "BEAR" ? "CVD_BEAR" : null,
    ].filter(Boolean),
    missingConditions: [],
  }),
);

export const LONG_POSITIVE_COMBOS = [
  LONG_UNIVERSAL_CORE_V1,
  FIRST_GREEN_DUMP_EXHAUSTION_LONG_V1,
  FAILED_BREAKDOWN_VWAP_RECLAIM_LONG_V1,
  NEGATIVE_FUNDING_SQUEEZE_LONG_V1,
  TOP_GAINER_HIGHER_LOW_CONTINUATION_LONG_V1,
  BREAKOUT_RETEST_CONTINUATION_LONG_V1,
  LONG_UNIVERSAL_CORE_MICRO_UP_V1,
  LONG_GATE_RSI_MACD_EXPANSION_V1,
  LONG_PREMIUM_PF10_RUNNER_V1,
  LONG_GATE_STRONG_MICRO_UP_CLEAN_V1,
  LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1,
  LONG_GAINER_GREEN_REACCELERATION_V1,
  LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1,
];

export const LONG_ANTI_COMBOS = [
  LONG_FALLING_KNIFE_ANTI_V1,
  LONG_RED_CVD_BEAR_ANTI_V1,
];

// Genuine tick hypotheses are deliberately separate from proven positive and
// anti-combos. They are observatory labels, never execution evidence.
export const LONG_TICK_RESEARCH_HYPOTHESES = Object.freeze([
  {
    id: "LONG_HIGH_ATR_TICK_UP_EXPANSION_V1",
    risk: false,
    match: s => Number(s.atrPct) >= 0.6 &&
      s.marketTickPrimaryPattern === "TICK_UP_EXPANSION" &&
      Number(s.marketTickDirectionConfidenceScore) >= 70 &&
      ["COMPLETE", "PARTIAL"].includes(s.entryTickDataQuality),
  },
  {
    id: "LONG_HIGH_ATR_TICK_BULLISH_REVERSAL_V1",
    risk: false,
    match: s => Number(s.atrPct) >= 0.6 &&
      s.marketTickPrimaryPattern === "TICK_BULLISH_REVERSAL" &&
      !["SELL", "STRONG_SELL"].includes(s.marketTickAggressorFlowLabel3s) &&
      Number(s.marketTickDirectionConfidenceScore) >= 60,
  },
  {
    id: "LONG_HIGH_ATR_TICK_UP_FLOW_AGREEMENT_V1",
    risk: false,
    match: s => Number(s.atrPct) >= 0.6 &&
      ["UP", "STRONG_UP"].includes(s.marketTickDirectionVerdict) &&
      ["BUY", "STRONG_BUY"].includes(s.marketTickAggressorFlowLabel3s) &&
      s.marketTickTradeBookAgreement3s === "AGREE_UP",
  },
  {
    id: "LONG_HIGH_ATR_TICK_MULTI_TIMEFRAME_UP_V1",
    risk: false,
    match: s => Number(s.atrPct) >= 0.6 &&
      s.marketTickDirection3s === "UP" &&
      s.marketTickDirection10s === "UP",
  },
  {
    id: "LONG_HIGH_ATR_TICK_UP_PLUS_DNA80_V1",
    risk: false,
    match: s => Number(s.atrPct) >= 0.6 &&
      ["UP", "STRONG_UP"].includes(s.marketTickDirectionVerdict) &&
      Number(s.bestDnaLongScore) >= 80,
  },
  {
    id: "LONG_HIGH_ATR_TICK_UP_PLUS_GATE60_V1",
    risk: false,
    match: s => Number(s.atrPct) >= 0.6 &&
      ["UP", "STRONG_UP"].includes(s.marketTickDirectionVerdict) &&
      Number(s.longGateScore) >= 60,
  },
  {
    id: "LONG_HIGH_ATR_TICK_DOWN_ACCELERATION_RISK_V1",
    risk: true,
    match: s => Number(s.atrPct) >= 0.6 &&
      ["DOWN", "STRONG_DOWN"].includes(s.marketTickDirectionVerdict) &&
      Number(s.marketTickAccelerationBpsPerSec2_3s) < 0 &&
      Number(s.marketTickDirectionConfidenceScore) >= 65,
  },
  {
    id: "LONG_HIGH_ATR_TICK_CHAOS_RISK_V1",
    risk: true,
    match: s => Number(s.atrPct) >= 0.6 &&
      s.marketTickPrimaryPattern === "TICK_HIGH_VOL_CHAOS",
  },
  {
    id: "LONG_HIGH_ATR_TICK_UP_DECELERATION_RISK_V1",
    risk: true,
    match: s => Number(s.atrPct) >= 0.6 &&
      s.marketTickPrimaryPattern === "TICK_UP_DECELERATION",
  },
]);

export function evaluateLongTickResearchHypotheses(sample = {}) {
  const matched = LONG_TICK_RESEARCH_HYPOTHESES.filter(hypothesis => {
    try { return hypothesis.match(sample) === true; } catch { return false; }
  });
  const positive = matched.filter(hypothesis => !hypothesis.risk).map(hypothesis => hypothesis.id);
  const risk = matched.filter(hypothesis => hypothesis.risk).map(hypothesis => hypothesis.id);
  return {
    longTickResearchHypothesesMatched: positive,
    longTickResearchHypothesesCount: positive.length,
    longTickRiskPatternsMatched: risk,
    longTickRiskPatternsCount: risk.length,
    longTickResearchPromotionStatus: matched.length ? "EARLY_RESEARCH" : "COLLECTING",
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  };
}

export function evaluateLongCombos(sample) {
  const positive = LONG_POSITIVE_COMBOS.map(fn => fn(sample));
  const anti = LONG_ANTI_COMBOS.map(fn => fn(sample));
  const matchedPositive = positive.filter(c => c.matched);
  const matchedAnti = anti.filter(c => c.matched);
  return {
    longComboRegistryVersion: LONG_COMBO_REGISTRY_VERSION,
    longCombosPositiveMatched: matchedPositive.map(c => c.comboId),
    longCombosAntiMatched: matchedAnti.map(c => c.comboId),
    longCombosPositiveCount: matchedPositive.length,
    longCombosAntiCount: matchedAnti.length,
    longComboDetails: [...positive, ...anti],
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  };
}
