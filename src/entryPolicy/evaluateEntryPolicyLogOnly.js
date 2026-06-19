import { ENTRY_POLICY_LOG_ONLY_CONFIG } from "../config/entryPolicyLogOnlyConfig.js";
import {
  DIAGNOSTIC_ENTRY_POLICY_DECISION,
  DIAGNOSTIC_ENTRY_POLICY_ACTION,
} from "./diagnosticEntryPolicyTypes.js";

// Long-native entry policy gate — LOG_ONLY.
// Rewards long evidence; does NOT penalize bullish CVD or green impulse.
export function evaluateEntryPolicyLogOnly(candidate) {
  const reasons = [];

  const firstFinite = (...values) => values.map(Number).find(Number.isFinite);
  const aes = firstFinite(
    candidate.absoluteEntryAdaptiveScore,
    candidate.longAdaptiveAesScore,
    candidate.longAesScore,
    candidate.absoluteEntryScore,
  );
  const requiredAes = firstFinite(
    candidate.absoluteEntryRequiredScore,
    candidate.longAdaptiveAesRequiredScore,
    candidate.requiredAdaptiveAes,
    73,
  );
  const qualityInputsComplete = Number.isFinite(aes) && Number.isFinite(requiredAes);
  const aesGap = qualityInputsComplete ? aes - requiredAes : null;

  // Danger: immediate red impulse (falling-knife for a long)
  const fallingKnifeRed =
    candidate.immediateRedImpulse === true &&
    candidate.last3TicksDirection === "DOWN" &&
    (candidate.preEntryFavorableMovePct ?? 0) < 0.1;

  // Green impulse is FAVORABLE for longs — not a block signal
  const greenPresent =
    candidate.immediateGreenImpulse === true ||
    candidate.greenImpulseDetected === true;

  // CVD BULL is FAVORABLE for longs — not a block signal
  const cvdBullish =
    candidate.cvdLabel === "BULL" ||
    candidate.cvdLabel === "BULLISH";

  // Long-native audit signals
  const longAuditDanger =
    candidate.longAuditDanger === true ||
    candidate.longAuditDangerLabel === "LONG_AUDIT_DANGER" ||
    candidate.longAuditDangerLabel === "LONG_AUDIT_HARD_DANGER" ||
    candidate.longAuditWouldBlock === true;

  const longMarketBreadthDanger =
    candidate.longMarketBreadthDanger === true ||
    candidate.longMarketBreadthLabel === 'LONG_BREADTH_HOSTILE' ||
    candidate.longMarketBreadthLabel === 'LONG_BREADTH_HARD_DANGER' ||
    candidate.longMarketBreadthLabel === 'LONG_BREADTH_STALE' ||
    // Legacy fallback: records computed before LONG_BREADTH migration may still have old labels
    (candidate.marketBreathLabel != null && (
      candidate.marketBreathLabel.endsWith('BOUNCE_TRAP_RISK') ||
      candidate.marketBreathLabel.endsWith('HARD_DANGER')
    ));

  // Long market headwind block
  const longMarketBlock =
    candidate.crossMarketLongBiasLabel === "STRONG_LONG_HEADWIND" ||
    candidate.crossMarketLongBiasLabel === "LONG_CONTEXT_STALE";

  const staleContext =
    candidate.btcContextStale === true ||
    candidate.marketContextStale === true ||
    candidate.contextStale === true ||
    longMarketBlock;

  const invalidTelemetry =
    candidate.invalidTelemetry === true ||
    candidate.hasRequiredTelemetry === false;

  // ATR sanity check
  const atrActive =
    Number(candidate.atrPct ?? 0) >= 0.2 ||
    candidate.atrActive === true;

  const qualityOk = qualityInputsComplete ? aes >= requiredAes : false;

  // Core pass: quality ok, no hard blockers, no falling knife for long
  const corePass =
    qualityInputsComplete &&
    qualityOk &&
    !fallingKnifeRed &&
    !longAuditDanger &&
    !longMarketBreadthDanger &&
    !staleContext &&
    !invalidTelemetry &&
    atrActive;

  if (!qualityInputsComplete) reasons.push("ADAPTIVE_AES_INCOMPLETE");
  if (invalidTelemetry)        reasons.push("WOULD_BLOCK_INVALID_TELEMETRY");
  if (staleContext)            reasons.push("WOULD_BLOCK_STALE_CONTEXT");
  if (fallingKnifeRed)         reasons.push("WOULD_BLOCK_FALLING_KNIFE_RED");
  if (longAuditDanger)         reasons.push("WOULD_BLOCK_LONG_AUDIT_DANGER");
  if (longMarketBreadthDanger) reasons.push("WOULD_BLOCK_LONG_MARKET_BREADTH_DANGER");
  if (!qualityOk)         reasons.push("WOULD_BLOCK_LOW_QUALITY");
  if (!atrActive)         reasons.push("ATR_NOT_ACTIVE");
  if (cvdBullish)         reasons.push("CVD_BULL_FAVORABLE");
  if (greenPresent)       reasons.push("GREEN_IMPULSE_FAVORABLE");

  let decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_ALLOW_FULL;
  let action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_EXECUTE;

  if (invalidTelemetry) {
    decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_BLOCK_INVALID_TELEMETRY;
    action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_SKIP_ENTRY;
  } else if (staleContext) {
    decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_BLOCK_STALE_CONTEXT;
    action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_SKIP_ENTRY;
  } else if (fallingKnifeRed) {
    decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_BLOCK_GREEN_DANGER ?? "WOULD_BLOCK_FALLING_KNIFE";
    action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_SKIP_ENTRY;
  } else if (longAuditDanger) {
    decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_BLOCK_LONG_AUDIT_DANGER;
    action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_SKIP_ENTRY;
  } else if (longMarketBreadthDanger) {
    decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_BLOCK_MARKET_BREATH_DANGER;
    action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_SKIP_ENTRY;
  } else if (!qualityOk) {
    decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_BLOCK_LOW_QUALITY;
    action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_SKIP_ENTRY;
  } else if (candidate.sniperLongWouldPass === true) {
    decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_SNIPER_ONLY ?? "WOULD_SNIPER_LONG_ONLY";
    action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_EXECUTE_SNIPER_ONLY;
  } else if (aes < 80) {
    decision = DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_ALLOW_REDUCED;
    action   = DIAGNOSTIC_ENTRY_POLICY_ACTION.LOG_WOULD_EXECUTE_REDUCED;
  }

  const wouldWarn = corePass && reasons.some(r => r.startsWith("WOULD_BLOCK"));

  return {
    entryPolicyVersion:    ENTRY_POLICY_LOG_ONLY_CONFIG.version,
    entryPolicyMode:       ENTRY_POLICY_LOG_ONLY_CONFIG.mode,
    entryPolicyEvaluatedAt: new Date().toISOString(),

    entryPolicyEvaluationStatus: qualityInputsComplete ? "COMPLETE" : "INCOMPLETE",
    entryPolicyWouldAllow:  qualityInputsComplete ? corePass : null,
    entryPolicyWouldBlock:  qualityInputsComplete ? !corePass : null,
    entryPolicyWouldReduceCapacity:
      decision === DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_ALLOW_REDUCED,
    entryPolicyWouldSniperOnly:
      decision === (DIAGNOSTIC_ENTRY_POLICY_DECISION.WOULD_SNIPER_ONLY ?? "WOULD_SNIPER_LONG_ONLY"),
    entryPolicyWouldHardBlock: invalidTelemetry || staleContext || fallingKnifeRed,
    entryPolicyWouldWarn: wouldWarn,

    entryPolicyDiagnosticDecision: decision,
    entryPolicyDiagnosticAction:   action,

    entryPolicyPrimaryReason: reasons[0] ?? "WOULD_ALLOW",
    entryPolicyReasons:       reasons,

    entryPolicyRequiredAes: requiredAes,
    entryPolicyAesGap:      aesGap,
    entryPolicyQualityTier: qualityInputsComplete ? classifyAesTier(aes) : null,

    logOnly: true,
    entryPolicyExecutionApplied:   false,
    entryPolicyCanAffectExecution: false,
  };
}

function classifyAesTier(aes) {
  if (aes >= 95) return "AES_PRIORITY_SNIPER";
  if (aes >= 90) return "AES_SNIPER";
  if (aes >= 80) return "AES_HIGH_QUALITY";
  if (aes >= 73) return "AES_VALID";
  if (aes >= 70) return "AES_WATCH_ONLY";
  if (aes >= 50) return "AES_WEAK";
  return "AES_REJECT_DIAGNOSTIC";
}
