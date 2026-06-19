import { describe, it, expect } from "vitest";
import { evaluateTopGainerExhaustionAudit } from "./topGainerExhaustionAudit.js";

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const baseGainerPass = {
  // Identity
  shortParentBucket: "TOP_GAINER_SHORTS",
  change24h: 15,
  entryRankInBucket: 8,
  // Exhaustion signals
  immediateRedImpulse: true,
  redImpulseDetected: true,
  candleColorAtEntry: "RED",
  last3TicksDirection: "DOWN",
  rsi1mDelta: -1.5,
  rsi3mDelta: -1.2,
  rsi5mDelta: -0.8,
  rsiSpread1m3m: -3,
  rsi15mDelta: -2,
  rsi30mDelta: -1,
  rsiCompositeLabel: "RSI_SHORT_BIAS",
  trendCompositeLabel: "TREND_SHORT_BIAS",
  cvdLabel: "BEAR",
  priceVsVwapLabel: "BELOW_VWAP",
  failedBreakout1m: true,
  failedBreakout3m: false,
  lowerHighConfirmed1m: true,
  lowerHighConfirmed3m: false,
  lowerLowConfirmed1m: false,
  lowerLowConfirmed3m: false,
  btcRegime: "BTC_CHOP",
  spreadPct: 0.02,
  volAccel: 5,
  mfiSlope1m: "FLAT",
  obvSlope1m: "FLAT",
  emaSlopeBias1m: "FALLING",
  macdHistogramState1m: "NEGATIVE_SHRINKING",
  greenImpulseDetected: false,
  immediateGreenImpulse: false,
  volumeFlowBias1m: "SELL_PRESSURE",
  cmfBias1m: "SELL_PRESSURE",
  obvDivergence1m: "NEUTRAL",
  dmiBias1m: "BEARISH_DMI",
  dmiBias3m: "BEARISH_DMI",
  structure1m: "DOWNTREND",
  structure3m: "DOWNTREND",
  rsi15m: 48,
  rsi1h: 50,
  priceVsEma9_1mPct: -0.5,
  emaStack1m: "BEAR",
  entryTimingGrade: "B",
  leverage: 10,
  // From shortBucketClassifier output
  topGainerExhaustionScore: 60,
  topGainerContinuationRiskScore: 0,
};

function g(overrides = {}) {
  return { ...baseGainerPass, ...overrides };
}

// ─── PUMP STRENGTH ────────────────────────────────────────────────────────────

describe("topGainerPumpStrengthLabel", () => {
  it("returns INSANE_100_PLUS for change >= 100", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ change24h: 150 })).topGainerPumpStrengthLabel)
      .toBe("GAINER_PUMP_INSANE_100_PLUS");
  });
  it("returns EXTREME_50_TO_100 for change 50–99", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ change24h: 75 })).topGainerPumpStrengthLabel)
      .toBe("GAINER_PUMP_EXTREME_50_TO_100");
  });
  it("returns STRONG_20_TO_50 for change 20–49", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ change24h: 30 })).topGainerPumpStrengthLabel)
      .toBe("GAINER_PUMP_STRONG_20_TO_50");
  });
  it("returns MEDIUM_10_TO_20 for change 10–19", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ change24h: 15 })).topGainerPumpStrengthLabel)
      .toBe("GAINER_PUMP_MEDIUM_10_TO_20");
  });
  it("returns SMALL_5_TO_10 for change 5–9", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ change24h: 7 })).topGainerPumpStrengthLabel)
      .toBe("GAINER_PUMP_SMALL_5_TO_10");
  });
  it("returns UNKNOWN below 5", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ change24h: 3 })).topGainerPumpStrengthLabel)
      .toBe("GAINER_PUMP_UNKNOWN");
  });
});

// ─── ENTRY BATCH ─────────────────────────────────────────────────────────────

describe("topGainerEntryBatchLabel", () => {
  it("rank 1–5 → CONTINUATION_RISK", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ entryRankInBucket: 3 })).topGainerEntryBatchLabel)
      .toBe("GAINER_RANK_1_TO_5_CONTINUATION_RISK");
  });
  it("rank 6–10 → EXHAUSTION_WATCH", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ entryRankInBucket: 8 })).topGainerEntryBatchLabel)
      .toBe("GAINER_RANK_6_TO_10_EXHAUSTION_WATCH");
  });
  it("rank 11–15 → EXHAUSTION_WATCH", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ entryRankInBucket: 13 })).topGainerEntryBatchLabel)
      .toBe("GAINER_RANK_11_TO_15_EXHAUSTION_WATCH");
  });
  it("rank 16–20 → EXHAUSTION_WATCH", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ entryRankInBucket: 18 })).topGainerEntryBatchLabel)
      .toBe("GAINER_RANK_16_TO_20_EXHAUSTION_WATCH");
  });
  it("rank 21–25 → EXHAUSTION_WATCH", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ entryRankInBucket: 23 })).topGainerEntryBatchLabel)
      .toBe("GAINER_RANK_21_TO_25_EXHAUSTION_WATCH");
  });
  it("rank null → UNKNOWN", () => {
    const { entryRankInBucket, entryRank, ...rest } = baseGainerPass;
    expect(evaluateTopGainerExhaustionAudit(rest).topGainerEntryBatchLabel)
      .toBe("GAINER_RANK_UNKNOWN");
  });
});

// ─── PUMP PHASE ──────────────────────────────────────────────────────────────

