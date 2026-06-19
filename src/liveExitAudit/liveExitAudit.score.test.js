import { describe, it, expect } from "vitest";
import { computeLiveExitScore } from "./liveExitAudit.score.js";

function makeSignals(overrides = {}) {
  return {
    liveExitPostFee10LiveConfirmationScore: 50,
    liveExitRunnerCapturePotentialScore:   30,
    liveExitRunnerScorePeak:               0,
    liveExitMfePct:                        0,
    liveExitMaePct:                        0,
    liveExitCurrentPnlPct:                 0,
    liveExitSecondsInTrade:                30,
    liveExitMfeGivebackPct:                0,
    liveExitBuyerDanger:                   false,
    liveExitLongAuditDangerNow:            false,
    liveExitMarketBreathFlipAgainstShort:  false,
    ...overrides,
  };
}

describe("computeLiveExitScore", () => {
  it("returns base score of 50 with neutral signals", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(makeSignals());
    expect(liveExitScore).toBe(50);
    expect(liveExitReasons).toEqual([]);
  });

  it("adds 20 for strong live confirm (>= 70)", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitPostFee10LiveConfirmationScore: 75 }),
    );
    expect(liveExitScore).toBe(70);
    expect(liveExitReasons).toContain("LIVE_CONFIRM_STRONG");
  });

  it("subtracts 20 for weak live confirm (< 35)", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitPostFee10LiveConfirmationScore: 30 }),
    );
    expect(liveExitScore).toBe(30);
    expect(liveExitReasons).toContain("LIVE_CONFIRM_WEAK");
  });

  it("adds 20 for strong runner capture (>= 40)", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitRunnerCapturePotentialScore: 45 }),
    );
    expect(liveExitScore).toBe(70);
    expect(liveExitReasons).toContain("RUNNER_CAPTURE_STRONG");
  });

  it("subtracts 15 for weak runner capture (< 15)", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitRunnerCapturePotentialScore: 10 }),
    );
    expect(liveExitScore).toBe(35);
    expect(liveExitReasons).toContain("RUNNER_CAPTURE_WEAK");
  });

  it("adds 10 for runner peak >= 40", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitRunnerScorePeak: 50 }),
    );
    expect(liveExitScore).toBe(60);
    expect(liveExitReasons).toContain("RUNNER_PEAK_PRESENT");
  });

  it("adds 10 for proven profit (mfe >= 1.0 and currentPnl > 0)", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitMfePct: 1.5, liveExitCurrentPnlPct: 0.5 }),
    );
    expect(liveExitScore).toBe(60);
    expect(liveExitReasons).toContain("TRADE_HAS_PROVEN_PROFIT");
  });

  it("does not add proven profit when mfe < 1.0", () => {
    const { liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitMfePct: 0.5, liveExitCurrentPnlPct: 0.3 }),
    );
    expect(liveExitReasons).not.toContain("TRADE_HAS_PROVEN_PROFIT");
  });

  it("subtracts 20 for no profit proof after 45s (mfe < 0.35, pnl <= 0)", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitSecondsInTrade: 60, liveExitMfePct: 0.1, liveExitCurrentPnlPct: 0 }),
    );
    expect(liveExitScore).toBe(30);
    expect(liveExitReasons).toContain("NO_PROFIT_PROOF_AFTER_TIME");
  });

  it("does not subtract for no-profit if under 45s", () => {
    const { liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitSecondsInTrade: 30, liveExitMfePct: 0.1, liveExitCurrentPnlPct: 0 }),
    );
    expect(liveExitReasons).not.toContain("NO_PROFIT_PROOF_AFTER_TIME");
  });

  it("subtracts 20 for MAE growing badly (mae <= -0.7 and pnl < 0)", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitMaePct: -0.8, liveExitCurrentPnlPct: -0.5 }),
    );
    expect(liveExitScore).toBe(30);
    expect(liveExitReasons).toContain("MAE_GROWING_BADLY");
  });

  it("does not subtract for MAE if pnl > 0", () => {
    const { liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitMaePct: -0.8, liveExitCurrentPnlPct: 0.5 }),
    );
    expect(liveExitReasons).not.toContain("MAE_GROWING_BADLY");
  });

  it("subtracts 15 for MFE giveback (giveback >= 0.8 and pnl > 0)", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitMfeGivebackPct: 1.0, liveExitCurrentPnlPct: 0.5 }),
    );
    expect(liveExitScore).toBe(35);
    expect(liveExitReasons).toContain("MFE_GIVEBACK_WARNING");
  });

  it("subtracts 30 for buyer danger", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitBuyerDanger: true }),
    );
    expect(liveExitScore).toBe(20);
    expect(liveExitReasons).toContain("BUYER_DANGER_RETURNED");
  });

  it("subtracts 25 for long audit danger", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitLongAuditDangerNow: true }),
    );
    expect(liveExitScore).toBe(25);
    expect(liveExitReasons).toContain("LONG_AUDIT_DANGER_AFTER_ENTRY");
  });

  it("subtracts 20 for market breath flip", () => {
    const { liveExitScore, liveExitReasons } = computeLiveExitScore(
      makeSignals({ liveExitMarketBreathFlipAgainstShort: true }),
    );
    expect(liveExitScore).toBe(30);
    expect(liveExitReasons).toContain("MARKET_BREATH_FLIPPED_AGAINST_LONG");
  });

  it("clamps score to 0 when all danger signals active", () => {
    const { liveExitScore } = computeLiveExitScore(
      makeSignals({
        liveExitPostFee10LiveConfirmationScore: 10,
        liveExitRunnerCapturePotentialScore:    5,
        liveExitBuyerDanger:                   true,
        liveExitLongAuditDangerNow:            true,
        liveExitMarketBreathFlipAgainstShort:  true,
        liveExitMaePct:                        -1.0,
        liveExitCurrentPnlPct:                 -0.5,
        liveExitSecondsInTrade:                60,
        liveExitMfePct:                        0.1,
      }),
    );
    expect(liveExitScore).toBe(0);
  });

  it("clamps score to 100 when all positive signals active", () => {
    const { liveExitScore } = computeLiveExitScore(
      makeSignals({
        liveExitPostFee10LiveConfirmationScore: 90,
        liveExitRunnerCapturePotentialScore:    80,
        liveExitRunnerScorePeak:               60,
        liveExitMfePct:                        2.0,
        liveExitCurrentPnlPct:                 1.5,
      }),
    );
    expect(liveExitScore).toBe(100);
  });
});
