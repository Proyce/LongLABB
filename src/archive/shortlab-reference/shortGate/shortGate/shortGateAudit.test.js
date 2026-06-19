import { describe, it, expect } from "vitest";
import {
  evaluateShortGateAudit,
  classifyMicroMomentum,
  classifyTopLoserThesisLane,
  classifyBtcShortContext,
  classifyGreenPressure,
  classifyVwapContext,
  buildShortAuditFields,
} from "./shortGateAudit.js";

// ─── FIXTURES ────────────────────────────────────────────────────────────────

const basePass = {
  entryTimingGrade: "B",
  immediateRedImpulse: true,
  immediateGreenImpulse: false,
  greenImpulseDetected: false,
  redImpulseDetected: true,
  last3TicksDirection: "DOWN",
  rsiSpread1m3m: -2,
  rsi1mDelta: -1,
  rsi15m: 55,
  rsi30m: 55,
  rsi1h: 55,
  btcRegime: "BTC_CHOP",
  btcShortTailwindScore: 20,
  atrPct: 0.5,
  priceVsVwapLabel: "BELOW_VWAP",
  spreadPct: 0.02,
  spreadStableBeforeEntry: true,
  entryRank: 8,
  entryBounceContext: "MID",
  bounceContext: "MID",
  volAccel: 5,
};

function sig(overrides = {}) {
  return { ...basePass, ...overrides };
}

// ─── PASS/FAIL CORE ──────────────────────────────────────────────────────────

describe("evaluateShortGateAudit — pass", () => {
  it("returns WOULD_PASS_SHORT_GATE when conditions are met", () => {
    const result = evaluateShortGateAudit(basePass);
    expect(result.shortGateWouldPass).toBe(true);
    expect(result.shortGateAuditLabel).toBe("WOULD_PASS_SHORT_GATE");
    expect(result.shortGateFailReasons).toHaveLength(0);
  });
});

describe("evaluateShortGateAudit — single fail reasons", () => {
  it("fails ENTRY_GRADE_F", () => {
    const result = evaluateShortGateAudit(sig({ entryTimingGrade: "F" }));
    expect(result.shortGateWouldPass).toBe(false);
    expect(result.shortGateFailReasons).toContain("ENTRY_GRADE_F");
  });

  it("fails IMMEDIATE_GREEN_IMPULSE", () => {
    const result = evaluateShortGateAudit(sig({ immediateGreenImpulse: true }));
    expect(result.shortGateWouldPass).toBe(false);
    expect(result.shortGateFailReasons).toContain("IMMEDIATE_GREEN_IMPULSE");
  });

  it("fails BTC_STRONG_DOWN_BOUNCE_TRAP", () => {
    const result = evaluateShortGateAudit(sig({ btcRegime: "BTC_STRONG_DOWN" }));
    expect(result.shortGateWouldPass).toBe(false);
    expect(result.shortGateFailReasons).toContain("BTC_STRONG_DOWN_BOUNCE_TRAP");
  });

  it("fails BTC_STRONG_UP_SHORT_DANGER", () => {
    const result = evaluateShortGateAudit(sig({ btcRegime: "BTC_STRONG_UP" }));
    expect(result.shortGateWouldPass).toBe(false);
    expect(result.shortGateFailReasons).toContain("BTC_STRONG_UP_SHORT_DANGER");
  });

  it("fails NO_MICRO_MOMENTUM when no red/ticks/rsi signals", () => {
    const result = evaluateShortGateAudit(sig({
      immediateRedImpulse: false,
      last3TicksDirection: "MIXED",
      rsiSpread1m3m: 2,
      rsi1mDelta: 1,
    }));
    expect(result.shortGateWouldPass).toBe(false);
    expect(result.shortGateFailReasons).toContain("NO_MICRO_MOMENTUM");
  });

  it("uses WOULD_FAIL_<REASON> label for single fail reason", () => {
    const result = evaluateShortGateAudit(sig({ entryTimingGrade: "F" }));
    expect(result.shortGateAuditLabel).toBe("WOULD_FAIL_ENTRY_GRADE_F");
  });
});

describe("evaluateShortGateAudit — multiple fail reasons", () => {
  it("returns WOULD_FAIL_MULTIPLE_REASONS when multiple reasons exist", () => {
    const result = evaluateShortGateAudit(sig({
      entryTimingGrade: "F",
      immediateGreenImpulse: true,
      immediateRedImpulse: false,
      last3TicksDirection: "MIXED",
      rsiSpread1m3m: 2,
      rsi1mDelta: 1,
    }));
    expect(result.shortGateAuditLabel).toBe("WOULD_FAIL_MULTIPLE_REASONS");
    expect(result.shortGateFailReasons.length).toBeGreaterThan(1);
  });
});