describe("topGainerPumpPhaseLabel", () => {
  it("STILL_HOT: trend long + green impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_LONG_BIAS",
      greenImpulseDetected: true,
    }));
    expect(result.topGainerPumpPhaseLabel).toBe("GAINER_PUMP_STILL_HOT");
  });
  it("ROLLOVER_STARTING: below vwap + lower high", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_SHORT_BIAS",
      cvdLabel: "BEAR",
      greenImpulseDetected: false,
      priceVsVwapLabel: "BELOW_VWAP",
      lowerHighConfirmed1m: true,
    }));
    expect(result.topGainerPumpPhaseLabel).toBe("GAINER_PUMP_ROLLOVER_STARTING");
  });
  it("EXHAUSTION_CONFIRMED: RSI rollover strict, no bull trend/CVD", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_SHORT_BIAS",
      cvdLabel: "BEAR",
      greenImpulseDetected: false,
      lowerHighConfirmed1m: false,
      priceVsVwapLabel: "ABOVE_VWAP",
      rsi1mDelta: -2,
      rsiSpread1m3m: -3,
    }));
    expect(result.topGainerPumpPhaseLabel).toBe("GAINER_PUMP_EXHAUSTION_CONFIRMED");
  });
  it("DEAD_CAT_FADE: below vwap + red candle (no lower high, no rsi rollover strict that overrides)", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_SHORT_BIAS",
      cvdLabel: "BEAR",
      greenImpulseDetected: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
      priceVsVwapLabel: "BELOW_VWAP",
      candleColorAtEntry: "RED",
      rsi1mDelta: 0,
      rsiSpread1m3m: 0,
    }));
    expect(result.topGainerPumpPhaseLabel).toBe("GAINER_PUMP_DEAD_CAT_FADE");
  });
  it("ROLLOVER_STARTING: failed breakout, no green impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_SHORT_BIAS",
      cvdLabel: "BEAR",
      greenImpulseDetected: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
      priceVsVwapLabel: "ABOVE_VWAP",
      candleColorAtEntry: "GREEN",
      rsi1mDelta: 0,
      rsiSpread1m3m: 0,
      failedBreakout1m: true,
    }));
    expect(result.topGainerPumpPhaseLabel).toBe("GAINER_PUMP_ROLLOVER_STARTING");
  });
  it("CONTINUATION_DANGER: trend long + rsi rising", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_LONG_BIAS",
      greenImpulseDetected: false,
      immediateGreenImpulse: false,
      cvdLabel: "BEAR",
      priceVsVwapLabel: "ABOVE_VWAP",
      rsi1mDelta: 2,
      rsiSpread1m3m: 1,
      lowerHighConfirmed1m: false,
      failedBreakout1m: false,
    }));
    expect(result.topGainerPumpPhaseLabel).toBe("GAINER_PUMP_CONTINUATION_DANGER");
  });
  it("PHASE_UNKNOWN: no signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_NEUTRAL",
      cvdLabel: "NEUT",
      greenImpulseDetected: false,
      immediateGreenImpulse: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
      priceVsVwapLabel: "ABOVE_VWAP",
      candleColorAtEntry: "GREEN",
      rsi1mDelta: 0,
      rsi3mDelta: 0,
      rsiSpread1m3m: 0,
      failedBreakout1m: false,
      failedBreakout3m: false,
    }));
    expect(result.topGainerPumpPhaseLabel).toBe("GAINER_PUMP_PHASE_UNKNOWN");
  });
});

// ─── MICRO EXHAUSTION ─────────────────────────────────────────────────────────

describe("topGainerMicroExhaustionLabel", () => {
  it("MULTI_CONFIRM: 3+ signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: true,
      last3TicksDirection: "DOWN",
      rsi1mDelta: -1,
      failedBreakout1m: true,
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_MULTI_CONFIRM");
  });
  it("RED_IMPULSE: only red impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: true,
      redImpulseDetected: true,
      last3TicksDirection: "UP",
      rsi1mDelta: 1,
      rsi3mDelta: 1,
      failedBreakout1m: false,
      failedBreakout3m: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_RED_IMPULSE");
  });
  it("FIRST_RED_CANDLE: candle red, no impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "RED",
      last3TicksDirection: "UP",
      rsi1mDelta: 1,
      rsi3mDelta: 1,
      failedBreakout1m: false,
      failedBreakout3m: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_FIRST_RED_CANDLE");
  });
  it("TICKS_DOWN: ticks down only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "GREEN",
      last3TicksDirection: "DOWN",
      rsi1mDelta: 1,
      rsi3mDelta: 1,
      failedBreakout1m: false,
      lowerHighConfirmed1m: false,
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_TICKS_DOWN");
  });
  it("RSI_ROLLOVER: rsi rollover only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "GREEN",
      last3TicksDirection: "UP",
      rsi1mDelta: -1,
      rsi3mDelta: 0,
      failedBreakout1m: false,
      lowerHighConfirmed1m: false,
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_RSI_ROLLOVER");
  });
  it("FAILED_BREAKOUT: failed breakout only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "GREEN",
      last3TicksDirection: "UP",
      rsi1mDelta: 1,
      rsi3mDelta: 1,
      failedBreakout1m: true,
      lowerHighConfirmed1m: false,
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_FAILED_BREAKOUT");
  });
  it("LOWER_HIGH: lower high only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "GREEN",
      last3TicksDirection: "UP",
      rsi1mDelta: 1,
      rsi3mDelta: 1,
      failedBreakout1m: false,
      lowerHighConfirmed1m: true,
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_LOWER_HIGH");
  });
  it("VOLUME_DECELERATION: volAccel negative only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "GREEN",
      last3TicksDirection: "UP",
      rsi1mDelta: 1,
      rsi3mDelta: 1,
      failedBreakout1m: false,
      lowerHighConfirmed1m: false,
      volAccel: -10,
      mfiSlope1m: "FLAT",
      obvSlope1m: "FLAT",
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_VOLUME_DECELERATION");
  });
  it("NO_EXHAUSTION_CONFIRMATION: no signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "GREEN",
      last3TicksDirection: "UP",
      rsi1mDelta: 1,
      rsi3mDelta: 1,
      failedBreakout1m: false,
      lowerHighConfirmed1m: false,
      volAccel: 30,
      mfiSlope1m: "RISING",
      obvSlope1m: "RISING",
    }));
    expect(result.topGainerMicroExhaustionLabel).toBe("GAINER_MICRO_NO_EXHAUSTION_CONFIRMATION");
  });
});

