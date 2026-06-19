import { describe, expect, it } from "vitest";
import { evaluateLongWinningSetupMatches } from "./evaluateLongWinningSetupMatches.js";

describe("winning setup entry audit", () => {
  it("matches entry setups but excludes outcome-only exit views", () => {
    const result = evaluateLongWinningSetupMatches({
      longParentBucket: "TOP_GAINER_LONGS",
      longGateScore: 96,
      longGateTier: "PREMIUM",
      longCombosPositiveMatched: ["LONG_UNIVERSAL_CORE_V1"],
      longCombosAntiCount: 0,
    });
    expect(result.activeWinningSetupIds).toEqual(expect.arrayContaining([
      "GATE_ELITE_95",
      "GATE_PREMIUM_90",
      "GATE_TIER_PREMIUM",
      "UNIVERSAL_CORE_FORMAL_V1",
      "NO_ANTI_COMBOS",
    ]));
    expect(result.activeWinningSetupIds).not.toContain("TRAIL_ONLY");
    expect(result.canAffectExecution).toBe(false);
  });
});
