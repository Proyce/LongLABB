import { describe, it, expect } from "vitest";
import {
  flattenEntryPolicyLogOnly,
  entryPolicyLogOnlyCSVRow,
  ENTRY_POLICY_V2_CSV_HEADERS,
} from "./entryPolicyLogOnly.flatten.js";

function makeFullCandidate(overrides = {}) {
  return {
    absoluteEntryScore: 82,
    absoluteEntryAdaptiveScore: 82,
    entryPolicyVersion: "entry-policy-v2-log-only-2026-06",
    entryPolicyMode: "SHADOW_ONLY",
    entryPolicyEvaluatedAt: "2026-06-12T10:00:00.000Z",
    entryPolicyDiagnosticDecision: "WOULD_ALLOW_FULL",
    entryPolicyDiagnosticAction: "LOG_WOULD_EXECUTE",
    entryPolicyWouldAllow: true,
    entryPolicyWouldBlock: false,
    entryPolicyWouldReduceCapacity: false,
    entryPolicyWouldSniperOnly: false,
    entryPolicyWouldHardBlock: false,
    entryPolicyWouldWarn: false,
    entryPolicyPrimaryReason: "WOULD_ALLOW",
    entryPolicyReasons: [],
    entryPolicyRequiredAes: 73,
    entryPolicyAesGap: 9,
    entryPolicyQualityTier: "AES_HIGH_QUALITY",
    entryPolicyExecutionApplied: false,
    entryPolicyCanAffectExecution: false,
    longAuditDangerScore: 0,
    longAuditDangerLabel: "LONG_AUDIT_CLEAR",
    longAuditWouldBlock: false,
    longAuditWouldHardBlock: false,
    longAuditReasons: [],
    marketBreathScore: 15,
    marketBreathLabel: "SHORT_BREATH_CONTROLLED",
    marketBreathWouldBlock: false,
    marketBreathWouldReduceCapacity: false,
    marketBreathReasons: ["BTC_CONTROLLED_DOWN"],
    sniperShortGateVersion: "sniper-short-v1-log-only-2026-06",
    sniperShortWouldPass: true,
    sniperShortTier: "SNIPER_VALID",
    sniperShortReasons: ["QUALITY_GATE_OK"],
    sniperShortFailReasons: [],
    gainerDiagnosticGatePass: false,
    gainerDiagnosticSniperWouldPass: false,
    gainerDiagnosticGateReasons: [],
    loserDiagnosticGatePass: true,
    loserDiagnosticSniperWouldPass: false,
    loserDiagnosticGateReasons: ["RED_OK", "NO_GREEN_OK"],
    executionRankScore: 78,
    executionRankTier: "EXECUTION_RANK_VALID_LOG_ONLY",
    executionRankReasons: [],
    executionRankLogOnly: true,
    runnerCaptureEntrySafe: false,
    postFee10LiveConfirmationEntrySafe: false,
    ...overrides,
  };
}

describe("flattenEntryPolicyLogOnly — required fields present", () => {
  it("includes entryPolicyWouldBlock", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate({ entryPolicyWouldBlock: true }));
    expect(flat).toHaveProperty("entryPolicyWouldBlock");
    expect(flat.entryPolicyWouldBlock).toBe(true);
  });

  it("includes entryPolicyDiagnosticDecision", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate());
    expect(flat).toHaveProperty("entryPolicyDiagnosticDecision");
  });

  it("includes longAuditDangerLabel", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate({ longAuditDangerLabel: "LONG_AUDIT_DANGER" }));
    expect(flat.longAuditDangerLabel).toBe("LONG_AUDIT_DANGER");
  });

  it("includes marketBreathLabel", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate());
    expect(flat).toHaveProperty("marketBreathLabel");
  });

  it("includes sniperShortWouldPass", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate());
    expect(flat).toHaveProperty("sniperShortWouldPass");
  });

  it("includes executionRankScore", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate());
    expect(flat).toHaveProperty("executionRankScore");
  });
});

describe("flattenEntryPolicyLogOnly — hardcoded safety values", () => {
  it("entryPolicyExecutionApplied is always false regardless of input", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate({ entryPolicyExecutionApplied: true }));
    expect(flat.entryPolicyExecutionApplied).toBe(false);
  });

  it("entryPolicyCanAffectExecution is always false", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate({ entryPolicyCanAffectExecution: true }));
    expect(flat.entryPolicyCanAffectExecution).toBe(false);
  });

  it("executionRankLogOnly is always true", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate({ executionRankLogOnly: false }));
    expect(flat.executionRankLogOnly).toBe(true);
  });

  it("runnerCaptureEntrySafe is always false", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate({ runnerCaptureEntrySafe: true }));
    expect(flat.runnerCaptureEntrySafe).toBe(false);
  });

  it("postFee10LiveConfirmationEntrySafe is always false", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate({ postFee10LiveConfirmationEntrySafe: true }));
    expect(flat.postFee10LiveConfirmationEntrySafe).toBe(false);
  });
});

describe("flattenEntryPolicyLogOnly — null candidate", () => {
  it("returns defaults without throwing", () => {
    const flat = flattenEntryPolicyLogOnly(null);
    expect(flat).toBeDefined();
    expect(flat.entryPolicyExecutionApplied).toBe(false);
    expect(flat.executionRankLogOnly).toBe(true);
  });
});

describe("ENTRY_POLICY_V2_CSV_HEADERS", () => {
  it("includes all required export fields", () => {
    const required = [
      "entryPolicyWouldBlock",
      "entryPolicyDiagnosticDecision",
      "longAuditDangerLabel",
      "marketBreathLabel",
      "sniperShortWouldPass",
      "executionRankScore",
      "entryPolicyExecutionApplied",
      "entryPolicyCanAffectExecution",
    ];
    for (const field of required) {
      expect(ENTRY_POLICY_V2_CSV_HEADERS).toContain(field);
    }
  });

  it("has at least 40 headers", () => {
    expect(ENTRY_POLICY_V2_CSV_HEADERS.length).toBeGreaterThanOrEqual(40);
  });
});

describe("entryPolicyLogOnlyCSVRow", () => {
  it("returns an array with length matching headers", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate());
    const row = entryPolicyLogOnlyCSVRow(flat);
    expect(row.length).toBe(ENTRY_POLICY_V2_CSV_HEADERS.length);
  });

  it("hardcodes executionApplied as false in CSV row", () => {
    const flat = flattenEntryPolicyLogOnly(makeFullCandidate());
    const row = entryPolicyLogOnlyCSVRow(flat);
    const idx = ENTRY_POLICY_V2_CSV_HEADERS.indexOf("entryPolicyExecutionApplied");
    expect(row[idx]).toBe("false");
  });
});
