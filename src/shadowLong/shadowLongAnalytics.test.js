import { describe, it, expect } from "vitest";
import {
  summarizeShadowLongs,
  summarizeShadowLongsByField,
  computeRescueRate,
  computeWhipsawRate,
  computeHorizonStats,
  buildHypothesisComparison,
  buildShadowLongRunSummary,
} from "./shadowLongAnalytics.js";

function makeCompleted(overrides = {}) {
  return {
    id: `audit-${Math.random()}`,
    status: "COMPLETED",
    symbol: "SOLUSDT",
    sourceShortRun: 1,
    sourceShortDurationMs: 45_000,
    shadowLongHypothesisEligible: true,
    atrPct: 0.8,
    aes: 75,
    shadowLongFeeNetNormPnlPct: 1.5,
    shadowLongFeeNetMarginPnlPct: 7.5,
    combinedCompoundedMarginPnlPct: 2.0,
    combinedFeeNetNormPnlPct: 1.0,
    mirrorFeeNetNormPnlPct: 1.5,
    atrProfileFeeNetNormPnlPct: 1.8,
    shortLossRecoveryRatio: 1.5,
    fullyRecoveredShortLoss: true,
    partialRecovery: false,
    mirrorCloseReason: "TP",
    durationMs: 120_000,
    grossMfeNormPct: 3.5,
    grossMaeNormPct: -0.5,
    btcDirection: "UP",
    btcRegime: "BULL",
    ethDirection: "UP",
    cvdLabel: "CVD_BULLISH",
    last3TicksDirection: "UP",
    sourceShortParentBucket: "TOP_LOSER_SHORTS",
    sourceShortDurationLabel: "SHORT_SL_WITHIN_60S",
    shadowLongAtrClass: "ATR_HIGH",
    shadowLongLeverage: 5,
    feeNetPnlAt60sNormPct: 1.2,
    feeNetPnlAt180sNormPct: 1.8,
    feeNetPnlAt300sNormPct: 2.0,
    outcomeLabel: "SHADOW_LONG_FULL_RESCUE_AND_PROFIT",
    ...overrides,
  };
}

describe("summarizeShadowLongs", () => {
  it("returns null for empty array", () => {
    expect(summarizeShadowLongs([])).toBeNull();
  });

  it("computes win rate correctly", () => {
    const audits = [
      makeCompleted({ shadowLongFeeNetNormPnlPct: 1.0 }),
      makeCompleted({ shadowLongFeeNetNormPnlPct: -1.0 }),
    ];
    const result = summarizeShadowLongs(audits);
    expect(result.longWinRate).toBeCloseTo(50, 1);
  });

  it("counts completed separately from all", () => {
    const audits = [
      makeCompleted(),
      { ...makeCompleted(), status: "ACTIVE" },
    ];
    const result = summarizeShadowLongs(audits);
    expect(result.audits).toBe(2);
    expect(result.completed).toBe(1);
  });

  it("computes full rescue rate", () => {
    const audits = [
      makeCompleted({ fullyRecoveredShortLoss: true }),
      makeCompleted({ fullyRecoveredShortLoss: false }),
    ];
    const result = summarizeShadowLongs(audits);
    expect(result.fullRescueRate).toBeCloseTo(50, 1);
  });

  it("includes sample confidence flag", () => {
    const audits = [makeCompleted()];
    const result = summarizeShadowLongs(audits);
    expect(result.sampleConfidence).toBe("VERY_SMALL_SAMPLE");
  });

  it("RESEARCH_WORTHY for 100+ audits", () => {
    const audits = Array.from({ length: 100 }, () => makeCompleted());
    const result = summarizeShadowLongs(audits);
    expect(result.sampleConfidence).toBe("RESEARCH_WORTHY");
  });
});

