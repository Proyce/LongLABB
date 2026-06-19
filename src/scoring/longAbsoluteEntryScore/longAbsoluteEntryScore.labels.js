// ─── LONG AES V1 LABELS ───────────────────────────────────────────────────────
// Tier names per spec §15.8.

import { LONG_TIER_BOUNDS, LONG_CONFIDENCE_CONFIG } from "./longAbsoluteEntryScore.config.js";

export function classifyLongAesTier(score) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const { max, tier } of LONG_TIER_BOUNDS) {
    if (s <= max) return tier;
  }
  return "LONG_AES_ELITE_RESEARCH";
}

export function classifyLongAesEligibility(riskPenaltyScore, researchBlockReasons = [], cautionReasons = [], missingFields = []) {
  if (researchBlockReasons.length > 0 || riskPenaltyScore >= 50) return "RESEARCH_BLOCK";
  if (riskPenaltyScore >= 20 || cautionReasons.length > 0 || missingFields.length > 3) return "CAUTION";
  return "PASS";
}

export function classifyLongAesConfidenceLabel(confidence) {
  if (confidence >= 90) return "VERY_HIGH_CONFIDENCE";
  if (confidence >= 80) return "HIGH_CONFIDENCE";
  if (confidence >= 65) return "MEDIUM_CONFIDENCE";
  if (confidence >= 40) return "LOW_CONFIDENCE";
  return "INSUFFICIENT_DATA";
}

export function computeLongAesConfidenceScore({
  aesScore = null,
  positiveSignalCount = 0,
  negativeSignalCount = 0,
  riskPenaltyScore = 0,
  featureCoveragePct = 0,
  missingFields = [],
  previewMode = false,
  regimeSpecificUsed = false,
  experimentalComboUsed = false,
  stale = false,
}) {
  if (stale) return 0;

  // Coverage is a PRECONDITION, not a contributor. Without enough data we
  // cannot express signal confidence at all.
  if (!Number.isFinite(featureCoveragePct) || featureCoveragePct < 80) return 0;

  // Margin above the neutral baseline (AES is centered at 50). This is the core
  // of confidence: how far the score sits above "no opinion".
  const score = Number.isFinite(aesScore) ? aesScore : 50;
  const marginPts = Math.max(-40, Math.min(40, (score - 50) * 0.8));

  // Net signal agreement, and risk-penalty drag.
  const agreement = (Number(positiveSignalCount) - Number(negativeSignalCount)) * 3;
  const penalty = Math.min(40, Math.max(0, Number(riskPenaltyScore) || 0));

  let confidence = 50 + marginPts + agreement - penalty;

  const hasMissingAtrOrPullback = missingFields.includes("atrPct") || missingFields.includes("microPullbackPct");
  const hasMissingGreenRed = missingFields.includes("immediateGreenImpulse") && missingFields.includes("redImpulseDetected");

  if (hasMissingAtrOrPullback) confidence = Math.min(confidence, LONG_CONFIDENCE_CONFIG.missingAtrOrPullbackMax);
  if (hasMissingGreenRed)      confidence = Math.min(confidence, LONG_CONFIDENCE_CONFIG.missingGreenRedStateMax);
  if (regimeSpecificUsed)      confidence += LONG_CONFIDENCE_CONFIG.regimeSpecificPenalty;
  if (experimentalComboUsed)   confidence += LONG_CONFIDENCE_CONFIG.experimentalFailedBreakdownPenalty;

  confidence = Math.max(0, Math.min(100, confidence));
  if (previewMode) confidence = Math.min(confidence, LONG_CONFIDENCE_CONFIG.previewMax);

  return Math.round(confidence);
}
