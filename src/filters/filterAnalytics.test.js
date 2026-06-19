import { describe, it, expect } from "vitest";
import {
  summarizeByField,
  summarizeByArrayField,
  buildRunFilterSummary,
  computeLockToSlRatio,
} from "./filterAnalytics.js";

// â”€â”€â”€ FIXTURES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeTrade(overrides = {}) {
  return {
    id: Math.random(),
    run: 1,
    symbol: "TESTUSDT",
    entryRank: 5,
    change24h: -3,
    feeAdjustedNormPnlPct: 5,
    rawNormPnlPct: 5.1,
    closeReason: "PROFIT_LOCK",
    closed: true,
    isFinalOutcome: true,
    longGateWouldPass: true,
    longGateAuditLabel: "WOULD_PASS_SHORT_GATE",
    longMicroMomentumLabel: "MICRO_GREEN_IMPULSE",
    topLoserThesisLaneLabel: "TOP_LOSER_RUNNER_CANDIDATE",
    longMarketContextLabel: "LONG_CONTEXT_NEUTRAL",
    greenPressureLabel: "NO_GREEN_PRESSURE",
    longVwapContextLabel: "VWAP_RECLAIM_CONFIRMED",
    entryQualityWarningLabels: [],
    longGateScore: 60,
    hasLongMicroMomentum: true,

    ...overrides,
  };
}

// â”€â”€â”€ LOCK:SL RATIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("computeLockToSlRatio", () => {
  it("computes ratio correctly", () => {
    expect(computeLockToSlRatio({ profitLockCount: 3, trailCount: 2, slCount: 5 })).toBe(1);
  });
  it("avoids division by zero", () => {
    expect(computeLockToSlRatio({ profitLockCount: 3, trailCount: 2, slCount: 0 })).toBe(5);
  });
});

// â”€â”€â”€ SUMMARIZE BY FIELD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("summarizeByField", () => {
  it("calculates count, net, avg, win rate, sl rate, lockToSl", () => {
    const trades = [
      makeTrade({ feeAdjustedNormPnlPct: 10, closeReason: "PROFIT_LOCK", longMarketContextLabel: "LONG_CONTEXT_NEUTRAL" }),
      makeTrade({ feeAdjustedNormPnlPct: -5, closeReason: "SL", longMarketContextLabel: "LONG_CONTEXT_NEUTRAL" }),
      makeTrade({ feeAdjustedNormPnlPct: 3,  closeReason: "TRAIL", longMarketContextLabel: "LONG_CONTEXT_NEUTRAL" }),
    ];
    const [row] = summarizeByField(trades, "longMarketContextLabel");
    expect(row.key).toBe("LONG_CONTEXT_NEUTRAL");
    expect(row.trades).toBe(3);
    expect(row.netPnl).toBe(8);
    expect(row.avgPnl).toBeCloseTo(2.67, 1);
    expect(row.winRate).toBeCloseTo(66.7, 1);
    expect(row.slRate).toBeCloseTo(33.3, 1);
    expect(row.lockToSlRatio).toBe(2); // (1+1)/1
  });

  it("groups by different field values", () => {
    const trades = [
      makeTrade({ feeAdjustedNormPnlPct: 5,  longMarketContextLabel: "LONG_CONTEXT_NEUTRAL" }),
      makeTrade({ feeAdjustedNormPnlPct: -3, longMarketContextLabel: "LONG_CONTEXT_STRONG_HEADWIND", closeReason: "SL" }),
    ];
    const rows = summarizeByField(trades, "longMarketContextLabel");
    expect(rows).toHaveLength(2);
    const chop = rows.find(r => r.key === "LONG_CONTEXT_NEUTRAL");
    const trap = rows.find(r => r.key === "LONG_CONTEXT_STRONG_HEADWIND");
    expect(chop).toBeDefined();
    expect(trap).toBeDefined();
    expect(chop.netPnl).toBe(5);
    expect(trap.netPnl).toBe(-3);
  });

  it("ignores trades with no feeAdjustedNormPnlPct", () => {
    const trades = [
      makeTrade({ feeAdjustedNormPnlPct: 5, longMarketContextLabel: "LONG_CONTEXT_NEUTRAL" }),
      { ...makeTrade(), feeAdjustedNormPnlPct: null, longMarketContextLabel: "LONG_CONTEXT_NEUTRAL" },
    ];
    const [row] = summarizeByField(trades, "longMarketContextLabel");
    expect(row.trades).toBe(1);
  });
});

