// ─── LONG FILTER CONSTANTS ────────────────────────────────────────────────────
// Shared constants for the LongLAB filter subsystem.
// LOG_ONLY / RESEARCH_ONLY — no constant here may gate execution.

// The filter-snapshot version is owned by the canonical research schema module
// (spec §4 — one source of truth). Re-export it here so legacy filter modules
// that import from this file resolve the SAME identity as the research builder,
// eliminating the historical V1/V4 split (review P0 blocker 1).
export {
  LONG_FILTER_SNAPSHOT_VERSION,
  LONG_TRADE_EXPORT_VERSION as LONG_FILTER_EXPORT_VERSION,
} from "../research/longResearchSchemaVersions.js";

export const LONG_FILTER_SYSTEM_VERSION = "long-filter-v2";
export const LONG_FILTER_STATE_SCHEMA_VERSION = "long-filter-state-v1";
export const LONG_FILTER_REGISTRY_VERSION = "long-filter-registry-v2";

// ─── SCOPE ────────────────────────────────────────────────────────────────────

export const LONG_SCOPE = Object.freeze({
  ALL_LONGS: "ALL_LONGS",
  TOP_LOSER_LONGS: "TOP_LOSER_LONGS",
  TOP_GAINER_LONGS: "TOP_GAINER_LONGS",
});

// ─── TIMING CLASSIFICATION ────────────────────────────────────────────────────

export const FILTER_TIMING = Object.freeze({
  ENTRY_PREVIEW: "ENTRY_PREVIEW",
  ENTRY_FINAL: "ENTRY_FINAL",
  POST_ENTRY_LIVE: "POST_ENTRY_LIVE",
  EXIT_FINAL: "EXIT_FINAL",
  OUTCOME_ONLY: "OUTCOME_ONLY",
  HINDSIGHT_ORACLE: "HINDSIGHT_ORACLE",
});

// ─── FIELD TYPES ──────────────────────────────────────────────────────────────

export const FIELD_TYPE = Object.freeze({
  BOOLEAN: "BOOLEAN",
  NUMERIC: "NUMERIC",
  ENUM: "ENUM",
  ARRAY: "ARRAY",
  STRING: "STRING",
  TIMESTAMP: "TIMESTAMP",
});

// ─── OPERATORS ────────────────────────────────────────────────────────────────

export const OPERATOR = Object.freeze({
  // Boolean
  IS_TRUE: "IS_TRUE",
  IS_FALSE: "IS_FALSE",
  // Shared
  IS_KNOWN: "IS_KNOWN",
  IS_UNKNOWN: "IS_UNKNOWN",
  // Numeric
  GTE: "GTE",
  LTE: "LTE",
  BETWEEN: "BETWEEN",
  EQ: "EQ",
  // Enum
  IN: "IN",
  NOT_IN: "NOT_IN",
  // Array
  INCLUDES_ANY: "INCLUDES_ANY",
  INCLUDES_ALL: "INCLUDES_ALL",
  INCLUDES_NONE: "INCLUDES_NONE",
  IS_EMPTY: "IS_EMPTY",
  IS_NOT_EMPTY: "IS_NOT_EMPTY",
});

export const BOOLEAN_OPERATORS = [
  OPERATOR.IS_TRUE,
  OPERATOR.IS_FALSE,
  OPERATOR.IS_KNOWN,
  OPERATOR.IS_UNKNOWN,
];

export const NUMERIC_OPERATORS = [
  OPERATOR.GTE,
  OPERATOR.LTE,
  OPERATOR.BETWEEN,
  OPERATOR.EQ,
  OPERATOR.IS_KNOWN,
  OPERATOR.IS_UNKNOWN,
];

export const ENUM_OPERATORS = [
  OPERATOR.IN,
  OPERATOR.NOT_IN,
  OPERATOR.IS_KNOWN,
  OPERATOR.IS_UNKNOWN,
];

