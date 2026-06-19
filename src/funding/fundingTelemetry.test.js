import { describe, it, expect } from "vitest";
import {
  classifyFundingRegime,
  computeFundingLongBiasScore,
  computeFundingSnapshot,
  classifyFundingDirection,
  computeFundingCashflow,
} from "./fundingTelemetry.js";
import { computeFundingLongLabel, fundingRegimeToLongImpact } from "./fundingLabels.js";

// ─── REGIME CLASSIFICATION ────────────────────────────────────────────────────

describe("classifyFundingRegime", () => {
  it("classifies extreme negative funding", () => {
    expect(classifyFundingRegime(-0.005)).toBe("FUNDING_EXTREME_NEGATIVE");
  });
  it("classifies negative funding", () => {
    expect(classifyFundingRegime(-0.002)).toBe("FUNDING_NEGATIVE");
  });
  it("classifies neutral funding", () => {
    expect(classifyFundingRegime(0)).toBe("FUNDING_NEUTRAL");
    expect(classifyFundingRegime(0.0005)).toBe("FUNDING_NEUTRAL");
  });
  it("classifies positive funding", () => {
    expect(classifyFundingRegime(0.002)).toBe("FUNDING_POSITIVE");
  });
  it("classifies extreme positive funding", () => {
    expect(classifyFundingRegime(0.005)).toBe("FUNDING_EXTREME_POSITIVE");
  });
  it("returns UNKNOWN for null", () => {
    expect(classifyFundingRegime(null)).toBe("FUNDING_UNKNOWN");
  });
});

// ─── LONG BIAS SCORE ─────────────────────────────────────────────────────────

describe("computeFundingLongBiasScore", () => {
  it("extreme negative funding gives the highest positive score for longs", () => {
    expect(computeFundingLongBiasScore(-0.005)).toBe(15);
  });
  it("negative funding gives moderate positive score", () => {
    expect(computeFundingLongBiasScore(-0.002)).toBe(8);
  });
  it("extreme positive funding gives penalty", () => {
    expect(computeFundingLongBiasScore(0.005)).toBe(-15);
  });
  it("neutral funding gives 0", () => {
    expect(computeFundingLongBiasScore(0)).toBe(0);
  });
});

// ─── DIRECTION ───────────────────────────────────────────────────────────────

describe("classifyFundingDirection", () => {
  it("negative rate = longs receiving", () => {
    expect(classifyFundingDirection(-0.001)).toBe("FUNDING_LONGS_RECEIVING");
  });
  it("positive rate = longs paying", () => {
    expect(classifyFundingDirection(0.001)).toBe("FUNDING_LONGS_PAYING");
  });
  it("near zero = near zero", () => {
    expect(classifyFundingDirection(0)).toBe("FUNDING_NEAR_ZERO");
  });
});

// ─── SNAPSHOT ────────────────────────────────────────────────────────────────

describe("computeFundingSnapshot", () => {
  it("returns a fully populated snapshot", () => {
    const snap = computeFundingSnapshot(-0.002, "BTCUSDT", 1000, 4600000);
    expect(snap.fundingRegime).toBe("FUNDING_NEGATIVE");
    expect(snap.fundingLongBiasScore).toBe(8);
    expect(snap.timeToFundingMs).toBe(4600000 - 1000);
    expect(snap.fundingContextFresh).toBe(true);
  });
});

// ─── CASHFLOW ────────────────────────────────────────────────────────────────

describe("computeFundingCashflow", () => {
  it("negative funding → longs receive positive cashflow (negative of rate × 100)", () => {
    const r = computeFundingCashflow(-0.001, 5);
    expect(r.fundingCashflowNormPct).toBeCloseTo(0.1);   // received
    expect(r.fundingCashflowMarginPct).toBeCloseTo(0.5);
  });
  it("positive funding → longs pay negative cashflow", () => {
    const r = computeFundingCashflow(0.001, 5);
    expect(r.fundingCashflowNormPct).toBeCloseTo(-0.1);  // paid
    expect(r.fundingCashflowMarginPct).toBeCloseTo(-0.5);
  });
});

// ─── LABELS ──────────────────────────────────────────────────────────────────

describe("computeFundingLongLabel", () => {
  it("returns squeeze label for extreme negative + green impulse", () => {
    const label = computeFundingLongLabel({
      fundingRate: -0.005,
      fundingRegime: "FUNDING_EXTREME_NEGATIVE",
      greenImpulseDetected: true,
      cvdLabel: "BULL",
    });
    expect(label).toBe("NEGATIVE_FUNDING_SQUEEZE_LONG");
  });

  it("returns crowding danger for extreme positive", () => {
    const label = computeFundingLongLabel({
      fundingRate: 0.005,
      fundingRegime: "FUNDING_EXTREME_POSITIVE",
      greenImpulseDetected: false,
    });
    expect(label).toBe("EXTREME_POSITIVE_FUNDING_DANGER");
  });
});

describe("fundingRegimeToLongImpact", () => {
  it("maps negative to tailwind", () => {
    expect(fundingRegimeToLongImpact("FUNDING_NEGATIVE")).toBe("MILD_LONG_TAILWIND");
  });
  it("maps positive to headwind", () => {
    expect(fundingRegimeToLongImpact("FUNDING_POSITIVE")).toBe("MILD_LONG_HEADWIND");
  });
});
