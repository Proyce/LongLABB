import { describe, expect, it } from "vitest";
import {
  freezeLongFilterSnapshot,
  isNativeLongV8,
  isNativeLongV9,
} from "../filters/longFilterSnapshot.js";
import { migrateLongTradeRecord } from "../migrations/migrateLongTradeRecord.js";

describe("tick direction V9 schema and migration", () => {
  it("recognizes native V9 and historical V8 records", () => {
    const v9 = freezeLongFilterSnapshot(
      { entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V9" },
      { inheritedDataQuality: "COMPLETE" },
    );
    const v8 = freezeLongFilterSnapshot(
      { entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V8" },
      { inheritedDataQuality: "COMPLETE" },
    );
    expect(isNativeLongV9(v9)).toBe(true);
    expect(isNativeLongV8(v8)).toBe(true);
  });

  it("migrates candle aliases without inventing genuine tick evidence", () => {
    const migrated = migrateLongTradeRecord({
      entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V8",
      last3TicksDirection: "UP",
      last5TicksDirection: "MIXED",
      last10TicksDirection: "DOWN",
    });
    expect(migrated.last3ClosedCandlesDirection).toBe("UP");
    expect(migrated.last5ClosedCandlesDirection).toBe("MIXED");
    expect(migrated.last10ClosedCandlesDirection).toBe("DOWN");
    expect(migrated.legacyTickDirectionSemantic).toBe("ONE_MINUTE_CANDLE_DIRECTION_ALIAS");
    expect(migrated.entryTickDataQuality).toBe("INSUFFICIENT");
    expect(migrated.marketTickDirectionVerdict).toBe("INSUFFICIENT");
    expect(migrated.marketTickPrimaryPattern).toBe("TICK_INSUFFICIENT");
  });
});
