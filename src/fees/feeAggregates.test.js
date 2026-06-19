import { describe, it, expect } from "vitest";
import { aggregateTradeFees, aggregateSymbolFees, aggregateLeverageFees } from "./feeAggregates.js";

function makeTrade(overrides) {
  return {
    closed: true,
    finalPnlPct: 1.0,
    grossMarginPnlPct: 1.0,
    feeAdjustedMarginPnlPct: 0.5,
    tradingFeeMarginPct: 0.5,
    leverage: 10,
    symbol: "BTCUSDT",
    run: 1,
    ...overrides,
  };
}

describe("aggregateTradeFees — canonical identity", () => {
  it("sum(gross) - sum(fees) ≈ sum(net) across a set of trades", () => {
    const trades = [
      makeTrade({ grossMarginPnlPct: 2.0, tradingFeeMarginPct: 1.0, feeAdjustedMarginPnlPct: 1.0 }),
      makeTrade({ grossMarginPnlPct: -2.0, tradingFeeMarginPct: 1.0, feeAdjustedMarginPnlPct: -3.0 }),
      makeTrade({ grossMarginPnlPct: 0.5, tradingFeeMarginPct: 1.0, feeAdjustedMarginPnlPct: -0.5 }),
    ];
    const agg = aggregateTradeFees(trades);
    expect(agg.grossPnlSum - agg.feeSum).toBeCloseTo(agg.netPnlSum, 3);
  });

  it("independent gross and net win rates", () => {
    const trades = [
      makeTrade({ grossMarginPnlPct: 2.0, feeAdjustedMarginPnlPct: 1.5 }),   // gross+net win
      makeTrade({ grossMarginPnlPct: 0.3, feeAdjustedMarginPnlPct: -0.2 }),   // fee flip
      makeTrade({ grossMarginPnlPct: -1.5, feeAdjustedMarginPnlPct: -2.0 }),  // both loss
    ];
    const agg = aggregateTradeFees(trades);
    expect(agg.grossWins).toBe(2);
    expect(agg.netWins).toBe(1);
    expect(agg.feeFlipCount).toBe(1);
    expect(agg.grossWinRate).toBeCloseTo(66.7, 0);
    expect(agg.netWinRate).toBeCloseTo(33.3, 0);
  });

  it("returns zero-state for empty input", () => {
    const agg = aggregateTradeFees([]);
    expect(agg.tradeCount).toBe(0);
    expect(agg.netPnlSum).toBe(0);
  });
});

describe("aggregateSymbolFees", () => {
  it("groups by symbol", () => {
    const trades = [
      makeTrade({ symbol: "BTCUSDT", grossMarginPnlPct: 2.0, feeAdjustedMarginPnlPct: 1.5 }),
      makeTrade({ symbol: "BTCUSDT", grossMarginPnlPct: -1.0, feeAdjustedMarginPnlPct: -1.5 }),
      makeTrade({ symbol: "ETHUSDT", grossMarginPnlPct: 3.0, feeAdjustedMarginPnlPct: 2.5 }),
    ];
    const rows = aggregateSymbolFees(trades);
    const btc  = rows.find(r => r.symbol === "BTCUSDT");
    const eth  = rows.find(r => r.symbol === "ETHUSDT");
    expect(btc.closedCount).toBe(2);
    expect(eth.closedCount).toBe(1);
    expect(btc.grossPnlSum).toBeCloseTo(1.0, 3);
  });
});

describe("aggregateLeverageFees", () => {
  it("groups by leverage", () => {
    const trades = [
      makeTrade({ leverage: 10, grossMarginPnlPct: 2.0, feeAdjustedMarginPnlPct: 1.5 }),
      makeTrade({ leverage: 20, grossMarginPnlPct: 1.0, feeAdjustedMarginPnlPct: -0.5 }),
    ];
    const rows = aggregateLeverageFees(trades);
    expect(rows.find(r => r.leverage === 10).closedCount).toBe(1);
    expect(rows.find(r => r.leverage === 20).feeFlipCount).toBe(1);
  });
});
