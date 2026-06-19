import { describe, it, expect } from "vitest";
import {
  computePercentOnlyFees,
  computeNotionalAwareFees,
  computeFeeAccounting,
  computeProjectedExitFeeAtFloor,
} from "./feeAccounting.js";
import { DEFAULT_FEE_CONFIG } from "./feeConfig.js";

// ─── computePercentOnlyFees ───────────────────────────────────────────────────

describe("computePercentOnlyFees", () => {
  it("3× taker/taker: entry+exit margin fees = 0.15% each, round-trip = 0.30%", () => {
    const r = computePercentOnlyFees({ leverage: 3, entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 });
    expect(r.entryFeeMarginPct).toBe(0.15);
    expect(r.projectedExitFeeMarginPct).toBe(0.15);
    expect(r.projectedRoundTripFeeMarginPct).toBe(0.30);
    expect(r.feeCalculationStatus).toBe("PERCENT_ONLY");
    expect(r.totalTradingFeeUsd).toBeNull();
  });

  it("5× taker/taker: round-trip = 0.50%", () => {
    const r = computePercentOnlyFees({ leverage: 5, entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 });
    expect(r.projectedRoundTripFeeMarginPct).toBe(0.50);
  });

  it("10× taker/taker: round-trip = 1.00%", () => {
    const r = computePercentOnlyFees({ leverage: 10, entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 });
    expect(r.projectedRoundTripFeeMarginPct).toBe(1.00);
  });

  it("20× taker/taker: round-trip = 2.00%", () => {
    const r = computePercentOnlyFees({ leverage: 20, entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 });
    expect(r.projectedRoundTripFeeMarginPct).toBe(2.00);
  });

  it("maker/taker: entry 0.02%, exit 0.05%", () => {
    const r = computePercentOnlyFees({ leverage: 10, entryFeeRatePct: 0.02, exitFeeRatePct: 0.05 });
    expect(r.entryFeeMarginPct).toBe(0.20);
    expect(r.projectedExitFeeMarginPct).toBe(0.50);
    expect(r.projectedRoundTripFeeMarginPct).toBe(0.70);
  });

  it("maker/maker: both 0.02%", () => {
    const r = computePercentOnlyFees({ leverage: 5, entryFeeRatePct: 0.02, exitFeeRatePct: 0.02 });
    expect(r.projectedRoundTripFeeMarginPct).toBe(0.20);
  });

  it("falls back to leverage=1 when 0 given", () => {
    const r = computePercentOnlyFees({ leverage: 0, entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 });
    expect(r.projectedRoundTripFeeMarginPct).toBe(0.10);
  });
});

// ─── computeFeeAccounting — closed trade ────────────────────────────────────

describe("computeFeeAccounting — closed trade positive gross / net", () => {
  it("scenario 1: 5× +2.0% gross → +1.50% net after 0.50% fees", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: 2.0,
      leverage: 5,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05, feeSource: "SIMULATED_CONFIG" },
    });
    expect(r.grossMarginPnlPct).toBe(2.0);
    expect(r.tradingFeeMarginPct).toBe(0.50);
    expect(r.feeAdjustedMarginPnlPct).toBe(1.5);
    expect(r.feeAdjustedMarginPnlPct).toBeGreaterThan(0); // net winner
  });

  it("scenario 2: 5× +0.25% gross → -0.25% net (fee flip)", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: 0.25,
      leverage: 5,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05, feeSource: "SIMULATED_CONFIG" },
    });
    expect(r.grossMarginPnlPct).toBe(0.25);
    expect(r.feeAdjustedMarginPnlPct).toBe(-0.25);
    expect(r.feeAdjustedMarginPnlPct).toBeLessThan(0);
  });

  it("scenario 3: exact fee breakeven — 10× gross = 1.00%", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: 1.0,
      leverage: 10,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05, feeSource: "SIMULATED_CONFIG" },
    });
    expect(r.tradingFeeMarginPct).toBe(1.0);
    expect(r.feeAdjustedMarginPnlPct).toBeCloseTo(0, 4);
  });

  it("scenario 4: negative gross deepened by fees", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: -2.0,
      leverage: 5,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05, feeSource: "SIMULATED_CONFIG" },
    });
    expect(r.feeAdjustedMarginPnlPct).toBeLessThan(r.grossMarginPnlPct);
    expect(r.feeAdjustedMarginPnlPct).toBe(-2.5);
  });

  it("scenario 5: missing leverage defaults to 1×", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: 1.0,
      leverage: null,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05, feeSource: "SIMULATED_CONFIG" },
    });
    expect(r.tradingFeeMarginPct).toBe(0.10); // 1× drag
  });

  it("scenario 6: missing margin size — no USD totals, PERCENT_ONLY model", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: 1.5,
      leverage: 10,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 },
      marginUsedUsd: null,
    });
    expect(r.totalTradingFeeUsd).toBeNull();
    expect(r.entryFeeUsd).toBeNull();
    expect(r.feeCalculationStatus).toBe("PERCENT_ONLY");
  });

  it("canonical identity: gross - fees = net", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: 3.5,
      leverage: 10,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 },
    });
    expect(r.feeAdjustedMarginPnlPct).toBeCloseTo(r.grossMarginPnlPct - r.tradingFeeMarginPct, 4);
  });
});

describe("computeFeeAccounting — active trade", () => {
  it("scenario 7: active trade exposes projected exit fee and live net", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: 1.4,
      leverage: 5,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 },
      isActive: true,
    });
    expect(r.projectedExitFeeMarginPct).toBe(0.25);
    expect(r.exitFeeMarginPct).toBeNull(); // not finalized
    expect(r.feeAdjustedLiveMarginPnlPct).toBeCloseTo(0.90, 4);
  });
});

describe("computeFeeAccounting — notional-aware (currency)", () => {
  it("scenario 13: with position size gives USD fee totals", () => {
    const r = computeFeeAccounting({
      grossMarginPnlPct: 2.0,
      leverage: 10,
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 },
      marginUsedUsd: 100,
      entryPrice: 50000,
      currentOrExitPrice: 49000,
    });
    expect(r.totalTradingFeeUsd).not.toBeNull();
    expect(r.entryFeeUsd).toBeCloseTo(100 * 10 * 0.05 / 100, 2); // $5
    expect(r.feeCalculationStatus).toBe("COMPLETE");
  });
});

// ─── computeProjectedExitFeeAtFloor ─────────────────────────────────────────

describe("computeProjectedExitFeeAtFloor — percentage fallback", () => {
  it("10× taker 0.05%: exit fee at any floor = 0.50% margin (percentage model)", () => {
    const fee = computeProjectedExitFeeAtFloor({
      candidateGrossFloorMarginPct: 1.25,
      leverage: 10,
      marginUsedUsd: null,
      entryPrice: null,
      exitFeeRatePct: 0.05,
    });
    expect(fee).toBeCloseTo(0.50, 4);
  });

  it("20× taker 0.05%: exit fee = 1.00% margin (percentage model)", () => {
    const fee = computeProjectedExitFeeAtFloor({
      candidateGrossFloorMarginPct: 2.25,
      leverage: 20,
      marginUsedUsd: null,
      entryPrice: null,
      exitFeeRatePct: 0.05,
    });
    expect(fee).toBeCloseTo(1.00, 4);
  });
});
