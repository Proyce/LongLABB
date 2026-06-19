import { describe, expect, it } from "vitest";
import {
  ADVANCED_MARKET_TELEMETRY_CONFIG,
  ADVANCED_MARKET_TELEMETRY_DEFAULTS,
  ADVANCED_MARKET_TELEMETRY_CSV_HEADERS,
  advancedMarketTelemetryCSVRow,
  classifyBandExtension,
  classifyLiquidationPressure,
  classifyMarketStructure,
  classifyOiPressure,
  classifySqueezeState,
  classifyVolumeFlowBias,
  computeAdvancedMarketTelemetry,
  computeBollingerBands,
  computeCmfSeries,
  computeKeltnerChannels,
  computeLiquidationPressureTelemetry,
  computeMarketStructureTelemetry,
  computeMfiSeries,
  computeObvSeries,
  computeOiDeltaTelemetry,
  computeSwingPoints,
  flattenAdvancedMarketTelemetry,
  pipeSeparated,
} from "./advancedMarketTelemetry.js";

function kline(ts, open, high, low, close, volume = 100) {
  return [ts, open, high, low, close, volume, ts + 59_999, close * volume, 10, volume / 2, close * volume / 2, 0];
}

function makeTrendKlines(count, start = 100, step = 0.5) {
  return Array.from({ length: count }, (_, i) => {
    const close = start + (i * step);
    return kline(i * 60_000, close - 0.2, close + 1, close - 1, close, 100 + i);
  });
}

function makeOscillatingKlines(count = 90) {
  return Array.from({ length: count }, (_, i) => {
    const base = 100 + Math.sin(i / 2) * 5 + (i * 0.02);
    const open = base - Math.cos(i) * 0.3;
    const high = base + 1 + (i % 7 === 0 ? 1.5 : 0);
    const low = base - 1 - (i % 5 === 0 ? 1.2 : 0);
    const close = base + Math.cos(i / 3) * 0.4;
    return kline(i * 60_000, open, high, low, close, 1000 + i * 5);
  });
}

const structureTestConfig = {
  ...ADVANCED_MARKET_TELEMETRY_CONFIG,
  useClosedCandlesOnly: false,
  marketStructure: {
    ...ADVANCED_MARKET_TELEMETRY_CONFIG.marketStructure,
    swingLookback: 1,
    breakoutLookback: 3,
  },
};

describe("advanced market telemetry indicators", () => {
  it("computeBollingerBands returns upper/middle/lower/width", () => {
    const bands = computeBollingerBands(Array.from({ length: 20 }, (_, i) => i + 1));

    expect(bands.middle).toBe(10.5);
    expect(bands.upper).toBeGreaterThan(bands.middle);
    expect(bands.lower).toBeLessThan(bands.middle);
    expect(bands.widthPct).toBeGreaterThan(0);
  });

  it("computeKeltnerChannels returns upper/middle/lower/width", () => {
    const channels = computeKeltnerChannels(makeTrendKlines(40));

    expect(channels.middle).toBeGreaterThan(0);
    expect(channels.upper).toBeGreaterThan(channels.middle);
    expect(channels.lower).toBeLessThan(channels.middle);
    expect(channels.widthPct).toBeGreaterThan(0);
  });

  it("classifyBandExtension detects above upper, inside, and below lower", () => {
    const bands = { upper: 100, middle: 95, lower: 90 };

    expect(classifyBandExtension(105, bands, "BB")).toBe("BB_ABOVE_UPPER");
    expect(classifyBandExtension(95, bands, "BB")).toBe("BB_INSIDE_BANDS");
    expect(classifyBandExtension(85, bands, "BB")).toBe("BB_BELOW_LOWER");
  });

  it("squeezeOn is true when BB is inside Keltner", () => {
    const state = classifySqueezeState({
      bb: { upper: 99, lower: 91, widthPct: 8 },
      kc: { upper: 100, lower: 90, widthPct: 10 },
    });

    expect(state.squeezeOn).toBe(true);
    expect(state.label).toBe("SQUEEZE_ON");
  });

  it("squeezeReleased detects previous squeeze and current non-squeeze", () => {
    const state = classifySqueezeState({
      bb: { upper: 102, lower: 88, widthPct: 14 },
      kc: { upper: 100, lower: 90, widthPct: 10 },
      previousBb: { upper: 99, lower: 91, widthPct: 8 },
      previousKc: { upper: 100, lower: 90, widthPct: 10 },
    });

    expect(state.squeezeReleased).toBe(true);
    expect(state.label).toBe("SQUEEZE_RELEASED");
  });
});

