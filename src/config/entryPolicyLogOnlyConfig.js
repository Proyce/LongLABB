export const ENTRY_POLICY_LOG_ONLY_CONFIG = {
  version: "entry-policy-v2-log-only-2026-06",

  mode: "SHADOW_ONLY",

  allowExecutionImpact: false,

  canBlockEntries: false,
  canSkipCandidates: false,
  canReduceCapacity: false,
  canForceSniperOnly: false,
  canChangeLeverage: false,
  canChangeExitProfile: false,
  canCloseTrades: false,
  canPauseBot: false,

  logPolicyDecision: true,
  logWouldAllow: true,
  logWouldBlock: true,
  logWouldReduceCapacity: true,
  logWouldSniperOnly: true,
  logWouldHardBlock: true,
  logWouldWarn: true,

  exportDiagnostics: true,
  showDiagnosticsInUi: true,

  entryPolicyExecutionApplied: false,
};

if (ENTRY_POLICY_LOG_ONLY_CONFIG.allowExecutionImpact === true) {
  throw new Error(
    "[ENTRY_POLICY] Unsafe config: log-only policy cannot affect execution."
  );
}

export function assertLogOnlyMode() {
  if (ENTRY_POLICY_LOG_ONLY_CONFIG.allowExecutionImpact === true) {
    throw new Error(
      "[ENTRY_POLICY] Unsafe config: log-only policy cannot affect execution."
    );
  }
}
