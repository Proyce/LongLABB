// ─── LONG RESEARCH-ONLY INVARIANT ASSERTION ───────────────────────────────────
// Call this at initialization, before every simulated trade, after shadow
// decisions are calculated, and before saved config is accepted.
// Throws immediately if any flag indicates live execution could be affected.

export function assertLongResearchOnly(config, decision) {
  const violations = [];

  if (config.entryPolicyCanAffectExecution === true)
    violations.push('entryPolicyCanAffectExecution');
  if (config.longGateCanAffectExecution === true)
    violations.push('longGateCanAffectExecution');
  if (config.longAesCanAffectExecution === true)
    violations.push('longAesCanAffectExecution');
  if (config.longAuditCanAffectExecution === true)
    violations.push('longAuditCanAffectExecution');
  if (config.longMarketContextCanAffectExecution === true)
    violations.push('longMarketContextCanAffectExecution');
  if (config.longMarketBreadthCanAffectExecution === true)
    violations.push('longMarketBreadthCanAffectExecution');
  if (config.longRunnerCanAffectExecution === true)
    violations.push('longRunnerCanAffectExecution');
  if (config.longPostFee10CanAffectExecution === true)
    violations.push('longPostFee10CanAffectExecution');

  if (violations.length > 0) {
    throw new Error(
      `LongLAB research-only invariant violated: ${violations.join(', ')}`
    );
  }

  if (decision) {
    decision.executionApplied = false;
    decision.canAffectExecution = false;
    decision.logOnly = true;
  }

  return true;
}

export const LONG_RESEARCH_ONLY_CONFIG = Object.freeze({
  entryPolicyMode:                        'SHADOW_ONLY',
  entryPolicyCanAffectExecution:          false,
  entryPolicyExecutionApplied:            false,
  longGateCanAffectExecution:             false,
  longAesCanAffectExecution:              false,
  longAuditCanAffectExecution:            false,
  longMarketContextCanAffectExecution:    false,
  longMarketBreadthCanAffectExecution:    false,
  longRunnerCanAffectExecution:           false,
  longPostFee10CanAffectExecution:        false,
});
