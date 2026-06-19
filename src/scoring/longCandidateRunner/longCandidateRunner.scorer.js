import { LONG_RUNNER_FEATURE, LONG_RUNNER_TIER } from './longCandidateRunner.constants.js';
import { extractLongRunnerFeatures } from './longCandidateRunner.features.js';

const POSITIVE_WEIGHTS = {
  [LONG_RUNNER_FEATURE.MICRO_GREEN_MULTI_CONFIRM]: 22,
  [LONG_RUNNER_FEATURE.IMMEDIATE_GREEN_IMPULSE]:   18,
  [LONG_RUNNER_FEATURE.CVD_BULL]:                  14,
  [LONG_RUNNER_FEATURE.CVD_IMPROVING]:              8,
  [LONG_RUNNER_FEATURE.RSI_UPWARD_EXPANSION]:      12,
  [LONG_RUNNER_FEATURE.MACD_BULLISH_EXPANSION]:    10,
  [LONG_RUNNER_FEATURE.VWAP_SUPPORT]:              12,
  [LONG_RUNNER_FEATURE.VWAP_RECLAIM]:              15,
  [LONG_RUNNER_FEATURE.TIGHT_SPREAD]:               6,
  [LONG_RUNNER_FEATURE.HEALTHY_ATR]:                6,
  [LONG_RUNNER_FEATURE.STRONG_LIQUIDITY]:           8,
  [LONG_RUNNER_FEATURE.SUPPORTIVE_MARKET_CONTEXT]: 10,
};

const PENALTY_WEIGHTS = {
  [LONG_RUNNER_FEATURE.MICRO_RED_PRESSURE]:       -18,
  [LONG_RUNNER_FEATURE.IMMEDIATE_RED_IMPULSE]:    -28,
  [LONG_RUNNER_FEATURE.CVD_BEAR]:                 -18,
  [LONG_RUNNER_FEATURE.LAST_3_TICKS_DOWN]:        -20,
  [LONG_RUNNER_FEATURE.VWAP_RECLAIM_FAILED]:      -18,
  [LONG_RUNNER_FEATURE.OVEREXTENSION_NO_RESET]:   -14,
  [LONG_RUNNER_FEATURE.THIN_BOOK]:                -10,
  [LONG_RUNNER_FEATURE.WIDE_SPREAD]:              - 8,
  [LONG_RUNNER_FEATURE.HOSTILE_MARKET_CONTEXT]:   -12,
};

// Minimum required-feature coverage to produce a meaningful score.
const MIN_COVERAGE_PCT = 50;

function classifyTier(score) {
  if (score >= 85) return LONG_RUNNER_TIER.ELITE;
  if (score >= 72) return LONG_RUNNER_TIER.SNIPER;
  if (score >= 58) return LONG_RUNNER_TIER.HIGH;
  if (score >= 45) return LONG_RUNNER_TIER.CANDIDATE;
  if (score >= 30) return LONG_RUNNER_TIER.WATCH;
  return LONG_RUNNER_TIER.REJECT;
}

export function scoreLongCandidateRunner(candidate) {
  const { features, availableFeatures, missingFeatures, featureCoveragePct } =
    extractLongRunnerFeatures(candidate);

  // Fail-closed: insufficient data must not produce a positive verdict.
  if (featureCoveragePct < MIN_COVERAGE_PCT) {
    return {
      longCandidateRunnerScoreAtEntry:       null,
      longCandidateRunnerTierAtEntry:        LONG_RUNNER_TIER.INSUFFICIENT,
      longCandidateRunnerVerdict:            'UNKNOWN',
      longCandidateRunnerReasons:            [],
      longCandidateRunnerPenalties:          [],
      longCandidateRunnerWouldAllow:         false,
      longCandidateRunnerWouldBlock:         false,
      longCandidateRunnerAvailableFeatures:  availableFeatures,
      longCandidateRunnerMissingFeatures:    missingFeatures,
      longCandidateRunnerFeatureCoveragePct: featureCoveragePct,
      logOnly:            true,
      canAffectExecution: false,
    };
  }

  const positiveReasons = [];
  const penaltyReasons  = [];
  let rawScore = 50;

  for (const [feat, active] of Object.entries(features)) {
    if (active !== true) continue; // null (unknown) and false both skip
    if (POSITIVE_WEIGHTS[feat] != null) {
      rawScore += POSITIVE_WEIGHTS[feat];
      positiveReasons.push(feat);
    }
    if (PENALTY_WEIGHTS[feat] != null) {
      rawScore += PENALTY_WEIGHTS[feat];
      penaltyReasons.push(feat);
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const tier  = classifyTier(score);

  return {
    longCandidateRunnerScoreAtEntry:       score,
    longCandidateRunnerTierAtEntry:        tier,
    longCandidateRunnerVerdict:            score >= 45 ? 'ALLOW' : score < 30 ? 'BLOCK' : 'WATCH',
    longCandidateRunnerReasons:            positiveReasons,
    longCandidateRunnerPenalties:          penaltyReasons,
    longCandidateRunnerWouldAllow:         score >= 45,
    longCandidateRunnerWouldBlock:         score < 30,
    longCandidateRunnerAvailableFeatures:  availableFeatures,
    longCandidateRunnerMissingFeatures:    missingFeatures,
    longCandidateRunnerFeatureCoveragePct: featureCoveragePct,
    logOnly:            true,
    canAffectExecution: false,
  };
}
