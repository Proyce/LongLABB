import { describe, it, expect } from "vitest";
import {
  SHADOW_LONG_CONFIG,
  getEarlySlDurationLabel,
  getEarlySlBooleans,
  classifyShadowLongAtr,
  isEarlySlAuditCandidate,
  isShadowLongHypothesisEligible,
  buildShadowLongAudit,
  computeShadowLongPnl,
  computeCombinedFlipPnl,
  computeRescueMeasurements,
  captureHorizonPnl,
  computeMfeMae,
  simulateMirrorLongProfile,
  simulateAtrAdaptiveLongProfile,
  classifyShadowLongOutcome,
  checkWhipsaw,
  updateShadowLongAudit,
  finalizeShadowLongAudit,
} from "./shadowLongAudit.js";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function makeSource(overrides = {}) {
  const now = Date.now();
  return {
    id:            "trade-abc",
    symbol:        "SOLUSDT",
    closeReason:   "SL",
    entryTime:     now - 45_000,
    closedAt:      now,
    entryPrice:    100,
    exitPrice:     101,
    finalPnlPct:   -5,
    feeAdjustedFinalPnlPct: -5.5,
    leverage:      5,
    atrPct:        0.8,
    atrBucket:     "ATR_0_6_TO_1_0",
    run:           1,
    shortParentBucket: "TOP_LOSER_SHORTS",
    ...overrides,
  };
}

function makeAuditWith(priceHistory = [], sourceOverrides = {}) {
  const source = makeSource(sourceOverrides);
  const entryPrice = 101;
  const now  = source.closedAt;
  const audit = buildShadowLongAudit(source, 101, now, {}, SHADOW_LONG_CONFIG);
  return { ...audit, priceHistory };
}

// ─── TRIGGER TESTS ────────────────────────────────────────────────────────────

describe("isEarlySlAuditCandidate", () => {
  it("SL at 59s → true", () => {
    const s = makeSource({ entryTime: Date.now() - 59_000, closedAt: Date.now() });
    expect(isEarlySlAuditCandidate(s)).toBe(true);
  });

  it("SL at 61s with ATR 0.7 → true (comparison universe, ATR not checked here)", () => {
    const s = makeSource({ entryTime: Date.now() - 61_000, closedAt: Date.now() });
    expect(isEarlySlAuditCandidate(s)).toBe(true);
  });

  it("SL at 181s → false", () => {
    const s = makeSource({ entryTime: Date.now() - 181_000, closedAt: Date.now() });
    expect(isEarlySlAuditCandidate(s)).toBe(false);
  });

  it("TIMEOUT close → false", () => {
    const s = makeSource({ closeReason: "TIMEOUT" });
    expect(isEarlySlAuditCandidate(s)).toBe(false);
  });

  it("TRAIL close → false", () => {
    const s = makeSource({ closeReason: "TRAIL" });
    expect(isEarlySlAuditCandidate(s)).toBe(false);
  });

  it("null trade → false", () => {
    expect(isEarlySlAuditCandidate(null)).toBe(false);
  });
});

describe("isShadowLongHypothesisEligible", () => {
  it("SL at 59s and ATR 0.7 → eligible", () => {
    const s = makeSource({ entryTime: Date.now() - 59_000, closedAt: Date.now(), atrPct: 0.7 });
    const { eligible, reasons } = isShadowLongHypothesisEligible(s);
    expect(eligible).toBe(true);
    expect(reasons).toHaveLength(0);
  });

  it("SL at 61s and ATR 0.7 → not eligible (DURATION_TOO_LONG)", () => {
    const s = makeSource({ entryTime: Date.now() - 61_000, closedAt: Date.now(), atrPct: 0.7 });
    const { eligible, reasons } = isShadowLongHypothesisEligible(s);
    expect(eligible).toBe(false);
    expect(reasons).toContain("DURATION_TOO_LONG");
  });

  it("SL at 30s and ATR 0.3 → not eligible (ATR_BELOW_THRESHOLD)", () => {
    const s = makeSource({ entryTime: Date.now() - 30_000, closedAt: Date.now(), atrPct: 0.3 });
    const { eligible, reasons } = isShadowLongHypothesisEligible(s);
    expect(eligible).toBe(false);
    expect(reasons).toContain("ATR_BELOW_THRESHOLD");
  });

  it("stale market → not eligible", () => {
    const s = makeSource({ isStale: true });
    const { eligible, reasons } = isShadowLongHypothesisEligible(s);
    expect(eligible).toBe(false);
    expect(reasons).toContain("STALE_MARKET");
  });

  it("invalidMarket → not eligible", () => {
    const s = makeSource({ isInvalidMarket: true });
    const { eligible, reasons } = isShadowLongHypothesisEligible(s);
    expect(eligible).toBe(false);
    expect(reasons).toContain("INVALID_MARKET");
  });

  it("no ATR → not eligible (ATR_MISSING)", () => {
    const s = makeSource({ atrPct: null });
    const { eligible, reasons } = isShadowLongHypothesisEligible(s);
    expect(eligible).toBe(false);
    expect(reasons).toContain("ATR_MISSING");
  });
});

