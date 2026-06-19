// ─── LONG TRADE RECORD MIGRATION ADAPTER ─────────────────────────────────────
// Translates deprecated field aliases into the canonical V8 compact research schema.
// Only this module may read deprecated aliases. New records must never write them.
// LOG ONLY / RESEARCH ONLY.

import {
  LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
  LONG_FILTER_SNAPSHOT_VERSION,
  LONG_TRADE_EXPORT_VERSION,
} from '../research/longResearchSchemaVersions.js';
import { LONG_RUNNER_TIER } from '../scoring/longCandidateRunner/index.js';
import { LONG_PF10_TIER } from '../scoring/longPostFee10/index.js';
import { CLOSE_REASON, normalizeLongCloseReason } from '../lifecycle/closeReasons.js';

const V5_NULL_DEFAULT_FIELDS = Object.freeze([
  'longGateResearchBandV2',
  'longMicroUpConfirmation',
  'rsiLongMomentumExpansion',
  'macdBullishExpansion',
  'topLoserLongThesisLane',
  'absoluteEntryBaseScore',
  'absoluteEntryAdaptiveScore',
  'absoluteEntryRequiredScore',
  'absoluteEntryAesGap',
  'absoluteEntryWouldPassAdaptive',
  'longAesConfidenceIsInformative',
  'longAesScoreV2Shadow',
  'longAesTierV2Shadow',
  'bestDnaLongScoreV2Shadow',
  'bestDnaLongTierV2Shadow',
  'bestDnaLongV2StrictDirectionalConfirmation',
  'bestDnaV2MinusV1',
  'longMicroContextLabel',
  'longTacticalContextLabel',
  'longStrategicContextLabel',
  'longMarketContextComputedLabel',
  'marketContextFreshnessMs',
  'marketContextExpectedLongEffect',
  'profitLockCrossDetected',
  'profitLockCrossDetectedAt',
  'profitLockCrossedBetweenObservations',
  'profitLockFirstObservedBelowFloor',
  'profitLockCrossFromPrice',
  'profitLockCrossToPrice',
  'profitLockTriggerPrice',
  'profitLockObservedFillPrice',
  'profitLockObservedMarginPnlPct',
  'profitLockSlippagePricePct',
  'profitLockSlippageMarginPct',
  'profitLockFloorEnforcementAttempted',
  'profitLockFloorMissed',
  'profitLockRecommendedActionLogOnly',
  'entrySnapshotCapturedAt',
  'entrySnapshotMarketDataTimestamp',
  'entrySnapshotRequiredFieldsComplete',
  'cvdStateAtEntry',
  'cvdSupportsLongAtEntry',
  'cvdContradictsLongAtEntry',
  'cvdOverrideApplied',
  'cvdOverrideReason',
  'cvdLongInterpretation',
  'longAtrContext',
  'longAtrQualityQualified',
  'longAtrMicroUpQualified',
  'independentPositiveEvidenceCount',
  'independentNegativeEvidenceCount',
  'evidenceConflictCount',
  'highestAntiSeverity',
  'hardAntiComboPresent',
  'cleanComboStackWouldAllowLogOnly',
  'stackedCleanComboWouldAllowLogOnly',
  'eliteCleanComboStackWouldAllowLogOnly',
  'longQualityTierV2',
  'longEligibilityTierV2',
  'longDataQualityTierV2',
  'finalPriceSource',
  'finalPriceTimestamp',
  'finalPriceAgeMs',
  'finalPriceFresh',
  'finalPriceValidationPassed',
  'finalPriceFallbackUsed',
  'autoEndUsedEntryPriceFallback',
  'finalizationDataQuality',
  'finalizationFailureCode',
  'strategyResearchEligible',
  'strategyResearchExclusionReason',
  'closeTriggerSource',
  'closeExecutionMechanism',
  'profitLockStrategyActive',
  'profitLockProtectionState',
  'profitLockProtectionVenue',
  'profitLockProtectionVerified',
  'profitLockProtectionRequested',
  'profitLockOrderSubmitted',
  'profitLockOrderAcknowledged',
  'profitLockOrderResting',
  'profitLockProtectedFloorPrice',
  'profitLockProtectedFloorMarginPct',
  'profitLockProtectedStage',
  'profitLockSimulatedOrderId',
  'profitLockFloorBreachedWhilePositionOpen',
  'profitLockFloorBreachedInLoss',
  'profitLockPnlAtFloorBreach',
  'profitLockFloorCrossedAt',
  'profitLockLocalTriggerDetectedAt',
  'profitLockCrossToLocalDetectionLatencyMs',
  'profitLockFloorPreserved',
  'profitLockEmergencyFallbackUsed',
  'profitLockEnforcementFailed',
  'profitLockCloseBlockedByPositivePnlGuard',
]);

