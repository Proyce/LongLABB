// Tests for B-01 through B-09 bug fixes in the AES scorer.
import { describe, it, expect } from "vitest";
import { computeLongAbsoluteEntryScoreV1 } from "./longAbsoluteEntryScore.scorer.js";

const LOSER_BASE = {
  longParentBucket: "TOP_LOSER_LONGS",
  cvdLabel: "BULL",
  atrPct: 0.5,
  spreadPct: 0.03,
  immediateGreenImpulse: false,
  greenImpulseDetected: false,
  immediateRedImpulse: false,
  redImpulseDetected: false,
};

const GAINER_BASE = {
  longParentBucket: "TOP_GAINER_LONGS",
  atrPct: 0.5,
  spreadPct: 0.03,
  immediateGreenImpulse: false,
  greenImpulseDetected: false,
  immediateRedImpulse: false,
  redImpulseDetected: false,
};

// ── B-01: MICRO_GREEN_MULTI_CONFIRM label fix ─────────────────────────────────

describe("B-01: MICRO_GREEN_MULTI_CONFIRM label", () => {
  it("awards microMultiConfirm points for MICRO_GREEN_MULTI_CONFIRM label", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_GREEN_MULTI_CONFIRM" }, {}, {}
    );
    const contrib = result.longAesPositiveContributions.find(c => c.code === "MICRO_GREEN_MULTI_CONFIRM");
    expect(contrib).toBeDefined();
    expect(contrib.family).toBe("MOVEMENT_MATURITY");
    expect(contrib.points).toBe(4);
    expect(result.longAesCanAffectExecution).toBe(false);
    expect(result.longAesIsLogOnly).toBe(true);
  });

  it("does NOT award multiConfirm points for legacy MICRO_MULTI_CONFIRM label (old name)", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_MULTI_CONFIRM" }, {}, {}
    );
    const contrib = result.longAesPositiveContributions.find(c => c.code === "MICRO_GREEN_MULTI_CONFIRM");
    expect(contrib).toBeUndefined();
    expect(result.longAesCanAffectExecution).toBe(false);
  });
});

// ── B-02: MICRO_RED_PRESSURE label fix ──────────────────────────────────────

describe("B-02: MICRO_RED_PRESSURE loser penalty", () => {
  it("applies red pressure penalty for LOSER side with MICRO_RED_PRESSURE", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_RED_PRESSURE" }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code === "LOSER_MICRO_RED_PRESSURE_UNCONFIRMED");
    expect(penalty).toBeDefined();
    expect(penalty.points).toBe(-6);
    expect(result.longAesCanAffectExecution).toBe(false);
  });

  it("does NOT apply penalty for GAINER side with MICRO_RED_PRESSURE", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...GAINER_BASE, longMicroMomentumLabel: "MICRO_RED_PRESSURE", cvdLabel: "BULL" }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code === "LOSER_MICRO_RED_PRESSURE_UNCONFIRMED");
    expect(penalty).toBeUndefined();
    expect(result.longAesCanAffectExecution).toBe(false);
  });

  it("does NOT apply penalty when hasGreenConfirmation suppresses it", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_RED_PRESSURE", hasGreenConfirmation: true }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code === "LOSER_MICRO_RED_PRESSURE_UNCONFIRMED");
    expect(penalty).toBeUndefined();
  });

  it("does NOT apply old MICRO_TICKS_DOWN penalty (dead code removed)", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_TICKS_DOWN" }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code?.includes("MICRO_TICKS_DOWN"));
    expect(penalty).toBeUndefined();
  });
});

// ── B-03: MICRO_TICKS_UP and MICRO_RSI_ROLLOVER_UP scoring ──────────────────

describe("B-03: MICRO_TICKS_UP and MICRO_RSI_ROLLOVER_UP movement maturity credit", () => {
  it("awards partial credit for MICRO_TICKS_UP", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_TICKS_UP" }, {}, {}
    );
    const contrib = result.longAesPositiveContributions.find(c => c.code === "MICRO_TICKS_UP_ONLY");
    expect(contrib).toBeDefined();
    expect(contrib.points).toBe(2);
    expect(contrib.family).toBe("MOVEMENT_MATURITY");
    expect(result.longAesCanAffectExecution).toBe(false);
  });

  it("awards minimal credit for MICRO_RSI_ROLLOVER_UP", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_RSI_ROLLOVER_UP" }, {}, {}
    );
    const contrib = result.longAesPositiveContributions.find(c => c.code === "MICRO_RSI_ROLLOVER_UP");
    expect(contrib).toBeDefined();
    expect(contrib.points).toBe(1);
    expect(contrib.family).toBe("MOVEMENT_MATURITY");
    expect(result.longAesCanAffectExecution).toBe(false);
  });

  it("TICKS_UP credit is less than GREEN_IMPULSE credit", () => {
    const impulse = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_GREEN_IMPULSE" }, {}, {}
    );
    const ticks = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, longMicroMomentumLabel: "MICRO_TICKS_UP" }, {}, {}
    );
    const impulseContrib = impulse.longAesPositiveContributions.find(c => c.code === "MICRO_GREEN_IMPULSE");
    const ticksContrib   = ticks.longAesPositiveContributions.find(c => c.code === "MICRO_TICKS_UP_ONLY");
    expect(ticksContrib.points).toBeLessThan(impulseContrib.points);
  });
});

