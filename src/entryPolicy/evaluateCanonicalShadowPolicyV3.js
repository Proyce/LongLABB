// ─── CANONICAL SHADOW ENTRY POLICY V3 (GATE + DNA LOG ONLY) ─────────────────
// Replaces AES as the canonical quality authority.
// AES is demoted to DIAGNOSTIC_ONLY and must not control this verdict.
//
// Canonical inputs:
//   1. Long Gate score and tier
//   2. BestDNA V2 raw score and tier (V1 allowed as fallback)
//   3. Hard anti-combo presence
//   4. Long danger-audit result
//   5. CVD state
//   6. Green or micro-up confirmation
//   7. Data-quality status
//   8. True-tick evidence (optional — absence must not auto-block)
//   9. Independent positive-evidence count
//   10. Independent negative-evidence count
//
// All fields remain LOG_ONLY; canAffectExecution is always false.

export const CANONICAL_SHADOW_POLICY_VERSION = 'LONG_ENTRY_POLICY_V3_GATE_DNA_LOG_ONLY';

export const CANONICAL_SHADOW_VERDICT = Object.freeze({
  HARD_BLOCK: 'HARD_BLOCK',
  BLOCK:      'BLOCK',
  REDUCE:     'REDUCE',
  ALLOW:      'ALLOW',
  PREMIUM:    'PREMIUM',
  UNKNOWN:    'UNKNOWN',
});

const SAFETY = Object.freeze({
  canonicalShadowCanAffectExecution: false,
  canonicalShadowExecutionApplied:   false,
  logOnly:                           true,
});

