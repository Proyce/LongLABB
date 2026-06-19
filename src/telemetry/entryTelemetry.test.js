import { describe, it, expect } from "vitest";
import {
  ENTRY_TELEMETRY_CONFIG,
  computeVwapTelemetry,
  computeCandleTelemetry,
  computeImpulseTelemetry,
  computeBounceContextTelemetry,
  computeEntryTimingReason,
  computeEntryTelemetry,
  pipeSeparated,
  entryTelemetryCSVRow,
  ENTRY_TELEMETRY_CSV_HEADERS,
  flattenEntryTelemetry,
} from "./entryTelemetry.js";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Build a minimal Binance kline array. Index: [openTime,open,high,low,close,baseVol,...,quoteVol,...] */
function makeKline(open, high, low, close, volume = 1000) {
  return [0, String(open), String(high), String(low), String(close), String(volume), 0, "0", 0, "0", "0", "0"];
}

/** Build N identical klines. */
function makeKlines(n, open, high, low, close, volume = 1000) {
  return Array.from({ length: n }, () => makeKline(open, high, low, close, volume));
}

// ─── VWAP CALCULATION ────────────────────────────────────────────────────────

describe("computeVwapTelemetry", () => {
  it("computes correct VWAP from uniform klines", () => {
    // All candles: O=100 H=110 L=90 C=100, volume=1000
    // TP = (110+90+100)/3 = 100, VWAP = 100
    const klines = makeKlines(20, 100, 110, 90, 100);
    const result = computeVwapTelemetry(klines, 100, ENTRY_TELEMETRY_CONFIG);
    expect(result.vwap).toBeCloseTo(100, 4);
    expect(result.missingFields).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("computes priceVsVwapPct correctly", () => {
    const klines = makeKlines(20, 100, 110, 90, 100); // VWAP = 100
    const result = computeVwapTelemetry(klines, 102, ENTRY_TELEMETRY_CONFIG);
    expect(result.priceVsVwapPct).toBeCloseTo(2.0, 2);
  });

  it("returns UNKNOWN when fewer than 2 klines", () => {
    const result = computeVwapTelemetry([makeKline(100, 110, 90, 100)], 100, ENTRY_TELEMETRY_CONFIG);
    expect(result.priceVsVwapLabel).toBe("UNKNOWN");
    expect(result.vwap).toBeNull();
    expect(result.missingFields).toContain("vwap");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns UNKNOWN when klines is null", () => {
    const result = computeVwapTelemetry(null, 100, ENTRY_TELEMETRY_CONFIG);
    expect(result.priceVsVwapLabel).toBe("UNKNOWN");
    expect(result.vwap).toBeNull();
  });

  it("returns UNKNOWN when zero volume", () => {
    const klines = makeKlines(20, 100, 110, 90, 100, 0);
    const result = computeVwapTelemetry(klines, 100, ENTRY_TELEMETRY_CONFIG);
    expect(result.priceVsVwapLabel).toBe("UNKNOWN");
    expect(result.missingFields).toContain("vwap");
  });

  it("sets vwapWindow from config", () => {
    const klines = makeKlines(20, 100, 110, 90, 100);
    const result = computeVwapTelemetry(klines, 100, ENTRY_TELEMETRY_CONFIG);
    expect(result.vwapWindow).toBe("5m:20");
  });
});

// ─── ABOVE / BELOW / AT VWAP ─────────────────────────────────────────────────

describe("priceVsVwapLabel", () => {
  it("labels ABOVE_VWAP when price is clearly above VWAP", () => {
    const klines = makeKlines(20, 100, 110, 90, 100); // VWAP ~ 100
    const result = computeVwapTelemetry(klines, 101, ENTRY_TELEMETRY_CONFIG);
    expect(result.priceVsVwapLabel).toBe("ABOVE_VWAP");
  });

  it("labels BELOW_VWAP when price is clearly below VWAP", () => {
    const klines = makeKlines(20, 100, 110, 90, 100); // VWAP ~ 100
    const result = computeVwapTelemetry(klines, 99, ENTRY_TELEMETRY_CONFIG);
    expect(result.priceVsVwapLabel).toBe("BELOW_VWAP");
  });

  it("labels AT_VWAP when price is within flat threshold", () => {
    // threshold = 0.05%, so 100.03 is within ±0.05 of VWAP=100
    const klines = makeKlines(20, 100, 110, 90, 100);
    const result = computeVwapTelemetry(klines, 100.03, ENTRY_TELEMETRY_CONFIG);
    expect(result.priceVsVwapLabel).toBe("AT_VWAP");
  });

  it("respects custom flat threshold", () => {
    const cfg = { ...ENTRY_TELEMETRY_CONFIG, priceVsVwapFlatThresholdPct: 2.0 };
    const klines = makeKlines(20, 100, 110, 90, 100); // VWAP ~ 100
    const result = computeVwapTelemetry(klines, 101, cfg); // +1% < 2% threshold
    expect(result.priceVsVwapLabel).toBe("AT_VWAP");
  });
});

// ─── CANDLE BODY PERCENTAGE ───────────────────────────────────────────────────

describe("computeCandleTelemetry – body pct", () => {
  it("calculates body pct for a green candle", () => {
    // klines[-2]: O=100 H=110 L=95 C=108 → range=15, body=8 → 53.33%
    const klines = [makeKline(100, 110, 95, 108), makeKline(100, 110, 95, 108)];
    const result = computeCandleTelemetry(klines, ENTRY_TELEMETRY_CONFIG);
    expect(result.candleBodyPct).toBeCloseTo(53.33, 1);
  });

  it("calculates body pct for a red candle", () => {
    // klines[-2]: O=110 H=115 L=100 C=103 → range=15, body=7 → 46.67%
    const klines = [makeKline(110, 115, 100, 103), makeKline(110, 115, 100, 103)];
    const result = computeCandleTelemetry(klines, ENTRY_TELEMETRY_CONFIG);
    expect(result.candleBodyPct).toBeCloseTo(46.67, 1);
  });

  it("returns null body pct when range is zero", () => {
    const klines = [makeKline(100, 100, 100, 100), makeKline(100, 100, 100, 100)];
    const result = computeCandleTelemetry(klines, ENTRY_TELEMETRY_CONFIG);
    expect(result.candleBodyPct).toBeNull();
    expect(result.missingFields).toContain("candleBodyPct");
  });
});

// ─── UPPER WICK PERCENTAGE ────────────────────────────────────────────────────

describe("computeCandleTelemetry – upper wick pct", () => {
  it("calculates upper wick pct correctly for green candle", () => {
    // klines[-2]: O=100 H=110 L=95 C=108 → range=15, upper=110-max(100,108)=2 → 13.33%
    const klines = [makeKline(100, 110, 95, 108), makeKline(100, 110, 95, 108)];
    const result = computeCandleTelemetry(klines, ENTRY_TELEMETRY_CONFIG);
    expect(result.upperWickPct).toBeCloseTo(13.33, 1);
  });

  it("calculates upper wick pct correctly for red candle", () => {
    // klines[-2]: O=108 H=110 L=95 C=100 → range=15, upper=110-max(108,100)=2 → 13.33%
    const klines = [makeKline(108, 110, 95, 100), makeKline(108, 110, 95, 100)];
    const result = computeCandleTelemetry(klines, ENTRY_TELEMETRY_CONFIG);
    expect(result.upperWickPct).toBeCloseTo(13.33, 1);
  });
});

// ─── LOWER WICK PERCENTAGE ────────────────────────────────────────────────────

describe("computeCandleTelemetry – lower wick pct", () => {
  it("calculates lower wick pct correctly for green candle", () => {
    // klines[-2]: O=100 H=110 L=95 C=108 → range=15, lower=min(100,108)-95=5 → 33.33%
    const klines = [makeKline(100, 110, 95, 108), makeKline(100, 110, 95, 108)];
    const result = computeCandleTelemetry(klines, ENTRY_TELEMETRY_CONFIG);
    expect(result.lowerWickPct).toBeCloseTo(33.33, 1);
  });
});

// ─── CANDLE COLOR ─────────────────────────────────────────────────────────────

describe("computeCandleTelemetry – candle color", () => {
  // klines[-2] is the last closed candle; klines[-1] is the live open candle
  it("classifies GREEN candle", () => {
    // klines[-2] = GREEN (open=100, close=108); klines[-1] = live placeholder
    const klines = [makeKline(100, 110, 95, 108), makeKline(100, 110, 95, 108)];
    expect(computeCandleTelemetry(klines).candleColorAtEntry).toBe("GREEN");
  });

  it("classifies RED candle", () => {
    // klines[-2] = RED (open=110, close=103); klines[-1] = live placeholder
    const klines = [makeKline(110, 115, 100, 103), makeKline(110, 115, 100, 103)];
    expect(computeCandleTelemetry(klines).candleColorAtEntry).toBe("RED");
  });

  it("classifies DOJI when close equals open", () => {
    // klines[-2] = DOJI (open=close=100)
    const klines = [makeKline(100, 110, 90, 100), makeKline(100, 110, 90, 100)];
    expect(computeCandleTelemetry(klines).candleColorAtEntry).toBe("DOJI");
  });

  it("returns UNKNOWN when fewer than 2 klines", () => {
    const result = computeCandleTelemetry([makeKline(100, 110, 90, 105)]);
    expect(result.candleColorAtEntry).toBe("UNKNOWN");
    expect(result.missingFields).toContain("candleColorAtEntry");
  });
});

// ─── RED IMPULSE DETECTION ────────────────────────────────────────────────────

describe("computeImpulseTelemetry – red impulse", () => {
  it("detects red impulse when RED candle body >= 55%", () => {
    // range=10, body=6 → 60% RED
    const candle = { candleColorAtEntry: "RED", candleBodyPct: 60, candleRangePct: 1.0 };
    const result = computeImpulseTelemetry(candle, 0.5, ENTRY_TELEMETRY_CONFIG);
    expect(result.redImpulseDetected).toBe(true);
    expect(result.greenImpulseDetected).toBe(false);
  });

  it("does not detect red impulse when body < 55%", () => {
    const candle = { candleColorAtEntry: "RED", candleBodyPct: 45, candleRangePct: 1.0 };
    const result = computeImpulseTelemetry(candle, 0.5, ENTRY_TELEMETRY_CONFIG);
    expect(result.redImpulseDetected).toBe(false);
  });

  it("does not detect red impulse for GREEN candle", () => {
    const candle = { candleColorAtEntry: "GREEN", candleBodyPct: 70, candleRangePct: 1.0 };
    const result = computeImpulseTelemetry(candle, 0.5, ENTRY_TELEMETRY_CONFIG);
    expect(result.redImpulseDetected).toBe(false);
  });
});

// ─── GREEN IMPULSE DETECTION ──────────────────────────────────────────────────

describe("computeImpulseTelemetry – green impulse", () => {
  it("detects green impulse when GREEN candle body >= 55%", () => {
    const candle = { candleColorAtEntry: "GREEN", candleBodyPct: 65, candleRangePct: 1.0 };
    const result = computeImpulseTelemetry(candle, 0.5, ENTRY_TELEMETRY_CONFIG);
    expect(result.greenImpulseDetected).toBe(true);
    expect(result.redImpulseDetected).toBe(false);
  });

  it("does not detect green impulse for DOJI", () => {
    const candle = { candleColorAtEntry: "DOJI", candleBodyPct: 0, candleRangePct: 1.0 };
    const result = computeImpulseTelemetry(candle, 0.5, ENTRY_TELEMETRY_CONFIG);
    expect(result.greenImpulseDetected).toBe(false);
  });
});

// ─── IMPULSE STRENGTH ─────────────────────────────────────────────────────────

describe("computeImpulseTelemetry – impulse strength", () => {
  it("classifies STRONG when body >= 70%", () => {
    const candle = { candleColorAtEntry: "RED", candleBodyPct: 75, candleRangePct: 1.0 };
    expect(computeImpulseTelemetry(candle, 0.5).impulseStrength).toBe("STRONG");
  });

  it("classifies MEDIUM when body is 55–69%", () => {
    const candle = { candleColorAtEntry: "RED", candleBodyPct: 60, candleRangePct: 1.0 };
    expect(computeImpulseTelemetry(candle, 0.5).impulseStrength).toBe("MEDIUM");
  });

  it("classifies WEAK when body is 45–54%", () => {
    const candle = { candleColorAtEntry: "RED", candleBodyPct: 50, candleRangePct: 1.0 };
    expect(computeImpulseTelemetry(candle, 0.5).impulseStrength).toBe("WEAK");
  });

  it("classifies NONE when body < 45%", () => {
    const candle = { candleColorAtEntry: "GREEN", candleBodyPct: 30, candleRangePct: 1.0 };
    expect(computeImpulseTelemetry(candle, 0.5).impulseStrength).toBe("NONE");
  });

  it("returns UNKNOWN direction when candle color is UNKNOWN", () => {
    const candle = { candleColorAtEntry: "UNKNOWN", candleBodyPct: null, candleRangePct: null };
    const result = computeImpulseTelemetry(candle, 0.5);
    expect(result.impulseDirection).toBe("UNKNOWN");
    expect(result.impulseStrength).toBe("UNKNOWN");
  });
});

// ─── ENTRY TIMING REASON ──────────────────────────────────────────────────────

describe("computeEntryTimingReason", () => {
  it("returns ABOVE_VWAP_NO_RED_IMPULSE", () => {
    expect(computeEntryTimingReason("ABOVE_VWAP", false, false, true)).toBe("ABOVE_VWAP_NO_RED_IMPULSE");
  });

  it("returns ABOVE_VWAP_GREEN_IMPULSE", () => {
    expect(computeEntryTimingReason("ABOVE_VWAP", false, true, true)).toBe("ABOVE_VWAP_GREEN_IMPULSE");
  });

  it("returns BELOW_VWAP_RED_IMPULSE", () => {
    expect(computeEntryTimingReason("BELOW_VWAP", true, false, true)).toBe("BELOW_VWAP_RED_IMPULSE");
  });

  it("returns BELOW_VWAP_NO_IMPULSE", () => {
    expect(computeEntryTimingReason("BELOW_VWAP", false, false, true)).toBe("BELOW_VWAP_NO_IMPULSE");
  });

  it("returns VWAP_UNKNOWN when VWAP label is UNKNOWN", () => {
    expect(computeEntryTimingReason("UNKNOWN", false, false, true)).toBe("VWAP_UNKNOWN");
  });

  it("returns CANDLE_UNKNOWN when hasCandleData is false", () => {
    expect(computeEntryTimingReason("ABOVE_VWAP", false, false, false)).toBe("CANDLE_UNKNOWN");
  });

  it("CANDLE_UNKNOWN takes priority over VWAP_UNKNOWN", () => {
    expect(computeEntryTimingReason("UNKNOWN", false, false, false)).toBe("CANDLE_UNKNOWN");
  });
});

// ─── BOUNCE CONTEXT ───────────────────────────────────────────────────────────

describe("computeBounceContextTelemetry", () => {
  it("classifies NEAR_LOW_POSSIBLE_BOUNCE below 15%", () => {
    expect(computeBounceContextTelemetry(5).bounceContext).toBe("NEAR_LOW_POSSIBLE_BOUNCE");
    expect(computeBounceContextTelemetry(0).bounceContext).toBe("NEAR_LOW_POSSIBLE_BOUNCE");
    expect(computeBounceContextTelemetry(14.9).bounceContext).toBe("NEAR_LOW_POSSIBLE_BOUNCE");
  });

  it("classifies MID_BOUNCE between 15% and 40%", () => {
    expect(computeBounceContextTelemetry(15).bounceContext).toBe("MID_BOUNCE");
    expect(computeBounceContextTelemetry(30).bounceContext).toBe("MID_BOUNCE");
    expect(computeBounceContextTelemetry(39.9).bounceContext).toBe("MID_BOUNCE");
  });

  it("classifies EXTENDED_BOUNCE between 40% and 80%", () => {
    expect(computeBounceContextTelemetry(40).bounceContext).toBe("EXTENDED_BOUNCE");
    expect(computeBounceContextTelemetry(60).bounceContext).toBe("EXTENDED_BOUNCE");
    expect(computeBounceContextTelemetry(79.9).bounceContext).toBe("EXTENDED_BOUNCE");
  });

  it("classifies DEEP_FROM_LOW at 80% and above", () => {
    expect(computeBounceContextTelemetry(80).bounceContext).toBe("DEEP_FROM_LOW");
    expect(computeBounceContextTelemetry(100).bounceContext).toBe("DEEP_FROM_LOW");
  });

  it("returns UNKNOWN when bounceFromLow is null", () => {
    expect(computeBounceContextTelemetry(null).bounceContext).toBe("UNKNOWN");
  });

  it("sets bounceContextSource to threshold classifier", () => {
    expect(computeBounceContextTelemetry(10).bounceContextSource).toBe("bounceFromLow-threshold-v1");
  });
});

// ─── FULL SNAPSHOT – JSON EXPORT ─────────────────────────────────────────────

describe("computeEntryTelemetry – JSON export structure", () => {
  function makeFullParams(overrides = {}) {
    const klines5m = makeKlines(20, 100, 110, 90, 100);
    // 1m klines: first one is "prev closed", last is "live"
    const klines1m = [
      ...makeKlines(19, 100, 110, 90, 100),
      makeKline(100, 110, 95, 108), // live/open candle (not used)
    ];
    return {
      klines1m,
      klines5m,
      entryPrice: 100.61,
      side: "SHORT",
      symbol: "BILLUSDT",
      entryRank: 2,
      bounceFromLow: 3.2,
      cvdRatio: 0.518,
      cvdLabel: "NEUT",
      atrPct: 0.5883,
      volAccel: -47.56,
      spreadPct: 0.01141,
      oiVal: 105752446,
      distFromHigh: -26.2,
      change24h: -15.66,
      quoteVol: 165654198.48555,
      ...overrides,
    };
  }

  it("includes nested entryTelemetry object", () => {
    const snapshot = computeEntryTelemetry(makeFullParams());
    expect(snapshot).toHaveProperty("version", "entry-telemetry-v1");
    expect(snapshot).toHaveProperty("computedAt");
    expect(snapshot).toHaveProperty("symbol", "BILLUSDT");
    expect(snapshot).toHaveProperty("side", "SHORT");
  });

  it("includes flattened root telemetry fields via flattenEntryTelemetry", () => {
    const snapshot = computeEntryTelemetry(makeFullParams());
    const flat = flattenEntryTelemetry(snapshot);
    expect(flat).toHaveProperty("entryTelemetry");
    expect(flat).toHaveProperty("priceVsVwapPct");
    expect(flat).toHaveProperty("priceVsVwapLabel");
    expect(flat).toHaveProperty("redImpulseDetected");
    expect(flat).toHaveProperty("greenImpulseDetected");
    expect(flat).toHaveProperty("entryTimingReason");
    expect(flat).toHaveProperty("entryBounceContext");
    expect(flat).toHaveProperty("candleBodyPct");
    expect(flat).toHaveProperty("upperWickPct");
    expect(flat).toHaveProperty("lowerWickPct");
  });
});

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

describe("entryTelemetryCSVRow – CSV export", () => {
  it("includes all new entry telemetry columns", () => {
    const klines5m = makeKlines(20, 100, 110, 90, 100);
    const klines1m = [
      ...makeKlines(19, 100, 110, 90, 100),
      makeKline(100, 110, 95, 108),
    ];
    const snapshot = computeEntryTelemetry({
      klines1m, klines5m, entryPrice: 101, side: "SHORT",
      symbol: "TESTUSDT", entryRank: 3, bounceFromLow: 5,
      cvdRatio: 0.5, cvdLabel: "NEUT", atrPct: 0.4, volAccel: 10,
      spreadPct: 0.02, oiVal: 1000000, distFromHigh: -10, change24h: -5, quoteVol: 5000000,
    });
    const trade = { entryTelemetry: snapshot };
    const row = entryTelemetryCSVRow(trade);
    expect(row).toHaveLength(ENTRY_TELEMETRY_CSV_HEADERS.length);
    // First cell = version
    expect(row[0]).toBe("entry-telemetry-v1");
  });

  it("returns all-empty cells when entryTelemetry is null", () => {
    const row = entryTelemetryCSVRow({ entryTelemetry: null });
    expect(row).toHaveLength(ENTRY_TELEMETRY_CSV_HEADERS.length);
    expect(row.every(v => v === "")).toBe(true);
  });

  it("serializes missingTelemetryFields as pipe-delimited", () => {
    const snapshot = computeEntryTelemetry({
      klines1m: null, klines5m: null,
      entryPrice: 100, side: "SHORT", symbol: "X",
    });
    const row = entryTelemetryCSVRow({ entryTelemetry: snapshot });
    // missingTelemetryFields is column index 2
    const missingCell = row[2];
    // Should contain pipe-delimited fields (no commas in cell)
    expect(missingCell).not.toContain(",");
    if (snapshot.missingTelemetryFields.length > 1) {
      expect(missingCell).toContain("|");
    }
  });
});

// ─── TELEMETRY COMPLETE = FALSE WHEN VWAP MISSING ────────────────────────────

describe("telemetryComplete", () => {
  it("is false when VWAP data is missing", () => {
    const snapshot = computeEntryTelemetry({
      klines1m: makeKlines(20, 100, 110, 90, 100),
      klines5m: null, // no 5m klines
      entryPrice: 100, side: "SHORT", symbol: "X",
    });
    expect(snapshot.telemetryComplete).toBe(false);
    expect(snapshot.missingTelemetryFields).toContain("vwap");
  });

  it("is false when entry candle data is missing", () => {
    const snapshot = computeEntryTelemetry({
      klines1m: null, // no 1m klines
      klines5m: makeKlines(20, 100, 110, 90, 100),
      entryPrice: 100, side: "SHORT", symbol: "X",
    });
    expect(snapshot.telemetryComplete).toBe(false);
    expect(snapshot.missingTelemetryFields).toContain("entryCandleClose");
  });

  it("is true when both VWAP and candle data are available", () => {
    const klines5m = makeKlines(20, 100, 110, 90, 100);
    const klines1m = [
      ...makeKlines(19, 100, 110, 90, 100),
      makeKline(100, 110, 95, 108),
    ];
    const snapshot = computeEntryTelemetry({
      klines1m, klines5m, entryPrice: 101, side: "SHORT", symbol: "X",
      entryRank: 1, bounceFromLow: 5, cvdRatio: 0.5, cvdLabel: "NEUT",
      atrPct: 0.4, volAccel: 0, spreadPct: 0.01, oiVal: 0,
    });
    expect(snapshot.telemetryComplete).toBe(true);
    expect(snapshot.missingTelemetryFields).toHaveLength(0);
  });
});

// ─── STRICT ENTRY TELEMETRY (CONFIG CHECK) ────────────────────────────────────

describe("ENTRY_TELEMETRY_CONFIG – strictEntryTelemetry", () => {
  it("defaults to false (no hard gate)", () => {
    expect(ENTRY_TELEMETRY_CONFIG.strictEntryTelemetry).toBe(false);
  });

  it("has all expected config keys", () => {
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("enabled");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("vwapTimeframe");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("vwapLookback");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("entryCandleTimeframe");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("priceVsVwapFlatThresholdPct");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("impulseBodyWeakPct");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("impulseBodyMediumPct");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("impulseBodyStrongPct");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("bounceNearLowMaxPct");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("bounceMidMaxPct");
    expect(ENTRY_TELEMETRY_CONFIG).toHaveProperty("bounceExtendedMaxPct");
  });
});

// ─── PIPE SERIALIZATION ───────────────────────────────────────────────────────

describe("pipeSeparated", () => {
  it("joins array with pipes", () => {
    expect(pipeSeparated(["a", "b", "c"])).toBe("a|b|c");
  });

  it("returns empty string for empty array", () => {
    expect(pipeSeparated([])).toBe("");
  });

  it("returns empty string for null", () => {
    expect(pipeSeparated(null)).toBe("");
  });

  it("replaces pipes inside values to avoid ambiguity", () => {
    const result = pipeSeparated(["a|b", "c"]);
    expect(result).toBe("a b|c");
  });
});
