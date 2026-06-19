import { analyzeFieldInformativeness } from "./longFilterAnalytics.js";
import { describe, it, expect } from "vitest";
import { summarizeByLongField, buildLongCohortSummary, buildFeeCoverageSummary } from "./longFilterAnalytics.js";
import { PNL_METRIC } from "./longFilterConstants.js";

function makeTrade(overrides = {}) {
  return {
    id: Math.random().toString(36),
    run: 1,
    longParentBucket: "TOP_LOSER_LONGS",
    rawNormPnlPct: 1,
    feeAdjustedNormPnlPct: 0.9,
    finalPnlPct: 5,
    grossMarginPnlPct: 5,
    feeAdjustedMarginPnlPct: 4.5,
    isFinalOutcome: true,
    closeReason: "PROFIT_LOCK",
    closed: true,
    longMicroMomentumLabel: "MICRO_GREEN_IMPULSE",
    entryCvdLabel: "BULL",
    mfe: 8,
    mae: 1,
    longFilterSnapshotVersion: "LONG_FILTER_SNAPSHOT_V4",
    longFilterSnapshotTiming: "ENTRY_FINAL",
    ...overrides,
  };
}

// ─── FEE COVERAGE ─────────────────────────────────────────────────────────────

describe("buildFeeCoverageSummary", () => {
  it("counts net fee coverage correctly", () => {
    const trades = [
      makeTrade({ feeAdjustedNormPnlPct: 0.9, feeAdjustedMarginPnlPct: 4.5 }),
      makeTrade({ feeAdjustedNormPnlPct: undefined, feeAdjustedMarginPnlPct: undefined, grossMarginPnlPct: 6, finalPnlPct: 6 }),
    ];
    const s = buildFeeCoverageSummary(trades);
    expect(s.totalClosed).toBe(2);
    expect(s.withNetFeeData).toBe(1);
    expect(s.netFeeCoveragePct).toBe(50);
  });

  it("counts fee flips", () => {
    // Gross positive, net negative = fee flip
    const trades = [
      makeTrade({ rawNormPnlPct: 0.4, feeAdjustedNormPnlPct: -0.1, grossMarginPnlPct: 2, feeAdjustedMarginPnlPct: -0.5 }),
      makeTrade({ grossMarginPnlPct: 5, feeAdjustedNormPnlPct: 0.9, feeAdjustedMarginPnlPct: 4.5 }),
    ];
    const s = buildFeeCoverageSummary(trades);
    expect(s.feeFlipCount).toBe(1);
    expect(s.feeFlipRate).toBe(50);
  });

  it("missing fee data does not silently become zero fees", () => {
    const t = makeTrade({ feeAdjustedNormPnlPct: undefined, feeAdjustedMarginPnlPct: undefined });
    const s = buildFeeCoverageSummary([t]);
    expect(s.withNetFeeData).toBe(0);
    expect(s.netFeeCoveragePct).toBe(0);
  });
});

// ─── COHORT SUMMARY ───────────────────────────────────────────────────────────

