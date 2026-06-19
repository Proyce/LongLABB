import { describe, expect, it } from "vitest";
import { computeLongAesV2Shadow } from "./longAbsoluteEntryScore.v2Shadow.js";

describe("Long AES V2 shadow", () => {
  it("gives Flow Momentum the largest positive component weight", () => {
    const result = computeLongAesV2Shadow({
      longAesScore: 50,
      longAesFlowMomentumScore: 10,
      longAesDirectionScore: 10,
      longAesLocationScore: 10,
    });
    const flow = result.longAesV2PositiveContributions.find(item => item.family === "FLOW_MOMENTUM");
    const direction = result.longAesV2PositiveContributions.find(item => item.family === "DIRECTION");
    expect(flow.weight).toBeGreaterThan(direction.weight);
    expect(flow.weightedValue).toBeGreaterThan(direction.weightedValue);
  });

  it("is explicitly shadow-only", () => {
    const result = computeLongAesV2Shadow({ longAesScore: 60, longAesFlowMomentumScore: 5 });
    expect(result.logOnly).toBe(true);
    expect(result.canAffectExecution).toBe(false);
    expect(result.executionApplied).toBe(false);
  });
});
