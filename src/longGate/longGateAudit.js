// ─── LONG GATE AUDIT ─────────────────────────────────────────────────────────
// Observer-mode thesis audit labels.
// All fields are log-only. They do NOT block or alter candidate creation.
// Signal polarities are inverted vs shortGateAudit.js:
//   green impulse = POSITIVE   (was danger for shorts)
//   red impulse   = DANGER     (was signal for shorts)
//   CVD BULL      = POSITIVE   (was penalty for shorts)
//   BTC strong up = POSITIVE   (was danger for shorts)

import {
  deriveLongMicroUpConfirmation,
  deriveRsiLongMomentumExpansion,
  deriveMacdBullishExpansion,
  classifyLongGateResearchBandV2,
  normalizeLongCvdLabel,
} from "../research/longWinningSignals.js";
import {
  LONG_GATE_REGIME_VERSION,
  longGateRegimePenalty,
  applyLongGateTierCeiling,
} from "./longGateRegimeConfig.js";

// ─── MICRO MOMENTUM ──────────────────────────────────────────────────────────

export function classifyLongMicroMomentum(s, ctx) {
  const green     = s.immediateGreenImpulse === true;
  const ticksUp   = s.last3TicksDirection === "UP";
  const rsiRoll   = ctx.hasRsiRolloverUp === true;
  const red       = s.immediateRedImpulse === true;

  const confirms = [green, ticksUp, rsiRoll].filter(Boolean).length;

  if (confirms >= 2) return "MICRO_GREEN_MULTI_CONFIRM";
  if (green)         return "MICRO_GREEN_IMPULSE";
  if (ticksUp)       return "MICRO_TICKS_UP";
  if (rsiRoll)       return "MICRO_RSI_ROLLOVER_UP";
  if (red)           return "MICRO_RED_PRESSURE";
  return "MICRO_NO_LONG_CONFIRMATION";
}

// ─── THESIS LANE (TOP LOSER REVERSALS) ───────────────────────────────────────

export function classifyTopLoserLongThesisLane(s, ctx) {
  const highAtr      = Number.isFinite(s.atrPct) && s.atrPct > 1.0;
  const btcTailwind  = s.btcRegime === "BTC_STRONG_UP" || s.btcRegime === "BTC_WEAK_UP";
  const btcHeadwind  = s.btcRegime === "BTC_STRONG_DOWN";
  const rsiRollUp    = ctx.hasRsiRolloverUp === true;
  const ticksUp      = s.last3TicksDirection === "UP";
  const green        = s.greenImpulseDetected === true || s.immediateGreenImpulse === true;
  const red          = s.immediateRedImpulse === true;

  if (btcHeadwind && !green) return "TOP_LOSER_BTC_HEADWIND_REVERSAL_RISK";
  if (green && highAtr)      return "TOP_LOSER_RUNNER_REVERSAL_CANDIDATE";
  if (ticksUp && rsiRollUp)  return "TOP_LOSER_SCALP_REVERSAL_CANDIDATE";
  if (red && (ticksUp || rsiRollUp)) return "TOP_LOSER_RED_FADE_SETUP";
  if (!ctx.hasLongMicroMomentum) return "TOP_LOSER_NO_LONG_MOMENTUM_YET";
  if (btcTailwind && green)  return "TOP_LOSER_BTC_TAILWIND_GREEN_REVERSAL";
  return "TOP_LOSER_LONG_REVERSAL_WATCH";
}

// ─── BTC LONG CONTEXT ────────────────────────────────────────────────────────

export function classifyBtcLongContext(s) {
  switch (s.btcRegime) {
    case "BTC_STRONG_UP":   return "BTC_STRONG_UP_LONG_TAILWIND";
    case "BTC_WEAK_UP":     return "BTC_WEAK_UP_LONG_TAILWIND";
    case "BTC_CHOP":        return "BTC_CHOP_LONG_SELECTIVE";
    case "BTC_MIXED":       return "BTC_MIXED_LONG_CONDITIONAL";
    case "BTC_WEAK_DOWN":   return "BTC_WEAK_DOWN_LONG_HEADWIND";
    case "BTC_STRONG_DOWN": return "BTC_STRONG_DOWN_LONG_REVERSAL_ONLY";
    default:                return "BTC_UNKNOWN";
  }
}

