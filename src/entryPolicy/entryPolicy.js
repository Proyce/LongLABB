// Entry Policy Engine — shadow-only decision layer
import { ADAPTIVE_AES_VERSION } from "./adaptiveAes.config.js";

export const ENTRY_POLICY_VERSION = "entry-policy-v1-shadow-2026-06";

// Candidate audit log (bounded in-memory)
const MAX_AUDIT_ENTRIES = 500;
let _candidateAuditLog = [];

export function getCandidateAuditLog() {
  return [..._candidateAuditLog];
}

function addToAuditLog(entry) {
  _candidateAuditLog.push(entry);
  if (_candidateAuditLog.length > MAX_AUDIT_ENTRIES) {
    _candidateAuditLog = _candidateAuditLog.slice(-MAX_AUDIT_ENTRIES);
  }
}

// ── Policy mode from session health ──────────────────────────────────────────

function policyModeFromSession(sessionEffectiveState) {
  const map = {
    SESSION_WARMUP:               "POLICY_WARMUP",
    SESSION_FULL_PASS:            "POLICY_FULL_PASS",
    SESSION_CHECK_STRICT:         "POLICY_STRICT",
    SESSION_RECOVERY_STRICT:      "POLICY_RECOVERY_STRICT",
    SESSION_FULL_BLOCK_CANDIDATE: "POLICY_FULL_BLOCK_CANDIDATE",
    SESSION_NEUTRAL_CAUTION:      "POLICY_REDUCED_CAPACITY",
    SESSION_DATA_STALE_SAFE:      "POLICY_DATA_STALE_BLOCK_CANDIDATE",
  };
  return map[sessionEffectiveState] ?? "POLICY_WARMUP";
}

// ── Policy mode from market regime ────────────────────────────────────────────

function policyModeFromMarket(marketContext, adaptiveAesResult) {
  const freshness = marketContext?.freshnessLabel ?? "UNKNOWN";
  if (freshness === "HARD_STALE") return "POLICY_DATA_STALE_BLOCK_CANDIDATE";

  const longBias = marketContext?.crossMarket?.crossMarketLongBiasLabel ?? "LONG_CONTEXT_STALE";
  if (longBias === "LONG_CONTEXT_STALE")    return "POLICY_DATA_STALE_BLOCK_CANDIDATE";
  if (longBias === "STRONG_LONG_HEADWIND")  return "POLICY_FULL_BLOCK_CANDIDATE";
  if (longBias === "LONG_HEADWIND")         return "POLICY_STRICT";
  if (longBias === "STRONG_LONG_TAILWIND")  return "POLICY_FULL_PASS";
  if (longBias === "LONG_TAILWIND")         return "POLICY_FULL_PASS";

  if (!adaptiveAesResult?.absoluteEntryWouldPassAdaptive) return "POLICY_STRICT";

  return "POLICY_FULL_PASS";
}

// ── Strictest policy wins ─────────────────────────────────────────────────────

const POLICY_SEVERITY = {
  POLICY_FULL_PASS:                  0,
  POLICY_WARMUP:                     0,
  POLICY_REDUCED_CAPACITY:           1,
  POLICY_STRICT:                     2,
  POLICY_RECOVERY_STRICT:            2,
  POLICY_FULL_BLOCK_CANDIDATE:       4,
  POLICY_DATA_STALE_BLOCK_CANDIDATE: 4,
};

function strictestPolicy(a, b) {
  return (POLICY_SEVERITY[a] ?? 0) >= (POLICY_SEVERITY[b] ?? 0) ? a : b;
}

// ── Shadow decision ───────────────────────────────────────────────────────────

