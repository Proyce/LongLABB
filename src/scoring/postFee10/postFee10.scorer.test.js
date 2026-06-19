import { describe, expect, it } from "vitest";
import {
  calculatePostFee10EntryAssessment,
  buildPostFee10EntrySnapshot,
} from "./index.js";

const baseSnapshot = {
  timestamp: "2026-06-07T20:00:00.000Z",
  symbol: "TESTUSDT",
  tradeId: "t1",
  runId: "1",
  setId: "s1",
  batchId: "b1",
  leaderboardTab: "losers",

  candleColorAtEntry: "RED",
  immediateRedImpulse: true,
  redImpulseDetected: true,
  immediateGreenImpulse: false,
  greenImpulseDetected: false,
  last3TicksDirection: "DOWN",

  cvdLabel: "BEAR",
  atrPct: 1.05,
  priceVsVwapPct: -0.4,
  priceVsVwapLabel: "BELOW_VWAP",
  vwapContextLabel: "BELOW_VWAP_WITH_RED_CONFIRMATION",

  rsi1m: 42,
  rsi3m: 48,
  rsi5m: 52,
  rsi1mDelta: -3,
  macdHistogram1m: -0.002,
  macdHistogramDelta1m: -0.001,
  macdHistogramState1m: "NEGATIVE_EXPANDING",
  dmiBias5m: "BEARISH_DMI",
  adxStrength5m: "STRONG",

  spreadPct: 0.02,
  quoteVolume: 35_000_000,
  thinBook: false,

  btcRunDirection: "DOWN",
  btcRegime: "BTC_WEAK_DOWN",

  shortGatePass: true,
  entryRank: 8,

  exhaustionScore: null,
  exhaustionQualityScore: null,
  failedBreakout: null,
  pumpStillHot: null,

  lowerHighConfirmed1m: true,
  hasMicroMomentum: true,
};

const s = overrides => ({ ...baseSnapshot, ...(overrides ?? {}) });

