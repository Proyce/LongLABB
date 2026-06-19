import { describe, it, expect } from "vitest";
import { evaluateTopLoserReversalAudit } from "./topLoserReversalAudit.js";

describe("evaluateTopLoserReversalAudit", () => {
  const strong = {
    immediateGreenImpulse: true,
    greenImpulseDetected:  true,
    immediateRedImpulse:   false,
    failedBreakdown1m:     true,
    higherLow1m:           true,
    cvdLabel:              "BULL",
    priceVsVwapLabel:      "ABOVE_VWAP",
    btcRegime:             "BTC_WEAK_UP",
    lowerWickPct:          40,
    last3TicksDirection:   "UP",
    fundingRate:           -0.002,
    atrPct:                0.9,
  };

  it("confirms reversal for a strong setup", () => {
    const result = evaluateTopLoserReversalAudit(strong);
    expect(result.topLoserReversalWouldPass).toBe(true);
    expect(result.topLoserReversalThesisLabel).toBe("REVERSAL_CONFIRMED");
    expect(result.topLoserReversalScore).toBeGreaterThan(70);
  });

  it("rejects reversal for a red/bear setup", () => {
    const weak = {
      immediateRedImpulse: true,
      cvdLabel: "BEAR",
      priceVsVwapLabel: "BELOW_VWAP",
      btcRegime: "BTC_STRONG_DOWN",
    };
    const result = evaluateTopLoserReversalAudit(weak);
    expect(result.topLoserReversalWouldPass).toBe(false);
    expect(result.topLoserReversalWarnings).toContain("IMMEDIATE_RED_IMPULSE");
  });

  it("counts confirmation signals correctly", () => {
    const result = evaluateTopLoserReversalAudit(strong);
    expect(result.topLoserReversalConfirmCount).toBeGreaterThanOrEqual(4);
  });
});
