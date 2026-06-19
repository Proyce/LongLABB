// LongLAB V8 telemetry compaction.
// Keeps the analysis-ready scalar contract while removing nested structures that
// duplicate flattened fields and static registry metadata repeated per trade.

export const HEAVY_DUPLICATE_TELEMETRY_FIELDS = Object.freeze([
  'entryResearchSnapshot',
  'longComboDetails',
  'longWinningSetupMatchDetails',
  'entrySnapshotFieldStatus',
  'entryTickSnapshot',
]);

export const TRADE_STATIC_MANIFEST_FIELDS = Object.freeze([
  'scoreRegistryVersion',
  'filterRegistryVersion',
  'labelRegistryVersion',
  'comboRegistrySchemaVersion',
  'antiComboRegistryVersion',
  'winningSetupRegistryVersion',
  'marketContextVersion',
  'exitSystemVersion',
  'pnlModelVersion',
  'longAesV2ComponentWeights',
  'longAesPrimaryVersion',
  'longAesV2PromotionStatus',
  'bestDnaPrimaryVersion',
  'bestDnaV2PromotionStatus',
  'logOnly',
  'canAffectExecution',
  'executionApplied',
]);

export const DEFAULT_EXPORT_ALIAS_FIELDS = Object.freeze([
  'rawMarginPnlPct',
  'rawNormPnlPct',
  'feeAdjustedMarginPnlPct',
  'priceMovePct',
  'longAdaptiveAesBaseScore',
  'longAdaptiveAesScore',
  'longAdaptiveAesRequiredScore',
  'longAdaptiveAesGap',
  'longAdaptiveAesWouldPass',
  'activeWinningSetupIds',
  'rawPositiveComboCount',
  'rawAntiComboCount',
  'longAesV2MinusV1',
  'profitLockActive',
  'profitLockLevelMarginPct',
  'profitLockLevelPrice',
  'profitLockStage',
  'profitLockDetectionLatencyMs',
  'profitLockFloorEnforcementSucceeded',
  'floorExitEnforced',
  'entryResearchSchemaVersion',
  'exportSchemaVersion',
  'longDataQualityTierV2',
  'entryPolicyShadowDecision',
  'longAesConfidenceDistinctValueCountAtRun',
  'cvdStateCurrent',
  'longWinningSetupCatalogVersion',
  'longWinningSetupsVersion',
  'longComboRegistryVersion',
]);

export const DEFAULT_COMPACT_EXPORT_EXCLUSIONS = Object.freeze([
  ...HEAVY_DUPLICATE_TELEMETRY_FIELDS,
  ...TRADE_STATIC_MANIFEST_FIELDS,
  ...DEFAULT_EXPORT_ALIAS_FIELDS,
  'entrySnapshotCompletenessPct',
  'longFilterCoveragePct',
]);

const TICK_RUNTIME_KEEP_FIELDS = new Set([
  'marketTickPrimaryPattern',
  'marketTickAtrTier',
  'marketTickDirectionalBiasScore',
  'marketTickDirectionConfidenceScore',
  'marketTickDirectionVerdict',
  'marketTickDirection3s',
  'marketTickDirection10s',
  'marketTickNetMoveBps3s',
  'marketTickNetMoveBps10s',
  'marketTickEfficiency3s',
  'marketTickEfficiency10s',
  'marketTickVelocityBpsPerSec3s',
  'marketTickAccelerationBpsPerSec2_3s',
  'marketTickCurrentUpStreak',
  'marketTickCurrentDownStreak',
  'marketTickReversalCount10',
  'marketTickSequenceSignature10',
  'marketTickAggressorFlowLabel3s',
  'marketTickAggressorVolumeImbalance3s',
  'marketTickBookImbalanceMean3s',
  'marketTickTradeBookAgreement3s',
  'marketTickEvidenceAgreementLabel',
  'marketTickNeutralThresholdBps',
  'marketTickOutcomeCoveragePct',
  'marketTickOutcomeAuditVersion',
  'marketTickPromotionStatus',
  'marketTickCanAffectExecution',
  'marketTickExecutionApplied',
]);

