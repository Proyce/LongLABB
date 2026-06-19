import { describe, it, expect } from "vitest";
import {
  EXIT_PROFILE,
  EXIT_PROFILE_CONFIG,
  PROFIT_LOCK_CONFIG,
  getProfitLockRules,
  resolveInitialExitProfileBias,
  buildLiveExitContext,
  shouldActivateFastProfile,
  shouldActivateRunnerProfile,
  shouldDowngradeRunnerProfile,
  resolveDynamicExitProfile,
  getDynamicProfitLockRules,
  makeExitProfileDefaults,
} from "./dynamicExitProfiles.js";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeSample(overrides = {}) {
  return {
    entryPrice: 100,
    leverage: 5,
    longParentBucket: "TOP_LOSER_LONGS",
    highestMarginPnlPct: 0,
    profitLockActive: false,
    profitLockLevelMarginPct: null,
    activeLockFloorMarginPct: null,
    exitProfileSelected: EXIT_PROFILE.NORMAL,
    exitProfileReason: "DEFAULT_NORMAL",
    hasGreenDanger: false,
    hasRedConfirmation: false,
    hasRsiRollover: false,
    hasMicroMomentum: false,
    longGateWouldPass: false,
    cvdLabel: "NEUT",
    btcRunDirection: null,
    vwapContextLabel: null,
    greenPressureLabel: null,
    hasGainerContinuationDanger: false,
    hasGainerRedRejection: false,
    hasGainerRsiRollover: false,
    hasGainerTrendRollover: false,
    hasGainerFailedBreakout: false,
    hasGainerExhaustionConfirmation: false,
    topGainerExhaustionQualityScore: 0,
    topGainerContinuationDangerScore: 0,
    topGainerContinuationPressureLabel: null,
    topGainerPumpPhaseLabel: null,
    entryTiming: null,
    ...overrides,
  };
}

function makeLiveCtx(overrides = {}) {
  return {
    ts: Date.now(),
    currentPrice: 100,
    leverage: 5,
    priceFavorPct: 0,
    marginPnlPct: 0,
    mfeMarginPct: 0,
    sellerDanger: false,
    continuationLong: false,
    lockActive: false,
    activeLockFloorMarginPct: null,
    ...overrides,
  };
}

// â”€â”€â”€ makeExitProfileDefaults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("makeExitProfileDefaults", () => {
  it("defaults to NORMAL profile", () => {
    const d = makeExitProfileDefaults();
    expect(d.exitProfileSelected).toBe(EXIT_PROFILE.NORMAL);
    expect(d.fastProfileActivated).toBe(false);
    expect(d.safeProfileActivated).toBe(false);
    expect(d.runnerProfileActivated).toBe(false);
    expect(d.floorExitEnforced).toBe(false);
  });
});

// â”€â”€â”€ resolveDynamicExitProfile â€” NORMAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("resolveDynamicExitProfile â€” NORMAL (default)", () => {
  it("returns NORMAL when no MFE, no lock, no continuation", () => {
    const sample = makeSample();
    const live = makeLiveCtx({ mfeMarginPct: 0 });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).toBe(EXIT_PROFILE.NORMAL);
  });
});

// â”€â”€â”€ resolveDynamicExitProfile â€” FAST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("resolveDynamicExitProfile â€” FAST activation", () => {
  it("activates FAST when MFE >= 1.0 and seller danger", () => {
    const sample = makeSample();
    const live = makeLiveCtx({ mfeMarginPct: 1.5, sellerDanger: true });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).toBe(EXIT_PROFILE.FAST);
    expect(result.fastProfileActivated).toBe(true);
  });

  it("activates FAST for gainer with MFE >= 1.0 and no long continuation", () => {
    const sample = makeSample({ longParentBucket: "TOP_GAINER_LONGS" });
    const live = makeLiveCtx({ mfeMarginPct: 1.2, continuationLong: false });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).toBe(EXIT_PROFILE.FAST);
  });

  it("does NOT activate FAST when MFE < 1.0", () => {
    const sample = makeSample();
    const live = makeLiveCtx({ mfeMarginPct: 0.5, sellerDanger: true });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).toBe(EXIT_PROFILE.NORMAL);
  });
});

// â”€â”€â”€ resolveDynamicExitProfile â€” RUNNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("resolveDynamicExitProfile â€” RUNNER activation", () => {
  it("activates RUNNER when MFE >= 3.0, long continuation, loser + gate + bullish follow-through", () => {
    const sample = makeSample({
      longParentBucket: "TOP_LOSER_LONGS",
      longGateWouldPass: true,
      hasRedConfirmation: true,
      hasGreenDanger: false,
      hasRedDanger: false,
      hasMicroMomentum: true,
      btcRunDirection: "UP",
      cvdLabel: "BULL",
    });
    const live = makeLiveCtx({ mfeMarginPct: 3.5, sellerDanger: false, continuationLong: true });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).toBe(EXIT_PROFILE.RUNNER);
    expect(result.runnerProfileActivated).toBe(true);
  });

  it("does NOT activate RUNNER when seller danger is present", () => {
    const sample = makeSample({
      longGateWouldPass: true,
      hasRedConfirmation: true,
      hasMicroMomentum: true,
    });
    const live = makeLiveCtx({ mfeMarginPct: 4.0, sellerDanger: true, continuationLong: false });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).not.toBe(EXIT_PROFILE.RUNNER);
  });

  it("does NOT activate RUNNER when MFE < 3.0", () => {
    const sample = makeSample({ longGateWouldPass: true, hasRedConfirmation: true, hasMicroMomentum: true });
    const live = makeLiveCtx({ mfeMarginPct: 2.5, sellerDanger: false, continuationLong: true });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).not.toBe(EXIT_PROFILE.RUNNER);
  });
});

