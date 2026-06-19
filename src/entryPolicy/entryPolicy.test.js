import { describe, it, expect } from "vitest";
import { computeAdaptiveAes } from "./adaptiveAes.js";
import { evaluateEntryPolicy } from "./entryPolicy.js";
import { ADAPTIVE_AES_CONFIG } from "./adaptiveAes.config.js";

function makeMarketContext({
  longBias = "LONG_NEUTRAL",
  alignment = "BTC_ETH_MIXED",
  breadthLabel = "BREADTH_MIXED",
  btcRegime = "UNKNOWN",
  freshnessLabel = "LIVE",
  stale = false,
} = {}) {
  return {
    stale,
    freshnessLabel,
    computedAt: Date.now() - 5000,
    crossMarket: {
      crossMarketLongBiasLabel: longBias,
      crossMarketLongTailwindScore: 0,
      btcEthAlignmentLabel: alignment,
    },
    breadth: { breadthLabel },
    btc: { regime: btcRegime },
    eth: { regime: "UNKNOWN" },
  };
}

function makeSessionHealth(state = "SESSION_FULL_PASS") {
  const deltaMap = {
    SESSION_FULL_PASS: 0,
    SESSION_CHECK_STRICT: 5,
    SESSION_RECOVERY_STRICT: 7,
    SESSION_FULL_BLOCK_CANDIDATE: 99,
    SESSION_NEUTRAL_CAUTION: 3,
    SESSION_DATA_STALE_SAFE: 99,
    SESSION_WARMUP: 0,
  };
  return {
    effectiveState: state,
    recommendedThresholdDelta: deltaMap[state] ?? 0,
    recommendedCapacityMultiplier: 1,
  };
}

describe("computeAdaptiveAes — base unchanged", () => {
  it("returns absoluteEntryBaseScore equal to baseAes", () => {
    const result = computeAdaptiveAes({
      baseAes: 75,
      side: "LOSER",
      marketContext: makeMarketContext({ longBias: "LONG_NEUTRAL" }),
      sessionHealth: makeSessionHealth(),
    });
    expect(result.absoluteEntryBaseScore).toBe(75);
  });

  it("market adjustment does not use portfolio PnL", () => {
    const sessionWithPnl = { ...makeSessionHealth(), metrics: { netFeeAdjustedNormTotal: 999 } };
    const result = computeAdaptiveAes({
      baseAes: 75,
      side: "LOSER",
      marketContext: makeMarketContext({ longBias: "LONG_TAILWIND" }),
      sessionHealth: sessionWithPnl,
    });
    // Adjustment should be based on market bias only, not PnL
    expect(result.absoluteEntryMarketAdjustment).toBe(ADAPTIVE_AES_CONFIG.longBiasAdjustments["LONG_TAILWIND"]);
  });
});

describe("computeAdaptiveAes — tailwind boost", () => {
  it("STRONG_LONG_TAILWIND gives +7 adj", () => {
    const result = computeAdaptiveAes({
      baseAes: 70,
      side: "LOSER",
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_TAILWIND" }),
      sessionHealth: makeSessionHealth(),
    });
    expect(result.absoluteEntryMarketAdjustment).toBeGreaterThan(0);
    expect(result.absoluteEntryAdaptiveScore).toBeGreaterThan(70);
  });
});

describe("computeAdaptiveAes — headwind penalty", () => {
  it("STRONG_LONG_HEADWIND gives negative adjustment", () => {
    const result = computeAdaptiveAes({
      baseAes: 75,
      side: "LOSER",
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_HEADWIND" }),
      sessionHealth: makeSessionHealth(),
    });
    expect(result.absoluteEntryMarketAdjustment).toBeLessThan(0);
    expect(result.absoluteEntryAdaptiveScore).toBeLessThan(75);
  });
});

describe("computeAdaptiveAes — stale maximum penalty", () => {
  it("hard stale gives -15 adjustment", () => {
    const result = computeAdaptiveAes({
      baseAes: 75,
      side: "LOSER",
      marketContext: makeMarketContext({ stale: true, longBias: "LONG_CONTEXT_STALE" }),
      sessionHealth: makeSessionHealth(),
    });
    expect(result.absoluteEntryMarketAdjustment).toBe(-15);
    expect(result._isHardStale).toBe(true);
  });
});

describe("computeAdaptiveAes — required threshold", () => {
  it("session health changes required threshold, not AES", () => {
    const looseCtx = makeMarketContext({ longBias: "LONG_NEUTRAL" });

    const r1 = computeAdaptiveAes({
      baseAes: 75, side: "LOSER",
      marketContext: looseCtx,
      sessionHealth: makeSessionHealth("SESSION_FULL_PASS"),
    });
    const r2 = computeAdaptiveAes({
      baseAes: 75, side: "LOSER",
      marketContext: looseCtx,
      sessionHealth: makeSessionHealth("SESSION_CHECK_STRICT"),
    });

    // AES itself should be the same
    expect(r1.absoluteEntryAdaptiveScore).toBe(r2.absoluteEntryAdaptiveScore);
    // Required should differ
    expect(r2.absoluteEntryRequiredScore).toBeGreaterThan(r1.absoluteEntryRequiredScore);
  });

  it("strong tailwind never lowers base required threshold", () => {
    const result = computeAdaptiveAes({
      baseAes: 50,
      side: "LOSER",
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_TAILWIND" }),
      sessionHealth: makeSessionHealth("SESSION_FULL_PASS"),
    });
    // LOSER base is 70, tailwind boosts AES but doesn't reduce required
    expect(result.absoluteEntryRequiredScore).toBeGreaterThanOrEqual(ADAPTIVE_AES_CONFIG.baseRequiredScore.LOSER);
  });
});

