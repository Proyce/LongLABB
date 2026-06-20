// ─── PROFIT-LOCK PROTECTION STATE MACHINE (V2) ──────────────────────────────
// This frontend is a simulator with no authenticated exchange adapter.
// A local browser watcher is NOT an order.
// It cannot be submitted, acknowledged, resting, or exchange-verified.
//
// Protection modes, enforcement capabilities, watcher states, and outcome fields
// are now separated so the system cannot misrepresent a local watcher as an
// exchange order.

export const PROFIT_LOCK_PROTECTION_VERSION = 'PROFIT_LOCK_PROTECTION_V2_2026_06';

// ── Protection mode ───────────────────────────────────────────────────────────
export const PROFIT_LOCK_PROTECTION_MODE = Object.freeze({
  NONE:            'NONE',
  LOCAL_WATCH:     'LOCAL_WATCH',
  EXCHANGE_NATIVE: 'EXCHANGE_NATIVE',
});

// ── Enforcement capability ────────────────────────────────────────────────────
export const PROFIT_LOCK_ENFORCEMENT_CAPABILITY = Object.freeze({
  NONE:                               'NONE',
  OBSERVE_AND_REQUEST_SIMULATED_CLOSE: 'OBSERVE_AND_REQUEST_SIMULATED_CLOSE',
  SERVER_SIDE_TRIGGER_ORDER:          'SERVER_SIDE_TRIGGER_ORDER',
});

// ── Local-watch states ────────────────────────────────────────────────────────
export const PROFIT_LOCK_WATCH_STATE = Object.freeze({
  DISARMED:        'DISARMED',
  ARMED:           'ARMED',
  HEALTHY:         'HEALTHY',
  DEGRADED:        'DEGRADED',
  STALE:           'STALE',
  BREACH_OBSERVED: 'BREACH_OBSERVED',
  CLOSE_REQUESTED: 'CLOSE_REQUESTED',
  CLOSE_COMMITTED: 'CLOSE_COMMITTED',
  FAILED:          'FAILED',
  CLOSED:          'CLOSED',
});

// ── Floor outcome ─────────────────────────────────────────────────────────────
export const PROFIT_LOCK_FLOOR_OUTCOME = Object.freeze({
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  PRESERVED:      'PRESERVED',
  MISSED:         'MISSED',
  UNKNOWN:        'UNKNOWN',
});

// ── Cross-time precision ──────────────────────────────────────────────────────
export const PROFIT_LOCK_CROSS_PRECISION = Object.freeze({
  EXACT_EXCHANGE_TRIGGER:                    'EXACT_EXCHANGE_TRIGGER',
  INTERPOLATED_BETWEEN_REALTIME_OBSERVATIONS: 'INTERPOLATED_BETWEEN_REALTIME_OBSERVATIONS',
  BOUNDED_BETWEEN_REALTIME_OBSERVATIONS:     'BOUNDED_BETWEEN_REALTIME_OBSERVATIONS',
  BOUNDED_BETWEEN_REST_POLLS:                'BOUNDED_BETWEEN_REST_POLLS',
  FIRST_OBSERVATION_BELOW_FLOOR:             'FIRST_OBSERVATION_BELOW_FLOOR',
  DATA_GAP_TOO_LARGE:                        'DATA_GAP_TOO_LARGE',
  UNKNOWN:                                   'UNKNOWN',
});

// ── Watcher health ────────────────────────────────────────────────────────────
export const PROFIT_LOCK_WATCH_HEALTH = Object.freeze({
  NOT_ACTIVE:    'NOT_ACTIVE',
  HEALTHY:       'HEALTHY',
  DEGRADED:      'DEGRADED',
  STALE:         'STALE',
  DISCONNECTED:  'DISCONNECTED',
});

// ── Legacy compatibility (retained for historical V1 records) ─────────────────
export const PROFIT_LOCK_PROTECTION_STATE = Object.freeze({
  NOT_ELIGIBLE:          'NOT_ELIGIBLE',
  CALCULATED:            'CALCULATED',
  SUBMITTING:            'SUBMITTING',
  PROTECTION_PENDING:    'PROTECTION_PENDING',
  PROTECTED:             'PROTECTED',
  UPDATE_REQUIRED:       'UPDATE_REQUIRED',
  UPDATING:              'UPDATING',
  FLOOR_BREACHED_UNCLOSED: 'FLOOR_BREACHED_UNCLOSED',
  EXCHANGE_TRIGGERED:    'EXCHANGE_TRIGGERED',
  PARTIALLY_FILLED:      'PARTIALLY_FILLED',
  FILLED:                'FILLED',
  EMERGENCY_EXIT_PENDING: 'EMERGENCY_EXIT_PENDING',
  EMERGENCY_EXITED:      'EMERGENCY_EXITED',
  DEGRADED:              'DEGRADED',
  FAILED:                'FAILED',
  CLOSED:                'CLOSED',
});

