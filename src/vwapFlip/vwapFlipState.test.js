import { describe, it, expect } from "vitest";
import { VWAP_STATES, transitionVwapState, classifyVwapLongLabel, computeVwapReclaimQualityScore } from "./vwapFlipState.js";

// ─── STATE TRANSITIONS ────────────────────────────────────────────────────────

describe("transitionVwapState", () => {
  it("transitions BELOW → RECLAIM_ATTEMPT when price crosses up", () => {
    const next = transitionVwapState({
      currentState:         VWAP_STATES.BELOW,
      priceVsVwapLabel:     "ABOVE_VWAP",
      prevPriceVsVwapLabel: "BELOW_VWAP",
      barsAboveAfterReclaim: 0,
      cvdLabel: "BULL",
    });
    expect(next).toBe(VWAP_STATES.RECLAIM_ATTEMPT);
  });

  it("transitions RECLAIM_ATTEMPT → RECLAIM_CONFIRMED after min bars + CVD bull", () => {
    const next = transitionVwapState({
      currentState:          VWAP_STATES.RECLAIM_ATTEMPT,
      priceVsVwapLabel:      "ABOVE_VWAP",
      prevPriceVsVwapLabel:  "ABOVE_VWAP",
      barsAboveAfterReclaim: 3,
      cvdLabel:              "BULL",
    });
    expect(next).toBe(VWAP_STATES.RECLAIM_CONFIRMED);
  });

  it("transitions RECLAIM_ATTEMPT → RECLAIM_FAILED when drops below with CVD BEAR", () => {
    const next = transitionVwapState({
      currentState:          VWAP_STATES.RECLAIM_ATTEMPT,
      priceVsVwapLabel:      "BELOW_VWAP",
      prevPriceVsVwapLabel:  "ABOVE_VWAP",
      barsAboveAfterReclaim: 1,
      cvdLabel:              "BEAR",
    });
    expect(next).toBe(VWAP_STATES.RECLAIM_FAILED);
  });

  it("transitions RECLAIM_CONFIRMED → RETEST_IN_PROGRESS on shallow dip", () => {
    const next = transitionVwapState({
      currentState:          VWAP_STATES.RECLAIM_CONFIRMED,
      priceVsVwapLabel:      "BELOW_VWAP",
      prevPriceVsVwapLabel:  "ABOVE_VWAP",
      barsAboveAfterReclaim: 5,
      cvdLabel:              "NEUT",
      priceVsVwapPct:        -0.1,
    });
    expect(next).toBe(VWAP_STATES.RETEST_IN_PROGRESS);
  });

  it("transitions RETEST_IN_PROGRESS → RETEST_HOLD with green impulse", () => {
    const next = transitionVwapState({
      currentState:          VWAP_STATES.RETEST_IN_PROGRESS,
      priceVsVwapLabel:      "ABOVE_VWAP",
      prevPriceVsVwapLabel:  "BELOW_VWAP",
      barsAboveAfterReclaim: 1,
      cvdLabel:              "BULL",
      greenImpulse:          true,
    });
    expect(next).toBe(VWAP_STATES.RETEST_HOLD);
  });

  it("stays in BELOW when remains below VWAP", () => {
    const next = transitionVwapState({
      currentState:         VWAP_STATES.BELOW,
      priceVsVwapLabel:     "BELOW_VWAP",
      prevPriceVsVwapLabel: "BELOW_VWAP",
    });
    expect(next).toBe(VWAP_STATES.BELOW);
  });
});

// ─── LABELS ───────────────────────────────────────────────────────────────────

describe("classifyVwapLongLabel", () => {
  it("returns RECLAIM_CONFIRMED label", () => {
    expect(classifyVwapLongLabel(VWAP_STATES.RECLAIM_CONFIRMED, false, "NEUT"))
      .toBe("LONG_VWAP_RECLAIM_CONFIRMED");
  });
  it("returns RECLAIM_WITH_CVD_BULL label", () => {
    expect(classifyVwapLongLabel(VWAP_STATES.RECLAIM_CONFIRMED, false, "BULL"))
      .toBe("LONG_VWAP_RECLAIM_WITH_CVD_BULL");
  });
  it("returns RECLAIM_WITH_GREEN_IMPULSE label", () => {
    expect(classifyVwapLongLabel(VWAP_STATES.RECLAIM_CONFIRMED, true, "NEUT"))
      .toBe("LONG_VWAP_RECLAIM_WITH_GREEN_IMPULSE");
  });
  it("returns BELOW danger label", () => {
    expect(classifyVwapLongLabel(VWAP_STATES.BELOW, false, "BEAR"))
      .toBe("BELOW_VWAP_SELL_PRESSURE_DANGER");
  });
  it("returns RETEST_HOLD label", () => {
    expect(classifyVwapLongLabel(VWAP_STATES.RETEST_HOLD, true, "BULL"))
      .toBe("LONG_VWAP_RETEST_HOLD");
  });
});

// ─── QUALITY SCORE ────────────────────────────────────────────────────────────

describe("computeVwapReclaimQualityScore", () => {
  it("RETEST_HOLD has the highest quality", () => {
    const hold    = computeVwapReclaimQualityScore(VWAP_STATES.RETEST_HOLD, 3, "BULL");
    const attempt = computeVwapReclaimQualityScore(VWAP_STATES.RECLAIM_ATTEMPT, 1, "NEUT");
    expect(hold).toBeGreaterThan(attempt);
  });
  it("CVD BULL adds bonus to positive states", () => {
    const withBull = computeVwapReclaimQualityScore(VWAP_STATES.RECLAIM_CONFIRMED, 2, "BULL");
    const withNeut = computeVwapReclaimQualityScore(VWAP_STATES.RECLAIM_CONFIRMED, 2, "NEUT");
    expect(withBull).toBeGreaterThan(withNeut);
  });
  it("RECLAIM_FAILED has low quality", () => {
    const score = computeVwapReclaimQualityScore(VWAP_STATES.RECLAIM_FAILED, 0, "BEAR");
    expect(score).toBeLessThan(20);
  });
});