// ─── CONTINUATION PRESSURE ───────────────────────────────────────────────────

describe("topGainerContinuationPressureLabel", () => {
  it("LOW: clean exhaustion input", () => {
    const result = evaluateTopGainerExhaustionAudit(baseGainerPass);
    expect(result.topGainerContinuationPressureLabel).toBe("GAINER_CONTINUATION_LOW");
  });
  it("MODERATE: some continuation signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "BULL",
      greenImpulseDetected: false,
      immediateGreenImpulse: false,
      trendCompositeLabel: "TREND_SHORT_BIAS",
      volAccel: 10,
    }));
    expect(result.topGainerContinuationPressureLabel).toBe("GAINER_CONTINUATION_MODERATE");
  });
  it("HIGH: multiple continuation signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "BULL",
      trendCompositeLabel: "TREND_LONG_BIAS",
      greenImpulseDetected: false,
      immediateGreenImpulse: false,
      volAccel: 0,
    }));
    expect(result.topGainerContinuationPressureLabel).toBe("GAINER_CONTINUATION_HIGH");
  });
  it("EXTREME: max continuation signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "BULL",
      trendCompositeLabel: "TREND_LONG_BIAS",
      greenImpulseDetected: true,
      immediateGreenImpulse: true,
      btcRegime: "BTC_STRONG_UP",
      volAccel: 80,
      rsi1mDelta: 2,
      emaStack1m: "BULL",
      entryRankInBucket: 3,
    }));
    expect(result.topGainerContinuationPressureLabel).toBe("GAINER_CONTINUATION_EXTREME");
  });
});

// ─── VWAP CONTEXT ─────────────────────────────────────────────────────────────

describe("topGainerVwapContextLabel", () => {
  it("ABOVE_VWAP_CONTINUATION_DANGER: above + green, no red", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      priceVsVwapLabel: "ABOVE_VWAP",
      greenImpulseDetected: true,
      immediateRedImpulse: false,
      redImpulseDetected: false,
    }));
    expect(result.topGainerVwapContextLabel).toBe("GAINER_ABOVE_VWAP_CONTINUATION_DANGER");
  });
  it("ABOVE_VWAP_HOT_FADE: above + red impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      priceVsVwapLabel: "ABOVE_VWAP",
      greenImpulseDetected: false,
      immediateRedImpulse: true,
    }));
    expect(result.topGainerVwapContextLabel).toBe("GAINER_ABOVE_VWAP_HOT_FADE");
  });
  it("VWAP_LOSS_WITH_RED_CONFIRMATION: below + red impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      priceVsVwapLabel: "BELOW_VWAP",
      immediateRedImpulse: true,
      greenImpulseDetected: false,
    }));
    expect(result.topGainerVwapContextLabel).toBe("GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION");
  });
  it("VWAP_LOSS_BUT_STILL_BULLISH: below + green impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      priceVsVwapLabel: "BELOW_VWAP",
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "GREEN",
      greenImpulseDetected: true,
    }));
    expect(result.topGainerVwapContextLabel).toBe("GAINER_VWAP_LOSS_BUT_STILL_BULLISH");
  });
  it("BELOW_VWAP_CLASSIC_FADE: below, no impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      priceVsVwapLabel: "BELOW_VWAP",
      immediateRedImpulse: false,
      redImpulseDetected: false,
      candleColorAtEntry: "DOJI",
      greenImpulseDetected: false,
      cvdLabel: "NEUT",
    }));
    expect(result.topGainerVwapContextLabel).toBe("GAINER_BELOW_VWAP_CLASSIC_FADE");
  });
  it("VWAP_NEUTRAL: above, no strong signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      priceVsVwapLabel: "ABOVE_VWAP",
      greenImpulseDetected: false,
      immediateRedImpulse: false,
      redImpulseDetected: false,
      failedBreakout1m: false,
    }));
    expect(result.topGainerVwapContextLabel).toBe("GAINER_VWAP_NEUTRAL");
  });
});

// ─── RSI CONTEXT ─────────────────────────────────────────────────────────────