// ─── DURATION LABEL TESTS ─────────────────────────────────────────────────────

describe("getEarlySlDurationLabel", () => {
  it("15s → WITHIN_15S",  () => expect(getEarlySlDurationLabel(15_000)).toBe("SHORT_SL_WITHIN_15S"));
  it("16s → WITHIN_30S",  () => expect(getEarlySlDurationLabel(16_000)).toBe("SHORT_SL_WITHIN_30S"));
  it("31s → WITHIN_60S",  () => expect(getEarlySlDurationLabel(31_000)).toBe("SHORT_SL_WITHIN_60S"));
  it("61s → WITHIN_120S", () => expect(getEarlySlDurationLabel(61_000)).toBe("SHORT_SL_WITHIN_120S"));
  it("121s → WITHIN_180S", () => expect(getEarlySlDurationLabel(121_000)).toBe("SHORT_SL_WITHIN_180S"));
  it("181s → NOT_EARLY",  () => expect(getEarlySlDurationLabel(181_000)).toBe("SHORT_SL_NOT_EARLY"));
});

describe("getEarlySlBooleans", () => {
  it("59s → instantSl true", () => {
    const b = getEarlySlBooleans(59_000);
    expect(b.sourceShortInstantSl).toBe(true);
    expect(b.sourceShortEarlySl).toBe(true);
  });
  it("61s → instantSl false, earlySl true", () => {
    const b = getEarlySlBooleans(61_000);
    expect(b.sourceShortInstantSl).toBe(false);
    expect(b.sourceShortEarlySl).toBe(true);
  });
  it("29s → ultraFast true", () => {
    const b = getEarlySlBooleans(29_000);
    expect(b.sourceShortUltraFastSl).toBe(true);
  });
});

// ─── ATR CLASSIFICATION ───────────────────────────────────────────────────────

describe("classifyShadowLongAtr", () => {
  it("null → ATR_UNKNOWN",    () => expect(classifyShadowLongAtr(null)).toBe("ATR_UNKNOWN"));
  it("0.1 → ATR_VERY_LOW",   () => expect(classifyShadowLongAtr(0.1)).toBe("ATR_VERY_LOW"));
  it("0.3 → ATR_LOW",        () => expect(classifyShadowLongAtr(0.3)).toBe("ATR_LOW"));
  it("0.5 → ATR_MEDIUM",     () => expect(classifyShadowLongAtr(0.5)).toBe("ATR_MEDIUM"));
  it("0.8 → ATR_HIGH",       () => expect(classifyShadowLongAtr(0.8)).toBe("ATR_HIGH"));
  it("1.5 → ATR_VERY_HIGH",  () => expect(classifyShadowLongAtr(1.5)).toBe("ATR_VERY_HIGH"));
  it("3.0 → ATR_EXTREME",    () => expect(classifyShadowLongAtr(3.0)).toBe("ATR_EXTREME"));
});

// ─── ENTRY TESTS ──────────────────────────────────────────────────────────────

