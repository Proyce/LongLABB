// ─── AES V3 LABELS ───────────────────────────────────────────────────────────
// Pure classification functions. No side effects.

import { TIER_BOUNDS, CONFIDENCE_CONFIG } from "./absoluteEntryScore.config.js";

export function classifyAesTier(score) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const { max, tier } of TIER_BOUNDS) {
    if (s <= max) return tier;
  }
  return "AES_ELITE_RESEARCH";
}

export function classifyAesEligibility(riskPenaltyScore, researchBlockReasons = [], cautionReasons = [], missingFields = []) {
  if (researchBlockReasons.length > 0 || riskPenaltyScore >= 50) return "RESEARCH_BLOCK";
  if (riskPenaltyScore >= 20 || cautionReasons.length > 0 || missingFields.length > 3) return "CAUTION";
  return "PASS";
}

export function classifyAesConfidenceLabel(confidence) {
  if (confidence >= 85) return "VERY_HIGH_CONFIDENCE";
  if (confidence >= 70) return "HIGH_CONFIDENCE";
  if (confidence >= 40) return "MEDIUM_CONFIDENCE";
  return "LOW_CONFIDENCE";
}

export function computeAesConfidenceScore({
  featureCoveragePct = 0,
  missingFields = [],
  previewMode = false,
  regimeSpecificUsed = false,
  experimentalComboUsed = false,
  stale = false,
}) {
  if (stale) return 0;

  // Core: 0-70 from feature coverage
  const coreScore = Math.round(featureCoveragePct * 0.70);

  // Side-specific: 0-20 (simplified: coverage gets most of the credit already)
  const sideScore = Math.round(featureCoveragePct * 0.20);

  // Context: 0-10
  const ctxScore = Math.round(featureCoveragePct * 0.10);

  let confidence = coreScore + sideScore + ctxScore;

  // Penalties for missing critical fields
  const hasMissingAtrOrBounce = missingFields.includes("atrPct") || missingFields.includes("microBouncePct");
  const hasMissingRedGreen = missingFields.includes("immediateRedImpulse") && missingFields.includes("greenImpulseDetected");

  if (hasMissingAtrOrBounce)   confidence = Math.min(confidence, CONFIDENCE_CONFIG.missingAtrOrBounceMax);
  if (hasMissingRedGreen)      confidence = Math.min(confidence, CONFIDENCE_CONFIG.missingRedGreenStateMax);

  if (regimeSpecificUsed)      confidence += CONFIDENCE_CONFIG.regimeSpecificPenalty;
  if (experimentalComboUsed)   confidence += CONFIDENCE_CONFIG.experimentalFailedBreakoutPenalty;

  confidence = Math.max(0, Math.min(100, confidence));

  if (previewMode) confidence = Math.min(confidence, CONFIDENCE_CONFIG.previewMax);

  return Math.round(confidence);
}
