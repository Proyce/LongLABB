// ─── TOP LOSER REVERSAL AUDIT ─────────────────────────────────────────────────
// Log-only. Evaluates whether a top-loser LONG entry has reversal confirmation.
// Does not affect candidate creation or execution.

function classifyBucketAuditTier(score) {
  if (score >= 75) return "STRONG";
  if (score >= 50) return "PASSING";
  if (score >= 25) return "WEAK";
  return "FAILING";
}

export function evaluateTopLoserReversalAudit(s) {
  const reasons  = [];
  const warnings = [];
  let score      = 0;

  const greenImpulse    = s.immediateGreenImpulse === true || s.greenImpulseDetected === true;
  const redImpulse      = s.immediateRedImpulse === true;
  const failedBreakdown = s.failedBreakdown1m === true || s.failedBreakdown3m === true;
  const higherLow       = s.higherLow1m === true || s.higherLow3m === true;
  const cvdBull         = s.cvdLabel === "BULL" || s.cvdLabel === "BULLISH";
  const cvdBear         = s.cvdLabel === "BEAR";
  const aboveVwap       = s.priceVsVwapLabel === "ABOVE_VWAP" || s.priceVsVwapLabel === "AT_VWAP";
  const btcTailwind     = s.btcRegime === "BTC_STRONG_UP" || s.btcRegime === "BTC_WEAK_UP";
  const btcHeadwind     = s.btcRegime === "BTC_STRONG_DOWN";
  const lowerWick       = (s.lowerWickPct ?? 0) >= 30;
  const ticksUp         = s.last3TicksDirection === "UP";
  const negativeFunding = s.fundingRate != null && s.fundingRate < -0.001;
  const atrActive       = Number.isFinite(s.atrPct) && s.atrPct >= 0.6;

  // Positive reversal signals
  if (failedBreakdown) { score += 20; reasons.push("FAILED_BREAKDOWN"); }
  if (greenImpulse)    { score += 18; reasons.push("GREEN_IMPULSE"); }
  if (lowerWick)       { score += 12; reasons.push("LOWER_WICK_ABSORPTION"); }
  if (higherLow)       { score += 15; reasons.push("HIGHER_LOW_CONFIRMED"); }
  if (cvdBull)         { score += 12; reasons.push("CVD_BULL"); }
  if (aboveVwap)       { score += 10; reasons.push("VWAP_RECLAIM"); }
  if (ticksUp)         { score += 8;  reasons.push("LAST3_TICKS_UP"); }
  if (btcTailwind)     { score += 10; reasons.push("BTC_TAILWIND"); }
  if (negativeFunding) { score += 6;  reasons.push("NEGATIVE_FUNDING_SQUEEZE"); }
  if (atrActive)       { score += 5;  reasons.push("ATR_ACTIVE"); }

  // Danger penalties
  if (redImpulse)      { score -= 25; warnings.push("IMMEDIATE_RED_IMPULSE"); }
  if (cvdBear)         { score -= 18; warnings.push("CVD_BEAR"); }
  if (btcHeadwind && !greenImpulse) { score -= 15; warnings.push("BTC_HEADWIND_NO_GREEN"); }

  const clamped = Math.max(0, Math.min(100, score));

  const thesisLabel =
    clamped >= 70 ? "REVERSAL_CONFIRMED"
    : clamped >= 50 ? "REVERSAL_LIKELY"
    : clamped >= 30 ? "REVERSAL_POSSIBLE"
    : "REVERSAL_UNLIKELY";

  const confirmCount = [failedBreakdown, greenImpulse, higherLow, cvdBull, aboveVwap, lowerWick]
    .filter(Boolean).length;

  // Canonical bucket audit fields
  const bucketAuditMissingInputs = [];
  if (s.cvdLabel == null) bucketAuditMissingInputs.push("cvdLabel");
  if (s.btcRegime == null) bucketAuditMissingInputs.push("btcRegime");
  if (s.immediateGreenImpulse == null && s.greenImpulseDetected == null)
    bucketAuditMissingInputs.push("greenImpulse");

  return {
    topLoserReversalScore:          clamped,
    topLoserReversalThesisLabel:    thesisLabel,
    topLoserReversalConfirmCount:   confirmCount,
    topLoserReversalWouldPass:      clamped >= 50,
    topLoserReversalReasons:        reasons,
    topLoserReversalWarnings:       warnings,

    bucketAuditType:         "TOP_LOSER_REVERSAL",
    bucketAuditWouldPass:    clamped >= 50,
    bucketAuditScore:        clamped,
    bucketAuditTier:         classifyBucketAuditTier(clamped),
    bucketAuditReasons:      reasons,
    bucketAuditWarnings:     warnings,
    bucketAuditMissingInputs,
  };
}
