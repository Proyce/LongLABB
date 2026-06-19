// ─── LONG FILTER SNAPSHOT ─────────────────────────────────────────────────────
// Compact, reproducible ENTRY_FINAL snapshot for the LongLAB research cockpit.
// The canonical registry defines which entry-predictive source fields are frozen.
// LOG_ONLY — no snapshot field may gate or block execution.

import {
  LONG_FILTER_SNAPSHOT_VERSION,
  DATA_QUALITY,
  RECORD_SCHEMA_CLASS,
  FILTER_TIMING,
} from "./longFilterConstants.js";
import { LONG_FILTER_REGISTRY } from "./longFilterRegistry.js";

const SNAPSHOT_META_FIELDS = [
  "longParentBucket",
  "longSubBucket",
  "longShadowDecision",
  "longShadowRequiredCoveragePct",
  "longShadowPositiveReasons",
  "longShadowCautionReasons",
  "longShadowBlockReasons",
  "longShadowUnknownReasons",
  "longShadowComponentVerdicts",
  "entryResearchSchemaVersion",
  "entryResearchStatus",
];

export const ENTRY_PREDICTIVE_SNAPSHOT_FIELDS = Object.freeze(
  [...new Set([
    ...LONG_FILTER_REGISTRY
      .filter(filter => filter.timing === FILTER_TIMING.ENTRY_FINAL && filter.entryPredictive === true)
      .map(filter => filter.field),
    ...SNAPSHOT_META_FIELDS,
  ])]
);

function isKnown(value) {
  return value !== null && value !== undefined && value !== "UNKNOWN" && value !== "INSUFFICIENT_DATA";
}

function classifyDataQuality(trade) {
  // Genuine tick coverage is tracked separately during V1 and must not
  // downgrade the historical/global Long filter quality verdict.
  const globalFields = ENTRY_PREDICTIVE_SNAPSHOT_FIELDS.filter(field =>
    !/^(marketTick|entryTick|highAtrDirectional|highAtrTick|longTick)/.test(field)
  );
  const known = globalFields.filter(field => isKnown(trade?.[field])).length;
  const pct = globalFields.length
    ? (known / globalFields.length) * 100
    : 0;
  if (pct >= 90) return DATA_QUALITY.COMPLETE;
  if (pct >= 50) return DATA_QUALITY.PARTIAL;
  return DATA_QUALITY.INSUFFICIENT;
}

function classifyRecordSchema(trade, quality) {
  if (
    trade?.shortGateScore != null ||
    trade?.shortGatePass != null ||
    trade?.bucketScope === "ALL_SHORTS" ||
    (typeof trade?.microMomentumLabel === "string" && !trade?.longMicroMomentumLabel)
  ) {
    return RECORD_SCHEMA_CLASS.LEGACY_SHORT_SEMANTIC;
  }
  if (trade?.entryResearchSchemaVersion === "LONG_ENTRY_RESEARCH_V9") {
    return quality === DATA_QUALITY.COMPLETE
      ? RECORD_SCHEMA_CLASS.NATIVE_LONG_V9
      : RECORD_SCHEMA_CLASS.PARTIAL_LONG;
  }
  if (trade?.entryResearchSchemaVersion === "LONG_ENTRY_RESEARCH_V8") {
    return quality === DATA_QUALITY.COMPLETE
      ? RECORD_SCHEMA_CLASS.NATIVE_LONG_V8
      : RECORD_SCHEMA_CLASS.PARTIAL_LONG;
  }
  if (trade?.entryResearchSchemaVersion === "LONG_ENTRY_RESEARCH_V7") {
    return quality === DATA_QUALITY.COMPLETE
      ? RECORD_SCHEMA_CLASS.NATIVE_LONG_V7
      : RECORD_SCHEMA_CLASS.PARTIAL_LONG;
  }
  if (trade?.entryResearchSchemaVersion === "LONG_ENTRY_RESEARCH_V6") {
    return quality === DATA_QUALITY.COMPLETE
      ? RECORD_SCHEMA_CLASS.NATIVE_LONG_V6
      : RECORD_SCHEMA_CLASS.PARTIAL_LONG;
  }
  if (trade?.entryResearchSchemaVersion === "LONG_ENTRY_RESEARCH_V5") {
    return quality === DATA_QUALITY.COMPLETE
      ? RECORD_SCHEMA_CLASS.NATIVE_LONG_V5
      : RECORD_SCHEMA_CLASS.PARTIAL_LONG;
  }
  if (trade?.entryResearchSchemaVersion === "LONG_ENTRY_RESEARCH_V4") {
    return quality === DATA_QUALITY.COMPLETE
      ? RECORD_SCHEMA_CLASS.NATIVE_LONG_V4
      : RECORD_SCHEMA_CLASS.PARTIAL_LONG;
  }
  return RECORD_SCHEMA_CLASS.UNKNOWN_SCHEMA;
}