describe("calculatePostFee10EntryAssessment", () => {
  it("scores immediate red, no green, CVD BEAR, and ATR 1.0 highly", () => {
    const result = calculatePostFee10EntryAssessment(s());

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.tier).toBe("GOD_TIER");
    expect(result.labels).toContain("IMMEDIATE_RED_IMPULSE");
    expect(result.labels).toContain("NO_GREEN_IMPULSE");
    expect(result.labels).toContain("CVD_BEAR");
    expect(result.labels).toContain("POST_FEE_10_SNIPER");
  });

  it("applies a severe immediate green impulse penalty", () => {
    const result = calculatePostFee10EntryAssessment(s({
      immediateGreenImpulse: true,
      candleColorAtEntry: "GREEN",
    }));

    expect(result.warnings).toContain("GREEN_IMPULSE_DANGER");
    expect(result.score).toBeLessThan(65);
  });

  it("applies a severe bullish CVD penalty", () => {
    const result = calculatePostFee10EntryAssessment(s({ cvdLabel: "BULL" }));

    expect(result.warnings).toContain("BULLISH_CVD_DANGER");
    expect(result.score).toBeLessThan(75);
    expect(result.labels).not.toContain("POST_FEE_10_CANDIDATE");
  });

  it("penalizes above VWAP buyer acceleration without red rejection", () => {
    const result = calculatePostFee10EntryAssessment(s({
      priceVsVwapPct: 0.3,
      priceVsVwapLabel: "ABOVE_VWAP",
      vwapContextLabel: "ABOVE_VWAP_GREEN_DANGER",
      aboveVwapRejectionWithRed: false,
      failedBreakoutWithRed: false,
      volAccel: 20,
    }));

    expect(result.warnings).toContain("ABOVE_VWAP_BUYER_ACCEL_DANGER");
  });

  it("does not turn below-VWAP weakness without fresh selling into a sniper", () => {
    const result = calculatePostFee10EntryAssessment(s({
      candleColorAtEntry: "DOJI",
      immediateRedImpulse: false,
      redImpulseDetected: false,
      last3TicksDirection: "MIXED",
      lowerHighConfirmed1m: false,
      hasRedConfirmation: false,
    }));

    expect(result.warnings).toContain("NO_FRESH_SELLING");
    expect(result.labels).not.toContain("POST_FEE_10_SNIPER");
  });

  it("does not award ATR points below 0.2", () => {
    const result = calculatePostFee10EntryAssessment(s({ atrPct: 0.19 }));

    expect(result.labels).toContain("ATR_DEAD");
    expect(result.universalScore).toBeLessThan(calculatePostFee10EntryAssessment(s({ atrPct: 1 })).universalScore);
  });

  it("does not interpret missing boolean inputs as false", () => {
    const result = calculatePostFee10EntryAssessment(s({
      immediateGreenImpulse: null,
      greenImpulseDetected: null,
    }));

    expect(result.labels).not.toContain("NO_GREEN_IMPULSE");
    expect(result.missingInputs).toContain("immediateGreenImpulse");
    expect(result.missingInputs).toContain("greenImpulseDetected");
  });

  it("always clamps score between 0 and 100", () => {
    const low = calculatePostFee10EntryAssessment(s({
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
      cvdLabel: "BULL",
      pumpStillHot: true,
      spreadPct: 0.5,
      btcRunDirection: "UP",
      candleColorAtEntry: "GREEN",
    }));
    const high = calculatePostFee10EntryAssessment(s({
      quoteVolume: 1_000_000_000,
      entryRank: 1,
    }));

    expect(low.score).toBeGreaterThanOrEqual(0);
    expect(low.score).toBeLessThanOrEqual(100);
    expect(high.score).toBeGreaterThanOrEqual(0);
    expect(high.score).toBeLessThanOrEqual(100);
  });

  it("returns an immutable entry assessment", () => {
    const result = calculatePostFee10EntryAssessment(s());

    expect(Object.isFrozen(result)).toBe(true);
  });

  it("isolates loser and gainer side bonuses", () => {
    const loser = calculatePostFee10EntryAssessment(s({
      leaderboardTab: "losers",
      shortGatePass: true,
      entryRank: 5,
      exhaustionScore: 120,
      exhaustionQualityScore: 140,
      failedBreakout: true,
    }));
    const gainer = calculatePostFee10EntryAssessment(s({
      leaderboardTab: "gainers",
      shortGatePass: true,
      entryRank: 5,
      exhaustionScore: 120,
      exhaustionQualityScore: 140,
      failedBreakout: true,
      pumpStillHot: false,
      gainerMicroMultiConfirm: true,
    }));

    expect(loser.labels).toContain("LOSER_SHORT_GATE_CONFIRMED");
    expect(loser.labels).not.toContain("GAINER_FAILED_BREAKOUT");
    expect(gainer.labels).toContain("GAINER_FAILED_BREAKOUT");
    expect(gainer.labels).not.toContain("LOSER_SHORT_GATE_CONFIRMED");
  });

  it("does not award BTC points from btcShortTailwindScore alone", () => {
    const withTailwindOnly = calculatePostFee10EntryAssessment(s({
      btcRunDirection: null,
      btcRegime: null,
      btcDirection5m: null,
      btcDirection15m: null,
      btcDirection1h: null,
      btcAlignment: null,
      btcShortTailwindScore: 100,
    }));
    const withoutTailwind = calculatePostFee10EntryAssessment(s({
      btcRunDirection: null,
      btcRegime: null,
      btcDirection5m: null,
      btcDirection15m: null,
      btcDirection1h: null,
      btcAlignment: null,
    }));

    expect(withTailwindOnly.universalScore).toBe(withoutTailwind.universalScore);
  });

  it("does not let hindsight fields leak into entry scoring", () => {
    const clean = calculatePostFee10EntryAssessment(s());
    const leaked = calculatePostFee10EntryAssessment(s({
      finalPnl: 999,
      finalPnlPct: 999,
      feeAdjustedFinalPnlPct: 999,
      mfe: 999,
      mae: -999,
      exitTimestamp: "2026-06-07T21:00:00.000Z",
      exitReason: "TP",
      futureCandles: [{ close: 1 }],
      bestSimExitProfile: "RUNNER",
      hindsightDiagnostics: ["WINNER"],
    }));

    expect(leaked.score).toBe(clean.score);
    expect(leaked.labels).toEqual(clean.labels);
  });
});

describe("buildPostFee10EntrySnapshot", () => {
  it("freezes the scoring snapshot and keeps missing booleans unknown", () => {
    const snapshot = buildPostFee10EntrySnapshot({
      id: 1,
      symbol: "ABCUSDT",
      leaderboardSide: "LOSERS",
      entryTime: Date.parse("2026-06-07T20:00:00.000Z"),
      entryTelemetry: { redImpulseDetected: false },
    });

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.immediateGreenImpulse).toBeNull();
    expect(snapshot.greenImpulseDetected).toBeNull();
  });
});

