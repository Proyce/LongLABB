// Native Long Runner Capture Audit — LOG_ONLY
// Evaluates whether an active LONG trade shows continuation evidence.
// CVD BULL = positive, green impulse = positive, VWAP hold = positive.
// Replaces short-oriented computeRunnerCapturePotential for primary long fields.

export const LONG_RUNNER_CAPTURE_VERSION = "long-runner-capture-v1.0.0";

export function computeLongRunnerCaptureAudit(sample) {
  const positiveSignals = [];
  const dangerSignals = [];
  let score = 50;

  // Price above entry
  const entryPrice = Number(sample?.entryPrice ?? 0);
  const currentPrice = Number(sample?.currentPrice ?? entryPrice);
  if (entryPrice > 0 && currentPrice > entryPrice) {
    positiveSignals.push("PRICE_ABOVE_ENTRY");
    score += 10;
  }

  // CVD
  const cvd = (sample?.cvdLabel ?? sample?.currentCvdLabel ?? "").toUpperCase();
  if (cvd === "BULL" || cvd === "BULL_STRONG") {
    positiveSignals.push("CVD_BULL");
    score += 8;
  } else if (cvd === "BEAR" || cvd === "BEAR_STRONG") {
    dangerSignals.push("CVD_BEAR");
    score -= 10;
  }

  // Impulse direction
  const green = sample?.immediateGreenImpulse === true || sample?.greenImpulseDetected === true;
  const red   = sample?.immediateRedImpulse   === true || sample?.redImpulseDetected   === true;
  if (green && !red) { positiveSignals.push("GREEN_IMPULSE"); score += 8; }
  if (red)           { dangerSignals.push("RED_IMPULSE");     score -= 12; }

  // VWAP context
  const vwap = (sample?.vwapContextLabel ?? sample?.currentVwapContextLabel ?? "").toUpperCase();
  if (vwap.includes("ABOVE_VWAP") || vwap.includes("RECLAIM")) {
    positiveSignals.push("ABOVE_VWAP_OR_RECLAIM");
    score += 6;
  } else if (vwap.includes("BELOW_VWAP")) {
    dangerSignals.push("VWAP_LOSS");
    score -= 8;
  }

  // Profit lock active and net-positive
  if (sample?.profitLockActive === true) {
    const netAtFloor = Number(sample?.projectedNetAfterFeesAtFloor ?? 0);
    if (netAtFloor > 0) {
      positiveSignals.push("LOCK_ACTIVE_NET_POSITIVE");
      score += 5;
    } else {
      dangerSignals.push("LOCK_ACTIVE_NET_NEGATIVE");
      score -= 3;
    }
  }

  // BTC/ETH long market context
  const mktBias = (
    sample?.crossMarketLongBiasLabel ??
    sample?.btcLongTailwindLabel ??
    ""
  ).toUpperCase();
  if (mktBias === "STRONG_LONG_TAILWIND" || mktBias === "LONG_TAILWIND") {
    positiveSignals.push("BTC_LONG_ALIGNED");
    score += 5;
  } else if (mktBias === "STRONG_LONG_HEADWIND" || mktBias === "LONG_HEADWIND") {
    dangerSignals.push("BTC_LONG_HEADWIND");
    score -= 8;
  }

  // MFE expansion (still moving favorably)
  const mfe  = Number(sample?.mfe ?? 0);
  const priceUp = entryPrice > 0 ? (currentPrice - entryPrice) / entryPrice * 100 : 0;
  if (mfe > 0 && priceUp >= mfe * 0.8) {
    positiveSignals.push("MFE_EXPANDING");
    score += 4;
  } else if (mfe > 0 && priceUp < mfe * 0.3) {
    dangerSignals.push("MFE_GIVEBACK_LARGE");
    score -= 5;
  }

  // last3Ticks structure
  const ticks = (sample?.last3TicksDirection ?? "").toUpperCase();
  if (ticks === "UP")   { positiveSignals.push("TICKS_UP");   score += 4; }
  if (ticks === "DOWN") { dangerSignals.push("TICKS_DOWN");   score -= 6; }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tier =
    clamped >= 80 ? "ELITE"
    : clamped >= 65 ? "SNIPER"
    : clamped >= 50 ? "HIGH"
    : clamped >= 35 ? "MODERATE"
    : "LOW";

  return {
    longRunnerCaptureScore:   clamped,
    longRunnerCaptureTier:    tier,
    longRunnerCaptureLabels:  [
      ...positiveSignals.map(s => `+${s}`),
      ...dangerSignals.map(s => `-${s}`),
    ],
    longRunnerPositiveSignals: positiveSignals,
    longRunnerDangerSignals:   dangerSignals,
    longRunnerScoreVersion:    LONG_RUNNER_CAPTURE_VERSION,
    longRunnerEvaluatedAt:     Date.now(),

    // Backward-compat aliases used by existing liveExitAudit reads
    runnerCapturePotentialScore:  clamped,
    runnerCaptureLabels:          [
      ...positiveSignals.map(s => `RUNNER_${s}`),
      ...dangerSignals.map(s => `RUNNER_DANGER_${s}`),
    ],
  };
}
