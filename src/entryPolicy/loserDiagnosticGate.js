// Top-Loser Reversal Long Diagnostic Gate
// Rewards seller exhaustion, first green impulse, CVD stabilization, VWAP reclaim.
// Penalizes red continuation (falling knife), no reversal evidence.
// LOG_ONLY — never affects execution.

export function evaluateLoserDiagnosticGate(candidate) {
  const reasons  = [];
  const warnings = [];

  const isLoser = candidate.leaderboardSide === "LOSERS";

  // Favorable: seller exhaustion signal
  const sellerExhaustion =
    candidate.failedBreakdown === true ||
    candidate.hasLoserFailedBreakdown === true ||
    candidate.failedBreakdown1m === true ||
    candidate.hasFlushExhaustion === true ||
    candidate.postFee10EntryLabels?.includes("LOSER_SELLER_EXHAUSTION");

  // Favorable: first meaningful green reversal (not red continuation)
  const greenReversal =
    candidate.immediateGreenImpulse === true ||
    candidate.greenImpulseDetected === true ||
    candidate.candleColorAtEntry === "GREEN" ||
    candidate.last3TicksDirection === "UP";

  // Favorable: CVD stabilizing or turning bullish
  const cvdOk =
    candidate.cvdLabel === "BULL" ||
    candidate.cvdLabel === "NEUT" ||
    candidate.cvdLabel === "NEUTRAL" ||
    candidate.postFee10EntryLabels?.includes("CVD_STABILIZING");

  // Favorable: VWAP reclaim attempt or micro-structure reclaim
  const vwapReclaim =
    candidate.vwapContextLabel === "VWAP_RECLAIM" ||
    candidate.vwapContextLabel === "VWAP_RECLAIM_ATTEMPT" ||
    candidate.vwapContextLabel === "ABOVE_VWAP";

  // Danger: red continuation (falling knife)
  const noRedContinuation =
    candidate.immediateRedImpulse !== true ||
    candidate.last3TicksDirection !== "DOWN";

  // Danger: extreme red continuation
  const fallingKnife =
    candidate.immediateRedImpulse === true &&
    candidate.last3TicksDirection === "DOWN" &&
    (candidate.preEntryFavorableMovePct ?? 0) < 0.1;

  // Favorable: rank within top 15
  const rankGood = Number(candidate.entryRank ?? 999) <= 15;

  // Favorable: clean spread
  const spreadClean = Number(candidate.spreadPct ?? 999) <= 0.05;

  // Favorable: active ATR
  const atrOk = Number(candidate.atrPct ?? 0) >= 0.3;

  // Long context not strongly hostile
  const longContextOk =
    candidate.crossMarketLongBiasLabel !== "STRONG_LONG_HEADWIND" &&
    candidate.longAuditWouldBlock !== true &&
    candidate.marketBreathWouldBlock !== true;

  // Warning: no reversal evidence at all
  if (!greenReversal && !sellerExhaustion) {
    warnings.push("WARN_NO_REVERSAL_EVIDENCE_LOG_ONLY");
  }
  if (fallingKnife) {
    warnings.push("WARN_FALLING_KNIFE_DANGER_LOG_ONLY");
  }

  if (sellerExhaustion) reasons.push("SELLER_EXHAUSTION_OK");
  if (greenReversal)    reasons.push("GREEN_REVERSAL_OK");
  if (cvdOk)            reasons.push("CVD_STABLE_OR_BULL_OK");
  if (vwapReclaim)      reasons.push("VWAP_RECLAIM_OK");
  if (noRedContinuation) reasons.push("NO_RED_CONTINUATION_OK");
  if (rankGood)         reasons.push("RANK_15_OK");
  if (spreadClean)      reasons.push("SPREAD_CLEAN_OK");
  if (atrOk)            reasons.push("ATR_OK");
  if (longContextOk)    reasons.push("LONG_CONTEXT_OK");

  // Base pass: reversal evidence + no falling knife + long context ok
  const basePass =
    isLoser &&
    !fallingKnife &&
    (greenReversal || sellerExhaustion) &&
    cvdOk &&
    longContextOk;

  const sniperPass =
    basePass &&
    greenReversal &&
    sellerExhaustion &&
    rankGood &&
    spreadClean &&
    candidate.longAuditWouldBlock !== true &&
    candidate.marketBreathWouldBlock !== true;

  return {
    loserDiagnosticGatePass:        basePass,
    loserDiagnosticSniperWouldPass: sniperPass,
    loserDiagnosticGateReasons:     reasons,
    loserDiagnosticWarnings:        warnings,
  };
}