// ─── MICRO MOMENTUM ──────────────────────────────────────────────────────────

describe("classifyMicroMomentum", () => {
  it("returns MICRO_MULTI_CONFIRM when multiple confirms", () => {
    const ctx = { hasRsiRollover: true };
    const label = classifyMicroMomentum(sig({ immediateRedImpulse: true, last3TicksDirection: "DOWN" }), ctx);
    expect(label).toBe("MICRO_MULTI_CONFIRM");
  });

  it("returns MICRO_RED_IMPULSE for immediate red only", () => {
    const ctx = { hasRsiRollover: false };
    const label = classifyMicroMomentum(sig({ immediateRedImpulse: true, last3TicksDirection: "MIXED" }), ctx);
    expect(label).toBe("MICRO_RED_IMPULSE");
  });

  it("returns MICRO_TICKS_DOWN for ticks down only", () => {
    const ctx = { hasRsiRollover: false };
    const label = classifyMicroMomentum(sig({ immediateRedImpulse: false, last3TicksDirection: "DOWN" }), ctx);
    expect(label).toBe("MICRO_TICKS_DOWN");
  });

  it("returns MICRO_RSI_ROLLOVER for rsi rollover only", () => {
    const ctx = { hasRsiRollover: true };
    const label = classifyMicroMomentum(sig({ immediateRedImpulse: false, last3TicksDirection: "MIXED" }), ctx);
    expect(label).toBe("MICRO_RSI_ROLLOVER");
  });

  it("returns MICRO_GREEN_PRESSURE when only green signals", () => {
    const ctx = { hasRsiRollover: false };
    const label = classifyMicroMomentum(
      sig({ immediateRedImpulse: false, last3TicksDirection: "MIXED", greenImpulseDetected: true }),
      ctx,
    );
    expect(label).toBe("MICRO_GREEN_PRESSURE");
  });

  it("returns MICRO_NO_CONFIRMATION when nothing", () => {
    const ctx = { hasRsiRollover: false };
    const label = classifyMicroMomentum(
      sig({ immediateRedImpulse: false, last3TicksDirection: "MIXED", greenImpulseDetected: false, immediateGreenImpulse: false }),
      ctx,
    );
    expect(label).toBe("MICRO_NO_CONFIRMATION");
  });
});

// ─── TOP LOSER THESIS LANE ───────────────────────────────────────────────────

describe("classifyTopLoserThesisLane", () => {
  it("returns TOP_LOSER_RUNNER_CANDIDATE for immediate red + high ATR", () => {
    const ctx = { hasMicroMomentum: true, hasRsiRollover: false };
    const label = classifyTopLoserThesisLane(
      sig({ immediateRedImpulse: true, atrPct: 1.5, btcRegime: "BTC_CHOP" }),
      ctx,
    );
    expect(label).toBe("TOP_LOSER_RUNNER_CANDIDATE");
  });

  it("returns TOP_LOSER_SCALP_CANDIDATE for ticks down + RSI rollover", () => {
    const ctx = { hasMicroMomentum: true, hasRsiRollover: true };
    const label = classifyTopLoserThesisLane(
      sig({ immediateRedImpulse: false, last3TicksDirection: "DOWN", atrPct: 0.3, btcRegime: "BTC_CHOP" }),
      ctx,
    );
    expect(label).toBe("TOP_LOSER_SCALP_CANDIDATE");
  });

  it("returns TOP_LOSER_BLIND_WEAKNESS_SHORT when no micro momentum", () => {
    const ctx = { hasMicroMomentum: false, hasRsiRollover: false };
    const label = classifyTopLoserThesisLane(
      sig({ immediateRedImpulse: false, last3TicksDirection: "MIXED", btcRegime: "BTC_CHOP" }),
      ctx,
    );
    expect(label).toBe("TOP_LOSER_BLIND_WEAKNESS_SHORT");
  });

  it("returns TOP_LOSER_BTC_BOUNCE_TRAP_WARNING for BTC_STRONG_DOWN", () => {
    const ctx = { hasMicroMomentum: true, hasRsiRollover: false };
    const label = classifyTopLoserThesisLane(sig({ btcRegime: "BTC_STRONG_DOWN" }), ctx);
    expect(label).toBe("TOP_LOSER_BTC_BOUNCE_TRAP_WARNING");
  });
});

