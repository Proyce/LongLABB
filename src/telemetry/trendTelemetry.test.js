import { describe, it, expect } from "vitest";
import {
  TREND_TELEMETRY_CONFIG,
  TREND_TELEMETRY_DEFAULTS,
  TREND_TELEMETRY_CSV_HEADERS,
  classifyAdxStrength,
  classifyDmiBias,
  classifyEmaPricePosition,
  classifyEmaSlope,
  classifyEmaStack,
  classifyMacdHistogramState,
  computeAdxDmiTelemetry,
  computeDirectionalMovementSeries,
  computeEma,
  computeEmaSeries,
  computeMacdSeries,
  computeTrendTelemetry,
  computeTrueRangeSeries,
  flattenTrendTelemetry,
  pipeSeparated,
  trendTelemetryCSVRow,
} from "./trendTelemetry.js";

function makeKline(open, high, low, close, volume = 1000) {
  return [0, String(open), String(high), String(low), String(close), String(volume), 0, "0", 0, "0", "0", "0"];
}

function makeTrendKlines(count, start = 100, step = 0.5) {
  return Array.from({ length: count }, (_, i) => {
    const open = start + i * step;
    const close = open + step;
    const high = Math.max(open, close) + Math.abs(step) * 0.6 + 0.1;
    const low = Math.min(open, close) - Math.abs(step) * 0.4 - 0.1;
    return makeKline(open, high, low, close);
  });
}

function makeFullTrendKlines(step = -0.5) {
  return {
    "1m": makeTrendKlines(161, 180, step),
    "3m": makeTrendKlines(161, 180, step),
    "5m": makeTrendKlines(161, 180, step),
    "15m": makeTrendKlines(161, 180, step),
    "30m": makeTrendKlines(161, 180, step),
    "1h": makeTrendKlines(161, 180, step),
  };
}