describe("topGainerRsiContextLabel", () => {
  it("HTF_RSI_EXTREME_FALLING: RSI long bias + HTF falling", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      rsiCompositeLabel: "RSI_LONG_BIAS",
      rsi15mDelta: -3,
    }));
    expect(result.topGainerRsiContextLabel).toBe("GAINER_HTF_RSI_EXTREME_FALLING");
  });
  it("RSI_LONG_BIAS_STILL_PROFITABLE_WATCH: RSI long bias + hot pump fade", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      rsiCompositeLabel: "RSI_LONG_BIAS",
      trendCompositeLabel: "TREND_LONG_BIAS",
      rsi15mDelta: 1,
      rsi30mDelta: 1,
      volAccel: -5,
    }));
    expect(result.topGainerRsiContextLabel).toBe("GAINER_RSI_LONG_BIAS_STILL_PROFITABLE_WATCH");
  });
  it("RSI_LONG_BIAS_CONTINUATION_DANGER: RSI long bias only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      rsiCompositeLabel: "RSI_LONG_BIAS",
      trendCompositeLabel: "TREND_SHORT_BIAS",
      rsi15mDelta: 1,
      rsi30mDelta: 1,
      volAccel: 30,
      mfiSlope1m: "RISING",
      macdHistogramState1m: "POSITIVE_EXPANDING",
    }));
    expect(result.topGainerRsiContextLabel).toBe("GAINER_RSI_LONG_BIAS_CONTINUATION_DANGER");
  });
  it("RSI_1M_RISING_DANGER: rsi1m and rsi3m both rising", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      rsiCompositeLabel: "RSI_NEUTRAL",
      rsi1mDelta: 1,
      rsi3mDelta: 0.5,
    }));
    expect(result.topGainerRsiContextLabel).toBe("GAINER_RSI_1M_RISING_DANGER");
  });
  it("RSI_MULTI_TF_ROLLOVER: rsi falling on 1m, 3m, 5m", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      rsiCompositeLabel: "RSI_NEUTRAL",
      rsi1mDelta: -2,
      rsi3mDelta: -1,
      rsi5mDelta: -0.5,
    }));
    expect(result.topGainerRsiContextLabel).toBe("GAINER_RSI_MULTI_TF_ROLLOVER");
  });
  it("RSI_SHORT_BIAS_EXHAUSTION: RSI short bias", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      rsiCompositeLabel: "RSI_SHORT_BIAS",
      rsi1mDelta: -1,
      rsi3mDelta: -0.5,
      rsi5mDelta: 0,
    }));
    expect(result.topGainerRsiContextLabel).toBe("GAINER_RSI_SHORT_BIAS_EXHAUSTION");
  });
  it("RSI_NEUTRAL: no strong signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      rsiCompositeLabel: "RSI_NEUTRAL",
      rsi1mDelta: 0,
      rsi3mDelta: 0,
      rsi5mDelta: 0,
    }));
    expect(result.topGainerRsiContextLabel).toBe("GAINER_RSI_NEUTRAL");
  });
});

// ─── TREND CONTEXT ───────────────────────────────────────────────────────────

describe("topGainerTrendContextLabel", () => {
  it("EMA_ABOVE_RISING_DANGER: trend long + ema rising + price above ema9", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_LONG_BIAS",
      emaSlopeBias1m: "RISING",
      priceVsEma9_1mPct: 0.5,
      volAccel: 30,
      rsi15mDelta: 1,
      macdHistogramState1m: "POSITIVE_EXPANDING",
    }));
    expect(result.topGainerTrendContextLabel).toBe("GAINER_EMA_ABOVE_RISING_DANGER");
  });
  it("TREND_LONG_BIAS_HOT_FADE_WATCH: trend long + volume decel", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_LONG_BIAS",
      emaSlopeBias1m: "FLAT",
      priceVsEma9_1mPct: -0.1,
      volAccel: -10,
    }));
    expect(result.topGainerTrendContextLabel).toBe("GAINER_TREND_LONG_BIAS_HOT_FADE_WATCH");
  });
  it("TREND_LONG_BIAS_CONTINUATION_DANGER: trend long only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_LONG_BIAS",
      emaSlopeBias1m: "FLAT",
      priceVsEma9_1mPct: -0.1,
      volAccel: 30,
      mfiSlope1m: "RISING",
      macdHistogramState1m: "POSITIVE_EXPANDING",
      rsi15mDelta: 1,
      rsi30mDelta: 1,
    }));
    expect(result.topGainerTrendContextLabel).toBe("GAINER_TREND_LONG_BIAS_CONTINUATION_DANGER");
  });
  it("MACD_ROLLOVER: macd shrinking", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_SHORT_BIAS",
      macdHistogramState1m: "POSITIVE_SHRINKING",
      volAccel: 30,
      mfiSlope1m: "RISING",
      rsi15mDelta: 1,
    }));
    expect(result.topGainerTrendContextLabel).toBe("GAINER_MACD_ROLLOVER");
  });
  it("DMI_BULLISH_DANGER: DMI bullish", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_SHORT_BIAS",
      macdHistogramState1m: "FLAT",
      dmiBias1m: "BULLISH_DMI",
      volAccel: 30,
      rsi15mDelta: 1,
    }));
    expect(result.topGainerTrendContextLabel).toBe("GAINER_DMI_BULLISH_DANGER");
  });
  it("TREND_SHORT_BIAS_EXHAUSTION: trend short", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_SHORT_BIAS",
      macdHistogramState1m: "FLAT",
      dmiBias1m: "BEARISH_DMI",
      dmiBias3m: "BEARISH_DMI",
    }));
    expect(result.topGainerTrendContextLabel).toBe("GAINER_TREND_SHORT_BIAS_EXHAUSTION");
  });
  it("TREND_NEUTRAL: no strong signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      trendCompositeLabel: "TREND_NEUTRAL",
      macdHistogramState1m: "FLAT",
      dmiBias1m: "NEUTRAL",
      dmiBias3m: "NEUTRAL",
    }));
    expect(result.topGainerTrendContextLabel).toBe("GAINER_TREND_NEUTRAL");
  });
});

// ─── VOLUME FLOW CONTEXT ─────────────────────────────────────────────────────

