// ─── FUNDING TELEMETRY ────────────────────────────────────────────────────────
// First-class funding rate telemetry for LongLAB.
// Sign convention: positive funding = longs pay shorts (cost for longs).
//                  negative funding = shorts pay longs (income for longs).

// ─── REGIME THRESHOLDS ───────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  extremeNegativeThreshold: -0.003,   // below this = FUNDING_EXTREME_NEGATIVE
  negativeThreshold:         -0.001,   // below this = FUNDING_NEGATIVE
  positiveThreshold:          0.001,   // above this = FUNDING_POSITIVE
  extremePositiveThreshold:   0.003,   // above this = FUNDING_EXTREME_POSITIVE
  staleAgeMs:               120_000,   // 2 minutes
};

// ─── REGIME CLASSIFICATION ───────────────────────────────────────────────────

export function classifyFundingRegime(fundingRate, config = DEFAULT_CONFIG) {
  if (fundingRate == null || !Number.isFinite(fundingRate)) return "FUNDING_UNKNOWN";
  if (fundingRate <= config.extremeNegativeThreshold) return "FUNDING_EXTREME_NEGATIVE";
  if (fundingRate < config.negativeThreshold)          return "FUNDING_NEGATIVE";
  if (fundingRate > config.extremePositiveThreshold)   return "FUNDING_EXTREME_POSITIVE";
  if (fundingRate > config.positiveThreshold)          return "FUNDING_POSITIVE";
  return "FUNDING_NEUTRAL";
}

// ─── LONG BIAS SCORE FROM FUNDING ────────────────────────────────────────────
// Negative funding = longs are paid = tailwind for longs (+score)
// Positive funding = longs pay = headwind (-score)

export function computeFundingLongBiasScore(fundingRate, config = DEFAULT_CONFIG) {
  if (fundingRate == null || !Number.isFinite(fundingRate)) return 0;
  if (fundingRate <= config.extremeNegativeThreshold) return 15;
  if (fundingRate < config.negativeThreshold)          return 8;
  if (fundingRate > config.extremePositiveThreshold)   return -15;
  if (fundingRate > config.positiveThreshold)          return -8;
  return 0;
}

// ─── SNAPSHOT BUILDER ────────────────────────────────────────────────────────

export function computeFundingSnapshot(fundingRate, symbol, now = Date.now(), nextFundingTime = null, config = DEFAULT_CONFIG) {
  const regime    = classifyFundingRegime(fundingRate, config);
  const biasScore = computeFundingLongBiasScore(fundingRate, config);
  const timeToFundingMs = nextFundingTime != null ? Math.max(0, nextFundingTime - now) : null;

  return {
    fundingRate:         fundingRate,
    fundingRatePct:      fundingRate != null ? fundingRate * 100 : null,
    fundingRegime:       regime,
    fundingLongBiasScore: biasScore,
    nextFundingTime:     nextFundingTime,
    timeToFundingMs,
    fundingSnapshotAt:   now,
    fundingContextFresh: true,
  };
}

// ─── FUNDING DIRECTION ────────────────────────────────────────────────────────

export function classifyFundingDirection(fundingRate) {
  if (fundingRate == null) return "FUNDING_DIRECTION_UNKNOWN";
  if (fundingRate < -0.0005) return "FUNDING_LONGS_RECEIVING"; // negative: longs receive
  if (fundingRate > 0.0005)  return "FUNDING_LONGS_PAYING";    // positive: longs pay
  return "FUNDING_NEAR_ZERO";
}

// ─── STALENESS CHECK ─────────────────────────────────────────────────────────

export function isFundingStale(snapshotAt, now = Date.now(), config = DEFAULT_CONFIG) {
  if (snapshotAt == null) return true;
  return (now - snapshotAt) > config.staleAgeMs;
}

// ─── CASHFLOW SIMULATION ─────────────────────────────────────────────────────
// Estimate funding cashflow for a simulated long trade that crosses a funding event.

export function computeFundingCashflow(fundingRate, leverage, notionalSizeUsd = null) {
  if (fundingRate == null || leverage == null) {
    return { fundingCashflowNormPct: null, fundingCashflowMarginPct: null };
  }
  // Normalized: for a long position, positive funding = cost, negative = receipt
  const fundingCashflowNormPct   = -(fundingRate * 100);
  const fundingCashflowMarginPct = fundingCashflowNormPct * leverage;

  return {
    fundingCashflowNormPct,
    fundingCashflowMarginPct,
    fundingCashflowUsd: notionalSizeUsd != null
      ? -(fundingRate * notionalSizeUsd)
      : null,
  };
}