describe("advanced market telemetry structure", () => {
  it("computeSwingPoints finds swing highs/lows", () => {
    const rows = [
      kline(0, 1, 1, 0.8, 1),
      kline(1, 2, 3, 1.2, 2),
      kline(2, 1, 2, 0.5, 1),
      kline(3, 3, 4, 1.4, 3),
      kline(4, 1, 2, 0.2, 1),
      kline(5, 4, 5, 2.1, 4),
      kline(6, 1, 1, 0.1, 1),
    ];
    const swings = computeSwingPoints(rows, 1);

    expect(swings.swingHighs.map(s => s.price)).toEqual([3, 4, 5]);
    expect(swings.swingLows.map(s => s.price)).toContain(0.2);
  });

  it("classifyMarketStructure returns UPTREND/DOWNTREND/RANGE/CHOP", () => {
    expect(classifyMarketStructure({
      lastSwingHigh: 110,
      previousSwingHigh: 100,
      lastSwingLow: 95,
      previousSwingLow: 90,
    })).toBe("UPTREND");
    expect(classifyMarketStructure({
      lastSwingHigh: 95,
      previousSwingHigh: 100,
      lastSwingLow: 85,
      previousSwingLow: 90,
    })).toBe("DOWNTREND");
    expect(classifyMarketStructure({
      lastSwingHigh: 100.1,
      previousSwingHigh: 100,
      lastSwingLow: 89.9,
      previousSwingLow: 90,
    })).toBe("RANGE");
    expect(classifyMarketStructure({
      lastSwingHigh: 105,
      previousSwingHigh: 100,
      lastSwingLow: 85,
      previousSwingLow: 90,
    })).toBe("CHOP");
  });

  it("market structure detects brokeRecentLow", () => {
    const rows = [
      kline(0, 100, 103, 99, 101),
      kline(1, 101, 104, 100, 102),
      kline(2, 102, 105, 101, 103),
      kline(3, 103, 106, 102, 104),
      kline(4, 104, 107, 101, 105),
      kline(5, 105, 106, 100, 101),
      kline(6, 101, 102, 96, 97),
      kline(7, 97, 98, 90, 91),
    ];

    const structure = computeMarketStructureTelemetry(rows, 91, structureTestConfig);

    expect(structure.brokeRecentLow).toBe(true);
    expect(structure.structureBreakDirection).toBe("DOWN");
  });

  it("market structure detects lowerHighConfirmed", () => {
    const highs = [100, 110, 101, 108, 100, 106, 99, 104, 98];
    const lows = [95, 96, 94, 95, 93, 94, 92, 93, 91];
    const rows = highs.map((high, i) => kline(i, high - 2, high, lows[i], high - 1));

    const structure = computeMarketStructureTelemetry(rows, null, structureTestConfig);

    expect(structure.lowerHighConfirmed).toBe(true);
  });
});