export const ARRAY_OPERATORS = [
  OPERATOR.INCLUDES_ANY,
  OPERATOR.INCLUDES_ALL,
  OPERATOR.INCLUDES_NONE,
  OPERATOR.IS_EMPTY,
  OPERATOR.IS_NOT_EMPTY,
  OPERATOR.IS_KNOWN,
  OPERATOR.IS_UNKNOWN,
];

// ─── COVERAGE STATUS ──────────────────────────────────────────────────────────

export const COVERAGE_STATUS = Object.freeze({
  READY: "READY",         // >= 90% known
  PARTIAL: "PARTIAL",     // 50–89.99%
  LOW: "LOW",             // 1–49.99%
  UNAVAILABLE: "UNAVAILABLE", // < 1%
});

// ─── FILTER HEALTH VOCABULARY (spec §16) ──────────────────────────────────────
export const FILTER_HEALTH = Object.freeze({
  ACTIVE: "ACTIVE",                 // implemented && coverage >= 90%
  DEGRADED: "DEGRADED",             // implemented && 0 < coverage < 90%
  NO_DATA: "NO_DATA",               // implemented && coverage = 0%
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED", // implemented = false
});

// ─── PNL METRICS ──────────────────────────────────────────────────────────────
// Explicit, unit-unambiguous metrics (review P0 blocker 2). NORMALIZED metrics
// describe per-unit (de-leveraged) outcome; MARGIN metrics describe leveraged
// margin outcome. The canonical research default is FEE_ADJUSTED_NORMALIZED.
// Legacy aliases are retained for back-compat but must not be the default.

export const PNL_METRIC = Object.freeze({
  // Canonical explicit metrics
  FEE_ADJUSTED_NORMALIZED: "FEE_ADJUSTED_NORMALIZED",
  RAW_NORMALIZED:          "RAW_NORMALIZED",
  FEE_ADJUSTED_MARGIN:     "FEE_ADJUSTED_MARGIN",
  RAW_MARGIN:              "RAW_MARGIN",

  // Legacy aliases (margin-semantics) — retained, never the default.
  GROSS_MARGIN:        "GROSS_MARGIN",
  NET_AFTER_FEES:      "NET_AFTER_FEES",
  NET_AFTER_ALL_COSTS: "NET_AFTER_ALL_COSTS",
});

// The single canonical default research metric.
export const DEFAULT_PNL_METRIC = PNL_METRIC.FEE_ADJUSTED_NORMALIZED;

// ─── RECORD SCHEMA CLASS ──────────────────────────────────────────────────────

export const RECORD_SCHEMA_CLASS = Object.freeze({
  NATIVE_LONG_V7: "NATIVE_LONG_V7",
  NATIVE_LONG_V6: "NATIVE_LONG_V6",
  NATIVE_LONG_V5: "NATIVE_LONG_V5",
  NATIVE_LONG_V4: "NATIVE_LONG_V4",
  NATIVE_LONG_V1: "NATIVE_LONG_V1", // historical compatibility only
  PARTIAL_LONG: "PARTIAL_LONG",
  LEGACY_SHORT_SEMANTIC: "LEGACY_SHORT_SEMANTIC",
  UNKNOWN_SCHEMA: "UNKNOWN_SCHEMA",
});

// ─── FILTER STATUS ────────────────────────────────────────────────────────────

export const FILTER_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  RESEARCH: "RESEARCH",
  DEPRECATED: "DEPRECATED",
  UNAVAILABLE: "UNAVAILABLE",
});

// ─── FILTER FAMILY ────────────────────────────────────────────────────────────

