// Tests for B-14: GREEN_REACCELERATION must not overwrite structural buckets.
import { describe, it, expect } from "vitest";
import { classifyTopGainerLong } from "./topGainerLongClassifier.js";

// immediateRedImpulse: true prevents controlledPullback=true, which prevents the
// MULTI_CONFIRM block from firing (MULTI_CONFIRM requires controlledPullback).
// greenSignal still fires via immediateGreenImpulse. This lets us isolate B-14 behavior.
const BASE = {
  change24h: 10,
  cvdLabel: "BULL",
  priceVsVwapLabel: "ABOVE_VWAP",
  immediateGreenImpulse: true,
  greenImpulseDetected: true,
  immediateRedImpulse: true,  // prevents MULTI_CONFIRM from overwriting (controlledPullback=false)
  spreadPct: 0.02,
  upperWickPct: 0,
};

// ── B-14: GREEN_REACCELERATION bucket guard ───────────────────────────────────

describe("B-14: GREEN_REACCELERATION does not overwrite structural buckets", () => {
  it("preserves HIGHER_LOW bucket when greenSignal+aboveVwap+flowBull also true", () => {
    const result = classifyTopGainerLong({
      ...BASE,
      higherLow1m: true,
    });
    expect(result.topGainerLongSubBucket).toBe("TOP_GAINER_HIGHER_LOW_LONG");
    expect(result.topGainerContinuationReasons).toContain("HIGHER_LOW_CONFIRMED");
    expect(result.topGainerContinuationReasons).toContain("GREEN_REACCELERATION_CVD_BULL");
  });

  it("preserves BREAKOUT_RETEST bucket when greenSignal+aboveVwap+flowBull also true", () => {
    const result = classifyTopGainerLong({
      ...BASE,
      breakoutRetest1m: true,
    });
    expect(result.topGainerLongSubBucket).toBe("TOP_GAINER_BREAKOUT_RETEST_LONG");
    expect(result.topGainerContinuationReasons).toContain("BREAKOUT_RETEST_HOLD");
    expect(result.topGainerContinuationReasons).toContain("GREEN_REACCELERATION_CVD_BULL");
  });

  it("assigns REACCELERATION when only VWAP_SUPPORT is set (no structural bucket)", () => {
    // VWAP_SUPPORT is a positional label; green+CVD BULL reacceleration overrides it
    const result = classifyTopGainerLong({
      ...BASE,
      higherLow1m: false,
      breakoutRetest1m: false,
    });
    expect(result.topGainerLongSubBucket).toBe("TOP_GAINER_GREEN_REACCELERATION_LONG");
    expect(result.topGainerContinuationReasons).toContain("GREEN_REACCELERATION_CVD_BULL");
  });

  it("does NOT assign REACCELERATION when HIGHER_LOW has been set", () => {
    const result = classifyTopGainerLong({
      ...BASE,
      higherLow1m: true,
    });
    expect(result.topGainerLongSubBucket).not.toBe("TOP_GAINER_GREEN_REACCELERATION_LONG");
  });

  it("longSubBucket and topGainerLongSubBucket are always the same value", () => {
    const result = classifyTopGainerLong({ ...BASE, higherLow1m: true });
    expect(result.longSubBucket).toBe(result.topGainerLongSubBucket);
  });
});
