import { LIVE_EXIT_AUDIT_VERSION, LIVE_EXIT_AUDIT_LABEL } from "./liveExitAudit.config.js";
import { extractLiveExitSignals } from "./liveExitAudit.signals.js";
import { computeLiveExitScore } from "./liveExitAudit.score.js";

/**
 * evaluateLiveExitAudit — main live exit audit function.
 *
 * Reads existing trade state (runnerCaptureLabels, postFee10 score, etc.)
 * and returns a fully flat log-only result.
 *
 * SAFETY INVARIANT: liveExitAuditExecutionApplied and liveExitAuditCanAffectExecution
 * are always false. No exit profile, profit lock, SL, TP, or close state is read or written.
 *
 * @param {object} trade - Active trade object with up-to-date live scores merged in.
 * @returns {object} Flat log-only audit result — safe to spread into trade state.
 */
export function evaluateLiveExitAudit(trade) {
  const signals = extractLiveExitSignals(trade);
  const { liveExitScore, liveExitReasons } = computeLiveExitScore(signals);

  const {
    liveExitCurrentPnlPct: currentPnl,
    liveExitMfePct:        mfe,
    liveExitSecondsInTrade: seconds,
    liveExitRunnerCapturePotentialScore: runnerCapture,
    liveExitBuyerDanger,
  } = signals;

  // ── Decision logic (log-only, no execution impact) ────────────────────────
  let label = LIVE_EXIT_AUDIT_LABEL.WOULD_HOLD;
  let recommendedProfile = "NORMAL";

  if (seconds < 20 && liveExitBuyerDanger !== true) {
    label = LIVE_EXIT_AUDIT_LABEL.WOULD_WAIT_FOR_MIN_TIME;
    recommendedProfile = "NORMAL";
  } else if (
    liveExitScore >= 75 &&
    runnerCapture >= 40 &&
    liveExitBuyerDanger !== true
  ) {
    label = LIVE_EXIT_AUDIT_LABEL.WOULD_ALLOW_RUNNER;
    recommendedProfile = "RUNNER";
  } else if (
    // Emergency checked before tighten — score < 20 with active danger and loss is most severe
    liveExitScore < 20 &&
    liveExitBuyerDanger === true &&
    currentPnl < 0
  ) {
    label = LIVE_EXIT_AUDIT_LABEL.WOULD_EMERGENCY_EXIT;
    recommendedProfile = "EMERGENCY_EXIT";
  } else if (
    liveExitScore < 30 &&
    seconds >= 45 &&
    currentPnl <= 0
  ) {
    label = LIVE_EXIT_AUDIT_LABEL.WOULD_FAST_EXIT;
    recommendedProfile = "FAST_EXIT";
  } else if (
    currentPnl > 0 &&
    mfe >= 1.0 &&
    liveExitScore < 55
  ) {
    label = LIVE_EXIT_AUDIT_LABEL.WOULD_PROTECT_PROFIT;
    recommendedProfile = "SAFE";
  } else if (
    liveExitScore < 45 &&
    liveExitBuyerDanger === true
  ) {
    label = LIVE_EXIT_AUDIT_LABEL.WOULD_TIGHTEN;
    recommendedProfile = "FAST";
  }

  return {
    liveExitAuditVersion:   LIVE_EXIT_AUDIT_VERSION,
    liveExitAuditMode:      "LOG_ONLY",
    liveExitAuditEvaluatedAt: new Date().toISOString(),

    liveExitScore,
    liveExitLabel: label,

    liveExitWouldHold:           label === LIVE_EXIT_AUDIT_LABEL.WOULD_HOLD,
    liveExitWouldTighten:        label === LIVE_EXIT_AUDIT_LABEL.WOULD_TIGHTEN,
    liveExitWouldFastExit:       label === LIVE_EXIT_AUDIT_LABEL.WOULD_FAST_EXIT,
    liveExitWouldEmergencyExit:  label === LIVE_EXIT_AUDIT_LABEL.WOULD_EMERGENCY_EXIT,
    liveExitWouldProtectProfit:  label === LIVE_EXIT_AUDIT_LABEL.WOULD_PROTECT_PROFIT,
    liveExitWouldAllowRunner:    label === LIVE_EXIT_AUDIT_LABEL.WOULD_ALLOW_RUNNER,

    liveExitPrimaryReason: liveExitReasons[0] ?? "NO_MAJOR_EXIT_SIGNAL",
    liveExitReasons,

    liveExitRecommendedProfileLogOnly: recommendedProfile,

    // ── Safety invariants — always false ─────────────────────────────────────
    liveExitAuditExecutionApplied:    false,
    liveExitAuditCanAffectExecution:  false,

    // ── Snapshot signals (flattened for export/UI) ────────────────────────────
    ...signals,
  };
}