describe("summarizeShadowLongsByField", () => {
  it("groups by source duration label", () => {
    const audits = [
      makeCompleted({ sourceShortDurationLabel: "SHORT_SL_WITHIN_15S" }),
      makeCompleted({ sourceShortDurationLabel: "SHORT_SL_WITHIN_60S" }),
      makeCompleted({ sourceShortDurationLabel: "SHORT_SL_WITHIN_60S" }),
    ];
    const rows = summarizeShadowLongsByField(audits, a => a.sourceShortDurationLabel);
    const g60 = rows.find(r => r.label === "SHORT_SL_WITHIN_60S");
    expect(g60).toBeDefined();
    expect(g60.audits).toBe(2);
  });

  it("skips null field values", () => {
    const audits = [
      makeCompleted({ sourceShortDurationLabel: null }),
      makeCompleted({ sourceShortDurationLabel: "SHORT_SL_WITHIN_30S" }),
    ];
    const rows = summarizeShadowLongsByField(audits, a => a.sourceShortDurationLabel);
    expect(rows.find(r => r.label === null)).toBeUndefined();
    expect(rows.length).toBe(1);
  });
});

describe("computeRescueRate", () => {
  it("returns null rates for no completed audits", () => {
    const result = computeRescueRate([]);
    expect(result.full).toBeNull();
  });

  it("computes full rescue rate correctly", () => {
    const audits = [
      makeCompleted({ fullyRecoveredShortLoss: true }),
      makeCompleted({ fullyRecoveredShortLoss: false }),
    ];
    const result = computeRescueRate(audits);
    expect(result.full).toBeCloseTo(50, 1);
  });
});

describe("computeWhipsawRate", () => {
  it("detects whipsaws (fast SHORT SL + fast LONG SL)", () => {
    const audits = [
      makeCompleted({ sourceShortDurationMs: 30_000, mirrorCloseReason: "SL", durationMs: 25_000 }),
      makeCompleted({ sourceShortDurationMs: 90_000, mirrorCloseReason: "SL", durationMs: 25_000 }),
    ];
    const result = computeWhipsawRate(audits);
    expect(result.count).toBe(1);
    expect(result.rate).toBeCloseTo(50, 1);
  });
});

describe("computeHorizonStats", () => {
  it("returns all 7 horizons", () => {
    const stats = computeHorizonStats([makeCompleted()]);
    expect(stats).toHaveLength(7);
    expect(stats.map(s => s.label)).toContain("1m");
    expect(stats.map(s => s.label)).toContain("10m");
  });

  it("win rate at 1m from data", () => {
    const audits = [
      makeCompleted({ feeNetPnlAt60sNormPct: 1.5 }),
      makeCompleted({ feeNetPnlAt60sNormPct: -0.5 }),
    ];
    const stats = computeHorizonStats(audits);
    const m1 = stats.find(s => s.label === "1m");
    expect(m1.winRate).toBeCloseTo(50, 1);
  });
});

describe("buildHypothesisComparison", () => {
  it("splits into 3 groups", () => {
    const result = buildHypothesisComparison([
      makeCompleted({ atrPct: 0.8, sourceShortDurationMs: 45_000, shadowLongHypothesisEligible: true }),
      makeCompleted({ atrPct: 0.3, sourceShortDurationMs: 45_000, shadowLongHypothesisEligible: false }),
      makeCompleted({ atrPct: 0.9, sourceShortDurationMs: 90_000, shadowLongHypothesisEligible: false }),
    ]);
    expect(result.strictHypothesis.label).toBe("ATR≥0.6 + SL≤60s");
    expect(result.lowAtrComparison.label).toBe("ATR<0.6 + SL≤60s");
    expect(result.slowSlComparison.label).toBe("ATR≥0.6 + SL 60-180s");
  });
});

describe("buildShadowLongRunSummary", () => {
  it("groups by run", () => {
    const audits = [
      makeCompleted({ sourceShortRun: 1 }),
      makeCompleted({ sourceShortRun: 1 }),
      makeCompleted({ sourceShortRun: 2 }),
    ];
    const rows = buildShadowLongRunSummary(audits);
    const r1 = rows.find(r => r.label === "Run 1");
    expect(r1.audits).toBe(2);
  });
});
