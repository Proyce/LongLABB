// ─── TOP GAINER EXHAUSTION AUDIT ─────────────────────────────────────────────
// Observer-mode exhaustion labels for Top Gainer Shorts.
// These labels are computed AFTER entry telemetry resolves.
// They do NOT block, skip, rank, resize, or alter live candidate selection.

function classifyTopGainerPumpStrength(s) {
  const c = s.change24h ?? 0;
  if (c >= 100) return "GAINER_PUMP_INSANE_100_PLUS";
  if (c >= 50)  return "GAINER_PUMP_EXTREME_50_TO_100";
  if (c >= 20)  return "GAINER_PUMP_STRONG_20_TO_50";
  if (c >= 10)  return "GAINER_PUMP_MEDIUM_10_TO_20";
  if (c >= 5)   return "GAINER_PUMP_SMALL_5_TO_10";
  return "GAINER_PUMP_UNKNOWN";
}

function classifyTopGainerEntryBatch(s) {
  const rank = s.entryRankInBucket ?? s.entryRank ?? null;
  if (rank == null) return "GAINER_RANK_UNKNOWN";
  if (rank <= 5)  return "GAINER_RANK_1_TO_5_CONTINUATION_RISK";
  if (rank <= 10) return "GAINER_RANK_6_TO_10_EXHAUSTION_WATCH";
  if (rank <= 15) return "GAINER_RANK_11_TO_15_EXHAUSTION_WATCH";
  if (rank <= 20) return "GAINER_RANK_16_TO_20_EXHAUSTION_WATCH";
  if (rank <= 25) return "GAINER_RANK_21_TO_25_EXHAUSTION_WATCH";
  return "GAINER_RANK_UNKNOWN";
}

function computeGainerFlags(s) {
  const hasRedImpulse        = s.redImpulseDetected === true || s.immediateRedImpulse === true;
  const hasFirstRedCandle    = s.candleColorAtEntry === "RED";
  const hasTicksDown         = s.last3TicksDirection === "DOWN";
  const hasRsiRollover       = (s.rsi1mDelta ?? 0) < 0 || (s.rsi3mDelta ?? 0) < 0;
  const hasRsiRolloverStrict = Number.isFinite(s.rsi1mDelta) && Number.isFinite(s.rsiSpread1m3m)
    && s.rsi1mDelta < 0 && s.rsiSpread1m3m < 0;
  const hasFailedBreakout    = s.failedBreakout1m === true || s.failedBreakout3m === true;
  const hasLowerHigh         = s.lowerHighConfirmed1m === true || s.lowerHighConfirmed3m === true;
  const hasVolumeDecel       = (s.volAccel ?? 0) < 0 || s.mfiSlope1m === "FALLING" || s.obvSlope1m === "FALLING";
  const hasGreenImpulse      = s.greenImpulseDetected === true || s.immediateGreenImpulse === true;
  const hasHtfRsiFalling     = (s.rsi15mDelta ?? 0) < 0 || (s.rsi30mDelta ?? 0) < 0;
  const macdShrinking        = typeof s.macdHistogramState1m === "string"
    && (s.macdHistogramState1m.includes("SHRINKING") || s.macdHistogramState1m.includes("NEGATIVE"));
  return {
    hasRedImpulse, hasFirstRedCandle, hasTicksDown, hasRsiRollover, hasRsiRolloverStrict,
    hasFailedBreakout, hasLowerHigh, hasVolumeDecel, hasGreenImpulse, hasHtfRsiFalling, macdShrinking,
  };
}