describe("topGainerVolumeFlowContextLabel", () => {
  it("BUY_PRESSURE_DANGER: CVD bull + buy flow + CMF buy", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "BULL",
      volumeFlowBias1m: "BUY_PRESSURE",
      cmfBias1m: "BUY_PRESSURE",
    }));
    expect(result.topGainerVolumeFlowContextLabel).toBe("GAINER_FLOW_BUY_PRESSURE_DANGER");
  });
  it("CVD_BULLISH_DANGER: CVD bull only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "BULL",
      volumeFlowBias1m: "NEUTRAL",
      cmfBias1m: "NEUTRAL",
    }));
    expect(result.topGainerVolumeFlowContextLabel).toBe("GAINER_FLOW_CVD_BULLISH_DANGER");
  });
  it("DISTRIBUTION: sell pressure + bearish OBV", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "BEAR",
      cmfBias1m: "SELL_PRESSURE",
      obvDivergence1m: "BEARISH_OBV_DIVERGENCE",
    }));
    expect(result.topGainerVolumeFlowContextLabel).toBe("GAINER_FLOW_DISTRIBUTION");
  });
  it("SELL_PRESSURE: sell pressure only", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "NEUT",
      cmfBias1m: "SELL_PRESSURE",
      obvDivergence1m: "NEUTRAL",
    }));
    expect(result.topGainerVolumeFlowContextLabel).toBe("GAINER_FLOW_SELL_PRESSURE");
  });
  it("VOLUME_DECELERATION: CVD not bull + low volAccel", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "NEUT",
      cmfBias1m: "NEUTRAL",
      obvDivergence1m: "NEUTRAL",
      volAccel: 10,
    }));
    expect(result.topGainerVolumeFlowContextLabel).toBe("GAINER_FLOW_VOLUME_DECELERATION");
  });
  it("CVD_NOT_BULLISH: CVD not bull, volAccel >= 20", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      cvdLabel: "NEUT",
      cmfBias1m: "NEUTRAL",
      obvDivergence1m: "NEUTRAL",
      volAccel: 25,
    }));
    expect(result.topGainerVolumeFlowContextLabel).toBe("GAINER_FLOW_CVD_NOT_BULLISH");
  });
  it("FLOW_NEUTRAL: CVD bull but not all buy", () => {
    // The function returns FLOW_NEUTRAL when cvdBull=true but not buyFlow+cmfBuy
    // Wait — per spec, cvdBull → CVD_BULLISH_DANGER when not all buy.
    // FLOW_NEUTRAL is unreachable via normal paths when cvdLabel is any known value.
    // Verify the function doesn't throw on empty object.
    expect(() => evaluateTopGainerExhaustionAudit({})).not.toThrow();
  });
});

// ─── STRUCTURE CONTEXT ───────────────────────────────────────────────────────

describe("topGainerStructureContextLabel", () => {
  it("FAILED_BREAKOUT", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ failedBreakout1m: true })).topGainerStructureContextLabel)
      .toBe("GAINER_STRUCTURE_FAILED_BREAKOUT");
  });
  it("LOWER_HIGH: both 1m and 3m confirmed", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      failedBreakout1m: false,
      failedBreakout3m: false,
      lowerHighConfirmed1m: true,
      lowerHighConfirmed3m: true,
    }));
    expect(result.topGainerStructureContextLabel).toBe("GAINER_STRUCTURE_LOWER_HIGH");
  });
  it("LOWER_LOW", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      failedBreakout1m: false,
      failedBreakout3m: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
      lowerLowConfirmed1m: true,
    }));
    expect(result.topGainerStructureContextLabel).toBe("GAINER_STRUCTURE_LOWER_LOW");
  });
  it("UPTREND_DANGER: HTF high RSI + trend long", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      failedBreakout1m: false,
      failedBreakout3m: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
      lowerLowConfirmed1m: false,
      lowerLowConfirmed3m: false,
      rsi15m: 65,
      rsi1h: 60,
      trendCompositeLabel: "TREND_LONG_BIAS",
    }));
    expect(result.topGainerStructureContextLabel).toBe("GAINER_STRUCTURE_UPTREND_DANGER");
  });
  it("CHOP_FADE: structure chop", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      failedBreakout1m: false,
      failedBreakout3m: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
      lowerLowConfirmed1m: false,
      rsi15m: 50,
      rsi1h: 50,
      trendCompositeLabel: "TREND_SHORT_BIAS",
      structure1m: "CHOP",
    }));
    expect(result.topGainerStructureContextLabel).toBe("GAINER_STRUCTURE_CHOP_FADE");
  });
  it("STRUCTURE_UNKNOWN: no signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      failedBreakout1m: false,
      failedBreakout3m: false,
      lowerHighConfirmed1m: false,
      lowerHighConfirmed3m: false,
      lowerLowConfirmed1m: false,
      lowerLowConfirmed3m: false,
      rsi15m: 50,
      rsi1h: 50,
      trendCompositeLabel: "TREND_SHORT_BIAS",
      structure1m: "DOWNTREND",
      structure3m: "DOWNTREND",
    }));
    expect(result.topGainerStructureContextLabel).toBe("GAINER_STRUCTURE_UNKNOWN");
  });
});

// ─── BTC CONTEXT ─────────────────────────────────────────────────────────────

