// ─── TOP GAINER CONTINUATION AUDIT ───────────────────────────────────────────
// Log-only. Evaluates whether a top-gainer LONG entry has continuation quality.
// Inverted analogue of topGainerExhaustionAudit.js.
// Does not affect candidate creation or execution.

function classifyBucketAuditTier(score) {
  if (score >= 75) return "STRONG";
  if (score >= 50) return "PASSING";
  if (score >= 25) return "WEAK";
  return "FAILING";
}

export function evaluateTopGainerContinuationAudit(s) {
  const reasons  = [];
  const warnings = [];
  let score      = 0;

  const change24h       = s.change24h ?? 0;
  const pumpActive      = change24h >= 5;
  const greenImpulse    = s.immediateGreenImpulse === true || s.greenImpulseDetected === true;
  const redImpulse      = s.immediateRedImpulse === true;
  const cvdBull         = s.cvdLabel === "BULL" || s.cvdLabel === "BULLISH";
  const cvdBear         = s.cvdLabel === "BEAR";
  const aboveVwap       = s.priceVsVwapLabel === "ABOVE_VWAP" || s.priceVsVwapLabel === "AT_VWAP";
  const higherLow       = s.higherLow1m === true || s.higherLow3m === true;
  const breakoutRetest  = s.breakoutRetest1m === true || s.breakoutRetest3m === true;
  const rejection       = (s.upperWickPct ?? 0) >= 35 || s.failedBreakout1m === true;
  const macdExpanding   = s.macdHistogramState1m?.includes("POSITIVE_EXPANDING");
  const rsiStrong       = s.rsi1m >= 50 && s.rsi1mSlope === "RISING";
  const spreadOk        = s.spreadPct == null || s.spreadPct <= 0.05;
  const positiveFunding = s.fundingRate != null && s.fundingRate > 0.003;

  // Continuation signals
  if (aboveVwap)      { score += 15; reasons.push("ABOVE_VWAP_SUPPORT"); }
  if (higherLow)      { score += 18; reasons.push("HIGHER_LOW"); }
  if (breakoutRetest) { score += 18; reasons.push("BREAKOUT_RETEST_HOLD"); }
  if (cvdBull)        { score += 12; reasons.push("CVD_BULL"); }
  if (greenImpulse)   { score += 15; reasons.push("GREEN_REACCELERATION"); }
  if (macdExpanding)  { score += 8;  reasons.push("MACD_POSITIVE_EXPANSION"); }
  if (rsiStrong)      { score += 6;  reasons.push("RSI_STRONG_RISING"); }
  if (pumpActive)     { score += 5;  reasons.push("PUMP_STILL_ACTIVE"); }

  // Danger signals
  if (rejection)       { score -= 25; warnings.push("UPPER_WICK_REJECTION"); }
  if (redImpulse)      { score -= 20; warnings.push("IMMEDIATE_RED_IMPULSE"); }
  if (cvdBear)         { score -= 15; warnings.push("CVD_BEAR_DIVERGENCE"); }
  if (!aboveVwap)      { score -= 12; warnings.push("BELOW_VWAP"); }
  if (positiveFunding) { score -= 8;  warnings.push("POSITIVE_FUNDING_CROWDING"); }
  if (!spreadOk)       { score -= 8;  warnings.push("SPREAD_ABOVE_0_05"); }

  const clamped = Math.max(0, Math.min(100, score));

  const thesisLabel =
    clamped >= 70 ? "CONTINUATION_CONFIRMED"
    : clamped >= 50 ? "CONTINUATION_LIKELY"
    : clamped >= 30 ? "CONTINUATION_POSSIBLE"
    : "CONTINUATION_UNLIKELY";

  const dangerLabel =
    rejection && redImpulse ? "TOP_GAINER_BLOWOFF_DANGER"
    : rejection              ? "TOP_GAINER_FAILED_BREAKOUT_DANGER"
    : !aboveVwap             ? "TOP_GAINER_VWAP_LOSS_DANGER"
    : "TOP_GAINER_CONTINUATION_CLEAR";

  const confirmCount = [aboveVwap, higherLow, breakoutRetest, cvdBull, greenImpulse]
    .filter(Boolean).length;

  // Canonical bucket audit fields
  const bucketAuditMissingInputs = [];
  if (s.cvdLabel == null) bucketAuditMissingInputs.push("cvdLabel");
  if (s.priceVsVwapLabel == null) bucketAuditMissingInputs.push("priceVsVwapLabel");
  if (s.immediateGreenImpulse == null && s.greenImpulseDetected == null)
    bucketAuditMissingInputs.push("greenImpulse");

  return {
    topGainerContinuationScore:         clamped,
    topGainerContinuationThesisLabel:   thesisLabel,
    topGainerContinuationDangerLabel:   dangerLabel,
    topGainerContinuationConfirmCount:  confirmCount,
    topGainerContinuationWouldPass:     clamped >= 50,
    topGainerContinuationReasons:       reasons,
    topGainerContinuationWarnings:      warnings,

    bucketAuditType:         "TOP_GAINER_CONTINUATION",
    bucketAuditWouldPass:    clamped >= 50,
    bucketAuditScore:        clamped,
    bucketAuditTier:         classifyBucketAuditTier(clamped),
    bucketAuditReasons:      reasons,
    bucketAuditWarnings:     warnings,
    bucketAuditMissingInputs,
  };
}
