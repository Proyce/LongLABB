import { describe, expect, it } from "vitest";
import {
  BEST_DNA_CSV_HEADERS,
  BEST_DNA_ELITE_MIN,
  BEST_DNA_HIGH_MIN,
  BEST_DNA_SNIPER_MIN,
  assignRunBestNormRanks,
  bestDnaCSVRow,
  classifyBestDnaTier,
  classifyPostFee10Tier,
  classifyRunnerCaptureTier,
  computeBestDnaScore,
  computePostFee10PotentialScoreV2,
  computeRunnerCapturePotential,
  evaluateBestDnaAudit,
  feeAdjustedNormPnlPct,
  flattenBestDnaOutcomeFields,
} from "./bestDnaAudit.js";

const base = {
  shortParentBucket: "TOP_LOSER_SHORTS",
  atrPct: 1,
  failedBreakout1m: true,
  immediateRedImpulse: true,
  redImpulseDetected: true,
  candleColorAtEntry: "RED",
  last3TicksDirection: "DOWN",
  greenImpulseDetected: false,
  immediateGreenImpulse: false,
  cvdLabel: "BEAR",
  shortGateWouldPass: true,
  spreadPct: 0.02,
  entryRank: 8,
  microMomentumLabel: "MICRO_MULTI_CONFIRM",
  macdHistogram1m: -0.01,
  macdHistogramDelta1m: -0.02,
  rsi1mDelta: -2,
  rsiSpread1m3m: -1,
  priceVsVwapLabel: "BELOW_VWAP",
  volAccel: -5,
};

const s = overrides => ({ ...base, ...(overrides ?? {}) });

function geneHas(genes, code) {
  return genes.some(g => g.includes(code));
}

describe("BEST DNA scoring", () => {
  it("scores ATR boundaries at 0.2, 0.6, and 1.0", () => {
    expect(geneHas(computeBestDnaScore(s({ atrPct: 0.2 })).positiveGenes, "ATR_0_2_TO_0_6")).toBe(true);
    expect(geneHas(computeBestDnaScore(s({ atrPct: 0.6 })).positiveGenes, "ATR_0_6_TO_1")).toBe(true);
    expect(geneHas(computeBestDnaScore(s({ atrPct: 1.0 })).positiveGenes, "ATR_GE_1")).toBe(true);
  });

  it("rewards failed breakout and red impulse scoring", () => {
    const result = computeBestDnaScore(s());
    expect(geneHas(result.positiveGenes, "FAILED_BREAKOUT")).toBe(true);
    expect(geneHas(result.positiveGenes, "IMMEDIATE_RED_IMPULSE")).toBe(true);
    expect(geneHas(result.positiveGenes, "RED_IMPULSE_DETECTED")).toBe(true);
  });

  it("penalizes green impulse danger without double-counting aliases", () => {
    const result = computeBestDnaScore(s({
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
    }));
    const greenPenalties = result.penaltyGenes.filter(g => g.includes("GREEN_IMPULSE"));
    expect(greenPenalties).toHaveLength(1);
    expect(geneHas(result.penaltyGenes, "IMMEDIATE_GREEN_IMPULSE")).toBe(true);
  });

  it("rewards CVD BEAR/NEUT and penalizes CVD BULL", () => {
    expect(geneHas(computeBestDnaScore(s({ cvdLabel: "BEAR" })).positiveGenes, "CVD_BEAR")).toBe(true);
    expect(geneHas(computeBestDnaScore(s({ cvdLabel: "NEUT" })).positiveGenes, "CVD_NEUT")).toBe(true);
    expect(geneHas(computeBestDnaScore(s({ cvdLabel: "BULL" })).penaltyGenes, "CVD_BULL")).toBe(true);
  });

  it("handles missing telemetry neutrally and preserves raw score while clamping public score", () => {
    const sparse = computeBestDnaScore({
      shortParentBucket: "TOP_LOSER_SHORTS",
      immediateGreenImpulse: false,
      greenImpulseDetected: false,
    });
    expect(Number.isFinite(sparse.rawScore)).toBe(true);
    expect(sparse.score).toBeGreaterThanOrEqual(0);
    expect(sparse.score).toBeLessThanOrEqual(100);

    const hot = computeBestDnaScore(s({
      topGainerExhaustionScore: 200,
      topGainerExhaustionQualityScore: 200,
      shortParentBucket: "TOP_GAINER_SHORTS",
      topGainerThesisLaneLabel: "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT",
      topGainerMicroExhaustionLabel: "GAINER_MICRO_MULTI_CONFIRM",
    }));
    expect(hot.rawScore).toBeGreaterThanOrEqual(100);
    expect(hot.score).toBe(100);
  });

  it("classifies BEST DNA tier boundaries", () => {
    expect(classifyBestDnaTier(39)).toBe("BEST_DNA_LOW");
    expect(classifyBestDnaTier(40)).toBe("BEST_DNA_WATCH");
    expect(classifyBestDnaTier(55)).toBe("BEST_DNA_CANDIDATE");
    expect(classifyBestDnaTier(70)).toBe("BEST_DNA_HIGH");
    expect(classifyBestDnaTier(85)).toBe("BEST_DNA_SNIPER");
    expect(classifyBestDnaTier(95)).toBe("BEST_DNA_ELITE");
    expect(BEST_DNA_HIGH_MIN).toBe(70);
    expect(BEST_DNA_SNIPER_MIN).toBe(85);
    expect(BEST_DNA_ELITE_MIN).toBe(95);
  });

  it("scores EXH80/Q120 and emits gainer failed-breakout sniper label", () => {
    const result = evaluateBestDnaAudit(s({
      shortParentBucket: "TOP_GAINER_SHORTS",
      topGainerExhaustionScore: 80,
      topGainerExhaustionQualityScore: 120,
      topGainerThesisLaneLabel: "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT",
      topGainerMicroExhaustionLabel: "GAINER_MICRO_MULTI_CONFIRM",
      failedBreakout1m: true,
    }));

    expect(geneHas(result.bestDnaPositiveGenes, "GAINER_EXH80")).toBe(true);
    expect(geneHas(result.bestDnaPositiveGenes, "GAINER_Q120")).toBe(true);
    expect(result.bestDnaLabels).toContain("GAINER_BEST_DNA_FAILED_BREAKOUT_SNIPER");
    expect(result.bestDnaLabels).toContain("GAINER_BEST_DNA_EXH_Q120");
  });

  it("emits loser velocity shortGate and ATR1 sniper labels", () => {
    const result = evaluateBestDnaAudit(s({
      shortParentBucket: "TOP_LOSER_SHORTS",
      atrPct: 1.3,
      spreadPct: 0.02,
    }));

    expect(result.bestDnaLabels).toContain("LOSER_BEST_DNA_VELOCITY_SHORTGATE");
    expect(result.bestDnaLabels).toContain("LOSER_BEST_DNA_ATR1_SNIPER");
  });
});

