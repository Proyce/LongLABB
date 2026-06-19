import { describe, it, expect } from "vitest";
import {
  FEE_CONFIG,
  computeRoundTripFeeNotionalPct,
  computeFeeDragMarginPct,
  computeNormPnlPct,
  computeFeeTelemetry,
  computeSimProfileFeeTelemetry,
} from "./feeTelemetry.js";

// ─── computeRoundTripFeeNotionalPct ──────────────────────────────────────────

describe("computeRoundTripFeeNotionalPct", () => {
  it("returns 0.10 for default 0.05% taker fee", () => {
    expect(computeRoundTripFeeNotionalPct()).toBe(0.10);
  });

  it("returns 0.06 for 0.03% taker fee", () => {
    expect(computeRoundTripFeeNotionalPct(0.03)).toBe(0.06);
  });
});

// ─── computeFeeDragMarginPct ─────────────────────────────────────────────────

describe("computeFeeDragMarginPct", () => {
  it("3x leverage: fee drag = 0.30% margin", () => {
    expect(computeFeeDragMarginPct(3)).toBe(0.30);
  });

  it("5x leverage: fee drag = 0.50% margin", () => {
    expect(computeFeeDragMarginPct(5)).toBe(0.50);
  });

  it("10x leverage: fee drag = 1.00% margin", () => {
    expect(computeFeeDragMarginPct(10)).toBe(1.00);
  });

  it("falls back to leverage=1 when given 0", () => {
    expect(computeFeeDragMarginPct(0)).toBe(0.10);
  });
});

// ─── computeNormPnlPct ───────────────────────────────────────────────────────

describe("computeNormPnlPct", () => {
  it("divides margin PnL by leverage", () => {
    expect(computeNormPnlPct(0.75, 3)).toBe(0.25);
  });

  it("returns null for non-finite input", () => {
    expect(computeNormPnlPct(null, 5)).toBeNull();
    expect(computeNormPnlPct(NaN, 5)).toBeNull();
    expect(computeNormPnlPct("bad", 5)).toBeNull();
  });

  it("falls back to leverage=1 when given 0", () => {
    expect(computeNormPnlPct(1.0, 0)).toBe(1.0);
  });
});

// ─── computeFeeTelemetry ─────────────────────────────────────────────────────

describe("computeFeeTelemetry — spec example: 3x, +0.75% margin", () => {
  const result = computeFeeTelemetry({ marginPnlPct: 0.75, leverage: 3 });

  it("rawNormPnlPct = +0.25", () => {
    expect(result.rawNormPnlPct).toBe(0.25);
  });

  it("feeDragMarginPct = 0.30", () => {
    expect(result.feeDragMarginPct).toBe(0.30);
  });

  it("feeAdjustedMarginPnlPct = +0.45", () => {
    expect(result.feeAdjustedMarginPnlPct).toBe(0.45);
  });

  it("feeAdjustedNormPnlPct = +0.15", () => {
    expect(result.feeAdjustedNormPnlPct).toBeCloseTo(0.15, 4);
  });

  it("feeStatusLabel = FEE_SAFE_WIN", () => {
    expect(result.feeStatusLabel).toBe("FEE_SAFE_WIN");
  });

  it("feeAdjustedWin = true", () => {
    expect(result.feeAdjustedWin).toBe(true);
  });
});

describe("computeFeeTelemetry — spec example: 5x, +0.25% margin (fee flip)", () => {
  const result = computeFeeTelemetry({ marginPnlPct: 0.25, leverage: 5 });

  it("rawNormPnlPct = +0.05", () => {
    expect(result.rawNormPnlPct).toBe(0.05);
  });

  it("feeDragMarginPct = 0.50", () => {
    expect(result.feeDragMarginPct).toBe(0.50);
  });

  it("feeAdjustedMarginPnlPct = -0.25", () => {
    expect(result.feeAdjustedMarginPnlPct).toBe(-0.25);
  });

  it("feeAdjustedNormPnlPct = -0.05", () => {
    expect(result.feeAdjustedNormPnlPct).toBeCloseTo(-0.05, 4);
  });

  it("feeStatusLabel = FEE_FLIPPED_WIN_TO_LOSS", () => {
    expect(result.feeStatusLabel).toBe("FEE_FLIPPED_WIN_TO_LOSS");
  });

  it("feeAdjustedLoss = true", () => {
    expect(result.feeAdjustedLoss).toBe(true);
  });

  it("feeAdjustedWin = false", () => {
    expect(result.feeAdjustedWin).toBe(false);
  });
});

describe("computeFeeTelemetry — loss trade (fee deepens loss)", () => {
  const result = computeFeeTelemetry({ marginPnlPct: -2.0, leverage: 5 });

  it("feeStatusLabel = FEE_DEEPENS_LOSS", () => {
    expect(result.feeStatusLabel).toBe("FEE_DEEPENS_LOSS");
  });

  it("feeAdjustedMarginPnlPct is more negative than raw", () => {
    expect(result.feeAdjustedMarginPnlPct).toBeLessThan(result.rawMarginPnlPct);
  });
});

describe("computeFeeTelemetry — null/NaN input", () => {
  it("returns FEE_UNKNOWN for null PnL", () => {
    const result = computeFeeTelemetry({ marginPnlPct: null, leverage: 5 });
    expect(result.feeStatusLabel).toBe("FEE_UNKNOWN");
    expect(result.rawMarginPnlPct).toBeNull();
    expect(result.feeAdjustedMarginPnlPct).toBeNull();
  });
});

describe("computeFeeTelemetry — feeMode is always TAKER_ROUND_TRIP", () => {
  it("feeMode matches config default", () => {
    const result = computeFeeTelemetry({ marginPnlPct: 1.0, leverage: 5 });
    expect(result.feeMode).toBe(FEE_CONFIG.defaultFeeMode);
  });
});

// ─── computeSimProfileFeeTelemetry ───────────────────────────────────────────

describe("computeSimProfileFeeTelemetry", () => {
  it("returns nulls when simPnl is null", () => {
    const result = computeSimProfileFeeTelemetry(null, 5);
    expect(result.marginPnlPct).toBeNull();
    expect(result.feeAdjustedMarginPnlPct).toBeNull();
  });

  it("computes margin and fee-adjusted values for a sim PnL", () => {
    const result = computeSimProfileFeeTelemetry(1.5, 5);
    expect(result.marginPnlPct).toBe(1.5);
    expect(result.normPnlPct).toBe(0.3);
    expect(result.feeAdjustedMarginPnlPct).toBe(1.0);
    expect(result.feeAdjustedNormPnlPct).toBeCloseTo(0.20, 4);
  });
});
