// ─── SHORT GATE AUDIT ────────────────────────────────────────────────────────
// Observer-mode thesis audit labels.
// These labels are computed AFTER entry and stored on the trade object.
// They do NOT block, skip, rank, resize, or alter live candidate selection.

import { evaluateTopGainerExhaustionAudit } from "../audits/topGainerExhaustionAudit.js";
import { evaluateBestDnaAudit } from "../audits/bestDnaAudit.js";

export function classifyMicroMomentum(s, ctx) {
  const red = s.immediateRedImpulse === true;
  const ticksDown = s.last3TicksDirection === "DOWN";
  const rsiRoll = ctx.hasRsiRollover === true;
  const green = s.greenImpulseDetected === true || s.immediateGreenImpulse === true;

  const confirms = [red, ticksDown, rsiRoll].filter(Boolean).length;

  if (confirms >= 2) return "MICRO_MULTI_CONFIRM";
  if (red) return "MICRO_RED_IMPULSE";
  if (ticksDown) return "MICRO_TICKS_DOWN";
  if (rsiRoll) return "MICRO_RSI_ROLLOVER";
  if (green) return "MICRO_GREEN_PRESSURE";
  return "MICRO_NO_CONFIRMATION";
}

export function classifyTopLoserThesisLane(s, ctx) {
  const highAtr = Number.isFinite(s.atrPct) && s.atrPct > 1.0;
  const btcBounceTrap =
    s.btcRegime === "BTC_STRONG_DOWN" ||
    s.btcRegime === "BTC_WEAK_DOWN";
  const rsiRollover = ctx.hasRsiRollover === true;
  const ticksDown = s.last3TicksDirection === "DOWN";
  const red = s.immediateRedImpulse === true;
  const green = s.greenImpulseDetected === true || s.immediateGreenImpulse === true;

  if (btcBounceTrap) return "TOP_LOSER_BTC_BOUNCE_TRAP_WARNING";
  if (red && highAtr) return "TOP_LOSER_RUNNER_CANDIDATE";
  if (ticksDown && rsiRollover) return "TOP_LOSER_SCALP_CANDIDATE";
  if (green && (red || ticksDown || rsiRollover)) return "TOP_LOSER_REJECTED_GREEN_FADE_CANDIDATE";
  if (!ctx.hasMicroMomentum) return "TOP_LOSER_BLIND_WEAKNESS_SHORT";
  return "TOP_LOSER_BEARISH_CHASE_WARNING";
}

export function classifyBtcShortContext(s) {
  switch (s.btcRegime) {
    case "BTC_CHOP":        return "BTC_CHOP_OK";
    case "BTC_MIXED":       return "BTC_MIXED_CONDITIONAL";
    case "BTC_WEAK_DOWN":   return "BTC_WEAK_DOWN_CAUTION";
    case "BTC_STRONG_DOWN": return "BTC_STRONG_DOWN_BOUNCE_TRAP";
    case "BTC_STRONG_UP":   return "BTC_STRONG_UP_SHORT_DANGER";
    default:                return "BTC_UNKNOWN";
  }
}

export function computeBtcShortContextScore(s) {
  switch (s.btcRegime) {
    case "BTC_CHOP":        return 30;
    case "BTC_MIXED":       return 10;
    case "BTC_WEAK_DOWN":   return -10;
    case "BTC_STRONG_DOWN": return -40;
    case "BTC_STRONG_UP":   return -40;
    default:                return 0;
  }
}

export function explainBtcShortContext(s) {
  switch (s.btcRegime) {
    case "BTC_CHOP":
      return "BTC chop historically gives top-loser shorts room to continue without broad market snapback.";
    case "BTC_MIXED":
      return "BTC mixed is usable only with micro-momentum confirmation.";
    case "BTC_WEAK_DOWN":
      return "BTC weak down can become a bounce-trap environment for already weak alts.";
    case "BTC_STRONG_DOWN":
      return "Sustained BTC dump often means top losers are overextended and bounce-prone.";
    case "BTC_STRONG_UP":
      return "BTC strong up is broad short danger.";
    default:
      return "BTC regime unknown.";
  }
}