export function computeBtcLongContextScore(s) {
  switch (s.btcRegime) {
    case "BTC_STRONG_UP":   return 30;
    case "BTC_WEAK_UP":     return 15;
    case "BTC_CHOP":        return 5;
    case "BTC_MIXED":       return -5;
    case "BTC_WEAK_DOWN":   return -15;
    case "BTC_STRONG_DOWN": return -25;
    default:                return 0;
  }
}

// ─── VWAP LONG CONTEXT ───────────────────────────────────────────────────────

export function classifyVwapLongContext(s, ctx) {
  const above     = s.priceVsVwapLabel === "ABOVE_VWAP";
  const below     = s.priceVsVwapLabel === "BELOW_VWAP";
  const green     = s.greenImpulseDetected === true || s.immediateGreenImpulse === true;
  const red       = s.immediateRedImpulse === true;
  const cvdBull   = s.cvdLabel === "BULL";

  if (above && green && cvdBull)  return "ABOVE_VWAP_GREEN_CVD_BULL_SUPPORT";
  if (above && green)             return "ABOVE_VWAP_GREEN_SUPPORT";
  if (above && !red)              return "ABOVE_VWAP_NO_RED_PRESSURE";
  if (below && green && cvdBull)  return "BELOW_VWAP_RECLAIM_ATTEMPT_WITH_BULL";
  if (below && green)             return "BELOW_VWAP_RECLAIM_ATTEMPT";
  if (below && red)               return "BELOW_VWAP_WITH_RED_DANGER";
  if (below)                      return "BELOW_VWAP_NO_RECLAIM_YET";
  return "VWAP_NEUTRAL";
}

// ─── GATE SCORE ──────────────────────────────────────────────────────────────
// Spec §13.3 weights (clamped 0–100)

export function computeLongGateScore(s, ctx) {
  let score = 50; // neutral baseline
  const cvdLabel = normalizeLongCvdLabel(s);
  const macdBullishExpansion = deriveMacdBullishExpansion(s) === true;
  const rsiLongMomentumExpansion = deriveRsiLongMomentumExpansion(s).rsiLongMomentumExpansion === true;

  if (s.immediateGreenImpulse === true)              score += 20;
  if (s.greenImpulseDetected === true)               score += 12;
  if (s.last3TicksDirection === "UP")                score += 10;
  if (cvdLabel === "BULL") score += 10;
  if (cvdLabel === "NEUT")                         score += 4;
  if (ctx.vwapLongContext?.includes("RECLAIM_CONFIRMED")) score += 12;
  if (ctx.vwapLongContext?.includes("RETEST_HOLD"))  score += 10;
  if (s.failedBreakdown1m === true || s.failedBreakdown3m === true) score += 8;
  if (s.higherLow1m === true || s.higherLow3m === true) score += 6;
  if (ctx.hasRsiRolloverUp)                          score += 6;
  if (rsiLongMomentumExpansion)                     score += 6;
  if (macdBullishExpansion)                         score += 6;
  // ATR is only credited outside a headwind: high volatility on a top-loser in
  // a headwind is a falling-knife, not a tailwind boost (2026-06-17 batch).
  const headwind = ctx.marketContextLabel === "LONG_CONTEXT_STRONG_HEADWIND"
                || ctx.marketContextLabel === "LONG_CONTEXT_HEADWIND";
  if (Number.isFinite(s.atrPct) && s.atrPct >= 0.6 && !headwind) score += 5;
  if (s.spreadPct != null && s.spreadPct <= 0.02)   score += 4;

  // Penalty
  if (s.immediateRedImpulse === true)                score -= 25;
  if (cvdLabel === "BEAR")                           score -= 18;
  if (ctx.vwapLongContext?.includes("RECLAIM_FAILURE")) score -= 18;
  if (s.last3TicksDirection === "DOWN" && !s.greenImpulseDetected) score -= 12;
  if (s.oiPressureLabel === "PRICE_DOWN_OI_UP")      score -= 12;
  if (s.spreadPct != null && s.spreadPct > 0.05)    score -= 10;
  if (s.fundingRate != null && s.fundingRate > 0.003 && !s.greenImpulseDetected) score -= 8;

  // Macro regime: the micro-structure score above ignores breadth/context.
  // A clean spike inside a HARD_DANGER / STRONG_HEADWIND regime is exactly the
  // setup that fades, so the emitted score is penalized to match reality.
  score += longGateRegimePenalty(ctx.marketBreadthLabel, ctx.marketContextLabel);

  return Math.max(0, Math.min(100, score));
}

