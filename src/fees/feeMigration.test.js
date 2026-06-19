import { describe, it, expect } from "vitest";
import { migrateLegacyTrade, migrateLegacyTrades } from "./feeMigration.js";

function makeOldTrade(overrides = {}) {
  return {
    id: "t1",
    symbol: "BTCUSDT",
    finalPnlPct: 2.0,
    leverage: 10,
    run: 1,
    ...overrides,
  };
}

describe("migrateLegacyTrade", () => {
  it("preserves original finalPnlPct and maps to grossMarginPnlPct", () => {
    const migrated = migrateLegacyTrade(makeOldTrade());
    expect(migrated.finalPnlPct).toBe(2.0);
    expect(migrated.grossMarginPnlPct).toBe(2.0);
  });

  it("marks feeSource as LEGACY_RECOMPUTED", () => {
    const migrated = migrateLegacyTrade(makeOldTrade());
    expect(migrated.feeSource).toBe("LEGACY_RECOMPUTED");
    expect(migrated.feeCalculationConfidence).toBe("ESTIMATED");
  });

  it("computes feeAdjustedMarginPnlPct from leverage", () => {
    const migrated = migrateLegacyTrade(makeOldTrade({ finalPnlPct: 2.0, leverage: 10 }));
    // At 10× taker/taker: drag = 1.0%, so net = 1.0%
    expect(migrated.feeAdjustedMarginPnlPct).toBeCloseTo(1.0, 3);
    expect(migrated.tradingFeeMarginPct).toBeCloseTo(1.0, 3);
  });

  it("is idempotent — migrates only once", () => {
    const first  = migrateLegacyTrade(makeOldTrade());
    const second = migrateLegacyTrade(first);
    expect(second._feeMigrationVersion).toBe(first._feeMigrationVersion);
    expect(second.feeAdjustedMarginPnlPct).toBe(first.feeAdjustedMarginPnlPct);
  });

  it("uses existing stored fee fields when present", () => {
    const trade = makeOldTrade({ entryFeeMarginPct: 0.3, exitFeeMarginPct: 0.2 });
    const migrated = migrateLegacyTrade(trade);
    expect(migrated.entryFeeMarginPct).toBe(0.3);
    expect(migrated.exitFeeMarginPct).toBe(0.2);
    expect(migrated.tradingFeeMarginPct).toBe(0.5);
    expect(migrated.feeAdjustedMarginPnlPct).toBeCloseTo(1.5, 3);
  });

  it("handles missing leverage gracefully (INCOMPLETE status)", () => {
    const migrated = migrateLegacyTrade({ id: "t2", finalPnlPct: 1.0 });
    expect(migrated.feeCalculationStatus).toBe("INCOMPLETE");
    expect(migrated.feeAdjustedMarginPnlPct).toBeNull();
  });

  it("does not overwrite original imported fields", () => {
    const trade = makeOldTrade({ someOriginalField: "preserved" });
    const migrated = migrateLegacyTrade(trade);
    expect(migrated.someOriginalField).toBe("preserved");
  });
});

describe("migrateLegacyTrades", () => {
  it("migrates an array of trades", () => {
    const trades = [makeOldTrade(), makeOldTrade({ id: "t2", finalPnlPct: -1.0 })];
    const migrated = migrateLegacyTrades(trades);
    expect(migrated).toHaveLength(2);
    expect(migrated[0].grossMarginPnlPct).toBe(2.0);
    expect(migrated[1].grossMarginPnlPct).toBe(-1.0);
  });
});
