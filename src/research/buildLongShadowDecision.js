// ─── LONG UNIFIED SHADOW DECISION ────────────────────────────────────────────
// Aggregates all research verdicts into one unified shadow decision.
// This object NEVER determines whether a trade is created.
// Its purpose is retrospective research and UI explanation only.
//
// Spec §10 priority:
//   1. CONFLICTED data                → UNKNOWN
//   2. insufficient required coverage → UNKNOWN
//   3. hard block evidence            → WOULD_HARD_BLOCK
//   4. block evidence                 → WOULD_BLOCK
//   5. caution evidence               → WOULD_REDUCE
//   6. premium positive evidence      → WOULD_ALLOW_PREMIUM
//   7. positive evidence              → WOULD_ALLOW
//   8. unresolved                     → UNKNOWN

export const SHADOW_VERDICT = Object.freeze({
  WOULD_ALLOW_PREMIUM: 'WOULD_ALLOW_PREMIUM',
  WOULD_ALLOW:         'WOULD_ALLOW',
  WOULD_REDUCE:        'WOULD_REDUCE',
  WOULD_BLOCK:         'WOULD_BLOCK',
  WOULD_HARD_BLOCK:    'WOULD_HARD_BLOCK',
  UNKNOWN:             'UNKNOWN',
});

// Canonical market-context label → evidence class (spec §10).
const CONTEXT_LABEL_MAP = {
  LONG_CONTEXT_STRONG_TAILWIND: 'STRONG_POSITIVE',
  LONG_CONTEXT_TAILWIND:        'POSITIVE',
  LONG_CONTEXT_SUPPORTIVE:      'POSITIVE',
  LONG_CONTEXT_NEUTRAL:         'NEUTRAL',
  LONG_CONTEXT_MIXED:           'CAUTION',
  LONG_CONTEXT_HEADWIND:        'CAUTION',
  LONG_CONTEXT_STRONG_HEADWIND: 'BLOCK',
  LONG_CONTEXT_HOSTILE:         'BLOCK',
  LONG_CONTEXT_STALE:           'UNKNOWN',
  LONG_CONTEXT_INSUFFICIENT:    'UNKNOWN',
  // Legacy BTC_* labels emitted by the existing normalizer (back-compat).
  BTC_STRONG_UP_LONG_TAILWIND:        'STRONG_POSITIVE',
  BTC_WEAK_UP_LONG_TAILWIND:          'POSITIVE',
  BTC_CHOP_LONG_SELECTIVE:            'NEUTRAL',
  BTC_MIXED_LONG_CONDITIONAL:         'NEUTRAL',
  BTC_WEAK_DOWN_LONG_HEADWIND:        'CAUTION',
  BTC_STRONG_DOWN_LONG_REVERSAL_ONLY: 'BLOCK',
  BTC_UNKNOWN:                        'UNKNOWN',
};

// Canonical market-breadth label → evidence class (spec §10).
const BREADTH_LABEL_MAP = {
  LONG_BREADTH_STRONG:      'STRONG_POSITIVE',
  LONG_BREADTH_SUPPORTIVE:  'POSITIVE',
  LONG_BREADTH_MIXED:       'CAUTION',
  LONG_BREADTH_DEGRADED:    'CAUTION',
  LONG_BREADTH_HOSTILE:     'BLOCK',
  LONG_BREADTH_HARD_DANGER: 'HARD_BLOCK',
  LONG_BREADTH_STALE:        'UNKNOWN',
  LONG_BREADTH_INSUFFICIENT: 'UNKNOWN',
};

function buildUnknown(reason, requiredCoveragePct = 0, extra = {}) {
  return {
    baseGateVerdict: 'UNKNOWN', aesVerdict: 'UNKNOWN', auditVerdict: 'UNKNOWN',
    bucketAuditVerdict: 'UNKNOWN', marketContextVerdict: 'UNKNOWN',
    marketBreadthVerdict: 'UNKNOWN', runnerVerdict: 'UNKNOWN', postFee10Verdict: 'UNKNOWN',
    dataQualityVerdict: 'UNKNOWN',
    finalVerdict: SHADOW_VERDICT.UNKNOWN,
    positiveReasons: [], cautionReasons: [], blockReasons: [],
    unknownReasons: [reason],
    requiredCoveragePct,
    logOnly: true, canAffectExecution: false, executionApplied: false,
    ...extra,
  };
}

