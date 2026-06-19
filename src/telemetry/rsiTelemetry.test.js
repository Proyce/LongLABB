import { describe, it, expect } from "vitest";
import {
  RSI_TELEMETRY_CONFIG,
  RSI_TELEMETRY_DEFAULTS,
  RSI_TELEMETRY_CSV_HEADERS,
  classifyRsiBucket,
  classifyRsiSlope,
  computeRsi,
  computeRsiDivergence,
  computeRsiSeries,
  computeRsiSpreads,
  computeRsiTelemetry,
  crossedDown,
  crossedUp,
  flattenRsiTelemetry,
  pipeSeparated,
  rsiTelemetryCSVRow,
} from "./rsiTelemetry.js";

function makeKline(open, high, low, close, volume = 1000) {
  return [0, String(open), String(high), String(low), String(close), String(volume), 0, "0", 0, "0", "0", "0"];
}

function makeTrendKlines(count, start = 100, step = 0.5) {
  return Array.from({ length: count }, (_, i) => {
    const open = start + i * step;
    const close = open + step;
    const high = Math.max(open, close) + Math.abs(step) * 0.4;
    const low = Math.min(open, close) - Math.abs(step) * 0.4;
    return makeKline(open, high, low, close);
  });
}

function makeFullRsiKlines(step = 0.5) {
  return {
    "1m": makeTrendKlines(121, 100, step),
    "3m": makeTrendKlines(121, 100, step),
    "5m": makeTrendKlines(121, 100, step),
    "15m": makeTrendKlines(121, 100, step),
    "30m": makeTrendKlines(121, 100, step),
    "1h": makeTrendKlines(121, 100, step),
    "2h": makeTrendKlines(121, 100, step),
    "4h": makeTrendKlines(121, 100, step),
  };
}

describe("computeRsiSeries", () => {
  it("returns empty array when insufficient candles", () => {
    expect(computeRsiSeries([1, 2, 3], 14)).toEqual([]);
  });

  it("calculates RSI for known close series", () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33,
      44.83, 45.10, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28,
      46.00, 46.03, 46.41, 46.22, 45.64,
      46.21,
    ];
    const series = computeRsiSeries(closes, 14);
    expect(series[0]).toBeCloseTo(70.4641, 4);
    expect(series[series.length - 1]).toBeCloseTo(62.8807, 4);
    expect(computeRsi(closes, 14)).toBe(62.8807);
  });
});

describe("computeRsi", () => {
  it("returns null when insufficient candles", () => {
    expect(computeRsi([1, 2, 3], 14)).toBeNull();
  });
});

describe("classifyRsiBucket", () => {
  it("returns all bucket labels", () => {
    expect(classifyRsiBucket(29.9)).toBe("OVERSOLD");
    expect(classifyRsiBucket(35)).toBe("LOW");
    expect(classifyRsiBucket(50)).toBe("NEUTRAL");
    expect(classifyRsiBucket(65)).toBe("HIGH");
    expect(classifyRsiBucket(75)).toBe("OVERBOUGHT");
    expect(classifyRsiBucket(85)).toBe("EXTREME");
    expect(classifyRsiBucket(null)).toBe("UNKNOWN");
  });
});

describe("classifyRsiSlope", () => {
  it("returns slope labels", () => {
    expect(classifyRsiSlope(0.26, 0.25)).toBe("RISING");
    expect(classifyRsiSlope(-0.26, 0.25)).toBe("FALLING");
    expect(classifyRsiSlope(0.1, 0.25)).toBe("FLAT");
    expect(classifyRsiSlope(null, 0.25)).toBe("UNKNOWN");
  });
});

describe("RSI cross events", () => {
  it("crossedDown detects RSI crossing down 70/60/50", () => {
    expect(crossedDown(72, 70, 70)).toBe(true);
    expect(crossedDown(62, 59.9, 60)).toBe(true);
    expect(crossedDown(51, 49.9, 50)).toBe(true);
    expect(crossedDown(70, 69, 70)).toBe(false);
    expect(crossedDown(null, 69, 70)).toBe(false);
  });

  it("crossedUp detects RSI crossing up 30/40/50", () => {
    expect(crossedUp(29, 30, 30)).toBe(true);
    expect(crossedUp(39.9, 40, 40)).toBe(true);
    expect(crossedUp(49, 51, 50)).toBe(true);
    expect(crossedUp(30, 31, 30)).toBe(false);
    expect(crossedUp(29, null, 30)).toBe(false);
  });
});

