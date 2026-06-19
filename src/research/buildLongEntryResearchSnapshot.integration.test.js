import { describe, it, expect } from "vitest";
import { buildLongEntryResearchSnapshot } from "./buildLongEntryResearchSnapshot.js";
import { assertUniqueExportColumns, LONG_TRADE_EXPORT_COLUMNS, serializeJson } from "../export/longTradeExportSchema.js";
import { assertLongResearchOnly } from "../safety/assertLongResearchOnly.js";

function minimalTrade(overrides = {}) {
  return {
    id: "test-1",
    symbol: "TESTUSDT",
    entryPrice: 1.0,
    entryTime: Date.now(),
    run: 1,
    ...overrides,
  };
}

describe("buildLongEntryResearchSnapshot — empty inputs", () => {
  it("returns a snapshot when called with only baseTrade", () => {
    const result = buildLongEntryResearchSnapshot({
      baseTrade: minimalTrade(),
      entryTelemetry: {},
      marketRegime: {},
      marketContext: {},
      sessionContext: {},
      computedAt: Date.now(),
    });
    expect(result).toBeDefined();
    expect(result.snapshot).toBeDefined();
    expect(result.facts).toBeDefined();
    expect(result.shadowDecision).toBeDefined();
    expect(result.dataQuality).toBeDefined();
  });

  it("snapshot is deeply frozen — cannot be mutated", () => {
    const { snapshot } = buildLongEntryResearchSnapshot({
      baseTrade: minimalTrade(),
      entryTelemetry: {},
      marketRegime: {},
      marketContext: {},
      sessionContext: {},
      computedAt: Date.now(),
    });
    expect(() => { snapshot.logOnly = false; }).toThrow();
    expect(() => { snapshot.schemaVersion = "hacked"; }).toThrow();
  });

  it("snapshot.shadowDecision.canAffectExecution is false", () => {
    const { snapshot } = buildLongEntryResearchSnapshot({
      baseTrade: minimalTrade(),
      entryTelemetry: {},
      marketRegime: {},
      marketContext: {},
      sessionContext: {},
      computedAt: Date.now(),
    });
    expect(snapshot.shadowDecision.canAffectExecution).toBe(false);
  });

  it("snapshot.shadowDecision.executionApplied is false", () => {
    const { snapshot } = buildLongEntryResearchSnapshot({
      baseTrade: minimalTrade(),
      entryTelemetry: {},
      marketRegime: {},
      marketContext: {},
      sessionContext: {},
      computedAt: Date.now(),
    });
    expect(snapshot.shadowDecision.executionApplied).toBe(false);
  });
});

describe("buildLongEntryResearchSnapshot — data quality", () => {
  it("flags INCOMPLETE when entryPrice is missing", () => {
    const { dataQuality } = buildLongEntryResearchSnapshot({
      baseTrade: { id: "t1", symbol: "TESTUSDT", run: 1 },
      entryTelemetry: {},
      marketRegime: {},
      marketContext: {},
      sessionContext: {},
      computedAt: Date.now(),
    });
    expect(dataQuality.longFilterDataQuality).toBe("INCOMPLETE");
    expect(dataQuality.longFilterMissingRequiredFields).toContain("entryPrice");
  });

  it("derives longMicroMomentumLabel before required-field quality assessment", () => {
    const { flattened, dataQuality } = buildLongEntryResearchSnapshot({
      baseTrade: minimalTrade({ leverage: 5, longParentBucket: "TOP_LOSER_LONGS" }),
      entryTelemetry: {
        immediateGreenImpulse: true,
        greenImpulseDetected: true,
        last3TicksDirection: "UP",
        hasGreenConfirmation: true,
        hasRedDanger: false,
        entryCvdLabel: "BULL",
        spreadPct: 0.05,
        atrPct: 1.2,
        longVwapContextLabel: "ABOVE_VWAP",
        entryPriceVsVwapLabel: "ABOVE_VWAP",
        hasRsiRolloverUp: true,
        macdBullishExpansion: true,
        btcMicroDirectionLabel: "UP",
        btcTacticalDirectionLabel: "UP",
        ethMicroDirectionLabel: "UP",
        btcEthAlignmentLabel: "ALIGNED_UP",
      },
      marketRegime: {},
      marketContext: {},
      sessionContext: {},
      computedAt: Date.now(),
    });
    expect(flattened.longMicroMomentumLabel).toBe("MICRO_GREEN_MULTI_CONFIRM");
    expect(dataQuality.longFilterMissingRequiredFields).not.toContain("longMicroMomentumLabel");
  });

  it("produces COMPLETE data quality when required fields present", () => {
    const { dataQuality } = buildLongEntryResearchSnapshot({
      baseTrade: minimalTrade({ leverage: 5, longParentBucket: "TOP_LOSER_LONGS" }),
      entryTelemetry: {
        longMicroMomentumLabel: "MICRO_GREEN_IMPULSE",
        hasGreenConfirmation: true,
        hasRedDanger: false,
        entryCvdLabel: "BULL",
        spreadPct: 0.05,
        atrPct: 1.2,
        longVwapContextLabel: "ABOVE_VWAP",
        entryPriceVsVwapLabel: "ABOVE_VWAP",
        hasRsiRolloverUp: true,
        macdBullishExpansion: true,
        btcMicroDirectionLabel: "UP",
        btcTacticalDirectionLabel: "UP",
        ethMicroDirectionLabel: "UP",
        btcEthAlignmentLabel: "ALIGNED_UP",
      },
      marketRegime: {},
      marketContext: {},
      sessionContext: {},
      computedAt: Date.now(),
    });
    expect(dataQuality.longFilterDataQuality).toBe("COMPLETE");
    expect(dataQuality.longFilterMissingRequiredFields).toHaveLength(0);
  });
});

describe("buildLongEntryResearchSnapshot — safety invariant", () => {
  it("throws when entryPolicyCanAffectExecution is true", () => {
    expect(() => {
      assertLongResearchOnly({ entryPolicyCanAffectExecution: true });
    }).toThrow("LongLAB research-only invariant violated");
  });

  it("does not throw with all-false config", () => {
    expect(() => {
      assertLongResearchOnly({ entryPolicyCanAffectExecution: false, longGateCanAffectExecution: false });
    }).not.toThrow();
  });
});

describe("LONG_TRADE_EXPORT_COLUMNS — schema integrity", () => {
  it("assertUniqueExportColumns does not throw", () => {
    expect(() => assertUniqueExportColumns(LONG_TRADE_EXPORT_COLUMNS)).not.toThrow();
  });

  it("serializeJson serializes objects correctly (not [object Object])", () => {
    expect(serializeJson({ a: 1 })).toBe('{"a":1}');
    expect(serializeJson(null)).toBe("");
    expect(serializeJson([1, 2])).toBe("[1,2]");
  });

  it("LONG_TRADE_EXPORT_COLUMNS has at least 20 columns", () => {
    expect(LONG_TRADE_EXPORT_COLUMNS.length).toBeGreaterThan(20);
  });

  it("every column has key, header, getValue, serialize", () => {
    for (const col of LONG_TRADE_EXPORT_COLUMNS) {
      expect(typeof col.key).toBe("string");
      expect(typeof col.header).toBe("string");
      expect(typeof col.getValue).toBe("function");
      expect(typeof col.serialize).toBe("function");
    }
  });
});
