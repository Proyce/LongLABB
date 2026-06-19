import { describe, it, expect } from "vitest";
import { computeLongAbsoluteEntryScoreV1 } from "./longAbsoluteEntryScore.scorer.js";

const STRONG_LONG_SIGNAL = {
  longParentBucket:      "TOP_LOSER_LONGS",
  cvdLabel:              "BULL",
  atrPct:                0.8,
  spreadPct:             0.02,
  candleColorAtEntry:    "GREEN",
  immediateGreenImpulse: true,
  greenImpulseDetected:  true,
  immediateRedImpulse:   false,
  redImpulseDetected:    false,
  last3TicksDirection:   "UP",
  priceVsVwapLabel:      "ABOVE_VWAP",
  priceVsVwapPct:        0.5,
  vwapContextLabel:      "VWAP_RECLAIM",
  longGateWouldPass:     true,
  btcRunDirection:       "UP",
  entryRankInBucket:     5,
  macdHistogramState1m:  "POSITIVE_EXPANDING",
};

const WEAK_LONG_SIGNAL = {
  longParentBucket:      "TOP_LOSER_LONGS",
  cvdLabel:              "BEAR",
  atrPct:                0.8,
  spreadPct:             0.03,
  candleColorAtEntry:    "RED",
  immediateGreenImpulse: false,
  greenImpulseDetected:  false,
  immediateRedImpulse:   true,
  redImpulseDetected:    true,
  last3TicksDirection:   "DOWN",
  priceVsVwapLabel:      "BELOW_VWAP",
  priceVsVwapPct:        -0.5,
  btcRunDirection:       "DOWN",
  entryRankInBucket:     5,
  macdHistogramState1m:  "NEGATIVE_EXPANDING",
};

describe("computeLongAbsoluteEntryScoreV1", () => {
  it("awards a high score for green + CVD BULL + above VWAP (long-favorable signals)", () => {
    const result = computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL);
    expect(result.longAesScore).toBeGreaterThan(60);
    expect(result.longAesTier).toMatch(/CANDIDATE|HIGH|SNIPER|ELITE/);
  });

  it("awards a low score for red + CVD BEAR + below VWAP (anti-long signals)", () => {
    const result = computeLongAbsoluteEntryScoreV1(WEAK_LONG_SIGNAL);
    expect(result.longAesScore).toBeLessThan(45);
  });

  it("strong signal produces higher score than weak signal", () => {
    const strong = computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL);
    const weak   = computeLongAbsoluteEntryScoreV1(WEAK_LONG_SIGNAL);
    expect(strong.longAesScore).toBeGreaterThan(weak.longAesScore);
  });

  it("is LOG_ONLY — canAffectExecution is always false", () => {
    const result = computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL);
    expect(result.longAesIsLogOnly).toBe(true);
    expect(result.longAesCanAffectExecution).toBe(false);
    expect(result.longAesAction).toBe("LOG_ONLY_OBSERVE");
  });

  it("scores CVD BULL as positive (inverted from short AES)", () => {
    const result = computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL);
    const cvdContrib = result.longAesPositiveContributions.find(c => c.code === "CVD_BULL");
    expect(cvdContrib).toBeDefined();
    expect(cvdContrib.points).toBeGreaterThan(0);
  });

  it("scores CVD BEAR as negative (inverted from short AES)", () => {
    const result = computeLongAbsoluteEntryScoreV1(WEAK_LONG_SIGNAL);
    const cvdContrib = result.longAesNegativeContributions.find(c => c.code === "CVD_BEAR_LOSER_NO_GREEN");
    expect(cvdContrib).toBeDefined();
    expect(cvdContrib.points).toBeLessThan(0);
  });

  it("scores BTC UP as positive (tailwind for longs)", () => {
    const result = computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL);
    const btcContrib = result.longAesPositiveContributions.find(c => c.code === "BTC_UP");
    expect(btcContrib).toBeDefined();
    expect(btcContrib.points).toBeGreaterThan(0);
  });

  it("scores BTC DOWN as negative for longs", () => {
    const result = computeLongAbsoluteEntryScoreV1(WEAK_LONG_SIGNAL);
    const btcContrib = result.longAesNegativeContributions.find(c => c.code === "BTC_DOWN");
    expect(btcContrib).toBeDefined();
    expect(btcContrib.points).toBeLessThan(0);
  });

  it("penalizes red impulse via risk penalty", () => {
    const result = computeLongAbsoluteEntryScoreV1(WEAK_LONG_SIGNAL);
    expect(result.longAesRiskPenaltyScore).toBeGreaterThan(0);
  });

  it("returns correct output shape", () => {
    const result = computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL);
    expect(result).toHaveProperty("longAesScore");
    expect(result).toHaveProperty("longAesTier");
    expect(result).toHaveProperty("longAesEligibility");
    expect(result).toHaveProperty("longAesConfidence");
    expect(result).toHaveProperty("longAesPositiveContributions");
    expect(result).toHaveProperty("longAesNegativeContributions");
    expect(result).toHaveProperty("isLongAesHighQualityResearch");
    expect(result).toHaveProperty("isLongAesSniperResearch");
    expect(result).toHaveProperty("isLongAesEliteResearch");
  });

  it("does not throw on a sparse input", () => {
    expect(() => computeLongAbsoluteEntryScoreV1({ longParentBucket: "TOP_LOSER_LONGS" })).not.toThrow();
  });

  it("throws if logOnly is overridden to false", () => {
    expect(() => computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL, { logOnly: false })).toThrow();
  });

  it("throws if allowExecutionImpact is overridden to true", () => {
    expect(() => computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL, { allowExecutionImpact: true })).toThrow();
  });

  it("VWAP reclaim with green impulse gives positive location score", () => {
    const result = computeLongAbsoluteEntryScoreV1(STRONG_LONG_SIGNAL);
    expect(result.longAesLocationScore).toBeGreaterThan(0);
  });

  it("gainer continuation path returns valid score", () => {
    const gainer = {
      longParentBucket:               "TOP_GAINER_LONGS",
      cvdLabel:                       "BULL",
      atrPct:                         0.9,
      spreadPct:                      0.02,
      immediateGreenImpulse:          true,
      greenImpulseDetected:           true,
      immediateRedImpulse:            false,
      redImpulseDetected:             false,
      last3TicksDirection:            "UP",
      priceVsVwapLabel:               "ABOVE_VWAP",
      hasGainerHigherLow:             true,
      hasGainerContinuationConfirmation: true,
      topGainerContinuationQualityScore: 90,
      btcRunDirection:                "UP",
    };
    const result = computeLongAbsoluteEntryScoreV1(gainer);
    expect(result.longAesScore).toBeGreaterThan(55);
    expect(result.longAesSide).toBe("GAINER");
  });
});
