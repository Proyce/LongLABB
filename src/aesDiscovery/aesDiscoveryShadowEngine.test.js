import { describe, it, expect } from "vitest";
import {
  maybeShadowEntry, updateShadowTradeBroadScan, evaluateShadowExit,
  updateEpisodeState, createEpisodeState, assertShadowSafe,
} from "./aesDiscoveryShadowEngine.js";
import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";

const CONFIG = {
  ...AES_DISCOVERY_CONFIG,
  defaultResearchLeverage: 3,
  takerFeeRatePctPerSide: 0.05,
  normalizedRoundTripFeePct: 0.10,
  reentryCooldownMs: 15 * 60_000,
  requireScoreResetBeforeReentry: true,
  maxActiveShadowTrades: 100,
  minimumTelemetryCoveragePct: 70,
  staleTelemetryMs: 180_000,
  aesThresholds: { watch: 60, high: 70, sniper: 80, elite: 90, reset: 55 },
};

const NOW = Date.now();

function makeSnapshot(overrides = {}) {
  return {
    symbol:              "TESTUSDT",
    side:                "LOSER",
    telemetryComputedAt: NOW - 10_000,
    telemetryCoveragePct: 85,
    telemetryMissingFields: [],
    telemetryWarnings:   [],
    telemetrySnapshotId: "snap_test",
    immediateGreenImpulse: false, greenImpulseDetected: false,
    hasRedConfirmation:  true, immediateRedImpulse: true, redImpulseDetected: true,
    atrPct: 0.7, cvdLabel: "BEAR", spreadPct: 0.03,
    candleColorAtEntry: "RED", last3TicksDirection: "DOWN",
    macdHistogramState1m: "NEGATIVE_EXPANDING",
    hasRsiRollover: true,
    ...overrides,
  };
}

function makeCandidate(overrides = {}) {
  return {
    symbol:           "TESTUSDT",
    lastPrice:        "1.0",
    priceChangePercent: "-8",
    quoteVolume:      "20000000",
    leaderboardSide:  "LOSERS",
    side24hRank:      40,
    globalAbsChangeRank: 40,
    rankBand:         "RANK_26_50",
    outsideTop25:     true,
    outsideTop50:     false,
    outsideTop100:    false,
    outsideTop200:    false,
    eligibleUniverseSize: 500,
    prefilterScore:   75,
    ...overrides,
  };
}

function makeAesVariants(aesFull = 72, aesNoRank = 70, aesSetupOnly = 68) {
  return {
    aesFull, aesNoRank, aesSetupOnly,
    aesFullResult: null, aesNoRankResult: null, aesSetupOnlyResult: null,
    aesFullMinusNoRank: aesFull - aesNoRank,
    aesFullMinusSetupOnly: aesFull - aesSetupOnly,
    aesNoRankMinusSetupOnly: aesNoRank - aesSetupOnly,
    rankContributionNet: 2, change24hContributionNet: null,
    scoreVersion: "aes-v3-test",
  };
}

describe("maybeShadowEntry", () => {
  it("creates a shadow trade when conditions are met", () => {
    const episode = createEpisodeState();
    const trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    expect(trade).not.toBeNull();
    expect(trade.isShadowTrade).toBe(true);
    expect(trade.orderSubmitted).toBe(false);
    expect(trade.orderId).toBeNull();
    expect(trade.executionMode).toBe("LOG_ONLY");
    expect(trade.entrySource).toBe("AES_DISCOVERY_SHADOW");
  });

  it("returns null when inside top 25", () => {
    const trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate({ outsideTop25: false }),
      aesVariants: makeAesVariants(), episodeState: createEpisodeState(),
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    expect(trade).toBeNull();
  });

  it("returns null when telemetry coverage is insufficient", () => {
    const trade = maybeShadowEntry({
      snapshot: makeSnapshot({ telemetryCoveragePct: 50 }),
      candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: createEpisodeState(),
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    expect(trade).toBeNull();
  });

  it("one active shadow per symbol", () => {
    const episode = createEpisodeState();
    const first = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    expect(first).not.toBeNull();
    updateEpisodeState(episode, "TESTUSDT", makeAesVariants(), first, CONFIG, NOW);
    const second = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [first], config: CONFIG, now: NOW + 1000,
    });
    expect(second).toBeNull();
  });

  it("respects cooldown after close", () => {
    const episode = createEpisodeState();
    episode.cooldownUntil["TESTUSDT"] = NOW + 10 * 60_000;
    const trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    expect(trade).toBeNull();
  });

  it("frozen entry telemetry fields are set", () => {
    const episode = createEpisodeState();
    const trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    expect(trade.aesFullAtEntry).toBe(72);
    expect(trade.side24hRankAtEntry).toBe(40);
    expect(trade.rankBandAtEntry).toBe("RANK_26_50");
    expect(trade.atrPct).toBe(0.7);
  });
});

