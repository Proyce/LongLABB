// ─── SHORT BUCKET CLASSIFIER ─────────────────────────────────────────────────

export function classifyTopLoserShort(s) {
  const reasons  = [];
  const warnings = [];
  let score      = 0;
  let subBucket  = "TOP_LOSER_UNCLASSIFIED";

  const belowVwap    = s.priceVsVwapLabel === "BELOW_VWAP";
  const aboveOrAtVwap = s.priceVsVwapLabel === "ABOVE_VWAP" || s.priceVsVwapLabel === "AT_VWAP";
  const trendShort   = s.trendCompositeLabel === "TREND_SHORT_BIAS";
  const trendLong    = s.trendCompositeLabel === "TREND_LONG_BIAS";
  const dmiBear5m    = s.dmiBias5m === "BEARISH_DMI";
  const dmiBull5m    = s.dmiBias5m === "BULLISH_DMI";
  const cvdBearOrNeut = s.cvdLabel === "BEAR" || s.cvdLabel === "NEUT";
  const spreadOk     = s.spreadPct == null || s.spreadPct <= 0.05;
  const entryRank    = s.entryRankInBucket ?? s.entryRank ?? 99;

  if (aboveOrAtVwap && (trendLong || dmiBull5m || s.emaSlopeBias5m === "RISING")) {
    subBucket = "TOP_LOSER_BOUNCE_FADE";
    score += 25;
    reasons.push("RECOVERY_CONTEXT");
  }

  if (belowVwap && cvdBearOrNeut && !s.greenImpulseDetected) {
    subBucket = "TOP_LOSER_FRESH_BREAKDOWN";
    score += 15;
    reasons.push("BELOW_VWAP_CVD_NOT_BULL_NO_GREEN_IMPULSE");
  }

  if (belowVwap && trendShort && dmiBear5m && entryRank <= 10) {
    subBucket = "TOP_LOSER_BEARISH_CHASE_TRAP";
    score -= 40;
    warnings.push("BEARISH_CHASE_TRAP");
  }

  if (belowVwap && trendShort && entryRank <= 10 && !dmiBear5m) {
    subBucket = "TOP_LOSER_STILL_DUMPING";
    score += 10;
    reasons.push("BELOW_VWAP_TREND_SHORT_MID_RANK");
  }

  if (s.oiLongLabel === "OI_LONG_CROWDED_SHORTS_POSSIBLE") {
    score -= 25;
    warnings.push("CROWDED_SHORTS_POSSIBLE");
  }

  if (s.advancedShortSetupLabel?.includes("EXTENSION_SHORT_LATE_LOWER_BAND_CHASE")) {
    score -= 25;
    warnings.push("LATE_LOWER_BAND_CHASE");
  }

  if (!spreadOk) {
    score -= 20;
    warnings.push("SPREAD_NOT_CLEAN");
  }

  if (s.redImpulseDetected) {
    warnings.push("RED_IMPULSE_ALREADY_PRINTED");
  }

  return {
    shortSubBucket:       subBucket,
    topLoserSubBucket:    subBucket,
    topLoserSetupScore:   score,
    topLoserWarningFlags: warnings,
    shortSetupScore:      score,
    shortSetupReasons:    reasons,
    shortSetupWarnings:   warnings,
  };
}

