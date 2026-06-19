// Lightweight worker transport for the 20-run analysis ZIP.
// The omitted fields are very large nested diagnostics whose important analysis
// outputs already exist as flattened top-level columns. Removing them before
// postMessage prevents the browser from cloning the entire forensic payload.

export const LONG_BATCH_TRANSPORT_OMITTED_FIELDS = Object.freeze([
  'entryResearchSnapshot',
  'longComboDetails',
  'longWinningSetupMatchDetails',
  'entrySnapshotFieldStatus',
  'entryTickSnapshot',
]);

export function createLongBatchWorkerSnapshot(trades) {
  return (Array.isArray(trades) ? trades : []).map(trade => {
    if (!trade || typeof trade !== 'object') return trade;
    const snapshot = { ...trade };
    for (const field of LONG_BATCH_TRANSPORT_OMITTED_FIELDS) delete snapshot[field];
    return snapshot;
  });
}
