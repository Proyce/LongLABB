// ─── FUNDING LABELS FOR LONGLAB ──────────────────────────────────────────────
// Long-supportive and danger labels derived from funding state.
// Rule: negative funding alone is NOT sufficient for a long entry.
// It becomes useful paired with: failed breakdown, green impulse,
// CVD bullish, VWAP reclaim, short liquidation pressure, or higher low.

export function computeFundingLongLabel(candidate) {
  const fundingRate  = candidate.fundingRate ?? candidate.fundingRatePct / 100;
  const regime       = candidate.fundingRegime;
  const greenImpulse = candidate.greenImpulseDetected === true || candidate.immediateGreenImpulse === true;
  const cvdBull      = candidate.cvdLabel === "BULL";
  const failedBD     = candidate.failedBreakdown1m === true || candidate.failedBreakdown3m === true;
  const vwapReclaim  = candidate.priceVsVwapLabel === "ABOVE_VWAP" ||
                       candidate.vwapLongContextLabel?.includes("RECLAIM");
  const oiLong       = candidate.oiPressureLabel === "PRICE_UP_OI_UP";
  const squeezeSig   = candidate.shortLiquidationPressure === true ||
                       candidate.shortSqueezeCondition === true;

  const hasPositivePair = greenImpulse || cvdBull || failedBD || vwapReclaim || squeezeSig;

  // ── Supportive labels ────────────────────────────────────────────────────
  if ((regime === "FUNDING_EXTREME_NEGATIVE" || regime === "FUNDING_NEGATIVE") && squeezeSig) {
    return "SHORT_LIQUIDATION_PRESSURE_LONG_TAILWIND";
  }
  if (regime === "FUNDING_EXTREME_NEGATIVE" && hasPositivePair) {
    return "NEGATIVE_FUNDING_SQUEEZE_LONG";
  }
  if (regime === "FUNDING_NEGATIVE" && failedBD && vwapReclaim) {
    return "NEGATIVE_FUNDING_WITH_FAILED_BREAKDOWN";
  }
  if (regime === "FUNDING_NEGATIVE" && vwapReclaim) {
    return "NEGATIVE_FUNDING_WITH_VWAP_RECLAIM";
  }
  if ((regime === "FUNDING_NEGATIVE" || regime === "FUNDING_EXTREME_NEGATIVE") && hasPositivePair) {
    return "SHORT_CROWDING_LONG_TAILWIND";
  }
  if (oiLong && (regime === "FUNDING_NEUTRAL" || regime === "FUNDING_NEGATIVE")) {
    return "OI_UP_PRICE_UP_LONG_CONFIRMATION";
  }

  // Bearish price vs bullish funding divergence is a potential squeeze setup
  if (regime === "FUNDING_NEGATIVE" && greenImpulse) {
    return "FUNDING_BEARISH_PRICE_BULLISH_DIVERGENCE";
  }

  // ── Danger labels ────────────────────────────────────────────────────────
  if (regime === "FUNDING_EXTREME_POSITIVE" && !greenImpulse) {
    return "EXTREME_POSITIVE_FUNDING_DANGER";
  }
  if (regime === "FUNDING_POSITIVE" && candidate.cvdLabel === "BEAR") {
    return "FUNDING_POSITIVE_CVD_WEAK_DANGER";
  }
  if (regime === "FUNDING_POSITIVE") {
    return "POSITIVE_FUNDING_LONG_CROWDING_DANGER";
  }
  if (oiLong && candidate.priceVsVwapLabel === "BELOW_VWAP") {
    return "OI_UP_PRICE_DOWN_LONG_DANGER";
  }
  if (candidate.fundingSnapshotAt != null && Date.now() - candidate.fundingSnapshotAt > 120_000) {
    return "FUNDING_STALE";
  }

  return "FUNDING_NEUTRAL_NO_LABEL";
}

// ─── SIMPLE REGIME → LONG IMPACT STRING ──────────────────────────────────────

export function fundingRegimeToLongImpact(regime) {
  switch (regime) {
    case "FUNDING_EXTREME_NEGATIVE": return "STRONG_LONG_TAILWIND";
    case "FUNDING_NEGATIVE":         return "MILD_LONG_TAILWIND";
    case "FUNDING_NEUTRAL":          return "NEUTRAL";
    case "FUNDING_POSITIVE":         return "MILD_LONG_HEADWIND";
    case "FUNDING_EXTREME_POSITIVE": return "STRONG_LONG_HEADWIND";
    default:                         return "UNKNOWN";
  }
}
