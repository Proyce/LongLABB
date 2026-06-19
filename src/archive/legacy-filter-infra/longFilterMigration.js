// ─── ARCHIVED LEGACY FILTER INFRASTRUCTURE ────────────────────────────────────
// Moved out of src/filters on review (legacy parallel export/migration schema).
// Not imported by the active cockpit. Retained for historical reference only.
// The canonical paths are src/export/longTradeExport* and
// src/migrations/migrateLongTradeRecord.js.

// ─── LONG FILTER MIGRATION ────────────────────────────────────────────────────
// Migrates legacy ShortLAB filter state to native LongLAB v1 state.
// Unsafe semantic inversions are never applied automatically.

import { DEFAULT_LONG_FILTER_STATE, makeFilterGroup, makePredicate } from "../../filters/longFilterState.js";
import { LONG_SCOPE, OPERATOR } from "../../filters/longFilterConstants.js";

const UNSAFE_SEMANTIC_FIELDS = new Set([
  "showOnlyNoGreen",
  "showOnlyCvdBearNeut",
  "showOnlyFailedBreakout",
  "showOnlyExh80",
  "showOnlyQ120",
]);

const UNSAFE_LABEL_PREFIXES = [
  "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT",
  "TOP_LOSER_BLIND_WEAKNESS_SHORT",
  "WOULD_PASS_SHORT_GATE",
  "BTC_CHOP_OK",
  "BTC_STRONG_DOWN_BOUNCE_TRAP",
];

function hasUnsafeField(legacyState) {
  return Object.entries(legacyState).some(
    ([k, v]) => UNSAFE_SEMANTIC_FIELDS.has(k) && v === true
  );
}

/**
 * Migrates legacy filter state to the new LongLAB v1 state schema.
 * Returns { state, warnings, legacyPresetsArchived }.
 *
 * Safe direct mappings are applied. Unsafe semantic inversions are NOT applied.
 */
