import { describe, expect, it } from "vitest";
import { computeDirectionalFeatures, directionAgreement } from "./tickDirectionFeatures.js";

function series(prices, start = 0, step = 500) {
  return prices.map((price, index) => ({
    price,
    mid: price,
    eventTime: start + index * step,
    receivedAt: start + index * step,
  }));
}

describe("tick direction features", () => {
  it("calculates clean upward displacement, efficiency, velocity, and streaks", () => {
    const features = computeDirectionalFeatures(series([100, 100.1, 100.25, 100.5, 100.9], 1_000), {
      entryTime: 3_000,
    });
    const window = features.window3000;
    expect(window.netMoveBps).toBeCloseTo(90, 6);
    const expectedGross = (
      (0.1 / 100) + (0.15 / 100.1) + (0.25 / 100.25) + (0.4 / 100.5)
    ) * 10_000;
    expect(window.grossMoveBps).toBeCloseTo(expectedGross, 5);
    expect(window.efficiency).toBeCloseTo(90 / expectedGross, 5);
    expect(window.velocity).toBeCloseTo(45, 6);
    expect(window.direction).toBe("UP");
    expect(features.currentUpStreak).toBe(4);
    expect(features.reversalCount10).toBe(0);
  });

  it("identifies chaotic reversals and source disagreement inputs", () => {
    const features = computeDirectionalFeatures(series([100, 101, 99, 101, 99, 100], 0, 500), {
      entryTime: 2_500,
    });
    expect(features.reversalCount10).toBeGreaterThanOrEqual(3);
    expect(features.window3000.efficiency).toBeLessThan(0.1);
    expect(directionAgreement("UP", "DOWN")).toBe("DISAGREE");
    expect(directionAgreement("UP", "UP")).toBe("AGREE_UP");
  });
});
