export function evaluateSniperShortGateLogOnly(candidate) {
  const reasons     = [];
  const failReasons = [];

  const aes =
    Number(candidate.absoluteEntryAdaptiveScore) ||
    Number(candidate.absoluteEntryScore) ||
    0;

  const bestDna      = Number(candidate.bestDnaScore ?? 0);
  const shortGateScore = Number(candidate.shortGateScore ?? 0);

  const qualityGate =
    candidate.entryPolicyWouldAllow === true ||
    aes >= 90 ||
    bestDna >= 90 ||
    candidate.isBestDnaElite === true ||
    shortGateScore >= 60;

  const microConfirm =
    candidate.microMomentumLabel === "MICRO_MULTI_CONFIRM" ||
    candidate.microMomentumLabel === "MICRO_TICKS_DOWN" ||
    candidate.hasMicroMomentum === true ||
    candidate.hasRsiRollover === true ||
    candidate.hasGainerRsiRollover === true;

  const energy =
    Number(candidate.atrPct ?? 0) >= 1.0 ||
    candidate.postFee10EntryLabels?.includes("ATR_SUPER_ACTIVE") ||
    Number(candidate.entryRank ?? 999) <= 5;

  const hasRedConfirm =
    candidate.hasRedConfirmation === true ||
    candidate.immediateRedImpulse === true ||
    candidate.redImpulseDetected === true ||
    candidate.candleColorAtEntry === "RED";

  const hasNoGreen =
    candidate.hasGreenDanger !== true &&
    candidate.immediateGreenImpulse !== true &&
    candidate.greenImpulseDetected !== true;

  const redNoGreen = hasRedConfirm && hasNoGreen;

  const cvdOk =
    candidate.cvdLabel === "BEAR" ||
    candidate.cvdLabel === "NEUT" ||
    candidate.cvdLabel === "NEUTRAL" ||
    candidate.postFee10EntryLabels?.includes("CVD_NOT_BULLISH");

  const noLongDanger =
    candidate.longAuditWouldBlock !== true &&
    candidate.longAuditWouldHardBlock !== true;

  const marketOk =
    candidate.marketBreathWouldBlock !== true &&
    candidate.marketBreathLabel !== "SHORT_BREATH_HARD_DANGER";

  // MICRO_TICKS_DOWN is only a valid signal when red/no-green + cvd ok + no long danger
  const microTicksDown = candidate.microMomentumLabel === "MICRO_TICKS_DOWN";
  if (microTicksDown) {
    if (hasRedConfirm && hasNoGreen && !candidate.longAuditWouldBlock) {
      reasons.push("MICRO_TICKS_DOWN_CONFIRMED_LOG_ONLY");
    } else {
      failReasons.push("MICRO_TICKS_DOWN_UNCONFIRMED_LOG_ONLY");
    }
  }

  if (qualityGate)   reasons.push("QUALITY_GATE_OK");
  else               failReasons.push("NO_QUALITY_GATE");

  if (microConfirm)  reasons.push("MICRO_CONFIRM_OK");
  else               failReasons.push("NO_MICRO_CONFIRM");

  if (energy)        reasons.push("ENERGY_OK_ATR_OR_RANK");
  else               failReasons.push("NO_ENERGY_ATR_OR_RANK");

  if (redNoGreen)    reasons.push("RED_NO_GREEN_OK");
  else               failReasons.push("NO_RED_NO_GREEN_CONFIRMATION");

  if (cvdOk)         reasons.push("CVD_OK");
  else               failReasons.push("CVD_NOT_OK");

  if (noLongDanger)  reasons.push("NO_LONG_AUDIT_DANGER");
  else               failReasons.push("LONG_AUDIT_DANGER");

  if (marketOk)      reasons.push("MARKET_BREATH_OK");
  else               failReasons.push("MARKET_BREATH_DANGER");

  const pass =
    qualityGate &&
    microConfirm &&
    energy &&
    redNoGreen &&
    cvdOk &&
    noLongDanger &&
    marketOk;

  const tier =
    pass && aes >= 95 && bestDna >= 95 ? "SNIPER_ELITE"
    : pass && aes >= 90               ? "SNIPER_VALID"
    : pass                            ? "SNIPER_WATCH"
    : "SNIPER_FAIL";

  return {
    sniperShortGateVersion:  "sniper-short-v1-log-only-2026-06",
    sniperShortWouldPass:    pass,
    sniperShortTier:         tier,
    sniperShortReasons:      reasons,
    sniperShortFailReasons:  failReasons,
  };
}
