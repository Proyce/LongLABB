import { describe, expect, it } from "vitest";
import {
  detectLongProfitLockFloorCross,
  buildProfitLockFillTelemetry,
  recommendProfitLockActionLogOnly,
} from "./profitLockTelemetry.js";

describe("profit lock telemetry", () => {
  it("detects a LONG floor crossing between polls", () => {
    const result = detectLongProfitLockFloorCross({
      previousPrice: 102,
      currentPrice: 100.9,
      floorPrice: 101,
      lockActive: true,
      observedAt: 2000,
      floorCrossedAt: 1500,
      lockActivatedAt: 1000,
    });
    expect(result.profitLockCrossDetected).toBe(true);
    expect(result.profitLockCrossedBetweenObservations).toBe(true);
    expect(result.profitLockDetectionLatencyMs).toBe(500);
    expect(result.profitLockActivationToDetectionLatencyMs).toBe(1000);
    expect(result.canAffectExecution).toBe(false);
  });

  it("records observed fill and never clamps it to the floor", () => {
    const result = buildProfitLockFillTelemetry({
      entryPrice: 100,
      leverage: 5,
      floorPrice: 101,
      floorMarginPct: 5,
      observedFillPrice: 100.8,
      enforcementAttempted: true,
    });
    expect(result.profitLockObservedFillPrice).toBe(100.8);
    expect(result.profitLockObservedMarginPnlPct).toBe(4);
    expect(result.profitLockSlippageMarginPct).toBe(-1);
    expect(result.profitLockFloorMissed).toBe(true);
    expect(result.profitLockFloorEnforcementSucceeded).toBe(false);
    expect(result.floorExitEnforced).toBe(true);
  });

  it("keeps recommendations log-only", () => {
    const result = recommendProfitLockActionLogOnly({
      profitLockActive: true,
      immediateRedImpulse: true,
      cvdLabel: "BEAR",
    });
    expect(result.profitLockRecommendedActionLogOnly).toBe("EMERGENCY_EXIT");
    expect(result.executionApplied).toBe(false);
  });
});
