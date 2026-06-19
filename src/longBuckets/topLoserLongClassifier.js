// ─── TOP LOSER LONG CLASSIFIER ───────────────────────────────────────────────
// Primary thesis: a heavily sold symbol shows seller exhaustion and a
// defensible reversal signal. Favorable move = price RISES from entry.
// All signals are inverted vs the short bucket classifier.

export function classifyTopLoserLong(s) {
  const reasons  = [];
  const warnings = [];
  let score      = 0;
  let subBucket  = "TOP_LOSER_UNCLASSIFIED_LONG";

  const belowVwap      = s.priceVsVwapLabel === "BELOW_VWAP";
  const aboveOrAtVwap  = s.priceVsVwapLabel === "ABOVE_VWAP" || s.priceVsVwapLabel === "AT_VWAP";
  const trendLong      = s.trendCompositeLabel === "TREND_LONG_BIAS";
  const trendShort     = s.trendCompositeLabel === "TREND_SHORT_BIAS";
  const dmiBull5m      = s.dmiBias5m === "BULLISH_DMI";
  const dmiBear5m      = s.dmiBias5m === "BEARISH_DMI";
  const cvdBullOrImp   = s.cvdLabel === "BULL" || s.cvdLabel === "BULLISH";
  const cvdBear        = s.cvdLabel === "BEAR";
  const spreadOk       = s.spreadPct == null || s.spreadPct <= 0.05;
  const entryRank      = s.entryRankInBucket ?? s.entryRank ?? 99;
  const change24h      = s.change24h ?? 0;
  const strongDrop     = change24h <= -8;
  const extremeDrop    = change24h <= -15;
  const greenImpulse   = s.greenImpulseDetected === true || s.immediateGreenImpulse === true;
  const redImpulse     = s.immediateRedImpulse === true || s.redImpulseDetected === true;
  const lowerWick      = (s.lowerWickPct ?? 0) >= 35;
  const failedBreakdown = s.failedBreakdown1m === true || s.failedBreakdown3m === true;
  const atrActive      = Number.isFinite(s.atrPct) && s.atrPct >= 0.6;

  // ── Positive reversal signals ─────────────────────────────────────────────

  if (extremeDrop) {
    score += 12;
    reasons.push("EXTREME_DROP_EXHAUSTION_CONTEXT");
  } else if (strongDrop) {
    score += 8;
    reasons.push("STRONG_DROP_REVERSAL_CONTEXT");
  }

  if (failedBreakdown) {
    score += 20;
    reasons.push("FAILED_BREAKDOWN_REVERSAL");
    subBucket = "TOP_LOSER_FAILED_BREAKDOWN_LONG";
  }

  if (lowerWick && !redImpulse) {
    score += 15;
    reasons.push("LOWER_WICK_ABSORPTION");
    if (subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_SELLER_EXHAUSTION_LONG";
    }
  }

  if (greenImpulse && !redImpulse) {
    score += 18;
    reasons.push("GREEN_IMPULSE_CONFIRMED");
    if (subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_FIRST_GREEN_CANDLE_LONG";
    }
  }

  if (aboveOrAtVwap && greenImpulse && cvdBullOrImp) {
    score += 20;
    reasons.push("VWAP_RECLAIM_CONFIRMED");
    subBucket = "TOP_LOSER_VWAP_RECLAIM_LONG";
  } else if (aboveOrAtVwap && greenImpulse) {
    score += 12;
    reasons.push("VWAP_RECLAIM_ATTEMPT");
    if (subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_VWAP_RETEST_HOLD_LONG";
    }
  }

  if (cvdBullOrImp && greenImpulse) {
    score += 12;
    reasons.push("CVD_BULL_GREEN_IMPULSE");
    if (subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_GREEN_MULTI_CONFIRM_LONG";
    }
  }

  if (s.fundingRate != null && s.fundingRate < -0.001) {
    score += 8;
    reasons.push("NEGATIVE_FUNDING_SQUEEZE_CONTEXT");
    if (subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_SHORT_SQUEEZE_CANDIDATE";
    }
  }

  if (atrActive) {
    score += 5;
    reasons.push("ATR_ACTIVE");
  }

  if (trendLong || dmiBull5m) {
    score += 8;
    reasons.push("TREND_OR_DMI_LONG_BIAS");
    if (subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_RELIEF_BOUNCE_LONG";
    }
  }

  if (
    greenImpulse &&
    cvdBullOrImp &&
    (failedBreakdown || lowerWick) &&
    aboveOrAtVwap
  ) {
    score += 15;
    reasons.push("MULTI_CONFIRM_REVERSAL");
    // Only promote to MULTI_CONFIRM if a more specific bucket hasn't already been assigned
    if (
      subBucket === "TOP_LOSER_UNCLASSIFIED_LONG" ||
      subBucket === "TOP_LOSER_FIRST_GREEN_CANDLE_LONG" ||
      subBucket === "TOP_LOSER_SELLER_EXHAUSTION_LONG"
    ) {
      subBucket = "TOP_LOSER_GREEN_MULTI_CONFIRM_LONG";
    }
  }

  if (
    s.last3TicksDirection === "UP" &&
    (s.rsi1mSlope === "RISING" || s.rsi3mSlope === "RISING")
  ) {
    score += 8;
    reasons.push("TICKS_UP_RSI_RISING");
    if (subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_DUMP_EXHAUSTION_LONG";
    }
  }

  // ── Danger signals ────────────────────────────────────────────────────────

  if (redImpulse) {
    score -= 25;
    warnings.push("IMMEDIATE_RED_IMPULSE_DANGER");
    subBucket = "TOP_LOSER_RED_REACCELERATION_DANGER";
  }

  if (cvdBear) {
    score -= 18;
    warnings.push("CVD_BEAR_DANGER");
    if (!redImpulse) subBucket = "TOP_LOSER_CVD_BEAR_DANGER";
  }

  if (belowVwap && !greenImpulse && !failedBreakdown) {
    score -= 15;
    warnings.push("BELOW_VWAP_NO_REVERSAL_SIGNAL");
    if (score < 0 && subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_DUMP_STILL_HOT";
    }
  }

  if (trendShort && dmiBear5m && entryRank <= 10 && !greenImpulse) {
    score -= 20;
    warnings.push("FALLING_KNIFE_RISK");
    subBucket = "TOP_LOSER_FALLING_KNIFE_DANGER";
  }

  if (s.oiPressureLabel === "PRICE_DOWN_OI_UP") {
    score -= 12;
    warnings.push("OI_UP_PRICE_DOWN_LONG_DANGER");
  }

  if (!spreadOk) {
    score -= 12;
    warnings.push("SPREAD_NOT_CLEAN");
    if (subBucket === "TOP_LOSER_UNCLASSIFIED_LONG") {
      subBucket = "TOP_LOSER_THIN_BOOK_DANGER";
    }
  }

  const clamped = Math.max(-50, Math.min(100, score));

  return {
    longSubBucket:        subBucket,
    topLoserLongSubBucket: subBucket,
    longSetupScore:       clamped,
    topLoserLongScore:    clamped,
    longSetupReasons:     reasons,
    longSetupWarnings:    warnings,
  };
}
