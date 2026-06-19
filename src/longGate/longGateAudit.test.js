import { describe, it, expect } from "vitest";
import { evaluateLongGateAudit, buildLongAuditFields, classifyLongMicroMomentum } from "./longGateAudit.js";

const goodLong = {
  immediateGreenImpulse: true,
  greenImpulseDetected: true,
  immediateRedImpulse: false,
  redImpulseDetected: false,
  last3TicksDirection: "UP",
  cvdLabel: "BULL",
  priceVsVwapLabel: "ABOVE_VWAP",
  btcRegime: "BTC_CHOP",
  atrPct: 1.2,
  spreadPct: 0.02,
  rsiSpread1m3m: 3,
  rsi1mDelta: 2,
};

const badLong = {
  immediateGreenImpulse: false,
  greenImpulseDetected: false,
  immediateRedImpulse: true,
  redImpulseDetected: true,
  last3TicksDirection: "DOWN",
  cvdLabel: "BEAR",
  priceVsVwapLabel: "BELOW_VWAP",
  btcRegime: "BTC_STRONG_DOWN",
  atrPct: 1.2,
  spreadPct: 0.02,
};

describe("evaluateLongGateAudit", () => {
  it("passes for a clean long setup", () => {
    const result = evaluateLongGateAudit(goodLong);
    expect(result.longGateWouldPass).toBe(true);
    expect(result.longGateFailReasons).toHaveLength(0);
  });

  it("fails when immediate red impulse present", () => {
    const result = evaluateLongGateAudit(badLong);
    expect(result.longGateWouldPass).toBe(false);
    expect(result.longGateFailReasons).toContain("IMMEDIATE_RED_IMPULSE");
  });

  it("fails when no long micro momentum", () => {
    const s = { ...badLong, immediateRedImpulse: false };
    const result = evaluateLongGateAudit(s);
    expect(result.longGateFailReasons).toContain("NO_LONG_MICRO_MOMENTUM");
  });

  it("returns high gate score for excellent long setup", () => {
    const result = evaluateLongGateAudit(goodLong);
    expect(result.longGateScore).toBeGreaterThan(70);
  });

  it("returns low gate score for danger setup", () => {
    const result = evaluateLongGateAudit(badLong);
    expect(result.longGateScore).toBeLessThan(40);
  });

  it("identifies green confirmation correctly", () => {
    const result = evaluateLongGateAudit(goodLong);
    expect(result.hasGreenConfirmation).toBe(true);
    expect(result.hasRedDanger).toBe(false);
  });
});

describe("classifyLongMicroMomentum", () => {
  it("returns MULTI_CONFIRM when 2+ signals", () => {
    const ctx = { hasRsiRolloverUp: true };
    const s   = { immediateGreenImpulse: true, last3TicksDirection: "UP" };
    expect(classifyLongMicroMomentum(s, ctx)).toBe("MICRO_GREEN_MULTI_CONFIRM");
  });
  it("returns GREEN_IMPULSE for single green", () => {
    const ctx = { hasRsiRolloverUp: false };
    const s   = { immediateGreenImpulse: true, last3TicksDirection: "DOWN" };
    expect(classifyLongMicroMomentum(s, ctx)).toBe("MICRO_GREEN_IMPULSE");
  });
  it("returns RED_PRESSURE when only red", () => {
    const ctx = { hasRsiRolloverUp: false };
    const s   = { immediateRedImpulse: true };
    expect(classifyLongMicroMomentum(s, ctx)).toBe("MICRO_RED_PRESSURE");
  });
});

describe("buildLongAuditFields", () => {
  it("returns longGateWouldPass for TOP_LOSER_LONGS", () => {
    const result = buildLongAuditFields({ ...goodLong, longParentBucket: "TOP_LOSER_LONGS" });
    expect(result).toHaveProperty("longGateWouldPass");
    expect(result).toHaveProperty("isNoLongMomentumYet");
  });

  it("returns longGateWouldPass for TOP_GAINER_LONGS", () => {
    const result = buildLongAuditFields({ ...goodLong, longParentBucket: "TOP_GAINER_LONGS" });
    expect(result).toHaveProperty("longGateWouldPass");
    expect(result.longThesisLaneLabel).toBe("TOP_GAINER_CONTINUATION");
  });
});
