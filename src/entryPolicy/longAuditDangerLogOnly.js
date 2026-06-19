export function computeLongAuditDangerLogOnly(candidate) {
  const reasons = [];
  let score = 0;

  const rsiLongExpansion =
    candidate.rsiLongSetupLabel?.includes("RSI_LONG_MOMENTUM_EXPANSION") ||
    Number(candidate.rsiLongScore ?? 0) > 25;

  const macdLongExpansion =
    candidate.trendLongSetupLabel?.includes("MACD_LONG_BULLISH_EXPANSION") ||
    Number(candidate.trendLongScore ?? 0) > 45;

  const flowAccumulation =
    candidate.advancedLongSetupLabel?.includes("FLOW_LONG_ACCUMULATION") ||
    Number(candidate.advancedLongScore ?? 0) > 20;

  const cvdBullish =
    candidate.cvdLabel === "BULL" ||
    candidate.cvdLabel === "BULLISH";

  const greenPressure =
    candidate.greenPressureLabel === "MICRO_GREEN_PRESSURE" ||
    candidate.hasGreenDanger === true;

  if (rsiLongExpansion) {
    score += 30;
    reasons.push("RSI_LONG_MOMENTUM_EXPANSION");
  }

  if (macdLongExpansion) {
    score += 35;
    reasons.push("MACD_LONG_BULLISH_EXPANSION");
  }

  if (flowAccumulation) {
    score += 25;
    reasons.push("FLOW_LONG_ACCUMULATION");
  }

  if (rsiLongExpansion && macdLongExpansion) {
    score += 25;
    reasons.push("LONG_RSI_MACD_DOUBLE_EXPANSION");
  }

  if (cvdBullish) {
    score += 15;
    reasons.push("BULLISH_CVD_SUPPORTS_LONG_AUDIT_DANGER");
  }

  if (greenPressure) {
    score += 20;
    reasons.push("GREEN_PRESSURE_SUPPORTS_LONG_AUDIT_DANGER");
  }

  // EMA_LONG_FAST_SUPPORT_HELD alone must not create LONG_AUDIT_DANGER.
  // It is exported separately but does not contribute to the score here.

  const clamped = Math.max(0, Math.min(100, score));

  const label =
    clamped >= 75 ? "LONG_AUDIT_HARD_DANGER"
    : clamped >= 50 ? "LONG_AUDIT_DANGER"
    : clamped >= 25 ? "LONG_AUDIT_CAUTION"
    : "LONG_AUDIT_CLEAR";

  return {
    longAuditDangerScore:   clamped,
    longAuditDangerLabel:   label,
    longAuditWouldBlock:    clamped >= 50,
    longAuditWouldHardBlock: clamped >= 75,
    longAuditReasons:       reasons,
  };
}

export function computeEmaLongFastSupportHeld(candidate) {
  return {
    emaLongFastSupportHeld:
      candidate.emaLongFastSetupLabel?.includes("EMA_LONG_FAST_SUPPORT_HELD") ||
      candidate.emaFastAboveSlow === true ||
      false,
  };
}
