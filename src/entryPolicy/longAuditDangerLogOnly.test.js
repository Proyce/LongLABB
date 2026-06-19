import { describe, it, expect } from "vitest";
import { computeLongAuditDangerLogOnly } from "./longAuditDangerLogOnly.js";

function makeCandidate(overrides = {}) {
  return {
    rsiLongScore: 0,
    trendLongScore: 0,
    advancedLongScore: 0,
    cvdLabel: "NEUT",
    hasGreenDanger: false,
    greenPressureLabel: null,
    ...overrides,
  };
}

describe("computeLongAuditDangerLogOnly — no signal baseline", () => {
  it("returns LONG_AUDIT_CLEAR with score 0 when no signals", () => {
    const result = computeLongAuditDangerLogOnly(makeCandidate());
    expect(result.longAuditDangerScore).toBe(0);
    expect(result.longAuditDangerLabel).toBe("LONG_AUDIT_CLEAR");
    expect(result.longAuditWouldBlock).toBe(false);
    expect(result.longAuditWouldHardBlock).toBe(false);
  });
});

describe("computeLongAuditDangerLogOnly — RSI expansion", () => {
  it("RSI long expansion alone logs caution (score 30)", () => {
    const result = computeLongAuditDangerLogOnly(makeCandidate({ rsiLongScore: 30 }));
    expect(result.longAuditDangerScore).toBe(30);
    expect(result.longAuditDangerLabel).toBe("LONG_AUDIT_CAUTION");
    expect(result.longAuditWouldBlock).toBe(false);
    expect(result.longAuditReasons).toContain("RSI_LONG_MOMENTUM_EXPANSION");
  });

  it("RSI label also triggers expansion", () => {
    const result = computeLongAuditDangerLogOnly(
      makeCandidate({ rsiLongSetupLabel: "RSI_LONG_MOMENTUM_EXPANSION_HIGH" })
    );
    expect(result.longAuditReasons).toContain("RSI_LONG_MOMENTUM_EXPANSION");
  });
});

describe("computeLongAuditDangerLogOnly — MACD expansion", () => {
  it("MACD bullish expansion alone scores 35 → LONG_AUDIT_CAUTION (not blocking alone)", () => {
    const result = computeLongAuditDangerLogOnly(makeCandidate({ trendLongScore: 50 }));
    expect(result.longAuditDangerScore).toBe(35);
    // 35 < 50, so CAUTION not DANGER
    expect(result.longAuditDangerLabel).toBe("LONG_AUDIT_CAUTION");
    expect(result.longAuditWouldBlock).toBe(false);
    expect(result.longAuditWouldHardBlock).toBe(false);
    expect(result.longAuditReasons).toContain("MACD_LONG_BULLISH_EXPANSION");
  });
});

describe("computeLongAuditDangerLogOnly — RSI + MACD double expansion", () => {
  it("RSI + MACD together logs hard danger (score >= 75)", () => {
    const result = computeLongAuditDangerLogOnly(
      makeCandidate({ rsiLongScore: 30, trendLongScore: 50 })
    );
    // 30 (RSI) + 35 (MACD) + 25 (double) = 90
    expect(result.longAuditDangerScore).toBe(90);
    expect(result.longAuditDangerLabel).toBe("LONG_AUDIT_HARD_DANGER");
    expect(result.longAuditWouldBlock).toBe(true);
    expect(result.longAuditWouldHardBlock).toBe(true);
    expect(result.longAuditReasons).toContain("LONG_RSI_MACD_DOUBLE_EXPANSION");
  });
});

describe("computeLongAuditDangerLogOnly — EMA fast support alone is not toxic", () => {
  it("EMA_LONG_FAST_SUPPORT_HELD alone does not log danger", () => {
    const result = computeLongAuditDangerLogOnly(
      makeCandidate({ emaLongFastSetupLabel: "EMA_LONG_FAST_SUPPORT_HELD" })
    );
    expect(result.longAuditDangerScore).toBe(0);
    expect(result.longAuditDangerLabel).toBe("LONG_AUDIT_CLEAR");
    expect(result.longAuditWouldBlock).toBe(false);
  });
});

describe("computeLongAuditDangerLogOnly — CVD and green pressure", () => {
  it("CVD BULL increases danger score by 15", () => {
    const result = computeLongAuditDangerLogOnly(makeCandidate({ cvdLabel: "BULL" }));
    expect(result.longAuditDangerScore).toBe(15);
    expect(result.longAuditReasons).toContain("BULLISH_CVD_SUPPORTS_LONG_AUDIT_DANGER");
  });

  it("CVD BULL + green pressure increases score to 35 → LONG_AUDIT_CAUTION", () => {
    const result = computeLongAuditDangerLogOnly(
      makeCandidate({ cvdLabel: "BULL", hasGreenDanger: true })
    );
    // CVD BULL = +15, green pressure = +20 → total 35
    expect(result.longAuditDangerScore).toBe(35);
    // 35 >= 25 but < 50 → CAUTION
    expect(result.longAuditDangerLabel).toBe("LONG_AUDIT_CAUTION");
    expect(result.longAuditReasons).toContain("BULLISH_CVD_SUPPORTS_LONG_AUDIT_DANGER");
    expect(result.longAuditReasons).toContain("GREEN_PRESSURE_SUPPORTS_LONG_AUDIT_DANGER");
  });

  it("MICRO_GREEN_PRESSURE triggers green pressure", () => {
    const result = computeLongAuditDangerLogOnly(
      makeCandidate({ greenPressureLabel: "MICRO_GREEN_PRESSURE" })
    );
    expect(result.longAuditReasons).toContain("GREEN_PRESSURE_SUPPORTS_LONG_AUDIT_DANGER");
  });
});

describe("computeLongAuditDangerLogOnly — score is clamped to 0-100", () => {
  it("score never exceeds 100", () => {
    const result = computeLongAuditDangerLogOnly(
      makeCandidate({
        rsiLongScore: 99,
        trendLongScore: 99,
        advancedLongScore: 99,
        cvdLabel: "BULL",
        hasGreenDanger: true,
      })
    );
    expect(result.longAuditDangerScore).toBeLessThanOrEqual(100);
  });
});