export const FILTER_FAMILY = Object.freeze({
  SCOPE: "SCOPE",
  UNIVERSAL_GATE: "UNIVERSAL_GATE",
  MICRO_MOMENTUM: "MICRO_MOMENTUM",
  GREEN_RED_CONFIRMATION: "GREEN_RED_CONFIRMATION",
  CVD_FLOW: "CVD_FLOW",
  VWAP_STRUCTURE: "VWAP_STRUCTURE",
  ENERGY_EXECUTION: "ENERGY_EXECUTION",
  MARKET_CONTEXT: "MARKET_CONTEXT",
  TOP_LOSER_REVERSAL: "TOP_LOSER_REVERSAL",
  TOP_GAINER_CONTINUATION: "TOP_GAINER_CONTINUATION",
  LONG_AES: "LONG_AES",
  LONG_BEST_DNA: "LONG_BEST_DNA",
  LONG_POST_FEE_10: "LONG_POST_FEE_10",
  SNIPER_LONG: "SNIPER_LONG",
  POSITIVE_COMBOS: "POSITIVE_COMBOS",
  ANTI_COMBOS: "ANTI_COMBOS",
  SHADOW_POLICY: "SHADOW_POLICY",
  EXIT_MANAGEMENT: "EXIT_MANAGEMENT",
  OUTCOME_FORENSICS: "OUTCOME_FORENSICS",
});

// ─── SAMPLE QUALITY BADGES ────────────────────────────────────────────────────

export const SAMPLE_BADGE = Object.freeze({
  TINY_SAMPLE: "TINY_SAMPLE",
  EARLY: "EARLY",
  DEVELOPING: "DEVELOPING",
  VALIDATING: "VALIDATING",
  ROBUST_SAMPLE: "ROBUST_SAMPLE",
  LARGE_SAMPLE: "LARGE_SAMPLE",
});

export function getSampleBadge(n) {
  if (n < 20)   return SAMPLE_BADGE.TINY_SAMPLE;
  if (n < 50)   return SAMPLE_BADGE.EARLY;
  if (n < 100)  return SAMPLE_BADGE.DEVELOPING;
  if (n < 300)  return SAMPLE_BADGE.VALIDATING;
  if (n < 1000) return SAMPLE_BADGE.ROBUST_SAMPLE;
  return SAMPLE_BADGE.LARGE_SAMPLE;
}

// ─── DATA QUALITY ─────────────────────────────────────────────────────────────

export const DATA_QUALITY = Object.freeze({
  COMPLETE: "COMPLETE",
  PARTIAL: "PARTIAL",
  INSUFFICIENT: "INSUFFICIENT",
});

// ─── SNAPSHOT TIMING ──────────────────────────────────────────────────────────

export const SNAPSHOT_TIMING = Object.freeze({
  ENTRY_FINAL: "ENTRY_FINAL",
  ENTRY_PREVIEW: "ENTRY_PREVIEW",
});

// ─── SAFETY CONSTANTS ─────────────────────────────────────────────────────────

export const FILTER_SAFETY = Object.freeze({
  filtersMode: "LOG_ONLY",
  filtersCanAffectExecution: false,
  filtersExecutionApplied: false,
});

// ─── GROUP OPERATORS ──────────────────────────────────────────────────────────

export const GROUP_OPERATOR = Object.freeze({
  ALL_GROUPS: "ALL_GROUPS",
  ANY_GROUPS: "ANY_GROUPS",
});

export const GROUP_JOIN = Object.freeze({
  ALL_OF:  "ALL_OF",
  ANY_OF:  "ANY_OF",
  NONE_OF: "NONE_OF",
});

// ─── FORBIDDEN SHORT FIELDS (for purity checks) ───────────────────────────────

export const FORBIDDEN_SHORT_FIELDS = [
  "ALL_SHORTS",
  "minShortGateScore",
  "maxShortGateScore",
  "showOnlyNoGreen",
  "showOnlyCvdBearNeut",
  "showOnlyBestDnaShortGatePass",
  "btcShortContextLabel",
  "shortGateScore",
  "WOULD_PASS_SHORT_GATE",
  "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT",
  "TOP_LOSER_BLIND_WEAKNESS_SHORT",
];