function classifyTopGainerPumpPhase(s, f) {
  const trendLong = s.trendCompositeLabel === "TREND_LONG_BIAS";
  const cvdBull   = s.cvdLabel === "BULL";
  const belowVwap = s.priceVsVwapLabel === "BELOW_VWAP";
  if ((trendLong || cvdBull) && f.hasGreenImpulse)      return "GAINER_PUMP_STILL_HOT";
  if (belowVwap && f.hasLowerHigh)                       return "GAINER_PUMP_ROLLOVER_STARTING";
  if (f.hasRsiRolloverStrict && !cvdBull && !trendLong)  return "GAINER_PUMP_EXHAUSTION_CONFIRMED";
  if (belowVwap && s.candleColorAtEntry === "RED")       return "GAINER_PUMP_DEAD_CAT_FADE";
  if (f.hasFailedBreakout && !f.hasGreenImpulse)         return "GAINER_PUMP_ROLLOVER_STARTING";
  if (trendLong && (s.rsi1mDelta ?? 0) > 0)             return "GAINER_PUMP_CONTINUATION_DANGER";
  return "GAINER_PUMP_PHASE_UNKNOWN";
}

function classifyTopGainerMicroExhaustion(s, f) {
  const confirms = [f.hasRedImpulse, f.hasTicksDown, f.hasRsiRollover, f.hasFailedBreakout, f.hasLowerHigh]
    .filter(Boolean).length;
  if (confirms >= 3)      return "GAINER_MICRO_MULTI_CONFIRM";
  if (f.hasRedImpulse)    return "GAINER_MICRO_RED_IMPULSE";
  if (f.hasFirstRedCandle) return "GAINER_MICRO_FIRST_RED_CANDLE";
  if (f.hasTicksDown)     return "GAINER_MICRO_TICKS_DOWN";
  if (f.hasRsiRollover)   return "GAINER_MICRO_RSI_ROLLOVER";
  if (f.hasFailedBreakout) return "GAINER_MICRO_FAILED_BREAKOUT";
  if (f.hasLowerHigh)     return "GAINER_MICRO_LOWER_HIGH";
  if (f.hasVolumeDecel)   return "GAINER_MICRO_VOLUME_DECELERATION";
  return "GAINER_MICRO_NO_EXHAUSTION_CONFIRMATION";
}

function computeTopGainerContinuationPressureScore(s) {
  let score = 0;
  const rank = s.entryRankInBucket ?? s.entryRank ?? 99;
  if (s.greenImpulseDetected === true)           score += 20;
  if (s.immediateGreenImpulse === true)          score += 20;
  if (s.cvdLabel === "BULL")                     score += 30;
  if (s.trendCompositeLabel === "TREND_LONG_BIAS") score += 20;
  if ((s.volAccel ?? 0) > 50)                    score += 15;
  if ((s.rsi1mDelta ?? 0) > 1)                   score += 10;
  if (s.emaStack1m === "BULL")                   score += 10;
  if (s.btcRegime === "BTC_STRONG_UP")           score += 25;
  if (rank <= 5)                                 score += 15;
  return score;
}

function classifyTopGainerContinuationPressure(score) {
  if (score >= 80) return "GAINER_CONTINUATION_EXTREME";
  if (score >= 50) return "GAINER_CONTINUATION_HIGH";
  if (score >= 25) return "GAINER_CONTINUATION_MODERATE";
  return "GAINER_CONTINUATION_LOW";
}

function classifyTopGainerVwapContext(s, f) {
  const above = s.priceVsVwapLabel === "ABOVE_VWAP";
  const below = s.priceVsVwapLabel === "BELOW_VWAP";
  if (above && s.greenImpulseDetected === true && !f.hasRedImpulse) return "GAINER_ABOVE_VWAP_CONTINUATION_DANGER";
  if (above && (f.hasRedImpulse || s.failedBreakout1m === true))    return "GAINER_ABOVE_VWAP_HOT_FADE";
  if (below && (f.hasRedImpulse || s.candleColorAtEntry === "RED")) return "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION";
  if (below && (s.greenImpulseDetected === true || s.cvdLabel === "BULL")) return "GAINER_VWAP_LOSS_BUT_STILL_BULLISH";
  if (below) return "GAINER_BELOW_VWAP_CLASSIC_FADE";
  return "GAINER_VWAP_NEUTRAL";
}

