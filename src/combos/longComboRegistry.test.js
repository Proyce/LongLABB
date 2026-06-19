import { describe, expect, it } from "vitest";
import {
  evaluateLongCombos,
  LONG_UNIVERSAL_CORE_MICRO_UP_V1,
  LONG_GATE_RSI_MACD_EXPANSION_V1,
  LONG_PREMIUM_PF10_RUNNER_V1,
  LONG_GATE_STRONG_MICRO_UP_CLEAN_V1,
  LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1,
  LONG_GAINER_GREEN_REACCELERATION_V1,
  LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1,
} from "./longComboRegistry.js";

function winningSample(overrides = {}) {
  return {
    longParentBucket: "TOP_LOSER_LONGS",
    longGateScore: 94,
    longGateTier: "PREMIUM",
    longPostFee10EntryTier: "LONG_PF10_ELITE",
    longCandidateRunnerTierAtEntry: "LONG_RUNNER_ELITE",
    immediateGreenImpulse: true,
    greenImpulseDetected: true,
    immediateRedImpulse: false,
    redImpulseDetected: false,
    entryCvdLabel: "BULL",
    last3TicksDirection: "UP",
    longMicroMomentumLabel: "MICRO_GREEN_MULTI_CONFIRM",
    rsiLongSetupLabel: "RSI_LONG_MOMENTUM_EXPANSION",
    macdBullishExpansion: true,
    longCombosAntiMatched: [],
    vwapLongContextLabel: "BELOW_VWAP_RECLAIM_ATTEMPT_WITH_BULL",
    topLoserLongThesisLane: "TOP_LOSER_SCALP_REVERSAL_CANDIDATE",
    ...overrides,
  };
}

describe("Long combo registry V2", () => {
  it("matches all priority June 16 positive stacks when their conditions hold", () => {
    const result = evaluateLongCombos(winningSample());
    expect(result.longCombosPositiveMatched).toEqual(expect.arrayContaining([
      "LONG_UNIVERSAL_CORE_V1",
      "LONG_UNIVERSAL_CORE_MICRO_UP_V1",
      "LONG_GATE_RSI_MACD_EXPANSION_V1",
      "LONG_PREMIUM_PF10_RUNNER_V1",
      "LONG_GATE_STRONG_MICRO_UP_CLEAN_V1",
      "LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1",
      "LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1",
    ]));
    expect(result.canAffectExecution).toBe(false);
    expect(result.executionApplied).toBe(false);
  });

  it("matches the red/CVD bear and falling-knife anti-combos", () => {
    const result = evaluateLongCombos(winningSample({
      immediateGreenImpulse: false,
      greenImpulseDetected: false,
      immediateRedImpulse: true,
      redImpulseDetected: true,
      entryCvdLabel: "BEAR",
      last3TicksDirection: "DOWN",
      entryPriceVsVwapLabel: "BELOW_VWAP",
    }));
    expect(result.longCombosAntiMatched).toEqual(expect.arrayContaining([
      "LONG_RED_CVD_BEAR_ANTI_V1",
      "LONG_FALLING_KNIFE_ANTI_V1",
    ]));
  });
  it.each([
    ["core micro-up", LONG_UNIVERSAL_CORE_MICRO_UP_V1, winningSample(), { last3TicksDirection: "FLAT", immediateGreenImpulse: false, greenImpulseDetected: false, longMicroMomentumLabel: "RSI_ROLLOVER_UP" }, "NEEDS_UNIVERSAL_CORE"],
    ["gate RSI MACD", LONG_GATE_RSI_MACD_EXPANSION_V1, winningSample(), { macdBullishExpansion: false, macdHistogramState1m: "NEGATIVE" }, "NEEDS_MACD_BULLISH_EXPANSION"],
    ["premium triple", LONG_PREMIUM_PF10_RUNNER_V1, winningSample(), { longCandidateRunnerTierAtEntry: "LONG_RUNNER_WATCH" }, "NEEDS_RUNNER_ELITE"],
    ["strong clean micro-up", LONG_GATE_STRONG_MICRO_UP_CLEAN_V1, winningSample(), { immediateRedImpulse: true, entryCvdLabel: "BEAR" }, "HAS_LONG_ANTI_COMBO"],
    ["bull VWAP reclaim", LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1, winningSample(), { entryCvdLabel: "BEAR" }, "NEEDS_CVD_NOT_BEAR"],
    ["gainer reacceleration", LONG_GAINER_GREEN_REACCELERATION_V1, winningSample({ longParentBucket: "TOP_GAINER_LONGS", topGainerLongSubBucket: "TOP_GAINER_GREEN_REACCELERATION_LONG" }), { longParentBucket: "TOP_LOSER_LONGS" }, "NEEDS_GAINER_BUCKET"],
    ["loser reversal", LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1, winningSample(), { immediateRedImpulse: true }, "HAS_IMMEDIATE_RED"],
  ])("%s exposes reasons, missing conditions and log-only invariants", (_name, combo, positive, failingOverride, expectedMissing) => {
    const match = combo(positive);
    expect(match.matched).toBe(true);
    expect(match.reasons.length).toBeGreaterThan(0);
    expect(match.missingConditions).toEqual([]);
    expect(match.logOnly).toBe(true);
    expect(match.canAffectExecution).toBe(false);
    expect(match.executionApplied).toBe(false);

    const failed = combo({ ...positive, ...failingOverride });
    expect(failed.matched).toBe(false);
    expect(failed.missingConditions).toContain(expectedMissing);
  });

});