function finite(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Evaluate the canonical V3 shadow entry policy.
 *
 * @param {object} inputs — all research signals for the candidate
 * @returns {object} — verdict, reasons, and traceability fields
 */
export function evaluateCanonicalShadowPolicyV3(inputs = {}) {
  const reasons         = [];
  const positiveReasons = [];
  const cautionReasons  = [];
  const blockReasons    = [];
  const unknownReasons  = [];

  // ── Required components ───────────────────────────────────────────────────
  const gateScore   = finite(inputs?.longGateScore ?? inputs?.gateScore) ?? null;
  const gateTier    = inputs?.longGateTier ?? null;
  const gatePass    = inputs?.longGateWouldPass === true;
  const gateFail    = inputs?.longGateWouldPass === false;

  const dnaV2Score  = finite(inputs?.bestDnaLongScoreV2Shadow) ?? null;
  const dnaV1Score  = finite(inputs?.bestDnaLongScore)          ?? null;
  const dnaScore    = dnaV2Score ?? dnaV1Score ?? null;
  const dnaVersion  = dnaV2Score != null ? 'V2_SHADOW' : dnaV1Score != null ? 'V1_FALLBACK' : 'UNAVAILABLE';
  const dnaV2Tier   = inputs?.bestDnaLongTierV2Shadow ?? null;

  const dangerTier        = inputs?.longAuditDangerTier   ?? null;
  const hardDanger        = dangerTier === 'HARD_DANGER';
  const danger            = dangerTier === 'DANGER';
  const dangerCaution     = dangerTier === 'CAUTION';

  const hardAntiCombo     = inputs?.longHardAntiComboActive   === true ||
                            inputs?.longComboHardBlockPresent  === true;

  const cvdBear           = inputs?.entryCvdLabel === 'BEAR' || inputs?.cvdLabel === 'BEAR';
  const cvdBull           = inputs?.entryCvdLabel === 'BULL' || inputs?.cvdLabel === 'BULL';

  const hasGreenConfirm   = inputs?.immediateGreenImpulse === true ||
                            inputs?.greenImpulseDetected  === true ||
                            inputs?.hasGreenConfirmation  === true;

  const dataQuality       = inputs?.longFilterDataQuality ?? inputs?.dataQuality ?? null;
  const dataOk            = dataQuality == null || dataQuality === 'COMPLETE' || dataQuality === 'DEGRADED';
  const dataConflicted    = dataQuality === 'CONFLICTED';

  const tickVerdict       = inputs?.marketTickDirectionVerdict;
  const tickUp            = tickVerdict === 'UP' || tickVerdict === 'STRONG_UP';
  const tickDown          = tickVerdict === 'DOWN' || tickVerdict === 'STRONG_DOWN';
  const tickAvailable     = tickVerdict != null && tickVerdict !== 'INSUFFICIENT';

  const highAtrRiskHigh   = inputs?.highAtrLongRiskTier === 'HIGH';
  const tickQualityAdequate = inputs?.tickSnapshotDataQuality === 'COMPLETE' ||
                              inputs?.tickSourceQuality       === 'COMPLETE';

  // ── Required-component coverage ───────────────────────────────────────────
  const hasGate   = gateScore != null || gateTier != null;
  const hasDna    = dnaScore  != null;
  const hasDanger = dangerTier != null;
  const hasData   = dataQuality != null;
  const missingRequired = [];
  if (!hasGate)   missingRequired.push('LONG_GATE');
  if (!hasDna)    missingRequired.push('BEST_DNA');
  if (!hasDanger) missingRequired.push('DANGER_AUDIT');

  const requiredCoveragePct = ((hasGate ? 1 : 0) + (hasDna ? 1 : 0) + (hasDanger ? 1 : 0) + (hasData ? 1 : 0)) / 4 * 100;

  if (requiredCoveragePct < 50) {
    return {
      canonicalShadowEntryPolicyDecision: CANONICAL_SHADOW_VERDICT.UNKNOWN,
      canonicalShadowEntryPolicyReasons:  ['INSUFFICIENT_REQUIRED_COVERAGE'],
      canonicalShadowEntryPolicyVersion:  CANONICAL_SHADOW_POLICY_VERSION,
      canonicalShadowQualityModelUsed:    'GATE_DNA_V3',
      canonicalShadowDnaVersionUsed:      dnaVersion,
      canonicalShadowTickEvidenceUsed:    false,
      canonicalShadowTickEvidenceQualified: false,
      shadowDecisionRequiredCoveragePct:  requiredCoveragePct,
      shadowDecisionMissingRequiredComponents: missingRequired,
      ...SAFETY,
    };
  }

  // ── Count independent positive and negative families ─────────────────────
  let positiveCount = 0;
  let negativeCount = 0;

  if (gatePass) { positiveCount++; positiveReasons.push('GATE_PASS'); }
  if (gateFail) { negativeCount++; blockReasons.push('GATE_FAIL'); }
  if (dnaScore != null && dnaScore >= 70) { positiveCount++; positiveReasons.push(`DNA_${dnaVersion}_HIGH`); }
  if (dnaScore != null && dnaScore < 40)  { negativeCount++; cautionReasons.push('DNA_LOW'); }
  if (hasGreenConfirm) { positiveCount++; positiveReasons.push('GREEN_CONFIRMATION'); }
  if (cvdBull)         { positiveCount++; positiveReasons.push('CVD_BULL'); }
  if (tickUp && tickAvailable) { positiveCount++; positiveReasons.push('TICK_VERDICT_UP'); }
  if (tickDown && tickAvailable) { negativeCount++; blockReasons.push('TICK_VERDICT_DOWN'); }
  if (cvdBear && !hasGreenConfirm) { negativeCount++; cautionReasons.push('CVD_BEAR_NO_GREEN'); }
  if (highAtrRiskHigh && tickQualityAdequate) { negativeCount++; blockReasons.push('HIGH_ATR_RISK_HIGH'); }
  if (dangerCaution) cautionReasons.push('DANGER_AUDIT_CAUTION');
  if (!dataOk) unknownReasons.push('DATA_QUALITY_INSUFFICIENT');
  if (dataConflicted) { negativeCount++; blockReasons.push('DATA_CONFLICTED'); }

  // ── Entry-time data completeness check (replaces finalizationDataQuality) ──
  const entryDataIncomplete =
    inputs?.longFilterDataQuality === 'INCOMPLETE' ||
    inputs?.entrySnapshotCompletenessStatus === 'INCOMPLETE';

  // ── HARD_BLOCK verdict ────────────────────────────────────────────────────
  if (
    hardDanger || hardAntiCombo || dataConflicted ||
    (cvdBear && tickDown && tickQualityAdequate) ||
    (highAtrRiskHigh && tickQualityAdequate)
  ) {
    const hardBlockReasons = [];
    if (hardDanger)                           hardBlockReasons.push('HARD_DANGER_AUDIT');
    if (hardAntiCombo)                        hardBlockReasons.push('HARD_ANTI_COMBO');
    if (dataConflicted)                       hardBlockReasons.push('DATA_CONFLICTED');
    if (cvdBear && tickDown && tickQualityAdequate) hardBlockReasons.push('CVD_BEAR_TICK_DOWN');
    if (highAtrRiskHigh && tickQualityAdequate)    hardBlockReasons.push('HIGH_ATR_RISK_HIGH_TICK_ADEQUATE');
    return buildResult(CANONICAL_SHADOW_VERDICT.HARD_BLOCK, hardBlockReasons, {
      dnaVersion, tickAvailable, tickQualityAdequate, requiredCoveragePct,
      positiveCount, negativeCount, missingRequired,
    });
  }

  // ── BLOCK verdict ─────────────────────────────────────────────────────────
  if (
    (gateFail && dnaScore != null && dnaScore < 55) ||
    (!hasGreenConfirm && cvdBear) ||
    (tickDown && tickQualityAdequate) ||
    (negativeCount >= 2 && positiveCount === 0) ||
    danger
  ) {
    const bR = [...blockReasons];
    if (danger) bR.push('DANGER_AUDIT');
    return buildResult(CANONICAL_SHADOW_VERDICT.BLOCK, bR, {
      dnaVersion, tickAvailable, tickQualityAdequate, requiredCoveragePct,
      positiveCount, negativeCount, missingRequired,
    });
  }

  // ── REDUCE verdict ────────────────────────────────────────────────────────
  const gateWatch  = gateTier === 'WATCH' || (gateScore != null && gateScore < 60);
  const dnaCandidate = dnaScore != null && dnaScore >= 40 && dnaScore < 70;
  if (
    (gateWatch && dnaCandidate) ||
    dangerCaution ||
    cautionReasons.length >= 2 ||
    (!dataOk)
  ) {
    return buildResult(CANONICAL_SHADOW_VERDICT.REDUCE, [...cautionReasons], {
      dnaVersion, tickAvailable, tickQualityAdequate, requiredCoveragePct,
      positiveCount, negativeCount, missingRequired,
    });
  }

  // ── ALLOW prerequisites ───────────────────────────────────────────────────
  const dnaHighEnough = dnaScore != null && dnaScore >= 70;
  const gateStrong    = gatePass && (gateScore == null || gateScore >= 60);
  const coreAllow     = gateStrong && dnaHighEnough && !hardAntiCombo && !hardDanger && !danger && !cvdBear && dataOk;

  if (!coreAllow) {
    return buildResult(CANONICAL_SHADOW_VERDICT.REDUCE, ['DOES_NOT_MEET_ALLOW_MINIMUM'], {
      dnaVersion, tickAvailable, tickQualityAdequate, requiredCoveragePct,
      positiveCount, negativeCount, missingRequired,
    });
  }

  // ── PREMIUM verdict ───────────────────────────────────────────────────────
  const gatePremium = gateScore != null && gateScore >= 80;
  const dnaElite    = dnaScore  != null && dnaScore  >= 85;
  if (
    gatePremium && dnaElite &&
    hasGreenConfirm &&
    cvdBull &&
    positiveCount >= 4 &&
    blockReasons.length === 0
  ) {
    return buildResult(CANONICAL_SHADOW_VERDICT.PREMIUM, positiveReasons, {
      dnaVersion, tickAvailable, tickQualityAdequate, requiredCoveragePct,
      positiveCount, negativeCount, missingRequired,
    });
  }

  return buildResult(CANONICAL_SHADOW_VERDICT.ALLOW, positiveReasons, {
    dnaVersion, tickAvailable, tickQualityAdequate, requiredCoveragePct,
    positiveCount, negativeCount, missingRequired,
  });
}

function buildResult(verdict, reasons, meta) {
  return {
    canonicalShadowEntryPolicyDecision: verdict,
    canonicalShadowEntryPolicyReasons:  reasons,
    canonicalShadowEntryPolicyVersion:  CANONICAL_SHADOW_POLICY_VERSION,
    canonicalShadowQualityModelUsed:    'GATE_DNA_V3',
    canonicalShadowDnaVersionUsed:      meta.dnaVersion,
    canonicalShadowTickEvidenceUsed:    meta.tickAvailable,
    canonicalShadowTickEvidenceQualified: meta.tickQualityAdequate,
    shadowDecisionRequiredCoveragePct:  meta.requiredCoveragePct,
    shadowDecisionOptionalCoveragePct:  null,
    shadowDecisionMissingRequiredComponents: meta.missingRequired,
    shadowDecisionQualityModelUsed:     'GATE_DNA_V3',
    positiveEvidenceCount:  meta.positiveCount,
    negativeEvidenceCount:  meta.negativeCount,
    ...SAFETY,
  };
}
