function pipeSep(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.map(x => String(x).replace(/\|/g, " ")).join("|");
}

export function flattenEntryPolicy(result) {
  if (!result) return ENTRY_POLICY_DEFAULTS;
  return {
    entryPolicyVersion:          result.entryPolicyVersion ?? null,
    entryPolicyEvaluatedAt:      result.entryPolicyEvaluatedAt ?? null,
    entryPolicyMode:             result.entryPolicyMode ?? null,
    entryPolicyDiagnosticDecision: result.entryPolicyDiagnosticDecision ?? result.entryPolicyShadowDecision ?? null,
    entryPolicyDiagnosticAction:   result.entryPolicyDiagnosticAction ?? null,
    entryPolicyQualityTier:        result.entryPolicyQualityTier ?? null,
    entryPolicyPrimaryReason:    result.entryPolicyPrimaryReason ?? null,
    entryPolicyReasons:          result.entryPolicyReasons ?? [],
    entryPolicyEvaluationStatus: result.entryPolicyEvaluationStatus ?? "INCOMPLETE",
    entryPolicyWouldAllow:       result.entryPolicyWouldAllow ?? null,
    entryPolicyWouldBlock:       result.entryPolicyWouldBlock ?? null,
    entryPolicyExecutionApplied: false,
    entryPolicyRequiredAes:      result.entryPolicyRequiredAes ?? null,
    entryPolicyAesGap:           result.entryPolicyAesGap ?? null,
    entryPolicyMarketSeverity:   result.entryPolicyMarketSeverity ?? 0,
    entryPolicySessionSeverity:  result.entryPolicySessionSeverity ?? 0,
    entryPolicyContextAgeMs:     result.entryPolicyContextAgeMs ?? null,
    entryPolicyEvaluationTiming: result.entryPolicyEvaluationTiming ?? "POST_CREATE_RETROFIT",
    entryPolicyAtEntry:          result,
  };
}

export function flattenAdaptiveAes(result) {
  if (!result) return ADAPTIVE_AES_DEFAULTS;
  return {
    absoluteEntryBaseScore:                   result.absoluteEntryBaseScore ?? null,
    absoluteEntryMarketAdjustment:            result.absoluteEntryMarketAdjustment ?? null,
    absoluteEntryAdaptiveScore:               result.absoluteEntryAdaptiveScore ?? null,
    absoluteEntryRequiredScore:               result.absoluteEntryRequiredScore ?? null,
    absoluteEntryAesGap:                      result.absoluteEntryAesGap ?? null,
    absoluteEntryMarketAdjustmentContributions: result.absoluteEntryMarketAdjustmentContributions ?? [],
    absoluteEntryMarketAdjustmentPenalties:   result.absoluteEntryMarketAdjustmentPenalties ?? [],
    absoluteEntryMarketAdjustmentVersion:     result.absoluteEntryMarketAdjustmentVersion ?? null,
    absoluteEntryWouldPassAdaptive:           result.absoluteEntryWouldPassAdaptive ?? null,
    absoluteEntryAdaptiveStatus:              result.absoluteEntryAdaptiveStatus ?? "INCOMPLETE",
  };
}

export const ENTRY_POLICY_DEFAULTS = {
  entryPolicyVersion:          null,
  entryPolicyEvaluatedAt:      null,
  entryPolicyMode:             null,
  entryPolicyDiagnosticDecision: null,
  entryPolicyDiagnosticAction:   null,
  entryPolicyQualityTier:        null,
  entryPolicyPrimaryReason:    null,
  entryPolicyReasons:          [],
  entryPolicyEvaluationStatus: "INCOMPLETE",
  entryPolicyWouldAllow:       null,
  entryPolicyWouldBlock:       null,
  entryPolicyExecutionApplied: false,
  entryPolicyRequiredAes:      null,
  entryPolicyAesGap:           null,
  entryPolicyMarketSeverity:   0,
  entryPolicySessionSeverity:  0,
  entryPolicyContextAgeMs:     null,
  entryPolicyEvaluationTiming: "POST_CREATE_RETROFIT",
  entryPolicyAtEntry:          null,
};

export const ADAPTIVE_AES_DEFAULTS = {
  absoluteEntryBaseScore:                   null,
  absoluteEntryMarketAdjustment:            null,
  absoluteEntryAdaptiveScore:               null,
  absoluteEntryRequiredScore:               null,
  absoluteEntryAesGap:                      null,
  absoluteEntryMarketAdjustmentContributions: [],
  absoluteEntryMarketAdjustmentPenalties:   [],
  absoluteEntryMarketAdjustmentVersion:     null,
  absoluteEntryWouldPassAdaptive:           null,
  absoluteEntryAdaptiveStatus:              "INCOMPLETE",
};

export const ENTRY_POLICY_CSV_HEADERS = [
  "entryPolicyVersion",
  "entryPolicyEvaluatedAt",
  "entryPolicyMode",
  "entryPolicyDiagnosticDecision",
  "entryPolicyDiagnosticAction",
  "entryPolicyQualityTier",
  "entryPolicyPrimaryReason",
  "entryPolicyReasons",
  "entryPolicyEvaluationStatus",
  "entryPolicyWouldAllow",
  "entryPolicyWouldBlock",
  "entryPolicyExecutionApplied",
  "entryPolicyRequiredAes",
  "entryPolicyAesGap",
  "entryPolicyEvaluationTiming",
  "absoluteEntryBaseScore",
  "absoluteEntryMarketAdjustment",
  "absoluteEntryAdaptiveScore",
  "absoluteEntryRequiredScore",
  "absoluteEntryAesGap",
  "absoluteEntryWouldPassAdaptive",
  "absoluteEntryAdaptiveStatus",
];

function c(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function entryPolicyCSVRow(s) {
  return [
    c(s.entryPolicyVersion ?? ""),
    c(s.entryPolicyEvaluatedAt ?? ""),
    c(s.entryPolicyMode ?? ""),
    c(s.entryPolicyDiagnosticDecision ?? s.entryPolicyShadowDecision ?? ""),
    c(s.entryPolicyDiagnosticAction ?? ""),
    c(s.entryPolicyQualityTier ?? ""),
    c(s.entryPolicyPrimaryReason ?? ""),
    c(pipeSep(s.entryPolicyReasons ?? [])),
    c(s.entryPolicyEvaluationStatus ?? ""),
    c(s.entryPolicyWouldAllow ?? ""),
    c(s.entryPolicyWouldBlock ?? ""),
    c(false),
    c(s.entryPolicyRequiredAes ?? ""),
    c(s.entryPolicyAesGap ?? ""),
    c(s.entryPolicyEvaluationTiming ?? ""),
    c(s.absoluteEntryBaseScore ?? ""),
    c(s.absoluteEntryMarketAdjustment ?? ""),
    c(s.absoluteEntryAdaptiveScore ?? ""),
    c(s.absoluteEntryRequiredScore ?? ""),
    c(s.absoluteEntryAesGap ?? ""),
    c(s.absoluteEntryWouldPassAdaptive ?? ""),
    c(s.absoluteEntryAdaptiveStatus ?? ""),
  ];
}
