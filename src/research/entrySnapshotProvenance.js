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
  return Object.freeze({
    entrySnapshotCapturedAt: capturedAt,
    entrySnapshotMarketDataTimestamp: sample.marketDataTimestamp ?? sample.entryTime ?? capturedAt,
    entrySnapshotCompletenessPct: completenessPct,
    entrySnapshotRequiredFieldsComplete: recorded === CORE_FIELDS.length,
    entrySnapshotFieldStatus: status,
    entrySnapshotProvenanceVersion: 'ENTRY_PROVENANCE_V1_2026_06',
  });
}