export function migrateLegacyFiltersStateToLongV1(legacyState) {
  if (!legacyState) return { state: DEFAULT_LONG_FILTER_STATE, warnings: [], legacyPresetsArchived: [] };

  const warnings = [];
  const legacyPresetsArchived = [];
  const groups = [];

  // Scope migration
  let scope = LONG_SCOPE.ALL_LONGS;
  if (legacyState.bucketScope === "TOP_LOSER_LONGS") scope = LONG_SCOPE.TOP_LOSER_LONGS;
  else if (legacyState.bucketScope === "TOP_GAINER_LONGS") scope = LONG_SCOPE.TOP_GAINER_LONGS;
  else if (legacyState.bucketScope === "ALL_SHORTS") {
    warnings.push("Replaced ALL_SHORTS scope with ALL_LONGS");
  }

  // Gate score → Long Gate Score range
  const gatePredicates = [];
  if (typeof legacyState.minShortGateScore === "number") {
    warnings.push("Mapped minShortGateScore → LONG_GATE_SCORE GTE (semantic change: now reads longGateScore)");
    gatePredicates.push(makePredicate("LONG_GATE_SCORE", OPERATOR.GTE, legacyState.minShortGateScore));
  }
  if (typeof legacyState.maxShortGateScore === "number") {
    warnings.push("Mapped maxShortGateScore → LONG_GATE_SCORE LTE");
    gatePredicates.push(makePredicate("LONG_GATE_SCORE", OPERATOR.LTE, legacyState.maxShortGateScore));
  }
  if (legacyState.showOnlyBestDnaShortGatePass) {
    warnings.push("Mapped showOnlyBestDnaShortGatePass → LONG_GATE_PASS IS_TRUE");
    gatePredicates.push(makePredicate("LONG_GATE_PASS", OPERATOR.IS_TRUE));
  }
  if (gatePredicates.length) {
    groups.push(makeFilterGroup({ join: "AND", predicates: gatePredicates }));
  }

  // Score thresholds — these are already long-native fields
  const scorePredicates = [];
  if (typeof legacyState.minBestDnaScore === "number") {
    scorePredicates.push(makePredicate("BEST_DNA_LONG_SCORE", OPERATOR.GTE, legacyState.minBestDnaScore));
  }
  if (typeof legacyState.minPostFee10PotentialScore === "number") {
    scorePredicates.push(makePredicate("LONG_POST_FEE_10_SCORE", OPERATOR.GTE, legacyState.minPostFee10PotentialScore));
  }
  if (typeof legacyState.minAtrPct === "number") {
    scorePredicates.push(makePredicate("ATR_PCT", OPERATOR.GTE, legacyState.minAtrPct));
  }
  if (scorePredicates.length) {
    groups.push(makeFilterGroup({ join: "AND", predicates: scorePredicates }));
  }

  // ATR / Spread tier filters — already long-native
  const tierPredicates = [];
  if (legacyState.selectedBestDnaTiers?.length) {
    tierPredicates.push(makePredicate("BEST_DNA_LONG_TIER", OPERATOR.IN, legacyState.selectedBestDnaTiers));
  }
  if (legacyState.selectedPostFee10PotentialTiers?.length) {
    tierPredicates.push(makePredicate("LONG_POST_FEE_10_TIER", OPERATOR.IN, legacyState.selectedPostFee10PotentialTiers));
  }
  if (tierPredicates.length) {
    groups.push(makeFilterGroup({ join: "AND", predicates: tierPredicates }));
  }

  // Audit label filter — map WOULD_PASS_SHORT_GATE to long equivalent
  if (legacyState.selectedAuditLabels?.length) {
    const mapped = legacyState.selectedAuditLabels
      .map(l => {
        if (l === "WOULD_PASS_SHORT_GATE") {
          warnings.push(`Archived label ${l} — not a valid LongLAB audit label`);
          legacyPresetsArchived.push(l);
          return null;
        }
        return l;
      })
      .filter(Boolean);
    if (mapped.length) {
      groups.push(makeFilterGroup({
        join: "AND",
        predicates: [makePredicate("LONG_GATE_AUDIT_LABEL", OPERATOR.IN, mapped)],
      }));
    }
  }

  // BTC context labels — map from short to long equivalents when possible
  if (legacyState.selectedBtcContextLabels?.length) {
    const longBtcLabels = legacyState.selectedBtcContextLabels.map(l => {
      // Simple mapping for labels that existed in long form
      if (l === "BTC_CHOP_OK") return "BTC_CHOP_LONG_SELECTIVE";
      if (l === "BTC_STRONG_DOWN_BOUNCE_TRAP") {
        warnings.push(`Archived BTC short label ${l} — no direct long equivalent`);
        legacyPresetsArchived.push(l);
        return null;
      }
      return null; // All others were short-semantic
    }).filter(Boolean);
    if (longBtcLabels.length) {
      groups.push(makeFilterGroup({
        join: "AND",
        predicates: [makePredicate("BTC_LONG_CONTEXT_LABEL", OPERATOR.IN, longBtcLabels)],
      }));
    }
  }

  // Unsafe semantic fields — archive but do NOT invert
  for (const field of UNSAFE_SEMANTIC_FIELDS) {
    if (legacyState[field] === true) {
      warnings.push(
        `Archived unsafe field "${field}" — semantic inversion (e.g., NO_GREEN → HAS_GREEN) is not applied automatically. Review and rebuild manually.`
      );
      legacyPresetsArchived.push(field);
    }
  }

  // Outcome filters — these map directly
  const outcomeFilters = [];
  if (legacyState.showOnlyWouldPass) {
    outcomeFilters.push(makePredicate("LONG_GATE_PASS", OPERATOR.IS_TRUE));
  }
  if (legacyState.showOnlyWouldFail) {
    outcomeFilters.push(makePredicate("LONG_GATE_PASS", OPERATOR.IS_FALSE));
  }
  // Outcome-only filters go to outcomeFilters not groups
  const trueOutcomeFilters = [];
  if (legacyState.showOnlyPostFee10Plus) {
    trueOutcomeFilters.push(makePredicate("IS_POST_FEE_10_PLUS_WINNER", OPERATOR.IS_TRUE));
  }
  if (legacyState.showOnlyRunBest1Norm) {
    trueOutcomeFilters.push(makePredicate("IS_RUN_BEST_1_NORM", OPERATOR.IS_TRUE));
  }
  if (legacyState.showOnlyRunBest3Norm) {
    trueOutcomeFilters.push(makePredicate("IS_RUN_BEST_3_NORM", OPERATOR.IS_TRUE));
  }

  return {
    state: {
      ...DEFAULT_LONG_FILTER_STATE,
      scope,
      groups,
      outcomeFilters: trueOutcomeFilters,
    },
    warnings,
    legacyPresetsArchived,
  };
}

/**
 * Returns the native long field name for a legacy short field.
 * Returns null if there is no safe direct mapping.
 */
export function getNativeLongFieldForLegacy(shortField) {
  const MAP = {
    microMomentumLabel: "longMicroMomentumLabel",
    topLoserThesisLaneLabel: "topLoserLongSubBucket",
    topGainerThesisLaneLabel: "topGainerLongSubBucket",
    btcShortContextLabel: "btcLongContextLabel",
    vwapContextLabel: "vwapLongContextLabel",
    shortGateScore: "longGateScore",
    bestDnaScore: "bestDnaLongScore",
    bestDnaTier: "bestDnaLongTier",
    bestDnaLabels: "bestDnaLongLabels",
    bestDnaPenaltyGenes: "bestDnaLongPenaltyGenes",
    postFee10PotentialScoreV2: "longPostFee10Score",
    postFee10PotentialTier: "longPostFee10Tier",
    postFee10PotentialLabels: "longPostFee10Labels",
    funding: "fundingRate",
  };
  return MAP[shortField] ?? null;
}