describe("EMA helpers", () => {
  it("computeEmaSeries returns empty array with insufficient candles", () => {
    expect(computeEmaSeries([1, 2], 3)).toEqual([]);
  });

  it("computeEma returns latest EMA", () => {
    expect(computeEma([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)).toBe(9);
  });

  it("classifyEmaStack returns stack labels", () => {
    expect(classifyEmaStack({ ema9: 90, ema20: 100, ema50: 110 })).toBe("BEARISH_STACK");
    expect(classifyEmaStack({ ema9: 110, ema20: 100, ema50: 90 })).toBe("BULLISH_STACK");
    expect(classifyEmaStack({ ema9: 100, ema20: 110, ema50: 90 })).toBe("MIXED_STACK");
    expect(classifyEmaStack({ ema9: null, ema20: 100, ema50: 90 })).toBe("UNKNOWN");
  });

  it("classifyEmaSlope returns RISING / FALLING / FLAT / UNKNOWN", () => {
    expect(classifyEmaSlope(0.04, 0.03)).toBe("RISING");
    expect(classifyEmaSlope(-0.04, 0.03)).toBe("FALLING");
    expect(classifyEmaSlope(0.01, 0.03)).toBe("FLAT");
    expect(classifyEmaSlope(null, 0.03)).toBe("UNKNOWN");
  });

  it("classifyEmaPricePosition returns ABOVE_FAST_EMA / BELOW_FAST_EMA / BETWEEN_EMAS", () => {
    expect(classifyEmaPricePosition({ price: 120, ema9: 100, ema20: 110, ema50: 90 })).toBe("ABOVE_FAST_EMA");
    expect(classifyEmaPricePosition({ price: 90, ema9: 100, ema20: 110, ema50: 120 })).toBe("BELOW_FAST_EMA");
    expect(classifyEmaPricePosition({ price: 105, ema9: 100, ema20: 110, ema50: 120 })).toBe("BETWEEN_EMAS");
  });
});

describe("ADX/DMI helpers", () => {
  it("computeTrueRangeSeries returns valid TR values", () => {
    const klines = [
      makeKline(10, 12, 9, 10),
      makeKline(10, 13, 8, 12),
      makeKline(12, 14, 11, 13),
    ];

    expect(computeTrueRangeSeries(klines)).toEqual([5, 3]);
  });

  it("computeDirectionalMovementSeries returns +DM and -DM arrays", () => {
    const klines = [
      makeKline(10, 12, 9, 10),
      makeKline(10, 14, 9, 13),
      makeKline(13, 13, 7, 8),
    ];

    expect(computeDirectionalMovementSeries(klines)).toEqual({
      plusDm: [2, 0],
      minusDm: [0, 2],
    });
  });

  it("computeAdxDmiTelemetry returns ADX, +DI, -DI, DI spread", () => {
    const result = computeAdxDmiTelemetry(makeTrendKlines(80, 200, -1));

    expect(result.adx14).toBeTypeOf("number");
    expect(result.plusDi14).toBeTypeOf("number");
    expect(result.minusDi14).toBeTypeOf("number");
    expect(result.diSpread).toBeTypeOf("number");
    expect(result.notEnoughCandles).toBe(false);
  });

  it("classifyAdxStrength returns WEAK / EMERGING / STRONG / VERY_STRONG", () => {
    expect(classifyAdxStrength(10)).toBe("WEAK");
    expect(classifyAdxStrength(20)).toBe("EMERGING");
    expect(classifyAdxStrength(30)).toBe("STRONG");
    expect(classifyAdxStrength(40)).toBe("VERY_STRONG");
    expect(classifyAdxStrength(null)).toBe("UNKNOWN");
  });

  it("classifyDmiBias returns BEARISH_DMI / BULLISH_DMI / NEUTRAL_DMI", () => {
    expect(classifyDmiBias({ plusDi: 10, minusDi: 14, minSpread: 3 })).toBe("BEARISH_DMI");
    expect(classifyDmiBias({ plusDi: 14, minusDi: 10, minSpread: 3 })).toBe("BULLISH_DMI");
    expect(classifyDmiBias({ plusDi: 12, minusDi: 10, minSpread: 3 })).toBe("NEUTRAL_DMI");
    expect(classifyDmiBias({ plusDi: null, minusDi: 10, minSpread: 3 })).toBe("UNKNOWN");
  });
});

describe("MACD helpers", () => {
  it("computeMacdSeries returns MACD line, signal line, histogram", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i);
    const series = computeMacdSeries(closes);

    expect(series.macdLine.length).toBeGreaterThan(0);
    expect(series.signalLine.length).toBeGreaterThan(0);
    expect(series.histogram.length).toBeGreaterThan(0);
    expect(series.macdLine).toHaveLength(series.signalLine.length);
    expect(series.histogram).toHaveLength(series.signalLine.length);
  });

  it("classifyMacdHistogramState returns positive/negative expanding/shrinking", () => {
    expect(classifyMacdHistogramState({ current: 0.2, previous: 0.1 })).toBe("POSITIVE_EXPANDING");
    expect(classifyMacdHistogramState({ current: 0.1, previous: 0.2 })).toBe("POSITIVE_SHRINKING");
    expect(classifyMacdHistogramState({ current: -0.2, previous: -0.1 })).toBe("NEGATIVE_EXPANDING");
    expect(classifyMacdHistogramState({ current: -0.1, previous: -0.2 })).toBe("NEGATIVE_SHRINKING");
    expect(classifyMacdHistogramState({ current: 0, previous: 0 })).toBe("FLAT");
    expect(classifyMacdHistogramState({ current: null, previous: 0 })).toBe("UNKNOWN");
  });
});

describe("computeTrendTelemetry", () => {
  it("returns full nested snapshot", () => {
    const snapshot = computeTrendTelemetry({
      symbol: "TESTUSDT",
      side: "SHORT",
      klinesByInterval: makeFullTrendKlines(-0.5),
      entryPrice: 100,
      computedAt: 123456,
    });

    expect(snapshot.version).toBe("trend-telemetry-v1");
    expect(snapshot.computedAt).toBe(123456);
    expect(snapshot.symbol).toBe("TESTUSDT");
    expect(snapshot.side).toBe("SHORT");
    expect(snapshot.timeframes).toEqual(["1m", "3m", "5m", "15m", "30m", "1h"]);
    expect(snapshot.useClosedCandlesOnly).toBe(true);
    expect(snapshot.ema["1m"].ema9).toBeTypeOf("number");
    expect(snapshot.adxDmi["3m"].adx14).toBeTypeOf("number");
    expect(snapshot.macd["5m"].macdHistogram).toBeTypeOf("number");
    expect(snapshot.labels).toHaveProperty("trendCompositeLabel");
    expect(snapshot.scores).toHaveProperty("trendShortScore");
    expect(snapshot.telemetryComplete).toBe(true);
  });

  it("sets telemetryComplete=false when required klines are missing", () => {
    const snapshot = computeTrendTelemetry({
      symbol: "TESTUSDT",
      klinesByInterval: {
        "1m": makeTrendKlines(161),
        "5m": makeTrendKlines(161),
        "15m": makeTrendKlines(161),
        "30m": makeTrendKlines(161),
        "1h": makeTrendKlines(161),
      },
      entryPrice: 100,
    });

    expect(snapshot.telemetryComplete).toBe(false);
    expect(snapshot.ema["3m"].ema50).toBeNull();
    expect(snapshot.adxDmi["3m"].adx14).toBeNull();
    expect(snapshot.macd["3m"].macdHistogram).toBeNull();
    expect(snapshot.missingFields).toContain("klines_3m");
    expect(snapshot.warnings).toContain("MISSING_KLINES_3m");
  });
});

