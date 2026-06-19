import { describe, expect, it } from "vitest";
import { buildResearchEnrichedTrade } from "../research/buildResearchEnrichedTrade.js";

const baseTrade = {
  id: "parity", symbol: "BTCUSDT", entryTime: 1_000, entryPrice: 100,
  leverage: 5, longParentBucket: "TOP_GAINER_LONGS",
};
const telemetry = {
  entryCvdLabel: "BULL", immediateGreenImpulse: true,
  hasGreenConfirmation: true, hasRedDanger: false,
  spreadPct: 0.02, atrPct: 1.1,
  longMicroMomentumLabel: "MICRO_GREEN_IMPULSE",
  entryPriceVsVwapLabel: "ABOVE_VWAP",
};

describe("tick research execution parity", () => {
  it("does not alter existing gate, AES, DNA, Runner, or PF10 outputs", () => {
    const withoutTicks = buildResearchEnrichedTrade({ baseTrade, entryTelemetry: telemetry, computedAt: 1_100 });
    const withTicks = buildResearchEnrichedTrade({
      baseTrade: {
        ...baseTrade,
        entryTickSnapshotVersion: "LONG_TICK_DIRECTION_V1_2026_06",
        entryTickDataQuality: "COMPLETE",
        entryTickCanonicalSource: "AGG_TRADE",
        entryTickFreshnessMs: 10,
        marketTickDirection3s: "DOWN",
        marketTickDirection10s: "DOWN",
        marketTickDirectionalBiasScore: -90,
        marketTickDirectionConfidenceScore: 95,
        marketTickDirectionVerdict: "STRONG_DOWN",
        marketTickPrimaryPattern: "TICK_DOWN_EXPANSION",
      },
      entryTelemetry: telemetry,
      computedAt: 1_100,
    });
    for (const field of [
      "longGateWouldPass", "longGateScore", "longGateTier",
      "longAesScore", "longAesTier",
      "bestDnaLongScore", "bestDnaLongTier",
      "longCandidateRunnerScoreAtEntry", "longCandidateRunnerTierAtEntry",
      "longPostFee10EntryScore", "longPostFee10EntryTier",
    ]) {
      expect(withTicks[field]).toEqual(withoutTicks[field]);
    }
    expect(withTicks.marketTickCanAffectExecution).toBe(false);
    expect(withTicks.marketTickExecutionApplied).toBe(false);
  });
});