// ── B-04: CVD_BEAR GAINER penalty ───────────────────────────────────────────

describe("B-04: CVD_BEAR penalty for GAINER side", () => {
  it("applies CVD_BEAR penalty to GAINER side when no active green", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...GAINER_BASE, entryCvdLabel: "BEAR" }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code === "CVD_BEAR_GAINER_NO_GREEN");
    expect(penalty).toBeDefined();
    expect(penalty.points).toBe(-3);
    expect(result.longAesCanAffectExecution).toBe(false);
  });

  it("does NOT penalize GAINER + CVD_BEAR when active green is present", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...GAINER_BASE, entryCvdLabel: "BEAR", immediateGreenImpulse: true }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code === "CVD_BEAR_GAINER_NO_GREEN");
    expect(penalty).toBeUndefined();
  });

  it("still penalizes LOSER side with CVD_BEAR (existing behavior preserved)", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...LOSER_BASE, cvdLabel: "BEAR" }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code === "CVD_BEAR_LOSER_NO_GREEN");
    expect(penalty).toBeDefined();
  });
});

// ── B-07: gainerSniper reduced + over-extension penalty ─────────────────────

describe("B-07: AES tier calibration — gainerSniper and over-extension", () => {
  it("awards reduced gainerSniper bonus (4 pts) not legacy 8 pts", () => {
    const result = computeLongAbsoluteEntryScoreV1({
      ...GAINER_BASE,
      cvdLabel: "BULL",
      immediateGreenImpulse: true,
      topGainerContinuationQualityScore: 125,
      last3TicksDirection: "UP",
      atrPct: 0.7,
    }, {}, {});
    const bonus = result.longAesPositiveContributions.find(c => c.code === "GAINER_LONG_SNIPER_INTERACTION");
    expect(bonus).toBeDefined();
    expect(bonus.points).toBe(4);
    expect(result.longAesCanAffectExecution).toBe(false);
  });

  it("applies over-extension penalty when continuationQuality >= 140", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...GAINER_BASE, cvdLabel: "BULL", topGainerContinuationQualityScore: 145 }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code === "GAINER_OVER_EXTENSION");
    expect(penalty).toBeDefined();
    expect(penalty.points).toBe(-6);
    expect(result.longAesCanAffectExecution).toBe(false);
  });

  it("does NOT apply over-extension penalty when continuationQuality < 140", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { ...GAINER_BASE, cvdLabel: "BULL", topGainerContinuationQualityScore: 139 }, {}, {}
    );
    const penalty = result.longAesNegativeContributions.find(c => c.code === "GAINER_OVER_EXTENSION");
    expect(penalty).toBeUndefined();
  });
});

// ── B-08: longAesConfidenceIsInformative conditional ────────────────────────

describe("B-08: longAesConfidenceIsInformative reflects feature coverage", () => {
  it("sets longAesConfidenceIsInformative to false when featureCoveragePct < 80", () => {
    const result = computeLongAbsoluteEntryScoreV1({ longParentBucket: "TOP_LOSER_LONGS" }, {}, {});
    if (result.longAesFeatureCoveragePct < 80) {
      expect(result.longAesConfidenceIsInformative).toBe(false);
    }
    expect(result.longAesCanAffectExecution).toBe(false);
  });

  it("sets longAesConfidenceIsInformative to false when confidence is 0", () => {
    const result = computeLongAbsoluteEntryScoreV1({ longParentBucket: "TOP_LOSER_LONGS" }, {}, {});
    if (result.longAesConfidence === 0) {
      expect(result.longAesConfidenceIsInformative).toBe(false);
    }
  });
});

// ── B-09: longAesConfidenceCalibrationStatus ────────────────────────────────

describe("B-09: longAesConfidenceCalibrationStatus is UNCALIBRATED_RULE_MODEL", () => {
  it("reports longAesConfidenceCalibrationStatus as UNCALIBRATED_RULE_MODEL", () => {
    const result = computeLongAbsoluteEntryScoreV1(
      { longParentBucket: "TOP_LOSER_LONGS" }, {}, {}
    );
    expect(result.longAesConfidenceCalibrationStatus).toBe("UNCALIBRATED_RULE_MODEL");
    expect(result.longAesCanAffectExecution).toBe(false);
    expect(result.longAesIsLogOnly).toBe(true);
  });

  it("reports UNCALIBRATED_RULE_MODEL even for high-confidence snapshots", () => {
    const result = computeLongAbsoluteEntryScoreV1({
      longParentBucket: "TOP_LOSER_LONGS",
      cvdLabel: "BULL",
      atrPct: 0.8,
      spreadPct: 0.02,
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
      immediateRedImpulse: false,
      redImpulseDetected: false,
      last3TicksDirection: "UP",
      priceVsVwapLabel: "ABOVE_VWAP",
      btcRunDirection: "UP",
      longGateWouldPass: true,
    }, {}, {});
    expect(result.longAesConfidenceCalibrationStatus).toBe("UNCALIBRATED_RULE_MODEL");
  });
});