const TICK_RUNTIME_DROP_FIELDS = new Set([
  'entryTickSnapshotCapturedAt',
  'entryTickWindowEndAt',
  'entryTickOldestEventAt',
  'entryTickNewestEventAt',
  'entryTickTimestampBasis',
  'entryTickMissingReasons',
  'entryTickRequiredFieldCount',
  'entryTickKnownFieldCount',
  'entryTickTradeEventCount',
  'entryTickBookEventCount',
  'entryTickAtrPctObserved',
  'entryTickSpreadPctObserved',
  'highAtrDirectionalOpportunityReasons',
]);

export function compactLongTradeForRuntime(trade) {
  if (!trade || typeof trade !== 'object') return trade;
  const compact = { ...trade };
  for (const field of HEAVY_DUPLICATE_TELEMETRY_FIELDS) delete compact[field];
  // Static version/config metadata belongs in the batch manifest. Keep the trade
  // schema and fee model fields because they can legitimately vary across legacy rows.
  for (const field of TRADE_STATIC_MANIFEST_FIELDS) delete compact[field];
  delete compact.longAesConfidenceDistinctValueCountAtRun;
  if (compact.cvdStateCurrent === compact.cvdStateAtEntry) delete compact.cvdStateCurrent;
  for (const key of Object.keys(compact)) {
    const isOutcome = /^(marketTickForward|marketTickPrediction|marketTickOutcomeSource)/.test(key);
    if (key.startsWith('marketTick') && !isOutcome && !TICK_RUNTIME_KEEP_FIELDS.has(key)) {
      delete compact[key];
    }
    if (TICK_RUNTIME_DROP_FIELDS.has(key)) delete compact[key];
  }
  compact.telemetryStorageProfile = 'LONG_TELEMETRY_V9_COMPACT';
  return compact;
}

export function compactLongTradesForPersistence(trades) {
  return (Array.isArray(trades) ? trades : []).map(compactLongTradeForRuntime);
}

export function buildExceptionalForensicEvent(trade) {
  if (!trade || typeof trade !== 'object') return null;
  const exceptional = trade.priceIntegrityStatus === 'INVALID'
    || trade.finalizationDataQuality === 'INVALID'
    || trade.finalizationDataQuality === 'FINALIZATION_FAILED'
    || trade.profitLockFloorMissed === true
    || trade.profitLockEnforcementFailed === true
    || trade.positionLifecycleRestFallbackStatus?.startsWith?.('DEGRADED')
    || trade.stopLossCrossClassification === 'FIRST_TICK_ALREADY_BELOW_STOP'
    || trade.stopLossCrossClassification === 'TRUE_MARKET_GAP';
  if (!exceptional) return null;
  return {
    tradeId: trade.tradeId ?? trade.id ?? null,
    run: trade.runId ?? trade.run ?? null,
    symbol: trade.symbol ?? null,
    entryTime: trade.entryTime ?? null,
    closedAt: trade.closedAt ?? null,
    closeReason: trade.closeReason ?? null,
    finalizationDataQuality: trade.finalizationDataQuality ?? null,
    finalizationFailureCode: trade.finalizationFailureCode ?? null,
    priceIntegrityStatus: trade.priceIntegrityStatus ?? null,
    priceIntegrityFailureCode: trade.priceIntegrityFailureCode ?? null,
    profitLockFloorMissed: trade.profitLockFloorMissed ?? null,
    profitLockEnforcementFailed: trade.profitLockEnforcementFailed ?? null,
    positionLifecycleRestFallbackStatus: trade.positionLifecycleRestFallbackStatus ?? null,
    positionLifecycleFallbackReason: trade.positionLifecycleFallbackReason ?? null,
    stopLossCrossClassification: trade.stopLossCrossClassification ?? null,
    stopLossPreviousObservedPrice: trade.stopLossPreviousObservedPrice ?? null,
    stopLossTriggerObservedPrice: trade.stopLossTriggerObservedPrice ?? null,
    stopLossGapThroughPricePct: trade.stopLossGapThroughPricePct ?? null,
    boundedExitTickAudit: Array.isArray(trade.boundedExitTickAudit) ? trade.boundedExitTickAudit : undefined,
  };
}
