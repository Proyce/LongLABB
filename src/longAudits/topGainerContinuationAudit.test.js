import { describe, it, expect } from "vitest";
import { evaluateTopGainerContinuationAudit } from "./topGainerContinuationAudit.js";

describe("evaluateTopGainerContinuationAudit", () => {
  const strong = {
    change24h:            12,
    immediateGreenImpulse: true,
    greenImpulseDetected: true,
    immediateRedImpulse:  false,
    cvdLabel:             "BULL",
    priceVsVwapLabel:     "ABOVE_VWAP",
    higherLow1m:          true,
    macdHistogramState1m: "POSITIVE_EXPANDING",
    rsi1m:                58,
    rsi1mSlope:           "RISING",
    spreadPct:            0.02,
    fundingRate:          0.0005,
  };

  it("confirms continuation for a strong gainer", () => {
    const result = evaluateTopGainerContinuationAudit(strong);
    expect(result.topGainerContinuationWouldPass).toBe(true);
    expect(result.topGainerContinuationThesisLabel).toBe("CONTINUATION_CONFIRMED");
    expect(result.topGainerContinuationScore).toBeGreaterThan(70);
  });

  it("detects blowoff danger from rejection + red impulse", () => {
    const blowoff = {
      ...strong,
      upperWickPct: 45,
      immediateRedImpulse: true,
      failedBreakout1m: true,
    };
    const result = evaluateTopGainerContinuationAudit(blowoff);
    expect(result.topGainerContinuationWouldPass).toBe(false);
    expect(result.topGainerContinuationDangerLabel).toBe("TOP_GAINER_BLOWOFF_DANGER");
  });

  it("penalizes VWAP loss", () => {
    const s = { ...strong, priceVsVwapLabel: "BELOW_VWAP" };
    const result = evaluateTopGainerContinuationAudit(s);
    expect(result.topGainerContinuationWarnings).toContain("BELOW_VWAP");
  });
});
