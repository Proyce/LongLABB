// ─── LONG AES V2 SHADOW ──────────────────────────────────────────────────────
// Reweights V1 component scores toward Flow Momentum for research comparison.
// V1 remains canonical and unchanged. This module is LOG ONLY.

export const LONG_AES_V2_SHADOW_VERSION = "LONG_AES_V2_FLOW_WEIGHTED_SHADOW_2026_06";

export const LONG_AES_V2_SHADOW_WEIGHTS = Object.freeze({
  direction: 0.85,
  movementMaturity: 0.55,
  volatility: 0.15,
  location: 0.45,
  flowMomentum: 1.75,
  execution: 0.50,
  marketContext: 0.10,
  sideSpecific: 0.75,
  interaction: 0.70,
  riskPenalty: 1.25,
});

const clamp = value => Math.max(0, Math.min(100, Math.round(value)));

function classify(score) {
  if (score >= 90) return "LONG_AES_V2_ELITE_RESEARCH";
  if (score >= 80) return "LONG_AES_V2_SNIPER_RESEARCH";
  if (score >= 70) return "LONG_AES_V2_HIGH";
  if (score >= 55) return "LONG_AES_V2_CANDIDATE";
  if (score >= 40) return "LONG_AES_V2_WATCH";
  return "LONG_AES_V2_RESEARCH_BLOCKED";
}

export function computeLongAesV2Shadow(v1 = {}, weights = LONG_AES_V2_SHADOW_WEIGHTS) {
  const components = [
    ["DIRECTION", v1.longAesDirectionScore, weights.direction],
    ["MOVEMENT_MATURITY", v1.longAesMovementMaturityScore, weights.movementMaturity],
    ["VOLATILITY", v1.longAesVolatilityScore, weights.volatility],
    ["LOCATION", v1.longAesLocationScore, weights.location],
    ["FLOW_MOMENTUM", v1.longAesFlowMomentumScore, weights.flowMomentum],
    ["EXECUTION", v1.longAesExecutionScore, weights.execution],
    ["MARKET_CONTEXT", v1.longAesMarketContextScore, weights.marketContext],
    ["SIDE_SPECIFIC", v1.longAesSideSpecificScore, weights.sideSpecific],
    ["INTERACTION", v1.longAesInteractionScore, weights.interaction],
    ["RISK_PENALTY", -(Number(v1.longAesRiskPenaltyScore) || 0), weights.riskPenalty],
  ];

  const contributions = components.map(([family, raw, weight]) => {
    const rawValue = Number(raw) || 0;
    return { family, rawValue, weight, weightedValue: Number((rawValue * weight).toFixed(4)) };
  });
  const rawUtility = contributions.reduce((sum, item) => sum + item.weightedValue, 0);
  const score = clamp(50 + rawUtility);
  const v1Score = Number.isFinite(Number(v1.longAesScore)) ? Number(v1.longAesScore) : null;

  return Object.freeze({
    longAesScoreV2Shadow: score,
    longAesTierV2Shadow: classify(score),
    longAesV2ComponentWeights: weights,
    longAesV2PositiveContributions: contributions.filter(item => item.weightedValue > 0),
    longAesV2NegativeContributions: contributions.filter(item => item.weightedValue < 0),
    longAesV2RawUtility: Number(rawUtility.toFixed(4)),
    longAesV2DeltaVsV1: v1Score == null ? null : Number((score - v1Score).toFixed(4)),
    longAesV2Version: LONG_AES_V2_SHADOW_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}
