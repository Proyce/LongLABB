import { describe, it, expect } from "vitest";
import { updateVwapFlipHistory, buildVwapEntrySnapshot } from "./vwapFlipTracker.js";
import { VWAP_STATES } from "./vwapFlipState.js";

describe("updateVwapFlipHistory", () => {
  it("transitions from BELOW to RECLAIM_ATTEMPT when price crosses above", () => {
    const map = new Map();
    // First tick: below VWAP
    updateVwapFlipHistory(map, "BTCUSDT", {
      priceVsVwapLabel: "BELOW_VWAP",
      cvdLabel: "NEUT",
      greenImpulse: false,
      timestamp: 1000,
    });
    // Second tick: crosses above
    const result = updateVwapFlipHistory(map, "BTCUSDT", {
      priceVsVwapLabel: "ABOVE_VWAP",
      cvdLabel: "BULL",
      greenImpulse: true,
      timestamp: 2000,
    });
    expect(result.state).toBe(VWAP_STATES.RECLAIM_ATTEMPT);
    expect(result.flipDetected).toBe(true);
  });

  it("accumulates bars above after reclaim attempt", () => {
    const map = new Map();
    const tick = { priceVsVwapLabel: "ABOVE_VWAP", cvdLabel: "BULL", greenImpulse: false };
    updateVwapFlipHistory(map, "ETHUSDT", { priceVsVwapLabel: "BELOW_VWAP", cvdLabel: "NEUT", timestamp: 1000 });
    updateVwapFlipHistory(map, "ETHUSDT", { ...tick, timestamp: 2000 });
    const r2 = updateVwapFlipHistory(map, "ETHUSDT", { ...tick, timestamp: 3000 });
    expect(r2.barsAboveAfterReclaim).toBeGreaterThanOrEqual(1);
  });

  it("records transition timestamps", () => {
    const map = new Map();
    updateVwapFlipHistory(map, "XUSDT", { priceVsVwapLabel: "BELOW_VWAP", cvdLabel: "NEUT", timestamp: 100 });
    const result = updateVwapFlipHistory(map, "XUSDT", {
      priceVsVwapLabel: "ABOVE_VWAP",
      cvdLabel: "BULL",
      greenImpulse: false,
      timestamp: 200,
    });
    expect(result.timestamps.reclaimAttemptAt).toBe(200);
  });

  it("tracks multiple symbols independently", () => {
    const map = new Map();
    updateVwapFlipHistory(map, "A", { priceVsVwapLabel: "ABOVE_VWAP", cvdLabel: "BULL", timestamp: 1000 });
    updateVwapFlipHistory(map, "B", { priceVsVwapLabel: "BELOW_VWAP", cvdLabel: "BEAR", timestamp: 1000 });
    expect(map.get("A").state).not.toBe(map.get("B").state);
  });
});

describe("buildVwapEntrySnapshot", () => {
  it("returns all required fields for a known tracker", () => {
    const map = new Map();
    updateVwapFlipHistory(map, "TEST", {
      priceVsVwapLabel: "BELOW_VWAP",
      cvdLabel: "NEUT",
      timestamp: 1000,
    });
    updateVwapFlipHistory(map, "TEST", {
      priceVsVwapLabel: "ABOVE_VWAP",
      cvdLabel: "BULL",
      greenImpulse: true,
      timestamp: 2000,
    });
    const snapshot = buildVwapEntrySnapshot(map.get("TEST"));
    expect(snapshot).toHaveProperty("vwapStateAtEntry");
    expect(snapshot).toHaveProperty("vwapFlipDetected");
    expect(snapshot).toHaveProperty("vwapReclaimAttemptAt");
    expect(snapshot).toHaveProperty("vwapLongLabel");
    expect(snapshot).toHaveProperty("vwapReclaimQualityScore");
  });

  it("returns UNKNOWN state for null tracker", () => {
    const snapshot = buildVwapEntrySnapshot(null);
    expect(snapshot.vwapStateAtEntry).toBe(VWAP_STATES.UNKNOWN);
    expect(snapshot.vwapFlipDetected).toBe(false);
  });
});
