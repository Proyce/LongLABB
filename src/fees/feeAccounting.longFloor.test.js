// ─── FEE ACCOUNTING: LONG FLOOR CORRECTNESS TESTS ────────────────────────────
// These tests verify the P0 fee accounting fixes:
//   1. Long floor price uses addition (price rises above entry)
//   2. Order-type-aware fee rate resolution
//   3. Profitable long exit notional > entry notional
//   4. Losing long exit notional < entry notional

import { describe, it, expect } from "vitest";
import { computeProjectedExitFeeAtFloor, computeFeeAccounting } from "./feeAccounting.js";
import { DEFAULT_FEE_CONFIG } from "./feeConfig.js";

describe("computeProjectedExitFeeAtFloor — long floor direction", () => {
  it("floor price is ABOVE entry price for profitable long", () => {
    const entryPrice = 100;
    const leverage   = 10;
    const grossFloor = 5; // 5% margin floor at 10x = 0.5% price rise

    // We test that the floor price computed is > entryPrice (long = price up)
    // The floor fee should be > what a flat entry-notional estimate would give
    const feeAtFloor = computeProjectedExitFeeAtFloor({
      candidateGrossFloorMarginPct: grossFloor,
      leverage,
      marginUsedUsd: 100,
      entryPrice,
      exitFeeRatePct: 0.05,
    });

    // A 5% margin floor at 10x means price must rise 0.5% above entry
    // So exit notional = qty * entryPrice * 1.005 > entry notional
    // And fee should be slightly above the flat entry-notional estimate
    const flatFeeEstimate = 0.05 * leverage; // 0.5%
    expect(feeAtFloor).toBeGreaterThan(flatFeeEstimate);
  });

  it("floor fee is computed using price ADDITION not subtraction", () => {
    // Regression: old code used (1 - pricePct/100) — short formula
    // Correct code uses (1 + pricePct/100) — long formula
    const entryPrice = 1000;
    const leverage   = 5;
    const grossFloor = 10; // 10% margin floor at 5x = 2% price rise

    const result = computeProjectedExitFeeAtFloor({
      candidateGrossFloorMarginPct: grossFloor,
      leverage,
      marginUsedUsd: 1000,
      entryPrice,
      exitFeeRatePct: 0.04,
    });

    // floorPrice = 1000 * (1 + 2/100) = 1020
    // qty = (1000 * 5) / 1000 = 5
    // exitNotional = 5 * 1020 = 5100
    // exitFee = 5100 * 0.04 / 100 = 2.04
    // exitFeeMarginPct = 2.04 / 1000 * 100 = 0.204
    const expected = (1000 * 5) / 1000 * (1000 * (1 + 2 / 100)) * (0.04 / 100) / 1000 * 100;
    expect(result).toBeCloseTo(expected, 4);
    // Must be ABOVE 0.04 * 5 = 0.2 (flat estimate) because exit notional > entry notional
    expect(result).toBeGreaterThan(0.04 * leverage);
  });
});

describe("computeFeeAccounting — order-type-aware fee rates", () => {
  it("maker entry uses makerFeeRatePct, not takerFeeRatePct", () => {
    const config = {
      ...DEFAULT_FEE_CONFIG,
      makerFeeRatePct: 0.02,
      takerFeeRatePct: 0.05,
      defaultEntryOrderType: "TAKER",
      defaultExitOrderType: "TAKER",
    };
    const snap = {
      entryOrderType: "MAKER",
      exitOrderType:  "TAKER",
      makerFeeRatePct: 0.02,
    };

    const result = computeFeeAccounting({
      grossMarginPnlPct: 10,
      leverage: 10,
      feeSnapshot: snap,
      config,
    });

    expect(result.entryFeeRatePct).toBeCloseTo(0.02);
    expect(result.exitFeeRatePct).toBeCloseTo(0.05);
  });

  it("taker/taker uses takerFeeRatePct for both legs", () => {
    const config = {
      ...DEFAULT_FEE_CONFIG,
      makerFeeRatePct: 0.02,
      takerFeeRatePct: 0.05,
      defaultEntryOrderType: "TAKER",
      defaultExitOrderType: "TAKER",
    };

    const result = computeFeeAccounting({
      grossMarginPnlPct: 5,
      leverage: 5,
      feeSnapshot: {},
      config,
    });

    expect(result.entryFeeRatePct).toBeCloseTo(0.05);
    expect(result.exitFeeRatePct).toBeCloseTo(0.05);
  });

  it("maker/maker uses makerFeeRatePct for both legs", () => {
    const config = {
      ...DEFAULT_FEE_CONFIG,
      makerFeeRatePct: 0.01,
      takerFeeRatePct: 0.05,
      defaultEntryOrderType: "MAKER",
      defaultExitOrderType: "MAKER",
    };

    const result = computeFeeAccounting({
      grossMarginPnlPct: 5,
      leverage: 5,
      feeSnapshot: {},
      config,
    });

    expect(result.entryFeeRatePct).toBeCloseTo(0.01);
    expect(result.exitFeeRatePct).toBeCloseTo(0.01);
  });
});

describe("exit notional vs entry notional — long direction", () => {
  it("profitable long: exit notional > entry notional", () => {
    const entryPrice = 100;
    const exitPrice  = 110; // 10% up
    const leverage   = 10;

    const result = computeFeeAccounting({
      grossMarginPnlPct: 100,
      leverage,
      feeSnapshot: {},
      marginUsedUsd: 100,
      entryPrice,
      currentOrExitPrice: exitPrice,
    });

    expect(result.exitNotionalUsd).toBeGreaterThan(result.entryNotionalUsd);
  });

  it("losing long: exit notional < entry notional", () => {
    const entryPrice = 100;
    const exitPrice  = 90; // 10% down
    const leverage   = 10;

    const result = computeFeeAccounting({
      grossMarginPnlPct: -100,
      leverage,
      feeSnapshot: {},
      marginUsedUsd: 100,
      entryPrice,
      currentOrExitPrice: exitPrice,
    });

    expect(result.exitNotionalUsd).toBeLessThan(result.entryNotionalUsd);
  });

  it("missing margin returns FALLBACK confidence not fake exactness", () => {
    const result = computeFeeAccounting({
      grossMarginPnlPct: 10,
      leverage: 5,
      feeSnapshot: {},
    });

    expect(result.feeCalculationConfidence).not.toBe("NOTIONAL_AWARE");
    expect(result.feeCalculationConfidence).toMatch(/FALLBACK|PERCENT_ONLY|SIMULATED|ESTIMATED/i);
  });
});
