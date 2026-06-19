// Session Health Governor — state machine with deadbands, persistence, hysteresis
import { SESSION_HEALTH_VERSION, SESSION_HEALTH_CONFIG } from "./sessionHealth.config.js";
import { computeSessionMetrics, classifyPnlAxes } from "./sessionHealth.metrics.js";

let _stateSequenceNumber = 0;

const SEVERITY_MAP = {
  SESSION_WARMUP:              0,
  SESSION_FULL_PASS:           0,
  SESSION_NEUTRAL_CAUTION:     1,
  SESSION_CHECK_STRICT:        2,
  SESSION_RECOVERY_STRICT:     2,
  SESSION_FULL_BLOCK_CANDIDATE: 4,
  SESSION_DATA_STALE_SAFE:     4,
};

const POLICY_RECOMMENDATIONS = {
  SESSION_FULL_PASS:           { mode: "POLICY_FULL_PASS",           thresholdDelta: 0,  capacityMultiplier: 1.00 },
  SESSION_CHECK_STRICT:        { mode: "POLICY_STRICT",              thresholdDelta: 5,  capacityMultiplier: 0.70 },
  SESSION_RECOVERY_STRICT:     { mode: "POLICY_RECOVERY_STRICT",     thresholdDelta: 7,  capacityMultiplier: 0.50 },
  SESSION_FULL_BLOCK_CANDIDATE: { mode: "POLICY_FULL_BLOCK_CANDIDATE", thresholdDelta: 99, capacityMultiplier: 0.00 },
  SESSION_NEUTRAL_CAUTION:     { mode: "POLICY_REDUCED_CAPACITY",    thresholdDelta: 3,  capacityMultiplier: 0.80 },
  SESSION_DATA_STALE_SAFE:     { mode: "POLICY_DATA_STALE_BLOCK_CANDIDATE", thresholdDelta: 99, capacityMultiplier: 0.00 },
  SESSION_WARMUP:              { mode: "POLICY_WARMUP",              thresholdDelta: 0,  capacityMultiplier: 1.00 },
};

function isWarmup(metrics, sessionStartMs, now, config) {
  const elapsedMs = sessionStartMs ? (now - sessionStartMs) : Infinity;
  if (elapsedMs < config.warmupMinMs) return true;
  if (metrics.closedTradeCount < config.warmupMinTrades && metrics.activeTradeCount < config.warmupMinTrades) return true;
  return false;
}

function computeBaseState({ liveAxis, netAxis }, config) {
  if (liveAxis === "POSITIVE" && netAxis === "POSITIVE") return "SESSION_FULL_PASS";
  if (liveAxis === "NEGATIVE" && netAxis === "POSITIVE") return "SESSION_CHECK_STRICT";
  if (liveAxis === "POSITIVE" && netAxis === "NEGATIVE") return "SESSION_RECOVERY_STRICT";
  if (liveAxis === "NEGATIVE" && netAxis === "NEGATIVE") return "SESSION_FULL_BLOCK_CANDIDATE";
  return "SESSION_NEUTRAL_CAUTION";
}

function applyDeteriorationOverride(candidateState, metrics, config) {
  const det = config.deterioration;

  const triggered =
    (metrics.recentSlRate != null && metrics.recentSlRate >= det.maxSlRate) ||
    (metrics.consecutiveLosses != null && metrics.consecutiveLosses >= det.maxConsecutiveLoss) ||
    (metrics.recentExpectancy != null && metrics.recentExpectancy < det.minExpectancy) ||
    (
      metrics.activeWinPctAfterFees != null &&
      metrics.activeWinPctAfterFees < det.minActiveWinPct &&
      metrics.activeTradeCount >= det.minActiveForWinPct
    );

  if (!triggered) return { candidateState, deteriorating: false };

  // Downgrade nominally positive state by one level
  const degraded = {
    SESSION_FULL_PASS:       "SESSION_CHECK_STRICT",
    SESSION_CHECK_STRICT:    "SESSION_RECOVERY_STRICT",
    SESSION_RECOVERY_STRICT: "SESSION_FULL_BLOCK_CANDIDATE",
    SESSION_NEUTRAL_CAUTION: "SESSION_CHECK_STRICT",
  }[candidateState];

  return {
    candidateState: degraded ?? candidateState,
    deteriorating: true,
  };
}