function classifyTopGainerRsiContext(s, f) {
  const hotPumpFadeSignal = s.trendCompositeLabel === "TREND_LONG_BIAS"
    && (f.hasVolumeDecel || f.hasHtfRsiFalling || f.macdShrinking);
  if (s.rsiCompositeLabel === "RSI_LONG_BIAS" && f.hasHtfRsiFalling)    return "GAINER_HTF_RSI_EXTREME_FALLING";
  if (s.rsiCompositeLabel === "RSI_LONG_BIAS" && hotPumpFadeSignal)      return "GAINER_RSI_LONG_BIAS_STILL_PROFITABLE_WATCH";
  if (s.rsiCompositeLabel === "RSI_LONG_BIAS")                           return "GAINER_RSI_LONG_BIAS_CONTINUATION_DANGER";
  if ((s.rsi1mDelta ?? 0) > 0 && (s.rsi3mDelta ?? 0) > 0)               return "GAINER_RSI_1M_RISING_DANGER";
  if ((s.rsi1mDelta ?? 0) < 0 && (s.rsi3mDelta ?? 0) < 0 && (s.rsi5mDelta ?? 0) < 0) return "GAINER_RSI_MULTI_TF_ROLLOVER";
  if (s.rsiCompositeLabel === "RSI_SHORT_BIAS")                          return "GAINER_RSI_SHORT_BIAS_EXHAUSTION";
  return "GAINER_RSI_NEUTRAL";
}

function classifyTopGainerTrendContext(s, f) {
  const trendLong        = s.trendCompositeLabel === "TREND_LONG_BIAS";
  const hotPumpFadeSignal = f.hasVolumeDecel || f.hasHtfRsiFalling || f.macdShrinking;
  if (trendLong && s.emaSlopeBias1m === "RISING" && (s.priceVsEma9_1mPct ?? 0) > 0) return "GAINER_EMA_ABOVE_RISING_DANGER";
  if (trendLong && hotPumpFadeSignal)                       return "GAINER_TREND_LONG_BIAS_HOT_FADE_WATCH";
  if (trendLong)                                            return "GAINER_TREND_LONG_BIAS_CONTINUATION_DANGER";
  if (f.macdShrinking)                                      return "GAINER_MACD_ROLLOVER";
  if (s.dmiBias1m === "BULLISH_DMI" || s.dmiBias3m === "BULLISH_DMI") return "GAINER_DMI_BULLISH_DANGER";
  if (s.trendCompositeLabel === "TREND_SHORT_BIAS")         return "GAINER_TREND_SHORT_BIAS_EXHAUSTION";
  return "GAINER_TREND_NEUTRAL";
}

function classifyTopGainerVolumeFlow(s) {
  const cvdBull     = s.cvdLabel === "BULL";
  const buyFlow     = s.volumeFlowBias1m === "BUY_PRESSURE";
  const cmfBuy      = s.cmfBias1m === "BUY_PRESSURE";
  const sellPressure = s.cmfBias1m === "SELL_PRESSURE";
  const bearishObv  = s.obvDivergence1m === "BEARISH_OBV_DIVERGENCE";
  const volDecel    = (s.volAccel ?? 0) < 20;
  if (cvdBull && buyFlow && cmfBuy)   return "GAINER_FLOW_BUY_PRESSURE_DANGER";
  if (cvdBull)                        return "GAINER_FLOW_CVD_BULLISH_DANGER";
  if (sellPressure && bearishObv)     return "GAINER_FLOW_DISTRIBUTION";
  if (sellPressure || bearishObv)     return "GAINER_FLOW_SELL_PRESSURE";
  if (!cvdBull && volDecel)           return "GAINER_FLOW_VOLUME_DECELERATION";
  if (!cvdBull)                       return "GAINER_FLOW_CVD_NOT_BULLISH";
  return "GAINER_FLOW_NEUTRAL";
}