describe("advanced market telemetry OI and liquidation", () => {
  it("OI delta computes 1m/5m/15m deltas from snapshots", () => {
    const computedAt = 1_000_000;
    const telemetry = computeOiDeltaTelemetry({
      symbol: "ABCUSDT",
      entryPrice: 101,
      oiCurrent: 115,
      computedAt,
      oiSnapshotsBySymbol: {
        ABCUSDT: [
          { ts: computedAt - 15 * 60_000, oi: 100, price: 90 },
          { ts: computedAt - 5 * 60_000, oi: 110, price: 95 },
          { ts: computedAt - 60_000, oi: 112, price: 100 },
          { ts: computedAt, oi: 115, price: 101 },
        ],
      },
    });

    expect(telemetry.oiPrevious1m).toBe(112);
    expect(telemetry.openInterestDelta1m).toBe(3);
    expect(telemetry.openInterestDelta5mPct).toBeCloseTo(4.5455, 4);
    expect(telemetry.openInterestDelta15mPct).toBe(15);
  });

  it("OI price divergence labels PRICE_UP_OI_UP etc.", () => {
    expect(classifyOiPressure({ priceDeltaPct: 1, oiDeltaPct: 1 })).toBe("PRICE_UP_OI_UP");
    expect(classifyOiPressure({ priceDeltaPct: 1, oiDeltaPct: -1 })).toBe("PRICE_UP_OI_DOWN");
    expect(classifyOiPressure({ priceDeltaPct: -1, oiDeltaPct: 1 })).toBe("PRICE_DOWN_OI_UP");
    expect(classifyOiPressure({ priceDeltaPct: -1, oiDeltaPct: -1 })).toBe("PRICE_DOWN_OI_DOWN");
    expect(classifyOiPressure({ priceDeltaPct: 0, oiDeltaPct: 1 })).toBe("PRICE_FLAT_OI_UP");
  });

  it("liquidation telemetry returns UNKNOWN when no source is available", () => {
    const telemetry = computeLiquidationPressureTelemetry({ symbol: "ABCUSDT" });

    expect(telemetry.sourceAvailable).toBe(false);
    expect(telemetry.liquidationPressure1m).toBe("UNKNOWN");
    expect(telemetry.longLiquidationUsd1m).toBeNull();
    expect(telemetry.warnings).toContain("LIQUIDATION_SOURCE_UNAVAILABLE");
    expect(classifyLiquidationPressure({ longLiquidationUsd: null, shortLiquidationUsd: null })).toBe("UNKNOWN");
  });
});

describe("advanced market telemetry volume flow", () => {
  it("MFI computes expected value from sample klines", () => {
    const rows = [
      kline(0, 10, 10, 10, 10, 100),
      kline(1, 12, 12, 12, 12, 100),
      kline(2, 11, 11, 11, 11, 100),
    ];

    const series = computeMfiSeries(rows, 2);

    expect(series).toHaveLength(1);
    expect(series[0]).toBeCloseTo(52.1739, 4);
  });

  it("OBV computes expected series", () => {
    const rows = [
      kline(0, 10, 10, 9, 10, 100),
      kline(1, 12, 12, 11, 12, 50),
      kline(2, 11, 11, 10, 11, 20),
      kline(3, 11, 11, 10, 11, 10),
      kline(4, 13, 13, 12, 13, 5),
    ];

    expect(computeObvSeries(rows)).toEqual([0, 50, 30, 30, 35]);
  });

  it("CMF computes expected value", () => {
    const rows = [
      kline(0, 10, 10, 0, 10, 100),
      kline(1, 0, 10, 0, 0, 100),
      kline(2, 10, 10, 0, 10, 100),
    ];

    const series = computeCmfSeries(rows, 2);

    expect(series[0]).toBe(0);
    expect(series[1]).toBe(0);
  });

  it("classifyVolumeFlowBias returns BUY_PRESSURE / SELL_PRESSURE / NEUTRAL", () => {
    expect(classifyVolumeFlowBias({ cmfBias: "BUY_PRESSURE" })).toBe("BUY_PRESSURE");
    expect(classifyVolumeFlowBias({ cmfBias: "SELL_PRESSURE" })).toBe("SELL_PRESSURE");
    expect(classifyVolumeFlowBias({
      mfiSlope: "FLAT",
      obvSlope: "FLAT",
      cmfBias: "NEUTRAL",
    })).toBe("NEUTRAL");
  });
});

