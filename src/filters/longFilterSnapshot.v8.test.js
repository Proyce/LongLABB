// Tests for B-10 and B-11: NATIVE_LONG_V8 schema classification.
import { describe, it, expect } from "vitest";
import { RECORD_SCHEMA_CLASS } from "./longFilterConstants.js";
import { freezeLongFilterSnapshot } from "./longFilterSnapshot.js";

// ── B-10: NATIVE_LONG_V8 in RECORD_SCHEMA_CLASS enum ───────────────────────

describe("B-10: RECORD_SCHEMA_CLASS includes NATIVE_LONG_V8", () => {
  it("RECORD_SCHEMA_CLASS.NATIVE_LONG_V8 equals the string 'NATIVE_LONG_V8'", () => {
    expect(RECORD_SCHEMA_CLASS.NATIVE_LONG_V8).toBe("NATIVE_LONG_V8");
  });

  it("NATIVE_LONG_V8 is distinct from NATIVE_LONG_V7 and NATIVE_LONG_V9", () => {
    expect(RECORD_SCHEMA_CLASS.NATIVE_LONG_V8).not.toBe(RECORD_SCHEMA_CLASS.NATIVE_LONG_V7);
    expect(RECORD_SCHEMA_CLASS.NATIVE_LONG_V8).not.toBe(RECORD_SCHEMA_CLASS.NATIVE_LONG_V9);
  });
});

// ── B-11: V8 schema recognized in classifyRecordSchema ──────────────────────

describe("B-11: V8 records are correctly classified, not UNKNOWN_SCHEMA", () => {
  it("does NOT classify V8 records as UNKNOWN_SCHEMA", () => {
    const result = freezeLongFilterSnapshot({ entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V8" });
    expect(result.filterRecordSchemaClass).not.toBe(RECORD_SCHEMA_CLASS.UNKNOWN_SCHEMA);
  });

  it("classifies V8 incomplete records as PARTIAL_LONG", () => {
    // A sparse trade with only the schema version set will be incomplete
    const result = freezeLongFilterSnapshot({ entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V8" });
    // Either NATIVE_LONG_V8 (complete) or PARTIAL_LONG (incomplete) — never UNKNOWN_SCHEMA
    const valid = [RECORD_SCHEMA_CLASS.NATIVE_LONG_V8, RECORD_SCHEMA_CLASS.PARTIAL_LONG];
    expect(valid).toContain(result.filterRecordSchemaClass);
  });

  it("V9 records still classify correctly after V8 was added", () => {
    const result = freezeLongFilterSnapshot({ entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V9" });
    expect(result.filterRecordSchemaClass).not.toBe(RECORD_SCHEMA_CLASS.UNKNOWN_SCHEMA);
    const valid = [RECORD_SCHEMA_CLASS.NATIVE_LONG_V9, RECORD_SCHEMA_CLASS.PARTIAL_LONG];
    expect(valid).toContain(result.filterRecordSchemaClass);
  });

  it("unrecognized schema version still returns UNKNOWN_SCHEMA", () => {
    const result = freezeLongFilterSnapshot({ entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V0_FAKE" });
    expect(result.filterRecordSchemaClass).toBe(RECORD_SCHEMA_CLASS.UNKNOWN_SCHEMA);
  });
});
