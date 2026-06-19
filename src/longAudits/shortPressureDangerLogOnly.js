// ─── SHORT PRESSURE DANGER (LOG ONLY) ────────────────────────────────────────
// Detects active short/sell pressure that is dangerous for a LONG entry.
// Counterpart to longAuditDangerLogOnly.js (which detected long signals
// that were dangerous for SHORT trades).
// Log-only: shortPressureWouldBlockLongLogOnly never affects candidate creation.

export function computeShortPressureDangerLogOnly(candidate) {
  const reasons = [];
  const clearReasons = [];
  let score = 0;

  const cvdBear =
    candidate.cvdLabel === "BEAR" ||
    candidate.cvdLabel === "BEARISH";

  const cvdBearPersistent =
    cvdBear && (
      Number(candidate.cvdBearPersistenceBars ?? 0) >= 3 ||
      candidate.cvdBearPersistenceBars == null && cvdBear
    );

  const redImpulse =
    candidate.immediateRedImpulse === true ||
    candidate.redImpulseDetected === true;

  const belowVwapAccelerating =
    candidate.priceVsVwapLabel === "BELOW_VWAP" &&
    (candidate.cvdLabel === "BEAR" || candidate.immediateRedImpulse === true);

  const newLowNoAbsorption =
    (candidate.priceVsVwapLabel === "BELOW_VWAP") &&
    !(candidate.lowerWickPct > 30) &&
    !(candidate.greenImpulseDetected === true);

  const macdNegativeExpansion =
    candidate.macdHistogramState1m?.includes("NEGATIVE_EXPANDING") ||
    candidate.macdHistogramState3m?.includes("NEGATIVE_EXPANDING");

  const rsiRollingDown =
    (candidate.rsi1mSlope === "FALLING" && candidate.rsi3mSlope === "FALLING");

  const oiUpPriceDown =
    candidate.oiPressureLabel === "PRICE_DOWN_OI_UP";

  const btcStrongDown =
    candidate.btcRegime === "BTC_STRONG_DOWN";

  const broadSellingPressure =
    candidate.breadthBullishPct != null && candidate.breadthBullishPct < 30;

  const failedVwapReclaim =
    candidate.vwapLongContextLabel?.includes("RECLAIM_FAILURE") ||
    candidate.vwapStateAtEntry === "VWAP_RECLAIM_FAILED";

  // ── Score accumulation ────────────────────────────────────────────────────

  if (redImpulse) {
    score += 35;
    reasons.push("IMMEDIATE_RED_IMPULSE");
  }

  if (cvdBearPersistent) {
    score += 30;
    reasons.push("CVD_BEAR_PERSISTENT");
  } else if (cvdBear) {
    score += 18;
    reasons.push("CVD_BEAR");
  }

  if (belowVwapAccelerating) {
    score += 20;
    reasons.push("BELOW_VWAP_ACCELERATING_SELL");
  }

  if (newLowNoAbsorption) {
    score += 18;
    reasons.push("NEW_LOW_NO_ABSORPTION");
  }

  if (macdNegativeExpansion) {
    score += 15;
    reasons.push("MACD_NEGATIVE_EXPANSION");
  }

  if (rsiRollingDown) {
    score += 10;
    reasons.push("RSI_ROLLING_DOWN");
  }

  if (oiUpPriceDown) {
    score += 15;
    reasons.push("OI_UP_PRICE_DOWN");
  }

  if (btcStrongDown) {
    score += 12;
    reasons.push("BTC_STRONG_DOWN_HEADWIND");
  }

  if (broadSellingPressure) {
    score += 10;
    reasons.push("BROAD_SELLING_PRESSURE");
  }

  if (failedVwapReclaim) {
    score += 18;
    reasons.push("FAILED_VWAP_RECLAIM");
  }

  // ── Clear signals (reduce score) ─────────────────────────────────────────

  if (candidate.greenImpulseDetected === true || candidate.immediateGreenImpulse === true) {
    score -= 15;
    clearReasons.push("GREEN_IMPULSE_ACTIVE");
  }

  if (candidate.cvdLabel === "BULL" || candidate.cvdLabel === "BULLISH") {
    score -= 12;
    clearReasons.push("CVD_BULL_REDUCING_DANGER");
  }

  if (candidate.priceVsVwapLabel === "ABOVE_VWAP") {
    score -= 8;
    clearReasons.push("ABOVE_VWAP");
  }

  const clamped = Math.max(0, Math.min(100, score));

  const label =
    clamped >= 75 ? "SHORT_PRESSURE_HARD_DANGER"
    : clamped >= 50 ? "SHORT_PRESSURE_DANGER"
    : clamped >= 25 ? "SHORT_PRESSURE_CAUTION"
    : "SHORT_PRESSURE_CLEAR";

  return {
    shortPressureDangerScore:          clamped,
    shortPressureDangerLabel:          label,
    shortPressureWouldBlockLongLogOnly: clamped >= 50,
    shortPressureWouldHardBlock:       clamped >= 75,
    shortPressureDangerReasons:        reasons,
    shortPressureClearReasons:         clearReasons,
  };
}