describe("advanced market telemetry snapshot, defaults, and CSV", () => {
  function fullSnapshot() {
    const klines = makeOscillatingKlines(90);
    const klinesByInterval = Object.fromEntries(
      ADVANCED_MARKET_TELEMETRY_CONFIG.timeframes.map(tf => [tf, klines]),
    );
    const computedAt = 2_000_000;

    return computeAdvancedMarketTelemetry({
      symbol: "ABCUSDT",
      side: "SHORT",
      entryPrice: 102,
      klinesByInterval,
      computedAt,
      oiCurrent: 110,
      oiSnapshotsBySymbol: {
        ABCUSDT: [
          { ts: computedAt - 15 * 60_000, oi: 100, price: 95 },
          { ts: computedAt - 5 * 60_000, oi: 104, price: 98 },
          { ts: computedAt - 60_000, oi: 108, price: 101 },
          { ts: computedAt, oi: 110, price: 102 },
        ],
      },
      liquidationSnapshotsBySymbol: null,
    });
  }

  it("computeAdvancedMarketTelemetry returns full nested snapshot", () => {
    const snapshot = fullSnapshot();

    expect(snapshot.version).toBe("advanced-market-telemetry-v1");
    expect(snapshot.extension["1m"]).toBeTruthy();
    expect(snapshot.structure["3m"]).toBeTruthy();
    expect(snapshot.oiPressure.oiCurrent).toBe(110);
    expect(snapshot.liquidationPressure.liquidationPressure1m).toBe("UNKNOWN");
    expect(snapshot.volumeFlow["5m"]).toBeTruthy();
    expect(snapshot.labels.advancedCompositeLabel).toMatch(/^ADVANCED_/);
  });

  it("flattenAdvancedMarketTelemetry returns root fields", () => {
    const snapshot = fullSnapshot();
    const flat = flattenAdvancedMarketTelemetry(snapshot);

    expect(flat.advancedMarketTelemetry).toBe(snapshot);
    expect(flat.bbExtension1m).toMatch(/^BB_/);
    expect(flat.kcExtension3m).toMatch(/^KC_/);
    expect(flat.structure1m).toBeTruthy();
    expect(flat.oiCurrent).toBe(110);
    expect(flat.mfi14_3m).not.toBeNull();
  });

  it("defaults use null/UNKNOWN, not fake values", () => {
    expect(ADVANCED_MARKET_TELEMETRY_DEFAULTS.advancedMarketTelemetry).toBeNull();
    expect(ADVANCED_MARKET_TELEMETRY_DEFAULTS.bbUpper1m).toBeNull();
    expect(ADVANCED_MARKET_TELEMETRY_DEFAULTS.bbExtension1m).toBe("UNKNOWN");
    expect(ADVANCED_MARKET_TELEMETRY_DEFAULTS.squeezeOn1m).toBe(false);
    expect(ADVANCED_MARKET_TELEMETRY_DEFAULTS.mfi14_1m).toBeNull();
    expect(flattenAdvancedMarketTelemetry(null)).toBe(ADVANCED_MARKET_TELEMETRY_DEFAULTS);
  });

  it("CSV row length matches headers", () => {
    const flat = flattenAdvancedMarketTelemetry(fullSnapshot());
    const row = advancedMarketTelemetryCSVRow(flat);

    expect(row).toHaveLength(ADVANCED_MARKET_TELEMETRY_CSV_HEADERS.length);
  });

  it("warnings/missingFields serialize as pipe-separated strings", () => {
    const row = advancedMarketTelemetryCSVRow({
      ...ADVANCED_MARKET_TELEMETRY_DEFAULTS,
      advancedMarketMissingFields: ["bb_1m", "kc|3m"],
      advancedMarketWarnings: ["ONE", "TWO"],
    });
    const missingIdx = ADVANCED_MARKET_TELEMETRY_CSV_HEADERS.indexOf("advancedMarketMissingFields");
    const warningsIdx = ADVANCED_MARKET_TELEMETRY_CSV_HEADERS.indexOf("advancedMarketWarnings");

    expect(row[missingIdx]).toBe("bb_1m|kc 3m");
    expect(row[warningsIdx]).toBe("ONE|TWO");
    expect(pipeSeparated(["A|B"])).toBe("A B");
  });

  it("strictAdvancedMarketTelemetry defaults to false", () => {
    expect(ADVANCED_MARKET_TELEMETRY_CONFIG.strictAdvancedMarketTelemetry).toBe(false);
  });
});
