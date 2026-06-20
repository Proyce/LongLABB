// Tests for B-16 (WS event timestamp latency) and B-17 (REST poll interval).
import { describe, it, expect } from "vitest";
import {
  evaluateLongProfitLockBreach,
  makeProfitLockProtectionDefaults,
} from "./profitLockProtection.js";

const BASE_TRADE = {
  ...makeProfitLockProtectionDefaults(),  // spread first so explicit overrides win
  id: "t-bugfix",
  symbol: "BTCUSDT",
  entryPrice: 1.00,
  leverage: 25,
  closed: false,
  profitLockStrategyActive: true,
  profitLockProtectedFloorPrice: 1.00,
};

// ── B-16: WebSocket breach with event timestamp yields real latency ───────────

describe("B-16: WebSocket breach latency uses event timestamp", () => {
  it("computes non-zero latency for WebSocket breach with event timestamp", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 1000100,
      eventTimestampMs: 1000000,
      source: "AGG_TRADE",
    });
    expect(result.breached).toBe(true);
    expect(result.profitLockCrossToLocalDetectionLatencyMs).toBe(100);
    expect(result.profitLockCrossTimePrecision).toBe("REALTIME_EVENT_TIMESTAMP");
    expect(result.profitLockFloorCrossedAt).toBe(1000000); // event timestamp, not observedAt
  });

  it("does NOT return 0ms latency for WebSocket events without event timestamp", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 1000000,
      source: "WEBSOCKET",
    });
    expect(result.breached).toBe(true);
    expect(result.profitLockCrossToLocalDetectionLatencyMs).toBeNull();
    expect(result.profitLockCrossTimePrecision).toBe("REALTIME_OBSERVATION_APPROX");
  });

  it("uses observedAt as crossedAt when event timestamp is not provided (WS)", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 5000,
      source: "BOOK_TICKER",
    });
    expect(result.profitLockFloorCrossedAt).toBe(5000);
  });

  it("latency is clamped to >= 0 even if clocks are slightly mismatched", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 999999,       // observed BEFORE event (clock drift)
      eventTimestampMs: 1000000,
      source: "AGG_TRADE",
    });
    expect(result.profitLockCrossToLocalDetectionLatencyMs).toBe(0);
  });
});

// ── B-17: REST polling breach uses poll interval as estimated latency ─────────

describe("B-17: REST polling breach records poll interval as estimated latency", () => {
  it("records polling interval as estimated latency for REST detections", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 1000000,
      source: "REST_FALLBACK",
      lastPollIntervalMs: 1000,
    });
    expect(result.breached).toBe(true);
    expect(result.profitLockCrossToLocalDetectionLatencyMs).toBe(1000);
    expect(result.profitLockCrossTimePrecision).toBe("REST_POLL_INTERVAL_ESTIMATE");
  });

  it("crossedAt remains null for REST detections (no precise crossing time)", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 1000000,
      source: "REST_FALLBACK",
      lastPollIntervalMs: 1000,
    });
    expect(result.profitLockFloorCrossedAt).toBeNull();
  });

  it("returns null latency for REST breach when no poll interval provided", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 1.00 },
      currentPrice: 0.99,
      observedAt: 9000,
      source: "REST_POLL",
    });
    expect(result.profitLockCrossToLocalDetectionLatencyMs).toBeNull();
    expect(result.profitLockCrossTimePrecision).toBe("UNKNOWN_BETWEEN_POLLS");
    expect(result.profitLockFloorCrossedAt).toBeNull();
  });

  it("no breach → all latency fields are null", () => {
    const result = evaluateLongProfitLockBreach({
      trade: { ...BASE_TRADE, profitLockProtectedFloorPrice: 0.90 },
      currentPrice: 0.99,
      observedAt: 1000,
      source: "AGG_TRADE",
      eventTimestampMs: 999,
      lastPollIntervalMs: 1000,
    });
    expect(result.breached).toBe(false);
    expect(result.profitLockFloorCrossedAt).toBeNull();
    expect(result.profitLockCrossToLocalDetectionLatencyMs).toBeNull();
    expect(result.profitLockCrossTimePrecision).toBeNull();
  });
});
