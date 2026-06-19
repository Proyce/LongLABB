// ─── AES V3 COMPATIBILITY FACADE ─────────────────────────────────────────────
// Delegates all calls to the V3 modular scorer at src/scoring/absoluteEntryScore/.
// All 4 existing import call-sites in short-losers-tracker.jsx continue to resolve
// without changes. V2 legacy remains available for side-by-side comparison.

import {
  computeAbsoluteEntryScoreV3,
  flattenAbsoluteEntryScoreV3,
  ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS,
  absoluteEntryScoreV3CSVRow,
  classifyAesTier,
  calculateLegacyAbsoluteEntryScoreV2,
  buildAbsoluteEntryPreviewSnapshot,
} from "./absoluteEntryScore/index.js";

// ── Primary API (V3) ──────────────────────────────────────────────────────────

export function computeAbsoluteEntryScore(s, cfg) {
  return computeAbsoluteEntryScoreV3(s, cfg);
}

export function flattenAbsoluteEntryScore(result) {
  return flattenAbsoluteEntryScoreV3(result);
}

export const ABSOLUTE_ENTRY_SCORE_CSV_HEADERS = ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS;

export function absoluteEntryScoreCSVRow(s) {
  return absoluteEntryScoreV3CSVRow(s);
}

// ── V2 compatibility aliases ──────────────────────────────────────────────────

export function classifyAbsoluteEntryTier(score) {
  return classifyAesTier(score);
}

// V3 removes binary sniper classification — returns empty object for compat.
export function classifySniperLabels() {
  return {
    sniperLabel: null,
    sniperTier: null,
    loserSniperLabel: null,
    gainerSniperLabel: null,
    tenPctCandidateLabel: null,
    isSniperCandidate: false,
    isSuperSniperCandidate: false,
    sniperReasons: [],
    sniperWarnings: [],
    sniperRejectedReasons: [],
    isUniversalShortGatePass: false,
  };
}

// ── Legacy V2 (for research comparison) ──────────────────────────────────────

export { calculateLegacyAbsoluteEntryScoreV2, buildAbsoluteEntryPreviewSnapshot };
