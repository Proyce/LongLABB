import { describe, it, expect } from "vitest";
import { buildFullDiscoveryUniverse, classifyRankBand, computeTickHistoryFields, updateTickHistory } from "./aesDiscoveryUniverse.js";
import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";

function makeTicker(symbol, pcp, qv = 20_000_000, lastPrice = "1.0", highPrice = "1.2", lowPrice = "0.8") {
  return { symbol, priceChangePercent: String(pcp), quoteVolume: String(qv), lastPrice, highPrice, lowPrice };
}

const BASE_CONFIG = { ...AES_DISCOVERY_CONFIG, minQuoteVolume: 10_000_000, stablecoinSymbols: ["USDCUSDT"] };

describe("buildFullDiscoveryUniverse", () => {
  it("returns gainersTop30 and losersTop30 for backward compat", () => {
    const tickers = [
      ...Array.from({ length: 40 }, (_, i) => makeTicker(`GAIN${i}USDT`, i + 1)),
      ...Array.from({ length: 40 }, (_, i) => makeTicker(`LOSE${i}USDT`, -(i + 1))),
    ];
    const result = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(result.gainersTop30.length).toBe(30);
    expect(result.losersTop30.length).toBe(30);
  });

  it("gainersAll is sorted descending by pcp", () => {
    const tickers = [makeTicker("AAUSDT", 3), makeTicker("BBUSDT", 7), makeTicker("CCUSDT", 1)];
    const { gainersAll } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(gainersAll.map(t => parseFloat(t.priceChangePercent))).toEqual([7, 3, 1]);
  });

  it("losersAll is sorted ascending (most negative first)", () => {
    const tickers = [makeTicker("AAUSDT", -1), makeTicker("BBUSDT", -5), makeTicker("CCUSDT", -2)];
    const { losersAll } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(losersAll.map(t => parseFloat(t.priceChangePercent))).toEqual([-5, -2, -1]);
  });

  it("assigns exact side24hRank starting at 1", () => {
    const tickers = [makeTicker("AAUSDT", 5), makeTicker("BBUSDT", 3), makeTicker("CCUSDT", -2)];
    const { gainersAll, losersAll } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(gainersAll[0].side24hRank).toBe(1);
    expect(gainersAll[1].side24hRank).toBe(2);
    expect(losersAll[0].side24hRank).toBe(1);
  });

  it("sets outsideTop25 correctly at rank 25 vs 26", () => {
    const tickers = Array.from({ length: 30 }, (_, i) => makeTicker(`G${i}USDT`, 30 - i));
    const { gainersAll } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    const rank25 = gainersAll.find(t => t.side24hRank === 25);
    const rank26 = gainersAll.find(t => t.side24hRank === 26);
    expect(rank25.outsideTop25).toBe(false);
    expect(rank26.outsideTop25).toBe(true);
  });

  it("sets outsideTop50 correctly at rank 50 vs 51", () => {
    const tickers = Array.from({ length: 60 }, (_, i) => makeTicker(`G${i}USDT`, 60 - i));
    const { gainersAll } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(gainersAll.find(t => t.side24hRank === 50).outsideTop50).toBe(false);
    expect(gainersAll.find(t => t.side24hRank === 51).outsideTop50).toBe(true);
  });

  it("excludes ineligible contracts (zero price, no USDT suffix, stablecoin)", () => {
    const tickers = [
      makeTicker("BTCETH", 5),           // no USDT suffix
      makeTicker("USDCUSDT", 3),         // stablecoin
      { symbol: "XYZUSDT", priceChangePercent: "5", quoteVolume: "20000000", lastPrice: "0", highPrice: "1", lowPrice: "0" }, // zero price
      makeTicker("ETHUSDT", 3),          // valid
    ];
    const { allEligible } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(allEligible.map(t => t.symbol)).toEqual(["ETHUSDT"]);
  });

  it("excludes below min-volume symbols", () => {
    const tickers = [makeTicker("LOWUSDT", 5, 1_000_000), makeTicker("OKUSDT", 5, 20_000_000)];
    const { allEligible } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(allEligible.map(t => t.symbol)).toEqual(["OKUSDT"]);
  });

  it("zero-change symbols get eligibleUniverseSize but no side rank", () => {
    const tickers = [makeTicker("FLATUSDT", 0), makeTicker("GAINUSDT", 5)];
    const { allEligible } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    const flat = allEligible.find(t => t.symbol === "FLATUSDT");
    expect(flat).toBeDefined();
    // zero-change lands in neither gainers nor losers
    expect(flat.gainer24hRank).toBeNull();
    expect(flat.loser24hRank).toBeNull();
  });

  it("universeMeta contains correct counts", () => {
    const tickers = [makeTicker("AUSDT", 3), makeTicker("BUSDT", -2)];
    const { universeMeta } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(universeMeta.eligibleUniverseSize).toBe(2);
    expect(universeMeta.gainerUniverseSize).toBe(1);
    expect(universeMeta.loserUniverseSize).toBe(1);
  });

  it("rank band boundary: rank 100 vs 101", () => {
    const tickers = Array.from({ length: 110 }, (_, i) => makeTicker(`G${i}USDT`, 110 - i));
    const { gainersAll } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(gainersAll.find(t => t.side24hRank === 100).rankBand).toBe("RANK_51_100");
    expect(gainersAll.find(t => t.side24hRank === 101).rankBand).toBe("RANK_101_200");
  });

  it("rank band boundary: rank 200 vs 201", () => {
    const tickers = Array.from({ length: 210 }, (_, i) => makeTicker(`G${i}USDT`, 210 - i));
    const { gainersAll } = buildFullDiscoveryUniverse({ tickers, config: BASE_CONFIG });
    expect(gainersAll.find(t => t.side24hRank === 200).rankBand).toBe("RANK_101_200");
    expect(gainersAll.find(t => t.side24hRank === 201).rankBand).toBe("RANK_201_PLUS");
  });
});

