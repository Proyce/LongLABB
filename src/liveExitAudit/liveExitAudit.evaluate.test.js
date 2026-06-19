import { describe, it, expect } from "vitest";
import { evaluateLiveExitAudit } from "./liveExitAudit.evaluate.js";
import { LIVE_EXIT_AUDIT_VERSION } from "./liveExitAudit.config.js";

function makeTrade(overrides = {}) {
  return {
    entryPrice: 100,
    currentPrice: 99,        // 1% down = profitable short
    entryTime: Date.now() - 60_000, // 60 seconds in
    leverage: 10,
    mfe: 0,
    mae: 0,
    runnerCaptureLabels: [],
    runnerCapturePotentialScore: 30,
    runnerScorePeak: 0,
    postFee10LiveConfirmationScore: 50,
    longAuditWouldBlock: false,
    longAuditWouldHardBlock: false,
    marketBreathWouldBlock: false,
    ...overrides,
  };
}

describe("evaluateLiveExitAudit — safety invariants", () => {
  it("always returns liveExitAuditExecutionApplied = false", () => {
    const result = evaluateLiveExitAudit(makeTrade());
    expect(result.liveExitAuditExecutionApplied).toBe(false);
  });

  it("always returns liveExitAuditCanAffectExecution = false", () => {
    const result = evaluateLiveExitAudit(makeTrade());
    expect(result.liveExitAuditCanAffectExecution).toBe(false);
  });

  it("always returns liveExitAuditExecutionApplied = false even in emergency", () => {
    const result = evaluateLiveExitAudit(makeTrade({
      currentPrice: 102, // underwater
      mfe: 0,
      runnerCaptureLabels: ["RUNNER_CVD_FLIPS_BULL", "RUNNER_GREEN_IMPULSE_RETURNS"],
      postFee10LiveConfirmationScore: 10,
      runnerCapturePotentialScore: 5,
      longAuditWouldBlock: true,
      marketBreathWouldBlock: true,
    }));
    expect(result.liveExitAuditExecutionApplied).toBe(false);
    expect(result.liveExitAuditCanAffectExecution).toBe(false);
  });

  it("returns correct version string", () => {
    const result = evaluateLiveExitAudit(makeTrade());
    expect(result.liveExitAuditVersion).toBe(LIVE_EXIT_AUDIT_VERSION);
    expect(result.liveExitAuditMode).toBe("LOG_ONLY");
  });
});

describe("evaluateLiveExitAudit — WOULD_WAIT_FOR_MIN_TIME", () => {
  it("labels WOULD_WAIT_FOR_MIN_TIME when secondsInTrade < 20 and no buyer danger", () => {
    const result = evaluateLiveExitAudit(makeTrade({
      entryTime: Date.now() - 10_000, // 10 seconds in
    }));
    expect(result.liveExitLabel).toBe("WOULD_WAIT_FOR_MIN_TIME");
  });

  it("bypasses min-time gate if buyer danger is active", () => {
    // longAuditWouldBlock = danger for long → liveExitBuyerDanger = true → skips min-time gate
    const result = evaluateLiveExitAudit(makeTrade({
      entryTime: Date.now() - 10_000,
      longAuditWouldBlock: true,
      postFee10LiveConfirmationScore: 10,
      runnerCapturePotentialScore: 5,
      currentPrice: 97, // underwater for long (price below entry)
    }));
    expect(result.liveExitLabel).not.toBe("WOULD_WAIT_FOR_MIN_TIME");
  });
});

describe("evaluateLiveExitAudit — WOULD_ALLOW_RUNNER", () => {
  it("labels WOULD_ALLOW_RUNNER when score >= 75 and runner capture >= 40", () => {
    const result = evaluateLiveExitAudit(makeTrade({
      postFee10LiveConfirmationScore: 90,
      runnerCapturePotentialScore:    80,
      runnerScorePeak:               60,
      mfe: 2.0,
      currentPrice: 98,             // profitable
    }));
    expect(result.liveExitLabel).toBe("WOULD_ALLOW_RUNNER");
    expect(result.liveExitWouldAllowRunner).toBe(true);
    expect(result.liveExitRecommendedProfileLogOnly).toBe("RUNNER");
  });

  it("does not allow runner if buyer danger is present", () => {
    // longAuditWouldBlock = danger for long → liveExitBuyerDanger = true → blocks runner
    const result = evaluateLiveExitAudit(makeTrade({
      postFee10LiveConfirmationScore: 90,
      runnerCapturePotentialScore:    80,
      runnerScorePeak:               60,
      mfe: 2.0,
      longAuditWouldBlock: true,
    }));
    expect(result.liveExitLabel).not.toBe("WOULD_ALLOW_RUNNER");
  });
});