export function classifyGreenPressure(s, ctx) {
  const green = s.greenImpulseDetected === true;
  const immediateGreen = s.immediateGreenImpulse === true;
  const redReject = ctx.hasRedConfirmation === true;
  const rsiRoll = ctx.hasRsiRollover === true;

  if (!green && !immediateGreen) return "NO_GREEN_PRESSURE";
  if ((green || immediateGreen) && redReject) return "GREEN_PRESSURE_REJECTED_BY_RED";
  if ((green || immediateGreen) && rsiRoll) return "GREEN_PRESSURE_WITH_RSI_ROLLOVER";
  if (immediateGreen) return "IMMEDIATE_GREEN_ACTIVE";
  if (green) return "GREEN_IMPULSE_ACTIVE";
  return "GREEN_PRESSURE_WITHOUT_REJECTION";
}

export function classifyVwapContext(s, ctx) {
  const below = s.priceVsVwapLabel === "BELOW_VWAP";
  const above = s.priceVsVwapLabel === "ABOVE_VWAP";
  const redConfirm = ctx.hasRedConfirmation || ctx.hasRsiRollover;
  const green = s.greenImpulseDetected === true || s.immediateGreenImpulse === true;

  if (below && green) return "BELOW_VWAP_WITH_GREEN_DANGER";
  if (below && redConfirm) return "BELOW_VWAP_WITH_RED_CONFIRMATION";
  if (below) return "BELOW_VWAP_NO_CONFIRMATION";
  if (above && green && !redConfirm) return "ABOVE_VWAP_GREEN_DANGER";
  if (above && redConfirm) return "ABOVE_VWAP_REJECTION_SETUP";
  return "VWAP_NEUTRAL";
}

export function buildEntryQualityWarnings(s, ctx) {
  const warnings = [...ctx.failReasons];

  if (s.spreadPct > 0.05) warnings.push("WIDE_SPREAD");
  if (s.spreadStableBeforeEntry === false) warnings.push("SPREAD_UNSTABLE");

  if (s.entryRank >= 1 && s.entryRank <= 5 && !ctx.hasMicroMomentum) {
    warnings.push("RANK_1_TO_5_TRAP_RISK");
  }

  if (
    s.entryBounceContext === "NEAR_LOW_POSSIBLE_BOUNCE" ||
    s.bounceContext === "NEAR_LOW_POSSIBLE_BOUNCE" ||
    s.entryBounceContext === "FRESH_BREAKDOWN" ||
    s.bounceContext === "FRESH_BREAKDOWN"
  ) {
    warnings.push("NEAR_LOW_CORPSE_CHASE");
  }

  if (s.rsi15m < 40 || s.rsi30m < 40 || s.rsi1h < 40) {
    warnings.push("HTF_RSI_OVERSOLD_BOUNCE_RISK");
  }

  if (
    s.priceVsVwapLabel === "ABOVE_VWAP" &&
    s.volAccel > 0 &&
    !ctx.hasRedConfirmation
  ) {
    warnings.push("ABOVE_VWAP_VOLACCEL_DANGER");
  }

  if (
    s.priceVsVwapLabel === "BELOW_VWAP" &&
    !ctx.hasRedConfirmation &&
    !ctx.hasRsiRollover
  ) {
    warnings.push("BELOW_VWAP_NO_CONFIRMATION");
  }

  return [...new Set(warnings)];
}

export function computeShortGateAuditScore(s, ctx) {
  let score = 0;

  if (s.entryTimingGrade === "F") score -= 100;
  if (s.immediateGreenImpulse === true) score -= 50;
  if (s.btcRegime === "BTC_STRONG_DOWN") score -= 40;
  if (s.btcRegime === "BTC_STRONG_UP") score -= 40;

  if (s.immediateRedImpulse === true) score += 40;
  if (s.last3TicksDirection === "DOWN") score += 40;
  if (ctx.hasRsiRollover) score += 30;

  if (s.btcRegime === "BTC_CHOP") score += 20;
  if (s.btcRegime === "BTC_MIXED") score += 5;

  if (s.entryRank >= 11 && s.entryRank <= 25) score += 10;
  if (s.entryRank >= 21 && s.entryRank <= 25) score += 5;

  if (Number.isFinite(s.atrPct) && s.atrPct > 1.0) score += 15;

  return score;
}