export function buildLongShadowDecision({
  longGate,
  longAes,
  longAudit,
  bucketAudit,
  marketContext,
  marketBreadth,
  runner,
  postFee10,
  dataQuality,
} = {}) {
  const positiveReasons = [];
  const cautionReasons  = [];
  const blockReasons    = [];
  const unknownReasons  = [];

  // ── 1. Conflict precedence (spec §10) ───────────────────────────────────────
  // Conflicted data may never produce an allow/block verdict.
  if (
    dataQuality?.verdict === 'CONFLICTED' ||
    dataQuality?.longFilterDataQuality === 'CONFLICTED'
  ) {
    return buildUnknown('DATA_QUALITY_CONFLICTED', 0, { coverageConflicted: true });
  }

  // ── 2. Required-component coverage guard ─────────────────────────────────────
  // AES is DIAGNOSTIC_ONLY — it is no longer a required component (spec §9.1).
  // Required: Gate, DNA V2 (or V1 fallback), danger audit, data quality.
  const hasGate  = longGate  != null && longGate.longGateEligibility  != null;
  const hasDna   = longAes   != null && (longAes.longAesEligibility != null || longAes.absoluteEntryEligibility != null ||
                   longAes.bestDnaLongV2Score != null || longAes.bestDnaLongScore != null);
  const hasAudit = longAudit != null && longAudit.longAuditDangerTier != null;
  const hasData  = dataQuality != null && dataQuality.longFilterDataQuality != null;

  const requiredComponents = { dataQuality: hasData, longGate: hasGate, dnaQuality: hasDna, longAudit: hasAudit };
  const knownRequiredCount = Object.values(requiredComponents).filter(Boolean).length;
  const requiredCoveragePct = (knownRequiredCount / Object.keys(requiredComponents).length) * 100;

  if (requiredCoveragePct < 75) {
    return buildUnknown('INSUFFICIENT_REQUIRED_COVERAGE', requiredCoveragePct, { coverageInsufficient: true });
  }

  // ── Gate verdict ──────────────────────────────────────────────────────────
  const gateWouldPass   = longGate?.longGateWouldPass;
  const gateEligibility = longGate?.longGateEligibility;
  const gateScore       = longGate?.longGateScore ?? 0;

  let baseGateVerdict = 'UNKNOWN';
  if (gateEligibility === 'ELIGIBLE' || gateWouldPass === true) {
    baseGateVerdict = 'PASS';
    positiveReasons.push('LONG_GATE_ELIGIBLE');
    if (gateScore >= 80) positiveReasons.push('LONG_GATE_HIGH_QUALITY');
  } else if (gateEligibility === 'RESEARCH_REJECT' || gateWouldPass === false) {
    baseGateVerdict = 'BLOCK';
    blockReasons.push('LONG_GATE_RESEARCH_REJECT');
  }

  // ── AES verdict ───────────────────────────────────────────────────────────
  const aesScore       = longAes?.longAesScore ?? longAes?.absoluteEntryScore ?? 0;
  const aesEligibility  = longAes?.longAesEligibility ?? longAes?.absoluteEntryEligibility;

  let aesVerdict = 'UNKNOWN';
  if (aesEligibility === 'RESEARCH_BLOCK') {
    aesVerdict = 'BLOCK';
    blockReasons.push('LONG_AES_RESEARCH_BLOCKED');
  } else if (aesScore >= 80) {
    aesVerdict = 'HIGH';
    positiveReasons.push('LONG_AES_HIGH');
  } else if (aesScore >= 65) {
    aesVerdict = 'VALID';
    positiveReasons.push('LONG_AES_VALID');
  } else if (aesScore > 0) {
    aesVerdict = 'LOW';
    cautionReasons.push('LONG_AES_LOW');
  }

  // ── Audit verdict ─────────────────────────────────────────────────────────
  const auditTier = longAudit?.longAuditDangerTier;

  let auditVerdict = 'UNKNOWN';
  if (auditTier === 'CLEAR') {
    auditVerdict = 'CLEAR';
    positiveReasons.push('LONG_AUDIT_CLEAR');
  } else if (auditTier === 'CAUTION') {
    auditVerdict = 'CAUTION';
    cautionReasons.push('LONG_AUDIT_CAUTION');
  } else if (auditTier === 'DANGER') {
    auditVerdict = 'DANGER';
    blockReasons.push('LONG_AUDIT_DANGER');
  } else if (auditTier === 'HARD_DANGER') {
    auditVerdict = 'HARD_DANGER';
    blockReasons.push('LONG_AUDIT_HARD_DANGER');
  } else if (auditTier === 'UNKNOWN') {
    auditVerdict = 'UNKNOWN';
    unknownReasons.push('LONG_AUDIT_UNKNOWN_TELEMETRY');
  }

  // ── Bucket audit verdict ──────────────────────────────────────────────────
  const bucketAuditWouldPass =
    bucketAudit?.bucketAuditWouldPass ??
    bucketAudit?.topGainerContinuationWouldPass ??
    bucketAudit?.topLoserReversalWouldPass ?? null;

  let bucketAuditVerdict = 'UNKNOWN';
  if (bucketAuditWouldPass === true) {
    bucketAuditVerdict = 'PASS';
    positiveReasons.push('BUCKET_AUDIT_PASS');
  } else if (bucketAuditWouldPass === false) {
    bucketAuditVerdict = 'FAIL';
    cautionReasons.push('BUCKET_AUDIT_FAIL');
  }

  // ── Market context verdict (canonical mapping) ──────────────────────────────
  let marketContextVerdict = 'UNKNOWN';
  const mcLabel = marketContext?.longMarketContextLabel ?? marketContext?.btcLongContextLabel;
  const mcClass = mcLabel != null ? CONTEXT_LABEL_MAP[mcLabel] : undefined;
  if (mcClass === 'STRONG_POSITIVE') {
    marketContextVerdict = 'STRONG';
    positiveReasons.push('MARKET_CONTEXT_STRONG_TAILWIND');
  } else if (mcClass === 'POSITIVE') {
    marketContextVerdict = 'SUPPORTIVE';
    positiveReasons.push('MARKET_CONTEXT_TAILWIND');
  } else if (mcClass === 'NEUTRAL') {
    marketContextVerdict = 'NEUTRAL';
  } else if (mcClass === 'CAUTION') {
    marketContextVerdict = 'HEADWIND';
    cautionReasons.push('MARKET_CONTEXT_HEADWIND');
  } else if (mcClass === 'BLOCK') {
    marketContextVerdict = 'HOSTILE';
    blockReasons.push('MARKET_CONTEXT_HOSTILE');
  } else if (mcClass === 'UNKNOWN') {
    marketContextVerdict = 'UNKNOWN';
    unknownReasons.push('MARKET_CONTEXT_STALE');
  } else if (mcLabel != null) {
    marketContextVerdict = 'NEUTRAL';
  }

  // ── Market breadth verdict (canonical mapping) ──────────────────────────────
  let marketBreadthVerdict = 'UNKNOWN';
  const breadthLabel = marketBreadth?.longMarketBreadthLabel;
  const breadthClass = breadthLabel != null ? BREADTH_LABEL_MAP[breadthLabel] : undefined;
  if (breadthClass === 'STRONG_POSITIVE') {
    marketBreadthVerdict = 'STRONG';
    positiveReasons.push('LONG_BREADTH_STRONG');
  } else if (breadthClass === 'POSITIVE') {
    marketBreadthVerdict = 'SUPPORTIVE';
    positiveReasons.push('LONG_BREADTH_SUPPORTIVE');
  } else if (breadthClass === 'CAUTION') {
    marketBreadthVerdict = 'MIXED';
    cautionReasons.push('LONG_BREADTH_MIXED');
  } else if (breadthClass === 'BLOCK') {
    marketBreadthVerdict = 'HOSTILE';
    blockReasons.push('LONG_BREADTH_HOSTILE');
  } else if (breadthClass === 'HARD_BLOCK') {
    marketBreadthVerdict = 'HARD_DANGER';
    blockReasons.push('LONG_BREADTH_HARD_DANGER');
  } else if (breadthClass === 'UNKNOWN') {
    marketBreadthVerdict = 'UNKNOWN';
    unknownReasons.push('LONG_BREADTH_STALE');
  }

  // ── Runner / Post-Fee 10 verdicts ─────────────────────────────────────────
  let runnerVerdict    = 'UNKNOWN';
  let postFee10Verdict = 'UNKNOWN';
  if (runner?.longCandidateRunnerTierAtEntry) {
    runnerVerdict = runner.longCandidateRunnerTierAtEntry;
    if (runner.longCandidateRunnerWouldAllow) positiveReasons.push('RUNNER_WOULD_ALLOW');
  }
  if (postFee10?.longPostFee10EntryTier) {
    postFee10Verdict = postFee10.longPostFee10EntryTier;
    if (postFee10.isLongPostFee10CandidateAtEntry) positiveReasons.push('POST_FEE_10_CANDIDATE');
  }

  // ── Data quality verdict ──────────────────────────────────────────────────
  let dataQualityVerdict = 'UNKNOWN';
  const dqLevel = dataQuality?.longFilterDataQuality;
  if (dqLevel === 'COMPLETE') dataQualityVerdict = 'COMPLETE';
  else if (dqLevel === 'DEGRADED') {
    dataQualityVerdict = 'DEGRADED';
    cautionReasons.push('DATA_QUALITY_DEGRADED');
  } else if (dqLevel === 'INCOMPLETE') {
    dataQualityVerdict = 'INCOMPLETE';
    unknownReasons.push('DATA_QUALITY_INCOMPLETE');
  }

  // ── Final verdict aggregation (spec §10 priority) ───────────────────────────
  let finalVerdict;

  const hasHardBlock =
    auditVerdict === 'HARD_DANGER' ||
    marketBreadthVerdict === 'HARD_DANGER';

  const hasBlock =
    auditVerdict === 'DANGER' ||
    marketBreadthVerdict === 'HOSTILE' ||
    marketContextVerdict === 'HOSTILE' ||
    aesVerdict === 'BLOCK' ||
    baseGateVerdict === 'BLOCK';

  const hasReduce =
    marketBreadthVerdict === 'MIXED' ||
    marketContextVerdict === 'HEADWIND' ||
    auditVerdict === 'CAUTION' ||
    bucketAuditVerdict === 'FAIL' ||
    aesVerdict === 'LOW';

  // DNA V2 is now the canonical quality score (spec §9.1).
  const dnaV2Score = longAes?.bestDnaLongV2Score ?? longAes?.bestDnaLongScore ?? 0;

  if (hasHardBlock) {
    finalVerdict = SHADOW_VERDICT.WOULD_HARD_BLOCK;
  } else if (hasBlock) {
    finalVerdict = SHADOW_VERDICT.WOULD_BLOCK;
  } else if (hasReduce) {
    finalVerdict = SHADOW_VERDICT.WOULD_REDUCE;
  } else if (
    dnaV2Score >= 80 &&
    gateScore >= 80 &&
    positiveReasons.length >= 3 &&
    blockReasons.length === 0
  ) {
    finalVerdict = SHADOW_VERDICT.WOULD_ALLOW_PREMIUM;
  } else if (
    blockReasons.length === 0 &&
    unknownReasons.length < 3 &&
    positiveReasons.length > 0
  ) {
    finalVerdict = SHADOW_VERDICT.WOULD_ALLOW;
  } else {
    finalVerdict = SHADOW_VERDICT.UNKNOWN;
  }

  return {
    baseGateVerdict,
    aesVerdict,  // Retained as diagnostic alias for AES
    auditVerdict,
    bucketAuditVerdict,
    marketContextVerdict,
    marketBreadthVerdict,
    runnerVerdict,
    postFee10Verdict,
    dataQualityVerdict,

    finalVerdict,
    requiredCoveragePct,

    positiveReasons,
    cautionReasons,
    blockReasons,
    unknownReasons,

    // Coverage reporting (spec §9.3)
    shadowDecisionRequiredCoveragePct: requiredCoveragePct,
    shadowDecisionOptionalCoveragePct: null,
    shadowDecisionMissingRequiredComponents: Object.entries(
      { dataQuality: hasData, longGate: hasGate, dnaQuality: hasDna, longAudit: hasAudit }
    ).filter(([, v]) => !v).map(([k]) => k),
    shadowDecisionQualityModelUsed: 'GATE_DNA_V2_CANONICAL',

    logOnly:            true,
    canAffectExecution: false,
    executionApplied:   false,
  };
}