describe("buildShadowLongAudit entry", () => {
  it("uses first tick price (not source SHORT entry)", () => {
    const source = makeSource({ entryPrice: 100 });
    const firstTickPrice = 101.5;
    const audit = buildShadowLongAudit(source, firstTickPrice, source.closedAt, {}, SHADOW_LONG_CONFIG);
    expect(audit.shadowLongEntryReferencePrice).toBe(firstTickPrice);
    expect(audit.shadowLongEntryPrice).toBeGreaterThan(firstTickPrice);
  });

  it("applies entry slippage upward", () => {
    const source = makeSource();
    const audit = buildShadowLongAudit(source, 100, source.closedAt, {}, SHADOW_LONG_CONFIG);
    const expectedEntry = 100 * (1 + SHADOW_LONG_CONFIG.estimatedSlippage.entryPct / 100);
    expect(audit.shadowLongEntryPrice).toBeCloseTo(expectedEntry, 6);
  });

  it("LONG entry time matches first tick time", () => {
    const source = makeSource();
    const tickTime = source.closedAt + 50;
    const audit = buildShadowLongAudit(source, 101, tickTime, {}, SHADOW_LONG_CONFIG);
    expect(audit.shadowLongEntryTime).toBe(tickTime);
    expect(audit.shadowLongTriggerDelayMs).toBe(50);
  });

  it("generates deterministic id", () => {
    const source = makeSource();
    const a1 = buildShadowLongAudit(source, 101, source.closedAt);
    const a2 = buildShadowLongAudit(source, 101, source.closedAt);
    expect(a1.id).toBe(a2.id);
    expect(a1.id).toBe(`shadow-long:${source.id}`);
  });

  it("starts in PENDING_ENTRY status", () => {
    const audit = buildShadowLongAudit(makeSource(), 100, Date.now());
    expect(audit.status).toBe("PENDING_ENTRY");
  });

  it("mode is OBSERVER_ONLY", () => {
    const audit = buildShadowLongAudit(makeSource(), 100, Date.now());
    expect(audit.mode).toBe("OBSERVER_ONLY");
  });

  it("stores sourceShortTradeId", () => {
    const source = makeSource({ id: "trade-xyz" });
    const audit = buildShadowLongAudit(source, 100, Date.now());
    expect(audit.sourceShortTradeId).toBe("trade-xyz");
  });
});

// ─── PNL TESTS ────────────────────────────────────────────────────────────────

describe("computeShadowLongPnl", () => {
  it("price rises → positive gross PnL", () => {
    const result = computeShadowLongPnl(100, 103, 5, SHADOW_LONG_CONFIG);
    expect(result.gross).toBeGreaterThan(0);
    expect(result.feeNetNorm).toBeGreaterThan(0);
    expect(result.feeNetMargin).toBeGreaterThan(0);
  });

  it("price falls → negative gross PnL", () => {
    const result = computeShadowLongPnl(100, 98, 5, SHADOW_LONG_CONFIG);
    expect(result.gross).toBeLessThan(0);
    expect(result.feeNetNorm).toBeLessThan(0);
  });

  it("fees deducted once per round trip", () => {
    const result = computeShadowLongPnl(100, 100, 5, SHADOW_LONG_CONFIG);
    const expected = 0 - SHADOW_LONG_CONFIG.fee.roundTripFeePct - SHADOW_LONG_CONFIG.estimatedSlippage.entryPct - SHADOW_LONG_CONFIG.estimatedSlippage.exitPct;
    expect(result.feeNetNorm).toBeCloseTo(expected, 6);
  });

  it("normalized PnL is independent of leverage", () => {
    const r1 = computeShadowLongPnl(100, 105, 5,  SHADOW_LONG_CONFIG);
    const r2 = computeShadowLongPnl(100, 105, 10, SHADOW_LONG_CONFIG);
    expect(r1.feeNetNorm).toBeCloseTo(r2.feeNetNorm, 6);
  });

  it("margin PnL scales with leverage", () => {
    const r1 = computeShadowLongPnl(100, 105, 5,  SHADOW_LONG_CONFIG);
    const r2 = computeShadowLongPnl(100, 105, 10, SHADOW_LONG_CONFIG);
    expect(r2.feeNetMargin).toBeCloseTo(r1.feeNetNorm * 10, 4);
  });

  it("slippage applied correctly", () => {
    const slip = SHADOW_LONG_CONFIG.estimatedSlippage.entryPct + SHADOW_LONG_CONFIG.estimatedSlippage.exitPct;
    const result = computeShadowLongPnl(100, 100, 1, SHADOW_LONG_CONFIG);
    expect(result.feeNetNorm).toBeCloseTo(-(SHADOW_LONG_CONFIG.fee.roundTripFeePct + slip), 6);
  });

  it("null prices → null result", () => {
    const result = computeShadowLongPnl(null, 100, 5, SHADOW_LONG_CONFIG);
    expect(result.gross).toBeNull();
  });
});

// ─── COMBINED PNL TESTS ───────────────────────────────────────────────────────

