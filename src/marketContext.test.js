import { describe, it, expect } from "vitest";
import {
  MARKET_CONTEXT_CONFIG,
  MARKET_CONTEXT_DEFAULTS,
  MARKET_CONTEXT_CSV_HEADERS,
  computeChangePct,
  classifyDirection,
  classifyCandleColor,
  computeVwap,
  classifyVwapPosition,
  ema,
  computeEmaSlopePct,
  classifyEmaStructure,
  computeAtrPct,
  classifyBtcAlignment,
  classifyBtcRegime,
  computeShortTailwindScore,
  classifyTradeBias,
  computeBtcConflictFlags,
  computeMarketContext,
  flattenMarketContext,
  marketContextCSVRow,
  pipeSeparated,
} from "./marketContext.js";

function makeKline(open, high, low, close, volume = 1000) {
  return [0, String(open), String(high), String(low), String(close), String(volume), 0, "0", 0, "0", "0", "0"];
}

function makeTrendKlines(count, start = 30000, step = -100, volume = 1000) {
  return Array.from({ length: count }, (_, i) => {
    const open = start + i * step;
    const close = open + step;
    const high = Math.max(open, close) + Math.abs(step) * 0.2;
    const low = Math.min(open, close) - Math.abs(step) * 0.2;
    return makeKline(open, high, low, close, volume);
  });
}

function makeFullBtcKlines(step = -100) {
  return {
    "5m": makeTrendKlines(61, 30000, step),
    "15m": makeTrendKlines(61, 30000, step),
    "30m": makeTrendKlines(61, 30000, step),
    "1h": makeTrendKlines(81, 30000, step),
    "2h": makeTrendKlines(81, 30000, step),
    "4h": makeTrendKlines(81, 30000, step),
  };
}

describe("computeChangePct", () => {
  it("uses the last two closed candles", () => {
    const klines = [
      makeKline(100, 101, 99, 100),
      makeKline(100, 106, 99, 105),
      makeKline(105, 210, 100, 200),
    ];
    expect(computeChangePct(klines)).toBe(5);
  });

  it("returns null without enough closed candles", () => {
    expect(computeChangePct([makeKline(100, 101, 99, 100)])).toBeNull();
  });
});

describe("classifyDirection", () => {
  it("classifies up, down, flat, and unknown", () => {
    expect(classifyDirection(0.2, 0.12)).toBe("UP");
    expect(classifyDirection(-0.2, 0.12)).toBe("DOWN");
    expect(classifyDirection(0.05, 0.12)).toBe("FLAT");
    expect(classifyDirection(null, 0.12)).toBe("UNKNOWN");
  });
});

describe("classifyCandleColor", () => {
  it("classifies the latest closed candle color", () => {
    expect(classifyCandleColor([
      makeKline(100, 104, 99, 103),
      makeKline(103, 104, 95, 98),
      makeKline(98, 120, 90, 115),
    ])).toBe("RED");
  });

  it("returns UNKNOWN when no closed candle exists", () => {
    expect(classifyCandleColor([makeKline(100, 101, 99, 100)])).toBe("UNKNOWN");
  });
});

describe("computeVwap", () => {
  it("computes VWAP over the closed lookback window", () => {
    const klines = [
      makeKline(100, 110, 90, 100, 10),
      makeKline(100, 120, 90, 105, 10),
      makeKline(105, 200, 100, 180, 10),
    ];
    const result = computeVwap(klines, 2);
    expect(result.vwap).toBeCloseTo(102.5, 4);
    expect(result.warning).toBeNull();
  });

  it("warns when volume is zero", () => {
    const klines = [
      makeKline(100, 110, 90, 100, 0),
      makeKline(100, 120, 90, 105, 0),
      makeKline(105, 200, 100, 180, 10),
    ];
    expect(computeVwap(klines, 2).warning).toBe("ZERO_VOLUME_FOR_BTC_VWAP");
  });
});

describe("classifyVwapPosition", () => {
  it("labels above, below, at, and unknown", () => {
    expect(classifyVwapPosition(101, 100, 0.05)).toEqual({ priceVsVwapPct: 1, label: "ABOVE_VWAP" });
    expect(classifyVwapPosition(99, 100, 0.05)).toEqual({ priceVsVwapPct: -1, label: "BELOW_VWAP" });
    expect(classifyVwapPosition(100.03, 100, 0.05)).toEqual({ priceVsVwapPct: 0.03, label: "AT_VWAP" });
    expect(classifyVwapPosition(null, 100)).toEqual({ priceVsVwapPct: null, label: "UNKNOWN" });
  });
});

describe("ema", () => {
  it("computes exponential moving average", () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toBe(4);
  });

  it("returns null when there are not enough values", () => {
    expect(ema([1, 2], 3)).toBeNull();
  });
});

describe("computeEmaSlopePct", () => {
  it("computes previous-to-current EMA slope percentage", () => {
    expect(computeEmaSlopePct([1, 2, 3, 4, 5], 3)).toBeCloseTo(33.3333, 4);
  });
});

