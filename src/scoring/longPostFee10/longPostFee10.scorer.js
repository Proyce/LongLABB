import { LONG_PF10_FEATURE, LONG_PF10_TIER } from './longPostFee10.constants.js';
import { extractLongPostFee10Features } from './longPostFee10.features.js';

const POSITIVE_WEIGHTS = {
  [LONG_PF10_FEATURE.IMMEDIATE_GREEN_IMPULSE]:   20,
  [LONG_PF10_FEATURE.GREEN_REACCELERATION]:      15,
  [LONG_PF10_FEATURE.RSI_ROLLOVER_UP]:           15,
  [LONG_PF10_FEATURE.CVD_BULL]:                  12,
  [LONG_PF10_FEATURE.CVD_IMPROVING]:              8,
  [LONG_PF10_FEATURE.VWAP_RECLAIM]:              15,
  [LONG_PF10_FEATURE.VWAP_SUPPORT_HOLD]:         10,
  [LONG_PF10_FEATURE.STRONG_LIQUIDITY]:           8,
  [LONG_PF10_FEATURE.CONTROLLED_ATR]:             6,
  [LONG_PF10_FEATURE.SUPPORTIVE_MARKET_CONTEXT]: 10,
};

const PENALTY_WEIGHTS = {
  [LONG_PF10_FEATURE.IMMEDIATE_RED_IMPULSE]:     -30,
  [LONG_PF10_FEATURE.MICRO_RED_PRESSURE]:        -15,
  [LONG_PF10_FEATURE.LAST_3_TICKS_DOWN]:         -18,
  [LONG_PF10_FEATURE.CVD_BEAR_NO_GREEN]:         -20,
  [LONG_PF10_FEATURE.VWAP_RECLAIM_FAILED]:       -18,
  [LONG_PF10_FEATURE.OVEREXTENSION_NO_PULLBACK]: -15,
  [LONG_PF10_FEATURE.THIN_BOOK]:                 -10,
  [LONG_PF10_FEATURE.WIDE_SPREAD]:               - 8,
};

const MIN_COVERAGE_PCT = 75;

function classifyTier(score) {
  if (score >= 85) return LONG_PF10_TIER.ELITE;
  if (score >= 72) return LONG_PF10_TIER.SNIPER;
  if (score >= 58) return LONG_PF10_TIER.HIGH;
  if (score >= 45) return LONG_PF10_TIER.CANDIDATE;
  if (score >= 30) return LONG_PF10_TIER.WATCH;
  return LONG_PF10_TIER.REJECT;
}

export function scoreLongPostFee10Entry(candidate) {
  const { features, availableFeatures, missingFeatures, featureCoveragePct } =
    extractLongPostFee10Features(candidate);

  // Fail-closed: insufficient data must not produce a candidate verdict.
  if (featureCoveragePct < MIN_COVERAGE_PCT) {
    return {
      longPostFee10EntryScore:         null,
      longPostFee10EntryTier:          LONG_PF10_TIER.INSUFFICIENT,
      longPostFee10Verdict:            'UNKNOWN',
      isLongPostFee10CandidateAtEntry: false,
      longPostFee10PositiveGenes:      [],
      longPostFee10PenaltyGenes:       [],
      longPostFee10Features:           features,
      longPostFee10AvailableFeatures:  availableFeatures,
      longPostFee10MissingFeatures:    missingFeatures,
      longPostFee10FeatureCoveragePct: featureCoveragePct,
      logOnly:   true,
      canAffectExecution: false,
    };
  }

  const positiveContributions = [];
  const penaltyContributions  = [];
  let rawScore = 50;

  for (const [feat, active] of Object.entries(features)) {
    if (active !== true) continue; // null (unknown) and false both skip
    if (POSITIVE_WEIGHTS[feat] != null) {
      rawScore += POSITIVE_WEIGHTS[feat];
      positiveContributions.push(feat);
    }
    if (PENALTY_WEIGHTS[feat] != null) {
      rawScore += PENALTY_WEIGHTS[feat];
      penaltyContributions.push(feat);
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const tier  = classifyTier(score);

  return {
    longPostFee10EntryScore:         score,
    longPostFee10EntryTier:          tier,
    longPostFee10Verdict:            score >= 45 ? 'CANDIDATE' : score >= 30 ? 'WATCH' : 'REJECT',
    isLongPostFee10CandidateAtEntry: score >= 45,
    longPostFee10PositiveGenes:      positiveContributions,
    longPostFee10PenaltyGenes:       penaltyContributions,
    longPostFee10Features:           features,
    longPostFee10AvailableFeatures:  availableFeatures,
    longPostFee10MissingFeatures:    missingFeatures,
    longPostFee10FeatureCoveragePct: featureCoveragePct,
    logOnly:   true,
    canAffectExecution: false,
  };
}
