/**
 * computeLiveExitScore — pure scoring function for the live exit audit.
 *
 * Inputs: extracted signals from extractLiveExitSignals().
 * Returns: { liveExitScore: 0-100, liveExitReasons: string[] }
 *
 * High score = trade behaving well (hold/runner).
 * Low score  = trade behaving badly (tighten/exit).
 */
export function computeLiveExitScore(signals) {
  let score = 50;
  const reasons = [];

  const {
    liveExitPostFee10LiveConfirmationScore: liveConfirm,
    liveExitRunnerCapturePotentialScore:   runnerCapture,
    liveExitRunnerScorePeak:               runnerPeak,
    liveExitMfePct:                        mfe,
    liveExitMaePct:                        mae,
    liveExitCurrentPnlPct:                 currentPnl,
    liveExitSecondsInTrade:                seconds,
    liveExitMfeGivebackPct:                giveback,
    liveExitBuyerDanger,
    liveExitLongAuditDangerNow,
    liveExitMarketBreathFlipAgainstShort,
  } = signals;

  // ── Live confirmation score ───────────────────────────────────────────────
  if (liveConfirm >= 70) {
    score += 20;
    reasons.push("LIVE_CONFIRM_STRONG");
  } else if (liveConfirm < 35) {
    score -= 20;
    reasons.push("LIVE_CONFIRM_WEAK");
  }

  // ── Runner capture score ──────────────────────────────────────────────────
  if (runnerCapture >= 40) {
    score += 20;
    reasons.push("RUNNER_CAPTURE_STRONG");
  } else if (runnerCapture < 15) {
    score -= 15;
    reasons.push("RUNNER_CAPTURE_WEAK");
  }

  // ── Runner score peak ─────────────────────────────────────────────────────
  if (runnerPeak >= 40) {
    score += 10;
    reasons.push("RUNNER_PEAK_PRESENT");
  }

  // ── Proven profit ─────────────────────────────────────────────────────────
  if (mfe >= 1.0 && currentPnl > 0) {
    score += 10;
    reasons.push("TRADE_HAS_PROVEN_PROFIT");
  }

  // ── No profit proof after time ────────────────────────────────────────────
  if (seconds >= 45 && mfe < 0.35 && currentPnl <= 0) {
    score -= 20;
    reasons.push("NO_PROFIT_PROOF_AFTER_TIME");
  }

  // ── MAE growing badly (mae is negative when adverse) ─────────────────────
  if (mae <= -0.7 && currentPnl < 0) {
    score -= 20;
    reasons.push("MAE_GROWING_BADLY");
  }

  // ── MFE giveback warning ──────────────────────────────────────────────────
  if (giveback >= 0.8 && currentPnl > 0) {
    score -= 15;
    reasons.push("MFE_GIVEBACK_WARNING");
  }

  // ── Buyer danger ──────────────────────────────────────────────────────────
  if (liveExitBuyerDanger === true) {
    score -= 30;
    reasons.push("BUYER_DANGER_RETURNED");
  }

  // ── Long audit danger ─────────────────────────────────────────────────────
  if (liveExitLongAuditDangerNow === true) {
    score -= 25;
    reasons.push("LONG_AUDIT_DANGER_AFTER_ENTRY");
  }

  // ── Market breath flipped against longs ──────────────────────────────────
  if (liveExitMarketBreathFlipAgainstShort === true) {
    score -= 20;
    reasons.push("MARKET_BREATH_FLIPPED_AGAINST_LONG");
  }

  const liveExitScore = Math.max(0, Math.min(100, Math.round(score)));

  return { liveExitScore, liveExitReasons: reasons };
}
