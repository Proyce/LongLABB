// ─── CANONICAL LONG ENTRY RESEARCH PIPELINE ───────────────────────────────────
// Single authoritative function for assembling complete entry research.
// Both manual (addSample) and batch creation paths must call this.
// Order is fixed — do not reorder steps without updating tests.
//
// Spec §6: every stage enriches ONE cumulative `workingTrade`. A component's
//          output is merged into workingTrade before later components consume it.
// Spec §7: the snapshot uses one canonical key structure (no parallel aliases).
// Spec §8: the flattened trade maps each canonical field explicitly (no scorer spreads).
// Spec §9: data quality is evaluated twice; conflicts dominate the final verdict.

import {
  LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
  LONG_FILTER_SNAPSHOT_VERSION,
  LONG_TRADE_EXPORT_VERSION,
} from './longResearchSchemaVersions.js';
import { normalizeLongEntryFacts, flattenLongEntryFacts } from './normalizeLongEntryFacts.js';
import { buildLongShadowDecision } from './buildLongShadowDecision.js';
import { assertLongResearchOnly, LONG_RESEARCH_ONLY_CONFIG } from '../safety/assertLongResearchOnly.js';
import { classifyLongBucket } from '../longBuckets/longBucketClassifier.js';
import { evaluateLongGateAudit } from '../longGate/longGateAudit.js';
import { evaluateTopGainerContinuationAudit } from '../longAudits/topGainerContinuationAudit.js';
import { evaluateTopLoserReversalAudit } from '../longAudits/topLoserReversalAudit.js';
import { normalizeLongMarketContext } from '../marketRegime/normalizeLongMarketContext.js';
import { computeLongMarketBreadthLogOnly } from '../marketRegime/longMarketBreadthLogOnly.js';
import { computeLongEntryDangerAuditLogOnly } from '../longAudits/longEntryDangerAuditLogOnly.js';
import {
  computeLongAbsoluteEntryScoreV1,
  flattenLongAesV1,
} from '../scoring/longAbsoluteEntryScore/index.js';
import { evaluateBestDnaLongAudit } from '../audits/bestDnaLongAudit.js';
import { computeBestDnaLongV2Shadow } from '../audits/bestDnaLongAuditV2.js';
import { computeLongAesV2Shadow } from '../scoring/longAbsoluteEntryScore/longAbsoluteEntryScore.v2Shadow.js';
import { scoreLongCandidateRunner } from '../scoring/longCandidateRunner/index.js';
import { scoreLongPostFee10Entry } from '../scoring/longPostFee10/index.js';
import { evaluateSniperLongGateLogOnly } from '../longGate/sniperLongGateLogOnly.js';
import { evaluateLongCombos, evaluateLongTickResearchHypotheses } from '../combos/longComboRegistry.js';
import { evaluateLongWinningSetupMatches } from '../filters/evaluateLongWinningSetupMatches.js';
import { freezeLongFilterSnapshot } from '../filters/longFilterSnapshot.js';
import { computeAdaptiveAes } from '../entryPolicy/adaptiveAes.js';
import { evaluateEntryPolicyLogOnly } from '../entryPolicy/evaluateEntryPolicyLogOnly.js';
import { flattenAdaptiveAes, flattenEntryPolicy } from '../entryPolicy/entryPolicy.flatten.js';
import {
  deriveLongCvdSemantics,
  deriveLongAtrContext,
  deriveLongEvidenceSummary,
  deriveLongQualityBuckets,
} from './longEvidenceSemantics.js';
import { buildEntrySnapshotProvenance } from './entrySnapshotProvenance.js';
import { deriveLongMicroMomentumLabel } from './longWinningSignals.js';
import {
  enrichFrozenTickDirectionSnapshot,
  extractFrozenTickDirectionSnapshot,
} from '../tickDirection/tickDirectionSnapshot.js';
import {
  LONG_SCORE_REGISTRY_VERSION,
  LONG_FILTER_REGISTRY_VERSION,
  LONG_LABEL_REGISTRY_VERSION,
  LONG_COMBO_REGISTRY_SCHEMA_VERSION,
  LONG_ANTI_COMBO_REGISTRY_VERSION,
  LONG_WINNING_SETUP_REGISTRY_VERSION,
  LONG_MARKET_CONTEXT_VERSION,
  LONG_EXIT_SYSTEM_VERSION,
  LONG_FEE_MODEL_VERSION,
  LONG_PNL_MODEL_VERSION,
} from './longResearchSchemaVersions.js';

// Re-export for backward compatibility (legacy importers used this name).
export const SNAPSHOT_SCHEMA_VERSION = LONG_ENTRY_RESEARCH_SCHEMA_VERSION;

