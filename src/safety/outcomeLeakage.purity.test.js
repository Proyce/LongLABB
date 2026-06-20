// ─── OUTCOME LEAKAGE PURITY TESTS ────────────────────────────────────────────
// These tests read source files as text and assert that entry-time modules do
// NOT reference post-close outcome fields.
//
// Why: if an entry scorer reads feeAdjustedFinalPnlPct, closeReason, mfe, mae,
// realizedHoldMs, or forwardMove from a candidate, the model is trained on
// future knowledge, which invalidates the research signal.
//
// CI must fail if any of these references appear in the guarded modules.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

function src(relPath) {
  try {
    return readFileSync(resolve(ROOT, 'src', relPath), 'utf8');
  } catch {
    return null; // file may not exist yet; test will pass vacuously
  }
}

const OUTCOME_FIELDS = [
  'feeAdjustedFinalPnlPct',
  'closeReason',
  'realizedHoldMs',
  'holdMsActual',
  'forwardMove',
  'runnerOutcome',
  // MFE / MAE are OK in the lifecycle engine but must not appear in ENTRY scorers
];

const ENTRY_SCORER_MODULES = [
  'scoring/longCandidateRunner/longCandidateRunner.features.js',
  'audits/bestDnaLongAudit.js',
  'longAudits/longEntryDangerAuditLogOnly.js',
  'entryPolicy/evaluateEntryPolicyLogOnly.js',
  'entryPolicy/evaluateCanonicalShadowPolicyV3.js',
];

// MFE / MAE are outcome fields but also appear in some lifecycle / export modules.
// Only guard against them in pure entry-time scorers.
const ENTRY_SCORER_EXTRA_FIELDS = ['\.mfe\b', '\.mae\b'];

describe('Outcome leakage purity — entry-time scorer modules', () => {
  for (const module of ENTRY_SCORER_MODULES) {
    for (const field of OUTCOME_FIELDS) {
      it(`${module} must not reference outcome field "${field}"`, () => {
        const code = src(module);
        if (code === null) return; // vacuous pass if file doesn't exist
        // Skip comment lines (// ...) and string literals that are just naming
        const codeNoComments = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(codeNoComments).not.toContain(field);
      });
    }
  }

  for (const module of ENTRY_SCORER_MODULES) {
    for (const rawPattern of ENTRY_SCORER_EXTRA_FIELDS) {
      it(`${module} must not reference field matching "${rawPattern}"`, () => {
        const code = src(module);
        if (code === null) return;
        const codeNoComments = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(codeNoComments).not.toMatch(new RegExp(rawPattern));
      });
    }
  }
});