// ─── BTC SHORT CONTEXT ───────────────────────────────────────────────────────

describe("classifyBtcShortContext", () => {
  it("classifies BTC_CHOP_OK", () => {
    expect(classifyBtcShortContext({ btcRegime: "BTC_CHOP" })).toBe("BTC_CHOP_OK");
  });
  it("classifies BTC_MIXED_CONDITIONAL", () => {
    expect(classifyBtcShortContext({ btcRegime: "BTC_MIXED" })).toBe("BTC_MIXED_CONDITIONAL");
  });
  it("classifies BTC_WEAK_DOWN_CAUTION", () => {
    expect(classifyBtcShortContext({ btcRegime: "BTC_WEAK_DOWN" })).toBe("BTC_WEAK_DOWN_CAUTION");
  });
  it("classifies BTC_STRONG_DOWN_BOUNCE_TRAP", () => {
    expect(classifyBtcShortContext({ btcRegime: "BTC_STRONG_DOWN" })).toBe("BTC_STRONG_DOWN_BOUNCE_TRAP");
  });
  it("classifies BTC_STRONG_UP_SHORT_DANGER", () => {
    expect(classifyBtcShortContext({ btcRegime: "BTC_STRONG_UP" })).toBe("BTC_STRONG_UP_SHORT_DANGER");
  });
  it("classifies BTC_UNKNOWN for unrecognized regime", () => {
    expect(classifyBtcShortContext({ btcRegime: "BTC_WEIRD" })).toBe("BTC_UNKNOWN");
  });
});

// ─── VWAP CONTEXT ────────────────────────────────────────────────────────────

describe("classifyVwapContext", () => {
  it("classifies BELOW_VWAP_WITH_RED_CONFIRMATION", () => {
    const ctx = { hasRedConfirmation: true, hasRsiRollover: false };
    const label = classifyVwapContext(
      sig({ priceVsVwapLabel: "BELOW_VWAP", greenImpulseDetected: false, immediateGreenImpulse: false }),
      ctx,
    );
    expect(label).toBe("BELOW_VWAP_WITH_RED_CONFIRMATION");
  });

  it("classifies BELOW_VWAP_WITH_GREEN_DANGER", () => {
    const ctx = { hasRedConfirmation: false, hasRsiRollover: false };
    const label = classifyVwapContext(
      sig({ priceVsVwapLabel: "BELOW_VWAP", greenImpulseDetected: true }),
      ctx,
    );
    expect(label).toBe("BELOW_VWAP_WITH_GREEN_DANGER");
  });

  it("classifies BELOW_VWAP_NO_CONFIRMATION", () => {
    const ctx = { hasRedConfirmation: false, hasRsiRollover: false };
    const label = classifyVwapContext(
      sig({ priceVsVwapLabel: "BELOW_VWAP", greenImpulseDetected: false, immediateGreenImpulse: false }),
      ctx,
    );
    expect(label).toBe("BELOW_VWAP_NO_CONFIRMATION");
  });
});

// ─── GREEN PRESSURE ──────────────────────────────────────────────────────────

describe("classifyGreenPressure", () => {
  it("returns NO_GREEN_PRESSURE when no green signals", () => {
    const ctx = { hasRedConfirmation: false, hasRsiRollover: false };
    expect(classifyGreenPressure(sig({ greenImpulseDetected: false, immediateGreenImpulse: false }), ctx))
      .toBe("NO_GREEN_PRESSURE");
  });

  it("returns GREEN_PRESSURE_REJECTED_BY_RED when green + red confirmation", () => {
    const ctx = { hasRedConfirmation: true, hasRsiRollover: false };
    expect(classifyGreenPressure(sig({ greenImpulseDetected: true }), ctx))
      .toBe("GREEN_PRESSURE_REJECTED_BY_RED");
  });

  it("returns IMMEDIATE_GREEN_ACTIVE when immediate green without rejection", () => {
    const ctx = { hasRedConfirmation: false, hasRsiRollover: false };
    expect(classifyGreenPressure(sig({ greenImpulseDetected: false, immediateGreenImpulse: true }), ctx))
      .toBe("IMMEDIATE_GREEN_ACTIVE");
  });
});

// ─── DERIVED BOOLEANS ────────────────────────────────────────────────────────

