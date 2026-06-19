function pipeSep(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.map(x => String(x).replace(/\|/g, " ")).join("|");
}

export function flattenSessionHealth(snapshot) {
  if (!snapshot) return SESSION_HEALTH_DEFAULTS;
  return {
    sessionHealthSnapshotId:          snapshot.evaluatedAt ?? null,
    sessionHealthVersion:             snapshot.version ?? null,
    sessionHealthState:               snapshot.effectiveState ?? "UNKNOWN",
    sessionHealthCandidateState:      snapshot.candidateState ?? "UNKNOWN",
    sessionHealthSeverity:            snapshot.severity ?? 0,
    sessionHealthTransitionReason:    snapshot.transitionReason ?? null,
    sessionLiveFeeAdjustedNormTotal:  snapshot.metrics?.liveFeeAdjustedNormTotal ?? null,
    sessionRealizedFeeAdjustedNormTotal: snapshot.metrics?.realizedFeeAdjustedNormTotal ?? null,
    sessionNetFeeAdjustedNormTotal:   snapshot.metrics?.netFeeAdjustedNormTotal ?? null,
    sessionRecentExpectancy:          snapshot.metrics?.recentExpectancy ?? null,
    sessionRecentWinRate:             snapshot.metrics?.recentWinRateAfterFees ?? null,
    sessionRecentSlRate:              snapshot.metrics?.recentSlRate ?? null,
    sessionConsecutiveLosses:         snapshot.metrics?.consecutiveLosses ?? null,
    sessionHealthAtEntry:             snapshot,
  };
}

export const SESSION_HEALTH_DEFAULTS = {
  sessionHealthSnapshotId:             null,
  sessionHealthVersion:                null,
  sessionHealthState:                  "SESSION_WARMUP",
  sessionHealthCandidateState:         "SESSION_WARMUP",
  sessionHealthSeverity:               0,
  sessionHealthTransitionReason:       null,
  sessionLiveFeeAdjustedNormTotal:     null,
  sessionRealizedFeeAdjustedNormTotal: null,
  sessionNetFeeAdjustedNormTotal:      null,
  sessionRecentExpectancy:             null,
  sessionRecentWinRate:                null,
  sessionRecentSlRate:                 null,
  sessionConsecutiveLosses:            null,
  sessionHealthAtEntry:                null,
};

export const SESSION_HEALTH_CSV_HEADERS = [
  "sessionHealthSnapshotId",
  "sessionHealthVersion",
  "sessionHealthState",
  "sessionHealthCandidateState",
  "sessionHealthSeverity",
  "sessionHealthTransitionReason",
  "sessionLiveFeeAdjustedNormTotal",
  "sessionRealizedFeeAdjustedNormTotal",
  "sessionNetFeeAdjustedNormTotal",
  "sessionRecentExpectancy",
  "sessionRecentWinRate",
  "sessionRecentSlRate",
  "sessionConsecutiveLosses",
];

function c(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function sessionHealthCSVRow(s) {
  return [
    c(s.sessionHealthSnapshotId ?? ""),
    c(s.sessionHealthVersion ?? ""),
    c(s.sessionHealthState ?? ""),
    c(s.sessionHealthCandidateState ?? ""),
    c(s.sessionHealthSeverity ?? ""),
    c(s.sessionHealthTransitionReason ?? ""),
    c(s.sessionLiveFeeAdjustedNormTotal ?? ""),
    c(s.sessionRealizedFeeAdjustedNormTotal ?? ""),
    c(s.sessionNetFeeAdjustedNormTotal ?? ""),
    c(s.sessionRecentExpectancy ?? ""),
    c(s.sessionRecentWinRate ?? ""),
    c(s.sessionRecentSlRate ?? ""),
    c(s.sessionConsecutiveLosses ?? ""),
  ];
}
