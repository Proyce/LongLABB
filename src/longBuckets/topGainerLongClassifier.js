// ─── TOP GAINER LONG CLASSIFIER ──────────────────────────────────────────────
// Primary thesis: a strong symbol has a controlled pullback or breakout
// structure and is resuming upward movement. Favorable move = price RISES.
// Inverted vs top gainer exhaustion short classifier.

export function classifyTopGainerLong(s) {
  const reasons  = [];
  const warnings = [];
  let continuationScore = 0;
  let blowoffRiskScore  = 0;
  let subBucket         = "TOP_GAINER_UNCLASSIFIED_LONG";

  const change24h     = s.change24h ?? 0;
  const strongPump    = change24h >= 8;
  const extremePump   = change24h >= 20;

  const greenSignal =
    s.candleColorAtEntry === "GREEN" ||
    s.greenImpulseDetected === true ||
    s.immediateGreenImpulse === true;

  const aboveVwap =
    s.priceVsVwapLabel === "ABOVE_VWAP" ||
    s.priceVsVwapLabel === "AT_VWAP";

  const vwapLoss = s.priceVsVwapLabel === "BELOW_VWAP";

  const higherLow =
    s.higherLow1m === true ||
    s.higherLow3m === true ||
    s.marketStructureLabel?.includes("HIGHER_LOW");

  const breakoutRetest =
    s.breakoutRetest1m === true ||
    s.breakoutRetest3m === true;

  const rejection =
    (s.upperWickPct ?? 0) >= 35 ||
    s.failedBreakout1m === true ||
    s.failedBreakout3m === true;

  const momentumStrong =
    (s.rsi1mSlope === "RISING" || s.rsi3mSlope === "RISING") &&
    !(s.macdHistogramState1m?.includes("SHRINKING"));

  const flowBull =
    s.cvdLabel === "BULL" ||
    s.cvdLabel === "BULLISH";

  const controlledPullback =
    !rejection &&
    !s.immediateRedImpulse &&
    (higherLow || breakoutRetest || (aboveVwap && greenSignal));

  const continuationRisk =
    s.immediateRedImpulse === true ||
    (s.cvdLabel === "BEAR" && !greenSignal);

  const spreadOk = s.spreadPct == null || s.spreadPct <= 0.05;

  // ── Positive continuation signals ────────────────────────────────────────

  if (strongPump) {
    continuationScore += 8;
    reasons.push("STRONG_PUMP_BASE");
  }

  if (aboveVwap && !vwapLoss) {
    continuationScore += 15;
    reasons.push("ABOVE_VWAP_SUPPORT");
    subBucket = "TOP_GAINER_VWAP_SUPPORT_LONG";
  }

  if (higherLow) {
    continuationScore += 18;
    reasons.push("HIGHER_LOW_CONFIRMED");
    subBucket = "TOP_GAINER_HIGHER_LOW_LONG";
  }

  if (breakoutRetest) {
    continuationScore += 20;
    reasons.push("BREAKOUT_RETEST_HOLD");
    subBucket = "TOP_GAINER_BREAKOUT_RETEST_LONG";
  }

  if (greenSignal && aboveVwap && flowBull) {
    continuationScore += 18;
    reasons.push("GREEN_REACCELERATION_CVD_BULL");
    subBucket = "TOP_GAINER_GREEN_REACCELERATION_LONG";
  } else if (greenSignal && momentumStrong) {
    continuationScore += 12;
    reasons.push("GREEN_IMPULSE_MOMENTUM_STRONG");
    if (subBucket === "TOP_GAINER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_GAINER_CONTINUATION_LONG";
    }
  }

  if (controlledPullback && aboveVwap) {
    continuationScore += 10;
    reasons.push("CONTROLLED_PULLBACK_ABOVE_VWAP");
    if (subBucket === "TOP_GAINER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_GAINER_PULLBACK_HOLD_LONG";
    }
  }

  if (flowBull && greenSignal && momentumStrong) {
    continuationScore += 12;
    reasons.push("CVD_BULL_MOMENTUM_CONTINUATION");
    if (subBucket === "TOP_GAINER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_GAINER_TREND_RESUMPTION_LONG";
    }
  }

  if (
    higherLow &&
    aboveVwap &&
    controlledPullback &&
    greenSignal &&
    flowBull
  ) {
    continuationScore += 12;
    reasons.push("MULTI_CONFIRM_CONTINUATION");
    subBucket = "TOP_GAINER_MICRO_MULTI_CONFIRM_LONG";
  }

  // ── Blowoff / danger signals ──────────────────────────────────────────────

  if (extremePump && !controlledPullback && !higherLow) {
    blowoffRiskScore += 30;
    warnings.push("EXTREME_EXTENSION_NO_PULLBACK");
    subBucket = "TOP_GAINER_OVEREXTENDED_NO_PULLBACK";
  }

  if (rejection) {
    blowoffRiskScore += 25;
    warnings.push("UPPER_WICK_REJECTION");
    subBucket = "TOP_GAINER_FAILED_BREAKOUT_DANGER";
  }

  if (vwapLoss && strongPump) {
    blowoffRiskScore += 20;
    warnings.push("VWAP_LOSS_AFTER_PUMP");
    subBucket = "TOP_GAINER_VWAP_LOSS_DANGER";
  }

  if (continuationRisk) {
    blowoffRiskScore += 20;
    warnings.push("RED_IMPULSE_CVD_BEAR_DANGER");
    if (subBucket === "TOP_GAINER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_GAINER_CVD_DIVERGENCE_DANGER";
    }
  }

  if (s.fundingRate != null && s.fundingRate > 0.002) {
    blowoffRiskScore += 15;
    warnings.push("POSITIVE_FUNDING_CROWDING_DANGER");
    if (subBucket === "TOP_GAINER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_GAINER_LONG_CROWDING_DANGER";
    }
  }

  if (s.oiPressureLabel === "PRICE_FLAT_OI_UP") {
    blowoffRiskScore += 12;
    warnings.push("OI_UP_NO_PRICE_PROGRESS");
    if (subBucket === "TOP_GAINER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_GAINER_PUMP_STALL_DANGER";
    }
  }

  if (!spreadOk) {
    blowoffRiskScore += 10;
    warnings.push("SPREAD_ABOVE_0_05");
  }

  if (
    extremePump &&
    rejection &&
    !controlledPullback
  ) {
    blowoffRiskScore += 15;
    warnings.push("BLOWOFF_TOP_RISK");
    subBucket = "TOP_GAINER_BLOWOFF_DANGER";
  }

  const finalScore = continuationScore - blowoffRiskScore;
  const clamped    = Math.max(-50, Math.min(100, finalScore));

  return {
    longSubBucket:                  subBucket,
    topGainerLongSubBucket:         subBucket,
    topGainerContinuationScore:     continuationScore,
    topGainerBlowoffRiskScore:      blowoffRiskScore,
    longSetupScore:                 clamped,
    topGainerLongScore:             clamped,
    topGainerContinuationReasons:   reasons,
    topGainerBlowoffWarnings:       warnings,
    longSetupReasons:               reasons,
    longSetupWarnings:              warnings,
  };
}
