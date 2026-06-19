import { describe, it, expect } from "vitest";
import { assertLongResearchOnly, LONG_RESEARCH_ONLY_CONFIG } from "./assertLongResearchOnly.js";

describe("assertLongResearchOnly — canonical config never throws", () => {
  it("LONG_RESEARCH_ONLY_CONFIG passes without error", () => {
    expect(() => assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG)).not.toThrow();
  });

  it("returns true on success", () => {
    expect(assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG)).toBe(true);
  });
});

describe("assertLongResearchOnly — throws on any live flag", () => {
  const liveFlags = [
    "entryPolicyCanAffectExecution",
    "longGateCanAffectExecution",
    "longAesCanAffectExecution",
    "longAuditCanAffectExecution",
    "longMarketContextCanAffectExecution",
    "longMarketBreadthCanAffectExecution",
    "longRunnerCanAffectExecution",
    "longPostFee10CanAffectExecution",
  ];

  for (const flag of liveFlags) {
    it(`throws when ${flag} is true`, () => {
      expect(() => {
        assertLongResearchOnly({ ...LONG_RESEARCH_ONLY_CONFIG, [flag]: true });
      }).toThrow("LongLAB research-only invariant violated");
    });
  }
});

describe("assertLongResearchOnly — stamps decision as log-only", () => {
  it("sets canAffectExecution=false and logOnly=true on decision object", () => {
    const decision = {};
    assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG, decision);
    expect(decision.canAffectExecution).toBe(false);
    expect(decision.executionApplied).toBe(false);
    expect(decision.logOnly).toBe(true);
  });

  it("does not throw when decision is undefined", () => {
    expect(() => assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG, undefined)).not.toThrow();
  });
});

describe("LONG_RESEARCH_ONLY_CONFIG — frozen and immutable", () => {
  it("is frozen (cannot assign new properties)", () => {
    expect(() => {
      LONG_RESEARCH_ONLY_CONFIG.entryPolicyCanAffectExecution = true;
    }).toThrow();
  });

  it("entryPolicyMode is SHADOW_ONLY", () => {
    expect(LONG_RESEARCH_ONLY_CONFIG.entryPolicyMode).toBe("SHADOW_ONLY");
  });

  it("all *CanAffectExecution flags are false", () => {
    const flags = Object.entries(LONG_RESEARCH_ONLY_CONFIG)
      .filter(([k]) => k.endsWith("CanAffectExecution"));
    expect(flags.length).toBeGreaterThan(0);
    for (const [, v] of flags) {
      expect(v).toBe(false);
    }
  });
});
