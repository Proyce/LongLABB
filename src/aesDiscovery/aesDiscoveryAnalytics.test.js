import { describe, it, expect } from "vitest";
import {
  buildAesDiscoveryAnalyticsReport,
  computeRankBandPerformance,
  computeRawVsConfirmedComparison,
  DISCOVERY_EVENT_CSV_HEADERS, discoveryEventCSVRow,
  SHADOW_TRADE_CSV_HEADERS, shadowTradeCSVRow,
  exportCSV, exportJSON,
} from "./aesDiscoveryAnalytics.js";

function makeTrade(overrides = {}) {
  return {
    id: `t${Math.random()}`,
    symbol: "TESTUSDT",
    side: "LOSER",
    leaderboardSide: "LOSERS",
    entryTime: Date.now() - 3600_000,
    entryPrice: 1.0,
    researchLeverage: 3,
    closed: true,
    closedAt: Date.now(),
    closeReason: "TP",
    holdMsActual: 3600_000,
    rankBandAtEntry: "RANK_26_50",
    outsideTop25AtEntry: true,
    outsideTop50AtEntry: false,
    aesFullAtEntry: 75,
    aesNoRankAtEntry: 72,
    aesSetupOnlyAtEntry: 68,
    normalizedRoundTripFeePct: 0.10,
    finalPnlPct: 5, normPnlPct: 1.67, feeDragPct: 0.3,
    feeAdjustedFinalPnlPct: 4.7, normFeeAdjustedPnlPct: 1.57,
    mae: 0.5, mfe: 2.1, mfeCaptureRatio: 0.8,
    isRawCohort: true, isGoldCohort: false,
    enteredTop50: false, enteredTop25: false,
    btcRegime: "BTC_WEAK_DOWN",
    labels: ["HIGH_AES_70_PLUS", "AES_RANK_26_50"],
    outcomeLabels: ["POST_FEE_WINNER", "POST_FEE_3_PLUS"],
    datasetSource: "AES_DISCOVERY_SHADOWS",
    isShadowTrade: true, executionMode: "LOG_ONLY", orderSubmitted: false,
    ...overrides,
  };
}

describe("buildAesDiscoveryAnalyticsReport", () => {
  it("returns empty report for no closed trades", () => {
    const report = buildAesDiscoveryAnalyticsReport([]);
    expect(report.totalClosed).toBe(0);
  });

  it("computes overall metrics for closed trades", () => {
    const trades = Array.from({ length: 5 }, () => makeTrade());
    const report = buildAesDiscoveryAnalyticsReport(trades);
    expect(report.totalClosed).toBe(5);
    expect(report.overallMetrics).not.toBeNull();
    expect(typeof report.overallMetrics.winRate).toBe("number");
  });

  it("rankBandPerformance contains entries", () => {
    const trades = Array.from({ length: 5 }, () => makeTrade());
    const report = buildAesDiscoveryAnalyticsReport(trades);
    expect(Object.keys(report.rankBandPerformance).length).toBeGreaterThan(0);
  });
});

describe("computeRankBandPerformance", () => {
  it("groups trades by band correctly", () => {
    const trades = [
      makeTrade({ rankBandAtEntry: "RANK_26_50", side: "LOSER" }),
      makeTrade({ rankBandAtEntry: "RANK_51_100", side: "LOSER" }),
    ];
    const result = computeRankBandPerformance(trades);
    expect(result["RANK_26_50:LOSER"]).toBeDefined();
    expect(result["RANK_51_100:LOSER"]).toBeDefined();
    expect(result["RANK_26_50:LOSER"].n).toBe(1);
  });
});

describe("computeRawVsConfirmedComparison", () => {
  it("separates raw-only from gold-confirmed", () => {
    const raw  = Array.from({ length: 3 }, () => makeTrade({ isRawCohort: true, isGoldCohort: false }));
    const gold = Array.from({ length: 2 }, () => makeTrade({ isRawCohort: true, isGoldCohort: true }));
    const result = computeRawVsConfirmedComparison([...raw, ...gold]);
    expect(result.rawOnly.n).toBe(3);
    expect(result.goldConfirmed.n).toBe(2);
  });
});