export function computeSessionHealth(samples, now, previousState, sessionStartMs, config = SESSION_HEALTH_CONFIG) {
  const evaluatedAt = now ?? Date.now();

  // Check for invalid/stale data
  const hasAnySamples = Array.isArray(samples) && samples.length > 0;
  if (!hasAnySamples) {
    return buildResult({
      candidateState: "SESSION_WARMUP",
      effectiveState:  "SESSION_WARMUP",
      metrics:         { activeTradeCount: 0, closedTradeCount: 0, recentClosedTradeCount: 0, liveFeeAdjustedNormTotal: 0, realizedFeeAdjustedNormTotal: 0, netFeeAdjustedNormTotal: 0 },
      axes:            { liveAxis: "NEUTRAL", realizedAxis: "NEUTRAL", netAxis: "NEUTRAL" },
      labels:          ["SESSION_WARMUP"],
      warnings:        ["NO_SAMPLES"],
      transitionReason: "NO_SAMPLES",
      previousState,
      evaluatedAt,
      deteriorating: false,
      config,
    });
  }

  const metrics = computeSessionMetrics(samples, evaluatedAt, config);
  const axes    = classifyPnlAxes(metrics, config);

  // Data validity check
  const liveValid = Number.isFinite(metrics.liveFeeAdjustedNormTotal);
  const netValid  = Number.isFinite(metrics.netFeeAdjustedNormTotal);
  if (!liveValid || !netValid) {
    return buildResult({
      candidateState: "SESSION_DATA_STALE_SAFE",
      effectiveState:  "SESSION_DATA_STALE_SAFE",
      metrics,
      axes,
      labels: ["SESSION_DATA_STALE_SAFE"],
      warnings: ["PORTFOLIO_DATA_INVALID"],
      transitionReason: "PORTFOLIO_DATA_INVALID",
      previousState,
      evaluatedAt,
      deteriorating: false,
      config,
    });
  }

  // Warmup
  if (isWarmup(metrics, sessionStartMs, evaluatedAt, config)) {
    return buildResult({
      candidateState: "SESSION_WARMUP",
      effectiveState:  previousState?.effectiveState === "SESSION_WARMUP" ? "SESSION_WARMUP" : "SESSION_WARMUP",
      metrics,
      axes,
      labels: ["SESSION_WARMUP"],
      warnings: [],
      transitionReason: "IN_WARMUP",
      previousState,
      evaluatedAt,
      deteriorating: false,
      config,
    });
  }

  // Compute candidate
  let rawCandidate = computeBaseState(axes, config);

  // Deterioration override
  const { candidateState: afterDeterioration, deteriorating } = applyDeteriorationOverride(rawCandidate, metrics, config);
  let candidateState = afterDeterioration;

  // Hysteresis: apply persistence rules
  const prev = previousState;
  const effectiveState = applyHysteresis({ candidateState, previousState: prev, evaluatedAt, config });

  // Labels
  const labels = buildLabels({ axes, metrics, deteriorating, candidateState, effectiveState });
  const transitionReason = buildTransitionReason({ rawCandidate, candidateState, effectiveState, prev, deteriorating });

  return buildResult({
    candidateState,
    effectiveState,
    metrics,
    axes,
    labels,
    warnings: [],
    transitionReason,
    previousState: prev,
    evaluatedAt,
    deteriorating,
    config,
  });
}