const V5_ARRAY_DEFAULT_FIELDS = Object.freeze([
  'longMicroUpConfirmationReasons',
  'longCombosPositiveMatched',
  'longCombosAntiMatched',
  'longAesV2ShadowPositiveReasons',
  'longAesV2ShadowNegativeReasons',
  'bestDnaLongV2PositiveGenes',
  'bestDnaLongV2PenaltyGenes',
  'bestDnaLongV2Contributions',
  'longWinningSetupMatchedIds',
  'positiveEvidenceFamilies',
  'negativeEvidenceFamilies',
  'matchedPositiveComboIds',
  'matchedAntiComboIds',
]);

function reconstructGateTier(score) {
  if (score == null) return null;
  if (score >= 85) return 'PREMIUM';
  if (score >= 75) return 'STRONG';
  if (score >= 60) return 'WATCH';
  return 'RESEARCH_REJECT';
}

function reconstructAesTier(score) {
  if (score == null) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s <= 24) return 'LONG_AES_RESEARCH_BLOCKED';
  if (s <= 39) return 'LONG_AES_LOW';
  if (s <= 54) return 'LONG_AES_WATCH';
  if (s <= 69) return 'LONG_AES_CANDIDATE';
  if (s <= 79) return 'LONG_AES_HIGH';
  if (s <= 89) return 'LONG_AES_SNIPER_RESEARCH';
  return 'LONG_AES_ELITE_RESEARCH';
}

function reconstructRunnerTier(score) {
  if (score == null) return null;
  if (score >= 85) return LONG_RUNNER_TIER.ELITE;
  if (score >= 72) return LONG_RUNNER_TIER.SNIPER;
  if (score >= 58) return LONG_RUNNER_TIER.HIGH;
  if (score >= 45) return LONG_RUNNER_TIER.CANDIDATE;
  if (score >= 30) return LONG_RUNNER_TIER.WATCH;
  return LONG_RUNNER_TIER.REJECT;
}

function reconstructPf10Tier(score) {
  if (score == null) return null;
  if (score >= 85) return LONG_PF10_TIER.ELITE;
  if (score >= 72) return LONG_PF10_TIER.SNIPER;
  if (score >= 58) return LONG_PF10_TIER.HIGH;
  if (score >= 45) return LONG_PF10_TIER.CANDIDATE;
  if (score >= 30) return LONG_PF10_TIER.WATCH;
  return LONG_PF10_TIER.REJECT;
}

function reconstructBucketAuditTier(score) {
  if (score == null) return null;
  if (score >= 75) return 'STRONG';
  if (score >= 50) return 'PASSING';
  if (score >= 25) return 'WEAK';
  return 'FAILING';
}

function repairScoreTierGaps(record) {
  const m = { ...record };
  const missingTierFields = [];
  const pairs = [
    ['longGateScore', 'longGateTier'],
    ['longAesScore', 'longAesTier'],
    ['longCandidateRunnerScoreAtEntry', 'longCandidateRunnerTierAtEntry'],
    ['longPostFee10EntryScore', 'longPostFee10EntryTier'],
    ['bucketAuditScore', 'bucketAuditTier'],
  ];
  for (const [scoreField, tierField] of pairs) {
    if (m[scoreField] != null && m[tierField] == null) missingTierFields.push(tierField);
  }
  if (missingTierFields.length) {
    m.longFilterMissingTierFields = missingTierFields;
    if (m.longFilterDataQuality === 'COMPLETE' || m.longFilterDataQuality == null) {
      m.longFilterDataQuality = 'DEGRADED';
    }
  }
  return m;
}

