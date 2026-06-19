import { describe, it, expect } from "vitest";
import { evaluateEntryPolicyLogOnly } from "./evaluateEntryPolicyLogOnly.js";
import { ENTRY_POLICY_LOG_ONLY_CONFIG } from "../config/entryPolicyLogOnlyConfig.js";

function makeCandidate(overrides = {}) {
  return {
    absoluteEntryScore: 75,
    absoluteEntryAdaptiveScore: 75,
    leaderboardSide: "LOSERS",
    hasRedConfirmation: true,
    greenImpulseDetected: false,
    hasGreenDanger: false,
    cvdLabel: "NEUT",
    atrPct: 0.5,
    ...overrides,
  };
}

describe("ENTRY_POLICY_LOG_ONLY_CONFIG safety guards", () => {
  it("allowExecutionImpact is false", () => {
    expect(ENTRY_POLICY_LOG_ONLY_CONFIG.allowExecutionImpact).toBe(false);
  });

  it("canBlockEntries is false", () => {
    expect(ENTRY_POLICY_LOG_ONLY_CONFIG.canBlockEntries).toBe(false);
  });

  it("canSkipCandidates is false", () => {
    expect(ENTRY_POLICY_LOG_ONLY_CONFIG.canSkipCandidates).toBe(false);
  });

  it("canReduceCapacity is false", () => {
    expect(ENTRY_POLICY_LOG_ONLY_CONFIG.canReduceCapacity).toBe(false);
  });

  it("canForceSniperOnly is false", () => {
    expect(ENTRY_POLICY_LOG_ONLY_CONFIG.canForceSniperOnly).toBe(false);
  });

  it("entryPolicyExecutionApplied config field is false", () => {
    expect(ENTRY_POLICY_LOG_ONLY_CONFIG.entryPolicyExecutionApplied).toBe(false);
  });

  it("mode is SHADOW_ONLY", () => {
    expect(ENTRY_POLICY_LOG_ONLY_CONFIG.mode).toBe("SHADOW_ONLY");
  });
});

describe("evaluateEntryPolicyLogOnly — execution safety", () => {
  it("entryPolicyExecutionApplied is always false", () => {
    const result = evaluateEntryPolicyLogOnly(makeCandidate());
    expect(result.entryPolicyExecutionApplied).toBe(false);
  });

  it("entryPolicyCanAffectExecution is always false", () => {
    const result = evaluateEntryPolicyLogOnly(makeCandidate());
    expect(result.entryPolicyCanAffectExecution).toBe(false);
  });

  it("entryPolicyExecutionApplied is false even when would block", () => {
    const result = evaluateEntryPolicyLogOnly(makeCandidate({ longAuditDanger: true }));
    expect(result.entryPolicyWouldBlock).toBe(true);
    expect(result.entryPolicyExecutionApplied).toBe(false);
  });

  it("entryPolicyCanAffectExecution is false even when would block", () => {
    const result = evaluateEntryPolicyLogOnly(makeCandidate({ longAuditDanger: true }));
    expect(result.entryPolicyWouldBlock).toBe(true);
    expect(result.entryPolicyCanAffectExecution).toBe(false);
  });

  it("does not remove a candidate even when policy says would block", () => {
    const candidate = makeCandidate({ longAuditDanger: true });
    const result = evaluateEntryPolicyLogOnly(candidate);

    expect(result.entryPolicyWouldBlock).toBe(true);
    expect(result.entryPolicyExecutionApplied).toBe(false);
    expect(result.entryPolicyCanAffectExecution).toBe(false);

    // The caller must still receive the enriched candidate.
    expect(result).toBeDefined();
  });

  it("returns a result object with all required fields", () => {
    const result = evaluateEntryPolicyLogOnly(makeCandidate());
    expect(result).toHaveProperty("entryPolicyWouldAllow");
    expect(result).toHaveProperty("entryPolicyWouldBlock");
    expect(result).toHaveProperty("entryPolicyDiagnosticDecision");
    expect(result).toHaveProperty("entryPolicyDiagnosticAction");
    expect(result).toHaveProperty("entryPolicyReasons");
    expect(result).toHaveProperty("entryPolicyQualityTier");
    expect(result).toHaveProperty("entryPolicyMode");
  });

  it("mode is SHADOW_ONLY on every result", () => {
    const r1 = evaluateEntryPolicyLogOnly(makeCandidate());
    const r2 = evaluateEntryPolicyLogOnly(makeCandidate({ cvdLabel: "BULL" }));
    expect(r1.entryPolicyMode).toBe("SHADOW_ONLY");
    expect(r2.entryPolicyMode).toBe("SHADOW_ONLY");
  });

  it("wouldAllow and wouldBlock are mutually exclusive", () => {
    const allow = evaluateEntryPolicyLogOnly(makeCandidate());
    const block = evaluateEntryPolicyLogOnly(makeCandidate({ cvdLabel: "BULL" }));
    expect(allow.entryPolicyWouldAllow).toBe(!allow.entryPolicyWouldBlock);
    expect(block.entryPolicyWouldAllow).toBe(!block.entryPolicyWouldBlock);
  });
});

describe("evaluateEntryPolicyLogOnly — quality tier", () => {
  it("classifies AES >= 95 as AES_PRIORITY_SNIPER", () => {
    // Must override both scores since evaluator reads absoluteEntryAdaptiveScore first
    const r = evaluateEntryPolicyLogOnly(
      makeCandidate({ absoluteEntryScore: 96, absoluteEntryAdaptiveScore: 96 })
    );
    expect(r.entryPolicyQualityTier).toBe("AES_PRIORITY_SNIPER");
  });

  it("classifies AES < 50 as AES_REJECT_DIAGNOSTIC", () => {
    const r = evaluateEntryPolicyLogOnly(
      makeCandidate({ absoluteEntryScore: 40, absoluteEntryAdaptiveScore: 40 })
    );
    expect(r.entryPolicyQualityTier).toBe("AES_REJECT_DIAGNOSTIC");
  });
});
