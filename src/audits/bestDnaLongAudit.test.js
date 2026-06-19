import { describe, it, expect } from "vitest";
import {
  computeBestDnaLongScore,
  classifyBestDnaLongTier,
  evaluateBestDnaLongAudit,
} from "./bestDnaLongAudit.js";

const STRONG_LONG = {
  longParentBucket:      "TOP_LOSER_LONGS",
  entryCvdLabel:              "BULL",
  atrPct:                0.9,
  spreadPct:             0.02,
  immediateGreenImpulse: true,
  greenImpulseDetected:  true,
  immediateRedImpulse:   false,
  redImpulseDetected:    false,
  last3TicksDirection:   "UP",
  entryPriceVsVwapLabel:      "ABOVE_VWAP",
  longGateWouldPass:     true,
  entryRankInBucket:     5,
  macdHistogramState1m:  "POSITIVE_EXPANDING",
};

const WEAK_LONG = {
  longParentBucket:      "TOP_LOSER_LONGS",
  entryCvdLabel:              "BEAR",
  atrPct:                0.5,
  spreadPct:             0.06,
  immediateGreenImpulse: false,
  greenImpulseDetected:  false,
  immediateRedImpulse:   true,
  redImpulseDetected:    true,
  last3TicksDirection:   "DOWN",
  entryPriceVsVwapLabel:      "BELOW_VWAP",
  longGateWouldPass:     false,
  entryRankInBucket:     20,
};

// ─── computeBestDnaLongScore ──────────────────────────────────────────────────

describe("computeBestDnaLongScore", () => {
  it("awards high score for green + CVD BULL + above VWAP + longGate pass", () => {
    const { score } = computeBestDnaLongScore(STRONG_LONG);
    expect(score).toBeGreaterThan(65);
  });

  it("awards low score for red + CVD BEAR + below VWAP + longGate fail", () => {
    const { score } = computeBestDnaLongScore(WEAK_LONG);
    expect(score).toBeLessThan(35);
  });

  it("CVD BULL is in positive genes (inverted from short)", () => {
    const { positiveGenes } = computeBestDnaLongScore(STRONG_LONG);
    expect(positiveGenes.some(g => g.includes("CVD_BULL"))).toBe(true);
  });

  it("CVD BEAR is in penalty genes (inverted from short)", () => {
    const { penaltyGenes } = computeBestDnaLongScore(WEAK_LONG);
    expect(penaltyGenes.some(g => g.includes("CVD_BEAR"))).toBe(true);
  });

  it("green impulse is in positive genes (inverted from short)", () => {
    const { positiveGenes } = computeBestDnaLongScore(STRONG_LONG);
    expect(positiveGenes.some(g => g.includes("GREEN_IMPULSE") || g.includes("IMMEDIATE_GREEN"))).toBe(true);
  });

  it("red impulse is in penalty genes (inverted from short)", () => {
    const { penaltyGenes } = computeBestDnaLongScore(WEAK_LONG);
    expect(penaltyGenes.some(g => g.includes("RED_IMPULSE"))).toBe(true);
  });

  it("last3 UP is in positive genes (inverted from short DOWN)", () => {
    const { positiveGenes } = computeBestDnaLongScore(STRONG_LONG);
    expect(positiveGenes.some(g => g.includes("TICKS_UP"))).toBe(true);
  });

  it("longGateWouldPass is in positive genes", () => {
    const { positiveGenes } = computeBestDnaLongScore(STRONG_LONG);
    expect(positiveGenes.some(g => g.includes("LONG_GATE_PASS"))).toBe(true);
  });

  it("strong > weak score", () => {
    const strong = computeBestDnaLongScore(STRONG_LONG).score;
    const weak   = computeBestDnaLongScore(WEAK_LONG).score;
    expect(strong).toBeGreaterThan(weak);
  });
});

// ─── classifyBestDnaLongTier ─────────────────────────────────────────────────