function applyV6Defaults(record) {
  const m = { ...record };
  for (const field of V5_NULL_DEFAULT_FIELDS) {
    if (!(field in m)) m[field] = null;
  }
  for (const field of V5_ARRAY_DEFAULT_FIELDS) {
    if (!(field in m)) m[field] = [];
  }
  if (!('longMicroUpConfirmationSourceCount' in m)) m.longMicroUpConfirmationSourceCount = null;
  if (!('longCombosPositiveCount' in m)) m.longCombosPositiveCount = null;
  if (!('longCombosAntiCount' in m)) m.longCombosAntiCount = null;
  if (!('absoluteEntryAdaptiveStatus' in m)) m.absoluteEntryAdaptiveStatus = 'INCOMPLETE';
  if (!('entryPolicyEvaluationStatus' in m)) m.entryPolicyEvaluationStatus = 'INCOMPLETE';
  if (!('longAesConfidenceCalibrationStatus' in m)) m.longAesConfidenceCalibrationStatus = 'UNCALIBRATED';
  if (!('antiSeverityCounts' in m)) m.antiSeverityCounts = {};
  if (m.entryPolicyDiagnosticDecision == null && m.entryPolicyShadowDecision != null) {
    m.entryPolicyDiagnosticDecision = m.entryPolicyShadowDecision;
  }
  if (m.requiredEntrySnapshotCompletenessPct == null && m.entrySnapshotCompletenessPct != null) {
    m.requiredEntrySnapshotCompletenessPct = m.entrySnapshotCompletenessPct;
  }
  if (m.optionalResearchFeatureCoveragePct == null && m.longFilterCoveragePct != null) {
    m.optionalResearchFeatureCoveragePct = m.longFilterCoveragePct;
  }
  m.entryResearchSchemaVersion = LONG_ENTRY_RESEARCH_SCHEMA_VERSION;
  m.longFilterSnapshotVersion = LONG_FILTER_SNAPSHOT_VERSION;
  m.exportSchemaVersion = LONG_TRADE_EXPORT_VERSION;
  return m;
}

