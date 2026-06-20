// ─── LONG ENTRY DANGER AUDIT (LOG ONLY) ──────────────────────────────────────
// Detects active sell/red pressure that is dangerous for a LONG entry.
// Log-only: none of these fields affect candidate creation or execution.

import { canonicalLongMicroLabel, CANONICAL_LONG_MICRO } from '../scoring/longMicroMomentumNormalizer.js';

export const LONG_DANGER_REASON = Object.freeze({
  NO_LONG_MICRO_MOMENTUM:            'NO_LONG_MICRO_MOMENTUM',
  MICRO_RED_PRESSURE:                'MICRO_RED_PRESSURE',
  IMMEDIATE_RED_IMPULSE:             'IMMEDIATE_RED_IMPULSE',
  LAST_3_TICKS_DOWN:                 'LAST_3_TICKS_DOWN',
  CVD_BEAR_WITHOUT_GREEN_CONFIRMATION: 'CVD_BEAR_WITHOUT_GREEN_CONFIRMATION',
  VWAP_RECLAIM_FAILED:               'VWAP_RECLAIM_FAILED',
  VWAP_LOSS_AFTER_RECLAIM:           'VWAP_LOSS_AFTER_RECLAIM',
  TOP_GAINER_OVEREXTENDED_NO_PULLBACK: 'TOP_GAINER_OVEREXTENDED_NO_PULLBACK',
  TOP_GAINER_DISTRIBUTION_DANGER:    'TOP_GAINER_DISTRIBUTION_DANGER',
  TOP_LOSER_FALLING_KNIFE:           'TOP_LOSER_FALLING_KNIFE',
  TOP_LOSER_RED_REACCELERATION_DANGER: 'TOP_LOSER_RED_REACCELERATION_DANGER',
  RSI_RECOVERY_FAILED:               'RSI_RECOVERY_FAILED',
  MACD_BEARISH_EXPANSION:            'MACD_BEARISH_EXPANSION',
  THIN_BOOK:                         'THIN_BOOK',
  SPREAD_TOO_WIDE:                   'SPREAD_TOO_WIDE',
  ATR_EXTREME_UNCONTROLLED:          'ATR_EXTREME_UNCONTROLLED',
  MARKET_CONTEXT_HOSTILE:            'MARKET_CONTEXT_HOSTILE',
  ENTRY_DATA_INCOMPLETE:             'ENTRY_DATA_INCOMPLETE',
  ENTRY_DATA_CONFLICTED:             'ENTRY_DATA_CONFLICTED',
  REQUIRED_TELEMETRY_MISSING:        'REQUIRED_TELEMETRY_MISSING',
});

export const LONG_AUDIT_DANGER_TIER = Object.freeze({
  CLEAR:       'CLEAR',
  CAUTION:     'CAUTION',
  DANGER:      'DANGER',
  HARD_DANGER: 'HARD_DANGER',
  UNKNOWN:     'UNKNOWN',
});