describe("assertShadowSafe", () => {
  it("does not throw for valid shadow trade", () => {
    const episode = createEpisodeState();
    const trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    expect(() => assertShadowSafe(trade)).not.toThrow();
  });
});

describe("updateShadowTradeBroadScan", () => {
  it("updates currentPrice and MAE/MFE — LONG: price up = MFE (favorable)", () => {
    const episode = createEpisodeState();
    let trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    const ticker = { lastPrice: "1.05", priceChangePercent: "-7", side24hRank: 38 };
    trade = updateShadowTradeBroadScan(trade, ticker, NOW + 5000);
    expect(trade.currentPrice).toBe(1.05);
    // LONG: price moved UP from entry → MFE increases, MAE stays 0
    expect(trade.mfe).toBeGreaterThan(0);
    expect(trade.mae).toBe(0);
  });

  it("records enteredTop50 milestone", () => {
    const episode = createEpisodeState();
    let trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate({ side24hRank: 60 }),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    const ticker = { lastPrice: "0.95", priceChangePercent: "-10", side24hRank: 45 };
    trade = updateShadowTradeBroadScan(trade, ticker, NOW + 30_000);
    expect(trade.enteredTop50).toBe(true);
    expect(trade.enteredTop50At).toBe(NOW + 30_000);
    expect(trade.timeToTop50Ms).toBe(30_000);
  });

  it("does not overwrite already-set milestone timestamps", () => {
    const episode = createEpisodeState();
    let trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate({ side24hRank: 60 }),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    const ticker1 = { lastPrice: "0.95", priceChangePercent: "-10", side24hRank: 45 };
    trade = updateShadowTradeBroadScan(trade, ticker1, NOW + 30_000);
    const firstTime = trade.enteredTop50At;
    const ticker2 = { lastPrice: "0.93", priceChangePercent: "-11", side24hRank: 40 };
    trade = updateShadowTradeBroadScan(trade, ticker2, NOW + 60_000);
    expect(trade.enteredTop50At).toBe(firstTime);
  });
});

describe("evaluateShadowExit", () => {
  it("closes on SL when price falls 1% — LONG: down move triggers stop loss", () => {
    const episode = createEpisodeState();
    let trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    // Price falls 1.1% from 1.0 entry → SL fires for LONG
    trade = updateShadowTradeBroadScan(trade, { lastPrice: "0.989", priceChangePercent: "-7", side24hRank: 40 }, NOW + 5000);
    const closed = evaluateShadowExit(trade, CONFIG, NOW + 5000);
    expect(closed.closed).toBe(true);
    expect(closed.closeReason).toBe("SL");
    expect(closed.orderSubmitted).toBe(false);
  });

  it("calculates fee-adjusted PnL correctly on LONG SL", () => {
    const episode = createEpisodeState();
    let trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    trade = updateShadowTradeBroadScan(trade, { lastPrice: "0.989", priceChangePercent: "-7", side24hRank: 40 }, NOW + 5000);
    const closed = evaluateShadowExit(trade, CONFIG, NOW + 5000);
    expect(closed.feeDragPct).toBe(2 * CONFIG.takerFeeRatePctPerSide * CONFIG.defaultResearchLeverage);
    expect(typeof closed.normFeeAdjustedPnlPct).toBe("number");
    expect(closed.isShadowTrade).toBe(true);
  });

  it("does not close open trade if no exit condition met", () => {
    const episode = createEpisodeState();
    const trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    const result = evaluateShadowExit(trade, CONFIG, NOW + 1000);
    expect(result.closed).toBe(false);
  });
});

describe("shadow isolation", () => {
  it("shadow trade has isShadowTrade=true and can never have an orderId", () => {
    const episode = createEpisodeState();
    const trade = maybeShadowEntry({
      snapshot: makeSnapshot(), candidate: makeCandidate(),
      aesVariants: makeAesVariants(), episodeState: episode,
      existingShadowTrades: [], config: CONFIG, now: NOW,
    });
    expect(trade.isShadowTrade).toBe(true);
    expect(trade.orderId).toBeNull();
    expect(trade.orderSubmitted).toBe(false);
  });
});
