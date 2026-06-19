import { describe, it, expect } from "vitest";
import { computeShortPressureDangerLogOnly } from "./shortPressureDangerLogOnly.js";

describe("computeShortPressureDangerLogOnly", () => {
  it("returns CLEAR for a clean long candidate", () => {
    const result = computeShortPressureDangerLogOnly({
      cvdLabel: "BULL",
      immediateRedImpulse: false,
      priceVsVwapLabel: "ABOVE_VWAP",
      greenImpulseDetected: true,
    });
    expect(result.shortPressureDangerLabel).toBe("SHORT_PRESSURE_CLEAR");
    expect(result.shortPressureWouldBlockLongLogOnly).toBe(false);
  });

  it("returns HARD_DANGER for severe short pressure", () => {
    const result = computeShortPressureDangerLogOnly({
      cvdLabel: "BEAR",
      cvdBearPersistenceBars: 5,
      immediateRedImpulse: true,
      redImpulseDetected: true,
      priceVsVwapLabel: "BELOW_VWAP",
      oiPressureLabel: "PRICE_DOWN_OI_UP",
      btcRegime: "BTC_STRONG_DOWN",
      macdHistogramState1m: "NEGATIVE_EXPANDING",
    });
    expect(result.shortPressureDangerLabel).toBe("SHORT_PRESSURE_HARD_DANGER");
    expect(result.shortPressureWouldBlockLongLogOnly).toBe(true);
    expect(result.shortPressureWouldHardBlock).toBe(true);
  });

  it("accumulates score from multiple danger signals", () => {
    const base = computeShortPressureDangerLogOnly({});
    const withRed = computeShortPressureDangerLogOnly({ immediateRedImpulse: true });
    expect(withRed.shortPressureDangerScore).toBeGreaterThan(base.shortPressureDangerScore);
  });

  it("green impulse reduces danger score", () => {
    const withoutGreen = computeShortPressureDangerLogOnly({ cvdLabel: "BEAR" });
    const withGreen    = computeShortPressureDangerLogOnly({ cvdLabel: "BEAR", greenImpulseDetected: true });
    expect(withGreen.shortPressureDangerScore).toBeLessThan(withoutGreen.shortPressureDangerScore);
  });

  it("returns correct output shape", () => {
    const result = computeShortPressureDangerLogOnly({});
    expect(result).toHaveProperty("shortPressureDangerScore");
    expect(result).toHaveProperty("shortPressureDangerLabel");
    expect(result).toHaveProperty("shortPressureWouldBlockLongLogOnly");
    expect(result).toHaveProperty("shortPressureWouldHardBlock");
    expect(result).toHaveProperty("shortPressureDangerReasons");
    expect(result).toHaveProperty("shortPressureClearReasons");
  });
});
