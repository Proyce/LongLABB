import { describe, it, expect } from "vitest";
import {
  computeLongPricePnlPct,
  computeLongMarginPnlPct,
  computeLongSlPrice,
  computeLongTpPrice,
  updateLongTrailHigh,
  computeLongTrailStop,
  isLongTrailTriggered,
  computeLongProfitLockPrice,
  isLongProfitLockTriggered,
  computeLongMfeMae,
  updateLongMfeMae,
  computeLongFeeAdjustedPnl,
  computeClosedLongPnl,
} from "./longTradeMath.js";

// ─── PRICE PNL ───────────────────────────────────────────────────────────────

describe("computeLongPricePnlPct", () => {
  it("returns positive when price rises", () => {
    expect(computeLongPricePnlPct(100, 101)).toBeCloseTo(1.0);
  });
  it("returns negative when price falls", () => {
    expect(computeLongPricePnlPct(100, 99)).toBeCloseTo(-1.0);
  });
  it("returns zero when price unchanged", () => {
    expect(computeLongPricePnlPct(100, 100)).toBe(0);
  });
  it("returns 0 for zero entry", () => {
    expect(computeLongPricePnlPct(0, 100)).toBe(0);
  });
});

describe("computeLongMarginPnlPct", () => {
  // Spec §5.8 tests 1 and 2
  it("price rises 1% at 5x → +5% margin PnL", () => {
    expect(computeLongMarginPnlPct(100, 101, 5)).toBeCloseTo(5.0);
  });
  it("price falls 1% at 5x → -5% margin PnL", () => {
    expect(computeLongMarginPnlPct(100, 99, 5)).toBeCloseTo(-5.0);
  });
  it("scales linearly with leverage", () => {
    expect(computeLongMarginPnlPct(100, 102, 10)).toBeCloseTo(20.0);
    expect(computeLongMarginPnlPct(100, 102, 20)).toBeCloseTo(40.0);
  });
});

// ─── SL / TP ─────────────────────────────────────────────────────────────────

describe("computeLongSlPrice", () => {
  // Spec §5.8 test 3
  it("SL price is below entry", () => {
    const sl = computeLongSlPrice(100, 1.0);
    expect(sl).toBeLessThan(100);
    expect(sl).toBeCloseTo(99.0);
  });
  it("SL at 2% below entry", () => {
    expect(computeLongSlPrice(200, 2.0)).toBeCloseTo(196.0);
  });
});

describe("computeLongTpPrice", () => {
  // Spec §5.8 test 4
  it("TP price is above entry", () => {
    const tp = computeLongTpPrice(100, 3.0);
    expect(tp).toBeGreaterThan(100);
    expect(tp).toBeCloseTo(103.0);
  });
  it("TP at 5% above entry", () => {
    expect(computeLongTpPrice(200, 5.0)).toBeCloseTo(210.0);
  });
});

// ─── TRAILING STOP ───────────────────────────────────────────────────────────

describe("trailing stop", () => {
  // Spec §5.8 test 5
  it("trail high increases as price rises and never decreases", () => {
    let trailHigh = null;
    const prices = [100, 102, 105, 103, 106, 104];
    for (const p of prices) {
      trailHigh = updateLongTrailHigh(trailHigh, p);
    }
    expect(trailHigh).toBe(106);
  });

  it("trail stop is below trail high", () => {
    const stop = computeLongTrailStop(106, 1.5);
    expect(stop).toBeLessThan(106);
    expect(stop).toBeCloseTo(106 * (1 - 0.015));
  });

  it("trail triggered when current price drops to/below stop", () => {
    const stop = computeLongTrailStop(106, 1.5); // ≈ 104.41
    expect(isLongTrailTriggered(104.4, stop)).toBe(true);
    expect(isLongTrailTriggered(104.5, stop)).toBe(false);
  });

  it("trail never moves downward", () => {
    let th = 100;
    th = updateLongTrailHigh(th, 99);  // price falls — trail high must NOT decrease
    expect(th).toBe(100);
    th = updateLongTrailHigh(th, 101);
    expect(th).toBe(101);
  });
});

// ─── PROFIT LOCK ─────────────────────────────────────────────────────────────

describe("computeLongProfitLockPrice", () => {
  // Spec §5.8 test 6
  it("profit lock price is above entry", () => {
    const lockPrice = computeLongProfitLockPrice(100, 2.0, 5);
    expect(lockPrice).toBeGreaterThan(100);
    expect(lockPrice).toBeCloseTo(100.4); // 2% margin / 5x = 0.4% price
  });

  it("higher leverage → lock closer to entry", () => {
    const lock10x = computeLongProfitLockPrice(100, 2.0, 10);
    const lock5x  = computeLongProfitLockPrice(100, 2.0, 5);
    expect(lock10x).toBeLessThan(lock5x);  // 10x = 0.2% above entry; 5x = 0.4%
  });
});