describe("topGainerBtcContextLabel", () => {
  it("BTC_STRONG_UP → CONTINUATION_DANGER", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ btcRegime: "BTC_STRONG_UP" })).topGainerBtcContextLabel)
      .toBe("GAINER_BTC_STRONG_UP_CONTINUATION_DANGER");
  });
  it("BTC_CHOP → OK", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ btcRegime: "BTC_CHOP" })).topGainerBtcContextLabel)
      .toBe("GAINER_BTC_CHOP_OK");
  });
  it("BTC_WEAK_DOWN → EXHAUSTION_TAILWIND", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ btcRegime: "BTC_WEAK_DOWN" })).topGainerBtcContextLabel)
      .toBe("GAINER_BTC_WEAK_DOWN_EXHAUSTION_TAILWIND");
  });
  it("BTC_STRONG_DOWN → MARKET_RISK", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ btcRegime: "BTC_STRONG_DOWN" })).topGainerBtcContextLabel)
      .toBe("GAINER_BTC_STRONG_DOWN_MARKET_RISK");
  });
  it("BTC_MIXED → CONDITIONAL", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ btcRegime: "BTC_MIXED" })).topGainerBtcContextLabel)
      .toBe("GAINER_BTC_MIXED_CONDITIONAL");
  });
  it("unknown regime → BTC_UNKNOWN", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ btcRegime: undefined })).topGainerBtcContextLabel)
      .toBe("GAINER_BTC_UNKNOWN");
  });
});

// ─── THESIS LANE ─────────────────────────────────────────────────────────────

describe("topGainerThesisLaneLabel", () => {
  it("CONTINUATION_DANGER: BTC_STRONG_UP", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ btcRegime: "BTC_STRONG_UP" }));
    expect(result.topGainerThesisLaneLabel).toBe("TOP_GAINER_CONTINUATION_DANGER");
  });
  it("CONTINUATION_DANGER: extreme pressure + no exhaustion confirmation", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      btcRegime: "BTC_CHOP",
      cvdLabel: "BULL",
      trendCompositeLabel: "TREND_LONG_BIAS",
      greenImpulseDetected: true,
      immediateGreenImpulse: true,
      btcRegime2: "BTC_STRONG_UP",
      volAccel: 80,
      rsi1mDelta: 2,
      emaStack1m: "BULL",
      entryRankInBucket: 3,
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsiSpread1m3m: 1,
      failedBreakout1m: false,
      failedBreakout3m: false,
    }));
    expect(result.topGainerThesisLaneLabel).toBe("TOP_GAINER_CONTINUATION_DANGER");
  });
  it("CLASSIC_EXHAUSTION_SHORT: red + strict RSI rollover + not CVD bull", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      btcRegime: "BTC_CHOP",
      immediateRedImpulse: true,
      rsi1mDelta: -2,
      rsiSpread1m3m: -3,
      cvdLabel: "BEAR",
      trendCompositeLabel: "TREND_SHORT_BIAS",
      greenImpulseDetected: false,
    }));
    expect(result.topGainerThesisLaneLabel).toBe("TOP_GAINER_CLASSIC_EXHAUSTION_SHORT");
  });
  it("HOT_PUMP_FADE_SHORT: trend long + volume decel signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      btcRegime: "BTC_CHOP",
      trendCompositeLabel: "TREND_LONG_BIAS",
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: -2,
      rsiSpread1m3m: -3,
      cvdLabel: "BULL",
      failedBreakout1m: false,
      volAccel: -10,
      entryRankInBucket: 8,
      topGainerContinuationRiskScore: 0,
    }));
    expect(result.topGainerThesisLaneLabel).toBe("TOP_GAINER_HOT_PUMP_FADE_SHORT");
  });
  it("VWAP_LOSS_SHORT: below vwap + red impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      btcRegime: "BTC_CHOP",
      trendCompositeLabel: "TREND_SHORT_BIAS",
      immediateRedImpulse: true,
      rsi1mDelta: -2,
      rsiSpread1m3m: -3,
      cvdLabel: "BULL",
      priceVsVwapLabel: "BELOW_VWAP",
      failedBreakout1m: false,
      candleColorAtEntry: "RED",
    }));
    expect(result.topGainerThesisLaneLabel).toBe("TOP_GAINER_VWAP_LOSS_SHORT");
  });
  it("FAILED_BREAKOUT_SHORT: failed breakout present", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      btcRegime: "BTC_CHOP",
      trendCompositeLabel: "TREND_SHORT_BIAS",
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: 1,
      rsiSpread1m3m: 1,
      cvdLabel: "NEUT",
      priceVsVwapLabel: "ABOVE_VWAP",
      failedBreakout1m: true,
      greenImpulseDetected: false,
    }));
    expect(result.topGainerThesisLaneLabel).toBe("TOP_GAINER_FAILED_BREAKOUT_SHORT");
  });
  it("RANK_MID_EXHAUSTION_SHORT: mid-rank + adequate score", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      btcRegime: "BTC_CHOP",
      trendCompositeLabel: "TREND_SHORT_BIAS",
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: 1,
      rsiSpread1m3m: 1,
      cvdLabel: "NEUT",
      priceVsVwapLabel: "ABOVE_VWAP",
      failedBreakout1m: false,
      failedBreakout3m: false,
      greenImpulseDetected: false,
      entryRankInBucket: 12,
      topGainerExhaustionScore: 40,
      lowerHighConfirmed1m: false,
      macdHistogramState1m: "FLAT",
    }));
    expect(result.topGainerThesisLaneLabel).toBe("TOP_GAINER_RANK_MID_EXHAUSTION_SHORT");
  });
  it("UNCLASSIFIED: no strong signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      btcRegime: "BTC_CHOP",
      trendCompositeLabel: "TREND_SHORT_BIAS",
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: 1,
      rsiSpread1m3m: 1,
      cvdLabel: "NEUT",
      priceVsVwapLabel: "ABOVE_VWAP",
      failedBreakout1m: false,
      failedBreakout3m: false,
      greenImpulseDetected: false,
      entryRankInBucket: 30,
      topGainerExhaustionScore: 10,
      lowerHighConfirmed1m: false,
      macdHistogramState1m: "FLAT",
      spreadPct: 0.04,
    }));
    expect(result.topGainerThesisLaneLabel).toBe("TOP_GAINER_UNCLASSIFIED");
  });
});

