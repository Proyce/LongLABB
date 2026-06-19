// Top-Gainer Long Continuation Diagnostic Gate
// Rewards green continuation, bullish CVD, above-VWAP, clean setup.
// Penalizes red rejection, exhaustion failure, falling-knife patterns.
// LOG_ONLY — never affects execution.

export function evaluateGainerDiagnosticGate(candidate) {
  const reasons = [];

  const isGainer = candidate.leaderboardSide === "GAINERS";

  // Favorable: green continuation
  const greenConfirmation =
    candidate.immediateGreenImpulse === true ||
    candidate.greenImpulseDetected === true ||
    candidate.last3TicksDirection === "UP" ||
    candidate.candleColorAtEntry === "GREEN";

  // Favorable: CVD not bearish (bull or neutral)
  const cvdOk =
    candidate.cvdLabel === "BULL" ||
    candidate.cvdLabel === "NEUT" ||
    candidate.cvdLabel === "NEUTRAL" ||
    candidate.cvdLabel !== "BEAR";

  // Favorable: above VWAP or successful reclaim
  const aboveVwapOrReclaim =
    candidate.vwapContextLabel === "ABOVE_VWAP" ||
    candidate.vwapContextLabel === "VWAP_RECLAIM" ||
    candidate.vwapContextLabel === "ABOVE_VWAP_CLEAN" ||
    (candidate.priceVsVwapPct != null && Number(candidate.priceVsVwapPct) > 0);

  // Danger: immediate red rejection
  const noImmediateRed =
    candidate.immediateRedImpulse !== true &&
    candidate.redImpulseDetected !== true &&
    candidate.candleColorAtEntry !== "RED";

  // Danger: failed breakout or blowoff exhaustion
  const noFailedBreakout =
    candidate.hasGainerFailedBreakout !== true &&
    candidate.topGainerContinuationAuditLabel !== "FAILED_BREAKOUT" &&
    !candidate.postFee10EntryLabels?.includes("GAINER_FAILED_BREAKOUT");

  // Danger: extreme exhaustion (blowoff top pattern)
  const noBlowoffExhaustion =
    Number(candidate.topGainerExhaustionQualityScore ?? 0) < 80 &&
    !candidate.postFee10EntryLabels?.includes("GAINER_EXHAUSTION_80");

  // Favorable: clean spread
  const spreadClean = Number(candidate.spreadPct ?? 999) <= 0.05;

  // Favorable: active ATR
  const atrActive = Number(candidate.atrPct ?? 0) >= 0.2;

  // Long market context not strongly hostile
  const longContextOk =
    candidate.crossMarketLongBiasLabel !== "STRONG_LONG_HEADWIND" &&
    candidate.longAuditWouldBlock !== true &&
    candidate.marketBreathWouldBlock !== true;

  if (greenConfirmation)   reasons.push("GREEN_CONTINUATION_OK");
  if (cvdOk)               reasons.push("CVD_NOT_BEARISH_OK");
  if (aboveVwapOrReclaim)  reasons.push("VWAP_OK");
  if (noImmediateRed)      reasons.push("NO_RED_REJECTION_OK");
  if (noFailedBreakout)    reasons.push("NO_FAILED_BREAKOUT_OK");
  if (noBlowoffExhaustion) reasons.push("NO_BLOWOFF_EXHAUSTION_OK");
  if (spreadClean)         reasons.push("SPREAD_CLEAN_OK");
  if (atrActive)           reasons.push("ATR_ACTIVE_OK");
  if (longContextOk)       reasons.push("LONG_CONTEXT_OK");

  const basePass =
    isGainer &&
    greenConfirmation &&
    cvdOk &&
    noImmediateRed &&
    longContextOk;

  const sniperPass =
    basePass &&
    noFailedBreakout &&
    noBlowoffExhaustion &&
    aboveVwapOrReclaim &&
    spreadClean &&
    atrActive &&
    Number(candidate.longAesScore ?? candidate.absoluteEntryScore ?? 0) >= 85;

  return {
    gainerDiagnosticGatePass:        basePass,
    gainerDiagnosticSniperWouldPass: sniperPass,
    gainerDiagnosticGateReasons:     reasons,
  };
}