describe("classifyRankBand", () => {
  const bands = AES_DISCOVERY_CONFIG.rankBands;
  it("classifies rank 1 as TOP_1_25", ()  => expect(classifyRankBand(1, bands)).toBe("TOP_1_25"));
  it("classifies rank 25 as TOP_1_25", () => expect(classifyRankBand(25, bands)).toBe("TOP_1_25"));
  it("classifies rank 26 as RANK_26_50", ()=> expect(classifyRankBand(26, bands)).toBe("RANK_26_50"));
  it("classifies rank 50 as RANK_26_50", ()=> expect(classifyRankBand(50, bands)).toBe("RANK_26_50"));
  it("classifies rank 51 as RANK_51_100",()=> expect(classifyRankBand(51, bands)).toBe("RANK_51_100"));
  it("classifies rank 201+ as RANK_201_PLUS", () => expect(classifyRankBand(999, bands)).toBe("RANK_201_PLUS"));
});

describe("computeTickHistoryFields", () => {
  it("returns empty object for symbol with no history", () => {
    expect(computeTickHistoryFields("XYZUSDT", {})).toEqual({});
  });

  it("computes last3BroadTicksDirection DOWN when prices keep dropping", () => {
    const store = { "AAUSDT": [
      { ts: 1000, priceChangePercent: -3, quoteVolume: 1e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 1.0 },
      { ts: 2000, priceChangePercent: -5, quoteVolume: 1e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 0.95 },
      { ts: 3000, priceChangePercent: -7, quoteVolume: 1e7, highPrice: 1.2, lowPrice: 0.8, lastPrice: 0.90 },
    ]};
    const fields = computeTickHistoryFields("AAUSDT", store);
    expect(fields.last3BroadTicksDirection).toBe("DOWN");
  });
});

describe("updateTickHistory", () => {
  it("prunes old snapshots beyond maxAgeMs", () => {
    const store = { "AUSDT": [
      { ts: 1000, priceChangePercent: -1, quoteVolume: 1e7, highPrice: 1, lowPrice: 0.8, lastPrice: 0.9 },
    ]};
    const config = { ...BASE_CONFIG, tickHistoryMaxAgeMs: 5000, tickHistoryMaxSnapshots: 10 };
    const candidates = [{ symbol: "AUSDT", priceChangePercent: "-2", quoteVolume: "1e7", highPrice: "1", lowPrice: "0.8", lastPrice: "0.9", side24hRank: 30 }];
    updateTickHistory(store, candidates, config, 10_000); // 10s later, old snap is ~9s old
    expect(store["AUSDT"].length).toBe(1); // only the new one
  });
});