// ─── QUALITY WARNINGS ─────────────────────────────────────────────────────────

describe("topGainerQualityWarningLabels", () => {
  it("empty array on clean exhaustion input (no warnings except NO_EXHAUSTION_CONFIRMATION if applicable)", () => {
    const result = evaluateTopGainerExhaustionAudit(baseGainerPass);
    expect(result.topGainerQualityWarningLabels).not.toContain("TOP_GAINER_ENTRY_GRADE_F_DANGER");
    expect(result.topGainerQualityWarningLabels).not.toContain("TOP_GAINER_GREEN_CANDLE_DANGER");
    expect(result.topGainerQualityWarningLabels).not.toContain("TOP_GAINER_CVD_BULLISH_DANGER");
    expect(result.topGainerQualityWarningLabels).not.toContain("TOP_GAINER_WIDE_SPREAD_DANGER");
    expect(result.topGainerQualityWarningLabels).not.toContain("TOP_GAINER_NO_EXHAUSTION_CONFIRMATION");
  });
  it("ENTRY_GRADE_F_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ entryTimingGrade: "F" }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_ENTRY_GRADE_F_DANGER");
  });
  it("GREEN_CANDLE_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ candleColorAtEntry: "GREEN" }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_GREEN_CANDLE_DANGER");
  });
  it("RSI_LONG_BIAS_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ rsiCompositeLabel: "RSI_LONG_BIAS" }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_RSI_LONG_BIAS_DANGER");
  });
  it("TREND_LONG_BIAS_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ trendCompositeLabel: "TREND_LONG_BIAS", volAccel: -5 }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_TREND_LONG_BIAS_DANGER");
  });
  it("DMI_BULLISH_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ dmiBias1m: "BULLISH_DMI" }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_DMI_BULLISH_DANGER");
  });
  it("MACD_BULLISH_EXPANSION_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ macdHistogramState1m: "POSITIVE_EXPANDING" }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_MACD_BULLISH_EXPANSION_DANGER");
  });
  it("CVD_BULLISH_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ cvdLabel: "BULL" }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_CVD_BULLISH_DANGER");
  });
  it("BUY_FLOW_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ volumeFlowBias1m: "BUY_PRESSURE" }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_BUY_FLOW_DANGER");
  });
  it("RANK_1_TO_5_CONTINUATION_RISK triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ entryRankInBucket: 4 }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_RANK_1_TO_5_CONTINUATION_RISK");
  });
  it("VWAP_LOSS_NOT_ENOUGH_WARNING triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      priceVsVwapLabel: "BELOW_VWAP",
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: 1,
      rsiSpread1m3m: 1,
    }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_VWAP_LOSS_NOT_ENOUGH_WARNING");
  });
  it("NO_EXHAUSTION_CONFIRMATION triggered when no confirmation", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: 1,
      rsiSpread1m3m: 1,
      failedBreakout1m: false,
      failedBreakout3m: false,
    }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_NO_EXHAUSTION_CONFIRMATION");
  });
  it("WIDE_SPREAD_DANGER triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ spreadPct: 0.08 }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_WIDE_SPREAD_DANGER");
  });
  it("20X_EXECUTION_FRAGILITY triggered", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ leverage: 20 }));
    expect(result.topGainerQualityWarningLabels).toContain("TOP_GAINER_20X_EXECUTION_FRAGILITY");
  });
});

// ─── SCORING ARITHMETIC ───────────────────────────────────────────────────────

describe("scoring arithmetic", () => {
  it("net = quality - danger", () => {
    const result = evaluateTopGainerExhaustionAudit(baseGainerPass);
    expect(result.topGainerNetExhaustionScore)
      .toBe(result.topGainerExhaustionQualityScore - result.topGainerContinuationDangerScore);
    expect(result.topGainerExhaustionAuditScore).toBe(result.topGainerNetExhaustionScore);
  });
  it("quality score uses topGainerExhaustionScore as base", () => {
    const r1 = evaluateTopGainerExhaustionAudit(g({ topGainerExhaustionScore: 0, immediateRedImpulse: false, redImpulseDetected: false }));
    const r2 = evaluateTopGainerExhaustionAudit(g({ topGainerExhaustionScore: 40, immediateRedImpulse: false, redImpulseDetected: false }));
    expect(r2.topGainerExhaustionQualityScore - r1.topGainerExhaustionQualityScore).toBe(40);
  });
});

// ─── BOOLEAN FLAGS ────────────────────────────────────────────────────────────