describe("computeCombinedFlipPnl", () => {
  it("SHORT -5% LONG +5% → compounded ~-0.25%", () => {
    const result = computeCombinedFlipPnl(-5, 5, -1, 1);
    expect(result.combinedCompoundedMarginPnlPct).toBeCloseTo(-0.25, 2);
  });

  it("combined additive = sum of two margins", () => {
    const result = computeCombinedFlipPnl(-10, 12, -2, 2.4);
    expect(result.combinedAdditiveMarginPnlPct).toBeCloseTo(2, 4);
  });

  it("normalized combined = sum of norm PnLs", () => {
    const result = computeCombinedFlipPnl(-10, 12, -2, 2.4);
    expect(result.combinedFeeNetNormPnlPct).toBeCloseTo(0.4, 6);
  });

  it("null inputs → null results", () => {
    const result = computeCombinedFlipPnl(null, null, null, null);
    expect(result.combinedCompoundedMarginPnlPct).toBeNull();
    expect(result.combinedAdditiveMarginPnlPct).toBeNull();
  });

  it("full recovery flag uses compounded result", () => {
    const { combinedCompoundedMarginPnlPct } = computeCombinedFlipPnl(-5, 5, -1, 1);
    const rescue = computeRescueMeasurements(-5, 5, combinedCompoundedMarginPnlPct);
    expect(rescue.fullyRecoveredShortLoss).toBe(false);
  });
});

describe("computeRescueMeasurements", () => {
  it("recovery ratio correct", () => {
    const r = computeRescueMeasurements(-10, 5, -5.5);
    expect(r.shortLossRecoveryRatio).toBeCloseTo(0.5, 4);
  });

  it("0.00x when LONG loses", () => {
    const r = computeRescueMeasurements(-10, -2, -12);
    expect(r.shortLossRecoveryRatio).toBe(0);
  });

  it("fully recovered when compounded >= 0", () => {
    const r = computeRescueMeasurements(-10, 15, 4.0);
    expect(r.fullyRecoveredShortLoss).toBe(true);
    expect(r.profitableAfterFullRescue).toBe(true);
  });

  it("partial recovery flag", () => {
    const r = computeRescueMeasurements(-10, 5, -5.5);
    expect(r.partialRecovery).toBe(true);
  });

  it("combined PnL includes both fees", () => {
    const { combinedCompoundedMarginPnlPct } = computeCombinedFlipPnl(-5, 5, -1, 1);
    expect(combinedCompoundedMarginPnlPct).toBeLessThan(0);
  });
});

// ─── EXIT PROFILE TESTS ───────────────────────────────────────────────────────

describe("simulateMirrorLongProfile", () => {
  const BASE_ENTRY = 100;

  function makeAuditForProfile(entryPrice = BASE_ENTRY, atrPct = 0.8) {
    const source = makeSource({ atrPct });
    const audit  = buildShadowLongAudit(source, entryPrice, Date.now(), {}, SHADOW_LONG_CONFIG);
    return { ...audit, shadowLongEntryPrice: entryPrice };
  }

  it("SL triggers when price drops enough", () => {
    const audit = makeAuditForProfile(100);
    const slPrice = 100 * (1 - SHADOW_LONG_CONFIG.mirrorProfile.stopLossPricePct / 100);
    const history = [{ t: audit.shadowLongEntryTime + 5000, p: slPrice - 0.1 }];
    const r = simulateMirrorLongProfile(audit, history, SHADOW_LONG_CONFIG);
    expect(r.closeReason).toBe("SL");
  });

  it("TP triggers when price rises enough", () => {
    const audit   = makeAuditForProfile(100);
    const tpPrice = 100 * (1 + SHADOW_LONG_CONFIG.mirrorProfile.takeProfitPricePct / 100);
    const history = [{ t: audit.shadowLongEntryTime + 5000, p: tpPrice + 0.1 }];
    const r = simulateMirrorLongProfile(audit, history, SHADOW_LONG_CONFIG);
    expect(r.closeReason).toBe("TP");
  });

  it("trailing exit fires correctly", () => {
    const audit    = makeAuditForProfile(100);
    const trailDist = SHADOW_LONG_CONFIG.mirrorProfile.trailingDistancePricePct;
    const peakPrice = 102;
    const trailStop = peakPrice * (1 - trailDist / 100);
    const history = [
      { t: audit.shadowLongEntryTime + 1000, p: peakPrice },
      { t: audit.shadowLongEntryTime + 2000, p: trailStop - 0.01 },
    ];
    const r = simulateMirrorLongProfile(audit, history, SHADOW_LONG_CONFIG);
    expect(r.closeReason).toBe("TRAIL");
  });

  it("timeout finalizes audit", () => {
    const audit   = makeAuditForProfile(100);
    const maxTime = audit.shadowLongEntryTime + SHADOW_LONG_CONFIG.mirrorProfile.maxHoldMs;
    const history = [{ t: maxTime + 1, p: 101 }];
    const r = simulateMirrorLongProfile(audit, history, SHADOW_LONG_CONFIG);
    expect(r.closeReason).toBe("TIMEOUT");
  });
});

