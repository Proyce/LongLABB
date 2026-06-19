import { describe, it, expect } from "vitest";
import { computeMarketBreathLogOnly } from "./marketBreathLogOnly.js";

function makeMarketRegime(overrides = {}) {
  return {
    btc: {
      regime: "RANGING",
      microDirectionLabel: "FLAT",
      tacticalDirectionLabel: "FLAT",
      structuralDirectionLabel: "FLAT",
      momentumPhase: "NEUTRAL",
    },
    eth: {
      regime: "RANGING",
      tacticalDirectionLabel: "FLAT",
      structuralDirectionLabel: "FLAT",
    },
    crossMarket: {
      btcEthAlignmentLabel: "BTC_ETH_MIXED",
    },
    breadth: {
      breadthLabel: "BREADTH_MIXED",
    },
    ...overrides,
  };
}

// Neutral baseline: no positive score factors (no FLAT structural, no MIXED/RANGE alignment)
function makeNestedOverride(btcOverride = {}, ethOverride = {}, crossOverride = {}, breadthOverride = {}) {
  return {
    btc: { regime: "RANGING", microDirectionLabel: "FLAT", tacticalDirectionLabel: "FLAT", structuralDirectionLabel: "RANGING", momentumPhase: "NEUTRAL", ...btcOverride },
    eth: { regime: "RANGING", tacticalDirectionLabel: "FLAT", structuralDirectionLabel: "RANGING", ...ethOverride },
    crossMarket: { btcEthAlignmentLabel: "BTC_ETH_NEUTRAL", ...crossOverride },
    breadth: { breadthLabel: "BREADTH_MIXED", ...breadthOverride },
  };
}

describe("computeMarketBreathLogOnly — baseline", () => {
  it("returns a result object with required fields", () => {
    const result = computeMarketBreathLogOnly(makeMarketRegime());
    expect(result).toHaveProperty("marketBreathScore");
    expect(result).toHaveProperty("marketBreathLabel");
    expect(result).toHaveProperty("marketBreathWouldBlock");
    expect(result).toHaveProperty("marketBreathWouldReduceCapacity");
    expect(result).toHaveProperty("marketBreathReasons");
  });

  it("handles null marketRegime gracefully", () => {
    const result = computeMarketBreathLogOnly(null);
    expect(result.marketBreathScore).toBe(0);
    expect(typeof result.marketBreathLabel).toBe("string");
  });
});

describe("computeMarketBreathLogOnly — controlled/clear conditions", () => {
  it("BTC structural FLAT + BTC_ETH_MIXED logs controlled or clear", () => {
    const result = computeMarketBreathLogOnly(
      makeNestedOverride(
        { structuralDirectionLabel: "FLAT" },
        {},
        { btcEthAlignmentLabel: "BTC_ETH_MIXED" },
        {}
      )
    );
    expect(["SHORT_BREATH_CLEAR", "SHORT_BREATH_CONTROLLED", "SHORT_BREATH_MIXED_OK"]).toContain(
      result.marketBreathLabel
    );
    expect(result.marketBreathWouldBlock).toBe(false);
  });

  it("BTC_ETH_RANGE alignment scores positively", () => {
    const result = computeMarketBreathLogOnly(
      makeNestedOverride({}, {}, { btcEthAlignmentLabel: "BTC_ETH_RANGE" }, {})
    );
    expect(result.marketBreathReasons).toContain("BTC_ETH_RANGE_GOOD_BREATH");
  });
});

describe("computeMarketBreathLogOnly — bounce risk conditions", () => {
  it("BTC tactical STRONG_DOWN logs bounce risk in reasons", () => {
    const result = computeMarketBreathLogOnly(
      makeNestedOverride({ tacticalDirectionLabel: "STRONG_DOWN" }, {}, {}, {})
    );
    expect(result.marketBreathReasons).toContain("BTC_TACTICAL_STRONG_DOWN_BOUNCE_RISK");
    expect(result.marketBreathScore).toBeLessThan(0);
  });

  it("BTC BOUNCE_IN_DOWNTREND logs danger", () => {
    const result = computeMarketBreathLogOnly(
      makeNestedOverride({ regime: "BOUNCE_IN_DOWNTREND" }, {}, {}, {})
    );
    expect(result.marketBreathReasons).toContain("BTC_BOUNCE_IN_DOWNTREND_DANGER");
    expect(result.marketBreathScore).toBeLessThanOrEqual(-35);
  });

  it("BTC BOUNCE_IN_DOWNTREND produces bounce trap risk or harder label", () => {
    const result = computeMarketBreathLogOnly(
      makeNestedOverride({ regime: "BOUNCE_IN_DOWNTREND" }, {}, {}, {})
    );
    const dangerLabels = [
      "SHORT_BREATH_BOUNCE_TRAP_RISK",
      "SHORT_BREATH_HARD_DANGER",
      "SHORT_BREATH_STRICT",
    ];
    expect(dangerLabels).toContain(result.marketBreathLabel);
  });
});

describe("computeMarketBreathLogOnly — panic risk", () => {
  it("BTC_ETH_STRONG_BEARISH_ALIGNMENT logs panic risk", () => {
    const result = computeMarketBreathLogOnly(
      makeNestedOverride({}, {}, { btcEthAlignmentLabel: "BTC_ETH_STRONG_BEARISH_ALIGNMENT" }, {})
    );
    expect(result.marketBreathReasons).toContain("BTC_ETH_STRONG_BEARISH_ALIGNMENT_PANIC_RISK");
  });
});

describe("computeMarketBreathLogOnly — breadth insufficient", () => {
  it("BREADTH_INSUFFICIENT logs warning but does not crash and does not block", () => {
    const result = computeMarketBreathLogOnly(
      makeNestedOverride({}, {}, {}, { breadthLabel: "BREADTH_INSUFFICIENT" })
    );
    expect(result.marketBreathReasons).toContain(
      "BREADTH_NOT_AVAILABLE_NO_SCORE_IMPACT"
    );
    expect(result).toBeDefined();
    // breadth insufficient should not trigger hard block on its own
    expect(result.marketBreathWouldBlock).toBe(false);
  });
});

describe("computeMarketBreathLogOnly — score is clamped", () => {
  it("score is always between -100 and 100", () => {
    const r1 = computeMarketBreathLogOnly(
      makeNestedOverride({ regime: "BOUNCE_IN_DOWNTREND", tacticalDirectionLabel: "STRONG_DOWN", momentumPhase: "BULLISH_REVERSAL_ATTEMPT" }, { regime: "BOUNCE_IN_DOWNTREND" }, { btcEthAlignmentLabel: "BTC_ETH_STRONG_BEARISH_ALIGNMENT" }, { breadthLabel: "BREADTH_STRONGLY_BULLISH" })
    );
    expect(r1.marketBreathScore).toBeGreaterThanOrEqual(-100);
    expect(r1.marketBreathScore).toBeLessThanOrEqual(100);
  });
});

describe("computeMarketBreathLogOnly — flat field name fallback", () => {
  it("supports flat field names as fallback", () => {
    const result = computeMarketBreathLogOnly({
      btcRegime: "BOUNCE_IN_DOWNTREND",
      btcEthAlignmentLabel: "BTC_ETH_MIXED",
      breadthLabel: "BREADTH_MIXED",
    });
    expect(result.marketBreathReasons).toContain("BTC_BOUNCE_IN_DOWNTREND_DANGER");
  });
});
