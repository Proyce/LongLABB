import { describe, it, expect } from "vitest";
import {
  getGrossMarginPnlPct,
  getNetMarginPnlPct,
  getTradingFeeMarginPct,
  isGrossWinner,
  isNetWinner,
  isFeeFlipped,
} from "./feeSelectors.js";

function makeTrade(overrides = {}) {
  return {
    finalPnlPct:            null,
    grossMarginPnlPct:      null,
    feeAdjustedMarginPnlPct: null,
    tradingFeeMarginPct:    null,
    leverage:               10,
    closed: true,
    ...overrides,
  };
}

describe("getGrossMarginPnlPct", () => {
  it("prefers grossMarginPnlPct", () => {
    expect(getGrossMarginPnlPct(makeTrade({ grossMarginPnlPct: 2.0, finalPnlPct: 1.5 }))).toBe(2.0);
  });

  it("falls back to finalPnlPct for legacy records", () => {
    expect(getGrossMarginPnlPct(makeTrade({ grossMarginPnlPct: null, finalPnlPct: 1.5 }))).toBe(1.5);
  });

  it("returns null when both missing", () => {
    expect(getGrossMarginPnlPct(makeTrade())).toBeNull();
  });
});

describe("getNetMarginPnlPct", () => {
  it("returns feeAdjustedMarginPnlPct when present", () => {
    expect(getNetMarginPnlPct(makeTrade({ feeAdjustedMarginPnlPct: 1.5 }))).toBe(1.5);
  });

  it("computes gross - tradingFee when available", () => {
    expect(getNetMarginPnlPct(makeTrade({ grossMarginPnlPct: 2.0, tradingFeeMarginPct: 0.5 }))).toBe(1.5);
  });

  it("falls back to finalPnlPct - feeDragPct", () => {
    expect(getNetMarginPnlPct(makeTrade({ finalPnlPct: 2.0, feeDragPct: 0.5 }))).toBe(1.5);
  });
});

describe("isGrossWinner / isNetWinner / isFeeFlipped", () => {
  it("gross winner, net winner", () => {
    const t = makeTrade({ grossMarginPnlPct: 2.0, feeAdjustedMarginPnlPct: 1.5 });
    expect(isGrossWinner(t)).toBe(true);
    expect(isNetWinner(t)).toBe(true);
    expect(isFeeFlipped(t)).toBe(false);
  });

  it("gross winner, net loser (fee flip)", () => {
    const t = makeTrade({ grossMarginPnlPct: 0.25, feeAdjustedMarginPnlPct: -0.25 });
    expect(isGrossWinner(t)).toBe(true);
    expect(isNetWinner(t)).toBe(false);
    expect(isFeeFlipped(t)).toBe(true);
  });

  it("gross loser, net loser (no flip)", () => {
    const t = makeTrade({ grossMarginPnlPct: -2.0, feeAdjustedMarginPnlPct: -2.5 });
    expect(isGrossWinner(t)).toBe(false);
    expect(isNetWinner(t)).toBe(false);
    expect(isFeeFlipped(t)).toBe(false);
  });
});
