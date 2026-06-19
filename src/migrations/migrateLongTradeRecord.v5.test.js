import { describe, expect, it } from "vitest";
import { migrateLongTradeRecord } from "./migrateLongTradeRecord.js";
import {
  LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
  LONG_FILTER_SNAPSHOT_VERSION,
} from "../research/longResearchSchemaVersions.js";

describe("legacy to V8 compact Long record migration", () => {
  it("preserves legacy values without rehydrating duplicate forensic payloads", () => {
    const migrated = migrateLongTradeRecord({
      id: "old",
      entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V4",
      longGateScore: 91,
      longGateTier: "PREMIUM",
    });
    expect(migrated.entryResearchSchemaVersion).toBe(LONG_ENTRY_RESEARCH_SCHEMA_VERSION);
    expect(migrated.longFilterSnapshotVersion).toBe(LONG_FILTER_SNAPSHOT_VERSION);
    expect(migrated.longGateTier).toBe("PREMIUM");
    expect(migrated.longMicroUpConfirmation).toBeNull();
    expect(migrated.absoluteEntryWouldPassAdaptive).toBeNull();
    expect(migrated.longCombosPositiveMatched).toEqual([]);
    expect(migrated.activeWinningSetupIds).toBeUndefined();
    expect(migrated.longWinningSetupMatchedIds).toEqual([]);
    expect(migrated.longWinningSetupMatchDetails).toBeUndefined();
    expect(migrated.longWinningSetupCatalogVersion).toBeUndefined();
    expect(migrated.profitLockFloorMissed).toBeNull();
    expect(migrated.floorExitEnforced).toBeUndefined();
  });

  it("is idempotent for current V8 records", () => {
    const once = migrateLongTradeRecord({
      entryResearchSchemaVersion: LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
      longGateScore: 95,
      longGateTier: "PREMIUM",
      longMicroUpConfirmation: true,
    });
    const twice = migrateLongTradeRecord(once);
    expect(twice).toEqual(once);
  });
});

describe("price-stream integrity hotfix migration", () => {
  it("quarantines closed trades from the unversioned websocket lifecycle build", () => {
    const migrated = migrateLongTradeRecord({
      id: "run77-not",
      closed: true,
      entryResearchSchemaVersion: LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
      positionLifecycleEngine: "INDEPENDENT_WEBSOCKET_V1",
      entryPrice: 0.0004202,
      exitPrice: 426106.0002098,
      mfe: 137187886670.53781,
      closeReason: "TRAILING_EXIT",
      strategyResearchEligible: true,
    });

    expect(migrated.priceIntegrityStatus).toBe("INVALID");
    expect(migrated.priceIntegrityFailureCode).toBe("UNVERIFIED_BOOK_TICKER_SCHEMA_V1");
    expect(migrated.strategyResearchEligible).toBe(false);
    expect(migrated.strategyResearchExclusionReason).toBe("PRICE_FEED_SCHEMA_CORRUPTION");
    expect(migrated.finalizationDataQuality).toBe("INVALID");
  });

  it("keeps versioned websocket lifecycle trades eligible", () => {
    const migrated = migrateLongTradeRecord({
      id: "clean-v2",
      closed: true,
      entryResearchSchemaVersion: LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
      positionLifecycleEngine: "INDEPENDENT_WEBSOCKET_V1",
      priceStreamSchemaVersion: "BINANCE_PRICE_STREAM_V2_2026_06_BOOK_PRICE_FIELDS",
      priceIntegrityStatus: "VALID",
      entryPrice: 100,
      exitPrice: 101,
      closeReason: "TRAILING_EXIT",
      strategyResearchEligible: true,
      finalizationDataQuality: "COMPLETE",
    });

    expect(migrated.priceIntegrityStatus).toBe("VALID");
    expect(migrated.strategyResearchEligible).toBe(true);
    expect(migrated.strategyResearchExclusionReason ?? null).toBeNull();
  });
});
