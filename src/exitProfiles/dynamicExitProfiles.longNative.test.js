// ─── DYNAMIC EXIT PROFILES: LONG-NATIVE CORRECTNESS TESTS ───────────────────
// These tests verify the P0 exit profile fixes:
//   1. priceFavorPct is positive when price rises (long = up is good)
//   2. Green impulse / CVD BULL / BTC UP support continuation, not danger
//   3. Red impulse / CVD BEAR / BTC DOWN trigger seller danger
//   4. Runner activates on long continuation, not short signals

import { describe, it, expect } from "vitest";
import {
  buildLiveExitContext,
  shouldActivateFastProfile,
  shouldActivateRunnerProfile,
  shouldDowngradeRunnerProfile,
  EXIT_PROFILE,
} from "./dynamicExitProfiles.js";

const baseSample = {
  entryPrice: 100,
  leverage: 10,
  longParentBucket: "TOP_LOSER_LONGS",
  exitProfileSelected: EXIT_PROFILE.NORMAL,
};

describe("buildLiveExitContext — long PnL direction", () => {
  it("price above entry => positive priceFavorPct", () => {
    const ctx = buildLiveExitContext(baseSample, 105, Date.now());
    expect(ctx.priceFavorPct).toBeGreaterThan(0);
    expect(ctx.marginPnlPct).toBeGreaterThan(0);
  });

  it("price below entry => negative priceFavorPct", () => {
    const ctx = buildLiveExitContext(baseSample, 95, Date.now());
    expect(ctx.priceFavorPct).toBeLessThan(0);
    expect(ctx.marginPnlPct).toBeLessThan(0);
  });

  it("BTC UP does NOT trigger sellerDanger", () => {
    const sample = { ...baseSample, btcRunDirection: "UP" };
    const ctx = buildLiveExitContext(sample, 105, Date.now());
    expect(ctx.sellerDanger).toBe(false);
  });

  it("BTC DOWN triggers sellerDanger", () => {
    const sample = { ...baseSample, btcRunDirection: "DOWN" };
    const ctx = buildLiveExitContext(sample, 105, Date.now());
    expect(ctx.sellerDanger).toBe(true);
  });

  it("CVD BULL does NOT trigger sellerDanger", () => {
    const sample = { ...baseSample, cvdLabel: "BULL" };
    const ctx = buildLiveExitContext(sample, 105, Date.now());
    expect(ctx.sellerDanger).toBe(false);
  });

  it("CVD BEAR triggers sellerDanger", () => {
    const sample = { ...baseSample, cvdLabel: "BEAR" };
    const ctx = buildLiveExitContext(sample, 105, Date.now());
    expect(ctx.sellerDanger).toBe(true);
  });

  it("green impulse supports continuationLong, not sellerDanger", () => {
    const sample = {
      ...baseSample,
      immediateGreenImpulse: true,
      hasGreenConfirmation: true,
      cvdLabel: "BULL",
      btcRunDirection: "UP",
    };
    const ctx = buildLiveExitContext(sample, 105, Date.now());
    expect(ctx.sellerDanger).toBe(false);
    expect(ctx.continuationLong).toBe(true);
  });

  it("red impulse triggers sellerDanger and blocks continuationLong", () => {
    const sample = {
      ...baseSample,
      immediateRedImpulse: true,
      redPressureLabel: "IMMEDIATE_RED_ACTIVE",
      cvdLabel: "BEAR",
    };
    const ctx = buildLiveExitContext(sample, 95, Date.now());
    expect(ctx.sellerDanger).toBe(true);
    expect(ctx.continuationLong).toBe(false);
  });

  it("VWAP_RECLAIM supports continuationLong", () => {
    const sample = {
      ...baseSample,
      vwapContextLabel: "VWAP_RECLAIM",
      immediateGreenImpulse: true,
      cvdLabel: "BULL",
    };
    const ctx = buildLiveExitContext(sample, 105, Date.now());
    expect(ctx.continuationLong).toBe(true);
  });

  it("VWAP_LOSS triggers sellerDanger", () => {
    const sample = { ...baseSample, vwapContextLabel: "VWAP_LOSS" };
    const ctx = buildLiveExitContext(sample, 99, Date.now());
    expect(ctx.sellerDanger).toBe(true);
  });
});

describe("shouldActivateRunnerProfile — long continuation required", () => {
  const highMfeSample = {
    ...baseSample,
    exitProfileSelected: EXIT_PROFILE.NORMAL,
    longGateWouldPass: true,
    hasGreenConfirmation: true,
    cvdLabel: "BULL",
    btcRunDirection: "UP",
  };

  it("activates RUNNER when MFE is high and continuationLong is true", () => {
    const live = buildLiveExitContext(highMfeSample, 130, Date.now(), {
      highestMarginPnlPct: 35,
    });
    const result = shouldActivateRunnerProfile(highMfeSample, live);
    expect(result).toBe(true);
  });

  it("does NOT activate RUNNER when sellerDanger is present", () => {
    const sample = { ...highMfeSample, cvdLabel: "BEAR", btcRunDirection: "DOWN" };
    const live = buildLiveExitContext(sample, 130, Date.now(), {
      highestMarginPnlPct: 35,
    });
    const result = shouldActivateRunnerProfile(sample, live);
    expect(result).toBe(false);
  });
});

describe("shouldDowngradeRunnerProfile — long downgrade triggers", () => {
  const runnerSample = {
    ...baseSample,
    exitProfileSelected: EXIT_PROFILE.RUNNER,
  };

  it("downgrades RUNNER when CVD BEAR appears", () => {
    const sample = { ...runnerSample, cvdLabel: "BEAR" };
    const live   = buildLiveExitContext(sample, 105, Date.now());
    expect(shouldDowngradeRunnerProfile(sample, live)).toBe(true);
  });

  it("downgrades RUNNER when BTC DOWN appears", () => {
    const sample = { ...runnerSample, btcRunDirection: "DOWN" };
    const live   = buildLiveExitContext(sample, 105, Date.now());
    expect(shouldDowngradeRunnerProfile(sample, live)).toBe(true);
  });

  it("does NOT downgrade RUNNER when CVD BULL and BTC UP", () => {
    const sample = {
      ...runnerSample,
      cvdLabel: "BULL",
      btcRunDirection: "UP",
      hasGreenConfirmation: true,
    };
    const live = buildLiveExitContext(sample, 115, Date.now());
    expect(shouldDowngradeRunnerProfile(sample, live)).toBe(false);
  });

  it("does NOT downgrade RUNNER on green impulse alone", () => {
    const sample = {
      ...runnerSample,
      immediateGreenImpulse: true,
      cvdLabel: "BULL",
      btcRunDirection: "UP",
    };
    const live = buildLiveExitContext(sample, 112, Date.now());
    expect(shouldDowngradeRunnerProfile(sample, live)).toBe(false);
  });
});

describe("priceFavorPct correctness — regression guard", () => {
  it("10% up from entry at 10x = +100% marginPnl", () => {
    const ctx = buildLiveExitContext({ ...baseSample, entryPrice: 100 }, 110, Date.now());
    expect(ctx.priceFavorPct).toBeCloseTo(10, 2);
    expect(ctx.marginPnlPct).toBeCloseTo(100, 2);
  });

  it("5% down from entry at 10x = -50% marginPnl", () => {
    const ctx = buildLiveExitContext({ ...baseSample, entryPrice: 100 }, 95, Date.now());
    expect(ctx.priceFavorPct).toBeCloseTo(-5, 2);
    expect(ctx.marginPnlPct).toBeCloseTo(-50, 2);
  });
});
