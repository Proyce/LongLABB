// ─── SNIPER LONG GATE (LOG ONLY) ─────────────────────────────────────────────
// Research-only. Returns would-pass / fail fields.
// Inverted polarity vs sniperShortGateLogOnly.js:
//   CVD BULL or NEUT = ok  (was BEAR or NEUT for shorts)
//   hasGreenConfirm  = required  (was hasRedConfirm for shorts)
//   green is NOT a disqualifier here

import { SNIPER_LONG_TIERS } from "../app/longLab.constants.js";

export function evaluateSniperLongGateLogOnly(candidate) {
  const reasons     = [];
  const failReasons = [];

  const longAes =
    Number(candidate.longAbsoluteEntryScore) ||
    Number(candidate.absoluteEntryAdaptiveScore) ||
    0;

  const longBestDna    = Number(candidate.bestDnaLongScore ?? candidate.bestDnaScore ?? 0);
  const longGateScore  = Number(candidate.longGateScore ?? 0);

  const qualityGate =
    longAes >= 90 ||
    longBestDna >= 90 ||
    candidate.isBestDnaLongElite === true ||
    longGateScore >= 60;

  const microConfirm =
    candidate.longMicroMomentumLabel === "MICRO_GREEN_MULTI_CONFIRM" ||
    candidate.longMicroMomentumLabel === "MICRO_GREEN_IMPULSE" ||
    candidate.longMicroMomentumLabel === "MICRO_TICKS_UP" ||
    candidate.hasLongMicroMomentum === true ||
    candidate.hasRsiRolloverUp === true;

  const energy =
    Number(candidate.atrPct ?? 0) >= 1.0 ||
    candidate.longPostFee10EntryLabels?.includes("ATR_SUPER_ACTIVE") ||
    Number(candidate.entryRank ?? 999) <= 5;

  const hasGreenConfirm =
    candidate.hasGreenConfirmation === true ||
    candidate.immediateGreenImpulse === true ||
    candidate.greenImpulseDetected === true ||
    candidate.candleColorAtEntry === "GREEN";

  const hasNoRedImpulse =
    candidate.immediateRedImpulse !== true &&
    candidate.hasRedDanger !== true;

  const greenNoRed = hasGreenConfirm && hasNoRedImpulse;

  const cvdOk =
    candidate.cvdLabel === "BULL" ||
    candidate.cvdLabel === "BULLISH" ||
    candidate.cvdLabel === "NEUT" ||
    candidate.cvdLabel === "NEUTRAL";

  const noLongAuditDanger =
    candidate.longAuditWouldBlock !== true &&
    candidate.longAuditDangerTier !== "HARD_DANGER";

  const marketOk =
    candidate.marketBreathWouldBlock !== true &&
    candidate.longMarketBreadthLabel !== "LONG_BREADTH_HARD_DANGER" &&
    candidate.longBreathLabel !== "LONG_BREATH_HARD_DANGER";

  // MICRO_TICKS_UP is strongest when paired with green + no red
  const microTicksUp = candidate.longMicroMomentumLabel === "MICRO_TICKS_UP";
  if (microTicksUp) {
    if (hasGreenConfirm && hasNoRedImpulse && !candidate.longAuditWouldBlock) {
      reasons.push("MICRO_TICKS_UP_CONFIRMED_LOG_ONLY");
    } else {
      failReasons.push("MICRO_TICKS_UP_UNCONFIRMED_LOG_ONLY");
    }
  }

  if (qualityGate)            reasons.push("QUALITY_GATE_OK");
  else                        failReasons.push("NO_QUALITY_GATE");

  if (microConfirm)           reasons.push("MICRO_CONFIRM_OK");
  else                        failReasons.push("NO_MICRO_CONFIRM");

  if (energy)                 reasons.push("ENERGY_OK_ATR_OR_RANK");
  else                        failReasons.push("NO_ENERGY_ATR_OR_RANK");

  if (greenNoRed)             reasons.push("GREEN_NO_RED_OK");
  else                        failReasons.push("NO_GREEN_CONFIRMATION_OR_HAS_RED");

  if (cvdOk)                  reasons.push("CVD_OK");
  else                        failReasons.push("CVD_BEAR_DISQUALIFIER");

  if (noLongAuditDanger)  reasons.push("NO_LONG_AUDIT_DANGER");
  else                        failReasons.push("LONG_AUDIT_DANGER");

  if (marketOk)               reasons.push("MARKET_BREATH_OK");
  else                        failReasons.push("MARKET_BREATH_LONG_DANGER");

  const pass =
    qualityGate &&
    microConfirm &&
    energy &&
    greenNoRed &&
    cvdOk &&
    noLongAuditDanger &&
    marketOk;

  const tier =
    pass && longAes >= 95 && longBestDna >= 95 ? SNIPER_LONG_TIERS.ELITE_RESEARCH
    : pass && longAes >= 90                    ? SNIPER_LONG_TIERS.HIGH
    : pass && longGateScore >= 70              ? SNIPER_LONG_TIERS.CANDIDATE
    : pass                                     ? SNIPER_LONG_TIERS.WATCH
    : SNIPER_LONG_TIERS.NONE;

  return {
    sniperLongVersion:     "sniper-long-v1-log-only-2026-06",
    sniperLongWouldPass:   pass,
    sniperLongTier:        tier,
    sniperLongScore:       longGateScore,
    sniperLongReasons:     reasons,
    sniperLongFailReasons: failReasons,
  };
}