export function evaluateShortGateAudit(s) {
  const failReasons = [];

  const isGradeF      = s.entryTimingGrade === "F";
  const isImmediateGreen = s.immediateGreenImpulse === true;
  const isBtcStrongDown  = s.btcRegime === "BTC_STRONG_DOWN";
  const isBtcStrongUp    = s.btcRegime === "BTC_STRONG_UP";

  const hasRsiRollover =
    Number.isFinite(s.rsiSpread1m3m) &&
    Number.isFinite(s.rsi1mDelta) &&
    s.rsiSpread1m3m < 0 &&
    s.rsi1mDelta < 0;

  const hasRedConfirmation =
    s.immediateRedImpulse === true ||
    s.last3TicksDirection === "DOWN";

  const hasMicroMomentum = hasRedConfirmation || hasRsiRollover;

  if (isGradeF)         failReasons.push("ENTRY_GRADE_F");
  if (isImmediateGreen) failReasons.push("IMMEDIATE_GREEN_IMPULSE");
  if (isBtcStrongDown)  failReasons.push("BTC_STRONG_DOWN_BOUNCE_TRAP");
  if (isBtcStrongUp)    failReasons.push("BTC_STRONG_UP_SHORT_DANGER");
  if (!hasMicroMomentum) failReasons.push("NO_MICRO_MOMENTUM");

  const shortGateWouldPass = failReasons.length === 0;
  const ctx = { hasMicroMomentum, hasRsiRollover, hasRedConfirmation, failReasons };

  return {
    shortGateWouldPass,
    shortGateAuditLabel: shortGateWouldPass
      ? "WOULD_PASS_SHORT_GATE"
      : failReasons.length > 1
        ? "WOULD_FAIL_MULTIPLE_REASONS"
        : `WOULD_FAIL_${failReasons[0]}`,

    shortGateFailReasons: failReasons,
    hasMicroMomentum,
    hasRsiRollover,
    hasRedConfirmation,
    hasGreenDanger: s.greenImpulseDetected === true || s.immediateGreenImpulse === true,

    shortGateScore: computeShortGateAuditScore(s, ctx),

    microMomentumLabel:      classifyMicroMomentum(s, ctx),
    topLoserThesisLaneLabel: classifyTopLoserThesisLane(s, ctx),
    btcShortContextLabel:    classifyBtcShortContext(s),
    btcShortContextScore:    computeBtcShortContextScore(s),
    btcShortContextReason:   explainBtcShortContext(s),

    greenPressureLabel: classifyGreenPressure(s, ctx),
    vwapContextLabel:   classifyVwapContext(s, ctx),

    entryQualityWarningLabels: buildEntryQualityWarnings(s, ctx),

    legacyBtcShortTailwindScore: s.btcShortTailwindScore ?? null,
  };
}

export function buildShortAuditFields(merged) {
  const universal = evaluateShortGateAudit(merged);

  if (merged.shortParentBucket === "TOP_GAINER_SHORTS") {
    const gainer = evaluateTopGainerExhaustionAudit(merged);
    const combined = {
      ...merged,
      ...universal,
      ...gainer,
      shortThesisLaneLabel: gainer.topGainerThesisLaneLabel ?? null,
    };
    return {
      ...universal,
      ...gainer,
      shortThesisLaneLabel: combined.shortThesisLaneLabel,
      ...evaluateBestDnaAudit(combined),
    };
  }

  if (merged.shortParentBucket === "TOP_LOSER_SHORTS") {
    const loser = {
      ...universal,
      isBlindWeaknessShort: !universal.hasMicroMomentum,
      isBtcBounceTrapRisk:  universal.btcShortContextLabel === "BTC_STRONG_DOWN_BOUNCE_TRAP",
      isCorpseChaseRisk:    (universal.entryQualityWarningLabels ?? []).includes("NEAR_LOW_CORPSE_CHASE"),
      shortThesisLaneLabel: universal.topLoserThesisLaneLabel ?? null,
    };
    const combined = { ...merged, ...loser };
    return {
      ...loser,
      ...evaluateBestDnaAudit(combined),
    };
  }

  const combined = { ...merged, ...universal, shortThesisLaneLabel: null };
  return { ...universal, shortThesisLaneLabel: null, ...evaluateBestDnaAudit(combined) };
}
