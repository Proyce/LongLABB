// ─── LONG TELEMETRY FRESHNESS CONFIG ─────────────────────────────────────────
// Per-source TTLs in milliseconds. Each source has its own staleness threshold.
// Missing metadata timestamp → UNKNOWN (not stale). Future timestamp → conflict warning.
// "age" = computedAt - sourceTimestamp. If age > TTL → stale for that source.

export const LONG_TELEMETRY_TTL_V1 = Object.freeze({
  telemetryComputedAt:    30_000,   // ticker/spread/depth — tight real-time source
  depthComputedAt:        30_000,   // order book depth
  microMomentumComputedAt: 30_000,  // 1m impulse/tick data
  marketContextComputedAt: 90_000,  // 1m candle-level context (BTC regime, VWAP state)
  breadthComputedAt:      120_000,  // 3m/5m breadth aggregation
  btcContextComputedAt:   300_000,  // BTC structural direction (slower signal)
});