export const PROFIT_LOCK_PROTECTION_VENUE = Object.freeze({
  SIMULATED_LOCAL_STOP: 'SIMULATED_LOCAL_STOP',
  EXCHANGE_NATIVE:      'EXCHANGE_NATIVE',
  NONE:                 'NONE',
});

const finite = value =>
  value == null || value === '' ? null
  : Number.isFinite(Number(value)) ? Number(value)
  : null;

let watchIdSequence = 0;

// ── Default state factory ─────────────────────────────────────────────────────
export function makeProfitLockProtectionDefaults() {
  return {
    // Strategy fields
    profitLockStrategyActive:           false,
    profitLockStrategyStage:            null,
    profitLockRequestedFloorPrice:      null,
    profitLockRequestedFloorMarginPct:  null,
    profitLockStrategyActivatedAt:      null,
    profitLockStrategyUpdatedAt:        null,

    // Local-watch fields
    profitLockProtectionMode:           PROFIT_LOCK_PROTECTION_MODE.NONE,
    profitLockEnforcementCapability:    PROFIT_LOCK_ENFORCEMENT_CAPABILITY.NONE,
    profitLockWatchState:               PROFIT_LOCK_WATCH_STATE.DISARMED,
    profitLockLocalWatchId:             null,
    profitLockWatchArmedAt:             null,
    profitLockWatchLastObservationAt:   null,
    profitLockWatchLastObservationSource: null,
    profitLockWatchLastPrice:           null,
    profitLockWatchObservationAgeMs:    null,
    profitLockWatchHealthReason:        null,

    // Exchange-order fields (never set by this simulator)
    profitLockExchangeOrderId:          null,
    profitLockClientOrderId:            null,
    profitLockOrderSubmitted:           false,
    profitLockOrderAcknowledged:        false,
    profitLockOrderResting:             false,
    profitLockOrderStatus:              null,
    profitLockSubmittedAt:              null,
    profitLockAcknowledgedAt:           null,
    profitLockRestingVerifiedAt:        null,

    // Outcome fields
    profitLockFloorOutcome:             PROFIT_LOCK_FLOOR_OUTCOME.NOT_APPLICABLE,
    profitLockFloorPreserved:           null,
    profitLockFloorMissed:              null,
    profitLockFloorOutcomeReason:       null,
    profitLockCloseRequestId:           null,
    profitLockCloseRequestedAt:         null,
    profitLockCloseCommittedAt:         null,
    profitLockCommittedExitPrice:       null,
    profitLockCommittedExitMarginPct:   null,

    // Legacy compatibility
    profitLockProtectionState:          PROFIT_LOCK_PROTECTION_STATE.NOT_ELIGIBLE,
    profitLockProtectionVenue:          PROFIT_LOCK_PROTECTION_VENUE.NONE,
    profitLockProtectionVerified:       false,
    profitLockProtectionVersion:        PROFIT_LOCK_PROTECTION_VERSION,
    profitLockProtectionRequested:      false,
    profitLockFloorBreachedWhilePositionOpen: false,
    profitLockFloorBreachedInLoss:      false,
    profitLockEmergencyFallbackUsed:    false,
    profitLockEnforcementFailed:        false,
    profitLockSimulatedOrderId:         null,
    profitLockProtectionSequence:       0,
  };
}