function classifyTopGainerStructure(s) {
  if (s.failedBreakout1m === true || s.failedBreakout3m === true) return "GAINER_STRUCTURE_FAILED_BREAKOUT";
  if (s.lowerHighConfirmed1m === true && s.lowerHighConfirmed3m === true) return "GAINER_STRUCTURE_LOWER_HIGH";
  if (s.lowerLowConfirmed1m === true || s.lowerLowConfirmed3m === true) return "GAINER_STRUCTURE_LOWER_LOW";
  const htfUptrend = (s.rsi15m ?? 0) > 60 && (s.rsi1h ?? 0) > 55 && s.trendCompositeLabel === "TREND_LONG_BIAS";
  if (htfUptrend) return "GAINER_STRUCTURE_UPTREND_DANGER";
  if (s.structure1m === "CHOP" || s.structure3m === "CHOP") return "GAINER_STRUCTURE_CHOP_FADE";
  return "GAINER_STRUCTURE_UNKNOWN";
}

function classifyTopGainerBtcContext(s) {
  switch (s.btcRegime) {
    case "BTC_STRONG_UP":   return "GAINER_BTC_STRONG_UP_CONTINUATION_DANGER";
    case "BTC_CHOP":        return "GAINER_BTC_CHOP_OK";
    case "BTC_WEAK_DOWN":   return "GAINER_BTC_WEAK_DOWN_EXHAUSTION_TAILWIND";
    case "BTC_STRONG_DOWN": return "GAINER_BTC_STRONG_DOWN_MARKET_RISK";
    case "BTC_MIXED":       return "GAINER_BTC_MIXED_CONDITIONAL";
    default:                return "GAINER_BTC_UNKNOWN";
  }
}

function computeTopGainerExhaustionQualityScore(s, f) {
  let score = s.topGainerExhaustionScore ?? 0;
  if (f.hasRedImpulse)              score += 15;
  if (f.hasRsiRolloverStrict)       score += 10;
  if (s.failedBreakout1m === true)  score += 15;
  if (s.lowerHighConfirmed1m === true) score += 10;
  if (s.priceVsVwapLabel === "BELOW_VWAP") score += 15;
  if (f.macdShrinking)              score += 10;
  return score;
}

function computeTopGainerContinuationDangerScore(s, f) {
  let risk = s.topGainerContinuationRiskScore ?? 0;
  if (s.immediateGreenImpulse === true)          risk += 20;
  if (s.cvdLabel === "BULL")                     risk += 15;
  if (s.trendCompositeLabel === "TREND_LONG_BIAS") risk += 10;
  if (s.btcRegime === "BTC_STRONG_UP")           risk += 25;
  return risk;
}

function classifyTopGainerThesisLane(s, f, { contPressureLabel, exhaustionQualityScore }) {
  const rank                    = s.entryRankInBucket ?? s.entryRank ?? 99;
  const hotPumpFadeSignal       = s.trendCompositeLabel === "TREND_LONG_BIAS"
    && (f.hasVolumeDecel || f.hasHtfRsiFalling || f.macdShrinking);
  const hasExhaustionConfirm    = f.hasRedImpulse || f.hasRsiRolloverStrict || f.hasFailedBreakout;

  if (s.btcRegime === "BTC_STRONG_UP") return "TOP_GAINER_CONTINUATION_DANGER";
  if (contPressureLabel === "GAINER_CONTINUATION_EXTREME" && !hasExhaustionConfirm) return "TOP_GAINER_CONTINUATION_DANGER";
  if ((f.hasRedImpulse || f.hasFirstRedCandle) && f.hasRsiRolloverStrict && s.cvdLabel !== "BULL") return "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT";
  if (hotPumpFadeSignal) return "TOP_GAINER_HOT_PUMP_FADE_SHORT";
  if (s.priceVsVwapLabel === "BELOW_VWAP" && (f.hasRedImpulse || f.hasRsiRolloverStrict)) return "TOP_GAINER_VWAP_LOSS_SHORT";
  if (f.hasFailedBreakout) return "TOP_GAINER_FAILED_BREAKOUT_SHORT";
  if (rank >= 6 && rank <= 20 && exhaustionQualityScore >= 40) return "TOP_GAINER_RANK_MID_EXHAUSTION_SHORT";
  if (hasExhaustionConfirm && (s.spreadPct ?? 1) <= 0.03 && exhaustionQualityScore >= 60) return "TOP_GAINER_LOCKED_RUNNER_SHORT";
  return "TOP_GAINER_UNCLASSIFIED";
}

