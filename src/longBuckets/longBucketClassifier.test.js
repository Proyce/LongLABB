import { describe, it, expect } from "vitest";
import { classifyLongBucket } from "./longBucketClassifier.js";
import { classifyTopLoserLong } from "./topLoserLongClassifier.js";
import { classifyTopGainerLong } from "./topGainerLongClassifier.js";

// ─── TOP LOSER LONG ───────────────────────────────────────────────────────────

describe("classifyTopLoserLong", () => {
  const base = {
    longParentBucket:   "TOP_LOSER_LONGS",
    change24h:          -12,
    priceVsVwapLabel:   "ABOVE_VWAP",
    cvdLabel:           "BULL",
    greenImpulseDetected: true,
    immediateGreenImpulse: true,
    immediateRedImpulse: false,
    failedBreakdown1m:  true,
    spreadPct:          0.02,
    entryRank:          5,
    atrPct:             0.8,
  };

  it("classifies failed breakdown + green impulse as a positive reversal", () => {
    const result = classifyTopLoserLong(base);
    expect(result.longSetupScore).toBeGreaterThan(0);
    expect(result.longSubBucket).toContain("LONG");
    expect(result.longSetupReasons).toContain("FAILED_BREAKDOWN_REVERSAL");
    expect(result.longSetupReasons).toContain("GREEN_IMPULSE_CONFIRMED");
  });

  it("assigns VWAP_RECLAIM sub-bucket when above VWAP + green + CVD BULL", () => {
    const result = classifyTopLoserLong(base);
    expect(result.longSubBucket).toBe("TOP_LOSER_VWAP_RECLAIM_LONG");
  });

  it("assigns falling knife danger when red impulse + trend short + bear DMI", () => {
    const danger = {
      ...base,
      greenImpulseDetected: false,
      immediateGreenImpulse: false,
      immediateRedImpulse: true,
      trendCompositeLabel: "TREND_SHORT_BIAS",
      dmiBias5m: "BEARISH_DMI",
      entryRank: 3,
      cvdLabel: "BEAR",
      priceVsVwapLabel: "BELOW_VWAP",
    };
    const result = classifyTopLoserLong(danger);
    expect(result.longSetupScore).toBeLessThan(0);
    expect(result.longSetupWarnings).toContain("IMMEDIATE_RED_IMPULSE_DANGER");
  });

  it("penalizes CVD BEAR", () => {
    const s = { ...base, cvdLabel: "BEAR", immediateGreenImpulse: false, greenImpulseDetected: false };
    const result = classifyTopLoserLong(s);
    expect(result.longSetupWarnings).toContain("CVD_BEAR_DANGER");
  });

  it("returns correct output shape", () => {
    const result = classifyTopLoserLong(base);
    expect(result).toHaveProperty("longSubBucket");
    expect(result).toHaveProperty("longSetupScore");
    expect(result).toHaveProperty("longSetupReasons");
    expect(result).toHaveProperty("longSetupWarnings");
  });
});

// ─── TOP GAINER LONG ──────────────────────────────────────────────────────────

describe("classifyTopGainerLong", () => {
  const base = {
    longParentBucket:    "TOP_GAINER_LONGS",
    change24h:           12,
    priceVsVwapLabel:    "ABOVE_VWAP",
    cvdLabel:            "BULL",
    greenImpulseDetected: true,
    immediateGreenImpulse: true,
    immediateRedImpulse: false,
    higherLow1m:         true,
    spreadPct:           0.02,
    atrPct:              0.8,
    rsi1mSlope:          "RISING",
    macdHistogramState1m: "POSITIVE_EXPANDING",
  };

  it("classifies higher low + above VWAP + CVD BULL as continuation", () => {
    const result = classifyTopGainerLong(base);
    expect(result.longSetupScore).toBeGreaterThan(0);
    expect(result.longSetupReasons).toContain("HIGHER_LOW_CONFIRMED");
    expect(result.longSetupReasons).toContain("ABOVE_VWAP_SUPPORT");
  });

  it("identifies higher low in reasons even when multi-confirm sub-bucket wins", () => {
    const result = classifyTopGainerLong(base);
    // Multi-confirm wins the sub-bucket when all signals align
    expect(result.longSetupReasons).toContain("HIGHER_LOW_CONFIRMED");
    expect(result.longSubBucket).toMatch(/HIGHER_LOW|MULTI_CONFIRM/);
  });

  it("penalizes blowoff with extreme pump + upper wick rejection", () => {
    const blowoff = {
      ...base,
      change24h: 25,
      upperWickPct: 45,
      higherLow1m: false,
      immediateRedImpulse: true,
    };
    const result = classifyTopGainerLong(blowoff);
    expect(result.longSetupScore).toBeLessThan(0);
    expect(result.longSetupWarnings).toContain("BLOWOFF_TOP_RISK");
    expect(result.longSubBucket).toContain("BLOWOFF");
  });

  it("penalizes VWAP loss after pump", () => {
    const s = { ...base, priceVsVwapLabel: "BELOW_VWAP" };
    const result = classifyTopGainerLong(s);
    expect(result.longSetupWarnings).toContain("VWAP_LOSS_AFTER_PUMP");
  });
});

// ─── ROUTER ───────────────────────────────────────────────────────────────────

describe("classifyLongBucket", () => {
  it("routes TOP_LOSER_LONGS to loser classifier", () => {
    const result = classifyLongBucket({ longParentBucket: "TOP_LOSER_LONGS", spreadPct: 0.02, change24h: -10 });
    expect(result.longSubBucket).not.toBe("UNKNOWN_LONG_BUCKET");
  });

  it("routes TOP_GAINER_LONGS to gainer classifier", () => {
    const result = classifyLongBucket({ longParentBucket: "TOP_GAINER_LONGS", spreadPct: 0.02, change24h: 10 });
    expect(result.longSubBucket).not.toBe("UNKNOWN_LONG_BUCKET");
  });

  it("returns UNKNOWN_LONG_BUCKET for unrecognized bucket", () => {
    const result = classifyLongBucket({ longParentBucket: "TOP_LOSER_SHORTS" });
    expect(result.longSubBucket).toBe("UNKNOWN_LONG_BUCKET");
    expect(result.longSetupWarnings).toContain("UNKNOWN_PARENT_BUCKET");
  });
});