describe("evaluateLiveExitAudit — WOULD_PROTECT_PROFIT", () => {
  it("labels WOULD_PROTECT_PROFIT when pnl > 0, mfe >= 1.0, and score < 55", () => {
    // LONG: currentPrice > entryPrice (100) = positive PnL
    const result = evaluateLiveExitAudit(makeTrade({
      currentPrice: 101.5,          // profitable for LONG (price rose above entry)
      mfe: 1.5,
      postFee10LiveConfirmationScore: 20, // low score
      runnerCapturePotentialScore:    5,  // low score
    }));
    expect(result.liveExitLabel).toBe("WOULD_PROTECT_PROFIT");
    expect(result.liveExitWouldProtectProfit).toBe(true);
    expect(result.liveExitRecommendedProfileLogOnly).toBe("SAFE");
  });
});

describe("evaluateLiveExitAudit — WOULD_TIGHTEN", () => {
  it("labels WOULD_TIGHTEN when score in [30,44] and buyer danger is present", () => {
    // Score: 50 +20(liveConfirm>=70) -30(buyerDanger) = 40 — above FAST_EXIT (30), below TIGHTEN (45)
    // cvdLabel BEAR triggers liveExitCvdFlipBearish → liveExitBuyerDanger (-30) but NOT longAuditDangerNow (-25)
    // mfe=0.5 prevents NO_PROFIT_PROOF_AFTER_TIME (requires mfe<0.35)
    // score=40 >= 20 → EMERGENCY skipped; 40 < 45 AND buyerDanger → WOULD_TIGHTEN
    const result = evaluateLiveExitAudit(makeTrade({
      postFee10LiveConfirmationScore: 80, // +20
      runnerCapturePotentialScore:    30, // neutral
      cvdLabel: "BEAR",                   // liveExitCvdFlipBearish → liveExitBuyerDanger -30
      mfe: 0.5,                           // >= 0.35 so NO_PROFIT_PROOF_AFTER_TIME doesn't fire
      currentPrice: 99.9,                 // slightly negative LONG PnL
    }));
    expect(result.liveExitLabel).toBe("WOULD_TIGHTEN");
    expect(result.liveExitWouldTighten).toBe(true);
    expect(result.liveExitRecommendedProfileLogOnly).toBe("FAST");
  });
});

describe("evaluateLiveExitAudit — WOULD_FAST_EXIT", () => {
  it("labels WOULD_FAST_EXIT when score < 30, seconds >= 45, and pnl <= 0 (no buyer danger)", () => {
    // No buyer danger signals — weak score comes from low liveConfirm + low runner + no-profit
    const result = evaluateLiveExitAudit(makeTrade({
      currentPrice: 100,   // exactly at entry = pnl 0 (≤ 0)
      mfe: 0,
      postFee10LiveConfirmationScore: 10,  // -20
      runnerCapturePotentialScore:    5,   // -15
      // No buyer danger: no runnerCaptureLabels, no longAudit, no marketBreath
      entryTime: Date.now() - 60_000,      // 60 seconds → triggers no-profit-after-time (-20)
    }));
    expect(result.liveExitLabel).toBe("WOULD_FAST_EXIT");
    expect(result.liveExitWouldFastExit).toBe(true);
  });
});