export function classifyTopGainerShort(s) {
  const reasons  = [];
  const warnings = [];
  let exhaustionScore      = 0;
  let continuationRiskScore = 0;
  let subBucket            = "TOP_GAINER_UNCLASSIFIED";

  const change24h    = s.change24h ?? 0;
  const strongPump   = change24h >= 10;
  const extremePump  = change24h >= 20;

  const redSignal =
    s.candleColorAtEntry === "RED" ||
    s.redImpulseDetected === true;

  const rejection =
    (s.upperWickPct ?? 0) >= 35 ||
    s.failedBreakout1m === true ||
    s.failedBreakout3m === true;

  const overExtended =
    s.bbExtension1m === "BB_ABOVE_UPPER" ||
    s.kcExtension1m === "KC_ABOVE_UPPER" ||
    s.priceVsVwapLabel === "ABOVE_VWAP";

  const momentumFade =
    s.rsi1mSlope === "FALLING" ||
    s.rsi3mSlope === "FALLING" ||
    s.macdHistogramState1m?.includes("SHRINKING") ||
    s.macdHistogramState3m?.includes("SHRINKING");

  const flowWeak =
    s.cvdLabel !== "BULL" ||
    s.mfiSlope1m === "FALLING" ||
    s.cmfBias1m === "SELL_PRESSURE" ||
    s.obvDivergence1m === "BEARISH_OBV_DIVERGENCE";

  const greenContinuationRisk =
    s.greenImpulseDetected === true ||
    s.cvdLabel === "BULL" ||
    (s.volAccel ?? 0) > 50 ||
    s.dmiBias5m === "BULLISH_DMI" ||
    s.trendCompositeLabel === "TREND_LONG_BIAS";

  if (strongPump) {
    exhaustionScore += 10;
    reasons.push("CHANGE_24H_GT_10");
  }

  if (extremePump) {
    exhaustionScore += 10;
    reasons.push("CHANGE_24H_GT_20");
  }

  if (overExtended) {
    exhaustionScore += 20;
    reasons.push("OVEREXTENDED");
  }

  if (redSignal) {
    exhaustionScore += 20;
    reasons.push("RED_SIGNAL");
  }

  if (rejection) {
    exhaustionScore += 25;
    reasons.push("REJECTION_OR_FAILED_BREAKOUT");
  }

  if (momentumFade) {
    exhaustionScore += 15;
    reasons.push("MOMENTUM_FADE");
  }

  if (flowWeak) {
    exhaustionScore += 10;
    reasons.push("FLOW_NOT_BULLISH");
  }

  if (greenContinuationRisk) {
    continuationRiskScore += 40;
    warnings.push("CONTINUATION_RISK");
  }

  if ((s.spreadPct ?? 0) > 0.05) {
    continuationRiskScore += 15;
    warnings.push("SPREAD_ABOVE_0_05");
  }

  if (s.priceVsVwapLabel === "BELOW_VWAP" && strongPump) {
    subBucket = "TOP_GAINER_VWAP_LOSS_SHORT";
    exhaustionScore += 15;
    reasons.push("VWAP_LOSS_AFTER_PUMP");
  } else if (rejection && overExtended) {
    subBucket = "TOP_GAINER_BLOWOFF_REJECTION_SHORT";
  } else if (s.failedBreakout1m || s.failedBreakout3m) {
    subBucket = "TOP_GAINER_FAILED_BREAKOUT_SHORT";
  } else if (s.oiPressureLabel === "PRICE_FLAT_OI_UP" && momentumFade) {
    subBucket = "TOP_GAINER_LATE_BUYER_TRAP";
  } else if (exhaustionScore >= 50) {
    subBucket = "TOP_GAINER_EXHAUSTION_SHORT";
  } else if (continuationRiskScore >= 40) {
    subBucket = "TOP_GAINER_CONTINUATION_DANGER";
  }

  const finalScore = exhaustionScore - continuationRiskScore;

  return {
    shortSubBucket:                subBucket,
    topGainerSubBucket:            subBucket,
    topGainerExhaustionScore:      exhaustionScore,
    topGainerContinuationRiskScore: continuationRiskScore,
    shortSetupScore:               finalScore,
    topGainerExhaustionReasons:    reasons,
    topGainerContinuationWarnings: warnings,
    shortSetupReasons:             reasons,
    shortSetupWarnings:            warnings,
  };
}

export function classifyShortBucket(sample) {
  if (sample.shortParentBucket === "TOP_LOSER_SHORTS") {
    return classifyTopLoserShort(sample);
  }

  if (sample.shortParentBucket === "TOP_GAINER_SHORTS") {
    return classifyTopGainerShort(sample);
  }

  return {
    shortSubBucket:       "UNKNOWN_SHORT_BUCKET",
    shortSetupScore:      0,
    shortSetupReasons:    [],
    shortSetupWarnings:   ["UNKNOWN_PARENT_BUCKET"],
  };
}
