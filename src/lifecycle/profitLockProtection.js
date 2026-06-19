// ─── PROFIT-LOCK PROTECTION STATE MACHINE ───────────────────────────────────
// This frontend is a simulator and has no authenticated exchange adapter.
// The module therefore models a verified SIMULATED_LOCAL_STOP and exposes an
// adapter contract for a future backend/exchange implementation. It never
// mislabels a local calculation as exchange protection.

export const PROFIT_LOCK_PROTECTION_VERSION = 'PROFIT_LOCK_PROTECTION_V1_2026_06';

export const PROFIT_LOCK_PROTECTION_STATE = Object.freeze({
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  CALCULATED: 'CALCULATED',
  SUBMITTING: 'SUBMITTING',
  PROTECTION_PENDING: 'PROTECTION_PENDING',
  PROTECTED: 'PROTECTED',
  UPDATE_REQUIRED: 'UPDATE_REQUIRED',
  UPDATING: 'UPDATING',
  FLOOR_BREACHED_UNCLOSED: 'FLOOR_BREACHED_UNCLOSED',
  EXCHANGE_TRIGGERED: 'EXCHANGE_TRIGGERED',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  EMERGENCY_EXIT_PENDING: 'EMERGENCY_EXIT_PENDING',
  EMERGENCY_EXITED: 'EMERGENCY_EXITED',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED',
  CLOSED: 'CLOSED',
});

export const PROFIT_LOCK_PROTECTION_VENUE = Object.freeze({
  SIMULATED_LOCAL_STOP: 'SIMULATED_LOCAL_STOP',
  EXCHANGE_NATIVE: 'EXCHANGE_NATIVE',
  NONE: 'NONE',
});

let simulatedOrderSequence = 0;
const finite = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function makeProfitLockProtectionDefaults() {
  return {
    profitLockStrategyActive: false,
    profitLockProtectionState: PROFIT_LOCK_PROTECTION_STATE.NOT_ELIGIBLE,
    profitLockProtectionVenue: PROFIT_LOCK_PROTECTION_VENUE.NONE,
    profitLockProtectionVerified: false,
    profitLockProtectionVersion: PROFIT_LOCK_PROTECTION_VERSION,
    profitLockProtectionRequested: false,
    profitLockOrderSubmitted: false,
    profitLockOrderAcknowledged: false,
    profitLockOrderResting: false,
    profitLockFloorBreachedWhilePositionOpen: false,
    profitLockFloorBreachedInLoss: false,
    profitLockFloorPreserved: null,
    profitLockFloorMissed: null,
    profitLockEmergencyFallbackUsed: false,
    profitLockEnforcementFailed: false,
    profitLockCloseBlockedByPositivePnlGuard: false,
    profitLockSimulatedOrderId: null,
    profitLockExchangeOrderId: null,
    profitLockClientOrderId: null,
    profitLockProtectionSequence: 0,
  };
}

