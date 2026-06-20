// Tests for B-16 (WS event timestamp latency) and B-17 (REST poll interval).
// Field names updated for V2 API (profitLockProtection.js V2 2026-06).
import { describe, it, expect } from "vitest";
import {
  evaluateLongProfitLockBreach,
  makeProfitLockProtectionDefaults,
  PROFIT_LOCK_CROSS_PRECISION,
} from "./profitLockProtection.js";

const BASE_TRADE = {
  ...makeProfitLockProtectionDefaults(),
  id: "t-bugfix",
  symbol: "BTCUSDT",
  entryPrice: 1.00,
  leverage: 25,
  closed: false,
  profitLockStrategyActive: true,
  profitLockProtectedFloorPrice: 1.00,
};

// ── B-16: WebSocket breach with event timestamp yields transport latency ────────

describe("B-16: WebSocket breach latency uses event timestamp", () => {
  it("computes non-zero transport latency for WebSocket breach with event timestamp", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 1000100,
      eventTimestampMs: 1000000,
      source: "AGG_TRADE",
    });
    expect(result.breached).toBe(true);
    // V2 field: transport latency = observedAt - eventTimestamp
    expect(result.profitLockTransportLatencyMs).toBe(100);
    // V2: first observation below floor → no interpolated estimate
    expect(result.profitLockCrossTimePrecision).toBe(PROFIT_LOCK_CROSS_PRECISION.FIRST_OBSERVATION_BELOW_FLOOR);
    // V2: crossEstimateAt is null for first observation; upper bound is observedAt
    expect(result.profitLockCrossEstimateAt).toBeNull();
    expect(result.profitLockCrossUpperBoundAt).toBe(1000100);
  });

  it("transport latency is null for WebSocket events without event timestamp", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 1000000,
      source: "WEBSOCKET",
    });
    expect(result.breached).toBe(true);
    // No event timestamp → transport latency is null
    expect(result.profitLockTransportLatencyMs).toBeNull();
    expect(result.profitLockCrossTimePrecision).toBe(PROFIT_LOCK_CROSS_PRECISION.FIRST_OBSERVATION_BELOW_FLOOR);
  });

  it("upper bound is observedAt when no event timestamp is provided", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 5000,
      source: "BOOK_TICKER",
    });
    expect(result.profitLockCrossUpperBoundAt).toBe(5000);
    expect(result.profitLockCrossEstimateAt).toBeNull();
  });

  it("transport latency is clamped to >= 0 even if clocks are slightly mismatched", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 999999,         // observed BEFORE event (clock drift)
      eventTimestampMs: 1000000,
      source: "AGG_TRADE",
    });
    expect(result.profitLockTransportLatencyMs).toBe(0);
  });
});

// ── B-17: REST polling breach uses poll interval as estimated latency ─────────

describe("B-17: REST polling breach records poll interval as estimated latency", () => {
  it("records polling interval in detection latency bounds for REST detections", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 1000000,
      source: "REST_FALLBACK",
      lastPollIntervalMs: 1000,
    });
    expect(result.breached).toBe(true);
    // V2 field names: lower/upper/estimate latency
    expect(result.profitLockDetectionLatencyUpperBoundMs).toBe(1000);
    expect(result.profitLockDetectionLatencyEstimateMs).toBe(500);
    expect(result.profitLockCrossTimePrecision).toBe(PROFIT_LOCK_CROSS_PRECISION.BOUNDED_BETWEEN_REST_POLLS);
  });

  it("crossEstimateAt is null for REST detections (no precise crossing time)", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 1000000,
      source: "REST_FALLBACK",
      lastPollIntervalMs: 1000,
    });
    // V2: no interpolated cross time for REST polling
    expect(result.profitLockCrossEstimateAt).toBeNull();
  });

  it("returns null detection latency for REST breach when no poll interval provided", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 9000,
      source: "REST_POLL",
    });
    // First observation, no poll interval → FIRST_OBSERVATION_BELOW_FLOOR
    expect(result.profitLockDetectionLatencyEstimateMs).toBeNull();
    expect(result.profitLockCrossTimePrecision).toBe(PROFIT_LOCK_CROSS_PRECISION.FIRST_OBSERVATION_BELOW_FLOOR);
    expect(result.profitLockCrossEstimateAt).toBeNull();
  });

  it("no breach → latency fields are null", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 0.90 },
      currentPrice: 0.99,
      observedAt: 1000,
      source: "AGG_TRADE",
      eventTimestampMs: 999,
      lastPollIntervalMs: 1000,
    });
    expect(result.breached).toBe(false);
    expect(result.profitLockCrossEstimateAt).toBeNull();
    expect(result.profitLockDetectionLatencyEstimateMs).toBeNull();
    expect(result.profitLockCrossTimePrecision).toBeNull();
  });
});
