// ─── ARCHIVED LEGACY FILTER INFRASTRUCTURE ────────────────────────────────────
// Moved out of src/filters on review (legacy parallel export/migration schema).
// Not imported by the active cockpit. Retained for historical reference only.
// The canonical paths are src/export/longTradeExport* and
// src/migrations/migrateLongTradeRecord.js.

// ─── LONG FILTER EXPORT ───────────────────────────────────────────────────────
// Export helpers for filtered LongLAB results.
// Every export includes query metadata and snapshot version for reproducibility.

import {
  LONG_FILTER_EXPORT_VERSION,
  LONG_FILTER_SNAPSHOT_VERSION,
} from "../../filters/longFilterConstants.js";

const LONG_FILTER_SNAPSHOT_FIELDS = [
  "longFilterSnapshotVersion",
  "longFilterSnapshotComputedAt",
  "longFilterSnapshotTiming",
  "longFilterSnapshotFrozen",
  "longFilterSnapshotSource",
  "longFilterDirection",
  "longFilterDataQuality",
  "longFilterMissingFields",
  "filterRecordSchemaClass",
  "legacyShortSemanticData",
  // Identity
  "id", "symbol", "run", "sessionId", "archiveId", "datasetId",
  "autoRunId", "autoRunCycle", "entryTimestamp", "leaderboardSide",
  "longParentBucket", "leverage", "entryRank", "change24h", "quoteVol",
  // Universal Gate
  "longGateWouldPass", "longGateAuditLabel", "longGateFailReasons", "longGateScore",
  "hasLongMicroMomentum", "hasRsiRolloverUp", "hasGreenConfirmation", "hasRedDanger",
  "longMicroMomentumLabel", "longThesisLaneLabel",
  "btcLongContextLabel", "btcLongContextScore", "vwapLongContextLabel",
  // Directional
  "immediateGreenImpulse", "greenImpulseDetected", "immediateRedImpulse", "redImpulseDetected",
  "candleColorAtEntry", "last3TicksDirection", "rsiSpread1m3m", "rsi1mDelta",
  "rsi1mSlope", "rsi3mSlope", "macdHistogramState1m", "cvdLabel", "cvdRatio",
  // Structure
  "priceVsVwapLabel", "priceVsVwapPct",
  "failedBreakdown1m", "failedBreakdown3m", "higherLow1m", "higherLow3m",
  "breakoutRetest1m", "breakoutRetest3m", "lowerWickPct", "upperWickPct", "marketStructureLabel",
  // Energy
  "atrPct", "atrBucket", "volAccel", "spreadPct", "spreadBucket",
  "spreadStableBeforeEntry", "fundingRate", "oiPressureLabel", "trendCompositeLabel", "dmiBias5m",
  // Market context
  "btcRegime", "btcLongContextLabel", "btcLongContextScore", "btcLongTailwindScore",
  "ethRegime", "ethLongContextLabel", "crossMarketLongBiasLabel",
  "longBreathLabel", "marketBreathWouldBlock", "breadthBullishPct", "breadthBearishPct", "marketContextStale",
  // Top Loser
  "topLoserLongSubBucket", "topLoserLongScore", "topLoserReversalScore",
  "topLoserReversalThesisLabel", "topLoserReversalConfirmCount", "topLoserReversalWouldPass",
  "topLoserReversalReasons", "topLoserReversalWarnings",
  // Top Gainer
  "topGainerLongSubBucket", "topGainerLongScore", "topGainerContinuationScore",
  "topGainerBlowoffRiskScore", "topGainerContinuationThesisLabel", "topGainerContinuationDangerLabel",
  "topGainerContinuationConfirmCount", "topGainerContinuationWouldPass",
  "topGainerContinuationReasons", "topGainerContinuationWarnings",
  // Scores
  "longAesScore", "longAesTier", "longAesEligibility", "longAesConfidence", "longAesVersion",
  "bestDnaLongScore", "bestDnaLongTier", "bestDnaLongPrimaryLabel",
  "bestDnaLongLabels", "bestDnaLongPositiveGenes", "bestDnaLongPenaltyGenes", "bestDnaLongVersion",
  "longPostFee10EntryScore", "longPostFee10EntryTier", "longPostFee10Labels",
  "longPostFee10PositiveGenes", "longPostFee10PenaltyGenes", "longPostFee10ScoreVersion",
  "sniperLongWouldPass", "sniperLongTier", "sniperLongScore", "sniperLongReasons", "sniperLongFailReasons", "sniperLongVersion",
  // Combos
  "longCombosPositiveMatched", "longCombosAntiMatched",
  "longCombosPositiveCount", "longCombosAntiCount", "longComboRegistryVersion",
  // Outcome (forensic — not entry-safe)
  "finalPnlPct", "grossMarginPnlPct", "feeAdjustedMarginPnlPct",
  "netAfterAllCostsMarginPnlPct", "feeDragPct", "tradingFeeMarginPct",
  "closeReason", "mfe", "mae", "isPostFee10PlusWinner", "isNorm2PlusWinner",
  "isRunBest1Norm", "isRunBest3Norm",
];

/**
 * Builds the query metadata block to attach to any export.
 */
export function buildFilterQueryMetadata(state, engineResult) {
  return {
    filterExportVersion: LONG_FILTER_EXPORT_VERSION,
    filterQuerySchemaVersion: state?.schemaVersion ?? "unknown",
    filterQueryJson: JSON.stringify(state ?? {}),
    filterRegistryVersion: engineResult?.registryVersion ?? "unknown",
    filterPnlMetric: state?.pnlMetric ?? "NET_AFTER_FEES",
    filterInputCount: engineResult?.inputCount ?? 0,
    filterOutputCount: engineResult?.outputCount ?? 0,
    filterExportedAt: Date.now(),
  };
}

/**
 * Extracts long filter snapshot fields from a trade record for CSV/JSON export.
 */
export function extractFilterExportRow(trade) {
  const row = {};
  for (const field of LONG_FILTER_SNAPSHOT_FIELDS) {
    const v = trade[field];
    if (Array.isArray(v)) row[field] = v.join("|");
    else if (v != null) row[field] = v;
    else row[field] = "";
  }
  return row;
}

/**
 * Builds an array of export rows for a filtered trade set.
 */
export function buildFilterExportRows(trades, state, engineResult) {
  const meta = buildFilterQueryMetadata(state, engineResult);
  return trades.map(t => ({ ...extractFilterExportRow(t), ...meta }));
}

/**
 * Returns CSV headers for the long filter export.
 */
export const LONG_FILTER_EXPORT_HEADERS = [
  ...LONG_FILTER_SNAPSHOT_FIELDS,
  "filterExportVersion",
  "filterQuerySchemaVersion",
  "filterQueryJson",
  "filterRegistryVersion",
  "filterPnlMetric",
  "filterInputCount",
  "filterOutputCount",
  "filterExportedAt",
];