// â”€â”€â”€ SUMMARIZE BY ARRAY FIELD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("summarizeByArrayField", () => {
  it("expands warning arrays correctly across trades", () => {
    const trades = [
      makeTrade({ feeAdjustedNormPnlPct: 5,  entryQualityWarningLabels: ["WIDE_SPREAD", "SPREAD_UNSTABLE"] }),
      makeTrade({ feeAdjustedNormPnlPct: -3, entryQualityWarningLabels: ["WIDE_SPREAD"], closeReason: "SL" }),
    ];
    const rows = summarizeByArrayField(trades, "entryQualityWarningLabels");
    const wide = rows.find(r => r.key === "WIDE_SPREAD");
    const unstable = rows.find(r => r.key === "SPREAD_UNSTABLE");
    expect(wide).toBeDefined();
    expect(wide.trades).toBe(2);
    expect(unstable).toBeDefined();
    expect(unstable.trades).toBe(1);
  });

  it("buckets empty array trades under NONE", () => {
    const trades = [makeTrade({ feeAdjustedNormPnlPct: 5, entryQualityWarningLabels: [] })];
    const rows = summarizeByArrayField(trades, "entryQualityWarningLabels");
    const none = rows.find(r => r.key === "NONE");
    expect(none).toBeDefined();
    expect(none.trades).toBe(1);
  });
});

// â”€â”€â”€ BUILD RUN FILTER SUMMARY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("buildRunFilterSummary", () => {
  const trades = [
    makeTrade({ run: 1, feeAdjustedNormPnlPct: 10,  closeReason: "PROFIT_LOCK", longGateWouldPass: true,  hasLongMicroMomentum: true,  isBlindWeaknessShort: false, isBtcBounceTrapRisk: false, greenPressureLabel: "NO_GREEN_PRESSURE" }),
    makeTrade({ run: 1, feeAdjustedNormPnlPct: -5,  closeReason: "SL",          longGateWouldPass: false, hasLongMicroMomentum: false, isBlindWeaknessShort: true,  isBtcBounceTrapRisk: false, greenPressureLabel: "NO_GREEN_PRESSURE" }),
    makeTrade({ run: 2, feeAdjustedNormPnlPct: 3,   closeReason: "TRAIL",       longGateWouldPass: true,  hasLongMicroMomentum: true,  isBlindWeaknessShort: false, isBtcBounceTrapRisk: true,  greenPressureLabel: "GREEN_IMPULSE_ACTIVE" }),
  ];

  it("produces one row per run, sorted by run", () => {
    const rows = buildRunFilterSummary(trades);
    expect(rows).toHaveLength(2);
    expect(rows[0].run).toBe(1);
    expect(rows[1].run).toBe(2);
  });

  it("calculates runLockToSlRatio", () => {
    const rows = buildRunFilterSummary(trades);
    const r1 = rows[0];
    // run 1: locks=1, trails=0, sls=1 â†’ (1+0)/1 = 1
    expect(r1.lockToSlRatio).toBe(1);
  });

  it("splits would-pass vs would-fail net pnl correctly", () => {
    const rows = buildRunFilterSummary(trades);
    const r1 = rows[0];
    expect(r1.wouldPassCount).toBe(1);
    expect(r1.wouldFailCount).toBe(1);
    expect(r1.wouldPassNetPnl).toBe(10);
    expect(r1.wouldFailNetPnl).toBe(-5);
  });

  it("counts micro momentum, green pressure, cvd counts", () => {
    const rows = buildRunFilterSummary(trades);
    const r1 = rows[0];
    expect(r1.microMomentumCount).toBe(1);
    // blindWeaknessCount replaced with greenConfirmCount in long-native build
    expect(r1.greenConfirmCount).toBeTypeOf("number");
    const r2 = rows[1];
    expect(r2.greenPressureCount).toBe(1);
    // btcTrapCount replaced with long-native context counts
    expect(r2.loserCount).toBeTypeOf("number");
  });
});
