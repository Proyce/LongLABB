// Long-native execution rank score — LOG_ONLY.
// Rewards green continuation, bullish CVD, above VWAP, Long AES quality.
// Penalizes falling-knife patterns, long audit danger, market headwinds.

export function computeExecutionRankScoreLogOnly(candidate) {
  const reasons = [];

  const aes =
    Number(candidate.absoluteEntryAdaptiveScore) ||
    Number(candidate.longAesScore) ||
    Number(candidate.absoluteEntryScore) ||
    0;

  const bestDnaLong = Number(candidate.bestDnaLongScore ?? candidate.bestDnaScore ?? 0);
  const longPost10  = Number(candidate.longPostFee10Score ?? candidate.postFee10EntryScore ?? 0);

  // Long-favorable signals boost score
  let bonus = 0;

  const greenPresent =
    candidate.immediateGreenImpulse === true ||
    candidate.greenImpulseDetected === true ||
    candidate.last3TicksDirection === "UP";
  if (greenPresent) { bonus += 10; reasons.push("GREEN_SIGNAL_BONUS"); }

  const cvdBull = candidate.cvdLabel === "BULL";
  if (cvdBull) { bonus += 8; reasons.push("CVD_BULL_BONUS"); }

  const aboveVwap =
    candidate.vwapContextLabel === "ABOVE_VWAP" ||
    candidate.vwapContextLabel === "VWAP_RECLAIM" ||
    (candidate.priceVsVwapPct != null && Number(candidate.priceVsVwapPct) > 0);
  if (aboveVwap) { bonus += 6; reasons.push("ABOVE_VWAP_BONUS"); }

  // Long-adverse signals penalize score
  let penalty = 0;

  if (candidate.longAuditWouldBlock) {
    penalty += 35;
    reasons.push("LONG_AUDIT_PENALTY");
  }

  if (candidate.marketBreathWouldBlock) {
    penalty += 25;
    reasons.push("MARKET_BREATH_PENALTY");
  }

  const fallingKnife =
    candidate.immediateRedImpulse === true &&
    candidate.last3TicksDirection === "DOWN";
  if (fallingKnife) {
    penalty += 40;
    reasons.push("FALLING_KNIFE_RED_PENALTY");
  }

  const longHeadwind =
    candidate.crossMarketLongBiasLabel === "STRONG_LONG_HEADWIND";
  if (longHeadwind) {
    penalty += 20;
    reasons.push("STRONG_LONG_HEADWIND_PENALTY");
  }

  const raw =
    aes         * 0.35 +
    bestDnaLong * 0.25 +
    longPost10  * 0.20 +
    bonus       * 0.20 -
    penalty;

  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const tier =
    score >= 90 ? "EXECUTION_RANK_SNIPER_LOG_ONLY"
    : score >= 80 ? "EXECUTION_RANK_HIGH_LOG_ONLY"
    : score >= 70 ? "EXECUTION_RANK_VALID_LOG_ONLY"
    : score >= 50 ? "EXECUTION_RANK_WEAK_LOG_ONLY"
    : "EXECUTION_RANK_REJECT_LOG_ONLY";

  return {
    executionRankScore:   score,
    executionRankTier:    tier,
    executionRankReasons: reasons,
    executionRankLogOnly: true,
  };
}