// ── Arm / synchronize the local watcher ──────────────────────────────────────
// A local watcher is NEVER an order. It has OBSERVE_AND_REQUEST_SIMULATED_CLOSE
// capability only. All exchange-order boolean flags stay false.
export function synchronizeSimulatedProfitLockProtection(trade, lockUpdate, now = Date.now()) {
  const active =
    lockUpdate?.profitLockActive === true ||
    trade?.profitLockStrategyActive === true ||
    trade?.profitLockActive === true;

  if (!active || trade?.closed === true) {
    return {
      profitLockStrategyActive:        false,
      profitLockProtectionMode:        PROFIT_LOCK_PROTECTION_MODE.NONE,
      profitLockEnforcementCapability: PROFIT_LOCK_ENFORCEMENT_CAPABILITY.NONE,
      profitLockWatchState:            PROFIT_LOCK_WATCH_STATE.DISARMED,
      profitLockProtectionState:       PROFIT_LOCK_PROTECTION_STATE.NOT_ELIGIBLE,
      profitLockProtectionVenue:       PROFIT_LOCK_PROTECTION_VENUE.NONE,
      profitLockProtectionVerified:    false,
      profitLockOrderSubmitted:        false,
      profitLockOrderAcknowledged:     false,
      profitLockOrderResting:          false,
      profitLockExchangeOrderId:       null,
    };
  }

  const requestedFloor = finite(lockUpdate?.profitLockLevelPrice);
  const currentFloor   = finite(trade?.profitLockProtectedFloorPrice ?? trade?.profitLockLevelPrice);
  // LONG floor is monotonic — never lower.
  const floor = requestedFloor == null ? currentFloor
    : currentFloor == null ? requestedFloor
    : Math.max(currentFloor, requestedFloor);

  const needsUpdate = floor != null && (currentFloor == null || floor > currentFloor);
  const existingWatchId = trade?.profitLockLocalWatchId;
  const watchId = existingWatchId != null && !needsUpdate
    ? existingWatchId
    : `LOCAL-PL-${String(trade?.id ?? trade?.tradeId ?? 'trade')}-${++watchIdSequence}`;

  const sequence = Number(trade?.profitLockProtectionSequence ?? 0) + (needsUpdate ? 1 : 0);

  return {
    // Strategy
    profitLockStrategyActive:           true,
    profitLockStrategyStage:            lockUpdate?.profitLockStage ?? trade?.profitLockProtectedStage ?? trade?.profitLockStage ?? null,
    profitLockRequestedFloorPrice:      floor,
    profitLockRequestedFloorMarginPct:  finite(lockUpdate?.profitLockLevelMarginPct ?? trade?.profitLockProtectedFloorMarginPct ?? trade?.profitLockLevelMarginPct),
    profitLockStrategyActivatedAt:      trade?.profitLockStrategyActivatedAt ?? now,
    profitLockStrategyUpdatedAt:        needsUpdate ? now : (trade?.profitLockStrategyUpdatedAt ?? now),

    // Local-watch — NOT an exchange order
    profitLockProtectionMode:           PROFIT_LOCK_PROTECTION_MODE.LOCAL_WATCH,
    profitLockEnforcementCapability:    PROFIT_LOCK_ENFORCEMENT_CAPABILITY.OBSERVE_AND_REQUEST_SIMULATED_CLOSE,
    profitLockWatchState:               PROFIT_LOCK_WATCH_STATE.ARMED,
    profitLockLocalWatchId:             watchId,
    profitLockWatchArmedAt:             trade?.profitLockWatchArmedAt ?? now,

    // Exchange-order flags MUST remain false for a local watcher
    profitLockProtectionVerified:       false,
    profitLockOrderSubmitted:           false,
    profitLockOrderAcknowledged:        false,
    profitLockOrderResting:             false,
    profitLockExchangeOrderId:          null,
    profitLockClientOrderId:            null,

    // Legacy compat
    profitLockProtectionState:          PROFIT_LOCK_PROTECTION_STATE.PROTECTED,
    profitLockProtectionVenue:          PROFIT_LOCK_PROTECTION_VENUE.SIMULATED_LOCAL_STOP,
    profitLockProtectionVersion:        PROFIT_LOCK_PROTECTION_VERSION,
    profitLockProtectionRequested:      true,
    profitLockProtectedFloorPrice:      floor,
    profitLockProtectedFloorMarginPct:  finite(lockUpdate?.profitLockLevelMarginPct ?? trade?.profitLockProtectedFloorMarginPct ?? trade?.profitLockLevelMarginPct),
    profitLockProtectedStage:           lockUpdate?.profitLockStage ?? trade?.profitLockProtectedStage ?? trade?.profitLockStage ?? null,
    profitLockProtectionModeHonestLabel: 'LOCAL_WATCH',
    profitLockProtectionSequence:       sequence,
  };
}

// ── Evaluate local-watcher health ─────────────────────────────────────────────
export function evaluateProfitLockWatchHealth(trade, now = Date.now(), config = {}) {
  const healthyMaxAge  = config.profitLockWatchHealthyMaxAgeMs  ?? 3_000;
  const staleMaxAge    = config.profitLockWatchStaleMaxAgeMs    ?? 10_000;
  const mode = trade?.profitLockProtectionMode;
  if (mode !== PROFIT_LOCK_PROTECTION_MODE.LOCAL_WATCH) {
    return { profitLockWatchHealth: PROFIT_LOCK_WATCH_HEALTH.NOT_ACTIVE };
  }
  const lastObs = finite(trade?.profitLockWatchLastObservationAt);
  if (lastObs == null) {
    return {
      profitLockWatchHealth: PROFIT_LOCK_WATCH_HEALTH.DISCONNECTED,
      profitLockWatchHealthReason: 'NO_OBSERVATION_RECEIVED',
    };
  }
  const age = now - lastObs;
  if (age <= healthyMaxAge) {
    return { profitLockWatchHealth: PROFIT_LOCK_WATCH_HEALTH.HEALTHY };
  }
  if (age <= staleMaxAge) {
    return {
      profitLockWatchHealth: PROFIT_LOCK_WATCH_HEALTH.DEGRADED,
      profitLockWatchHealthReason: `OBSERVATION_AGE_${Math.round(age)}ms`,
    };
  }
  return {
    profitLockWatchHealth: PROFIT_LOCK_WATCH_HEALTH.STALE,
    profitLockWatchHealthReason: `STALE_AGE_${Math.round(age)}ms`,
  };
}