describe("evaluateShortGateAudit — derived booleans", () => {
  it("sets hasMicroMomentum=true when red impulse present", () => {
    const result = evaluateShortGateAudit(sig({ immediateRedImpulse: true }));
    expect(result.hasMicroMomentum).toBe(true);
  });

  it("sets hasRsiRollover=true when both rsi fields are negative", () => {
    const result = evaluateShortGateAudit(sig({ rsiSpread1m3m: -3, rsi1mDelta: -2 }));
    expect(result.hasRsiRollover).toBe(true);
  });

  it("sets hasGreenDanger=true when immediateGreenImpulse", () => {
    const result = evaluateShortGateAudit(sig({ immediateGreenImpulse: true }));
    expect(result.hasGreenDanger).toBe(true);
  });

  it("carries legacyBtcShortTailwindScore", () => {
    const result = evaluateShortGateAudit(sig({ btcShortTailwindScore: 42 }));
    expect(result.legacyBtcShortTailwindScore).toBe(42);
  });
});

// ─── buildShortAuditFields ────────────────────────────────────────────────────

const baseLoserMerged = {
  ...basePass,
  shortParentBucket: "TOP_LOSER_SHORTS",
  topGainerExhaustionScore: null,
  topGainerContinuationRiskScore: null,
};

const baseGainerMerged = {
  shortParentBucket: "TOP_GAINER_SHORTS",
  change24h: 15,
  entryRankInBucket: 8,
  immediateRedImpulse: true,
  redImpulseDetected: true,
  candleColorAtEntry: "RED",
  last3TicksDirection: "DOWN",
  rsi1mDelta: -1.5,
  rsi3mDelta: -1.2,
  rsi5mDelta: -0.8,
  rsiSpread1m3m: -3,
  rsiCompositeLabel: "RSI_SHORT_BIAS",
  trendCompositeLabel: "TREND_SHORT_BIAS",
  cvdLabel: "BEAR",
  priceVsVwapLabel: "BELOW_VWAP",
  failedBreakout1m: true,
  lowerHighConfirmed1m: true,
  btcRegime: "BTC_CHOP",
  spreadPct: 0.02,
  volAccel: 5,
  topGainerExhaustionScore: 60,
  topGainerContinuationRiskScore: 0,
  entryTimingGrade: "B",
  immediateGreenImpulse: false,
  greenImpulseDetected: false,
  rsi15m: 55, rsi30m: 55, rsi1h: 55,
  btcShortTailwindScore: null,
  atrPct: 1.2,
  entryRank: 8,
};

describe("buildShortAuditFields — loser bucket", () => {
  it("includes universal audit fields + loser flags + shortThesisLaneLabel", () => {
    const result = buildShortAuditFields(baseLoserMerged);
    expect(result).toHaveProperty("shortGateWouldPass");
    expect(result).toHaveProperty("hasMicroMomentum");
    expect(result).toHaveProperty("isBlindWeaknessShort");
    expect(result).toHaveProperty("isBtcBounceTrapRisk");
    expect(result).toHaveProperty("isCorpseChaseRisk");
    expect(result).toHaveProperty("shortThesisLaneLabel");
    expect(result.shortThesisLaneLabel).toBe(result.topLoserThesisLaneLabel);
  });
  it("does NOT include gainer exhaustion fields", () => {
    const result = buildShortAuditFields(baseLoserMerged);
    expect(result.topGainerThesisLaneLabel).toBeUndefined();
    expect(result.topGainerWouldPassExhaustionAudit).toBeUndefined();
  });
});

describe("buildShortAuditFields — gainer bucket", () => {
  it("includes universal + gainer audit fields + shortThesisLaneLabel", () => {
    const result = buildShortAuditFields(baseGainerMerged);
    expect(result).toHaveProperty("shortGateWouldPass");
    expect(result).toHaveProperty("topGainerThesisLaneLabel");
    expect(result).toHaveProperty("topGainerWouldPassExhaustionAudit");
    expect(result).toHaveProperty("topGainerQualityWarningLabels");
    expect(result).toHaveProperty("shortThesisLaneLabel");
    expect(result.shortThesisLaneLabel).toBe(result.topGainerThesisLaneLabel);
  });
  it("does NOT include loser-only flags", () => {
    const result = buildShortAuditFields(baseGainerMerged);
    expect(result.isBlindWeaknessShort).toBeUndefined();
    expect(result.isBtcBounceTrapRisk).toBeUndefined();
  });
});

describe("buildShortAuditFields — unknown bucket", () => {
  it("returns universal fields + shortThesisLaneLabel null", () => {
    const result = buildShortAuditFields({ ...basePass, shortParentBucket: "UNKNOWN_BUCKET" });
    expect(result).toHaveProperty("shortGateWouldPass");
    expect(result.shortThesisLaneLabel).toBeNull();
  });
});