describe("computeRsiSpreads", () => {
  it("computes 1m-3m, 3m-5m, 5m-15m, and 15m-1h spreads", () => {
    expect(computeRsiSpreads({
      "1m": { rsi: 50 },
      "3m": { rsi: 55 },
      "5m": { rsi: 60 },
      "15m": { rsi: 70 },
      "1h": { rsi: 65 },
    })).toEqual({
      rsiSpread1m3m: -5,
      rsiSpread3m5m: -5,
      rsiSpread5m15m: -10,
      rsiSpread15m1h: 5,
    });
  });
});

describe("computeRsiDivergence", () => {
  it("detects bearish divergence", () => {
    const closed = [
      makeKline(100, 101, 99, 100),
      makeKline(100, 102, 99, 101),
      makeKline(101, 103, 100, 102),
      makeKline(102, 104, 101, 103),
      makeKline(103, 105, 102, 104),
      makeKline(104, 104, 102, 103),
      makeKline(103, 106, 102, 105),
      makeKline(105, 108, 104, 107),
      makeKline(107, 110, 106, 109),
      makeKline(109, 109, 107, 108),
      makeKline(108, 111, 107, 110),
      makeKline(110, 112, 109, 111),
    ];
    const live = makeKline(111, 130, 90, 120);
    const rsiSeries = [50, 55, 80, 78, 75, 76, 77, 70, 68, 69, 67, 66];

    const result = computeRsiDivergence([...closed, live], rsiSeries, 10);

    expect(result.bearish).toBe(true);
    expect(result.bullish).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("detects bullish divergence", () => {
    const closed = [
      makeKline(100, 103, 99, 101),
      makeKline(101, 102, 98, 100),
      makeKline(100, 102, 95, 97),
      makeKline(97, 99, 94, 96),
      makeKline(96, 98, 93, 95),
      makeKline(95, 97, 94, 96),
      makeKline(96, 97, 92, 94),
      makeKline(94, 96, 90, 92),
      makeKline(92, 95, 89, 91),
      makeKline(91, 94, 88, 90),
      makeKline(90, 93, 87, 89),
      makeKline(89, 92, 86, 88),
    ];
    const live = makeKline(88, 140, 50, 120);
    const rsiSeries = [55, 50, 22, 24, 25, 23, 26, 30, 31, 29, 32, 34];

    const result = computeRsiDivergence([...closed, live], rsiSeries, 10);

    expect(result.bearish).toBe(false);
    expect(result.bullish).toBe(true);
    expect(result.warning).toBeNull();
  });
});

describe("computeRsiTelemetry", () => {
  it("builds full nested snapshot", () => {
    const snapshot = computeRsiTelemetry({
      symbol: "TESTUSDT",
      side: "SHORT",
      klinesByInterval: makeFullRsiKlines(0.5),
      computedAt: 123456,
    });

    expect(snapshot.version).toBe("rsi-telemetry-v1");
    expect(snapshot.computedAt).toBe(123456);
    expect(snapshot.symbol).toBe("TESTUSDT");
    expect(snapshot.side).toBe("SHORT");
    expect(snapshot.period).toBe(14);
    expect(snapshot.timeframes).toEqual(["1m", "3m", "5m", "15m", "30m", "1h"]);
    expect(snapshot.useClosedCandlesOnly).toBe(true);
    expect(snapshot.values["3m"].timeframe).toBe("3m");
    expect(snapshot.values["3m"].rsi).toBeTypeOf("number");
    expect(snapshot.values["3m"].bucket).not.toBe("UNKNOWN");
    expect(snapshot.spreads).toHaveProperty("rsiSpread1m3m");
    expect(snapshot.divergence).toHaveProperty("bearishRsiDivergence3m");
    expect(snapshot.labels).toHaveProperty("rsiCompositeLabel");
    expect(snapshot.scores).toHaveProperty("rsiShortScore");
    expect(snapshot.telemetryComplete).toBe(true);
  });

  it("sets telemetryComplete=false if required timeframes are missing", () => {
    const snapshot = computeRsiTelemetry({
      symbol: "TESTUSDT",
      klinesByInterval: {
        "1m": makeTrendKlines(121),
        "5m": makeTrendKlines(121),
        "15m": makeTrendKlines(121),
        "30m": makeTrendKlines(121),
        "1h": makeTrendKlines(121),
      },
    });

    expect(snapshot.telemetryComplete).toBe(false);
    expect(snapshot.values["3m"].rsi).toBeNull();
    expect(snapshot.values["3m"].bucket).toBe("UNKNOWN");
    expect(snapshot.missingFields).toContain("rsi3m");
    expect(snapshot.warnings).toContain("NOT_ENOUGH_CANDLES_FOR_RSI_3m");
  });
});

describe("flattenRsiTelemetry", () => {
  it("adds root fields", () => {
    const snapshot = computeRsiTelemetry({
      symbol: "TESTUSDT",
      klinesByInterval: makeFullRsiKlines(0.5),
    });
    const flat = flattenRsiTelemetry(snapshot);

    expect(flat.rsiTelemetry).toBe(snapshot);
    expect(flat.rsiTelemetryComplete).toBe(true);
    expect(flat.rsi3m).toBeTypeOf("number");
    expect(flat.rsi3mBucket).not.toBe("UNKNOWN");
    expect(flat.rsi3mSlope).not.toBe("UNKNOWN");
    expect(flat).toHaveProperty("rsiSpread1m3m");
    expect(flat).toHaveProperty("bearishRsiDivergence3m");
    expect(flat).toHaveProperty("rsiShortSetupLabel");
    expect(flat).toHaveProperty("rsiShortScore");
  });

  it("returns defaults when snapshot is missing", () => {
    expect(flattenRsiTelemetry(null)).toEqual(RSI_TELEMETRY_DEFAULTS);
  });
});

describe("RSI_TELEMETRY_DEFAULTS", () => {
  it("uses null/UNKNOWN, not fake RSI 50", () => {
    expect(RSI_TELEMETRY_DEFAULTS.rsi1m).toBeNull();
    expect(RSI_TELEMETRY_DEFAULTS.rsi3m).toBeNull();
    expect(RSI_TELEMETRY_DEFAULTS.rsi5m).toBeNull();
    expect(RSI_TELEMETRY_DEFAULTS.rsi15m).toBeNull();
    expect(RSI_TELEMETRY_DEFAULTS.rsi1mBucket).toBe("UNKNOWN");
    expect(Object.values(RSI_TELEMETRY_DEFAULTS)).not.toContain(50);
  });
});

describe("rsiTelemetryCSVRow", () => {
  it("length matches RSI_TELEMETRY_CSV_HEADERS", () => {
    const row = rsiTelemetryCSVRow(RSI_TELEMETRY_DEFAULTS);
    expect(row).toHaveLength(RSI_TELEMETRY_CSV_HEADERS.length);
  });

  it("pipe-serializes arrays", () => {
    const row = rsiTelemetryCSVRow({
      ...RSI_TELEMETRY_DEFAULTS,
      rsiMissingFields: ["rsi1m", "rsi3m"],
      rsiWarnings: ["WARN|A", "WARN_B"],
    });
    const missingIdx = RSI_TELEMETRY_CSV_HEADERS.indexOf("rsiMissingFields");
    const warningsIdx = RSI_TELEMETRY_CSV_HEADERS.indexOf("rsiWarnings");

    expect(row[missingIdx]).toBe("rsi1m|rsi3m");
    expect(row[warningsIdx]).toBe("WARN A|WARN_B");
    expect(pipeSeparated(["A|B", "C"])).toBe("A B|C");
  });
});

describe("RSI_TELEMETRY_CONFIG", () => {
  it("strictRsiTelemetry defaults to false", () => {
    expect(RSI_TELEMETRY_CONFIG.strictRsiTelemetry).toBe(false);
  });

  it("includes 3m from day one", () => {
    expect(RSI_TELEMETRY_CONFIG.timeframes).toContain("3m");
  });
});