describe("buildLongCohortSummary", () => {
  it("uses net after fees as primary total", () => {
    const trades = [
      makeTrade({ rawNormPnlPct: 2, feeAdjustedNormPnlPct: 1.8, grossMarginPnlPct: 10, feeAdjustedMarginPnlPct: 9 }),
      makeTrade({ rawNormPnlPct: -1, feeAdjustedNormPnlPct: -1.2, grossMarginPnlPct: -5, feeAdjustedMarginPnlPct: -6 }),
    ];
    const s = buildLongCohortSummary(trades);
    expect(s.netAfterFeesTotal).toBeCloseTo(0.6, 1);
    expect(s.grossTotal).toBeCloseTo(5, 1);
    // gross total ≠ net total
    expect(s.grossTotal).not.toBe(s.netAfterFeesTotal);
  });

  it("computes win rate from net pnl not gross", () => {
    const trades = [
      makeTrade({ rawNormPnlPct: 0.4, feeAdjustedNormPnlPct: -0.1, grossMarginPnlPct: 2, feeAdjustedMarginPnlPct: -0.5 }), // gross win, net loss
      makeTrade({ grossMarginPnlPct: 5, feeAdjustedNormPnlPct: 0.9, feeAdjustedMarginPnlPct: 4.5 }),
    ];
    const s = buildLongCohortSummary(trades);
    // Net win rate: only 1/2 trades are net positive
    expect(s.netAfterFeesWinRate).toBe(50);
  });

  it("counts fee flips", () => {
    const trades = [
      makeTrade({ rawNormPnlPct: 0.2, feeAdjustedNormPnlPct: -0.06, grossMarginPnlPct: 1, feeAdjustedMarginPnlPct: -0.3 }),
    ];
    const s = buildLongCohortSummary(trades);
    expect(s.feeFlipCount).toBe(1);
    expect(s.feeFlipRate).toBe(100);
  });

  it("computes exit type rates", () => {
    const trades = [
      makeTrade({ closeReason: "SL", rawNormPnlPct: -1, feeAdjustedNormPnlPct: -1.1, grossMarginPnlPct: -5, feeAdjustedMarginPnlPct: -5.5 }),
      makeTrade({ closeReason: "PROFIT_LOCK" }),
      makeTrade({ closeReason: "TRAIL", rawNormPnlPct: 0.6, feeAdjustedNormPnlPct: 0.5, grossMarginPnlPct: 3, feeAdjustedMarginPnlPct: 2.5 }),
    ];
    const s = buildLongCohortSummary(trades);
    expect(s.slRate).toBeCloseTo(33.3, 0);
    expect(s.profitLockRate).toBeCloseTo(33.3, 0);
    expect(s.trailRate).toBeCloseTo(33.3, 0);
  });

  it("computes bucket split", () => {
    const trades = [
      makeTrade({ longParentBucket: "TOP_LOSER_LONGS" }),
      makeTrade({ longParentBucket: "TOP_GAINER_LONGS" }),
    ];
    const s = buildLongCohortSummary(trades);
    expect(s.loserBucketCount).toBe(1);
    expect(s.gainerBucketCount).toBe(1);
  });
});

// ─── SUMMARIZE BY FIELD ───────────────────────────────────────────────────────

describe("summarizeByLongField", () => {
  it("groups by entryCvdLabel and sorts by netAfterFeesTotal descending", () => {
    const trades = [
      makeTrade({ entryCvdLabel: "BULL", rawNormPnlPct: 2, feeAdjustedNormPnlPct: 1.8, grossMarginPnlPct: 10, feeAdjustedMarginPnlPct: 9 }),
      makeTrade({ entryCvdLabel: "BULL", grossMarginPnlPct: 8, feeAdjustedMarginPnlPct: 7 }),
      makeTrade({ entryCvdLabel: "BEAR", rawNormPnlPct: -1, feeAdjustedNormPnlPct: -1.2, grossMarginPnlPct: -5, feeAdjustedMarginPnlPct: -6 }),
    ];
    const rows = summarizeByLongField(trades, "entryCvdLabel");
    expect(rows[0].key).toBe("BULL");  // higher net total
    expect(rows[0].netAfterFeesTotal).toBeCloseTo(2.7, 1);
    expect(rows[1].key).toBe("BEAR");
  });

  it("gross total does not equal net total when fees present", () => {
    const trades = [makeTrade({ rawNormPnlPct: 2, feeAdjustedNormPnlPct: 1.8, grossMarginPnlPct: 10, feeAdjustedMarginPnlPct: 9, entryCvdLabel: "BULL" })];
    const rows = summarizeByLongField(trades, "entryCvdLabel");
    expect(rows[0].grossTotal).toBe(10);
    expect(rows[0].netAfterFeesTotal).toBe(1.8);
  });

  it("assigns correct sample badge", () => {
    const trades = [makeTrade({ entryCvdLabel: "BULL" })];
    const rows = summarizeByLongField(trades, "entryCvdLabel");
    expect(rows[0].sampleBadge).toBe("TINY_SAMPLE");
  });
});


describe("field informativeness audit", () => {
  it("flags a field when more than 95% of known values are the same", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ confidence: index < 98 ? 100 : 90 }));
    const result = analyzeFieldInformativeness(rows, "confidence");
    expect(result.status).toBe("CONSTANT_OR_NEAR_CONSTANT");
    expect(result.isInformative).toBe(false);
    expect(result.dominantPct).toBe(98);
    expect(result.canAffectExecution).toBe(false);
  });

  it("accepts a genuinely varied field as informative", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ confidence: index }));
    expect(analyzeFieldInformativeness(rows, "confidence").isInformative).toBe(true);
  });
});
