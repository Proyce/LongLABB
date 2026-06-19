// ─── PROFIT LOCK TELEMETRY ───────────────────────────────────────────────────
// Pure diagnostics for honest LONG lock-floor crossing and observed-fill audit.
// These helpers are LOG ONLY and must never place, modify, or close an order.

export const PROFIT_LOCK_TELEMETRY_VERSION = "PROFIT_LOCK_TELEMETRY_V2_2026_06";

const finite = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const round = (value, digits = 6) => value == null ? null : Number(Number(value).toFixed(digits));

/**
 * Detect a LONG floor crossing between two observed prices. For a LONG, the
 * protected floor is crossed when price moves from above the floor to at/below
 * it. A first observation already below the floor is recorded as an observed
 * breach, but marked as not having a known previous-price crossing.
 */
export function detectLongProfitLockFloorCross({
  previousPrice,
  currentPrice,
  floorPrice,
  lockActive,
  observedAt,
  floorCrossedAt,
  lockActivatedAt,
}) {
  const from = finite(previousPrice);
  const to = finite(currentPrice);
  const floor = finite(floorPrice);
  const active = lockActive === true;
  const breached = active && to != null && floor != null && to <= floor;
  const crossedBetweenObservations = breached && from != null && from > floor;
  const firstObservedBelowFloor = breached && from == null;

  const crossedAt = breached ? (floorCrossedAt ?? null) : null;
  const crossToDetectionLatencyMs =
    breached && observedAt != null && crossedAt != null
      ? Math.max(0, Number(observedAt) - Number(crossedAt))
      : null;

  return Object.freeze({
    profitLockCrossDetected: breached,
    profitLockCrossDetectedAt: breached ? (observedAt ?? null) : null,
    profitLockFloorCrossedAt: crossedAt,
    profitLockCrossFromPrice: breached ? from : null,
    profitLockCrossToPrice: breached ? to : null,
    profitLockCrossedBetweenObservations: crossedBetweenObservations,
    profitLockFirstObservedBelowFloor: firstObservedBelowFloor,
    // Correct semantics: crossing → local detection. The previous implementation
    // measured lock activation → detection, which inflated latency by trade age.
    profitLockCrossToLocalDetectionLatencyMs: crossToDetectionLatencyMs,
    profitLockDetectionLatencyMs: crossToDetectionLatencyMs,
    profitLockActivationToDetectionLatencyMs:
      breached && observedAt != null && lockActivatedAt != null
        ? Math.max(0, Number(observedAt) - Number(lockActivatedAt))
        : null,
    profitLockTelemetryVersion: PROFIT_LOCK_TELEMETRY_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}

/** Build the final observed-fill audit. Never substitutes the floor for fill. */
export function buildProfitLockFillTelemetry({
  entryPrice,
  leverage,
  floorPrice,
  floorMarginPct,
  observedFillPrice,
  enforcementAttempted = false,
  toleranceMarginPct = 0.01,
}) {
  const entry = finite(entryPrice);
  const lev = finite(leverage);
  const floor = finite(floorPrice);
  const floorMargin = finite(floorMarginPct);
  const fill = finite(observedFillPrice);

  const observedMarginPnlPct = entry != null && entry > 0 && lev != null && fill != null
    ? ((fill - entry) / entry) * 100 * lev
    : null;
  const slippagePricePct = floor != null && floor > 0 && fill != null
    ? ((fill - floor) / floor) * 100
    : null;
  const slippageMarginPct = observedMarginPnlPct != null && floorMargin != null
    ? observedMarginPnlPct - floorMargin
    : null;
  const floorMissed = slippageMarginPct != null && slippageMarginPct < -Math.abs(toleranceMarginPct);
  const succeeded = enforcementAttempted === true && floorMissed === false && observedMarginPnlPct != null;

  return Object.freeze({
    profitLockTriggerPrice: floor,
    profitLockObservedFillPrice: fill,
    profitLockObservedMarginPnlPct: round(observedMarginPnlPct, 4),
    profitLockSlippagePricePct: round(slippagePricePct, 6),
    profitLockSlippageMarginPct: round(slippageMarginPct, 4),
    profitLockFloorEnforcementAttempted: enforcementAttempted === true,
    profitLockFloorEnforcementSucceeded: succeeded,
    profitLockFloorMissed: floorMissed,
    // True means the detected floor-cross path triggered the close attempt.
    // Success is tracked separately so a slipped fill is never disguised.
    floorExitEnforced: enforcementAttempted === true,
    floorExitEnforcedDeprecated: true,
    profitLockTelemetryVersion: PROFIT_LOCK_TELEMETRY_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}

/**
 * Research-only action recommendation. It intentionally returns metadata only.
 */
export function recommendProfitLockActionLogOnly(sample = {}) {
  if (sample.profitLockActive !== true) {
    return Object.freeze({
      profitLockRecommendedActionLogOnly: null,
      profitLockRecommendationReasons: ["LOCK_NOT_ACTIVE"],
      profitLockRecommendationVersion: PROFIT_LOCK_TELEMETRY_VERSION,
      logOnly: true,
      canAffectExecution: false,
      executionApplied: false,
    });
  }

  const reasons = [];
  const runnerScore = finite(sample.longRunnerCaptureScore ?? sample.runnerCapturePotentialScore);
  const currentMargin = finite(sample.currentMarginPnlPct ?? sample.marginPnlPct);
  const mfe = finite(sample.highestMarginPnlPct ?? sample.mfe);
  const redDanger = sample.immediateRedImpulse === true || sample.hasRedDanger === true;
  const cvdBear = String(sample.entryCvdLabel ?? sample.cvdLabel ?? "").toUpperCase().includes("BEAR");
  const microUp = sample.longMicroUpConfirmation === true || sample.last3TicksDirection === "UP";

  let action = "LOCK_HOLD";
  if (redDanger && cvdBear) {
    action = "EMERGENCY_EXIT";
    reasons.push("RED_DANGER_WITH_CVD_BEAR");
  } else if (redDanger || (!microUp && cvdBear)) {
    action = "FAST_HARVEST";
    reasons.push(redDanger ? "RED_DANGER_RETURNED" : "MICRO_UP_LOST_WITH_CVD_BEAR");
  } else if (runnerScore != null && runnerScore >= 70 && microUp) {
    action = "SWITCH_TO_TRAIL";
    reasons.push("RUNNER_SCORE_HIGH", "MICRO_UP_STILL_ACTIVE");
  } else if ((mfe != null && mfe >= 5) || (currentMargin != null && currentMargin >= 4)) {
    action = "LOCK_TIGHTEN";
    reasons.push("MEANINGFUL_MFE_REACHED");
  } else {
    reasons.push("LOCK_FLOOR_STILL_APPROPRIATE");
  }

  return Object.freeze({
    profitLockRecommendedActionLogOnly: action,
    profitLockRecommendationReasons: reasons,
    profitLockRecommendationVersion: PROFIT_LOCK_TELEMETRY_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}
