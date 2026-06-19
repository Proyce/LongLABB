import { TICK_DIRECTION_CONFIG } from "./tickDirection.config.js";
import { TICK_DATA_QUALITY, TICK_DIRECTION, TICK_VERDICT } from "./tickDirection.types.js";
import { getAtrTier } from "./tickDirectionLabels.js";
import { normalizeSigned } from "./tickDirectionFeatures.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Number.isFinite(value) ? Number(value.toFixed(2)) : null;
const signForDirection = direction => direction === TICK_DIRECTION.UP ? 1 : direction === TICK_DIRECTION.DOWN ? -1 : 0;

export function scoreTickDirection(features, {
  dataQuality,
  atrPct,
  config = TICK_DIRECTION_CONFIG,
} = {}) {
  if ([TICK_DATA_QUALITY.INSUFFICIENT, TICK_DATA_QUALITY.STALE].includes(dataQuality)) {
    return {
      marketTickDirectionalBiasScore: 0,
      marketTickDirectionConfidenceScore: 0,
      marketTickDirectionVerdict: TICK_VERDICT.INSUFFICIENT,
      highAtrDirectionalOpportunityScore: 0,
      highAtrDirectionalOpportunityTier: "INSUFFICIENT",
      highAtrDirectionalOpportunityReasons: ["ENTRY_TICK_DATA_UNAVAILABLE"],
    };
  }

  const w3 = features?.window3s ?? {};
  const w10 = features?.window10s ?? {};
  const primaryDirection = w3.direction === TICK_DIRECTION.INSUFFICIENT ? w10.direction : w3.direction;
  const directionSign = signForDirection(primaryDirection) || Math.sign(Number(w3.netMoveBps ?? w10.netMoveBps ?? 0));
  let bias = 0;
  bias += normalizeSigned(Number(w3.netMoveBps ?? 0), 8) * 18;
  bias += normalizeSigned(Number(w10.netMoveBps ?? 0), 15) * 7;
  bias += directionSign * clamp(Number(w3.efficiency ?? 0), 0, 1) * 15;
  bias += clamp((Number(features?.currentUpStreak ?? 0) - Number(features?.currentDownStreak ?? 0)) / 5, -1, 1) * 10;
  bias += normalizeSigned(Number(w3.velocity ?? 0), 12) * 12;
  bias += normalizeSigned(Number(w3.acceleration ?? 0), 12) * 10;
  bias += clamp(Number(features?.aggressorVolumeImbalance3s ?? 0), -1, 1) * 12;
  bias += clamp(Number(features?.bookImbalanceMean3s ?? 0), -1, 1) * 6;
  if (features?.tradeBookAgreement3s === "AGREE_UP") bias += 5;
  if (features?.tradeBookAgreement3s === "AGREE_DOWN") bias -= 5;
  const spreadChange = Number(features?.spreadChangeBps3s ?? 0);
  bias += directionSign * (spreadChange <= 0 ? 5 : spreadChange < 3 ? 2 : -5);
  bias = round(clamp(bias, -100, 100));

  const eventCoverage = clamp(Number(w3.eventCount ?? 0) / 12, 0, 1);
  const distinctCoverage = clamp(Number(w3.distinctPriceCount ?? 0) / 6, 0, 1);
  const freshness = clamp(1 - Number(w3.freshnessMs ?? config.staleAfterMs) / config.staleAfterMs, 0, 1);
  const efficiency = clamp(Number(w3.efficiency ?? 0), 0, 1);
  const agreement = features?.tradeBookAgreement3s?.startsWith("AGREE") ? 1
    : features?.tradeBookAgreement3s === "ONE_SOURCE_ONLY" ? 0.45
      : features?.tradeBookAgreement3s === "DISAGREE" ? 0.15 : 0.25;
  const timeAgreement = w3.direction === w10.direction ? 1
    : [w3.direction, w10.direction].includes(TICK_DIRECTION.INSUFFICIENT) ? 0.4 : 0.2;
  const noise = clamp(1 - Number(features?.reversalCount10 ?? 0) / 7, 0, 1);
  const spreadStability = clamp(1 - Math.max(0, spreadChange) / 10, 0, 1);
  const qualityMultiplier = dataQuality === TICK_DATA_QUALITY.COMPLETE ? 1 : 0.82;
  const confidence = round(clamp((
    eventCoverage * 20 +
    distinctCoverage * 12 +
    freshness * 16 +
    efficiency * 17 +
    agreement * 12 +
    timeAgreement * 10 +
    noise * 8 +
    spreadStability * 5
  ) * qualityMultiplier, 0, 100));

  let verdict = TICK_VERDICT.NEUTRAL;
  if (bias >= 65 && confidence >= 70) verdict = TICK_VERDICT.STRONG_UP;
  else if (bias >= 25 && confidence >= 50) verdict = TICK_VERDICT.UP;
  else if (bias <= -65 && confidence >= 70) verdict = TICK_VERDICT.STRONG_DOWN;
  else if (bias <= -25 && confidence >= 50) verdict = TICK_VERDICT.DOWN;

  const atrTier = getAtrTier(atrPct, config);
  const multiplier = {
    ATR_INACTIVE: 0.5,
    ATR_ACTIVE: 0.85,
    ATR_HIGH: 1,
    ATR_EXTREME: 1.1,
  }[atrTier];
  const opportunity = round(clamp(confidence * multiplier, 0, 100));
  return {
    marketTickDirectionalBiasScore: bias,
    marketTickDirectionConfidenceScore: confidence,
    marketTickDirectionVerdict: verdict,
    highAtrDirectionalOpportunityScore: opportunity,
    highAtrDirectionalOpportunityTier: opportunity >= 80 ? "HIGH"
      : opportunity >= 60 ? "MEDIUM"
        : opportunity >= 35 ? "LOW"
          : "MINIMAL",
    highAtrDirectionalOpportunityReasons: [
      atrTier,
      `CONFIDENCE_${Math.round(confidence)}`,
      `ABS_BIAS_${Math.round(Math.abs(bias))}`,
    ],
  };
}
