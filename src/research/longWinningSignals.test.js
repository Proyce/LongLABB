import { describe, expect, it } from "vitest";
import {
  deriveLongMicroUpConfirmation,
  deriveLongMicroMomentumLabel,
  deriveRsiLongMomentumExpansion,
  deriveMacdBullishExpansion,
  classifyLongGateResearchBandV2,
} from "./longWinningSignals.js";

describe("Long winning signal derivations", () => {

  it("derives a complete native micro-momentum label when the raw field is absent", () => {
    expect(deriveLongMicroMomentumLabel({ immediateGreenImpulse: true, last3TicksDirection: "UP" }))
      .toBe("MICRO_GREEN_MULTI_CONFIRM");
    expect(deriveLongMicroMomentumLabel({ last3TicksDirection: "UP" }))
      .toBe("MICRO_TICKS_UP");
    expect(deriveLongMicroMomentumLabel({ immediateRedImpulse: true, last3TicksDirection: "DOWN" }))
      .toBe("MICRO_RED_PRESSURE");
    expect(deriveLongMicroMomentumLabel({ last3TicksDirection: "MIXED" }))
      .toBe("MICRO_NO_LONG_CONFIRMATION");
  });

  it("derives narrow micro-up only from actual upward microstructure", () => {
    const result = deriveLongMicroUpConfirmation({
      last3TicksDirection: "UP",
      immediateGreenImpulse: true,
      longMicroMomentumLabel: "MICRO_GREEN_MULTI_CONFIRM",
    });
    expect(result.longMicroUpConfirmation).toBe(true);
    expect(result.longMicroUpConfirmationSourceCount).toBe(3);
    expect(result.longMicroUpConfirmationReasons).toContain("LAST_3_TICKS_UP");
  });

  it("does not treat an RSI-only state as narrow micro-up", () => {
    expect(deriveLongMicroUpConfirmation({
      hasRsiRolloverUp: true,
      longMicroMomentumLabel: "RSI_ROLLOVER_UP",
    }).longMicroUpConfirmation).toBe(false);
  });

  it("parses RSI momentum expansion labels", () => {
    expect(deriveRsiLongMomentumExpansion({ rsiLongSetupLabel: "RSI_LONG_MOMENTUM_EXPANSION" }).rsiLongMomentumExpansion).toBe(true);
  });

  it("derives MACD expansion from positive expanding histogram", () => {
    expect(deriveMacdBullishExpansion({ macdHistogram1m: 0.2, macdHistogramDelta1m: 0.03 })).toBe(true);
    expect(deriveMacdBullishExpansion({ macdHistogram1m: -0.2, macdHistogramDelta1m: 0.03 })).toBe(false);
  });

  it("classifies the granular V2 Gate bands", () => {
    expect(classifyLongGateResearchBandV2(96)).toBe("GATE_ELITE_95");
    expect(classifyLongGateResearchBandV2(91)).toBe("GATE_PREMIUM_90");
    expect(classifyLongGateResearchBandV2(null)).toBe("INSUFFICIENT_DATA");
  });
});