// ─── UNIVERSAL LONG GATE EVALUATION ──────────────────────────────────────────

export function evaluateLongGateAudit(s) {
  const failReasons = [];
  const canonicalCvdLabel = normalizeLongCvdLabel(s);
  const normalized = { ...s, cvdLabel: canonicalCvdLabel, entryCvdLabel: canonicalCvdLabel };

  const isImmediateRed    = s.immediateRedImpulse === true;
  const isBtcStrongDown   = s.btcRegime === "BTC_STRONG_DOWN";
  const cvdBear           = canonicalCvdLabel === "BEAR";

  const hasRsiRolloverUp =
    Number.isFinite(s.rsiSpread1m3m) &&
    Number.isFinite(s.rsi1mDelta) &&
    s.rsiSpread1m3m > 0 &&
    s.rsi1mDelta > 0;

  const hasGreenConfirmation =
    s.immediateGreenImpulse === true ||
    s.greenImpulseDetected === true ||
    s.candleColorAtEntry === "GREEN";

  const hasLongMicroMomentum =
    hasGreenConfirmation ||
    s.last3TicksDirection === "UP" ||
    hasRsiRolloverUp;

  const vwapLongContext = classifyVwapLongContext(normalized, { hasRsiRolloverUp, hasGreenConfirmation });
  const btcLongContext  = classifyBtcLongContext(normalized);

  if (isImmediateRed)    failReasons.push("IMMEDIATE_RED_IMPULSE");
  if (isBtcStrongDown && !hasGreenConfirmation) failReasons.push("BTC_STRONG_DOWN_NO_GREEN");
  if (cvdBear && !hasGreenConfirmation) failReasons.push("CVD_BEAR_NO_GREEN");
  if (!hasLongMicroMomentum) failReasons.push("NO_LONG_MICRO_MOMENTUM");

  const longGateWouldPass = failReasons.length === 0;
  const marketBreadthLabel = s.longMarketBreadthLabel ?? null;
  const marketContextLabel = s.longMarketContextLabel ?? null;
  const ctx = { hasLongMicroMomentum, hasRsiRolloverUp, hasGreenConfirmation, vwapLongContext, failReasons, marketBreadthLabel, marketContextLabel };

  // Pre-compute score so it can inform tier derivation
  const gateScore = computeLongGateScore(normalized, ctx);
  const microMomentumLabel = classifyLongMicroMomentum(normalized, ctx);
  const microUp = deriveLongMicroUpConfirmation({ ...normalized, longMicroMomentumLabel: microMomentumLabel });
  const rsiMomentum = deriveRsiLongMomentumExpansion(normalized);
  const macdBullishExpansion = deriveMacdBullishExpansion(normalized);
  const longGateResearchBandV2 = classifyLongGateResearchBandV2(gateScore);

  // Canonical eligibility
  const longGateEligibility =
    longGateWouldPass === true  ? "ELIGIBLE" :
    longGateWouldPass === false ? "RESEARCH_REJECT" : "UNKNOWN";

  // Canonical tier
  const hasSufficientInputs =
    s.immediateRedImpulse != null ||
    s.immediateGreenImpulse != null ||
    s.greenImpulseDetected  != null ||
    s.cvdLabel != null;
  const rawGateTier =
    !hasSufficientInputs ? "INSUFFICIENT_DATA" :
    gateScore >= 85 ? "PREMIUM" :
    gateScore >= 75 ? "STRONG"  :
    gateScore >= 60 ? "WATCH"   : "RESEARCH_REJECT";
  const longGateTier = applyLongGateTierCeiling(rawGateTier, marketBreadthLabel);

  // Pass reasons — signals that supported passing (or attempted to)
  const longGateReasons = [];
  if (!isImmediateRed)                      longGateReasons.push("NO_IMMEDIATE_RED");
  if (hasGreenConfirmation)                 longGateReasons.push("GREEN_CONFIRMATION");
  if (hasLongMicroMomentum)                 longGateReasons.push("HAS_LONG_MICRO_MOMENTUM");
  if (!cvdBear || hasGreenConfirmation)     longGateReasons.push("CVD_ACCEPTABLE");
  if (!isBtcStrongDown || hasGreenConfirmation) longGateReasons.push("BTC_CONTEXT_ACCEPTABLE");

  // Missing required inputs
  const longGateMissingInputs = [];
  if (s.immediateRedImpulse == null && s.redImpulseDetected == null)
    longGateMissingInputs.push("immediateRedImpulse");
  if (canonicalCvdLabel == null)
    longGateMissingInputs.push("entryCvdLabel");
  if (s.btcRegime == null)
    longGateMissingInputs.push("btcRegime");
  if (s.immediateGreenImpulse == null && s.greenImpulseDetected == null && s.candleColorAtEntry == null)
    longGateMissingInputs.push("greenConfirmation");

  return {
    longGateWouldPass,
    longGateEligibility,
    longGateTier,
    longGateRegimePenaltyApplied: longGateRegimePenalty(marketBreadthLabel, marketContextLabel),
    longGateTierCeilingApplied: longGateTier !== rawGateTier ? longGateTier : null,
    longGateRegimeVersion: LONG_GATE_REGIME_VERSION,
    longGateResearchBandV2,
    longGateAuditLabel: longGateWouldPass
      ? "WOULD_PASS_LONG_GATE"
      : failReasons.length > 1
        ? "WOULD_FAIL_MULTIPLE_REASONS"
        : `WOULD_FAIL_${failReasons[0]}`,

    longGateFailReasons:   failReasons,
    longGateReasons,
    longGateMissingInputs,
    hasLongMicroMomentum,
    hasRsiRolloverUp,
    hasGreenConfirmation,
    hasRedDanger:          isImmediateRed || s.redImpulseDetected === true,

    longGateScore:         gateScore,

    longMicroMomentumLabel:    microMomentumLabel,
    longMicroUpConfirmation:   microUp.longMicroUpConfirmation,
    longMicroUpConfirmationReasons: microUp.longMicroUpConfirmationReasons,
    longMicroUpConfirmationSourceCount: microUp.longMicroUpConfirmationSourceCount,
    rsiLongMomentumExpansion: rsiMomentum.rsiLongMomentumExpansion,
    rsiLongMomentumExpansionSource: rsiMomentum.rsiLongMomentumExpansionSource,
    macdBullishExpansion,
    topLoserLongThesisLane:    classifyTopLoserLongThesisLane(normalized, ctx),
    btcLongContextLabel:       btcLongContext,
    btcLongContextScore:       computeBtcLongContextScore(normalized),
    vwapLongContextLabel:      vwapLongContext,

    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  };
}

// ─── BUILD FULL LONG AUDIT FIELDS ────────────────────────────────────────────

export function buildLongAuditFields(merged) {
  const universal = evaluateLongGateAudit(merged);

  const base = {
    ...universal,
    longThesisLaneLabel: universal.topLoserLongThesisLane ?? null,
  };

  // Bucket-specific extensions can be added here as classifiers are built
  if (merged.longParentBucket === "TOP_LOSER_LONGS") {
    return {
      ...base,
      isNoLongMomentumYet:  !universal.hasLongMicroMomentum,
      isBtcHeadwindRisk:    universal.btcLongContextLabel === "BTC_STRONG_DOWN_LONG_REVERSAL_ONLY",
    };
  }

  if (merged.longParentBucket === "TOP_GAINER_LONGS") {
    return {
      ...base,
      longThesisLaneLabel: "TOP_GAINER_CONTINUATION",
    };
  }

  return { ...base, longThesisLaneLabel: null };
}