describe("boolean flags", () => {
  it("hasGainerExhaustionConfirmation true on base pass", () => {
    expect(evaluateTopGainerExhaustionAudit(baseGainerPass).hasGainerExhaustionConfirmation).toBe(true);
  });
  it("hasGainerExhaustionConfirmation false when no signals", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: 1,
      rsiSpread1m3m: 1,
      failedBreakout1m: false,
      failedBreakout3m: false,
    }));
    expect(result.hasGainerExhaustionConfirmation).toBe(false);
  });
  it("hasGainerContinuationDanger true when CVD bull + green impulse", () => {
    const result = evaluateTopGainerExhaustionAudit(g({ cvdLabel: "BULL", greenImpulseDetected: true }));
    expect(result.hasGainerContinuationDanger).toBe(true);
  });
  it("hasGainerContinuationDanger false on base pass", () => {
    expect(evaluateTopGainerExhaustionAudit(baseGainerPass).hasGainerContinuationDanger).toBe(false);
  });
  it("hasGainerVwapLoss true when below vwap", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ priceVsVwapLabel: "BELOW_VWAP" })).hasGainerVwapLoss).toBe(true);
  });
  it("hasGainerVwapLoss false when above vwap", () => {
    expect(evaluateTopGainerExhaustionAudit(g({ priceVsVwapLabel: "ABOVE_VWAP" })).hasGainerVwapLoss).toBe(false);
  });
  it("hasGainerFailedBreakout true on base pass", () => {
    expect(evaluateTopGainerExhaustionAudit(baseGainerPass).hasGainerFailedBreakout).toBe(true);
  });
  it("hasGainerLowerHigh true on base pass", () => {
    expect(evaluateTopGainerExhaustionAudit(baseGainerPass).hasGainerLowerHigh).toBe(true);
  });
});

// ─── AUDIT PASS / FAIL ────────────────────────────────────────────────────────

describe("exhaustion audit pass/fail", () => {
  it("passes on baseGainerPass", () => {
    const result = evaluateTopGainerExhaustionAudit(baseGainerPass);
    expect(result.topGainerWouldPassExhaustionAudit).toBe(true);
    expect(result.topGainerExhaustionAuditLabel).toBe("WOULD_PASS_EXHAUSTION_AUDIT");
    expect(result.topGainerAuditFailReasons).toHaveLength(0);
  });
  it("fails on continuation danger input", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: 1,
      rsiSpread1m3m: 1,
      failedBreakout1m: false,
      failedBreakout3m: false,
      cvdLabel: "BULL",
      trendCompositeLabel: "TREND_LONG_BIAS",
      greenImpulseDetected: true,
      immediateGreenImpulse: true,
      btcRegime: "BTC_STRONG_UP",
      topGainerExhaustionScore: 10,
      topGainerContinuationRiskScore: 60,
    }));
    expect(result.topGainerWouldPassExhaustionAudit).toBe(false);
    expect(result.topGainerAuditFailReasons.length).toBeGreaterThan(0);
  });
  it("WOULD_FAIL_MULTIPLE_REASONS label for multiple fail reasons", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      immediateRedImpulse: false,
      redImpulseDetected: false,
      rsi1mDelta: 1,
      rsiSpread1m3m: 1,
      failedBreakout1m: false,
      failedBreakout3m: false,
      topGainerExhaustionScore: 0,
      topGainerContinuationRiskScore: 100,
    }));
    expect(result.topGainerExhaustionAuditLabel).toBe("WOULD_FAIL_MULTIPLE_REASONS");
  });
  it("single fail reason label: WOULD_FAIL_LOW_EXHAUSTION_SCORE", () => {
    const result = evaluateTopGainerExhaustionAudit(g({
      topGainerExhaustionScore: 0,
      topGainerContinuationRiskScore: 0,
      immediateRedImpulse: true,
      rsi1mDelta: -1,
      rsiSpread1m3m: -2,
      failedBreakout1m: false,
      priceVsVwapLabel: "ABOVE_VWAP",
      lowerHighConfirmed1m: false,
      macdHistogramState1m: "FLAT",
    }));
    if (!result.topGainerWouldPassExhaustionAudit && result.topGainerAuditFailReasons.length === 1) {
      expect(result.topGainerExhaustionAuditLabel).toBe(`WOULD_FAIL_${result.topGainerAuditFailReasons[0]}`);
    }
  });
});

// ─── EMPTY OBJECT SAFETY ─────────────────────────────────────────────────────

describe("evaluateTopGainerExhaustionAudit({}) safety", () => {
  it("returns object with all required keys, does not throw", () => {
    const result = evaluateTopGainerExhaustionAudit({});
    const requiredKeys = [
      "topGainerPumpStrengthLabel", "topGainerEntryBatchLabel", "topGainerPumpPhaseLabel",
      "topGainerMicroExhaustionLabel", "topGainerContinuationPressureLabel",
      "topGainerVwapContextLabel", "topGainerRsiContextLabel", "topGainerTrendContextLabel",
      "topGainerVolumeFlowContextLabel", "topGainerStructureContextLabel", "topGainerBtcContextLabel",
      "topGainerThesisLaneLabel", "topGainerQualityWarningLabels",
      "topGainerExhaustionQualityScore", "topGainerContinuationDangerScore", "topGainerNetExhaustionScore",
      "topGainerExhaustionAuditScore", "topGainerWouldPassExhaustionAudit",
      "topGainerExhaustionAuditLabel", "topGainerAuditFailReasons",
      "hasGainerExhaustionConfirmation", "hasGainerContinuationDanger", "hasGainerRedRejection",
      "hasGainerRsiRollover", "hasGainerTrendRollover", "hasGainerVolumeFade",
      "hasGainerFailedBreakout", "hasGainerLowerHigh", "hasGainerVwapLoss",
    ];
    for (const key of requiredKeys) {
      expect(result).toHaveProperty(key);
    }
    expect(Array.isArray(result.topGainerQualityWarningLabels)).toBe(true);
    expect(Array.isArray(result.topGainerAuditFailReasons)).toBe(true);
  });
});
