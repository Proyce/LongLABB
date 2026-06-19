// ─── LONGLAB STORAGE KEYS ────────────────────────────────────────────────────
// Single source of truth for all IndexedDB key names.
// LongLAB must never read, write, or migrate ShortLAB (sl_v3:*) keys.

export const STORAGE_KEYS = {
  samples:         "longlab:v1:samples",
  watchlist:       "longlab:v1:watchlist",
  run:             "longlab:v1:run",
  holdMs:          "longlab:v1:holdMs",
  settings:        "longlab:v1:settings",
  discoveryEvents: "longlab:v1:discoveryEvents",
  shadowTrades:    "longlab:v1:shadowTrades",
  discoveryConfig: "longlab:v1:discoveryConfig",
  strategyConfig:  "longlab:v1:strategyConfig",
};

// Legacy keys that may exist from ShortLAB runs on the same machine.
// Used ONLY for one-time read-and-migrate during startup.
// LongLAB never writes these keys.
export const LEGACY_SL_V3_KEYS = {
  samples:         "sl_v3:samples",
  watchlist:       "sl_v3:watchlist",
  run:             "sl_v3:run",
  holdMs:          "sl_v3:holdMs",
  discoveryEvents: "sl_v3:aes_discovery_events",
  shadowTrades:    "sl_v3:aes_shadow_trades",
  discoveryConfig: "sl_v3:aes_discovery_config",
};