describe("classifyBestDnaLongTier", () => {
  it("returns BEST_DNA_LONG_ELITE for score >= 95", () => {
    expect(classifyBestDnaLongTier(95)).toBe("BEST_DNA_LONG_ELITE");
  });
  it("returns BEST_DNA_LONG_SNIPER for score >= 85", () => {
    expect(classifyBestDnaLongTier(85)).toBe("BEST_DNA_LONG_SNIPER");
  });
  it("returns BEST_DNA_LONG_HIGH for score >= 70", () => {
    expect(classifyBestDnaLongTier(70)).toBe("BEST_DNA_LONG_HIGH");
  });
  it("returns BEST_DNA_LONG_LOW for score < 40", () => {
    expect(classifyBestDnaLongTier(30)).toBe("BEST_DNA_LONG_LOW");
  });
});

// ─── Gainer path ─────────────────────────────────────────────────────────────

describe("gainer long specific DNA", () => {
  it("awards points for higher low confirmed", () => {
    const gainer = {
      longParentBucket: "TOP_GAINER_LONGS",
      entryCvdLabel:         "BULL",
      atrPct:           0.8,
      immediateGreenImpulse: true,
      greenImpulseDetected:  true,
      immediateRedImpulse:   false,
      redImpulseDetected:    false,
      hasGainerHigherLow: true,
      higherLow1m: true,
      topGainerContinuationScore: 90,
      topGainerContinuationQualityScore: 130,
      last3TicksDirection: "UP",
      entryPriceVsVwapLabel: "ABOVE_VWAP",
    };
    const { score, positiveGenes } = computeBestDnaLongScore(gainer);
    expect(score).toBeGreaterThan(60);
    expect(positiveGenes.some(g => g.includes("HIGHER_LOW"))).toBe(true);
  });

  it("penalizes blowoff extreme", () => {
    const blowoff = {
      longParentBucket: "TOP_GAINER_LONGS",
      entryCvdLabel:         "BEAR",
      immediateRedImpulse: true,
      topGainerPumpPhaseLabel: "GAINER_BLOWOFF_EXTREME",
    };
    const { penaltyGenes } = computeBestDnaLongScore(blowoff);
    expect(penaltyGenes.some(g => g.includes("BLOWOFF_EXTREME"))).toBe(true);
  });
});

// ─── evaluateBestDnaLongAudit ─────────────────────────────────────────────────

describe("evaluateBestDnaLongAudit", () => {
  it("returns complete audit object shape", () => {
    const result = evaluateBestDnaLongAudit(STRONG_LONG);
    expect(result).toHaveProperty("bestDnaLongScore");
    expect(result).toHaveProperty("bestDnaLongTier");
    expect(result).toHaveProperty("bestDnaLongPrimaryLabel");
    expect(result).toHaveProperty("bestDnaLongLabels");
    // Spec §25: Best DNA must NOT emit any Post-Fee fields.
    expect(result).not.toHaveProperty("longPostFee10Score");
    expect(result).not.toHaveProperty("longPostFee10Tier");
    expect(result).not.toHaveProperty("longPostFee10EntryScore");
    expect(result).not.toHaveProperty("isLongPostFee10Candidate");
    expect(result).toHaveProperty("isBestDnaLongHigh");
    expect(result).toHaveProperty("isBestDnaLongSniper");
    expect(result).toHaveProperty("isBestDnaLongElite");
  });

  it("useBestDnaLongEntryGate is always false (LOG_ONLY)", () => {
    const result = evaluateBestDnaLongAudit(STRONG_LONG);
    expect(result.useBestDnaLongEntryGate).toBe(false);
  });

  it("strong signal reaches high or sniper tier", () => {
    const result = evaluateBestDnaLongAudit(STRONG_LONG);
    expect(result.bestDnaLongTier).toMatch(/HIGH|SNIPER|ELITE/);
  });

  it("does not throw on sparse input", () => {
    expect(() => evaluateBestDnaLongAudit({ longParentBucket: "TOP_LOSER_LONGS" })).not.toThrow();
  });
});
