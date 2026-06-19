import { describe, expect, it } from "vitest";
import { computeBestDnaLongV2Shadow } from "./bestDnaLongAuditV2.js";

describe("Best DNA Long V2 shadow", () => {
  it("penalizes high ATR when strict Long confirmation is absent", () => {
    const result = computeBestDnaLongV2Shadow({
      atrPct: 1.4,
      longGateScore: 55,
      immediateGreenImpulse: false,
      greenImpulseDetected: false,
      immediateRedImpulse: false,
      entryCvdLabel: "NEUT",
    });
    expect(result.bestDnaLongV2PenaltyGenes).toContain("ATR_GE_1_UNCONFIRMED(-8)");
    expect(result.bestDnaLongV2PositiveGenes.some(gene => gene.includes("ATR_GE_1_CONFIRMED"))).toBe(false);
  });

  it("uses high ATR only as a small amplifier behind strict confirmation", () => {
    const result = computeBestDnaLongV2Shadow({
      atrPct: 1.4,
      longGateScore: 94,
      longGateTier: "PREMIUM",
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
      immediateRedImpulse: false,
      last3TicksDirection: "UP",
      rsiLongSetupLabel: "RSI_LONG_MOMENTUM_EXPANSION",
      macdBullishExpansion: true,
      entryCvdLabel: "BULL",
    });
    expect(result.bestDnaLongV2StrictDirectionalConfirmation).toBe(true);
    expect(result.bestDnaLongV2PositiveGenes).toContain("ATR_GE_1_CONFIRMED_AMPLIFIER(+4)");
    expect(result.canAffectExecution).toBe(false);
    expect(result.executionApplied).toBe(false);
  });
});
