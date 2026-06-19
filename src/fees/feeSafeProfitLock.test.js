import { describe, it, expect } from "vitest";
import { applyFeeSafeFirstProfitLockRule, applyMonotonicFloorOnProfileChange } from "./feeSafeProfitLock.js";
import { DEFAULT_FEE_CONFIG } from "./feeConfig.js";
import { getDynamicProfitLockRules, EXIT_PROFILE } from "../exitProfiles/dynamicExitProfiles.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSample(overrides = {}) {
  return {
    entryPrice: 100,
    leverage: 10,
    exitProfileSelected: EXIT_PROFILE.NORMAL,
    activeLockFloorMarginPct: null,
    feeSnapshot: {
      entryFeeRatePct: 0.05,
      exitFeeRatePct: 0.05,
      feeSource: "SIMULATED_CONFIG",
    },
    ...overrides,
  };
}

// Raw FAST rules at 10× produce: trigger = 1.0% price = 0.10% margin (WRONG — need to check)
// Actually: FAST lockTriggerMarginPct=1.0, lockFloorMarginPct=0.8
// At 10×: triggerPricePct = 1.0/10 = 0.10, lockMarginPct = 0.8
// Fee drag at 10× = 1.00% margin
// Min net = 0.25%, so required floor = 0.05*10 + 0.05*10 + 0.25 = 1.25%

describe("feeSafeProfitLock — spec table examples", () => {
  it("3×: raw FAST floor 0.8% exceeds fee-safe minimum (~0.55%), floor not raised", () => {
    // fee drag at 3× = 0.30%. required floor = 0.25+0.15+0.15 = 0.55. raw=0.8 > 0.55 → floor stays
    // Trigger may still be raised for headroom: raw trigger at 3× = 1.0%margin, floor+headroom = 0.8+0.5=1.3
    const s = makeSample({ leverage: 3, exitProfileSelected: EXIT_PROFILE.FAST });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    // Floor stays at 0.8% (not raised for fees)
    expect(diagnostics.firstLockFloorRaisedForFees).toBe(false);
    expect(effectiveRules[0].lockMarginPct).toBeCloseTo(0.8, 2);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });

  it("5×: raw FAST floor 0.8% → should raise to 0.75%+ (fee drag 0.50%, min net 0.25%)", () => {
    // required = 0.25 + 0.05*5 + 0.05*5 = 0.25 + 0.25 + 0.25 = 0.75
    const s = makeSample({ leverage: 5, exitProfileSelected: EXIT_PROFILE.FAST });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(0.75);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });

  it("10×: FAST floor 0.8% must raise to ≥1.25%", () => {
    const s = makeSample({ leverage: 10, exitProfileSelected: EXIT_PROFILE.FAST });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(1.25);
    expect(diagnostics.firstLockFloorRaisedForFees).toBe(true);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });

  it("10×: SAFE floor 1.2% must raise to ≥1.25%", () => {
    const s = makeSample({ leverage: 10, exitProfileSelected: EXIT_PROFILE.SAFE });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(1.25);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });

  it("10×: RUNNER floor 2.0% already above 1.25% → stays, already fee-safe", () => {
    const s = makeSample({ leverage: 10, exitProfileSelected: EXIT_PROFILE.RUNNER });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(2.0);
    expect(diagnostics.firstLockAlreadyFeeSafe).toBe(true);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });

  it("20×: FAST floor 0.8% must raise to ≥2.25%", () => {
    const s = makeSample({ leverage: 20, exitProfileSelected: EXIT_PROFILE.FAST });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(2.25);
    expect(diagnostics.firstLockFloorRaisedForFees).toBe(true);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });

  it("20×: SAFE floor 1.2% must raise to ≥2.25%", () => {
    const s = makeSample({ leverage: 20, exitProfileSelected: EXIT_PROFILE.SAFE });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(2.25);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });

  it("20×: RUNNER floor 2.0% must raise to ≥2.25%", () => {
    const s = makeSample({ leverage: 20, exitProfileSelected: EXIT_PROFILE.RUNNER });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(2.25);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });
});

describe("feeSafeProfitLock — trigger headroom", () => {
  it("raised trigger maintains at least minTriggerToFloorHeadroom above floor", () => {
    const s = makeSample({ leverage: 20, exitProfileSelected: EXIT_PROFILE.FAST });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    const floorMargin   = effectiveRules[0].lockMarginPct;
    const triggerMargin = effectiveRules[0].triggerPricePct * s.leverage;
    const headroom      = DEFAULT_FEE_CONFIG.profitLockFeeSafety.minTriggerToFloorHeadroomMarginPct;
    expect(triggerMargin).toBeGreaterThanOrEqual(floorMargin + headroom - 0.001);
    expect(diagnostics.firstLockTriggerRaisedForHeadroom).toBe(true);
  });

  it("scenario 21: trigger raised when existing trigger exactly meets raised floor", () => {
    // Force a scenario where raw trigger == raised floor
    const s = makeSample({ leverage: 10, exitProfileSelected: EXIT_PROFILE.FAST });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    const triggerPricePct = effectiveRules[0].triggerPricePct;
    const floorMarginPct  = effectiveRules[0].lockMarginPct;
    expect(triggerPricePct * 10).toBeGreaterThanOrEqual(floorMarginPct + 0.50 - 0.001);
  });
});