// ─── DEEP FREEZE ──────────────────────────────────────────────────────────────

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// ─── DATA QUALITY ASSESSMENT ──────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  'entryTime',
  'entryPrice',
  'leverage',
  'longParentBucket',
  'longMicroMomentumLabel',
  'hasGreenConfirmation',
  'hasRedDanger',
  'entryCvdLabel',
  'spreadPct',
  'atrPct',
];

const IMPORTANT_OPTIONAL_FIELDS = [
  'longVwapContextLabel',
  'entryPriceVsVwapLabel',
  'hasRsiRolloverUp',
  'macdBullishExpansion',
  'btcMicroDirectionLabel',
  'btcTacticalDirectionLabel',
  'ethMicroDirectionLabel',
  'btcEthAlignmentLabel',
];

// Component errors in these subsystems are critical → INCOMPLETE.
const CRITICAL_COMPONENTS = ['LONG_GATE', 'LONG_AES', 'LONG_AUDIT'];

function assessInitialDataQuality(facts, flatFacts) {
  const missingRequired = REQUIRED_FIELDS.filter(f => {
    const v = flatFacts[f] ?? facts?.identity?.[f] ?? facts?.momentum?.[f] ?? facts?.cvd?.[f] ?? facts?.volatility?.[f] ?? facts?.liquidity?.[f] ?? facts?.bucket?.[f];
    return v == null;
  });

  const missingOptional = IMPORTANT_OPTIONAL_FIELDS.filter(f => {
    const v = flatFacts[f] ?? facts?.vwap?.[f] ?? facts?.rsi?.[f] ?? facts?.macd?.[f] ?? facts?.market?.[f];
    return v == null;
  });

  const coveragePct = Math.round(
    ((IMPORTANT_OPTIONAL_FIELDS.length - missingOptional.length) /
      IMPORTANT_OPTIONAL_FIELDS.length) * 100
  );

  let verdict;
  if (missingRequired.length > 0) verdict = 'INCOMPLETE';
  else if (coveragePct < 80) verdict = 'DEGRADED';
  else verdict = 'COMPLETE';

  return { verdict, missingRequired, missingOptional, coveragePct };
}

/**
 * Finalize data quality (spec §9).
 *
 * Strict precedence — conflicts dominate regardless of the initial verdict:
 *   1. CONFLICTED   (any conflicting field)
 *   2. INCOMPLETE   (critical component error OR missing required field)
 *   3. DEGRADED     (non-critical component error, stale source, tier gap, low coverage)
 *   4. COMPLETE
 */
function finalizeDataQuality({ initial, componentErrors, conflictingFields, staleFields, subsystems }) {
  let verdict = 'COMPLETE';

  const hasCriticalError = componentErrors.some(e => CRITICAL_COMPONENTS.includes(e.component));
  const hasNonCriticalError = componentErrors.some(e => !CRITICAL_COMPONENTS.includes(e.component));
  const missingRequired = (initial.missingRequired ?? []).length > 0;

  // Score-without-tier: subsystem produced a score but not its tier label.
  let tierGapDetected = false;
  if (subsystems) {
    const { gate, candidateRunner, postFee10, bucketAudit } = subsystems;
    tierGapDetected =
      (gate?.longGateScore != null && gate?.longGateTier == null) ||
      (candidateRunner?.longCandidateRunnerScoreAtEntry != null &&
        candidateRunner?.longCandidateRunnerTierAtEntry == null) ||
      (postFee10?.longPostFee10EntryScore != null &&
        postFee10?.longPostFee10EntryTier == null) ||
      (bucketAudit?.bucketAuditScore != null && bucketAudit?.bucketAuditTier == null);
  }

  // Precedence (highest first).
  if ((conflictingFields ?? []).length > 0) {
    verdict = 'CONFLICTED';
  } else if (hasCriticalError || missingRequired) {
    verdict = 'INCOMPLETE';
  } else if (
    hasNonCriticalError ||
    (staleFields ?? []).length > 0 ||
    tierGapDetected ||
    initial.verdict === 'DEGRADED'
  ) {
    verdict = 'DEGRADED';
  } else {
    verdict = 'COMPLETE';
  }

  return {
    verdict,
    longFilterDataQuality:           verdict,
    longFilterCoveragePct:           initial.coveragePct,
    optionalResearchFeatureCoveragePct: initial.coveragePct,
    longFilterMissingRequiredFields: initial.missingRequired,
    longFilterMissingOptionalFields: initial.missingOptional,
    longFilterConflictingFields:     conflictingFields ?? [],
    longFilterStaleFields:           staleFields ?? [],
    entryResearchComponentErrors:    componentErrors,
  };
}

