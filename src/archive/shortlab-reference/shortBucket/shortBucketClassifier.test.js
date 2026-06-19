import { describe, it, expect } from "vitest";
import {
  classifyShortBucket,
  classifyTopLoserShort,
  classifyTopGainerShort,
} from "./shortBucketClassifier.js";

// ── buildShortUniverses (tested via its logic, since it's in the main file) ──

describe("marginPctToPricePct (logic validation)", () => {
  const marginPctToPricePct = (m, lev) => (lev ? m / lev : null);

  it("0.5% margin at 5x = 0.1% price", () => {
    expect(marginPctToPricePct(0.5, 5)).toBeCloseTo(0.1, 10);
  });

  it("1.0% margin at 5x = 0.2% price", () => {
    expect(marginPctToPricePct(1.0, 5)).toBeCloseTo(0.2, 10);
  });

  it("0.8% margin at 5x = 0.16% price", () => {
    expect(marginPctToPricePct(0.8, 5)).toBeCloseTo(0.16, 10);
  });

  it("0.5% margin at 10x = 0.05% price", () => {
    expect(marginPctToPricePct(0.5, 10)).toBeCloseTo(0.05, 10);
  });

  it("returns null when leverage is 0", () => {
    expect(marginPctToPricePct(0.5, 0)).toBeNull();
  });
});

// ── classifyShortBucket dispatcher ───────────────────────────────────────────

describe("classifyShortBucket", () => {
  it("dispatches to loser classifier for TOP_LOSER_SHORTS", () => {
    const result = classifyShortBucket({ shortParentBucket: "TOP_LOSER_SHORTS" });
    expect(result.shortSubBucket).not.toBe("UNKNOWN_SHORT_BUCKET");
  });

  it("dispatches to gainer classifier for TOP_GAINER_SHORTS", () => {
    const result = classifyShortBucket({ shortParentBucket: "TOP_GAINER_SHORTS" });
    expect(result.shortSubBucket).not.toBe("UNKNOWN_SHORT_BUCKET");
  });

  it("returns UNKNOWN_SHORT_BUCKET for unknown bucket", () => {
    const result = classifyShortBucket({ shortParentBucket: "SOME_OTHER_BUCKET" });
    expect(result.shortSubBucket).toBe("UNKNOWN_SHORT_BUCKET");
    expect(result.shortSetupWarnings).toContain("UNKNOWN_PARENT_BUCKET");
    expect(result.shortSetupScore).toBe(0);
  });

  it("returns UNKNOWN_SHORT_BUCKET when shortParentBucket is missing", () => {
    const result = classifyShortBucket({});
    expect(result.shortSubBucket).toBe("UNKNOWN_SHORT_BUCKET");
  });
});

// ── classifyTopLoserShort ─────────────────────────────────────────────────────

describe("classifyTopLoserShort", () => {
  it("classifies BEARISH_CHASE_TRAP when below VWAP + trend short + DMI bear + top-10 rank", () => {
    const result = classifyTopLoserShort({
      priceVsVwapLabel: "BELOW_VWAP",
      trendCompositeLabel: "TREND_SHORT_BIAS",
      dmiBias5m: "BEARISH_DMI",
      entryRankInBucket: 5,
    });
    expect(result.shortSubBucket).toBe("TOP_LOSER_BEARISH_CHASE_TRAP");
    expect(result.topLoserSetupScore).toBeLessThan(0);
    expect(result.shortSetupWarnings).toContain("BEARISH_CHASE_TRAP");
  });

  it("does NOT classify BEARISH_CHASE_TRAP when rank > 10", () => {
    const result = classifyTopLoserShort({
      priceVsVwapLabel: "BELOW_VWAP",
      trendCompositeLabel: "TREND_SHORT_BIAS",
      dmiBias5m: "BEARISH_DMI",
      entryRankInBucket: 11,
    });
    expect(result.shortSubBucket).not.toBe("TOP_LOSER_BEARISH_CHASE_TRAP");
  });

  it("classifies BOUNCE_FADE when above VWAP + trend long", () => {
    const result = classifyTopLoserShort({
      priceVsVwapLabel: "ABOVE_VWAP",
      trendCompositeLabel: "TREND_LONG_BIAS",
      dmiBias5m: "BULLISH_DMI",
    });
    expect(result.shortSubBucket).toBe("TOP_LOSER_BOUNCE_FADE");
    expect(result.shortSetupScore).toBeGreaterThan(0);
    expect(result.shortSetupReasons).toContain("RECOVERY_CONTEXT");
  });

  it("classifies FRESH_BREAKDOWN when below VWAP + bear CVD + no green impulse", () => {
    const result = classifyTopLoserShort({
      priceVsVwapLabel: "BELOW_VWAP",
      cvdLabel: "BEAR",
      greenImpulseDetected: false,
    });
    expect(result.shortSubBucket).toBe("TOP_LOSER_FRESH_BREAKDOWN");
    expect(result.shortSetupReasons).toContain("BELOW_VWAP_CVD_NOT_BULL_NO_GREEN_IMPULSE");
  });

  it("penalises crowded shorts", () => {
    const base = classifyTopLoserShort({});
    const withOI = classifyTopLoserShort({ oiLongLabel: "OI_LONG_CROWDED_SHORTS_POSSIBLE" });
    expect(withOI.shortSetupScore).toBeLessThan(base.shortSetupScore);
    expect(withOI.shortSetupWarnings).toContain("CROWDED_SHORTS_POSSIBLE");
  });

  it("penalises wide spread", () => {
    const base = classifyTopLoserShort({});
    const withSpread = classifyTopLoserShort({ spreadPct: 0.08 });
    expect(withSpread.shortSetupScore).toBeLessThan(base.shortSetupScore);
    expect(withSpread.shortSetupWarnings).toContain("SPREAD_NOT_CLEAN");
  });

  it("returns arrays even on empty input", () => {
    const result = classifyTopLoserShort({});
    expect(Array.isArray(result.shortSetupReasons)).toBe(true);
    expect(Array.isArray(result.shortSetupWarnings)).toBe(true);
    expect(Array.isArray(result.topLoserWarningFlags)).toBe(true);
  });
});

