import { describe, it, expect } from "vitest";
import { evaluateSniperShortGateLogOnly } from "./sniperShortGateLogOnly.js";

function makeCandidate(overrides = {}) {
  return {
    absoluteEntryScore: 92,
    absoluteEntryAdaptiveScore: 92,
    bestDnaScore: 85,
    shortGateScore: 65,
    microMomentumLabel: "MICRO_MULTI_CONFIRM",
    hasMicroMomentum: true,
    atrPct: 1.2,
    entryRank: 3,
    hasRedConfirmation: true,
    hasGreenDanger: false,
    immediateGreenImpulse: false,
    greenImpulseDetected: false,
    cvdLabel: "BEAR",
    longAuditWouldBlock: false,
    longAuditWouldHardBlock: false,
    marketBreathWouldBlock: false,
    marketBreathLabel: "SHORT_BREATH_CLEAR",
    ...overrides,
  };
}

describe("evaluateSniperShortGateLogOnly — passing sniper", () => {
  it("all gates passing logs sniper pass", () => {
    const result = evaluateSniperShortGateLogOnly(makeCandidate());
    expect(result.sniperShortWouldPass).toBe(true);
    expect(result.sniperShortTier).not.toBe("SNIPER_FAIL");
  });

  it("elite tier when AES >= 95 and bestDna >= 95", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({ absoluteEntryScore: 96, absoluteEntryAdaptiveScore: 96, bestDnaScore: 96 })
    );
    expect(result.sniperShortTier).toBe("SNIPER_ELITE");
  });

  it("SNIPER_VALID when AES >= 90 but not elite", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({ absoluteEntryScore: 91, bestDnaScore: 80 })
    );
    expect(result.sniperShortTier).toBe("SNIPER_VALID");
  });
});

describe("evaluateSniperShortGateLogOnly — ATR alone is not enough", () => {
  it("ATR >= 1 alone without other gates does not log sniper pass", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({
        atrPct: 1.5,
        absoluteEntryScore: 60,  // below quality gate
        bestDnaScore: 40,
        shortGateScore: 20,
        microMomentumLabel: null,
        hasMicroMomentum: false,
        hasRsiRollover: false,
        hasGainerRsiRollover: false,
        entryRank: 50,
      })
    );
    expect(result.sniperShortWouldPass).toBe(false);
    expect(result.sniperShortTier).toBe("SNIPER_FAIL");
  });
});

describe("evaluateSniperShortGateLogOnly — MICRO_TICKS_DOWN rules", () => {
  it("MICRO_TICKS_DOWN with red/no-green and no long danger logs CONFIRMED", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({
        microMomentumLabel: "MICRO_TICKS_DOWN",
        hasMicroMomentum: false,
        hasRedConfirmation: true,
        hasGreenDanger: false,
        greenImpulseDetected: false,
        immediateGreenImpulse: false,
        longAuditWouldBlock: false,
      })
    );
    expect(result.sniperShortReasons).toContain("MICRO_TICKS_DOWN_CONFIRMED_LOG_ONLY");
    expect(result.sniperShortFailReasons).not.toContain("MICRO_TICKS_DOWN_UNCONFIRMED_LOG_ONLY");
  });

  it("MICRO_TICKS_DOWN without red confirmation logs UNCONFIRMED", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({
        microMomentumLabel: "MICRO_TICKS_DOWN",
        hasMicroMomentum: false,
        hasRedConfirmation: false,
        immediateRedImpulse: false,
        redImpulseDetected: false,
        candleColorAtEntry: "GREEN",
      })
    );
    expect(result.sniperShortFailReasons).toContain("MICRO_TICKS_DOWN_UNCONFIRMED_LOG_ONLY");
  });

  it("MICRO_TICKS_DOWN with LONG_AUDIT_DANGER logs UNCONFIRMED", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({
        microMomentumLabel: "MICRO_TICKS_DOWN",
        hasMicroMomentum: false,
        hasRedConfirmation: true,
        longAuditWouldBlock: true,
      })
    );
    expect(result.sniperShortFailReasons).toContain("MICRO_TICKS_DOWN_UNCONFIRMED_LOG_ONLY");
  });
});

describe("evaluateSniperShortGateLogOnly — blocking conditions", () => {
  it("LONG_AUDIT_DANGER makes sniper fail", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({ longAuditWouldBlock: true })
    );
    expect(result.sniperShortWouldPass).toBe(false);
    expect(result.sniperShortTier).toBe("SNIPER_FAIL");
    expect(result.sniperShortFailReasons).toContain("LONG_AUDIT_DANGER");
  });

  it("market breath hard danger makes sniper fail", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({
        marketBreathWouldBlock: true,
        marketBreathLabel: "SHORT_BREATH_HARD_DANGER",
      })
    );
    expect(result.sniperShortWouldPass).toBe(false);
    expect(result.sniperShortTier).toBe("SNIPER_FAIL");
    expect(result.sniperShortFailReasons).toContain("MARKET_BREATH_DANGER");
  });

  it("green danger makes sniper fail (no-green condition fails)", () => {
    const result = evaluateSniperShortGateLogOnly(
      makeCandidate({ hasGreenDanger: true })
    );
    expect(result.sniperShortWouldPass).toBe(false);
    expect(result.sniperShortFailReasons).toContain("NO_RED_NO_GREEN_CONFIRMATION");
  });
});

describe("evaluateSniperShortGateLogOnly — result shape", () => {
  it("always returns sniperShortGateVersion", () => {
    const result = evaluateSniperShortGateLogOnly(makeCandidate());
    expect(result.sniperShortGateVersion).toBe("sniper-short-v1-log-only-2026-06");
  });

  it("always returns arrays for reasons and failReasons", () => {
    const result = evaluateSniperShortGateLogOnly(makeCandidate());
    expect(Array.isArray(result.sniperShortReasons)).toBe(true);
    expect(Array.isArray(result.sniperShortFailReasons)).toBe(true);
  });
});
