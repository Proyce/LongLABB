import { TICK_DIRECTION_CONFIG } from "./tickDirection.config.js";
import { TICK_DATA_QUALITY, TICK_DIRECTION, TICK_VERDICT } from "./tickDirection.types.js";
import { getAtrTier } from "./tickDirectionLabels.js";
import { normalizeSigned } from "./tickDirectionFeatures.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Number.isFinite(value) ? Number(value.toFixed(2)) : null;
const signForDirection = direction =>
  direction === TICK_DIRECTION.UP ? 1
  : direction === TICK_DIRECTION.DOWN ? -1
  : 0;

// Calibration annotations (spec §8.3)
const SCORE_CALIBRATION = Object.freeze({
  marketTickScoreCalibrationStatus:        'UNCALIBRATED_RULE_MODEL',
  marketTickConfidenceInterpretation:      'EVIDENCE_QUALITY_NOT_PROBABILITY',
  highAtrOpportunityCalibrationStatus:     'SHADOW_RESEARCH',
  highAtrRiskCalibrationStatus:            'SHADOW_RESEARCH',
});

export function scoreTickDirection(features, {
  dataQuality,
  atrPct,
  config = TICK_DIRECTION_CONFIG,
} = {}) {
  if ([TICK_DATA_QUALITY.INSUFFICIENT, TICK_DATA_QUALITY.STALE].includes(dataQuality)) {
    return {
      marketTickDirectionalBiasScore:       0,
      marketTickDirectionConfidenceScore:   0,
      marketTickDirectionVerdict:           TICK_VERDICT.INSUFFICIENT,
      // New directional-aware scores (spec §8.1)
      marketTickSignalStrengthScore:        0,
      highAtrLongOpportunityScore:          0,
      highAtrLongRiskScore:                 0,
      highAtrLongOpportunityTier:           'INSUFFICIENT',
      highAtrLongRiskTier:                  'INSUFFICIENT',
      // Deprecated alias retained for one schema version
      highAtrDirectionalOpportunityScoreDeprecated: 0,
      highAtrDirectionalOpportunityTier:    'INSUFFICIENT',
      highAtrDirectionalOpportunityReasons: ['ENTRY_TICK_DATA_UNAVAILABLE'],
      ...SCORE_CALIBRATION,
    };
  }

  // ── Directional bias score ────────────────────────────────────────────────
  const w3  = features?.window3s  ?? {};
  const w10 = features?.window10s ?? {};
  const primaryDirection = w3.direction === TICK_DIRECTION.INSUFFICIENT ? w10.direction : w3.direction;
  const directionSign    = signForDirection(primaryDirection)
    || Math.sign(Number(w3.netMoveBps ?? w10.netMoveBps ?? 0));

  let bias = 0;
  bias += normalizeSigned(Number(w3.netMoveBps  ?? 0), 8)  * 18;
  bias += normalizeSigned(Number(w10.netMoveBps ?? 0), 15) *  7;
  bias += directionSign * clamp(Number(w3.efficiency  ?? 0), 0, 1) * 15;
  bias += clamp(
    (Number(features?.currentUpStreak ?? 0) - Number(features?.currentDownStreak ?? 0)) / 5,
    -1, 1,
  ) * 10;
  bias += normalizeSigned(Number(w3.velocity     ?? 0), 12) * 12;
  bias += normalizeSigned(Number(w3.acceleration ?? 0), 12) * 10;
  bias += clamp(Number(features?.aggressorVolumeImbalance3s ?? 0), -1, 1) * 12;
  bias += clamp(Number(features?.bookImbalanceMean3s        ?? 0), -1, 1) *  6;
  if (features?.tradeBookAgreement3s === "AGREE_UP")   bias += 5;
  if (features?.tradeBookAgreement3s === "AGREE_DOWN") bias -= 5;
  const spreadChange = Number(features?.spreadChangeBps3s ?? 0);
  bias += directionSign * (spreadChange <= 0 ? 5 : spreadChange < 3 ? 2 : -5);
  bias = round(clamp(bias, -100, 100));

  // ── Signal strength (confidence / evidence quality) ───────────────────────
  const eventCoverage    = clamp(Number(w3.eventCount       ?? 0) / 12,                     0, 1);
  const distinctCoverage = clamp(Number(w3.distinctPriceCount ?? 0) / 6,                    0, 1);
  const freshness        = clamp(1 - Number(w3.freshnessMs  ?? config.staleAfterMs) / config.staleAfterMs, 0, 1);
  const efficiency       = clamp(Number(w3.efficiency       ?? 0),                           0, 1);
  const agreement        = features?.tradeBookAgreement3s?.startsWith("AGREE") ? 1
    : features?.tradeBookAgreement3s === "ONE_SOURCE_ONLY" ? 0.45
    : features?.tradeBookAgreement3s === "DISAGREE"        ? 0.15
    : 0.25;
  const timeAgreement    = w3.direction === w10.direction ? 1
    : [w3.direction, w10.direction].includes(TICK_DIRECTION.INSUFFICIENT) ? 0.4 : 0.2;
  const noise            = clamp(1 - Number(features?.reversalCount10 ?? 0) / 7, 0, 1);
  const spreadStability  = clamp(1 - Math.max(0, spreadChange) / 10,              0, 1);
  const qualityMultiplier = dataQuality === TICK_DATA_QUALITY.COMPLETE ? 1 : 0.82;

  const strength = round(clamp((
    eventCoverage    * 20 +
    distinctCoverage * 12 +
    freshness        * 16 +
    efficiency       * 17 +
    agreement        * 12 +
    timeAgreement    * 10 +
    noise            *  8 +
    spreadStability  *  5
  ) * qualityMultiplier, 0, 100));

  // Keep legacy confidence alias pointing to strength
  const confidence = strength;

  // ── Verdict ───────────────────────────────────────────────────────────────
  let verdict = TICK_VERDICT.NEUTRAL;
  if      (bias >= 65 && strength >= 70) verdict = TICK_VERDICT.STRONG_UP;
  else if (bias >= 25 && strength >= 50) verdict = TICK_VERDICT.UP;
  else if (bias <= -65 && strength >= 70) verdict = TICK_VERDICT.STRONG_DOWN;
  else if (bias <= -25 && strength >= 50) verdict = TICK_VERDICT.DOWN;

  // ── ATR tier and multipliers ──────────────────────────────────────────────
  const atrTier = getAtrTier(atrPct, config);
  const atrOpportunityMultiplier = { ATR_INACTIVE: 0.5, ATR_ACTIVE: 0.85, ATR_HIGH: 1, ATR_EXTREME: 1.1 }[atrTier] ?? 0.5;
  const atrRiskMultiplier        = { ATR_INACTIVE: 0.4, ATR_ACTIVE: 0.80, ATR_HIGH: 1, ATR_EXTREME: 1.15 }[atrTier] ?? 0.4;

  // ── Spread / agreement penalties ─────────────────────────────────────────
  const severeSpreadExpansion = spreadChange > 5;
  const spreadExpansionPenalty = severeSpreadExpansion ? 15 : spreadChange > 2 ? 5 : 0;
  const disagreementPenalty    = features?.tradeBookAgreement3s === "DISAGREE" ? 10 : 0;
  const chaosPenalty           = noise < 0.3 ? 15 : 0;

  // ── Spread-safety multiplier ──────────────────────────────────────────────
  const spreadSafetyMultiplier = severeSpreadExpansion ? 0.2
    : spreadChange > 2 ? 0.7
    : 1;

  // ── High-ATR Long opportunity (directional — positive bias only) ──────────
  const positiveBias = Math.max(0, bias ?? 0);
  const longOpportunity = round(clamp(
    positiveBias *
    (strength / 100) *
    atrOpportunityMultiplier *
    spreadSafetyMultiplier *
    (features?.tradeBookAgreement3s?.startsWith("AGREE") ? 1 : 0.7),
    0, 100,
  ));
  const longOpportunityTier =
    longOpportunity >= 70 ? "HIGH"
    : longOpportunity >= 45 ? "MEDIUM"
    : longOpportunity >= 20 ? "LOW"
    : "MINIMAL";

  // ── High-ATR Long risk (directional — negative bias only) ────────────────
  const negativeBias = Math.max(0, -(bias ?? 0));
  const longRisk = round(clamp(
    negativeBias *
    (strength / 100) *
    atrRiskMultiplier +
    chaosPenalty +
    spreadExpansionPenalty +
    disagreementPenalty,
    0, 100,
  ));
  const longRiskTier =
    longRisk >= 70 ? "HIGH"
    : longRisk >= 45 ? "MEDIUM"
    : longRisk >= 20 ? "LOW"
    : "MINIMAL";

  // ── Deprecated alias (retained one schema version) ────────────────────────
  const deprecatedOpportunity = round(clamp(strength * atrOpportunityMultiplier, 0, 100));

  return {
    marketTickDirectionalBiasScore:     bias,
    marketTickDirectionConfidenceScore: confidence,
    marketTickDirectionVerdict:         verdict,

    // New directional-aware scores (spec §8.1)
    marketTickSignalStrengthScore:      strength,
    highAtrLongOpportunityScore:        longOpportunity,
    highAtrLongRiskScore:               longRisk,
    highAtrLongOpportunityTier:         longOpportunityTier,
    highAtrLongRiskTier:                longRiskTier,

    // Deprecated — kept for one schema version, do not populate in new V10 exports
    highAtrDirectionalOpportunityScoreDeprecated: deprecatedOpportunity,
    highAtrDirectionalOpportunityScore: deprecatedOpportunity,
    highAtrDirectionalOpportunityTier:  deprecatedOpportunity >= 80 ? "HIGH"
      : deprecatedOpportunity >= 60 ? "MEDIUM"
      : deprecatedOpportunity >= 35 ? "LOW"
      : "MINIMAL",
    highAtrDirectionalOpportunityReasons: [
      atrTier,
      `CONFIDENCE_${Math.round(strength)}`,
      `ABS_BIAS_${Math.round(Math.abs(bias))}`,
    ],

    ...SCORE_CALIBRATION,
  };
}