describe("feeSafeProfitLock — never lower existing floor", () => {
  it("scenario 24: profile change with existing active floor — floor never lowered", () => {
    const s = makeSample({ leverage: 10, exitProfileSelected: EXIT_PROFILE.FAST, activeLockFloorMarginPct: 3.0 });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules } = applyFeeSafeFirstProfitLockRule({
      sample: s,
      rawRules,
      config: DEFAULT_FEE_CONFIG,
      existingActiveLockFloorMarginPct: 3.0,
    });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(3.0);
  });

  it("monotonic floor protection via applyMonotonicFloorOnProfileChange", () => {
    const s = makeSample({ leverage: 10, exitProfileSelected: EXIT_PROFILE.NORMAL });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules } = applyMonotonicFloorOnProfileChange({
      newRawRules: rawRules,
      currentActiveLockFloorMarginPct: 5.0,
      sample: s,
      config: DEFAULT_FEE_CONFIG,
    });
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(5.0);
  });
});

describe("feeSafeProfitLock — edge cases", () => {
  it("empty rawRules returns empty", () => {
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({
      sample: makeSample(),
      rawRules: [],
      config: DEFAULT_FEE_CONFIG,
    });
    expect(effectiveRules).toEqual([]);
    expect(diagnostics.firstLockFeeSafetyApplied).toBe(false);
  });

  it("disabled safety returns raw rules unchanged", () => {
    const cfg = { ...DEFAULT_FEE_CONFIG, profitLockFeeSafety: { ...DEFAULT_FEE_CONFIG.profitLockFeeSafety, enabled: false } };
    const s = makeSample({ leverage: 20, exitProfileSelected: EXIT_PROFILE.FAST });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: cfg });
    expect(effectiveRules).toBe(rawRules);
    expect(diagnostics.firstLockFeeSafetyApplied).toBe(false);
  });

  it("scenario 22: actual maker entry fee + projected taker exit fee", () => {
    const s = makeSample({
      leverage: 10,
      exitProfileSelected: EXIT_PROFILE.FAST,
      feeSnapshot: { entryFeeRatePct: 0.02, exitFeeRatePct: 0.05, feeSource: "EXCHANGE_FILL" },
    });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({
      sample: s,
      rawRules,
      config: DEFAULT_FEE_CONFIG,
    });
    // entry = 0.02*10 = 0.20%, exit = 0.05*10 = 0.50%, total = 0.70%, min net = 0.25%
    // required floor = 0.95%
    expect(effectiveRules[0].lockMarginPct).toBeGreaterThanOrEqual(0.95);
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
    expect(diagnostics.firstLockFeeCalculationSource).toBe("ACTUAL_EXCHANGE");
  });

  it("execution mode flags are correctly set", () => {
    const s = makeSample({ leverage: 10 });
    const rawRules = getDynamicProfitLockRules(s);
    const { diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(diagnostics.feeSafeFirstLockExecutionMode).toBe("APPLY_FIRST_LOCK_ONLY");
    expect(diagnostics.feeSafeFirstLockExecutionApplied).toBe(true);
    expect(diagnostics.feeSafeFirstLockCanAffectTrades).toBe(true);
    expect(diagnostics.feeAwareExecutionMode).toBe("LOG_ONLY");
    expect(diagnostics.feeAwareExecutionApplied).toBe(false);
    expect(diagnostics.feeAwareExecutionCanAffectTrades).toBe(false);
  });

  it("later rules beyond index 0 are NOT fee-clamped", () => {
    const s = makeSample({ leverage: 10, exitProfileSelected: EXIT_PROFILE.RUNNER });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    // Runner has first stage + inherited profit lock stages. Later stages keep raw lockMarginPct.
    if (effectiveRules.length > 1) {
      expect(effectiveRules[1].lockMarginPct).toBe(rawRules[1].lockMarginPct);
    }
  });
});

describe("feeSafeProfitLock — 1× leverage", () => {
  it("1× taker/taker: round-trip = 0.10%, min floor = 0.35%", () => {
    const s = makeSample({ leverage: 1 });
    const rawRules = getDynamicProfitLockRules(s);
    const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({ sample: s, rawRules, config: DEFAULT_FEE_CONFIG });
    expect(diagnostics.projectedFirstLockNetAfterFeesMarginPct).toBeGreaterThanOrEqual(0.25);
  });
});
