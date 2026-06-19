function pipeSep(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.map(x => String(x).replace(/\|/g, " ")).join("|");
}

function c(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function flattenEntryPolicyLogOnly(candidate) {
  if (!candidate) return _defaults();
  return {
    // V2 policy
    entryPolicyVersion:               candidate.entryPolicyVersion               ?? null,
    entryPolicyMode:                  candidate.entryPolicyMode                  ?? null,
    entryPolicyEvaluatedAt:           candidate.entryPolicyEvaluatedAt           ?? null,
    entryPolicyDiagnosticDecision:    candidate.entryPolicyDiagnosticDecision    ?? null,
    entryPolicyDiagnosticAction:      candidate.entryPolicyDiagnosticAction      ?? null,
    entryPolicyWouldAllow:            candidate.entryPolicyWouldAllow            ?? false,
    entryPolicyWouldBlock:            candidate.entryPolicyWouldBlock            ?? false,
    entryPolicyWouldReduceCapacity:   candidate.entryPolicyWouldReduceCapacity   ?? false,
    entryPolicyWouldSniperOnly:       candidate.entryPolicyWouldSniperOnly       ?? false,
    entryPolicyWouldHardBlock:        candidate.entryPolicyWouldHardBlock        ?? false,
    entryPolicyWouldWarn:             candidate.entryPolicyWouldWarn             ?? false,
    entryPolicyPrimaryReason:         candidate.entryPolicyPrimaryReason         ?? null,
    entryPolicyReasons:               candidate.entryPolicyReasons               ?? [],
    entryPolicyRequiredAes:           candidate.entryPolicyRequiredAes           ?? null,
    entryPolicyAesGap:                candidate.entryPolicyAesGap                ?? null,
    entryPolicyQualityTier:           candidate.entryPolicyQualityTier           ?? null,
    entryPolicyExecutionApplied:      false,   // hardcoded
    entryPolicyCanAffectExecution:    false,   // hardcoded

    // Long audit
    longAuditDangerScore:    candidate.longAuditDangerScore    ?? null,
    longAuditDangerLabel:    candidate.longAuditDangerLabel    ?? null,
    longAuditWouldBlock:     candidate.longAuditWouldBlock     ?? false,
    longAuditWouldHardBlock: candidate.longAuditWouldHardBlock ?? false,
    longAuditReasons:        candidate.longAuditReasons        ?? [],

    // Market breath
    marketBreathScore:              candidate.marketBreathScore              ?? null,
    marketBreathLabel:              candidate.marketBreathLabel              ?? null,
    marketBreathWouldBlock:         candidate.marketBreathWouldBlock         ?? false,
    marketBreathWouldReduceCapacity: candidate.marketBreathWouldReduceCapacity ?? false,
    marketBreathReasons:            candidate.marketBreathReasons            ?? [],

    // Sniper gate
    sniperShortGateVersion:  candidate.sniperShortGateVersion  ?? null,
    sniperShortWouldPass:    candidate.sniperShortWouldPass    ?? false,
    sniperShortTier:         candidate.sniperShortTier         ?? null,
    sniperShortReasons:      candidate.sniperShortReasons      ?? [],
    sniperShortFailReasons:  candidate.sniperShortFailReasons  ?? [],

    // Gainer gate
    gainerDiagnosticGatePass:        candidate.gainerDiagnosticGatePass        ?? false,
    gainerDiagnosticSniperWouldPass: candidate.gainerDiagnosticSniperWouldPass ?? false,
    gainerDiagnosticGateReasons:     candidate.gainerDiagnosticGateReasons     ?? [],

    // Loser gate
    loserDiagnosticGatePass:        candidate.loserDiagnosticGatePass        ?? false,
    loserDiagnosticSniperWouldPass: candidate.loserDiagnosticSniperWouldPass ?? false,
    loserDiagnosticGateReasons:     candidate.loserDiagnosticGateReasons     ?? [],

    // Execution rank
    executionRankScore:   candidate.executionRankScore   ?? null,
    executionRankTier:    candidate.executionRankTier    ?? null,
    executionRankReasons: candidate.executionRankReasons ?? [],
    executionRankLogOnly: true,  // hardcoded

    // Exit-only safety flags
    runnerCaptureEntrySafe:            false,  // hardcoded
    postFee10LiveConfirmationEntrySafe: false,  // hardcoded
  };
}

function _defaults() {
  return {
    entryPolicyVersion: null, entryPolicyMode: null, entryPolicyEvaluatedAt: null,
    entryPolicyDiagnosticDecision: null, entryPolicyDiagnosticAction: null,
    entryPolicyWouldAllow: false, entryPolicyWouldBlock: false,
    entryPolicyWouldReduceCapacity: false, entryPolicyWouldSniperOnly: false,
    entryPolicyWouldHardBlock: false, entryPolicyWouldWarn: false,
    entryPolicyPrimaryReason: null, entryPolicyReasons: [],
    entryPolicyRequiredAes: null, entryPolicyAesGap: null,
    entryPolicyQualityTier: null,
    entryPolicyExecutionApplied: false, entryPolicyCanAffectExecution: false,
    longAuditDangerScore: null, longAuditDangerLabel: null,
    longAuditWouldBlock: false, longAuditWouldHardBlock: false, longAuditReasons: [],
    marketBreathScore: null, marketBreathLabel: null,
    marketBreathWouldBlock: false, marketBreathWouldReduceCapacity: false, marketBreathReasons: [],
    sniperShortGateVersion: null, sniperShortWouldPass: false, sniperShortTier: null,
    sniperShortReasons: [], sniperShortFailReasons: [],
    gainerDiagnosticGatePass: false, gainerDiagnosticSniperWouldPass: false, gainerDiagnosticGateReasons: [],
    loserDiagnosticGatePass: false, loserDiagnosticSniperWouldPass: false, loserDiagnosticGateReasons: [],
    executionRankScore: null, executionRankTier: null, executionRankReasons: [], executionRankLogOnly: true,
    runnerCaptureEntrySafe: false, postFee10LiveConfirmationEntrySafe: false,
  };
}

export const ENTRY_POLICY_V2_CSV_HEADERS = [
  "entryPolicyVersion",
  "entryPolicyMode",
  "entryPolicyEvaluatedAt",
  "entryPolicyDiagnosticDecision",
  "entryPolicyDiagnosticAction",
  "entryPolicyWouldAllow",
  "entryPolicyWouldBlock",
  "entryPolicyWouldReduceCapacity",
  "entryPolicyWouldSniperOnly",
  "entryPolicyWouldHardBlock",
  "entryPolicyWouldWarn",
  "entryPolicyPrimaryReason",
  "entryPolicyReasons",
  "entryPolicyRequiredAes",
  "entryPolicyAesGap",
  "entryPolicyQualityTier",
  "entryPolicyExecutionApplied",
  "entryPolicyCanAffectExecution",
  "longAuditDangerScore",
  "longAuditDangerLabel",
  "longAuditWouldBlock",
  "longAuditWouldHardBlock",
  "longAuditReasons",
  "marketBreathScore",
  "marketBreathLabel",
  "marketBreathWouldBlock",
  "marketBreathWouldReduceCapacity",
  "marketBreathReasons",
  "sniperShortGateVersion",
  "sniperShortWouldPass",
  "sniperShortTier",
  "sniperShortReasons",
  "sniperShortFailReasons",
  "gainerDiagnosticGatePass",
  "gainerDiagnosticSniperWouldPass",
  "gainerDiagnosticGateReasons",
  "loserDiagnosticGatePass",
  "loserDiagnosticSniperWouldPass",
  "loserDiagnosticGateReasons",
  "executionRankScore",
  "executionRankTier",
  "executionRankReasons",
  "executionRankLogOnly",
  "runnerCaptureEntrySafe",
  "postFee10LiveConfirmationEntrySafe",
];

export function entryPolicyLogOnlyCSVRow(flat) {
  return ENTRY_POLICY_V2_CSV_HEADERS.map(key => {
    const v = flat[key];
    if (Array.isArray(v)) return c(pipeSep(v));
    if (key === "entryPolicyExecutionApplied" || key === "entryPolicyCanAffectExecution")
      return c(false);
    if (key === "executionRankLogOnly" || key === "runnerCaptureEntrySafe" || key === "postFee10LiveConfirmationEntrySafe")
      return c(key === "executionRankLogOnly" ? true : false);
    return c(v);
  });
}
