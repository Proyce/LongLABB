// ─── ENTRY SNAPSHOT CONSISTENCY ASSERTION ────────────────────────────────────
// Compares top-level flattened fields against their canonical snapshot equivalents.
// Spec §11: explicit mapping table; missing values are NOT treated as equal;
// test/CI throws, dev browser console.error, production silent telemetry.

const IS_TEST = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST);
const IS_DEV  = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

// Each check maps one top-level (flattened) field to its nested snapshot path.
export const CONSISTENCY_CHECKS = [
  { topLevel: 'longParentBucket',                nested: ['bucketClassification', 'longParentBucket'] },
  { topLevel: 'longGateScore',                   nested: ['gate', 'longGateScore'], tol: 0.01 },
  { topLevel: 'longGateWouldPass',               nested: ['gate', 'longGateWouldPass'] },
  { topLevel: 'longAesScore',                    nested: ['longAes', 'longAesScore'], tol: 0.01 },
  { topLevel: 'longAesTier',                     nested: ['longAes', 'longAesTier'] },
  { topLevel: 'longAuditDangerTier',             nested: ['longAudit', 'longAuditDangerTier'] },
  { topLevel: 'longCandidateRunnerScoreAtEntry', nested: ['candidateRunner', 'longCandidateRunnerScoreAtEntry'], tol: 0.01 },
  { topLevel: 'longPostFee10EntryScore',         nested: ['postFee10', 'longPostFee10EntryScore'], tol: 0.01 },
  { topLevel: 'longShadowDecision',              nested: ['shadowDecision', 'finalVerdict'] },
  { topLevel: 'longFilterDataQuality',           nested: ['dataQuality', 'verdict'] },
  { topLevel: 'entryResearchStatus',             nested: ['entryResearchStatus'] },
];

function resolvePath(root, path) {
  let cur = root;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

function valuesEquivalent(a, b, tol) {
  // Both intentionally null → equivalent.
  if (a === null && b === null) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= (tol ?? 0);
  }
  return a === b;
}

export function assertEntrySnapshotConsistency(trade) {
  if (!trade || !trade.entryResearchSnapshot) return;
  const snap = trade.entryResearchSnapshot;

  const mismatches = [];
  for (const check of CONSISTENCY_CHECKS) {
    const topValue    = trade[check.topLevel];
    const nestedValue = resolvePath(snap, check.nested);

    // Missing values are not automatically equal (spec §11).
    if (topValue === undefined || nestedValue === undefined) {
      mismatches.push({
        type: 'MISSING_PATH',
        field: check.topLevel,
        nested: check.nested.join('.'),
        top: topValue,
        snapshot: nestedValue,
      });
      continue;
    }

    if (!valuesEquivalent(topValue, nestedValue, check.tol)) {
      mismatches.push({
        type: 'MISMATCH',
        field: check.topLevel,
        nested: check.nested.join('.'),
        top: topValue,
        snapshot: nestedValue,
      });
    }
  }

  if (mismatches.length === 0) return;

  const msg = [
    `[assertEntrySnapshotConsistency] ${mismatches.length} inconsistency(ies) between top-level trade and entryResearchSnapshot:`,
    ...mismatches.map(m => `  [${m.type}] ${m.field} (snapshot.${m.nested}): top=${JSON.stringify(m.top)}, snapshot=${JSON.stringify(m.snapshot)}`),
  ].join('\n');

  if (IS_TEST) {
    throw new Error(msg);
  } else if (IS_DEV) {
    console.error(msg);
  }
  // production: optional telemetry, no crash.
}
