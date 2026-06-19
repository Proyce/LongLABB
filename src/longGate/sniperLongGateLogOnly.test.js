import { describe, it, expect } from "vitest";
import { evaluateSniperLongGateLogOnly } from "./sniperLongGateLogOnly.js";

const passingCandidate = {
  longAbsoluteEntryScore:  92,
  bestDnaLongScore:        88,
  longGateScore:           72,
  longMicroMomentumLabel:  "MICRO_GREEN_MULTI_CONFIRM",
  hasLongMicroMomentum:    true,
  atrPct:                  1.2,
  immediateGreenImpulse:   true,
  greenImpulseDetected:    true,
  hasGreenConfirmation:    true,
  immediateRedImpulse:     false,
  hasRedDanger:            false,
  cvdLabel:                "BULL",
  longAuditWouldBlock:    false,
  longAuditDangerTier:    "CLEAR",
  marketBreathWouldBlock:  false,
  entryRank:               8,
};

const failingCandidate = {
  longAbsoluteEntryScore:  50,
  bestDnaLongScore:        40,
  longGateScore:           30,
  longMicroMomentumLabel:  "MICRO_RED_PRESSURE",
  hasLongMicroMomentum:    false,
  atrPct:                  0.3,
  immediateGreenImpulse:   false,
  greenImpulseDetected:    false,
  hasGreenConfirmation:    false,
  immediateRedImpulse:     true,
  hasRedDanger:            true,
  cvdLabel:                "BEAR",
  longAuditWouldBlock:    true,
  longAuditDangerTier:    "HARD_DANGER",
  marketBreathWouldBlock:  false,
};

describe("evaluateSniperLongGateLogOnly", () => {
  it("passes for a high-quality long candidate", () => {
    const result = evaluateSniperLongGateLogOnly(passingCandidate);
    expect(result.sniperLongWouldPass).toBe(true);
    expect(result.sniperLongFailReasons).toHaveLength(0);
  });

  it("fails for a low-quality candidate", () => {
    const result = evaluateSniperLongGateLogOnly(failingCandidate);
    expect(result.sniperLongWouldPass).toBe(false);
    expect(result.sniperLongFailReasons.length).toBeGreaterThan(0);
  });

  it("assigns ELITE_RESEARCH tier for exceptional scores", () => {
    const elite = { ...passingCandidate, longAbsoluteEntryScore: 96, bestDnaLongScore: 96 };
    const result = evaluateSniperLongGateLogOnly(elite);
    expect(result.sniperLongTier).toBe("LONG_SNIPER_ELITE_RESEARCH");
  });

  it("assigns NONE tier for failing candidate", () => {
    const result = evaluateSniperLongGateLogOnly(failingCandidate);
    expect(result.sniperLongTier).toBe("LONG_SNIPER_NONE");
  });

  it("fails when CVD is BEAR", () => {
    const s = { ...passingCandidate, cvdLabel: "BEAR" };
    const result = evaluateSniperLongGateLogOnly(s);
    expect(result.sniperLongWouldPass).toBe(false);
    expect(result.sniperLongFailReasons).toContain("CVD_BEAR_DISQUALIFIER");
  });

  it("fails when green confirmation missing", () => {
    const s = { ...passingCandidate, immediateGreenImpulse: false, greenImpulseDetected: false, hasGreenConfirmation: false };
    const result = evaluateSniperLongGateLogOnly(s);
    expect(result.sniperLongFailReasons).toContain("NO_GREEN_CONFIRMATION_OR_HAS_RED");
  });

  it("returns correct output shape", () => {
    const result = evaluateSniperLongGateLogOnly(passingCandidate);
    expect(result).toHaveProperty("sniperLongWouldPass");
    expect(result).toHaveProperty("sniperLongTier");
    expect(result).toHaveProperty("sniperLongScore");
    expect(result).toHaveProperty("sniperLongReasons");
    expect(result).toHaveProperty("sniperLongFailReasons");
    expect(result).toHaveProperty("sniperLongVersion");
  });
});