function buildTopGainerQualityWarnings(s, f, hasGainerExhaustionConfirmation) {
  const warnings = [];
  const rank      = s.entryRankInBucket ?? s.entryRank ?? 99;
  const entryGrade = s.entryTimingGrade ?? s.entryTiming?.entryTimingGrade ?? null;

  if (entryGrade === "F")                                         warnings.push("TOP_GAINER_ENTRY_GRADE_F_DANGER");
  if (s.candleColorAtEntry === "GREEN")                           warnings.push("TOP_GAINER_GREEN_CANDLE_DANGER");
  if (s.rsiCompositeLabel === "RSI_LONG_BIAS")                    warnings.push("TOP_GAINER_RSI_LONG_BIAS_DANGER");
  if (s.trendCompositeLabel === "TREND_LONG_BIAS")                warnings.push("TOP_GAINER_TREND_LONG_BIAS_DANGER");
  if (s.dmiBias1m === "BULLISH_DMI" || s.dmiBias3m === "BULLISH_DMI") warnings.push("TOP_GAINER_DMI_BULLISH_DANGER");
  if (typeof s.macdHistogramState1m === "string"
    && s.macdHistogramState1m.includes("POSITIVE") && s.macdHistogramState1m.includes("EXPANDING")) {
    warnings.push("TOP_GAINER_MACD_BULLISH_EXPANSION_DANGER");
  }
  if (s.cvdLabel === "BULL")                                      warnings.push("TOP_GAINER_CVD_BULLISH_DANGER");
  if (s.volumeFlowBias1m === "BUY_PRESSURE")                      warnings.push("TOP_GAINER_BUY_FLOW_DANGER");
  if (rank <= 5)                                                  warnings.push("TOP_GAINER_RANK_1_TO_5_CONTINUATION_RISK");
  if (s.priceVsVwapLabel === "BELOW_VWAP" && !f.hasRedImpulse && !f.hasRsiRolloverStrict) {
    warnings.push("TOP_GAINER_VWAP_LOSS_NOT_ENOUGH_WARNING");
  }
  if (!hasGainerExhaustionConfirmation)                          warnings.push("TOP_GAINER_NO_EXHAUSTION_CONFIRMATION");
  if ((s.leverage ?? 0) >= 20)                                   warnings.push("TOP_GAINER_20X_EXECUTION_FRAGILITY");
  if ((s.spreadPct ?? 0) > 0.05)                                 warnings.push("TOP_GAINER_WIDE_SPREAD_DANGER");
  if (s.liquidationPressureSourceAvailable === false)            warnings.push("TOP_GAINER_UNKNOWN_LIQUIDATION_DATA");

  return warnings;
}