export function synchronizeSimulatedProfitLockProtection(trade, lockUpdate, now = Date.now()) {
  // Armed-lock invariant: once active, protection remains active until closure.
  const active = lockUpdate?.profitLockActive === true || trade?.profitLockStrategyActive === true || trade?.profitLockActive === true;
  if (!active || trade?.closed === true) {
    return {
      ...(trade?.profitLockProtectionVersion ? {} : makeProfitLockProtectionDefaults()),
      profitLockStrategyActive: false,
      profitLockProtectionState: PROFIT_LOCK_PROTECTION_STATE.NOT_ELIGIBLE,
      profitLockProtectionVenue: PROFIT_LOCK_PROTECTION_VENUE.NONE,
      profitLockProtectionVerified: false,
    };
  }

  const requestedFloor = finite(lockUpdate?.profitLockLevelPrice);
  const currentFloor = finite(trade?.profitLockProtectedFloorPrice ?? trade?.profitLockLevelPrice);
  // A LONG floor is monotonic. Delayed/stale calculations may never loosen it.
  const floor = requestedFloor == null
    ? currentFloor
    : currentFloor == null
      ? requestedFloor
      : Math.max(currentFloor, requestedFloor);
  const needsUpdate = floor != null && (currentFloor == null || floor > currentFloor);
  if (!needsUpdate && trade?.profitLockProtectionVerified === true) {
    return {
      profitLockStrategyActive: true,
      profitLockProtectionState: PROFIT_LOCK_PROTECTION_STATE.PROTECTED,
      profitLockProtectionVenue: trade.profitLockProtectionVenue ?? PROFIT_LOCK_PROTECTION_VENUE.SIMULATED_LOCAL_STOP,
      profitLockProtectionVerified: true,
      profitLockProtectionVersion: PROFIT_LOCK_PROTECTION_VERSION,
    };
  }

  const sequence = Number(trade?.profitLockProtectionSequence ?? 0) + 1;
  const orderId = `SIM-PL-${String(trade?.id ?? trade?.tradeId ?? 'trade')}-${++simulatedOrderSequence}-${sequence}`;
  return {
    profitLockStrategyActive: true,
    profitLockProtectionState: PROFIT_LOCK_PROTECTION_STATE.PROTECTED,
    profitLockProtectionVenue: PROFIT_LOCK_PROTECTION_VENUE.SIMULATED_LOCAL_STOP,
    profitLockProtectionVerified: floor != null,
    profitLockProtectionVersion: PROFIT_LOCK_PROTECTION_VERSION,
    profitLockProtectionRequested: true,
    profitLockOrderSubmitted: true,
    profitLockOrderAcknowledged: true,
    profitLockOrderResting: floor != null,
    profitLockProtectionRequestedAt: now,
    profitLockSubmittedAt: now,
    profitLockAcknowledgedAt: now,
    profitLockRestingVerifiedAt: now,
    profitLockProtectedFloorPrice: floor,
    profitLockProtectedFloorMarginPct: finite(lockUpdate?.profitLockLevelMarginPct ?? trade?.profitLockProtectedFloorMarginPct ?? trade?.profitLockLevelMarginPct),
    profitLockProtectedStage: lockUpdate?.profitLockStage ?? trade?.profitLockProtectedStage ?? trade?.profitLockStage ?? null,
    profitLockSimulatedOrderId: orderId,
    profitLockClientOrderId: orderId,
    profitLockProtectionSequence: sequence,
    profitLockProtectionModeHonestLabel: 'SIMULATED_LOCAL_STOP',
  };
}

export function evaluateLongProfitLockBreach({ trade, currentPrice, observedAt = Date.now(), source = 'UNKNOWN' }) {
  const price = finite(currentPrice);
  const floor = finite(trade?.profitLockProtectedFloorPrice ?? trade?.profitLockLevelPrice);
  const active = trade?.profitLockStrategyActive === true || trade?.profitLockActive === true;
  const open = trade?.closed !== true;
  const breached = active && open && price != null && floor != null && price <= floor;
  const isRealtimeSource = ['BOOK_TICKER', 'AGG_TRADE', 'WEBSOCKET'].some(token => String(source).toUpperCase().includes(token));
  const marginPnlPct = price != null && finite(trade?.entryPrice) > 0
    ? ((price - Number(trade.entryPrice)) / Number(trade.entryPrice)) * 100 * Number(trade?.leverage ?? 1)
    : null;
  return Object.freeze({
    breached,
    shouldCloseImmediately: breached,
    profitLockProtectionState: breached
      ? PROFIT_LOCK_PROTECTION_STATE.FLOOR_BREACHED_UNCLOSED
      : trade?.profitLockProtectionState ?? PROFIT_LOCK_PROTECTION_STATE.NOT_ELIGIBLE,
    profitLockFloorBreachedWhilePositionOpen: breached,
    profitLockFloorBreachedInLoss: breached && marginPnlPct != null && marginPnlPct < 0,
    profitLockPnlAtFloorBreach: breached ? marginPnlPct : null,
    // REST polling can only prove the first observation below the floor, not
    // the true crossing time. Websocket events are treated as realtime observations.
    profitLockFloorCrossedAt: breached && isRealtimeSource ? observedAt : null,
    profitLockLocalTriggerDetectedAt: breached ? observedAt : null,
    profitLockCrossToLocalDetectionLatencyMs: breached && isRealtimeSource ? 0 : null,
    profitLockCrossTimePrecision: breached ? (isRealtimeSource ? 'REALTIME_OBSERVATION' : 'UNKNOWN_BETWEEN_POLLS') : null,
    profitLockTriggerSource: source,
    profitLockCloseBlockedByPositivePnlGuard: false,
    profitLockProtectionVersion: PROFIT_LOCK_PROTECTION_VERSION,
  });
}

export class ProfitLockProtectionAdapter {
  async submitProtection() { throw new Error('submitProtection not implemented'); }
  async replaceProtection() { throw new Error('replaceProtection not implemented'); }
  async cancelProtection() { throw new Error('cancelProtection not implemented'); }
  async getProtection() { throw new Error('getProtection not implemented'); }
  async emergencyClose() { throw new Error('emergencyClose not implemented'); }
}