export function computeLongEntryDangerAuditLogOnly(candidate) {
  const reasons = [];
  let score = 0;

  // ── Data completeness gate ────────────────────────────────────────────────
  const hasCriticalTelemetry =
    candidate.immediateRedImpulse !== undefined ||
    candidate.redImpulseDetected !== undefined ||
    candidate.immediateGreenImpulse !== undefined ||
    candidate.greenImpulseDetected !== undefined;

  if (!hasCriticalTelemetry) {
    return {
      longAuditDangerScore:    0,
      longAuditDangerTier:     LONG_AUDIT_DANGER_TIER.UNKNOWN,
      longAuditDangerLabel:    'LONG_AUDIT_UNKNOWN',
      longAuditDangerReasons:  [LONG_DANGER_REASON.REQUIRED_TELEMETRY_MISSING],
      longAuditWouldBlock:     false,
      longAuditWouldHardBlock: false,
      logOnly:               true,
      canAffectExecution:    false,
    };
  }

  // ── Momentum signals ──────────────────────────────────────────────────────
  const immediateRedImpulse =
    candidate.immediateRedImpulse === true ||
    candidate.redImpulseDetected === true;

  const hasGreenConfirmation =
    candidate.immediateGreenImpulse === true ||
    candidate.greenImpulseDetected === true ||
    candidate.hasGreenConfirmation === true;

  const noMicroMomentum =
    candidate.hasLongMicroMomentum === false &&
    !hasGreenConfirmation;

  const last3Down =
    candidate.last3TicksDirection === 'DOWN';

  const microCanonical = canonicalLongMicroLabel(
    candidate.longMicroMomentumLabel ?? candidate.microMomentumLabel ?? null,
  );
  const microRedPressure = microCanonical === CANONICAL_LONG_MICRO.RED_PRESSURE;

  // ── CVD signals ───────────────────────────────────────────────────────────
  const cvdBear =
    candidate.entryCvdLabel === 'BEAR' ||
    candidate.cvdLabel === 'BEAR' ||
    candidate.cvdLabel === 'BEARISH';

  const cvdBearWithoutGreen = cvdBear && !hasGreenConfirmation;

  // ── VWAP signals ──────────────────────────────────────────────────────────
  const vwapReclaimFailed =
    candidate.longVwapContextLabel?.includes('RECLAIM_FAIL') ||
    candidate.vwapLongContextLabel?.includes('RECLAIM_FAIL') ||
    candidate.vwapStateAtEntry === 'VWAP_RECLAIM_FAILED';

  const vwapLossAfterReclaim =
    candidate.longVwapContextLabel === 'VWAP_RECLAIM_FAILED' ||
    candidate.vwapLongContextLabel === 'VWAP_RECLAIM_FAILED';

  // ── RSI / MACD signals ────────────────────────────────────────────────────
  const rsiRecoveryFailed =
    candidate.hasRsiRolloverUp === false &&
    (candidate.rsi1mDelta ?? 0) < 0 &&
    (candidate.rsi1m ?? 50) < 45;

  const macdBearishExpansion =
    candidate.macdHistogramState1m?.includes('NEGATIVE_EXPANDING') ||
    candidate.macdHistogramState3m?.includes('NEGATIVE_EXPANDING') ||
    candidate.macd?.histogramDelta < -0.0001;

  // ── Bucket-specific danger ────────────────────────────────────────────────
  const isGainer = candidate.longParentBucket === 'TOP_GAINER_LONGS';
  const isLoser  = candidate.longParentBucket === 'TOP_LOSER_LONGS';

  const gainerOverextended = isGainer &&
    (candidate.topGainerOverextensionDanger === true ||
     (candidate.change24h ?? 0) > 60 && !candidate.topGainerPullbackQualityScore);

  const gainerDistribution = isGainer &&
    (candidate.topGainerDistributionRisk === true ||
     candidate.topGainerPumpPhaseLabel === 'GAINER_PUMP_EXHAUSTION_CONFIRMED');

  const loserFallingKnife = isLoser &&
    immediateRedImpulse &&
    last3Down &&
    cvdBear;

  const loserRedReaccel = isLoser &&
    (candidate.topLoserRedReaccelerationDanger === true);

  // ── Liquidity / volatility danger ─────────────────────────────────────────
  const thinBook =
    candidate.thinBookDanger === true ||
    (candidate.spreadPct ?? 0) > 0.5;

  const spreadTooWide =
    (candidate.spreadPct ?? 0) > 0.8;

  const atrExtreme =
    (candidate.atrPct ?? 0) > 6 && !candidate.hasGreenConfirmation;

  // ── Market context ────────────────────────────────────────────────────────
  const marketContextHostile =
    candidate.longMarketContextLabel === 'LONG_MARKET_CONTEXT_HOSTILE' ||
    candidate.btcLongContextLabel === 'BTC_STRONG_DOWN_HEADWIND';

  // ── Score accumulation ────────────────────────────────────────────────────
  if (immediateRedImpulse) {
    score += 35;
    reasons.push(LONG_DANGER_REASON.IMMEDIATE_RED_IMPULSE);
  }
  if (cvdBearWithoutGreen) {
    score += 25;
    reasons.push(LONG_DANGER_REASON.CVD_BEAR_WITHOUT_GREEN_CONFIRMATION);
  }
  if (last3Down) {
    score += 20;
    reasons.push(LONG_DANGER_REASON.LAST_3_TICKS_DOWN);
  }
  if (microRedPressure && !immediateRedImpulse) {
    score += 18;
    reasons.push(LONG_DANGER_REASON.MICRO_RED_PRESSURE);
    // RED_PRESSURE plus independent confirmation escalates tier (spec §4.3).
    const independentRedConfirmations = [
      cvdBear,
      last3Down,
      vwapReclaimFailed || vwapLossAfterReclaim,
      spreadTooWide,
    ].filter(Boolean).length;
    if (independentRedConfirmations >= 2) score += 15;
  }
  if (vwapReclaimFailed || vwapLossAfterReclaim) {
    score += 18;
    reasons.push(LONG_DANGER_REASON.VWAP_RECLAIM_FAILED);
  }
  if (noMicroMomentum) {
    score += 15;
    reasons.push(LONG_DANGER_REASON.NO_LONG_MICRO_MOMENTUM);
  }
  if (rsiRecoveryFailed) {
    score += 12;
    reasons.push(LONG_DANGER_REASON.RSI_RECOVERY_FAILED);
  }
  if (macdBearishExpansion) {
    score += 12;
    reasons.push(LONG_DANGER_REASON.MACD_BEARISH_EXPANSION);
  }
  if (gainerOverextended) {
    score += 20;
    reasons.push(LONG_DANGER_REASON.TOP_GAINER_OVEREXTENDED_NO_PULLBACK);
  }
  if (gainerDistribution) {
    score += 15;
    reasons.push(LONG_DANGER_REASON.TOP_GAINER_DISTRIBUTION_DANGER);
  }
  if (loserFallingKnife) {
    score += 25;
    reasons.push(LONG_DANGER_REASON.TOP_LOSER_FALLING_KNIFE);
  }
  if (loserRedReaccel) {
    score += 18;
    reasons.push(LONG_DANGER_REASON.TOP_LOSER_RED_REACCELERATION_DANGER);
  }
  if (thinBook) {
    score += 10;
    reasons.push(LONG_DANGER_REASON.THIN_BOOK);
  }
  if (spreadTooWide) {
    score += 8;
    reasons.push(LONG_DANGER_REASON.SPREAD_TOO_WIDE);
  }
  if (atrExtreme) {
    score += 10;
    reasons.push(LONG_DANGER_REASON.ATR_EXTREME_UNCONTROLLED);
  }
  if (marketContextHostile) {
    score += 12;
    reasons.push(LONG_DANGER_REASON.MARKET_CONTEXT_HOSTILE);
  }

  // ── Clear signals reduce score ────────────────────────────────────────────
  if (hasGreenConfirmation) score -= 15;
  if (candidate.hasRsiRolloverUp === true) score -= 10;
  if (candidate.entryCvdLabel === 'BULL' || candidate.cvdLabel === 'BULL') score -= 10;

  const clamped = Math.max(0, Math.min(100, score));

  const tier =
    clamped >= 75 ? LONG_AUDIT_DANGER_TIER.HARD_DANGER
    : clamped >= 50 ? LONG_AUDIT_DANGER_TIER.DANGER
    : clamped >= 25 ? LONG_AUDIT_DANGER_TIER.CAUTION
    : LONG_AUDIT_DANGER_TIER.CLEAR;

  const label = `LONG_AUDIT_${tier}`;

  return {
    longAuditDangerScore:    clamped,
    longAuditDangerTier:     tier,
    longAuditDangerLabel:    label,
    longAuditDangerReasons:  reasons,
    longAuditWouldBlock:     clamped >= 50,
    longAuditWouldHardBlock: clamped >= 75,
    logOnly:               true,
    canAffectExecution:    false,
  };
}