export function migrateLongTradeRecord(record) {
  if (!record || typeof record !== 'object') return record;

  // Historic AUTO_END rows are retained operationally but normalized so new
  // analytics cannot confuse a run-window event with a genuine timeout. Rows
  // that froze the entry price as the final price are explicitly research-ineligible.
  const normalizedRecord = { ...record };
  const canonicalCloseReason = normalizeLongCloseReason(normalizedRecord.closeReason);
  if (normalizedRecord.closeReason === 'AUTO_END') {
    normalizedRecord.legacyCloseReason = 'AUTO_END';
    normalizedRecord.closeReason = CLOSE_REASON.RUN_STOP;
    normalizedRecord.canonicalCloseReason = CLOSE_REASON.RUN_STOP;
    normalizedRecord.closeReasonDetail = CLOSE_REASON.RUN_STOP;
  } else if (normalizedRecord.closed === true) {
    normalizedRecord.canonicalCloseReason = normalizedRecord.canonicalCloseReason ?? canonicalCloseReason;
  }
  const entry = Number(normalizedRecord.entryPrice);
  const final = Number(normalizedRecord.finalPrice ?? normalizedRecord.exitPrice ?? normalizedRecord.currentPrice);
  const gross = Number(normalizedRecord.grossNormPnlPct ?? normalizedRecord.normPnlPct ?? normalizedRecord.rawNormPnlPct);
  const frozenRunStop = normalizedRecord.closed === true
    && canonicalCloseReason === CLOSE_REASON.RUN_STOP
    && Number.isFinite(entry) && Number.isFinite(final) && entry === final
    && (!Number.isFinite(gross) || Math.abs(gross) < 1e-12);
  if (frozenRunStop) {
    normalizedRecord.finalPriceValidationPassed = false;
    normalizedRecord.finalizationDataQuality = 'FINALIZATION_FAILED';
    normalizedRecord.finalizationFailureCode = 'FROZEN_FINAL_PRICE';
    normalizedRecord.strategyResearchEligible = false;
    normalizedRecord.strategyResearchExclusionReason = 'FROZEN_FINAL_PRICE';
    normalizedRecord.autoEndUsedEntryPriceFallback = true;
  }

  // Hotfix quarantine for the first independent websocket lifecycle build.
  // That build read Binance bookTicker `A` (ask quantity) as the ask price
  // instead of lowercase `a`, contaminating live price, MFE/MAE and exits.
  // New records carry an explicit priceStreamSchemaVersion. Older records from
  // this exact lifecycle engine are retained operationally but excluded from
  // metrics because their path cannot be proven clean.
  const unverifiedBookTickerLifecycle = normalizedRecord.positionLifecycleEngine === 'INDEPENDENT_WEBSOCKET_V1'
    && !normalizedRecord.priceStreamSchemaVersion;
  if (unverifiedBookTickerLifecycle) {
    normalizedRecord.priceIntegrityStatus = 'INVALID';
    normalizedRecord.priceIntegrityFailureCode = 'UNVERIFIED_BOOK_TICKER_SCHEMA_V1';
    normalizedRecord.finalizationDataQuality = 'INVALID';
    normalizedRecord.finalizationFailureCode = normalizedRecord.finalizationFailureCode ?? 'PRICE_FEED_SCHEMA_CORRUPTION';
    normalizedRecord.strategyResearchEligible = false;
    normalizedRecord.strategyResearchExclusionReason = 'PRICE_FEED_SCHEMA_CORRUPTION';
  }

  const isCurrent = normalizedRecord.entryResearchSchemaVersion === LONG_ENTRY_RESEARCH_SCHEMA_VERSION;
  if (isCurrent) return repairScoreTierGaps(applyV6Defaults(normalizedRecord));

  const m = { ...normalizedRecord };

  if (m.longPostFee10EntryScore == null && m.longPostFee10Score != null) m.longPostFee10EntryScore = m.longPostFee10Score;
  if (m.longPostFee10EntryTier == null && m.longPostFee10Tier != null) m.longPostFee10EntryTier = m.longPostFee10Tier;
  if (m.isLongPostFee10CandidateAtEntry == null && m.isLongPostFee10Candidate != null) m.isLongPostFee10CandidateAtEntry = m.isLongPostFee10Candidate;

  if (m.longCandidateRunnerScoreAtEntry == null) {
    m.longCandidateRunnerScoreAtEntry = m.candidateRunnerScore ?? m.candidateRunnerScoreAtScan ?? null;
  }

  // Historical pre-V4 rows can safely reconstruct these tiers from their known
  // legacy threshold tables. V4 rows keep their recorded tiers verbatim.
  if (normalizedRecord.entryResearchSchemaVersion == null) {
    if (m.longGateTier == null) m.longGateTier = reconstructGateTier(m.longGateScore);
    if (m.longAesTier == null) m.longAesTier = reconstructAesTier(m.longAesScore);
    if (m.longCandidateRunnerTierAtEntry == null) m.longCandidateRunnerTierAtEntry = reconstructRunnerTier(m.longCandidateRunnerScoreAtEntry);
    if (m.longPostFee10EntryTier == null) m.longPostFee10EntryTier = reconstructPf10Tier(m.longPostFee10EntryScore);
    if (m.bucketAuditTier == null) m.bucketAuditTier = reconstructBucketAuditTier(m.bucketAuditScore);
  }

  if (m.entryPolicyWouldAllow != null || m.entryPolicyWouldBlock != null || m.entryPolicyReasons != null) {
    m.legacyResearchMetadata = {
      ...(m.legacyResearchMetadata ?? {}),
      entryPolicyWouldAllow: m.entryPolicyWouldAllow ?? null,
      entryPolicyWouldBlock: m.entryPolicyWouldBlock ?? null,
      entryPolicyReasons: m.entryPolicyReasons ?? null,
    };
  }

  return repairScoreTierGaps(applyV6Defaults(m));
}