// â”€â”€â”€ resolveDynamicExitProfile â€” RUNNER downgrade â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("resolveDynamicExitProfile â€” RUNNER downgrade", () => {
  it("downgrades RUNNER to FAST when seller danger appears", () => {
    const sample = makeSample({
      exitProfileSelected: EXIT_PROFILE.RUNNER,
      hasGreenDanger: false,
    });
    const live = makeLiveCtx({ mfeMarginPct: 3.5, sellerDanger: true, continuationLong: false });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).toBe(EXIT_PROFILE.FAST);
    expect(result.exitProfileDowngradedFrom).toBe(EXIT_PROFILE.RUNNER);
  });

  it("downgrades RUNNER when BTC direction flips DOWN", () => {
    const sample = makeSample({
      exitProfileSelected: EXIT_PROFILE.RUNNER,
      btcRunDirection: "DOWN",
    });
    const live = makeLiveCtx({ mfeMarginPct: 3.5, sellerDanger: false });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).toBe(EXIT_PROFILE.FAST);
  });
});

// â”€â”€â”€ resolveDynamicExitProfile â€” SAFE (lock active) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("resolveDynamicExitProfile â€” SAFE when lock active", () => {
  it("activates SAFE when lock is active and no runner continuation", () => {
    const sample = makeSample();
    const live = makeLiveCtx({ mfeMarginPct: 0.5, lockActive: true });
    const result = resolveDynamicExitProfile(sample, live);
    expect(result.exitProfileSelected).toBe(EXIT_PROFILE.SAFE);
    expect(result.safeProfileActivated).toBe(true);
  });
});

// â”€â”€â”€ getDynamicProfitLockRules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("getDynamicProfitLockRules", () => {
  it("returns base rules for NORMAL profile", () => {
    const sample = makeSample({ leverage: 5, exitProfileSelected: EXIT_PROFILE.NORMAL });
    const rules = getDynamicProfitLockRules(sample);
    expect(rules).toEqual(getProfitLockRules(5));
  });

  it("returns single FAST rule for FAST profile", () => {
    const sample = makeSample({ leverage: 5, exitProfileSelected: EXIT_PROFILE.FAST });
    const rules = getDynamicProfitLockRules(sample);
    expect(rules).toHaveLength(1);
    expect(rules[0].stage).toBe("FAST_LOCK_S1");
    expect(rules[0].lockMarginPct).toBe(EXIT_PROFILE_CONFIG.FAST.lockFloorMarginPct);
  });

  it("returns single SAFE rule for SAFE profile", () => {
    const sample = makeSample({ leverage: 5, exitProfileSelected: EXIT_PROFILE.SAFE });
    const rules = getDynamicProfitLockRules(sample);
    expect(rules).toHaveLength(1);
    expect(rules[0].stage).toBe("SAFE_LOCK_S1");
  });

  it("returns RUNNER rule prepended to base rules", () => {
    const sample = makeSample({ leverage: 5, exitProfileSelected: EXIT_PROFILE.RUNNER });
    const rules = getDynamicProfitLockRules(sample);
    expect(rules[0].stage).toBe("RUNNER_LOCK_S1");
    expect(rules.length).toBeGreaterThan(1);
  });
});

// â”€â”€â”€ Floor enforcement (conceptual) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Floor enforcement math", () => {
  it("floor prevents exit worse than lock level", () => {
    const activeLockFloor = 2.0;
    const computedFinalPnlPct = 0.4;
    const finalPnlPct = Math.max(computedFinalPnlPct, activeLockFloor);
    const floorExitEnforced = finalPnlPct > computedFinalPnlPct;

    expect(finalPnlPct).toBe(2.0);
    expect(floorExitEnforced).toBe(true);
  });

  it("no floor enforcement when computed PnL is above floor", () => {
    const activeLockFloor = 2.0;
    const computedFinalPnlPct = 3.5;
    const finalPnlPct = Math.max(computedFinalPnlPct, activeLockFloor);
    const floorExitEnforced = finalPnlPct > computedFinalPnlPct;

    expect(finalPnlPct).toBe(3.5);
    expect(floorExitEnforced).toBe(false);
  });
});

// â”€â”€â”€ resolveInitialExitProfileBias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("resolveInitialExitProfileBias", () => {
  it("returns GAINER_RUNNER_CANDIDATE for strong exhaustion gainer", () => {
    const sample = makeSample({
      longParentBucket: "TOP_GAINER_LONGS",
      topGainerExhaustionQualityScore: 130,
    });
    expect(resolveInitialExitProfileBias(sample)).toBe("GAINER_RUNNER_CANDIDATE");
  });

  it("returns GAINER_FAST_CANDIDATE for regular gainer short", () => {
    const sample = makeSample({ longParentBucket: "TOP_GAINER_LONGS" });
    expect(resolveInitialExitProfileBias(sample)).toBe("GAINER_FAST_CANDIDATE");
  });

  it("returns LOSER_RUNNER_CANDIDATE for strong loser with gate + red confirm", () => {
    const sample = makeSample({
      longParentBucket: "TOP_LOSER_LONGS",
      longGateWouldPass: true,
      hasRedConfirmation: true,
      hasGreenDanger: false,
    });
    expect(resolveInitialExitProfileBias(sample)).toBe("LOSER_RUNNER_CANDIDATE");
  });

  it("returns NORMAL_CANDIDATE for unknown bucket", () => {
    const sample = makeSample({ longParentBucket: null });
    expect(resolveInitialExitProfileBias(sample)).toBe("NORMAL_CANDIDATE");
  });
});