describe("flattenTrendTelemetry", () => {
  it("returns root fields", () => {
    const snapshot = computeTrendTelemetry({
      symbol: "TESTUSDT",
      klinesByInterval: makeFullTrendKlines(-0.5),
      entryPrice: 100,
    });
    const flat = flattenTrendTelemetry(snapshot);

    expect(flat.trendTelemetry).toBe(snapshot);
    expect(flat.trendTelemetryComplete).toBe(true);
    expect(flat.ema9_1m).toBeTypeOf("number");
    expect(flat.emaPricePosition1m).not.toBe("UNKNOWN");
    expect(flat.adx14_5m).toBeTypeOf("number");
    expect(flat.macdHistogram3m).toBeTypeOf("number");
    expect(flat).toHaveProperty("trendShortSetupLabel");
    expect(flat).toHaveProperty("trendShortScore");
  });

  it("returns defaults when snapshot is missing", () => {
    expect(flattenTrendTelemetry(null)).toEqual(TREND_TELEMETRY_DEFAULTS);
  });
});

describe("TREND_TELEMETRY_DEFAULTS", () => {
  it("uses null/UNKNOWN, not fake zeroes", () => {
    expect(TREND_TELEMETRY_DEFAULTS.ema9_1m).toBeNull();
    expect(TREND_TELEMETRY_DEFAULTS.ema20_3m).toBeNull();
    expect(TREND_TELEMETRY_DEFAULTS.adx14_5m).toBeNull();
    expect(TREND_TELEMETRY_DEFAULTS.macdHistogram15m).toBeNull();
    expect(TREND_TELEMETRY_DEFAULTS.emaStack1m).toBe("UNKNOWN");
    expect(TREND_TELEMETRY_DEFAULTS.adxStrength3m).toBe("UNKNOWN");
    expect(TREND_TELEMETRY_DEFAULTS.macdHistogramState5m).toBe("UNKNOWN");
  });
});

describe("trendTelemetryCSVRow", () => {
  it("length matches TREND_TELEMETRY_CSV_HEADERS", () => {
    const row = trendTelemetryCSVRow(TREND_TELEMETRY_DEFAULTS);
    expect(row).toHaveLength(TREND_TELEMETRY_CSV_HEADERS.length);
  });

  it("pipe-serializes warnings/missingFields", () => {
    const row = trendTelemetryCSVRow({
      ...TREND_TELEMETRY_DEFAULTS,
      trendMissingFields: ["ema50_1m", "macd_3m"],
      trendWarnings: ["WARN|A", "WARN_B"],
    });
    const missingIdx = TREND_TELEMETRY_CSV_HEADERS.indexOf("trendMissingFields");
    const warningsIdx = TREND_TELEMETRY_CSV_HEADERS.indexOf("trendWarnings");

    expect(row[missingIdx]).toBe("ema50_1m|macd_3m");
    expect(row[warningsIdx]).toBe("WARN A|WARN_B");
    expect(pipeSeparated(["A|B", "C"])).toBe("A B|C");
  });
});

describe("TREND_TELEMETRY_CONFIG", () => {
  it("strictTrendTelemetry defaults to false", () => {
    expect(TREND_TELEMETRY_CONFIG.strictTrendTelemetry).toBe(false);
  });
});