export function isNativeLongV9(trade) {
  return (
    trade?.longFilterSnapshotVersion === LONG_FILTER_SNAPSHOT_VERSION &&
    trade?.filterRecordSchemaClass === RECORD_SCHEMA_CLASS.NATIVE_LONG_V9
  );
}

export function isNativeLongV8(trade) {
  return trade?.filterRecordSchemaClass === RECORD_SCHEMA_CLASS.NATIVE_LONG_V8;
}

/**
 * Freezes a compact, registry-derived entry snapshot. Every active ENTRY_FINAL,
 * entry-predictive filter source field is present, including explicit nulls, so
 * verdicts can be reproduced later without retaining the full trade object.
 */
export function freezeLongFilterSnapshot(trade, opts = {}) {
  if (!trade) return trade;

  const inherited = opts.inheritedDataQuality;
  const dataQuality = inherited ?? classifyDataQuality(trade);
  const fields = {};
  for (const field of ENTRY_PREDICTIVE_SNAPSHOT_FIELDS) {
    fields[field] = trade[field] ?? null;
  }
  const missingFields = ENTRY_PREDICTIVE_SNAPSHOT_FIELDS.filter(field => !isKnown(fields[field]));
  const schemaClass = classifyRecordSchema(trade, dataQuality);

  return Object.freeze({
    longFilterSnapshotVersion: LONG_FILTER_SNAPSHOT_VERSION,
    longFilterSnapshotComputedAt: opts.computedAt ?? Date.now(),
    longFilterSnapshotTiming: FILTER_TIMING.ENTRY_FINAL,
    longFilterSnapshotFrozen: true,
    longFilterSnapshotSource: "CANONICAL_REGISTRY_ENTRY_FIELDS",
    longFilterDirection: "LONG",
    longFilterDataQuality: dataQuality,
    longFilterMissingFields: missingFields,
    filterRecordSchemaClass: schemaClass,
    legacyShortSemanticData: schemaClass === RECORD_SCHEMA_CLASS.LEGACY_SHORT_SEMANTIC,
    ...fields,
  });
}

export function isNativeLongV7(trade) {
  return (
    trade?.longFilterSnapshotVersion === LONG_FILTER_SNAPSHOT_VERSION &&
    trade?.filterRecordSchemaClass === RECORD_SCHEMA_CLASS.NATIVE_LONG_V7
  );
}

export function isNativeLongV6(trade) {
  return trade?.filterRecordSchemaClass === RECORD_SCHEMA_CLASS.NATIVE_LONG_V6;
}

export function isNativeLongV5(trade) {
  return trade?.filterRecordSchemaClass === RECORD_SCHEMA_CLASS.NATIVE_LONG_V5;
}

export function isNativeLongV4(trade) {
  return trade?.filterRecordSchemaClass === RECORD_SCHEMA_CLASS.NATIVE_LONG_V4;
}

// Compatibility alias for older callers. Prefer isNativeLongV9 for current records.
export const isNativeLongV1 = isNativeLongV9;

export function isLegacyShortSemantic(trade) {
  return trade?.legacyShortSemanticData === true ||
    trade?.filterRecordSchemaClass === RECORD_SCHEMA_CLASS.LEGACY_SHORT_SEMANTIC;
}
