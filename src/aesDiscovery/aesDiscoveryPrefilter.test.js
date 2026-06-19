import { describe, it, expect } from "vitest";
import { computeAesDiscoveryPrefilter, selectDeepScanCandidates } from "./aesDiscoveryPrefilter.js";
import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";

const BASE_CONFIG = { ...AES_DISCOVERY_CONFIG, minQuoteVolume: 10_000_000 };

function makeCandidate(overrides = {}) {
  return {
    symbol:             "TESTUSDT",
    priceChangePercent: "-5",
    quoteVolume:        "20000000",
    lastPrice:          "1.0",
    highPrice:          "1.2",
    lowPrice:           "0.8",
    side24hRank:        50,
    rankBand:           "RANK_26_50",
    leaderboardSide:    "LOSERS",
    ...overrides,
  };
}

const EMPTY_HISTORY = {};

describe("computeAesDiscoveryPrefilter", () => {
  it("excludes Top-25 symbols", () => {
    const result = computeAesDiscoveryPrefilter(makeCandidate({ side24hRank: 10 }), EMPTY_HISTORY, BASE_CONFIG);
    expect(result.eligibleForDeepScan).toBe(false);
    expect(result.prefilterReasons).toContain("INSIDE_TOP25_EXCLUDED");
  });

  it("excludes zero-change symbols", () => {
    const result = computeAesDiscoveryPrefilter(makeCandidate({ priceChangePercent: "0" }), EMPTY_HISTORY, BASE_CONFIG);
    expect(result.eligibleForDeepScan).toBe(false);
    expect(result.prefilterReasons).toContain("ZERO_CHANGE_EXCLUDED");
  });

  it("awards SUFFICIENT_LIQUIDITY for high volume", () => {
    const result = computeAesDiscoveryPrefilter(makeCandidate(), EMPTY_HISTORY, BASE_CONFIG);
    expect(result.prefilterReasons).toContain("SUFFICIENT_LIQUIDITY");
  });

  it("awards LAST3_BROAD_TICKS_DOWN when history shows downtrend", () => {
    const store = { "TESTUSDT": [
      { ts: 1000, priceChangePercent: -3, quoteVolume: 2e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 1.0, side24hRank: 50 },
      { ts: 2000, priceChangePercent: -5, quoteVolume: 2e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 0.95, side24hRank: 49 },
      { ts: 3000, priceChangePercent: -7, quoteVolume: 2e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 0.90, side24hRank: 48 },
    ]};
    const result = computeAesDiscoveryPrefilter(makeCandidate(), store, BASE_CONFIG);
    expect(result.prefilterReasons).toContain("LAST3_BROAD_TICKS_DOWN");
  });

  it("below min volume produces below minimum warning", () => {
    const result = computeAesDiscoveryPrefilter(makeCandidate({ quoteVolume: "1000000" }), EMPTY_HISTORY, BASE_CONFIG);
    expect(result.prefilterWarnings).toContain("BELOW_MIN_VOLUME");
    expect(result.eligibleForDeepScan).toBe(false);
  });

  it("awards NEGATIVE_SHORT_TERM_ACCELERATION for accelerating downtrend", () => {
    const store = { "TESTUSDT": [
      { ts: 1000, priceChangePercent: -1, quoteVolume: 2e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 1.0 },
      { ts: 2000, priceChangePercent: -2, quoteVolume: 2e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 0.98 },
      { ts: 3000, priceChangePercent: -4, quoteVolume: 2e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 0.96 },
      { ts: 4000, priceChangePercent: -7, quoteVolume: 2e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 0.93 },
      { ts: 5000, priceChangePercent: -11,quoteVolume: 2e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 0.89 },
    ]};
    const result = computeAesDiscoveryPrefilter(makeCandidate(), store, BASE_CONFIG, 5000);
    expect(result.prefilterReasons).toContain("NEGATIVE_SHORT_TERM_ACCELERATION");
  });

  it("score is between 0 and 100", () => {
    const result = computeAesDiscoveryPrefilter(makeCandidate(), EMPTY_HISTORY, BASE_CONFIG);
    expect(result.prefilterScore).toBeGreaterThanOrEqual(0);
    expect(result.prefilterScore).toBeLessThanOrEqual(100);
  });
});

describe("selectDeepScanCandidates", () => {
  it("respects maxDeepCandidatesPerCycle limit", () => {
    const config = { ...BASE_CONFIG, maxDeepCandidatesPerCycle: 3, maxDeepCandidatesPerSidePerCycle: 5, perSideBandQuota: { RANK_26_50: 5, RANK_51_100: 5, RANK_101_200: 5 } };
    const candidates = Array.from({ length: 20 }, (_, i) => makeCandidate({
      symbol: `SYM${i}USDT`,
      side24hRank: 30 + i,
      rankBand: "RANK_26_50",
    }));
    const selected = selectDeepScanCandidates({ candidates, config });
    expect(selected.length).toBeLessThanOrEqual(3);
  });

  it("skips candidates in activeSymbols", () => {
    const config = { ...BASE_CONFIG, maxDeepCandidatesPerCycle: 10, maxDeepCandidatesPerSidePerCycle: 10, perSideBandQuota: { RANK_26_50: 10 } };
    const candidates = [makeCandidate({ symbol: "AUSDT" }), makeCandidate({ symbol: "BUSDT" })];
    const selected = selectDeepScanCandidates({ candidates, config, activeSymbols: new Set(["AUSDT"]) });
    expect(selected.map(c => c.symbol)).not.toContain("AUSDT");
  });

  it("skips candidates with fresh cached telemetry", () => {
    const config = { ...BASE_CONFIG, maxDeepCandidatesPerCycle: 10, maxDeepCandidatesPerSidePerCycle: 10, perSideBandQuota: { RANK_26_50: 10 }, telemetryCacheTtlMs: 120_000 };
    const now = Date.now();
    const cachedTelemetry = { "AUSDT": { telemetryComputedAt: now - 10_000 } }; // fresh
    const candidates = [makeCandidate({ symbol: "AUSDT" })];
    const selected = selectDeepScanCandidates({ candidates, config, cachedTelemetry, now });
    expect(selected.length).toBe(0);
  });

  it("does not include Top-25 candidates", () => {
    const config = { ...BASE_CONFIG, maxDeepCandidatesPerCycle: 10, maxDeepCandidatesPerSidePerCycle: 10, perSideBandQuota: { TOP_1_25: 10 } };
    const candidates = [makeCandidate({ symbol: "AUSDT", side24hRank: 5 })];
    const selected = selectDeepScanCandidates({ candidates, config });
    expect(selected.length).toBe(0);
  });
});