describe("Post-Fee 10+ V2 potential", () => {
  it("scores candidate fingerprints and classifies tier boundaries", () => {
    const result = computePostFee10PotentialScoreV2(s({ bestDnaScore: 95 }));

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.labels).toContain("POST_FEE_10_SNIPER");
    expect(geneHas(result.positiveGenes, "POST_FEE_10_BEST_DNA_ELITE")).toBe(true);
    expect(classifyPostFee10Tier(49)).toBe("POST_FEE_10_LOW");
    expect(classifyPostFee10Tier(50)).toBe("POST_FEE_10_WATCH");
    expect(classifyPostFee10Tier(65)).toBe("POST_FEE_10_CANDIDATE");
    expect(classifyPostFee10Tier(75)).toBe("POST_FEE_10_HIGH");
    expect(classifyPostFee10Tier(85)).toBe("POST_FEE_10_SNIPER");
    expect(classifyPostFee10Tier(95)).toBe("POST_FEE_10_ELITE");
  });

  it("applies green, CVD, and buyer-acceleration penalties", () => {
    const result = computePostFee10PotentialScoreV2(s({
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
      cvdLabel: "BULL",
      priceVsVwapLabel: "ABOVE_VWAP",
      volAccel: 20,
      bestDnaScore: 90,
    }));

    expect(geneHas(result.penaltyGenes, "POST_FEE_10_IMMEDIATE_GREEN")).toBe(true);
    expect(geneHas(result.penaltyGenes, "POST_FEE_10_CVD_BULL")).toBe(true);
    expect(geneHas(result.penaltyGenes, "POST_FEE_10_ABOVE_VWAP_BUYER_ACCEL")).toBe(true);
  });

  it("keeps observer-mode flags false", () => {
    const result = evaluateBestDnaAudit(s());
    expect(result.useBestDnaEntryGate).toBe(false);
    expect(result.usePostFee10EntryGate).toBe(false);
    expect(result.useRunnerScoreForForcedExit).toBe(false);
    expect(result.useBestDnaForLeverage).toBe(false);
    expect(result.useBestDnaForPositionSizing).toBe(false);
  });
});