// ── Honest crossing-time and latency model ────────────────────────────────────
// Uses bounded interpolation rather than invented exact timestamps.
export function evaluateLongProfitLockBreach({
  trade,
  currentPrice,
  observedAt = Date.now(),
  source = 'UNKNOWN',
  eventTimestampMs = null,
  lastPollIntervalMs = null,
  previousObservedPrice = null,
  previousObservedAt = null,
  previousEventTime = null,
  maxInterpolationGapMs = 5_000,
}) {
  const price = finite(currentPrice);
  const floor = finite(trade?.profitLockProtectedFloorPrice ?? trade?.profitLockLevelPrice);
  const active = trade?.profitLockStrategyActive === true || trade?.profitLockActive === true;
  const open   = trade?.closed !== true;
  const breached = active && open && price != null && floor != null && price <= floor;

  const isRealtimeSource = ['BOOK_TICKER', 'AGG_TRADE', 'WEBSOCKET']
    .some(token => String(source).toUpperCase().includes(token));

  const marginPnlPct =
    price != null && finite(trade?.entryPrice) > 0
      ? ((price - Number(trade.entryPrice)) / Number(trade.entryPrice)) * 100 * Number(trade?.leverage ?? 1)
      : null;

  if (!breached) {
    return Object.freeze({
      breached: false,
      shouldCloseImmediately: false,
      profitLockProtectionState: trade?.profitLockProtectionState ?? PROFIT_LOCK_PROTECTION_STATE.NOT_ELIGIBLE,
      profitLockFloorBreachedWhilePositionOpen: false,
      profitLockFloorBreachedInLoss: false,
      profitLockPnlAtFloorBreach: null,
      profitLockCrossLowerBoundAt: null,
      profitLockCrossUpperBoundAt: null,
      profitLockCrossEstimateAt: null,
      profitLockCrossTimePrecision: null,
      profitLockObservationGapMsAtCross: null,
      profitLockDetectionLatencyLowerBoundMs: null,
      profitLockDetectionLatencyUpperBoundMs: null,
      profitLockDetectionLatencyEstimateMs: null,
      profitLockTransportLatencyMs: null,
      profitLockLocalTriggerDetectedAt: null,
      profitLockTriggerSource: source,
      profitLockCloseBlockedByPositivePnlGuard: false,
      profitLockProtectionVersion: PROFIT_LOCK_PROTECTION_VERSION,
      // Persist previous observation for next call
      profitLockPreviousObservedPrice: price,
      profitLockPreviousObservedAt:    observedAt,
      profitLockPreviousEventTime:     eventTimestampMs,
      profitLockPreviousSource:        source,
    });
  }

  // ── Crossing-time bounds and interpolation ────────────────────────────────
  const prevPrice = finite(previousObservedPrice);
  const prevAt    = finite(previousObservedAt);
  const prevEvt   = finite(previousEventTime);

  let crossLowerBoundAt = null;
  let crossUpperBoundAt = null;
  let crossEstimateAt   = null;
  let crossPrecision    = PROFIT_LOCK_CROSS_PRECISION.UNKNOWN;
  let observationGapMs  = null;
  let detectionLatencyLower = null;
  let detectionLatencyUpper = null;
  let detectionLatencyEst   = null;

  if (isRealtimeSource && prevPrice != null && prevAt != null && prevPrice > floor) {
    // Previous observation was above floor, current is below — floor is bracketed.
    const gap = observedAt - prevAt;
    observationGapMs = gap;
    crossUpperBoundAt = observedAt;
    crossLowerBoundAt = prevAt;

    if (gap <= maxInterpolationGapMs && prevPrice > price) {
      // Linear interpolation of crossing moment.
      const ratio = Math.max(0, Math.min(1, (prevPrice - floor) / (prevPrice - price)));
      crossEstimateAt = Math.round(prevAt + ratio * gap);
      crossPrecision  = PROFIT_LOCK_CROSS_PRECISION.INTERPOLATED_BETWEEN_REALTIME_OBSERVATIONS;
      detectionLatencyLower = Math.max(0, observedAt - (prevEvt ?? crossUpperBoundAt));
      detectionLatencyUpper = observedAt - (prevAt);
      detectionLatencyEst   = observedAt - crossEstimateAt;
    } else if (gap > maxInterpolationGapMs) {
      crossPrecision = PROFIT_LOCK_CROSS_PRECISION.DATA_GAP_TOO_LARGE;
      crossEstimateAt = null;
      detectionLatencyLower = 0;
      detectionLatencyUpper = gap;
      detectionLatencyEst   = gap / 2;
    } else {
      crossPrecision  = PROFIT_LOCK_CROSS_PRECISION.BOUNDED_BETWEEN_REALTIME_OBSERVATIONS;
      crossEstimateAt = null;
      detectionLatencyLower = 0;
      detectionLatencyUpper = gap;
      detectionLatencyEst   = gap / 2;
    }
  } else if (!isRealtimeSource && lastPollIntervalMs != null) {
    // REST path — we only know the poll interval.
    crossPrecision = PROFIT_LOCK_CROSS_PRECISION.BOUNDED_BETWEEN_REST_POLLS;
    crossUpperBoundAt = observedAt;
    crossLowerBoundAt = observedAt - lastPollIntervalMs;
    observationGapMs  = lastPollIntervalMs;
    detectionLatencyLower = 0;
    detectionLatencyUpper = lastPollIntervalMs;
    detectionLatencyEst   = lastPollIntervalMs / 2;
  } else {
    // First observation already below floor — no bracketing possible.
    crossPrecision    = PROFIT_LOCK_CROSS_PRECISION.FIRST_OBSERVATION_BELOW_FLOOR;
    crossUpperBoundAt = observedAt;
    crossEstimateAt   = null;
  }

  // Transport latency: difference between receive time and exchange event time.
  const transportLatencyMs =
    eventTimestampMs != null ? Math.max(0, observedAt - eventTimestampMs) : null;

  return Object.freeze({
    breached: true,
    shouldCloseImmediately: true,
    profitLockProtectionState:              PROFIT_LOCK_PROTECTION_STATE.FLOOR_BREACHED_UNCLOSED,
    profitLockWatchState:                   PROFIT_LOCK_WATCH_STATE.BREACH_OBSERVED,
    profitLockFloorBreachedWhilePositionOpen: true,
    profitLockFloorBreachedInLoss:          marginPnlPct != null && marginPnlPct < 0,
    profitLockPnlAtFloorBreach:             marginPnlPct,

    // Crossing-time fields (spec §5.3)
    profitLockCrossLowerBoundAt:            crossLowerBoundAt,
    profitLockCrossUpperBoundAt:            crossUpperBoundAt,
    profitLockCrossEstimateAt:              crossEstimateAt,
    profitLockCrossTimePrecision:           crossPrecision,
    profitLockObservationGapMsAtCross:      observationGapMs,

    // Latency fields
    profitLockDetectionLatencyLowerBoundMs: detectionLatencyLower,
    profitLockDetectionLatencyUpperBoundMs: detectionLatencyUpper,
    profitLockDetectionLatencyEstimateMs:   detectionLatencyEst,
    profitLockTransportLatencyMs:           transportLatencyMs,
    profitLockLocalTriggerDetectedAt:       observedAt,

    profitLockTriggerSource:                source,
    profitLockCloseBlockedByPositivePnlGuard: false,
    profitLockProtectionVersion:            PROFIT_LOCK_PROTECTION_VERSION,

    // Carry previous observation so caller can persist it for the next tick.
    profitLockPreviousObservedPrice: price,
    profitLockPreviousObservedAt:    observedAt,
    profitLockPreviousEventTime:     eventTimestampMs,
    profitLockPreviousSource:        source,
  });
}

// ── Exchange-native adapter contract ──────────────────────────────────────────
// Only this adapter may set profitLockOrderSubmitted/Acknowledged/Resting = true.
// These fields must come from actual adapter responses, never from local assignment.
export class ProfitLockProtectionAdapter {
  async submitProtection()  { throw new Error('submitProtection not implemented'); }
  async replaceProtection() { throw new Error('replaceProtection not implemented'); }
  async cancelProtection()  { throw new Error('cancelProtection not implemented'); }
  async getProtection()     { throw new Error('getProtection not implemented'); }
  async emergencyClose()    { throw new Error('emergencyClose not implemented'); }
}