describe("isLongProfitLockTriggered", () => {
  it("triggers when price drops to or below lock price", () => {
    const lock = computeLongProfitLockPrice(100, 2.0, 5); // 100.4
    expect(isLongProfitLockTriggered(100.4, lock)).toBe(true);
    expect(isLongProfitLockTriggered(100.3, lock)).toBe(true);
    expect(isLongProfitLockTriggered(100.5, lock)).toBe(false);
  });
});

// ─── MFE / MAE ───────────────────────────────────────────────────────────────

describe("computeLongMfeMae", () => {
  // Spec §5.8 test 7
  it("MFE tracks upside (positive when price rose above entry)", () => {
    const { mfePricePct } = computeLongMfeMae(100, 105, 98, 1.0);
    expect(mfePricePct).toBeCloseTo(5.0);  // positive
  });
  it("MAE tracks downside (positive magnitude when price fell below entry)", () => {
    const { maePricePct } = computeLongMfeMae(100, 105, 98, 1.0);
    expect(maePricePct).toBeCloseTo(2.0);  // positive magnitude
  });
  it("MFE and MAE are not reversed (MFE ≠ MAE)", () => {
    const { mfePricePct, maePricePct } = computeLongMfeMae(100, 110, 95, 1.0);
    expect(mfePricePct).toBeCloseTo(10.0);
    expect(maePricePct).toBeCloseTo(5.0);
    expect(mfePricePct).not.toBe(maePricePct);
  });
  it("MFE is zero when price never exceeded entry", () => {
    const { mfePricePct } = computeLongMfeMae(100, 100, 95, 1.0);
    expect(mfePricePct).toBe(0);
  });
});

describe("updateLongMfeMae incremental", () => {
  it("accumulates correctly over ticks", () => {
    let mfe = 0, mae = 0;
    for (const p of [101, 103, 102, 98, 105, 97]) {
      ({ mfePricePct: mfe, maePricePct: mae } = updateLongMfeMae(mfe, mae, 100, p));
    }
    expect(mfe).toBeCloseTo(5.0);  // highest was 105
    expect(mae).toBeCloseTo(3.0);  // lowest was 97
  });
});

// ─── FEE-ADJUSTED PNL ────────────────────────────────────────────────────────

describe("computeLongFeeAdjustedPnl", () => {
  // Spec §5.8 test 8
  it("fee adjustment is consistent across leverage values", () => {
    const leverages = [1, 3, 5, 10, 20];
    const grossNormPct = 2.0;
    const fee = 0.10;
    const slip = 0.04;
    for (const lev of leverages) {
      const { feeAdjustedNormPct, feeAdjustedMarginPct } = computeLongFeeAdjustedPnl(grossNormPct, fee, slip, lev);
      expect(feeAdjustedNormPct).toBeCloseTo(grossNormPct - fee - slip);
      expect(feeAdjustedMarginPct).toBeCloseTo(feeAdjustedNormPct * lev);
    }
  });

  it("fees reduce gross PnL", () => {
    const { feeAdjustedNormPct } = computeLongFeeAdjustedPnl(2.0, 0.10, 0.04, 5);
    expect(feeAdjustedNormPct).toBeLessThan(2.0);
    expect(feeAdjustedNormPct).toBeCloseTo(1.86);
  });
});

describe("computeClosedLongPnl", () => {
  it("profitable long: entry=100, exit=103", () => {
    const result = computeClosedLongPnl(100, 103, 5, 0.10, 0.04);
    expect(result.grossNormPct).toBeCloseTo(3.0);
    expect(result.grossMarginPct).toBeCloseTo(15.0);
    expect(result.feeAdjustedNormPct).toBeCloseTo(2.86);
    expect(result.feeAdjustedMarginPct).toBeCloseTo(14.3);
  });

  it("losing long: entry=100, exit=99", () => {
    const result = computeClosedLongPnl(100, 99, 5, 0.10, 0.04);
    expect(result.grossNormPct).toBeCloseTo(-1.0);
    expect(result.grossMarginPct).toBeCloseTo(-5.0);
    expect(result.feeAdjustedNormPct).toBeCloseTo(-1.14);
    expect(result.feeAdjustedMarginPct).toBeCloseTo(-5.7);
  });

  it("returns nulls for missing prices", () => {
    const result = computeClosedLongPnl(null, 103, 5);
    expect(result.grossNormPct).toBeNull();
  });
});