// ─── CANONICAL PIPELINE ───────────────────────────────────────────────────────

/**
 * Builds a complete, immutable entry research snapshot.
 *
 * Stage order (spec §6 — must not change):
 *   1.  Normalize raw telemetry
 *   2.  Evaluate initial data quality
 *   3.  Classify LONG bucket
 *   4.  Evaluate LONG Gate
 *   5.  Evaluate bucket audit
 *   6.  Normalize LONG market context
 *   7.  Evaluate LONG market breadth
 *   8.  Evaluate LONG danger audit
 *   9.  Calculate LONG AES
 *   10. Calculate Best DNA LONG          (does NOT consume Post-Fee 10)
 *   11. Calculate Candidate Runner at entry
 *   12. Calculate Post-Fee 10 at entry
 *   13. Calculate Sniper LONG gate
 *   14. Evaluate LONG combos
 *   15. Build unified shadow decision
 *   16. Build filter snapshot
 *   17. Finalize data quality
 *   18. Assert log-only invariants
 *   19. Build explicit flattened output
 *   20. Deep-freeze snapshot
 *
 * @returns {{ snapshot, flattened, facts, dataQuality, shadowDecision }}
 */
export function buildLongEntryResearchSnapshot({
  baseTrade,
  entryTelemetry,
  marketRegime,
  marketContext,
  sessionContext,
  computedAt = Date.now(),
}) {
  assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG);

  const componentErrors = [];

  const candidateSeed = {
    ...baseTrade,
    ...entryTelemetry,
    ...marketContext,
    sessionId: sessionContext?.sessionId ?? baseTrade?.sessionId ?? null,
    computedAt,
  };
  const candidate = {
    ...candidateSeed,
    longMicroMomentumLabel: deriveLongMicroMomentumLabel(candidateSeed),
  };
  const tickDirectionSnapshot = candidate.entryTickSnapshotVersion
    ? enrichFrozenTickDirectionSnapshot(
        extractFrozenTickDirectionSnapshot(candidate),
        candidate,
      )
    : null;
  const normalizedCandidate = tickDirectionSnapshot
    ? { ...candidate, ...tickDirectionSnapshot }
    : candidate;

  // Stage 1: Normalize raw telemetry into canonical facts.
  const facts     = normalizeLongEntryFacts(normalizedCandidate, computedAt);
  const flatFacts = flattenLongEntryFacts(facts);

  // Stage 2: Initial data quality check.
  const initialDataQuality = assessInitialDataQuality(facts, { ...candidate, ...flatFacts });

  // ── ONE cumulative working trade — every stage enriches this object ─────────
  let workingTrade = {
    ...normalizedCandidate,
    ...flatFacts,
  };

  // Stage 3: Classify LONG bucket.
  let bucketClassification = null;
  try {
    bucketClassification = classifyLongBucket(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'LONG_BUCKET', message: err?.message ?? String(err) });
  }
  if (bucketClassification) {
    const resolvedParent =
      bucketClassification.longParentBucket ?? workingTrade.longParentBucket ?? null;
    const resolvedSub =
      bucketClassification.longSubBucket ??
      bucketClassification.topGainerLongSubBucket ??
      bucketClassification.topLoserLongSubBucket ??
      workingTrade.longSubBucket ?? null;
    // Ensure the stored classification carries the resolved parent/sub so the
    // snapshot's nested fields match the flattened top-level fields (spec §11).
    bucketClassification = {
      ...bucketClassification,
      longParentBucket: resolvedParent,
      longSubBucket:    resolvedSub,
    };
    workingTrade = {
      ...workingTrade,
      ...bucketClassification,
      longParentBucket: resolvedParent,
      longSubBucket:    resolvedSub,
    };
  }

  // Stage 4: Evaluate universal LONG gate. Pre-compute the LONG market context
  // and breadth labels first so the observer gate can reflect the macro regime
  // in its emitted score/tier. Stages 6/7 below recompute these authoritatively
  // and produce identical labels; this pre-pass is log-only and idempotent.
  let preGateContext = null;
  let preGateBreadth = null;
  try {
    preGateContext = normalizeLongMarketContext({ ...marketRegime, ...marketContext, ...workingTrade });
    preGateBreadth = computeLongMarketBreadthLogOnly({ ...workingTrade, ...preGateContext });
  } catch (err) {
    componentErrors.push({ component: 'LONG_GATE_REGIME_PREPASS', message: err?.message ?? String(err) });
  }
  let gate = null;
  try {
    gate = evaluateLongGateAudit({ ...workingTrade, ...preGateContext, ...preGateBreadth });
  } catch (err) {
    componentErrors.push({ component: 'LONG_GATE', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...gate };

  // Stage 5: Evaluate bucket-specific audit (consumes merged gate state).
  let bucketAudit = null;
  try {
    const parentBucket = workingTrade.longParentBucket;
    if (parentBucket === 'TOP_GAINER_LONGS') {
      bucketAudit = evaluateTopGainerContinuationAudit(workingTrade);
    } else if (parentBucket === 'TOP_LOSER_LONGS') {
      bucketAudit = evaluateTopLoserReversalAudit(workingTrade);
    }
  } catch (err) {
    componentErrors.push({ component: 'BUCKET_AUDIT', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...bucketAudit };

  // Stage 6: Normalize BTC/ETH LONG market context.
  let normalizedMarketContext = null;
  try {
    normalizedMarketContext = normalizeLongMarketContext({
      ...marketRegime,
      ...marketContext,
      ...workingTrade,
    });
  } catch (err) {
    componentErrors.push({ component: 'MARKET_CONTEXT', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...normalizedMarketContext };

  // Stage 7: Evaluate LONG market breadth.
  let marketBreadth = null;
  try {
    marketBreadth = computeLongMarketBreadthLogOnly(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'MARKET_BREADTH', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...marketBreadth };

  // Stage 8: Evaluate LONG entry danger audit.
  let longAudit = null;
  try {
    longAudit = computeLongEntryDangerAuditLogOnly(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'LONG_AUDIT', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...longAudit };

  // Stage 9: Calculate LONG AES (observes merged gate + audit state).
  let longAes     = null;
  let longAesFlat = {};
  try {
    longAes     = computeLongAbsoluteEntryScoreV1(workingTrade);
    // Spec §6 downstream invariant: the AES feature snapshot must observe the
    // gate values that were merged before AES ran.
    if (longAes && longAes.longAesFeatureSnapshot && typeof longAes.longAesFeatureSnapshot === 'object') {
      longAes.longAesFeatureSnapshot = {
        ...longAes.longAesFeatureSnapshot,
        longGateWouldPass: workingTrade.longGateWouldPass ?? null,
        longGateScore:     workingTrade.longGateScore ?? null,
      };
    }
    longAesFlat = flattenLongAesV1(longAes);
  } catch (err) {
    componentErrors.push({ component: 'LONG_AES', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...longAesFlat };

  // Stage 9a: Calculate Flow-weighted AES V2 shadow beside V1.
  let longAesV2Shadow = null;
  try {
    longAesV2Shadow = computeLongAesV2Shadow(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'LONG_AES_V2_SHADOW', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...longAesV2Shadow };

  // Stage 9b: Calculate adaptive Long AES from the native Long AES score.
  let adaptiveAes = null;
  let adaptiveAesFlat = {};
  try {
    const side = workingTrade.longParentBucket === 'TOP_LOSER_LONGS'
      ? 'LOSER'
      : workingTrade.longParentBucket === 'TOP_GAINER_LONGS'
        ? 'GAINER'
        : 'UNKNOWN';
    adaptiveAes = computeAdaptiveAes({
      baseAes: workingTrade.longAesScore,
      side,
      marketContext: {
        ...normalizedMarketContext,
        ...marketBreadth,
        btcRegime: workingTrade.btcRegime ?? workingTrade.btcTacticalDirectionLabel ?? null,
      },
      sessionHealth: sessionContext?.sessionHealth ?? null,
    });
    adaptiveAesFlat = flattenAdaptiveAes(adaptiveAes);
  } catch (err) {
    componentErrors.push({ component: 'ADAPTIVE_AES', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...adaptiveAesFlat };

  // Stage 10: Calculate Best DNA LONG (independent — does NOT consume Post-Fee 10).
  let bestDnaLong = null;
  try {
    bestDnaLong = evaluateBestDnaLongAudit(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'BEST_DNA_LONG', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...bestDnaLong };

  // Stage 10b: Calculate Best DNA V2 shadow without mutating V1.
  let bestDnaLongV2 = null;
  try {
    bestDnaLongV2 = computeBestDnaLongV2Shadow(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'BEST_DNA_LONG_V2_SHADOW', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...bestDnaLongV2 };

  const scoreVersionRoles = {
    longAesPrimaryVersion: 'V1',
    longAesV2PromotionStatus: 'SHADOW_ONLY',
    longAesV2MinusV1:
      Number.isFinite(Number(workingTrade.longAesScoreV2Shadow)) && Number.isFinite(Number(workingTrade.longAesScore))
        ? Number((Number(workingTrade.longAesScoreV2Shadow) - Number(workingTrade.longAesScore)).toFixed(4))
        : null,
    bestDnaPrimaryVersion: 'V1',
    bestDnaV2PromotionStatus: 'SHADOW_ONLY',
    bestDnaV2MinusV1:
      Number.isFinite(Number(workingTrade.bestDnaLongScoreV2Shadow)) && Number.isFinite(Number(workingTrade.bestDnaLongScore))
        ? Number((Number(workingTrade.bestDnaLongScoreV2Shadow) - Number(workingTrade.bestDnaLongScore)).toFixed(4))
        : null,
    scoreVersionRolesLogOnly: true,
  };
  workingTrade = { ...workingTrade, ...scoreVersionRoles };

  // Stage 11: Calculate LONG Candidate Runner.
  let candidateRunner = null;
  try {
    candidateRunner = scoreLongCandidateRunner(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'CANDIDATE_RUNNER', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...candidateRunner };

  // Stage 12: Calculate LONG Post-Fee 10.
  let postFee10 = null;
  try {
    postFee10 = scoreLongPostFee10Entry(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'POST_FEE_10', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...postFee10 };

  // Stage 13: Calculate Sniper LONG gate.
  let sniperLongGate = null;
  try {
    sniperLongGate = evaluateSniperLongGateLogOnly(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'SNIPER_LONG_GATE', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...sniperLongGate };

  // Stage 14: Evaluate LONG combos.
  let comboResult = null;
  try {
    comboResult = evaluateLongCombos(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'LONG_COMBOS', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...comboResult };

  // Stage 14t: Evaluate genuine-tick research hypotheses separately from the
  // validated combo registries. This stage is observational and cannot feed any
  // scorer, gate, policy, sizing, or execution decision.
  let tickHypothesisResult = null;
  try {
    tickHypothesisResult = evaluateLongTickResearchHypotheses(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'LONG_TICK_RESEARCH_HYPOTHESES', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...tickHypothesisResult };

  // Stage 14a: Derive independent evidence, LONG-aware CVD semantics, and
  // conditional ATR context. These are research-only and cannot affect execution.
  const cvdSemantics = deriveLongCvdSemantics(workingTrade);
  workingTrade = { ...workingTrade, ...cvdSemantics };
  const evidenceSummary = deriveLongEvidenceSummary(workingTrade);
  workingTrade = { ...workingTrade, ...evidenceSummary };
  const atrContext = deriveLongAtrContext(workingTrade);
  workingTrade = { ...workingTrade, ...atrContext };

  // Stage 14a-obs: Record micro-confirmation as a discrete observation. This is
  // a pure fact for analysis — it does NOT gate, skip, or alter any candidate.
  workingTrade = {
    ...workingTrade,
    longMicroConfirmObserved: workingTrade.longMicroMomentumLabel != null
      && workingTrade.longMicroMomentumLabel !== 'MICRO_NO_LONG_CONFIRMATION',
    longMicroConfirmReversalLane:
      workingTrade.topLoserLongThesisLane === 'TOP_LOSER_LONG_REVERSAL_WATCH',
    longMicroConfirmObsVersion: 'LONG_MICRO_CONFIRM_OBS_V1_2026_06_17',
  };

  // Stage 14b: Evaluate curated entry-time Winning Setup matches. Outcome-only
  // catalog entries are excluded by the evaluator to prevent entry leakage.
  let winningSetupMatches = null;
  try {
    winningSetupMatches = evaluateLongWinningSetupMatches(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'LONG_WINNING_SETUPS', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...winningSetupMatches };

  // Stage 14c: Evaluate the diagnostic entry policy after all entry-time scores
  // and formal combos are available. This remains SHADOW_ONLY.
  let entryPolicy = null;
  let entryPolicyFlat = {};
  try {
    entryPolicy = evaluateEntryPolicyLogOnly({
      ...workingTrade,
      requiredAdaptiveAes: adaptiveAes?.absoluteEntryRequiredScore ?? null,
    });
    entryPolicyFlat = flattenEntryPolicy(entryPolicy);
  } catch (err) {
    componentErrors.push({ component: 'ENTRY_POLICY', message: err?.message ?? String(err) });
  }
  workingTrade = { ...workingTrade, ...entryPolicyFlat };

  // Stage 16: Build filter snapshot (values only) BEFORE finalizing quality, so
  // a filter-snapshot failure is recorded as a component error that the final
  // data-quality verdict can see (spec §9 / review blocker 3).
  let filterSnapshot = null;
  try {
    filterSnapshot = freezeLongFilterSnapshot(workingTrade);
  } catch (err) {
    componentErrors.push({ component: 'LONG_FILTER_SNAPSHOT', message: err?.message ?? String(err) });
  }

  // Stage 17: finalize data quality — conflicts dominate; now aware of any
  // filter-snapshot error pushed above.
  const dataQuality = finalizeDataQuality({
    initial:           initialDataQuality,
    componentErrors,
    conflictingFields: facts.longFilterConflictingFields ?? [],
    staleFields:       facts.longFilterStaleFields ?? [],
    subsystems:        { gate, candidateRunner, postFee10, bucketAudit },
  });

  // The canonical finalized verdict is the SINGLE source of truth — stamp it
  // onto the frozen snapshot so the nested snapshot can never disagree with the
  // top-level verdict (review blocker 2). Shadow decision is stamped after it is
  // built below.

  const requiredEntryFieldsComplete = (dataQuality.longFilterMissingRequiredFields ?? []).length === 0;
  const entryResearchStatus =
    dataQuality.verdict === 'COMPLETE'
      ? 'FINAL'
      : requiredEntryFieldsComplete && dataQuality.verdict === 'DEGRADED'
        ? 'REQUIRED_COMPLETE_OPTIONAL_PARTIAL'
        : 'FINAL_WITH_MISSING_DATA';

  // Stage 15: Build unified shadow decision (uses finalized data quality).
  const shadowDecision = buildLongShadowDecision({
    longGate:      gate,
    longAes,
    longAudit,
    bucketAudit,
    marketContext: normalizedMarketContext,
    marketBreadth,
    runner:        candidateRunner,
    postFee10,
    dataQuality,
  });

  const qualityBuckets = deriveLongQualityBuckets({ ...workingTrade, ...dataQuality, longShadowDecision: shadowDecision?.finalVerdict ?? null });
  workingTrade = { ...workingTrade, ...qualityBuckets };
  const entrySnapshotProvenance = buildEntrySnapshotProvenance(workingTrade, computedAt);
  workingTrade = { ...workingTrade, ...entrySnapshotProvenance };

  if (filterSnapshot) {
    filterSnapshot = {
      ...filterSnapshot,
      longFilterDataQuality:   dataQuality.verdict,
      longFilterMissingFields: dataQuality.longFilterMissingRequiredFields,
      longShadowDecision:      shadowDecision?.finalVerdict ?? null,
    };
  }

  // Stage 18: Assert research-only on shadow decision.
  assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG, shadowDecision);

  // Stage 19: Build explicit flattened output — each canonical field mapped by hand.
  const flattened = {
    // ── Identity ──────────────────────────────────────────────────────────────
    entryResearchSchemaVersion: LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
    entryResearchStatus,
    entryResearchComputedAt:    computedAt,
    longWinningSetupsVersion:  LONG_WINNING_SETUP_REGISTRY_VERSION,
    tradeSchemaVersion: LONG_TRADE_EXPORT_VERSION,
    entrySnapshotSchemaVersion: LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
    scoreRegistryVersion: LONG_SCORE_REGISTRY_VERSION,
    filterRegistryVersion: LONG_FILTER_REGISTRY_VERSION,
    labelRegistryVersion: LONG_LABEL_REGISTRY_VERSION,
    comboRegistrySchemaVersion: LONG_COMBO_REGISTRY_SCHEMA_VERSION,
    antiComboRegistryVersion: LONG_ANTI_COMBO_REGISTRY_VERSION,
    winningSetupRegistryVersion: LONG_WINNING_SETUP_REGISTRY_VERSION,
    marketContextVersion: LONG_MARKET_CONTEXT_VERSION,
    exitSystemVersion: LONG_EXIT_SYSTEM_VERSION,
    feeModelVersion: LONG_FEE_MODEL_VERSION,
    pnlModelVersion: LONG_PNL_MODEL_VERSION,
    longParentBucket: workingTrade.longParentBucket ?? null,
    longSubBucket:    workingTrade.longSubBucket ?? null,
    ...(tickDirectionSnapshot ?? {}),

    // ── Gate ───────────────────────────────────────────────────────────────────
    longGateWouldPass:     gate?.longGateWouldPass ?? null,
    longGateScore:         gate?.longGateScore ?? null,
    longGateEligibility:   gate?.longGateEligibility ?? null,
    longGateTier:          gate?.longGateTier ?? null,
    longGateRegimeVersion:       gate?.longGateRegimeVersion ?? null,
    longGateRegimePenaltyApplied: gate?.longGateRegimePenaltyApplied ?? null,
    longGateTierCeilingApplied:  gate?.longGateTierCeilingApplied ?? null,
    longGateResearchBandV2: gate?.longGateResearchBandV2 ?? null,
    longGateAuditLabel:    gate?.longGateAuditLabel ?? null,
    longGateReasons:       gate?.longGateReasons ?? [],
    longGateFailReasons:   gate?.longGateFailReasons ?? [],
    longGateMissingInputs: gate?.longGateMissingInputs ?? [],
    longMicroMomentumLabel: gate?.longMicroMomentumLabel ?? workingTrade.longMicroMomentumLabel ?? null,
    longMicroUpConfirmation: gate?.longMicroUpConfirmation ?? null,
    longMicroUpConfirmationReasons: gate?.longMicroUpConfirmationReasons ?? [],
    longMicroUpConfirmationSourceCount: gate?.longMicroUpConfirmationSourceCount ?? 0,
    longMicroConfirmObserved:     workingTrade.longMicroConfirmObserved ?? null,
    longMicroConfirmReversalLane: workingTrade.longMicroConfirmReversalLane ?? null,
    longMicroConfirmObsVersion:   workingTrade.longMicroConfirmObsVersion ?? null,
    rsiLongMomentumExpansion: gate?.rsiLongMomentumExpansion ?? workingTrade.rsiLongMomentumExpansion ?? null,
    rsiLongMomentumExpansionSource: gate?.rsiLongMomentumExpansionSource ?? workingTrade.rsiLongMomentumExpansionSource ?? null,
    macdBullishExpansion: gate?.macdBullishExpansion ?? workingTrade.macdBullishExpansion ?? null,
    topLoserLongThesisLane: gate?.topLoserLongThesisLane ?? null,
    btcLongContextLabel:    gate?.btcLongContextLabel ?? workingTrade.btcLongContextLabel ?? null,
    btcLongContextScore:    gate?.btcLongContextScore ?? null,
    vwapLongContextLabel:   gate?.vwapLongContextLabel ?? null,
    hasLongMicroMomentum:   gate?.hasLongMicroMomentum ?? null,
    hasGreenConfirmation:   gate?.hasGreenConfirmation ?? workingTrade.hasGreenConfirmation ?? null,
    hasRsiRolloverUp:       gate?.hasRsiRolloverUp ?? workingTrade.hasRsiRolloverUp ?? null,

    // ── Bucket audit ─────────────────────────────────────────────────────────────
    bucketAuditType:          bucketAudit?.bucketAuditType ?? null,
    bucketAuditWouldPass:     bucketAudit?.bucketAuditWouldPass ?? null,
    bucketAuditScore:         bucketAudit?.bucketAuditScore ?? null,
    bucketAuditTier:          bucketAudit?.bucketAuditTier ?? null,
    bucketAuditReasons:       bucketAudit?.bucketAuditReasons ?? [],
    bucketAuditWarnings:      bucketAudit?.bucketAuditWarnings ?? [],
    bucketAuditMissingInputs: bucketAudit?.bucketAuditMissingInputs ?? [],
    topGainerContinuationWouldPass: bucketAudit?.topGainerContinuationWouldPass ?? null,
    topGainerContinuationScore:     bucketAudit?.topGainerContinuationScore ?? null,
    topLoserReversalWouldPass:      bucketAudit?.topLoserReversalWouldPass ?? null,
    topLoserReversalScore:          bucketAudit?.topLoserReversalScore ?? null,

    // ── Market context + breadth + audit + AES (namespaced spreads) ─────────────
    ...normalizedMarketContext,
    ...marketBreadth,
    ...longAudit,
    ...longAesFlat,
    ...longAesV2Shadow,
    ...scoreVersionRoles,
    ...adaptiveAesFlat,
    ...entryPolicyFlat,

    // ── Best DNA (all bestDnaLong* namespaced) ──────────────────────────────────
    ...bestDnaLong,
    ...bestDnaLongV2,

    // ── Candidate Runner (all longCandidateRunner* namespaced) ──────────────────
    ...candidateRunner,

    // ── Post-Fee 10 (all longPostFee10* namespaced) ─────────────────────────────
    ...postFee10,

    // ── Sniper + combos ─────────────────────────────────────────────────────────
    ...sniperLongGate,
    ...comboResult,
    ...tickHypothesisResult,
    ...cvdSemantics,
    ...evidenceSummary,
    ...atrContext,
    ...qualityBuckets,
    ...entrySnapshotProvenance,
    ...winningSetupMatches,

    // ── Shadow decision (canonical: longShadowDecision) ─────────────────────────
    longShadowDecision:             shadowDecision?.finalVerdict ?? null,
    longShadowRequiredCoveragePct:  shadowDecision?.requiredCoveragePct ?? null,
    longShadowPositiveReasons:      shadowDecision?.positiveReasons ?? [],
    longShadowCautionReasons:       shadowDecision?.cautionReasons ?? [],
    longShadowBlockReasons:         shadowDecision?.blockReasons ?? [],
    longShadowUnknownReasons:       shadowDecision?.unknownReasons ?? [],
    longShadowComponentVerdicts: {
      baseGate:      shadowDecision?.baseGateVerdict ?? null,
      aes:           shadowDecision?.aesVerdict ?? null,
      audit:         shadowDecision?.auditVerdict ?? null,
      bucketAudit:   shadowDecision?.bucketAuditVerdict ?? null,
      marketContext: shadowDecision?.marketContextVerdict ?? null,
      marketBreadth: shadowDecision?.marketBreadthVerdict ?? null,
      runner:        shadowDecision?.runnerVerdict ?? null,
      postFee10:     shadowDecision?.postFee10Verdict ?? null,
      dataQuality:   shadowDecision?.dataQualityVerdict ?? null,
    },

    // ── Data quality ─────────────────────────────────────────────────────────────
    longFilterDataQuality:           dataQuality.longFilterDataQuality,
    longFilterCoveragePct:           dataQuality.longFilterCoveragePct,
    optionalResearchFeatureCoveragePct: dataQuality.longFilterCoveragePct,
    requiredEntrySnapshotCompletenessPct: entrySnapshotProvenance?.entrySnapshotCompletenessPct ?? null,
    longFilterMissingRequiredFields: dataQuality.longFilterMissingRequiredFields,
    longFilterMissingOptionalFields: dataQuality.longFilterMissingOptionalFields,
    // Scalar drivers so rows can be grouped by *why* they are not COMPLETE
    // without parsing the JSON array (log-only diagnostic).
    longDataQualityMissingRequiredCount: (dataQuality.longFilterMissingRequiredFields ?? []).length,
    longDataQualityPrimaryMissingField: (dataQuality.longFilterMissingRequiredFields ?? [])[0] ?? null,
    longDataQualityVerdictDriver:
      (dataQuality.longFilterConflictingFields ?? []).length > 0 ? 'CONFLICTED_FIELD'
      : (dataQuality.entryResearchComponentErrors ?? []).some(e => CRITICAL_COMPONENTS.includes(e?.component)) ? 'CRITICAL_COMPONENT_ERROR'
      : (dataQuality.longFilterMissingRequiredFields ?? []).length > 0 ? 'MISSING_REQUIRED_FIELD'
      : (dataQuality.longFilterDataQuality === 'DEGRADED') ? 'LOW_OPTIONAL_COVERAGE_OR_STALE'
      : 'NONE',
    longFilterConflictingFields:     dataQuality.longFilterConflictingFields,
    longFilterStaleFields:           dataQuality.longFilterStaleFields,
    entryResearchComponentErrors:    dataQuality.entryResearchComponentErrors,

    // ── Filter snapshot meta ──────────────────────────────────────────────────────
    longFilterSnapshotVersion:    LONG_FILTER_SNAPSHOT_VERSION,
    longFilterSnapshotTiming:     'ENTRY_FINAL',
    longFilterSnapshotComputedAt: computedAt,
    longFilterSnapshotSource:     'buildLongEntryResearchSnapshot',

    // ── Research-only invariants ───────────────────────────────────────────────
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  };

  // Stage 20: Deep-freeze canonical snapshot — exact canonical keys (spec §7).
  const snapshot = deepFreeze({
    schemaVersion:  LONG_ENTRY_RESEARCH_SCHEMA_VERSION,
    entryResearchStatus,
    computedAt,
    snapshotTiming: 'ENTRY_FINAL',

    facts,
    dataQuality,

    bucketClassification,
    gate,
    bucketAudit,
    marketContext:  normalizedMarketContext,
    marketBreadth,
    longAudit,
    longAes,
    longAesV2Shadow,
    scoreVersionRoles,
    adaptiveAes,
    entryPolicy,
    bestDnaLong,
    bestDnaLongV2,
    candidateRunner,
    postFee10,
    sniperLongGate,
    comboResult,
    tickMicrostructure: tickDirectionSnapshot,
    tickHypothesisResult,
    cvdSemantics,
    evidenceSummary,
    atrContext,
    qualityBuckets,
    entrySnapshotProvenance,
    winningSetupMatches,
    shadowDecision,
    filterSnapshot,

    componentErrors,

    logOnly:            true,
    canAffectExecution: false,
    executionApplied:   false,
  });

  return {
    snapshot,
    flattened,
    facts,
    dataQuality,
    shadowDecision,
    adaptiveAes,
    entryPolicy,
  };
}
