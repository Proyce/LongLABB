// ─── ENTRY SNAPSHOT PROVENANCE ──────────────────────────────────────────────

export const ENTRY_FIELD_STATUS = Object.freeze({
  RECORDED: 'RECORDED',
  NOT_RECORDED: 'NOT_RECORDED',
  UNAVAILABLE: 'UNAVAILABLE',
  STALE: 'STALE',
  CALCULATION_FAILED: 'CALCULATION_FAILED',
});

const CORE_FIELDS = Object.freeze([
  'entryTime', 'entryPrice', 'leverage', 'longParentBucket',
  'longMicroMomentumLabel', 'hasGreenConfirmation', 'hasRedDanger',
  'entryCvdLabel', 'spreadPct', 'atrPct', 'longGateScore', 'longAesScore',
  'bestDnaLongScore', 'longPostFee10EntryScore', 'longCandidateRunnerScoreAtEntry',
  // Adequacy and hypothesis fields (R-14)
  'tickSourceQuality', 'highAtrLongOpportunityScore', 'highAtrLongRiskScore',
]);

export function buildEntrySnapshotProvenance(sample = {}, capturedAt = Date.now()) {
  const status = {};
  let recorded = 0;
  for (const field of CORE_FIELDS) {
    const value = sample[field];
    const fieldStatus = value === undefined ? ENTRY_FIELD_STATUS.NOT_RECORDED : value === null ? ENTRY_FIELD_STATUS.UNAVAILABLE : ENTRY_FIELD_STATUS.RECORDED;
    status[field] = {
      status: fieldStatus,
      snapshotPhase: 'ENTRY',
      calculatedAt: capturedAt,
      sourceTimestamp: sample.marketDataTimestamp ?? sample.entryTime ?? capturedAt,
      dataComplete: fieldStatus === ENTRY_FIELD_STATUS.RECORDED,
    };
    if (fieldStatus === ENTRY_FIELD_STATUS.RECORDED) recorded++;
  }
  const completenessPct = Math.round((recorded / CORE_FIELDS.length) * 100);
  const tickRequiredFields = [
    'entryTickDataQuality',
    'entryTickCanonicalSource',
    'marketTickDirectionVerdict',
    'marketTickPrimaryPattern',
    'marketTickDirection3s',
    'marketTickDirection10s',
    'marketTickDirectionalBiasScore',
    'marketTickDirectionConfidenceScore',
  ];
  const tickKnown = tickRequiredFields.filter(field => {
    const value = sample[field];
    return value !== null && value !== undefined && value !== 'INSUFFICIENT';
  }).length;
  return Object.freeze({
    entrySnapshotCapturedAt: capturedAt,
    entrySnapshotMarketDataTimestamp: sample.marketDataTimestamp ?? sample.entryTime ?? capturedAt,
    entrySnapshotCompletenessPct: completenessPct,
    entrySnapshotRequiredFieldsComplete: recorded === CORE_FIELDS.length,
    entrySnapshotFieldStatus: status,
    entrySnapshotProvenanceVersion: 'ENTRY_PROVENANCE_V1_2026_06',
    entryTickRequiredFieldCount: sample.entryTickRequiredFieldCount ?? tickRequiredFields.length,
    entryTickKnownFieldCount: sample.entryTickKnownFieldCount ?? tickKnown,
    entryTickCoveragePct: sample.entryTickCoveragePct ?? Math.round((tickKnown / tickRequiredFields.length) * 100),
    entryTickDataQuality: sample.entryTickDataQuality ?? 'INSUFFICIENT',
    // Tick evidence availability fields
    tickEvidenceRequired:  false,
    tickEvidenceAvailable: sample.tickSourceQuality != null && sample.tickSourceQuality !== 'INSUFFICIENT',
    tickEvidenceQualified: sample.tickSourceQuality === 'COMPLETE',
  });
}