describe("simulateAtrAdaptiveLongProfile", () => {
  it("ATR-adaptive distances use entry ATR snapshot", () => {
    const source = makeSource({ atrPct: 1.0 });
    const audit  = buildShadowLongAudit(source, 100, Date.now(), {}, SHADOW_LONG_CONFIG);
    const stopPct = SHADOW_LONG_CONFIG.atrAdaptiveProfile.stopAtrMultiple * 1.0;
    expect(audit.atrAdaptiveProfile.resolvedStopPricePct).toBeCloseTo(stopPct, 4);
  });

  it("SL fires when price drops past stop", () => {
    const source = makeSource({ atrPct: 0.8 });
    const audit  = buildShadowLongAudit(source, 100, Date.now());
    const stopPct = audit.atrAdaptiveProfile.resolvedStopPricePct;
    const slPrice = 100 * (1 - stopPct / 100);
    const history = [{ t: audit.shadowLongEntryTime + 2000, p: slPrice - 0.01 }];
    const r = simulateAtrAdaptiveLongProfile(audit, history, SHADOW_LONG_CONFIG);
    expect(r.closeReason).toBe("SL");
  });
});

// ─── HORIZON TESTS ────────────────────────────────────────────────────────────

describe("captureHorizonPnl", () => {
  it("captures once at 15s horizon", () => {
    const audit    = makeAuditWith();
    const entryT   = audit.shadowLongEntryTime;
    const updates  = captureHorizonPnl(audit, entryT + 16_000, 105, SHADOW_LONG_CONFIG);
    expect(updates.pnlAt15sNormPct).not.toBeUndefined();
  });

  it("fixed horizon snapshots captured once", () => {
    const audit  = { ...makeAuditWith(), pnlAt15sNormPct: 1.2 };
    const updates = captureHorizonPnl(audit, audit.shadowLongEntryTime + 20_000, 106, SHADOW_LONG_CONFIG);
    expect(updates.pnlAt15sNormPct).toBeUndefined();
  });
});

// ─── MFE / MAE ────────────────────────────────────────────────────────────────

describe("computeMfeMae", () => {
  it("calculates MFE for LONG correctly", () => {
    const { grossMfeNormPct } = computeMfeMae(100, 105, 98, 1.0);
    expect(grossMfeNormPct).toBeCloseTo(5, 4);
  });

  it("calculates MAE as negative for adverse move", () => {
    const { grossMaeNormPct } = computeMfeMae(100, 105, 98, 1.0);
    expect(grossMaeNormPct).toBeCloseTo(-2, 4);
  });

  it("ATR multiples computed", () => {
    const { mfeAtrMultiple, maeAtrMultiple } = computeMfeMae(100, 105, 99, 1.0);
    expect(mfeAtrMultiple).toBeCloseTo(5, 4);
    expect(maeAtrMultiple).toBeCloseTo(1, 4);
  });

  it("null ATR → null multiples", () => {
    const { mfeAtrMultiple } = computeMfeMae(100, 105, 99, null);
    expect(mfeAtrMultiple).toBeNull();
  });
});

// ─── OUTCOME TESTS ────────────────────────────────────────────────────────────