export function evaluateTopGainerExhaustionAudit(s) {
  const f = computeGainerFlags(s);

  const topGainerPumpStrengthLabel         = classifyTopGainerPumpStrength(s);
  const topGainerEntryBatchLabel           = classifyTopGainerEntryBatch(s);
  const topGainerPumpPhaseLabel            = classifyTopGainerPumpPhase(s, f);
  const topGainerMicroExhaustionLabel      = classifyTopGainerMicroExhaustion(s, f);
  const contPressureScore                  = computeTopGainerContinuationPressureScore(s);
  const topGainerContinuationPressureLabel = classifyTopGainerContinuationPressure(contPressureScore);
  const topGainerVwapContextLabel          = classifyTopGainerVwapContext(s, f);
  const topGainerRsiContextLabel           = classifyTopGainerRsiContext(s, f);
  const topGainerTrendContextLabel         = classifyTopGainerTrendContext(s, f);
  const topGainerVolumeFlowContextLabel    = classifyTopGainerVolumeFlow(s);
  const topGainerStructureContextLabel     = classifyTopGainerStructure(s);
  const topGainerBtcContextLabel           = classifyTopGainerBtcContext(s);

  const topGainerExhaustionQualityScore    = computeTopGainerExhaustionQualityScore(s, f);
  const topGainerContinuationDangerScore   = computeTopGainerContinuationDangerScore(s, f);
  const topGainerNetExhaustionScore        = topGainerExhaustionQualityScore - topGainerContinuationDangerScore;

  const topGainerThesisLaneLabel = classifyTopGainerThesisLane(s, f, {
    contPressureLabel:    topGainerContinuationPressureLabel,
    exhaustionQualityScore: topGainerExhaustionQualityScore,
  });

  const hasGainerExhaustionConfirmation = f.hasRedImpulse || f.hasRsiRolloverStrict || f.hasFailedBreakout;
  const hasGainerContinuationDanger     = (s.cvdLabel === "BULL" && f.hasGreenImpulse) || s.trendCompositeLabel === "TREND_LONG_BIAS";
  const hasGainerRedRejection           = f.hasRedImpulse || s.candleColorAtEntry === "RED";
  const hasGainerRsiRollover            = f.hasRsiRolloverStrict;
  const hasGainerTrendRollover          = s.emaSlopeBias1m === "FALLING" || s.lowerHighConfirmed1m === true;
  const hasGainerVolumeFade             = s.cvdLabel !== "BULL"
    && (s.cmfBias1m === "SELL_PRESSURE" || s.obvDivergence1m === "BEARISH_OBV_DIVERGENCE");
  const hasGainerFailedBreakout         = f.hasFailedBreakout;
  const hasGainerLowerHigh              = f.hasLowerHigh;
  const hasGainerVwapLoss               = s.priceVsVwapLabel === "BELOW_VWAP";

  const topGainerQualityWarningLabels = [
    ...new Set(buildTopGainerQualityWarnings(s, f, hasGainerExhaustionConfirmation)),
  ];

  const topGainerWouldPassExhaustionAudit =
    topGainerExhaustionQualityScore >= 60 &&
    topGainerContinuationDangerScore <= 35 &&
    hasGainerExhaustionConfirmation;

  const auditFailReasons = [];
  if (topGainerExhaustionQualityScore < 60)  auditFailReasons.push("LOW_EXHAUSTION_SCORE");
  if (topGainerContinuationDangerScore > 35) auditFailReasons.push("HIGH_CONTINUATION_DANGER");
  if (!hasGainerExhaustionConfirmation)      auditFailReasons.push("NO_EXHAUSTION_CONFIRMATION");

  const topGainerExhaustionAuditLabel = topGainerWouldPassExhaustionAudit
    ? "WOULD_PASS_EXHAUSTION_AUDIT"
    : auditFailReasons.length > 1
      ? "WOULD_FAIL_MULTIPLE_REASONS"
      : auditFailReasons.length === 1
        ? `WOULD_FAIL_${auditFailReasons[0]}`
        : "WOULD_FAIL_UNKNOWN";

  return {
    topGainerPumpStrengthLabel,
    topGainerEntryBatchLabel,
    topGainerPumpPhaseLabel,
    topGainerMicroExhaustionLabel,
    topGainerContinuationPressureLabel,
    topGainerVwapContextLabel,
    topGainerRsiContextLabel,
    topGainerTrendContextLabel,
    topGainerVolumeFlowContextLabel,
    topGainerStructureContextLabel,
    topGainerBtcContextLabel,
    topGainerThesisLaneLabel,
    topGainerQualityWarningLabels,
    topGainerExhaustionQualityScore,
    topGainerContinuationDangerScore,
    topGainerNetExhaustionScore,
    topGainerExhaustionAuditScore: topGainerNetExhaustionScore,
    topGainerWouldPassExhaustionAudit,
    topGainerExhaustionAuditLabel,
    topGainerAuditFailReasons: auditFailReasons,
    hasGainerExhaustionConfirmation,
    hasGainerContinuationDanger,
    hasGainerRedRejection,
    hasGainerRsiRollover,
    hasGainerTrendRollover,
    hasGainerVolumeFade,
    hasGainerFailedBreakout,
    hasGainerLowerHigh,
    hasGainerVwapLoss,
  };
}
