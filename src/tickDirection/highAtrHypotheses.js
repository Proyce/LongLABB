// ─── HIGH-ATR LONG HYPOTHESES ─────────────────────────────────────────────────
// Shadow-only research hypotheses for High-ATR tick-direction events.
// All results are LOG_ONLY and CANNOT affect execution.
//
// Hypotheses remain shadow-only until minimum sample and cross-batch criteria
// are met.  Status field tracks readiness.

export const HIGH_ATR_HYPOTHESIS_STATUS = Object.freeze({
  SHADOW_ONLY:                 'SHADOW_ONLY',
  CROSS_BATCH_CONFIRMED_RESEARCH: 'CROSS_BATCH_CONFIRMED_RESEARCH',
});

const BASE_SAFETY = Object.freeze({
  logOnly:           true,
  canAffectExecution: false,
  executionApplied:  false,
});

function isAtrActive(candidate) {
  return Number(candidate?.atrPct ?? 0) >= Number(candidate?.highAtrThreshold ?? 0.6);
}

function tickQualityOk(candidate, minQuality = 'COMPLETE') {
  const q = candidate?.tickSnapshotDataQuality ?? candidate?.tickSourceQuality;
  return q === minQuality || q === 'COMPLETE';
}

function noHardAntiCombo(candidate) {
  return candidate?.longHardAntiComboActive !== true &&
    candidate?.longComboHardBlockPresent !== true;
}

function tickVerdictUp(candidate) {
  const v = candidate?.marketTickDirectionVerdict;
  return v === 'UP' || v === 'STRONG_UP';
}

function tickVerdictDown(candidate) {
  const v = candidate?.marketTickDirectionVerdict;
  return v === 'DOWN' || v === 'STRONG_DOWN';
}

// ── Positive hypotheses ───────────────────────────────────────────────────────

export function evaluateHighAtrTrueTickUpCvdOkV1(candidate) {
  const matched =
    isAtrActive(candidate) &&
    tickQualityOk(candidate) &&
    tickVerdictUp(candidate) &&
    candidate?.entryCvdLabel !== 'BEAR' &&
    noHardAntiCombo(candidate) &&
    Number(candidate?.spreadPct ?? 1) < 0.5;

  return {
    hypothesisId: 'LONG_HIGH_ATR_TRUE_TICK_UP_CVD_OK_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    ...BASE_SAFETY,
  };
}

export function evaluateHighAtrTrueTickUpGateStrongV1(candidate) {
  const base = evaluateHighAtrTrueTickUpCvdOkV1(candidate);
  const matched = base.matched && Number(candidate?.longGateScore ?? 0) >= 70;
  return {
    hypothesisId: 'LONG_HIGH_ATR_TRUE_TICK_UP_GATE_STRONG_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    ...BASE_SAFETY,
  };
}

export function evaluateHighAtrTrueTickUpDnaV2_80_V1(candidate) {
  const base = evaluateHighAtrTrueTickUpCvdOkV1(candidate);
  const dnaScore = Number(
    candidate?.bestDnaLongV2Score ?? candidate?.bestDnaLongScore ?? 0,
  );
  const dnaVersion = candidate?.bestDnaLongV2Score != null ? 'V2'
    : candidate?.bestDnaLongScore != null ? 'V1_FALLBACK'
    : 'UNAVAILABLE';
  const matched = base.matched && dnaScore >= 80 && dnaVersion !== 'UNAVAILABLE';
  return {
    hypothesisId: 'LONG_HIGH_ATR_TRUE_TICK_UP_DNA_V2_80_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    dnaVersionUsed: dnaVersion,
    ...BASE_SAFETY,
  };
}

export function evaluateHighAtrGreenMicroTrueTickV1(candidate) {
  const hasMicroGreen =
    candidate?.longMicroMomentumLabel === 'MICRO_GREEN_MULTI_CONFIRM' ||
    candidate?.longMicroMomentumLabel === 'GREEN_MULTI_CONFIRM' ||
    candidate?.immediateGreenImpulse === true ||
    candidate?.greenImpulseDetected === true;

  const matched =
    isAtrActive(candidate) &&
    tickVerdictUp(candidate) &&
    hasMicroGreen &&
    candidate?.entryCvdLabel !== 'BEAR' &&
    tickQualityOk(candidate);

  return {
    hypothesisId: 'LONG_HIGH_ATR_GREEN_MICRO_TRUE_TICK_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    ...BASE_SAFETY,
  };
}

