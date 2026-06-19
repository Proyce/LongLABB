// ─── LONG CLOSE REASONS V2 ──────────────────────────────────────────────────
// Canonical cause/mechanism semantics. AUTO_END is accepted only as a legacy
// import alias and must never be emitted by new lifecycle code.

export const CLOSE_REASON = Object.freeze({
  TAKE_PROFIT: 'TAKE_PROFIT',
  STOP_LOSS: 'STOP_LOSS',
  TRAILING_EXIT: 'TRAILING_EXIT',
  PROFIT_LOCK: 'PROFIT_LOCK',
  TIMEOUT: 'TIMEOUT',
  RUN_STOP: 'RUN_STOP',
  APP_SHUTDOWN: 'APP_SHUTDOWN',
  EXCHANGE_LIQUIDATION: 'EXCHANGE_LIQUIDATION',
  EMERGENCY_EXIT: 'EMERGENCY_EXIT',
  POSITION_RECONCILIATION: 'POSITION_RECONCILIATION',
  MANUAL_CLOSE: 'MANUAL_CLOSE',
  FINALIZATION_FAILED: 'FINALIZATION_FAILED',
  ACTIVE: 'ACTIVE',
});

export const CLOSE_EXECUTION_MECHANISM = Object.freeze({
  SIMULATED_TICK: 'SIMULATED_TICK',
  LOCAL_WEBSOCKET_WATCH: 'LOCAL_WEBSOCKET_WATCH',
  REST_POLL: 'REST_POLL',
  LOCAL_REST_FALLBACK: 'LOCAL_REST_FALLBACK',
  EXCHANGE_STOP_MARKET: 'EXCHANGE_STOP_MARKET',
  EMERGENCY_MARKET: 'EMERGENCY_MARKET',
  MANUAL: 'MANUAL',
  FINALIZER: 'FINALIZER',
  NONE: 'NONE',
});

const LEGACY_ALIASES = Object.freeze({
  TP: CLOSE_REASON.TAKE_PROFIT,
  SL: CLOSE_REASON.STOP_LOSS,
  TRAIL: CLOSE_REASON.TRAILING_EXIT,
  PROFIT_LOCK: CLOSE_REASON.PROFIT_LOCK,
  TIMEOUT: CLOSE_REASON.TIMEOUT,
  AUTO_END: CLOSE_REASON.RUN_STOP,
  ACTIVE: CLOSE_REASON.ACTIVE,
});

export function normalizeLongCloseReason(reason) {
  if (reason == null) return CLOSE_REASON.ACTIVE;
  const key = String(reason).trim().toUpperCase().replace(/\s+/g, '_');
  return LEGACY_ALIASES[key] ?? CLOSE_REASON[key] ?? key;
}

export function classifyLongCloseReason(reason) {
  const normalized = normalizeLongCloseReason(reason);
  const category = (() => {
    if ([CLOSE_REASON.TAKE_PROFIT, CLOSE_REASON.TRAILING_EXIT, CLOSE_REASON.PROFIT_LOCK].includes(normalized)) return 'PROFIT_EXIT';
    if ([CLOSE_REASON.STOP_LOSS, CLOSE_REASON.EXCHANGE_LIQUIDATION].includes(normalized)) return 'RISK_EXIT';
    if ([CLOSE_REASON.TIMEOUT, CLOSE_REASON.RUN_STOP, CLOSE_REASON.APP_SHUTDOWN].includes(normalized)) return 'TIME_OR_SESSION_EXIT';
    if ([CLOSE_REASON.EMERGENCY_EXIT, CLOSE_REASON.POSITION_RECONCILIATION].includes(normalized)) return 'SAFETY_EXIT';
    if (normalized === CLOSE_REASON.MANUAL_CLOSE) return 'MANUAL_EXIT';
    if (normalized === CLOSE_REASON.FINALIZATION_FAILED) return 'DATA_FAILURE';
    if (normalized === CLOSE_REASON.ACTIVE) return 'OPEN_POSITION';
    return 'UNKNOWN';
  })();
  return {
    closeReason: normalized,
    closeReasonCategory: category,
    closeReasonDetail: normalized,
    legacyCloseReason: reason !== normalized ? reason : null,
  };
}