describe("classifyEmaStructure", () => {
  it("classifies bullish, bearish, flat, and unknown", () => {
    expect(classifyEmaStructure(105, 100, 0.1)).toBe("BULLISH");
    expect(classifyEmaStructure(95, 100, 0.1)).toBe("BEARISH");
    expect(classifyEmaStructure(100.05, 100, 0.1)).toBe("FLAT");
    expect(classifyEmaStructure(null, 100, 0.1)).toBe("UNKNOWN");
  });
});

describe("computeAtrPct", () => {
  it("computes ATR as a percentage of latest close", () => {
    const cfg = { ...MARKET_CONTEXT_CONFIG, useClosedCandlesOnly: false };
    const klines = [
      makeKline(100, 105, 95, 100),
      makeKline(100, 110, 99, 108),
      makeKline(108, 112, 101, 102),
    ];
    expect(computeAtrPct(klines, 2, cfg)).toBeCloseTo(10.7843, 4);
  });
});

describe("classifyBtcAlignment", () => {
  it("classifies core 15m/1h/2h alignment", () => {
    expect(classifyBtcAlignment("DOWN", "DOWN", "DOWN")).toBe("ALL_DOWN");
    expect(classifyBtcAlignment("DOWN", "DOWN", "UP")).toBe("MOSTLY_DOWN");
    expect(classifyBtcAlignment("UP", "UP", "UP")).toBe("ALL_UP");
    expect(classifyBtcAlignment("UP", "UP", "DOWN")).toBe("MOSTLY_UP");
    expect(classifyBtcAlignment("FLAT", "FLAT", "UP")).toBe("CHOP");
    expect(classifyBtcAlignment("UP", "DOWN", "FLAT")).toBe("MIXED");
    expect(classifyBtcAlignment("UP", "UNKNOWN", "FLAT")).toBe("UNKNOWN");
  });
});

describe("classifyBtcRegime", () => {
  it("classifies down/up/chop/mixed BTC regimes", () => {
    expect(classifyBtcRegime({
      alignment: "ALL_DOWN",
      priceVsVwap1hLabel: "BELOW_VWAP",
      emaStructure1h: "BEARISH",
    })).toBe("BTC_STRONG_DOWN");
    expect(classifyBtcRegime({
      alignment: "MOSTLY_DOWN",
      priceVsVwap1hLabel: "AT_VWAP",
      emaStructure1h: "FLAT",
    })).toBe("BTC_WEAK_DOWN");
    expect(classifyBtcRegime({
      alignment: "ALL_UP",
      priceVsVwap1hLabel: "ABOVE_VWAP",
      emaStructure1h: "BULLISH",
    })).toBe("BTC_STRONG_UP");
    expect(classifyBtcRegime({
      alignment: "MOSTLY_UP",
      priceVsVwap1hLabel: "AT_VWAP",
      emaStructure1h: "FLAT",
    })).toBe("BTC_WEAK_UP");
    expect(classifyBtcRegime({
      alignment: "CHOP",
      priceVsVwap1hLabel: "AT_VWAP",
      emaStructure1h: "FLAT",
    })).toBe("BTC_CHOP");
    expect(classifyBtcRegime({
      alignment: "MIXED",
      priceVsVwap1hLabel: "ABOVE_VWAP",
      emaStructure1h: "BULLISH",
    })).toBe("BTC_MIXED");
  });
});

describe("computeShortTailwindScore", () => {
  it("scores short BTC tailwind and headwind", () => {
    expect(computeShortTailwindScore({
      direction15m: "DOWN",
      direction1h: "DOWN",
      direction2h: "DOWN",
      priceVsVwap1hLabel: "BELOW_VWAP",
      emaStructure1h: "BEARISH",
    })).toBe(100);
    expect(computeShortTailwindScore({
      direction15m: "UP",
      direction1h: "UP",
      direction2h: "UP",
      priceVsVwap1hLabel: "ABOVE_VWAP",
      emaStructure1h: "BULLISH",
    })).toBe(-100);
  });
});

describe("classifyTradeBias", () => {
  it("classifies numeric tailwind scores", () => {
    expect(classifyTradeBias(60)).toBe("STRONG_TAILWIND");
    expect(classifyTradeBias(25)).toBe("WEAK_TAILWIND");
    expect(classifyTradeBias(0)).toBe("NEUTRAL");
    expect(classifyTradeBias(-25)).toBe("WEAK_HEADWIND");
    expect(classifyTradeBias(-60)).toBe("STRONG_HEADWIND");
  });
});

describe("computeBtcConflictFlags", () => {
  it("adds conflict and alignment flags", () => {
    expect(computeBtcConflictFlags({
      direction15m: "UP",
      direction1h: "DOWN",
      direction2h: "FLAT",
      priceVsVwap1hLabel: "ABOVE_VWAP",
    })).toEqual(["BTC_15M_UP_1H_DOWN", "BTC_1H_DOWN_BUT_ABOVE_VWAP"]);
    expect(computeBtcConflictFlags({
      direction15m: "DOWN",
      direction1h: "DOWN",
      direction2h: "DOWN",
      priceVsVwap1hLabel: "BELOW_VWAP",
    })).toContain("BTC_ALL_DOWN_SHORT_TAILWIND");
  });
});