// ── Risk hypotheses ───────────────────────────────────────────────────────────

export function evaluateHighAtrTrueTickDownAntiV1(candidate) {
  const matched =
    isAtrActive(candidate) &&
    tickVerdictDown(candidate) &&
    (tickQualityOk(candidate) || tickQualityOk(candidate, 'PARTIAL_TRADE_ONLY'));

  return {
    hypothesisId: 'LONG_HIGH_ATR_TRUE_TICK_DOWN_ANTI_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    riskHypothesis: true,
    ...BASE_SAFETY,
  };
}

export function evaluateHighAtrTradeBookDisagreementAntiV1(candidate) {
  const matched =
    isAtrActive(candidate) &&
    candidate?.tradeBookAgreement3s === 'DISAGREE' &&
    (Number(candidate?.spreadPct ?? 0) > 0.3 || Number(candidate?.spreadChangeBps3s ?? 0) > 3);

  return {
    hypothesisId: 'LONG_HIGH_ATR_TRADE_BOOK_DISAGREEMENT_ANTI_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    riskHypothesis: true,
    ...BASE_SAFETY,
  };
}

export function evaluateHighAtrSpreadExpansionAntiV1(candidate, config = {}) {
  const threshold = config.highAtrSpreadExpansionThresholdBps ?? 5;
  const matched =
    isAtrActive(candidate) &&
    Number(candidate?.spreadChangeBps3s ?? 0) > threshold;

  return {
    hypothesisId: 'LONG_HIGH_ATR_SPREAD_EXPANSION_ANTI_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    riskHypothesis: true,
    ...BASE_SAFETY,
  };
}

export function evaluateHighAtrChaosAntiV1(candidate) {
  const matched =
    isAtrActive(candidate) &&
    candidate?.marketTickHighAtrContextLabel === 'HIGH_ATR_TICK_CHAOS';

  return {
    hypothesisId: 'LONG_HIGH_ATR_CHAOS_ANTI_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    riskHypothesis: true,
    ...BASE_SAFETY,
  };
}

export function evaluateHighAtrStaleEvidenceAntiV1(candidate) {
  const q = candidate?.tickSnapshotDataQuality ?? candidate?.tickSourceQuality;
  const isStale = q === 'STALE' || q === 'WARMING' || q === 'INSUFFICIENT';
  const matched = isAtrActive(candidate) && isStale;

  return {
    hypothesisId: 'LONG_HIGH_ATR_STALE_EVIDENCE_ANTI_V1',
    status: HIGH_ATR_HYPOTHESIS_STATUS.SHADOW_ONLY,
    matched,
    riskHypothesis: true,
    dataQualityRisk: true, // Not market direction — data quality risk
    ...BASE_SAFETY,
  };
}

/**
 * Evaluate all High-ATR hypotheses for a candidate and return a compact summary.
 */
export function evaluateAllHighAtrHypotheses(candidate, config = {}) {
  const positive = [
    evaluateHighAtrTrueTickUpCvdOkV1(candidate),
    evaluateHighAtrTrueTickUpGateStrongV1(candidate),
    evaluateHighAtrTrueTickUpDnaV2_80_V1(candidate),
    evaluateHighAtrGreenMicroTrueTickV1(candidate),
  ];
  const risk = [
    evaluateHighAtrTrueTickDownAntiV1(candidate),
    evaluateHighAtrTradeBookDisagreementAntiV1(candidate),
    evaluateHighAtrSpreadExpansionAntiV1(candidate, config),
    evaluateHighAtrChaosAntiV1(candidate),
    evaluateHighAtrStaleEvidenceAntiV1(candidate),
  ];

  const matchedPositive = positive.filter(h => h.matched).map(h => h.hypothesisId);
  const matchedRisk     = risk.filter(h => h.matched).map(h => h.hypothesisId);

  return {
    highAtrPositiveHypothesesMatched: matchedPositive,
    highAtrRiskHypothesesMatched:     matchedRisk,
    highAtrHypothesisEvaluations:     [...positive, ...risk],
    logOnly:           true,
    canAffectExecution: false,
    executionApplied:  false,
  };
}
