export const LIVE_EXIT_AUDIT_VERSION = "live-exit-audit-v1-log-only-2026-06";

export const LIVE_EXIT_AUDIT_CONFIG = {
  version: "live-exit-audit-v1-log-only-2026-06",

  mode: "LOG_ONLY",

  allowExecutionImpact: false,

  canCloseTrade: false,
  canReducePosition: false,
  canMoveStopLoss: false,
  canMoveProfitLock: false,
  canChangeTrailingTp: false,
  canChangeExitProfile: false,

  logWouldHold: true,
  logWouldTighten: true,
  logWouldFastExit: true,
  logWouldEmergencyExit: true,
  logWouldProtectProfit: true,
  logWouldAllowRunner: true,
};

export const LIVE_EXIT_AUDIT_LABEL = {
  WOULD_HOLD: "WOULD_HOLD",
  WOULD_ALLOW_RUNNER: "WOULD_ALLOW_RUNNER",
  WOULD_PROTECT_PROFIT: "WOULD_PROTECT_PROFIT",
  WOULD_TIGHTEN: "WOULD_TIGHTEN",
  WOULD_FAST_EXIT: "WOULD_FAST_EXIT",
  WOULD_EMERGENCY_EXIT: "WOULD_EMERGENCY_EXIT",
  WOULD_WAIT_FOR_MIN_TIME: "WOULD_WAIT_FOR_MIN_TIME",
};