function applyHysteresis({ candidateState, previousState: prev, evaluatedAt, config }) {
  const hys = config.hysteresis;

  if (!prev) return candidateState;

  const prevEffective = prev.effectiveState ?? candidateState;
  const prevCandidate = prev.candidateState ?? candidateState;
  const candidateSince = prev.candidateState === candidateState ? (prev.candidateSince ?? evaluatedAt) : evaluatedAt;
  const persistedMs = evaluatedAt - candidateSince;
  const consecutiveEvals = prev.candidateState === candidateState ? ((prev.consecutiveEvals ?? 0) + 1) : 1;

  // Immediate transitions for safety-critical states
  if (candidateState === "SESSION_DATA_STALE_SAFE") return candidateState;

  // Block recovery: requires 60s of non-negative
  if (prevEffective === "SESSION_FULL_BLOCK_CANDIDATE") {
    const blockRecoveryOk =
      persistedMs >= hys.blockRecoveryMs &&
      consecutiveEvals >= hys.minEvaluations &&
      candidateState !== "SESSION_FULL_BLOCK_CANDIDATE";
    if (!blockRecoveryOk) return "SESSION_FULL_BLOCK_CANDIDATE";
  }

  // Standard hysteresis: must persist for minimum evals and time
  if (
    candidateState !== prevEffective &&
    (consecutiveEvals < hys.minEvaluations || persistedMs < hys.minPersistenceMs)
  ) {
    return prevEffective;
  }

  return candidateState;
}

function buildLabels({ axes, metrics, deteriorating, candidateState, effectiveState }) {
  const labels = [effectiveState];

  // Axes labels
  const axisLabel =
    axes.liveAxis === "POSITIVE" && axes.netAxis === "POSITIVE" ? "LIVE_POS_NET_POS"
    : axes.liveAxis === "NEGATIVE" && axes.netAxis === "POSITIVE" ? "LIVE_NEG_NET_POS"
    : axes.liveAxis === "POSITIVE" && axes.netAxis === "NEGATIVE" ? "LIVE_POS_NET_NEG"
    : axes.liveAxis === "NEGATIVE" && axes.netAxis === "NEGATIVE" ? "LIVE_NEG_NET_NEG"
    : "LIVE_NEUTRAL";
  labels.push(axisLabel);

  if (axes.liveAxis === "NEUTRAL") labels.push("LIVE_NEUTRAL");
  if (axes.netAxis  === "NEUTRAL") labels.push("NET_NEUTRAL");
  if (deteriorating) labels.push("SESSION_DETERIORATING");

  return labels;
}

function buildTransitionReason({ rawCandidate, candidateState, effectiveState, prev, deteriorating }) {
  if (!prev) return "INITIAL";
  if (deteriorating && rawCandidate !== candidateState) return "DETERIORATION_OVERRIDE";
  if (effectiveState !== (prev.effectiveState ?? effectiveState)) return `TRANSITION_FROM_${prev.effectiveState ?? "UNKNOWN"}`;
  return "STABLE";
}

function buildResult({ candidateState, effectiveState, metrics, axes, labels, warnings, transitionReason, previousState, evaluatedAt, deteriorating, config }) {
  _stateSequenceNumber++;
  const policy = POLICY_RECOMMENDATIONS[effectiveState] ?? POLICY_RECOMMENDATIONS.SESSION_WARMUP;

  const prev = previousState;
  const prevEffective = prev?.effectiveState ?? effectiveState;
  const candidateSince = prev?.candidateState === candidateState ? (prev.candidateSince ?? evaluatedAt) : evaluatedAt;
  const effectiveSince = effectiveState !== prevEffective ? evaluatedAt : (prev?.effectiveSince ?? evaluatedAt);
  const consecutiveEvals = prev?.candidateState === candidateState ? ((prev.consecutiveEvals ?? 0) + 1) : 1;

  if (prevEffective !== effectiveState) {
    console.info(
      "[SESSION_HEALTH]",
      `${prevEffective} -> ${effectiveState}`,
      `\nliveNorm: ${metrics.liveFeeAdjustedNormTotal?.toFixed(4)}`,
      `netNorm: ${metrics.netFeeAdjustedNormTotal?.toFixed(4)}`,
    );
  }

  return {
    version: SESSION_HEALTH_VERSION,
    evaluatedAt,

    candidateState,
    effectiveState,
    previousState:   prevEffective,
    candidateSince,
    effectiveSince,
    consecutiveEvals,
    stateSequenceNumber: _stateSequenceNumber,
    transitionReason,

    severity: SEVERITY_MAP[effectiveState] ?? 0,
    metrics,
    axes,
    labels,
    warnings,

    deteriorating,

    recommendedPolicyMode:         policy.mode,
    recommendedThresholdDelta:     policy.thresholdDelta,
    recommendedCapacityMultiplier: policy.capacityMultiplier,
  };
}