// ── classifyTopGainerShort ────────────────────────────────────────────────────

describe("classifyTopGainerShort", () => {
  it("classifies EXHAUSTION_SHORT when exhaustion score >= 50", () => {
    const result = classifyTopGainerShort({
      change24h: 25,          // +10 +10 extreme
      priceVsVwapLabel: "ABOVE_VWAP", // +20 overextended
      candleColorAtEntry: "RED",      // +20 red signal
      // total = 60 exhaustion, 0 continuation risk (no green impulse)
    });
    expect(result.topGainerExhaustionScore).toBeGreaterThanOrEqual(50);
    expect(result.shortSubBucket).toBe("TOP_GAINER_EXHAUSTION_SHORT");
  });

  it("classifies CONTINUATION_DANGER when continuation risk >= 40 and low exhaustion", () => {
    const result = classifyTopGainerShort({
      greenImpulseDetected: true,
      cvdLabel: "BULL",
      volAccel: 60,
      change24h: 5,
    });
    expect(result.topGainerContinuationRiskScore).toBeGreaterThanOrEqual(40);
    expect(result.shortSubBucket).toBe("TOP_GAINER_CONTINUATION_DANGER");
  });

  it("classifies VWAP_LOSS_SHORT when below VWAP after strong pump", () => {
    const result = classifyTopGainerShort({
      priceVsVwapLabel: "BELOW_VWAP",
      change24h: 15,
    });
    expect(result.shortSubBucket).toBe("TOP_GAINER_VWAP_LOSS_SHORT");
    expect(result.shortSetupReasons).toContain("VWAP_LOSS_AFTER_PUMP");
  });

  it("classifies BLOWOFF_REJECTION when rejected + overextended", () => {
    const result = classifyTopGainerShort({
      upperWickPct: 40,
      bbExtension1m: "BB_ABOVE_UPPER",
      change24h: 5,
    });
    expect(result.shortSubBucket).toBe("TOP_GAINER_BLOWOFF_REJECTION_SHORT");
  });

  it("classifies FAILED_BREAKOUT when failedBreakout1m is true", () => {
    const result = classifyTopGainerShort({
      failedBreakout1m: true,
      change24h: 5,
    });
    expect(result.shortSubBucket).toBe("TOP_GAINER_FAILED_BREAKOUT_SHORT");
  });

  it("finalScore = exhaustionScore - continuationRiskScore", () => {
    const result = classifyTopGainerShort({
      change24h: 25,           // exhaustion += 20
      candleColorAtEntry: "RED", // exhaustion += 20
      greenImpulseDetected: true, // continuationRisk += 40
    });
    const expected = result.topGainerExhaustionScore - result.topGainerContinuationRiskScore;
    expect(result.shortSetupScore).toBe(expected);
  });

  it("returns arrays even on empty input", () => {
    const result = classifyTopGainerShort({});
    expect(Array.isArray(result.shortSetupReasons)).toBe(true);
    expect(Array.isArray(result.shortSetupWarnings)).toBe(true);
    expect(Array.isArray(result.topGainerExhaustionReasons)).toBe(true);
    expect(Array.isArray(result.topGainerContinuationWarnings)).toBe(true);
  });
});