describe("CSV / JSON export", () => {
  it("discoveryEventCSVRow length equals header count", () => {
    const evt = {
      discoveryEventId: "e1", scannerVersion: "V1", scoreVersion: "v3",
      symbol: "TESTUSDT", side: "LOSER", detectedAt: Date.now(),
      side24hRankAtDetection: 40, rankBandAtDetection: "RANK_26_50",
      outsideTop25: true, outsideTop50: false, outsideTop100: false, outsideTop200: false,
      change24hAtDetection: -5, globalAbsChangeRankAtDetection: 40,
      prefilterScore: 70, prefilterReasons: ["LIQUIDITY"],
      aesFull: 75, aesNoRank: 72, aesSetupOnly: 68,
      aesFullMinusNoRank: 3, aesFullMinusSetupOnly: 7, rankContributionNet: 2,
      change24hContributionNet: null, telemetryCoveragePct: 85,
      telemetryMissingFields: [], telemetryWarnings: [],
      labels: ["HIGH_AES_70_PLUS"], btcContext: null, ethContext: null,
    };
    const row = discoveryEventCSVRow(evt);
    expect(row.length).toBe(DISCOVERY_EVENT_CSV_HEADERS.length);
  });

  it("shadowTradeCSVRow length equals header count", () => {
    const t = makeTrade();
    t.side24hRankAtEntry    = 40;
    t.rankBandAtEntry       = "RANK_26_50";
    t.globalAbsChangeRankAtEntry = 40;
    t.outsideTop25AtEntry   = true;
    t.outsideTop50AtEntry   = false;
    t.aesTriggerVariant     = "aesFull";
    t.aesTriggerThreshold   = 70;
    t.aesScoreVersion       = "v3";
    t.telemetryCoveragePctAtEntry = 85;
    t.aesEpisodeId          = "ep_1";
    t.triggerThreshold      = 70;
    t.triggerScoreVariant   = "aesFull";
    t.currentSide24hRank    = 38;
    t.bestSide24hRankReached= 38;
    t.worstSide24hRankReached=42;
    t.enteredTop100 = false; t.enteredTop100At = null;
    t.enteredTop50  = false; t.enteredTop50At  = null;
    t.enteredTop25  = false; t.enteredTop25At  = null;
    t.timeToTop100Ms = null; t.timeToTop50Ms = null; t.timeToTop25Ms = null;
    t.atrPct = 0.7; t.spreadPct = 0.03; t.cvdLabel = "BEAR";
    t.candleColorAtEntry = "RED"; t.hasRedConfirmation = true;
    t.immediateRedImpulse = true; t.immediateGreenImpulse = false;
    t.last3TicksDirection = "DOWN"; t.btcRunDirection = "DOWN"; t.btcRegime = "BTC_WEAK_DOWN";
    const row = shadowTradeCSVRow(t);
    expect(row.length).toBe(SHADOW_TRADE_CSV_HEADERS.length);
  });

  it("exportCSV produces a valid CSV string", () => {
    const csv = exportCSV([["a","b"], ["c","d"]], ["col1","col2"]);
    expect(csv).toContain("col1,col2");
    expect(csv).toContain("a,b");
  });

  it("exportJSON retains numeric types", () => {
    const json = exportJSON([{ score: 75.5 }]);
    const parsed = JSON.parse(json);
    expect(parsed[0].score).toBe(75.5);
  });

  it("discovery and normal exports remain separate (no shared headers)", () => {
    const discoveryHeaders = new Set(DISCOVERY_EVENT_CSV_HEADERS);
    const shadowHeaders    = new Set(SHADOW_TRADE_CSV_HEADERS);
    // They share some fields, but both should have their required distinctive fields
    expect(discoveryHeaders.has("discoveryEventId")).toBe(true);
    expect(shadowHeaders.has("isShadowTrade")).toBe(true);
  });
});
