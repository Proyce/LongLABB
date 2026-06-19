// ─── LONG TRADE EXPORT SCHEMA ─────────────────────────────────────────────────
// Canonical column definitions for the LONG trade CSV export.
// Each entry: { key, header, getValue: (trade) => value, serialize }
// LOG ONLY — must never affect simulation execution.

import { LONG_TRADE_EXPORT_VERSION } from '../research/longResearchSchemaVersions.js';
import { DEFAULT_COMPACT_EXPORT_EXCLUSIONS } from '../telemetry/telemetryCompaction.js';

export function serializeScalar(v) {
  return v == null ? "" : String(v);
}

export function serializeJson(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function assertUniqueExportColumns(columns) {
  const keys = new Set();
  const headers = new Set();
  for (const col of columns) {
    if (keys.has(col.key)) {
      throw new Error(`Duplicate export column key: "${col.key}"`);
    }
    if (headers.has(col.header)) {
      throw new Error(`Duplicate export column header: "${col.header}"`);
    }
    keys.add(col.key);
    headers.add(col.header);
  }
}

function col(key, getValue, serialize = serializeScalar, header = key) {
  return { key, header, getValue, serialize };
}

function colJson(key, getValue, header = key) {
  return { key, header, getValue, serialize: serializeJson };
}

function get(field) {
  return t => t?.[field] ?? null;
}

// ── Core trade fields ──────────────────────────────────────────────────────────

export const LONG_TRADE_FORENSIC_EXPORT_COLUMNS = [
  col("id",                 get("id")),
  col("run",                t => t?.runId ?? t?.run ?? null),
  col("setId",              get("setId")),
  col("batchId",            t => t?.batchId ?? t?.autoRunId ?? null),
  col("autoRunId",          get("autoRunId")),
  col("autoRunCycle",       get("autoRunCycle")),
  col("entrySource",        get("entrySource")),
  col("symbol",             get("symbol")),
  col("leverage",           get("leverage")),
  col("change24h",          get("change24h")),
  col("entryRank",          get("entryRank")),
  col("entryPrice",         get("entryPrice")),
  col("exitPrice",          t => t?.exitPrice ?? t?.currentPrice ?? null),
  col("rawMarginPnlPct",    get("rawMarginPnlPct")),
  col("rawNormPnlPct",      get("rawNormPnlPct")),
  col("feeAdjustedMarginPnlPct", get("feeAdjustedMarginPnlPct")),
  col("feeAdjustedNormPnlPct",   get("feeAdjustedNormPnlPct")),
  col("closeReason",        t => t?.closeReason ?? "ACTIVE"),
  col("isFinalOutcome",     get("isFinalOutcome")),
  col("closeReasonCategory", get("closeReasonCategory")),
  col("closeReasonDetail",  get("closeReasonDetail")),
  col("holdMs",             t => t?.closedAt ? t.closedAt - t.entryTime : null),
  col("mae",                get("mae")),
  col("mfe",                get("mfe")),
  col("cvdLabel",           get("cvdLabel")),
  col("atrPct",             get("atrPct")),
  col("spreadPct",          get("spreadPct")),
  col("volAccel",           get("volAccel")),
  col("utcHour",            get("utcHour")),
  col("entryTime",          t => t?.entryTime ? new Date(t.entryTime).toISOString() : null),
  col("closeTime",          t => t?.closedAt ? new Date(t.closedAt).toISOString() : null),
  col("leaderboardSide",    get("leaderboardSide")),
  col("longParentBucket",   get("longParentBucket")),
  col("longSubBucket",      get("longSubBucket")),
  col("entryRankInBucket",  get("entryRankInBucket")),

  // ── Long Best DNA audit ────────────────────────────────────────────────────
  col("bestDnaLongScoreRaw",     get("bestDnaLongScoreRaw")),
  col("bestDnaLongScore",        get("bestDnaLongScore")),
  col("bestDnaLongTier",         get("bestDnaLongTier")),
  col("bestDnaLongPrimaryLabel", get("bestDnaLongPrimaryLabel")),
  colJson("bestDnaLongLabels",   get("bestDnaLongLabels")),
  col("bestDnaLongVersion",      get("bestDnaLongVersion")),
  col("isBestDnaLongHigh",       get("isBestDnaLongHigh")),
  col("isBestDnaLongSniper",     get("isBestDnaLongSniper")),
  col("isBestDnaLongElite",      get("isBestDnaLongElite")),

  // ── Long Post-Fee-10 potential (canonical entry fields) ───────────────────
  col("longPostFee10EntryScore",         get("longPostFee10EntryScore")),
  col("longPostFee10EntryTier",          get("longPostFee10EntryTier")),
  col("isLongPostFee10CandidateAtEntry", get("isLongPostFee10CandidateAtEntry")),
  colJson("longPostFee10PositiveGenes",  get("longPostFee10PositiveGenes")),
  colJson("longPostFee10PenaltyGenes",   get("longPostFee10PenaltyGenes")),
  col("longPostFee10FeatureCoveragePct", get("longPostFee10FeatureCoveragePct")),

  // ── Outcome and ranking ────────────────────────────────────────────────────
  col("priceMovePct", get("priceMovePct")),
  col("grossNormPnlPct", get("grossNormPnlPct")),
  col("grossLeveragedPnlPct", t => t?.grossLeveragedPnlPct ?? t?.grossMarginPnlPct ?? t?.rawMarginPnlPct ?? null),
  col("feeAdjustedLeveragedPnlPct", get("feeAdjustedLeveragedPnlPct")),
  col("isPostFee10PlusWinner",   get("isPostFee10PlusWinner")),
  col("isNorm2PlusWinner",       get("isNorm2PlusWinner")),
  col("isNorm3PlusWinner",       get("isNorm3PlusWinner")),
  col("isRunBest1Norm",          get("isRunBest1Norm")),
  col("isRunBest3Norm",          get("isRunBest3Norm")),
  col("runNormRank",             get("runNormRank")),
  col("runClosedTradeCount",     get("runClosedTradeCount")),
  col("longBestDnaOutcomeLabel", get("longBestDnaOutcomeLabel")),

  // ── Long Candidate Runner (canonical entry fields) ─────────────────────────
  col("longCandidateRunnerScoreAtEntry",       get("longCandidateRunnerScoreAtEntry")),
  col("longCandidateRunnerTierAtEntry",        get("longCandidateRunnerTierAtEntry")),
  col("longCandidateRunnerVerdict",            get("longCandidateRunnerVerdict")),
  colJson("longCandidateRunnerReasons",        get("longCandidateRunnerReasons")),
  colJson("longCandidateRunnerPenalties",      get("longCandidateRunnerPenalties")),
  col("longCandidateRunnerWouldAllow",         get("longCandidateRunnerWouldAllow")),
  col("longCandidateRunnerWouldBlock",         get("longCandidateRunnerWouldBlock")),
  col("longCandidateRunnerFeatureCoveragePct", get("longCandidateRunnerFeatureCoveragePct")),

  // ── Long Absolute Entry Score ──────────────────────────────────────────────
  col("longAesScore",            get("longAesScore")),
  col("longAesTier",             get("longAesTier")),
  col("longAesEligibility",      get("longAesEligibility")),
  col("longAesConfidenceLabel",  get("longAesConfidenceLabel")),
  col("longAesVersion",          get("longAesVersion")),

  // ── Long Gate (canonical) ─────────────────────────────────────────────────
  col("longGateWouldPass",      get("longGateWouldPass")),
  col("longGateScore",          get("longGateScore")),
  col("longGateEligibility",    get("longGateEligibility")),
  col("longGateTier",           get("longGateTier")),
  colJson("longGateReasons",    get("longGateReasons")),
  colJson("longGateFailReasons", get("longGateFailReasons")),
  colJson("longGateMissingInputs", get("longGateMissingInputs")),

  // ── Bucket audit (canonical) ───────────────────────────────────────────────
  col("bucketAuditType",        get("bucketAuditType")),
  col("bucketAuditWouldPass",   get("bucketAuditWouldPass")),
  col("bucketAuditScore",       get("bucketAuditScore")),
  col("bucketAuditTier",        get("bucketAuditTier")),
  colJson("bucketAuditReasons", get("bucketAuditReasons")),
  colJson("bucketAuditWarnings", get("bucketAuditWarnings")),
  colJson("bucketAuditMissingInputs", get("bucketAuditMissingInputs")),

  // ── Market context (canonical) ─────────────────────────────────────────────
  col("btcLongContextLabel",     get("btcLongContextLabel")),
  col("longMarketContextLabel",  get("longMarketContextLabel")),
  col("longMarketContextScore",  get("longMarketContextScore")),
  col("longMarketBreadthLabel",  get("longMarketBreadthLabel")),
  col("longMarketBreadthScore",  get("longMarketBreadthScore")),

  // ── Shadow decision (canonical) ────────────────────────────────────────────
  col("longShadowDecision",             get("longShadowDecision")),
  col("longShadowRequiredCoveragePct",  get("longShadowRequiredCoveragePct")),
  colJson("longShadowPositiveReasons",  get("longShadowPositiveReasons")),
  colJson("longShadowCautionReasons",   get("longShadowCautionReasons")),
  colJson("longShadowBlockReasons",     get("longShadowBlockReasons")),
  colJson("longShadowUnknownReasons",   get("longShadowUnknownReasons")),
  colJson("longShadowComponentVerdicts", get("longShadowComponentVerdicts")),

  // ── Research snapshot + filter snapshot meta ───────────────────────────────
  col("entryResearchStatus",           get("entryResearchStatus")),
  col("entryResearchSchemaVersion",    get("entryResearchSchemaVersion")),
  col("entryResearchComputedAt",       get("entryResearchComputedAt")),
  col("longFilterSnapshotVersion",     get("longFilterSnapshotVersion")),
  col("longFilterSnapshotTiming",      get("longFilterSnapshotTiming")),
  col("longFilterSnapshotComputedAt",  get("longFilterSnapshotComputedAt")),
  col("longFilterSnapshotSource",      get("longFilterSnapshotSource")),
  colJson("entryResearchSnapshot",     get("entryResearchSnapshot")),

  // ── Data quality ───────────────────────────────────────────────────────────
  col("longFilterDataQuality",         get("longFilterDataQuality")),
  col("longFilterCoveragePct",         get("longFilterCoveragePct")),
  colJson("longFilterMissingRequiredFields", get("longFilterMissingRequiredFields")),
  colJson("longFilterMissingOptionalFields", get("longFilterMissingOptionalFields")),
  colJson("longFilterConflictingFields", get("longFilterConflictingFields")),
  colJson("longFilterStaleFields",     get("longFilterStaleFields")),
  colJson("entryResearchComponentErrors", get("entryResearchComponentErrors")),

  // ── June 16 winning-setups entry signals ───────────────────────────────────
  col("longGateResearchBandV2", get("longGateResearchBandV2")),
  col("longMicroMomentumLabel", get("longMicroMomentumLabel")),
  col("last3TicksDirection", get("last3TicksDirection")),
  col("last5TicksDirection", get("last5TicksDirection")),
  col("immediateGreenImpulse", get("immediateGreenImpulse")),
  col("immediateRedImpulse", get("immediateRedImpulse")),
  col("hasLongMicroMomentum", get("hasLongMicroMomentum")),
  col("longMicroUpConfirmation", get("longMicroUpConfirmation")),
  colJson("longMicroUpConfirmationReasons", get("longMicroUpConfirmationReasons")),
  col("longMicroUpConfirmationSourceCount", get("longMicroUpConfirmationSourceCount")),
  col("rsiLongMomentumExpansion", get("rsiLongMomentumExpansion")),
  col("rsiLongMomentumExpansionSource", get("rsiLongMomentumExpansionSource")),
  col("macdBullishExpansion", get("macdBullishExpansion")),
  col("topLoserLongThesisLane", get("topLoserLongThesisLane")),

  // ── Formal LONG combo registry ──────────────────────────────────────────────
  col("longComboRegistryVersion", get("longComboRegistryVersion")),
  colJson("longCombosPositiveMatched", get("longCombosPositiveMatched")),
  colJson("longCombosAntiMatched", get("longCombosAntiMatched")),
  col("longCombosPositiveCount", get("longCombosPositiveCount")),
  col("longCombosAntiCount", get("longCombosAntiCount")),
  colJson("longComboDetails", get("longComboDetails")),
  colJson("activeWinningSetupIds", get("activeWinningSetupIds")),
  colJson("longWinningSetupMatchedIds", get("longWinningSetupMatchedIds")),
  colJson("longWinningSetupMatchDetails", get("longWinningSetupMatchDetails")),
  col("longWinningSetupCatalogVersion", t => t?.longWinningSetupCatalogVersion ?? "LONG_WINNING_SETUPS_V1"),
  col("longWinningSetupsVersion", t => t?.longWinningSetupsVersion ?? "LONG_WINNING_SETUPS_V1"),

  // ── Adaptive Long AES and entry policy ─────────────────────────────────────
  col("absoluteEntryBaseScore", get("absoluteEntryBaseScore")),
  col("absoluteEntryMarketAdjustment", get("absoluteEntryMarketAdjustment")),
  col("absoluteEntryAdaptiveScore", get("absoluteEntryAdaptiveScore")),
  col("absoluteEntryRequiredScore", get("absoluteEntryRequiredScore")),
  col("absoluteEntryAesGap", get("absoluteEntryAesGap")),
  col("absoluteEntryWouldPassAdaptive", get("absoluteEntryWouldPassAdaptive")),
  col("absoluteEntryAdaptiveStatus", get("absoluteEntryAdaptiveStatus")),
  colJson("absoluteEntryMarketAdjustmentContributions", get("absoluteEntryMarketAdjustmentContributions")),
  colJson("absoluteEntryMarketAdjustmentPenalties", get("absoluteEntryMarketAdjustmentPenalties")),
  col("absoluteEntryMarketAdjustmentVersion", get("absoluteEntryMarketAdjustmentVersion")),
  col("longAdaptiveAesBaseScore", get("longAdaptiveAesBaseScore")),
  col("longAdaptiveAesScore", get("longAdaptiveAesScore")),
  col("longAdaptiveAesRequiredScore", get("longAdaptiveAesRequiredScore")),
  col("longAdaptiveAesGap", get("longAdaptiveAesGap")),
  col("longAdaptiveAesWouldPass", get("longAdaptiveAesWouldPass")),
  col("entryPolicyMode", get("entryPolicyMode")),
  col("entryPolicyShadowDecision", get("entryPolicyShadowDecision")),
  col("entryPolicyPrimaryReason", get("entryPolicyPrimaryReason")),
  col("entryPolicyEvaluationStatus", get("entryPolicyEvaluationStatus")),
  col("entryPolicyExecutionApplied", t => t?.entryPolicyExecutionApplied ?? false),
  col("entryPolicyRequiredAes", get("entryPolicyRequiredAes")),
  col("entryPolicyAesGap", get("entryPolicyAesGap")),

  // ── Confidence calibration and shadow score revisions ───────────────────────
  col("longAesConfidenceIsInformative", get("longAesConfidenceIsInformative")),
  col("longAesConfidenceDistinctValueCountAtRun", get("longAesConfidenceDistinctValueCountAtRun")),
  col("longAesConfidenceCalibrationStatus", get("longAesConfidenceCalibrationStatus")),
  col("longAesScoreV2Shadow", get("longAesScoreV2Shadow")),
  col("longAesTierV2Shadow", get("longAesTierV2Shadow")),
  colJson("longAesV2ComponentWeights", get("longAesV2ComponentWeights")),
  colJson("longAesV2PositiveContributions", get("longAesV2PositiveContributions")),
  colJson("longAesV2NegativeContributions", get("longAesV2NegativeContributions")),
  col("longAesV2RawUtility", get("longAesV2RawUtility")),
  col("longAesV2DeltaVsV1", get("longAesV2DeltaVsV1")),
  col("longAesV2Version", get("longAesV2Version")),
  col("bestDnaLongScoreV2ShadowRaw", get("bestDnaLongScoreV2ShadowRaw")),
  col("bestDnaLongScoreV2Shadow", get("bestDnaLongScoreV2Shadow")),
  col("bestDnaLongTierV2Shadow", get("bestDnaLongTierV2Shadow")),
  colJson("bestDnaLongV2PositiveGenes", get("bestDnaLongV2PositiveGenes")),
  colJson("bestDnaLongV2PenaltyGenes", get("bestDnaLongV2PenaltyGenes")),
  colJson("bestDnaLongV2Contributions", get("bestDnaLongV2Contributions")),
  colJson("bestDnaLongV2Penalties", get("bestDnaLongV2Penalties")),
  col("bestDnaLongV2StrictDirectionalConfirmation", get("bestDnaLongV2StrictDirectionalConfirmation")),
  col("bestDnaLongV2Version", get("bestDnaLongV2Version")),
  col("longAesPrimaryVersion", get("longAesPrimaryVersion")),
  col("longAesV2PromotionStatus", get("longAesV2PromotionStatus")),
  col("longAesV2MinusV1", get("longAesV2MinusV1")),
  col("bestDnaPrimaryVersion", get("bestDnaPrimaryVersion")),
  col("bestDnaV2PromotionStatus", get("bestDnaV2PromotionStatus")),
  col("bestDnaV2MinusV1", get("bestDnaV2MinusV1")),

  // ── Profit-lock lifecycle and honest floor telemetry ────────────────────────
  col("profitLockActive", get("profitLockActive")),
  col("profitLockActivatedAt", get("profitLockActivatedAt")),
  col("profitLockLevelMarginPct", get("profitLockLevelMarginPct")),
  col("profitLockLevelPrice", get("profitLockLevelPrice")),
  col("profitLockStage", get("profitLockStage")),
  col("profitLockCrossDetected", get("profitLockCrossDetected")),
  col("profitLockCrossDetectedAt", get("profitLockCrossDetectedAt")),
  col("profitLockCrossFromPrice", get("profitLockCrossFromPrice")),
  col("profitLockCrossToPrice", get("profitLockCrossToPrice")),
  col("profitLockDetectionLatencyMs", get("profitLockDetectionLatencyMs")),
  col("profitLockTriggerPrice", get("profitLockTriggerPrice")),
  col("profitLockObservedFillPrice", get("profitLockObservedFillPrice")),
  col("profitLockSlippagePricePct", get("profitLockSlippagePricePct")),
  col("profitLockSlippageMarginPct", get("profitLockSlippageMarginPct")),
  col("profitLockFloorEnforcementAttempted", get("profitLockFloorEnforcementAttempted")),
  col("profitLockFloorEnforcementSucceeded", get("profitLockFloorEnforcementSucceeded")),
  col("profitLockExitBelowFloor", get("profitLockExitBelowFloor")),
  col("profitLockFloorMissed", get("profitLockFloorMissed")),
  col("floorExitEnforced", get("floorExitEnforced")),
  col("profitLockRecommendedActionLogOnly", get("profitLockRecommendedActionLogOnly")),
  colJson("profitLockRecommendationReasons", get("profitLockRecommendationReasons")),


  // ── Sequential-remediation V6 provenance and semantics ─────────────────────
  col("tradeSchemaVersion", get("tradeSchemaVersion")),
  col("entrySnapshotSchemaVersion", get("entrySnapshotSchemaVersion")),
  col("scoreRegistryVersion", get("scoreRegistryVersion")),
  col("filterRegistryVersion", get("filterRegistryVersion")),
  col("labelRegistryVersion", get("labelRegistryVersion")),
  col("comboRegistrySchemaVersion", get("comboRegistrySchemaVersion")),
  col("antiComboRegistryVersion", get("antiComboRegistryVersion")),
  col("winningSetupRegistryVersion", get("winningSetupRegistryVersion")),
  col("marketContextVersion", get("marketContextVersion")),
  col("longMicroContextLabel", get("longMicroContextLabel")),
  col("longTacticalContextLabel", get("longTacticalContextLabel")),
  col("longStrategicContextLabel", get("longStrategicContextLabel")),
  col("longMarketContextComputedLabel", get("longMarketContextComputedLabel")),
  col("marketContextFreshnessMs", get("marketContextFreshnessMs")),
  col("marketContextExpectedLongEffect", get("marketContextExpectedLongEffect")),
  col("exitSystemVersion", get("exitSystemVersion")),
  col("feeModelVersion", get("feeModelVersion")),
  col("pnlModelVersion", get("pnlModelVersion")),
  col("entrySnapshotCapturedAt", get("entrySnapshotCapturedAt")),
  col("entrySnapshotMarketDataTimestamp", get("entrySnapshotMarketDataTimestamp")),
  col("entrySnapshotCompletenessPct", get("entrySnapshotCompletenessPct")),
  col("entrySnapshotRequiredFieldsComplete", get("entrySnapshotRequiredFieldsComplete")),
  colJson("entrySnapshotFieldStatus", get("entrySnapshotFieldStatus")),
  col("cvdStateAtEntry", get("cvdStateAtEntry")),
  col("cvdStateCurrent", get("cvdStateCurrent")),
  col("cvdSupportsLongAtEntry", get("cvdSupportsLongAtEntry")),
  col("cvdContradictsLongAtEntry", get("cvdContradictsLongAtEntry")),
  col("cvdOverrideApplied", get("cvdOverrideApplied")),
  col("cvdOverrideReason", get("cvdOverrideReason")),
  col("cvdLongInterpretation", get("cvdLongInterpretation")),
  col("longAtrContext", get("longAtrContext")),
  col("longAtrQualityQualified", get("longAtrQualityQualified")),
  col("longAtrMicroUpQualified", get("longAtrMicroUpQualified")),
  col("rawPositiveComboCount", get("rawPositiveComboCount")),
  col("rawAntiComboCount", get("rawAntiComboCount")),
  colJson("positiveEvidenceFamilies", get("positiveEvidenceFamilies")),
  colJson("negativeEvidenceFamilies", get("negativeEvidenceFamilies")),
  col("independentPositiveEvidenceCount", get("independentPositiveEvidenceCount")),
  col("independentNegativeEvidenceCount", get("independentNegativeEvidenceCount")),
  col("evidenceConflictCount", get("evidenceConflictCount")),
  col("highestAntiSeverity", get("highestAntiSeverity")),
  colJson("antiSeverityCounts", get("antiSeverityCounts")),
  col("hardAntiComboPresent", get("hardAntiComboPresent")),
  col("cleanComboStackWouldAllowLogOnly", get("cleanComboStackWouldAllowLogOnly")),
  col("stackedCleanComboWouldAllowLogOnly", get("stackedCleanComboWouldAllowLogOnly")),
  col("eliteCleanComboStackWouldAllowLogOnly", get("eliteCleanComboStackWouldAllowLogOnly")),
  col("longQualityTierV2", get("longQualityTierV2")),
  col("longEligibilityTierV2", get("longEligibilityTierV2")),
  col("longDataQualityTierV2", get("longDataQualityTierV2")),

  // ── Finalization truth ──────────────────────────────────────────────────────
  col("finalPriceSource", get("finalPriceSource")),
  col("finalPriceTimestamp", get("finalPriceTimestamp")),
  col("finalPriceAgeMs", get("finalPriceAgeMs")),
  col("finalPriceFresh", get("finalPriceFresh")),
  col("finalPriceValidationPassed", get("finalPriceValidationPassed")),
  col("finalPriceFallbackUsed", get("finalPriceFallbackUsed")),
  col("autoEndUsedEntryPriceFallback", get("autoEndUsedEntryPriceFallback")),
  col("finalizationDataQuality", get("finalizationDataQuality")),
  col("finalizationFailureCode", get("finalizationFailureCode")),
  col("strategyResearchEligible", get("strategyResearchEligible")),
  col("strategyResearchExclusionReason", get("strategyResearchExclusionReason")),
  col("closeTriggerSource", get("closeTriggerSource")),
  col("closeExecutionMechanism", get("closeExecutionMechanism")),

  // ── Profit-lock protection state machine ───────────────────────────────────
  col("profitLockStrategyActive", get("profitLockStrategyActive")),
  col("profitLockProtectionState", get("profitLockProtectionState")),
  col("profitLockProtectionVenue", get("profitLockProtectionVenue")),
  col("profitLockProtectionVerified", get("profitLockProtectionVerified")),
  col("profitLockProtectionRequested", get("profitLockProtectionRequested")),
  col("profitLockOrderSubmitted", get("profitLockOrderSubmitted")),
  col("profitLockOrderAcknowledged", get("profitLockOrderAcknowledged")),
  col("profitLockOrderResting", get("profitLockOrderResting")),
  col("profitLockProtectedFloorPrice", get("profitLockProtectedFloorPrice")),
  col("profitLockProtectedFloorMarginPct", get("profitLockProtectedFloorMarginPct")),
  col("profitLockProtectedStage", get("profitLockProtectedStage")),
  col("profitLockSimulatedOrderId", get("profitLockSimulatedOrderId")),
  col("profitLockFloorBreachedWhilePositionOpen", get("profitLockFloorBreachedWhilePositionOpen")),
  col("profitLockFloorBreachedInLoss", get("profitLockFloorBreachedInLoss")),
  col("profitLockPnlAtFloorBreach", get("profitLockPnlAtFloorBreach")),
  col("profitLockFloorCrossedAt", get("profitLockFloorCrossedAt")),
  col("profitLockLocalTriggerDetectedAt", get("profitLockLocalTriggerDetectedAt")),
  col("profitLockCrossToLocalDetectionLatencyMs", get("profitLockCrossToLocalDetectionLatencyMs")),
  col("profitLockCrossTimePrecision", get("profitLockCrossTimePrecision")),
  col("profitLockProtectionModeHonestLabel", get("profitLockProtectionModeHonestLabel")),
  col("positionLifecycleEngine", get("positionLifecycleEngine")),
  col("priceStreamSchemaVersion", get("priceStreamSchemaVersion")),
  col("priceTickSchemaValidated", get("priceTickSchemaValidated")),
  col("priceIntegrityStatus", get("priceIntegrityStatus")),
  col("priceIntegrityFailureCode", get("priceIntegrityFailureCode")),
  col("positionLifecycleLastHeartbeatAt", get("positionLifecycleLastHeartbeatAt")),
  col("positionLifecycleLastWebsocketAt", get("positionLifecycleLastWebsocketAt")),
  col("positionLifecycleLastRestFallbackAt", get("positionLifecycleLastRestFallbackAt")),
  col("positionLifecycleSymbolTickAgeMs", get("positionLifecycleSymbolTickAgeMs")),
  col("positionLifecycleRestFallbackStatus", get("positionLifecycleRestFallbackStatus")),
  col("positionLifecycleFallbackReason", get("positionLifecycleFallbackReason")),
  col("marketPriceStreamHealthy", get("marketPriceStreamHealthy")),
  col("sourceRunCompleted", get("sourceRunCompleted")),
  col("sourceRunCompletedAt", get("sourceRunCompletedAt")),
  col("sourceRunCompletionReason", get("sourceRunCompletionReason")),
  col("positionLifecycleContinuesAfterRun", get("positionLifecycleContinuesAfterRun")),
  col("profitLockFloorPreserved", get("profitLockFloorPreserved")),
  col("profitLockEmergencyFallbackUsed", get("profitLockEmergencyFallbackUsed")),
  col("profitLockEnforcementFailed", get("profitLockEnforcementFailed")),
  col("profitLockCloseBlockedByPositivePnlGuard", get("profitLockCloseBlockedByPositivePnlGuard")),

  // ── Research-only safety markers ────────────────────────────────────────────
  col("logOnly", t => t?.logOnly ?? true),
  col("canAffectExecution", t => t?.canAffectExecution ?? false),
  col("executionApplied", t => t?.executionApplied ?? false),

  // ── Schema version markers ─────────────────────────────────────────────────
  col("exportSchemaVersion",     () => LONG_TRADE_EXPORT_VERSION),
];

const COMPACT_EXCLUSION_SET = new Set([
  ...DEFAULT_COMPACT_EXPORT_EXCLUSIONS,
  'entryPolicyExecutionApplied',
  'longAesConfidenceLabel',
]);

const COMPACT_V8_EXTRA_COLUMNS = Object.freeze([
  col('entryPolicyDiagnosticDecision', t => t?.entryPolicyDiagnosticDecision ?? t?.entryPolicyShadowDecision ?? null),
  col('entryPolicyDiagnosticAction', get('entryPolicyDiagnosticAction')),
  col('entryPolicyQualityTier', get('entryPolicyQualityTier')),
  col('requiredEntrySnapshotCompletenessPct', t => t?.requiredEntrySnapshotCompletenessPct ?? t?.entrySnapshotCompletenessPct ?? null),
  col('optionalResearchFeatureCoveragePct', t => t?.optionalResearchFeatureCoveragePct ?? t?.longFilterCoveragePct ?? null),

  // ── Regime-remediation diagnostics (log-only; June 17 telemetry-v9) ─────────
  // These are observational corrections to existing scorers, never gates.
  col('longGateRegimeVersion', get('longGateRegimeVersion')),
  col('longGateRegimePenaltyApplied', get('longGateRegimePenaltyApplied')),
  col('longGateTierCeilingApplied', get('longGateTierCeilingApplied')),
  col('longQualityTierV2Aggregation', get('longQualityTierV2Aggregation')),
  col('longMicroConfirmObserved', get('longMicroConfirmObserved')),
  col('longMicroConfirmReversalLane', get('longMicroConfirmReversalLane')),
  col('longMicroConfirmObsVersion', get('longMicroConfirmObsVersion')),
  col('finalPriceRefreshAttempted', get('finalPriceRefreshAttempted')),
  col('finalPriceRefreshSucceeded', get('finalPriceRefreshSucceeded')),
  col('finalPricePreRefreshAgeMs', get('finalPricePreRefreshAgeMs')),
  colJson('exitVsRegimeAttribution', get('exitVsRegimeAttribution')),

  // ── Data-quality driver diagnostics (log-only; names the INCOMPLETE cause) ──
  col('longDataQualityMissingRequiredCount', get('longDataQualityMissingRequiredCount')),
  col('longDataQualityPrimaryMissingField', get('longDataQualityPrimaryMissingField')),
  col('longDataQualityVerdictDriver', get('longDataQualityVerdictDriver')),
]);

// V8 default: compact analysis contract. The full forensic schema remains
// available explicitly, but normal CSV/JSON exports no longer repeat nested
// snapshots, static manifest data, or compatibility aliases on every row.
export const LONG_TRADE_EXPORT_COLUMNS = Object.freeze([
  ...LONG_TRADE_FORENSIC_EXPORT_COLUMNS.filter(column => !COMPACT_EXCLUSION_SET.has(column.key)),
  ...COMPACT_V8_EXTRA_COLUMNS,
]);

