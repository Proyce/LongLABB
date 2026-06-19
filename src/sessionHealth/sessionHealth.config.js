export const SESSION_HEALTH_VERSION = "session-health-v1-shadow-2026-06";

export const SESSION_HEALTH_CONFIG = {
  version: SESSION_HEALTH_VERSION,
  enabled: true,
  mode: "SHADOW_ONLY",

  recentWindowTrades: 20,
  recentWindowMs:     60 * 60 * 1000, // 60 minutes
  maxRecentTrades:    50,

  warmupMinTrades:    5,
  warmupMinMs:        5 * 60 * 1000, // 5 minutes

  deadbands: {
    live:     0.05,
    realized: 0.05,
    net:      0.08,
  },

  hysteresis: {
    minEvaluations:  3,
    minPersistenceMs: 20_000,
    blockRecoveryMs:  60_000,
  },

  deterioration: {
    maxSlRate:         0.35,
    maxConsecutiveLoss: 4,
    minExpectancy:     -0.10,
    minActiveWinPct:   0.30,
    minActiveForWinPct: 8,
  },
};
