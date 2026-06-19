import { describe, expect, it } from "vitest";
import { freezeLongFilterSnapshot } from "./longFilterSnapshot.js";
import { LONG_FILTER_SNAPSHOT_VERSION } from "../research/longResearchSchemaVersions.js";

describe("Long V5 compact filter snapshot", () => {
  it("includes new entry-predictive winning fields when source telemetry exists", () => {
    const snapshot = freezeLongFilterSnapshot({
      entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V5",
      longGateResearchBandV2: "GATE_PREMIUM_90",
      longMicroUpConfirmation: true,
      longMicroUpConfirmationReasons: ["LAST_3_TICKS_UP"],
      rsiLongMomentumExpansion: true,
      macdBullishExpansion: true,
      topLoserLongThesisLane: "TOP_LOSER_SCALP_REVERSAL_CANDIDATE",
      activeWinningSetupIds: ["GATE_PREMIUM_90"],
      longWinningSetupCatalogVersion: "LONG_WINNING_SETUPS_V1",
    });
    expect(snapshot.longFilterSnapshotVersion).toBe(LONG_FILTER_SNAPSHOT_VERSION);
    expect(snapshot.longMicroUpConfirmation).toBe(true);
    expect(snapshot.rsiLongMomentumExpansion).toBe(true);
    expect(snapshot.macdBullishExpansion).toBe(true);
    expect(snapshot.activeWinningSetupIds).toEqual(["GATE_PREMIUM_90"]);
  });
});