describe("evaluateLiveExitAudit — WOULD_EMERGENCY_EXIT", () => {
  it("labels WOULD_EMERGENCY_EXIT when score < 20, buyer danger, and pnl < 0", () => {
    // Score: 50 -20(liveConfirm<35) -15(runner<15) -30(buyerDanger) -25(longAudit) -20(marketBreath) = -60 → 0 < 20
    // LONG pnl < 0: currentPrice 98.5 < entryPrice 100 → (98.5-100)/100*100 = -1.5%
    // longAuditWouldBlock → liveExitLongAuditDangerNow AND liveExitBuyerDanger (both triggered)
    // WOULD_EMERGENCY_EXIT is checked before WOULD_TIGHTEN in the decision chain
    const result = evaluateLiveExitAudit(makeTrade({
      currentPrice: 98.5,            // LONG: price below entry = negative PnL (-1.5%)
      mfe: 0,
      postFee10LiveConfirmationScore: 10,  // -20
      runnerCapturePotentialScore:    5,   // -15
      longAuditWouldBlock:    true,        // -25 (longAudit) + contributes to buyerDanger (-30)
      marketBreathWouldBlock: true,        // -20
    }));
    expect(result.liveExitLabel).toBe("WOULD_EMERGENCY_EXIT");
    expect(result.liveExitWouldEmergencyExit).toBe(true);
    expect(result.liveExitAuditExecutionApplied).toBe(false);
  });
});

describe("evaluateLiveExitAudit — boolean label exclusivity", () => {
  it("only one would-action is true for WOULD_HOLD", () => {
    const result = evaluateLiveExitAudit(makeTrade());
    const flags = [
      result.liveExitWouldHold,
      result.liveExitWouldTighten,
      result.liveExitWouldFastExit,
      result.liveExitWouldEmergencyExit,
      result.liveExitWouldProtectProfit,
      result.liveExitWouldAllowRunner,
    ];
    expect(flags.filter(Boolean).length).toBe(1);
    expect(result.liveExitWouldHold).toBe(true);
  });

  it("only one would-action is true for WOULD_ALLOW_RUNNER", () => {
    const result = evaluateLiveExitAudit(makeTrade({
      postFee10LiveConfirmationScore: 90,
      runnerCapturePotentialScore:    80,
      runnerScorePeak:               60,
      mfe: 2.0,
      currentPrice: 98,
    }));
    const trueFlags = [
      result.liveExitWouldHold,
      result.liveExitWouldTighten,
      result.liveExitWouldFastExit,
      result.liveExitWouldEmergencyExit,
      result.liveExitWouldProtectProfit,
      result.liveExitWouldAllowRunner,
    ].filter(Boolean);
    expect(trueFlags.length).toBe(1);
    expect(result.liveExitWouldAllowRunner).toBe(true);
  });
});

describe("evaluateLiveExitAudit — signals passthrough", () => {
  it("includes long-native danger booleans from trade signals", () => {
    // LONG danger: CVD flips BEAR and VWAP loss are the danger signals
    const result = evaluateLiveExitAudit(makeTrade({
      cvdLabel: "BEAR",                              // liveExitCvdFlipBearish
      vwapContextLabel: "BELOW_VWAP",                 // liveExitVwapLoss
      longAuditWouldBlock: true,                    // liveExitLongAuditDangerNow
    }));
    expect(result.liveExitCvdFlipBearish).toBe(true);
    expect(result.liveExitVwapLoss).toBe(true);
    expect(result.liveExitLongAuditDangerNow).toBe(true);
    expect(result.liveExitSellerDanger).toBe(true);
    expect(result.liveExitBuyerDanger).toBe(true);   // backward-compat alias = sellerDanger
  });

  it("derives liveExitLongAuditDangerNow from longAuditWouldBlock", () => {
    const result = evaluateLiveExitAudit(makeTrade({ longAuditWouldBlock: true }));
    expect(result.liveExitLongAuditDangerNow).toBe(true);
  });

  it("derives liveExitLongAuditDangerNow from longAuditWouldHardBlock", () => {
    const result = evaluateLiveExitAudit(makeTrade({ longAuditWouldHardBlock: true }));
    expect(result.liveExitLongAuditDangerNow).toBe(true);
  });

  it("derives liveExitMarketBreathFlipAgainstShort from marketBreathWouldBlock", () => {
    const result = evaluateLiveExitAudit(makeTrade({ marketBreathWouldBlock: true }));
    expect(result.liveExitMarketBreathFlipAgainstShort).toBe(true);
  });
});