describe("Runner capture potential", () => {
  const entryTime = Date.parse("2026-06-07T20:00:00.000Z");
  const runner = {
    entryTime,
    entryPrice: 100,
    currentPrice: 97,
    evaluatedAtMs: entryTime + 90_000,
    priceHistory: [
      { t: entryTime, p: 100 },
      { t: entryTime + 20_000, p: 99.4 },
      { t: entryTime + 50_000, p: 98.8 },
      { t: entryTime + 90_000, p: 97.0 },
    ],
    normalizedMfePct: 3,
    priceVsVwapLabel: "BELOW_VWAP",
    cvdLabel: "BEAR",
    macdHistogram1m: -0.01,
    macdHistogramDelta1m: -0.02,
    rsi1mDelta: -1,
    greenImpulseDetectedAfterEntry: false,
    profitLockActive: true,
    activeLockFloorMarginPct: 1.2,
  };

  it("scores live runner confirmation without close-time hindsight", () => {
    const clean = computeRunnerCapturePotential(runner);
    const leaked = computeRunnerCapturePotential({
      ...runner,
      closeReason: "TP",
      finalPnlPct: 999,
      bestSimExitProfile: "RUNNER",
      exitDiagnosticLabels: ["FAST_LOCK_WOULD_HELP"],
    });

    expect(clean.runnerCapturePotentialScore).toBeGreaterThanOrEqual(75);
    expect(clean.runnerCaptureLabels).toContain("RUNNER_CAPTURE_SNIPER");
    expect(leaked.runnerCapturePotentialScore).toBe(clean.runnerCapturePotentialScore);
    expect(leaked.runnerCaptureLabels).toEqual(clean.runnerCaptureLabels);
  });

  it("detects buyer-return danger and classifies runner tier boundaries", () => {
    const dirty = computeRunnerCapturePotential({
      ...runner,
      greenImpulseDetectedAfterEntry: true,
      cvdLabel: "BULL",
      vwapContextLabel: "VWAP_RECLAIM",
    });

    expect(dirty.buyerReturnDetectedAfterEntry).toBe(true);
    expect(dirty.runnerCaptureLabels).toContain("RUNNER_BUYER_RETURN_DANGER");
    expect(classifyRunnerCaptureTier(39)).toBe("RUNNER_POTENTIAL_LOW");
    expect(classifyRunnerCaptureTier(40)).toBe("RUNNER_POTENTIAL_WATCH");
    expect(classifyRunnerCaptureTier(60)).toBe("RUNNER_POTENTIAL_HIGH");
    expect(classifyRunnerCaptureTier(75)).toBe("RUNNER_POTENTIAL_SNIPER");
    expect(classifyRunnerCaptureTier(90)).toBe("RUNNER_POTENTIAL_ELITE");
  });
});

describe("outcomes, CSV, and normalized BEST ranking", () => {
  it("computes fee-adjusted normalized and leveraged outcomes separately", () => {
    const trade = {
      feeAdjustedFinalPnlPct: 15,
      selectedLeverage: 5,
    };
    const out = flattenBestDnaOutcomeFields(trade);

    expect(feeAdjustedNormPnlPct(trade)).toBe(3);
    expect(out.feeAdjustedLeveragedPnlPct).toBe(15);
    expect(out.isPostFee10PlusWinner).toBe(true);
    expect(out.isNorm2PlusWinner).toBe(true);
    expect(out.isNorm3PlusWinner).toBe(true);
  });

  it("ranks BEST3 by normalized PnL so 5x leverage cannot outrank superior normalized 3x trade", () => {
    const ranked = assignRunBestNormRanks([
      { id: "levered-5x", run: 1, closed: true, feeAdjustedFinalPnlPct: 12.5, selectedLeverage: 5 },
      { id: "better-3x", run: 1, closed: true, feeAdjustedFinalPnlPct: 9.9, selectedLeverage: 3 },
      { id: "third", run: 1, closed: true, feeAdjustedFinalPnlPct: 6, selectedLeverage: 3 },
      { id: "fourth", run: 1, closed: true, feeAdjustedFinalPnlPct: 1, selectedLeverage: 1 },
    ]);

    expect(ranked.find(t => t.id === "better-3x").runNormRank).toBe(1);
    expect(ranked.find(t => t.id === "levered-5x").runNormRank).toBe(2);
    expect(ranked.find(t => t.id === "third").isRunBest3Norm).toBe(true);
    expect(ranked.find(t => t.id === "fourth").isRunBest3Norm).toBe(false);
    expect(ranked.find(t => t.id === "better-3x").isRunBest1Norm).toBe(true);
    expect(ranked.find(t => t.id === "better-3x").runClosedTradeCount).toBe(4);
  });

  it("keeps CSV header/row alignment and JSON array preservation", () => {
    const row = bestDnaCSVRow({
      bestDnaScore: 92,
      bestDnaLabels: ["A", "B"],
      bestDnaPositiveGenes: ["ATR_GE_1(+24)"],
      bestDnaPenaltyGenes: ["CVD_BULL(-18)"],
      postFee10PotentialLabels: ["POST_FEE_10_SNIPER"],
      postFee10PositiveGenes: ["POST_FEE_10_ATR_GE_1(+22)"],
      postFee10PenaltyGenes: [],
      runnerCaptureLabels: ["RUNNER_CAPTURE_SNIPER"],
      runnerCapturePositiveGenes: ["RUNNER_MFE_2_WITHIN_120S(+16)"],
      runnerCapturePenaltyGenes: [],
    });

    expect(row).toHaveLength(BEST_DNA_CSV_HEADERS.length);
    expect(row[BEST_DNA_CSV_HEADERS.indexOf("bestDnaLabels")]).toBe('"[""A"",""B""]"');
  });
});
