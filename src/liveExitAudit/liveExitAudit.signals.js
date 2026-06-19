/**
 * Extracts live exit audit signals from the current LONG trade state.
 *
 * Long semantics:
 * - CVD flips BEAR = danger (not BULL)
 * - VWAP loss = danger (not reclaim)
 * - Red impulse = danger (not green)
 * - Green impulse = continuation signal (positive)
 * - Current PnL = (currentPrice - entryPrice) / entryPrice * 100
 */
export function extractLiveExitSignals(trade) {
  const labels = trade.longRunnerCaptureLabels ?? trade.runnerCaptureLabels ?? [];

  // ── Long-native per-tick danger signals ──────────────────────────────────
  // CVD flip to BEAR = danger for a long
  const liveExitCvdFlipBearish =
    labels.includes("-CVD_BEAR") ||
    labels.includes("RUNNER_DANGER_CVD_BEAR") ||
    trade.cvdLabel === "BEAR";

  // VWAP loss = danger for a long
  const liveExitVwapLoss =
    labels.includes("-VWAP_LOSS") ||
    labels.includes("RUNNER_DANGER_VWAP_LOSS") ||
    (trade.vwapContextLabel != null && trade.vwapContextLabel.includes("BELOW_VWAP") && !trade.vwapContextLabel.includes("RECLAIM"));

  // Red impulse = danger for a long
  const liveExitRedImpulseReturn =
    labels.includes("-RED_IMPULSE") ||
    labels.includes("RUNNER_DANGER_RED_IMPULSE") ||
    trade.immediateRedImpulse === true;

  // MACD fading against a long hold
  const liveExitMacdFadeAgainstLong =
    labels.includes("-MACD_BEARISH") ||
    (trade.macdHistogramState1m != null &&
      (String(trade.macdHistogramState1m).includes("BEARISH") ||
       String(trade.macdHistogramState1m).includes("NEGATIVE_EXPANDING")));

  // RSI falling against a long hold
  const liveExitRsiFallAgainstLong =
    labels.includes("-RSI_FALLING") ||
    (trade.rsi1mDelta != null && Number(trade.rsi1mDelta) < -3);

  // ── Broader context danger signals ────────────────────────────────────────
  const liveExitLongAuditDangerNow =
    trade.longAuditWouldBlock === true || trade.longAuditWouldHardBlock === true;

  const liveExitMarketBreathFlipAgainstLong = trade.marketBreathWouldBlock === true;

  // ── Composite seller danger flag (all signals that argue against holding a long) ──
  const liveExitSellerDanger =
    liveExitCvdFlipBearish ||
    liveExitVwapLoss ||
    liveExitRedImpulseReturn ||
    liveExitMacdFadeAgainstLong ||
    liveExitRsiFallAgainstLong ||
    liveExitLongAuditDangerNow ||
    liveExitMarketBreathFlipAgainstLong;

  // Backward-compat alias (liveExitAudit.evaluate reads liveExitBuyerDanger)
  const liveExitBuyerDanger = liveExitSellerDanger;

  // ── Snapshot metrics ──────────────────────────────────────────────────────
  const mfe    = Number(trade.mfe ?? 0);
  const maePct = -(Number(trade.mae ?? 0));

  // LONG PnL: positive when price rose above entry
  const currentPnlPct =
    trade.entryPrice && trade.currentPrice
      ? (Number(trade.currentPrice) - Number(trade.entryPrice)) / Number(trade.entryPrice) * 100
      : 0;

  const secondsInTrade = trade.entryTime
    ? Math.round((Date.now() - trade.entryTime) / 1000)
    : 0;

  const mfeGivebackPct = Math.max(0, mfe - currentPnlPct);
  const mfeCapturePct  =
    mfe > 0
      ? Math.min(100, Math.max(0, Math.round((currentPnlPct / mfe) * 100)))
      : 0;

  // ── Score snapshots ───────────────────────────────────────────────────────
  const liveExitRunnerCapturePotentialScore =
    Number(trade.longRunnerCaptureScore ?? trade.runnerCapturePotentialScore ?? 0);
  const liveExitPostFee10LiveConfirmationScore =
    Number(trade.postFee10LiveConfirmationScore ?? 0);
  const liveExitRunnerScorePeak =
    Number(trade.runnerScorePeak ?? 0);

  return {
    // Long-native signal fields
    liveExitSellerDanger,
    liveExitCvdFlipBearish,
    liveExitVwapLoss,
    liveExitRedImpulseReturn,
    liveExitMacdFadeAgainstLong,
    liveExitRsiFallAgainstLong,
    liveExitLongAuditDangerNow,
    liveExitMarketBreathFlipAgainstLong,

    // Backward-compat aliases (used by evaluate.js and score.js)
    liveExitBuyerDanger,
    liveExitCvdFlipBullish:         liveExitCvdFlipBearish,
    liveExitVwapReclaim:             liveExitVwapLoss,
    liveExitGreenImpulseReturn:      liveExitRedImpulseReturn,
    liveExitMacdFadeAgainstShort:    liveExitMacdFadeAgainstLong,
    liveExitRsiRiseAgainstShort:     liveExitRsiFallAgainstLong,
    liveExitMarketBreathFlipAgainstShort: liveExitMarketBreathFlipAgainstLong,

    liveExitMfePct:         mfe,
    liveExitMaePct:         maePct,
    liveExitCurrentPnlPct:  currentPnlPct,
    liveExitSecondsInTrade: secondsInTrade,
    liveExitMfeGivebackPct: mfeGivebackPct,
    liveExitMfeCapturePct:  mfeCapturePct,

    liveExitRunnerCapturePotentialScore,
    liveExitPostFee10LiveConfirmationScore,
    liveExitRunnerScorePeak,
  };
}