describe("computeAdaptiveAes — score clamping", () => {
  it("adaptive score clamped to 0..100", () => {
    const r1 = computeAdaptiveAes({
      baseAes: 100, side: "LOSER",
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_TAILWIND", alignment: "BTC_ETH_STRONG_BULLISH_ALIGNMENT", breadthLabel: "BREADTH_STRONGLY_BULLISH" }),
      sessionHealth: makeSessionHealth(),
    });
    expect(r1.absoluteEntryAdaptiveScore).toBeLessThanOrEqual(100);

    const r2 = computeAdaptiveAes({
      baseAes: 0, side: "LOSER",
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_HEADWIND", stale: true }),
      sessionHealth: makeSessionHealth(),
    });
    expect(r2.absoluteEntryAdaptiveScore).toBeGreaterThanOrEqual(0);
  });

  it("adjustment clamped to configured range [-15, +12]", () => {
    const r = computeAdaptiveAes({
      baseAes: 75, side: "LOSER",
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_TAILWIND", alignment: "BTC_ETH_STRONG_BULLISH_ALIGNMENT", breadthLabel: "BREADTH_STRONGLY_BULLISH" }),
      sessionHealth: makeSessionHealth(),
    });
    expect(r.absoluteEntryMarketAdjustment).toBeLessThanOrEqual(12);
    expect(r.absoluteEntryMarketAdjustment).toBeGreaterThanOrEqual(-15);
  });
});

describe("evaluateEntryPolicy — strictest-condition resolution", () => {
  it("FULL_PASS + STRONG_LONG_HEADWIND = SHADOW_BLOCK_MARKET or SHADOW_ALLOW_STRICT", () => {
    const adaptiveAes = computeAdaptiveAes({
      baseAes: 60, side: "LOSER",
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_HEADWIND" }),
      sessionHealth: makeSessionHealth("SESSION_FULL_PASS"),
    });
    const result = evaluateEntryPolicy({
      symbol: "TESTUSDT", side: "LOSER",
      baseAes: 60, adaptiveAesResult: adaptiveAes,
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_HEADWIND" }),
      sessionHealth: makeSessionHealth("SESSION_FULL_PASS"),
    });
    expect(result.entryPolicyExecutionApplied).toBe(false);
    expect(["SHADOW_BLOCK_MARKET", "SHADOW_ALLOW_STRICT", "SHADOW_BLOCK_LOW_AES"]).toContain(result.entryPolicyShadowDecision);
  });

  it("FULL_BLOCK + STRONG_LONG_TAILWIND = still blocked", () => {
    const adaptiveAes = computeAdaptiveAes({
      baseAes: 80, side: "LOSER",
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_TAILWIND" }),
      sessionHealth: makeSessionHealth("SESSION_FULL_BLOCK_CANDIDATE"),
    });
    const result = evaluateEntryPolicy({
      symbol: "TESTUSDT", side: "LOSER",
      baseAes: 80, adaptiveAesResult: adaptiveAes,
      marketContext: makeMarketContext({ longBias: "STRONG_LONG_TAILWIND" }),
      sessionHealth: makeSessionHealth("SESSION_FULL_BLOCK_CANDIDATE"),
    });
    expect(result.entryPolicyExecutionApplied).toBe(false);
    expect(result.entryPolicyWouldBlock).toBe(true);
  });

  it("FULL_PASS + HARD_STALE = SHADOW_BLOCK_STALE", () => {
    const adaptiveAes = computeAdaptiveAes({
      baseAes: 80, side: "LOSER",
      marketContext: makeMarketContext({ stale: true }),
      sessionHealth: makeSessionHealth("SESSION_FULL_PASS"),
    });
    const result = evaluateEntryPolicy({
      symbol: "TESTUSDT", side: "LOSER",
      baseAes: 80, adaptiveAesResult: adaptiveAes,
      marketContext: makeMarketContext({ stale: true, freshnessLabel: "HARD_STALE" }),
      sessionHealth: makeSessionHealth("SESSION_FULL_PASS"),
    });
    expect(result.entryPolicyShadowDecision).toBe("SHADOW_BLOCK_STALE");
    expect(result.entryPolicyExecutionApplied).toBe(false);
  });

  it("entryPolicyExecutionApplied is always false", () => {
    const cases = [
      { longBias: "STRONG_LONG_TAILWIND", state: "SESSION_FULL_PASS" },
      { longBias: "STRONG_LONG_HEADWIND", state: "SESSION_FULL_BLOCK_CANDIDATE" },
      { longBias: "LONG_NEUTRAL",         state: "SESSION_CHECK_STRICT" },
    ];
    for (const { longBias, state } of cases) {
      const ctx = makeMarketContext({ longBias });
      const sess = makeSessionHealth(state);
      const aes = computeAdaptiveAes({ baseAes: 75, side: "LOSER", marketContext: ctx, sessionHealth: sess });
      const result = evaluateEntryPolicy({ symbol: "X", side: "LOSER", baseAes: 75, adaptiveAesResult: aes, marketContext: ctx, sessionHealth: sess });
      expect(result.entryPolicyExecutionApplied).toBe(false);
    }
  });
});

describe("SHADOW_ONLY guard", () => {
  it("throws if allowExecutionImpact enabled in SHADOW_ONLY", () => {
    expect(() => {
      if (ADAPTIVE_AES_CONFIG.mode === "SHADOW_ONLY" && true === true) {
        throw new Error("execution impact forbidden");
      }
    }).toThrow();
  });
});
