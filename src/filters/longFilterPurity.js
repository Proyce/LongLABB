// ─── LONG FILTER PURITY ───────────────────────────────────────────────────────
// Runtime purity validation for the LongLAB filter subsystem.
// Detects presence of forbidden ShortLAB field references in filter state and records.

import { FORBIDDEN_SHORT_FIELDS } from "./longFilterConstants.js";

const FORBIDDEN_SHORT_LABEL_PATTERNS = [
  /ALL_SHORTS/,
  /shortGateScore/,
  /shortGatePass/,
  /WOULD_PASS_SHORT_GATE/,
  /NO_GREEN$/,
  /CVD_BEAR_NEUT/,
  /TOP_GAINER_CLASSIC_EXHAUSTION_SHORT/,
  /TOP_LOSER_BLIND_WEAKNESS_SHORT/,
  /MICRO_RED_IMPULSE/,
  /MICRO_TICKS_DOWN/,
  /_SHORT$/,
];

/**
 * Checks a filter state object for forbidden ShortLAB fields.
 * Returns an array of violations (empty = clean).
 */
export function checkFilterStatePurity(state) {
  if (!state) return [];
  const violations = [];

  for (const [key, value] of Object.entries(state)) {
    if (FORBIDDEN_SHORT_FIELDS.includes(key)) {
      violations.push({ field: key, value, rule: "FORBIDDEN_SHORT_FIELD_IN_STATE" });
    }
    if (key === "bucketScope" && value === "ALL_SHORTS") {
      violations.push({ field: key, value, rule: "ALL_SHORTS_SCOPE" });
    }
    if (key === "scope" && value === "ALL_SHORTS") {
      violations.push({ field: key, value, rule: "ALL_SHORTS_SCOPE" });
    }
  }

  // Check label arrays
  const labelArrayKeys = Object.keys(state).filter(k =>
    k.startsWith("selected") && Array.isArray(state[k])
  );
  for (const key of labelArrayKeys) {
    for (const label of state[key]) {
      for (const pattern of FORBIDDEN_SHORT_LABEL_PATTERNS) {
        if (typeof label === "string" && pattern.test(label)) {
          violations.push({ field: key, value: label, rule: "FORBIDDEN_SHORT_LABEL_IN_ARRAY" });
        }
      }
    }
  }

  return violations;
}

/**
 * Checks a trade record for legacy ShortLAB field contamination.
 * Returns violations relevant for filter analytics.
 */
export function checkTradePurity(trade) {
  if (!trade) return [];
  const violations = [];

  const shortFields = [
    "shortGateScore", "shortGatePass", "microMomentumLabel",
    "btcShortContextLabel", "vwapContextLabel", "topLoserThesisLaneLabel",
  ];

  for (const field of shortFields) {
    if (trade[field] != null && !trade[field.replace("short", "long")]) {
      violations.push({ field, value: trade[field], rule: "SHORT_FIELD_WITHOUT_LONG_EQUIVALENT" });
    }
  }

  return violations;
}

/**
 * Validates that a filter state is safe to use for long-native analytics.
 * Returns { clean: boolean, violations: [] }.
 */
export function validateFilterStatePurity(state) {
  const violations = checkFilterStatePurity(state);
  return { clean: violations.length === 0, violations };
}

/**
 * Returns a warning message for a list of purity violations.
 */
export function formatPurityWarnings(violations) {
  if (!violations.length) return null;
  return violations.map(v =>
    `[PURITY] ${v.rule}: field="${v.field}" value="${v.value}"`
  ).join("\n");
}