function computeShadowDecision({ policyMode, adaptiveAesResult, marketContext, sessionHealth, candidateTelemetry }) {
  const reasons = [];
  const freshness = marketContext?.freshnessLabel ?? "UNKNOWN";

  if (freshness === "HARD_STALE") {
    reasons.push("HARD_STALE_CONTEXT");
    return { primary: "SHADOW_BLOCK_STALE", reasons };
  }

  if (sessionHealth?.effectiveState === "SESSION_DATA_STALE_SAFE") {
    reasons.push("SESSION_DATA_STALE");
    return { primary: "SHADOW_BLOCK_STALE", reasons };
  }

  if (candidateTelemetry?.isInvalidMarket || candidateTelemetry?.isStale) {
    reasons.push("INVALID_CANDIDATE_TELEMETRY");
    return { primary: "SHADOW_BLOCK_INVALID_TELEMETRY", reasons };
  }

  if (policyMode === "POLICY_FULL_BLOCK_CANDIDATE") {
    if (sessionHealth?.effectiveState === "SESSION_FULL_BLOCK_CANDIDATE") {
      reasons.push("SESSION_FULL_BLOCK_CANDIDATE");
      return { primary: "SHADOW_BLOCK_SESSION", reasons };
    }
    const longBias = marketContext?.crossMarket?.crossMarketLongBiasLabel ?? "";
    if (longBias === "STRONG_LONG_HEADWIND") {
      reasons.push("STRONG_LONG_HEADWIND");
      return { primary: "SHADOW_BLOCK_MARKET", reasons };
    }
    reasons.push("COMBINED_BLOCK_CONDITION");
    return { primary: "SHADOW_BLOCK_SESSION", reasons };
  }

  if (policyMode === "POLICY_DATA_STALE_BLOCK_CANDIDATE") {
    reasons.push("STALE_CONTEXT");
    return { primary: "SHADOW_BLOCK_STALE", reasons };
  }

  if (!adaptiveAesResult?.absoluteEntryWouldPassAdaptive) {
    reasons.push(`ADAPTIVE_AES_${adaptiveAesResult?.absoluteEntryAdaptiveScore ?? "?"}_LT_REQUIRED_${adaptiveAesResult?.absoluteEntryRequiredScore ?? "?"}`);
    return { primary: "SHADOW_BLOCK_LOW_AES", reasons };
  }

  if (policyMode === "POLICY_STRICT" || policyMode === "POLICY_RECOVERY_STRICT") {
    reasons.push(`STRICT_MODE_${policyMode}`);
    return { primary: "SHADOW_ALLOW_STRICT", reasons };
  }

  if (policyMode === "POLICY_REDUCED_CAPACITY") {
    reasons.push("REDUCED_CAPACITY_SESSION");
    return { primary: "SHADOW_REDUCE_CAPACITY", reasons };
  }

  reasons.push("ALL_CHECKS_PASS");
  return { primary: "SHADOW_ALLOW", reasons };
}

// ── Main evaluator ─────────────────────────────────────────────────────────────

export function evaluateEntryPolicy({
  symbol,
  side,
  baseAes,
  adaptiveAesResult,
  marketContext,
  sessionHealth,
  candidateTelemetry,
  evaluationTiming = "POST_CREATE_RETROFIT",
  marketSnapshotId = null,
  sessionHealthSnapshotId = null,
  config = {},
}) {
  const evaluatedAt = Date.now();

  const sessionMode = policyModeFromSession(sessionHealth?.effectiveState ?? "SESSION_WARMUP");
  const marketMode  = policyModeFromMarket(marketContext, adaptiveAesResult);
  const finalMode   = strictestPolicy(sessionMode, marketMode);

  const { primary: shadowDecision, reasons } = computeShadowDecision({
    policyMode:        finalMode,
    adaptiveAesResult,
    marketContext,
    sessionHealth,
    candidateTelemetry,
  });

  const wouldAllow = shadowDecision === "SHADOW_ALLOW" || shadowDecision === "SHADOW_ALLOW_STRICT" || shadowDecision === "SHADOW_REDUCE_CAPACITY";
  const wouldBlock = !wouldAllow;

  const contextAgeMs = marketContext?.computedAt ? (evaluatedAt - marketContext.computedAt) : null;

  const result = {
    entryPolicyVersion:       ENTRY_POLICY_VERSION,
    entryPolicyEvaluatedAt:   evaluatedAt,
    entryPolicyMode:          finalMode,
    entryPolicyShadowDecision: shadowDecision,
    entryPolicyPrimaryReason:  reasons[0] ?? "UNKNOWN",
    entryPolicyReasons:        reasons,
    entryPolicyWouldAllow:     wouldAllow,
    entryPolicyWouldBlock:     wouldBlock,
    entryPolicyExecutionApplied: false, // ALWAYS false in this release
    entryPolicyRequiredAes:    adaptiveAesResult?.absoluteEntryRequiredScore ?? null,
    entryPolicyAesGap:         adaptiveAesResult?.absoluteEntryAesGap ?? null,
    entryPolicyMarketSeverity: POLICY_SEVERITY[marketMode] ?? 0,
    entryPolicySessionSeverity: POLICY_SEVERITY[sessionMode] ?? 0,
    entryPolicyContextAgeMs:   contextAgeMs,
    entryPolicyEvaluationTiming: evaluationTiming,
    marketSnapshotId,
    sessionHealthSnapshotId,
  };

  // Candidate audit entry
  const auditEntry = {
    candidateId:            `${symbol}_${evaluatedAt}`,
    symbol,
    side,
    evaluatedAt,
    baseAes,
    adaptiveAes:            adaptiveAesResult?.absoluteEntryAdaptiveScore ?? null,
    requiredAes:            adaptiveAesResult?.absoluteEntryRequiredScore ?? null,
    shadowDecision,
    reasons,
    marketSnapshotId,
    sessionHealthSnapshotId,
  };
  addToAuditLog(auditEntry);

  return result;
}