describe("computeMarketContext", () => {
  it("builds the full market context structure", () => {
    const snapshot = computeMarketContext({
      btcKlinesByInterval: makeFullBtcKlines(-100),
      computedAt: 123456,
    });

    expect(snapshot.version).toBe("market-context-v1");
    expect(snapshot.source).toBe("binance-futures");
    expect(snapshot.stale).toBe(false);
    expect(snapshot.staleReason).toBeNull();
    expect(snapshot.btc.symbol).toBe("BTCUSDT");
    expect(snapshot.btc.marketType).toBe("FUTURES");
    expect(snapshot.btc.price).toBeTypeOf("number");
    expect(snapshot.btc.direction15m).toBe("DOWN");
    expect(snapshot.btc.direction1h).toBe("DOWN");
    expect(snapshot.btc.direction2h).toBe("DOWN");
    expect(snapshot.btc.candleColor15m).toBe("RED");
    expect(snapshot.btc.priceVsVwap1hLabel).toBe("BELOW_VWAP");
    expect(snapshot.btc.emaStructure1h).toBe("BEARISH");
    expect(snapshot.btc.alignment).toBe("ALL_DOWN");
    expect(snapshot.btc.regime).toBe("BTC_STRONG_DOWN");
    expect(snapshot.btc.shortBias).toBe("STRONG_TAILWIND");
    expect(snapshot.btc.longBias).toBe("STRONG_HEADWIND");
    expect(snapshot.btc.shortTailwindScore).toBe(100);
    expect(snapshot.btc.longTailwindScore).toBe(-100);
    expect(snapshot.btc.conflictFlags).toContain("BTC_ALL_DOWN_SHORT_TAILWIND");
    expect(snapshot.btc.warnings).toEqual([]);
  });
});

describe("flattenMarketContext", () => {
  it("flattens nested BTC context onto root trade fields", () => {
    const snapshot = computeMarketContext({
      btcKlinesByInterval: makeFullBtcKlines(-100),
      computedAt: 123456,
    });
    const flat = flattenMarketContext(snapshot);

    expect(flat.marketContext).toBe(snapshot);
    expect(flat.btcRegime).toBe("BTC_STRONG_DOWN");
    expect(flat.btcShortBias).toBe("STRONG_TAILWIND");
    expect(flat.btcDirection15m).toBe("DOWN");
    expect(flat.btcDirection1h).toBe("DOWN");
    expect(flat.btcDirection2h).toBe("DOWN");
    expect(flat.btcShortTailwindScore).toBe(100);
    expect(flat.btcContextStale).toBe(false);
  });

  it("returns defaults when no BTC snapshot exists", () => {
    expect(flattenMarketContext(null)).toEqual(MARKET_CONTEXT_DEFAULTS);
  });

  it("preserves fallback snapshot when BTC fetch fails", () => {
    const fallback = {
      version: "market-context-v1",
      computedAt: 123456,
      source: "binance-futures",
      stale: true,
      staleReason: "BTC_CONTEXT_FETCH_FAILED",
      btc: null,
    };

    const flat = flattenMarketContext(fallback);

    expect(flat.marketContext).toBe(fallback);
    expect(flat.btcContextStale).toBe(true);
    expect(flat.btcContextStaleReason).toBe("BTC_CONTEXT_FETCH_FAILED");

    expect(flat.btcRegime).toBe("UNKNOWN");
    expect(flat.btcShortBias).toBe("UNKNOWN");
    expect(flat.btcShortTailwindScore).toBe(0);
  });
});

describe("marketContextCSVRow", () => {
  it("matches MARKET_CONTEXT_CSV_HEADERS length", () => {
    const row = marketContextCSVRow(MARKET_CONTEXT_DEFAULTS);
    expect(row).toHaveLength(MARKET_CONTEXT_CSV_HEADERS.length);
  });

  it("serializes array fields as pipe-separated values", () => {
    const trade = {
      ...MARKET_CONTEXT_DEFAULTS,
      btcConflictFlags: ["BTC_A", "BTC_B"],
      btcWarnings: ["WARN|A", "WARN_B"],
    };
    const row = marketContextCSVRow(trade);
    const flagsIdx = MARKET_CONTEXT_CSV_HEADERS.indexOf("btcConflictFlags");
    const warningsIdx = MARKET_CONTEXT_CSV_HEADERS.indexOf("btcWarnings");

    expect(row[flagsIdx]).toBe("BTC_A|BTC_B");
    expect(row[warningsIdx]).toBe("WARN A|WARN_B");
    expect(pipeSeparated(["A|B", "C"])).toBe("A B|C");
  });
});