describe("classifyShadowLongOutcome", () => {
  it("full rescue and profit", () => {
    const audit = { ...makeAuditWith(), combinedCompoundedMarginPnlPct: 2.0, shortLossRecoveryRatio: 1.2, shadowLongFeeNetMarginPnlPct: 6, status: "COMPLETED" };
    const { outcomeLabel } = classifyShadowLongOutcome(audit);
    expect(outcomeLabel).toBe("SHADOW_LONG_FULL_RESCUE_AND_PROFIT");
  });

  it("full rescue only", () => {
    const audit = { ...makeAuditWith(), combinedCompoundedMarginPnlPct: -0.01, shortLossRecoveryRatio: 0.98, shadowLongFeeNetMarginPnlPct: 5, status: "COMPLETED" };
    const { outcomeLabel } = classifyShadowLongOutcome(audit);
    expect(outcomeLabel).toBe("SHADOW_LONG_FULL_RESCUE_ONLY");
  });

  it("partial recovery", () => {
    const audit = { ...makeAuditWith(), combinedCompoundedMarginPnlPct: -3, shortLossRecoveryRatio: 0.5, shadowLongFeeNetMarginPnlPct: 2.5, status: "COMPLETED" };
    const { outcomeLabel } = classifyShadowLongOutcome(audit);
    expect(outcomeLabel).toBe("SHADOW_LONG_PARTIAL_RECOVERY");
  });

  it("no recovery", () => {
    const audit = { ...makeAuditWith(), combinedCompoundedMarginPnlPct: -5, shortLossRecoveryRatio: 0, shadowLongFeeNetMarginPnlPct: 0, status: "COMPLETED" };
    const { outcomeLabel } = classifyShadowLongOutcome(audit);
    expect(outcomeLabel).toBe("SHADOW_LONG_NO_RECOVERY");
  });

  it("added to loss", () => {
    const audit = { ...makeAuditWith(), combinedCompoundedMarginPnlPct: -8, shortLossRecoveryRatio: 0, shadowLongFeeNetMarginPnlPct: -3, status: "COMPLETED" };
    const { outcomeLabel } = classifyShadowLongOutcome(audit);
    expect(outcomeLabel).toBe("SHADOW_LONG_ADDED_TO_LOSS");
  });

  it("data gap", () => {
    const audit = { ...makeAuditWith(), status: "DATA_GAP" };
    const { outcomeLabel } = classifyShadowLongOutcome(audit);
    expect(outcomeLabel).toBe("SHADOW_LONG_DATA_GAP");
  });

  it("expired", () => {
    const audit = { ...makeAuditWith(), status: "EXPIRED" };
    const { outcomeLabel } = classifyShadowLongOutcome(audit);
    expect(outcomeLabel).toBe("SHADOW_LONG_EXPIRED");
  });
});

// ─── WHIPSAW ─────────────────────────────────────────────────────────────────

describe("checkWhipsaw", () => {
  it("short instant SL + LONG instant SL → whipsaw", () => {
    const audit = {
      sourceShortDurationMs: 45_000,
      mirrorCloseReason: "SL",
      durationMs: 30_000,
    };
    expect(checkWhipsaw(audit)).toBe(true);
  });

  it("not a whipsaw when LONG does not SL", () => {
    const audit = {
      sourceShortDurationMs: 45_000,
      mirrorCloseReason: "TP",
      durationMs: 30_000,
    };
    expect(checkWhipsaw(audit)).toBe(false);
  });

  it("not a whipsaw when source SL > 60s", () => {
    const audit = {
      sourceShortDurationMs: 90_000,
      mirrorCloseReason: "SL",
      durationMs: 30_000,
    };
    expect(checkWhipsaw(audit)).toBe(false);
  });
});

// ─── REGRESSION TESTS ────────────────────────────────────────────────────────

describe("regression: Shadow LONG records isolation", () => {
  it("audit has separate id from source trade", () => {
    const source = makeSource({ id: "trade-1" });
    const audit  = buildShadowLongAudit(source, 100, Date.now());
    expect(audit.id).not.toBe(source.id);
    expect(audit.id).toBe("shadow-long:trade-1");
  });

  it("audit does not reference samples array (separate state)", () => {
    const audit = buildShadowLongAudit(makeSource(), 100, Date.now());
    expect(audit).not.toHaveProperty("samples");
    expect(audit.version).toBe("shadow-long-audit-v1");
  });

  it("mode is always OBSERVER_ONLY regardless of source", () => {
    const audit = buildShadowLongAudit(makeSource(), 100, Date.now());
    expect(audit.mode).toBe("OBSERVER_ONLY");
  });
});

describe("regression: duplicate prevention", () => {
  it("same source trade always produces same audit id", () => {
    const source = makeSource({ id: "trade-dup" });
    const a1 = buildShadowLongAudit(source, 100, Date.now());
    const a2 = buildShadowLongAudit(source, 101, Date.now() + 100);
    expect(a1.id).toBe(a2.id);
  });
});

describe("regression: leverage and PnL invariants", () => {
  it("normalized PnL does not depend on leverage", () => {
    const r1 = computeShadowLongPnl(100, 103, 5);
    const r2 = computeShadowLongPnl(100, 103, 10);
    expect(r1.feeNetNorm).toBeCloseTo(r2.feeNetNorm, 8);
  });

  it("margin PnL = feeNetNorm * leverage", () => {
    const r = computeShadowLongPnl(100, 103, 7);
    expect(r.feeNetMargin).toBeCloseTo(r.feeNetNorm * 7, 4);
  });
});
