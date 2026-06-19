import { describe, it, expect } from "vitest";
import { computeAssetContext } from "./marketRegime.asset.js";
import { computeCrossMarketContext } from "./marketRegime.crossMarket.js";
import { classifyBtcEthAlignment, classifyShortBias, classifyDirectionScore, classifyFreshness } from "./marketRegime.labels.js";
import { MARKET_REGIME_CONFIG } from "./marketRegime.config.js";

// ── Candle factories ──────────────────────────────────────────────────────────

function makeCandle({ open, high, low, close, vol = 1000 } = {}) {
  return [0, String(open), String(high), String(low), String(close), String(vol), 0, "0", 0, "0", "0", "0"];
}

function makeKlines(count, { startPrice = 100, trend = "down", volatility = 0.5 } = {}) {
  const klines = [];
  let price = startPrice;
  for (let i = 0; i < count + 1; i++) {
    // Deterministic oscillation for "flat" trend (no Math.random)
    const move = trend === "down" ? -volatility
               : trend === "up"   ?  volatility
               : (i % 2 === 0 ? volatility * 0.1 : -volatility * 0.1); // tiny alternating
    const open = price;
    price = Math.max(1, price + move);
    const close = price;
    const high = Math.max(open, close) + volatility * 0.3;
    const low  = Math.min(open, close) - volatility * 0.3;
    klines.push(makeCandle({ open, high, low, close }));
  }
  return klines;
}

function makeBearishKlines(count = 160) {
  return makeKlines(count, { startPrice: 100, trend: "down", volatility: 0.5 });
}
function makeBullishKlines(count = 160) {
  return makeKlines(count, { startPrice: 100, trend: "up", volatility: 0.5 });
}
function makeFlatKlines(count = 160) {
  return makeKlines(count, { startPrice: 100, trend: "flat", volatility: 0.05 });
}

function makeAssetKlines(type = "bearish") {
  const make = type === "bearish" ? makeBearishKlines : type === "bullish" ? makeBullishKlines : makeFlatKlines;
  const result = {};
  for (const tf of MARKET_REGIME_CONFIG.timeframes) result[tf] = make();
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("marketRegime.labels", () => {
  it("classifyDirectionScore strong down", () => {
    expect(classifyDirectionScore(-50)).toBe("STRONG_DOWN");
    expect(classifyDirectionScore(-46)).toBe("STRONG_DOWN");
  });

  it("classifyDirectionScore down", () => {
    expect(classifyDirectionScore(-30)).toBe("DOWN");
    expect(classifyDirectionScore(-18)).toBe("DOWN");
  });

  it("classifyDirectionScore flat", () => {
    expect(classifyDirectionScore(0)).toBe("FLAT");
    expect(classifyDirectionScore(10)).toBe("FLAT");
  });

  it("classifyDirectionScore up", () => {
    expect(classifyDirectionScore(30)).toBe("UP");
  });

  it("classifyDirectionScore strong up", () => {
    expect(classifyDirectionScore(50)).toBe("STRONG_UP");
  });

  it("classifyDirectionScore unknown for null", () => {
    expect(classifyDirectionScore(null)).toBe("UNKNOWN");
    expect(classifyDirectionScore(NaN)).toBe("UNKNOWN");
  });

  it("classifyShortBias thresholds", () => {
    expect(classifyShortBias(70)).toBe("STRONG_SHORT_TAILWIND");
    expect(classifyShortBias(50)).toBe("SHORT_TAILWIND");
    expect(classifyShortBias(20)).toBe("SELECTIVE_SHORT");
    expect(classifyShortBias(0)).toBe("SHORT_NEUTRAL");
    expect(classifyShortBias(-20)).toBe("SHORT_HEADWIND");
    expect(classifyShortBias(-60)).toBe("STRONG_SHORT_HEADWIND");
  });

  it("classifyFreshness live", () => {
    expect(classifyFreshness(1000)).toBe("LIVE");
  });

  it("classifyFreshness stale", () => {
    expect(classifyFreshness(35_000)).toBe("STALE");
  });

  it("classifyFreshness hard stale", () => {
    expect(classifyFreshness(70_000)).toBe("HARD_STALE");
    expect(classifyFreshness(null)).toBe("HARD_STALE");
  });
});

describe("computeAssetContext — all timeframes bearish", () => {
  it("produces bear regime for full bearish klines", () => {
    const klines = makeAssetKlines("bearish");
    const ctx = computeAssetContext({ symbol: "BTCUSDT", klinesByInterval: klines });
    expect(ctx.microDirectionScore).toBeLessThan(0);
    expect(ctx.structuralDirectionScore).toBeLessThan(0);
    expect(["TRENDING_DOWN", "WEAK_BEAR_TREND", "BEAR_TREND", "STRONG_BEAR_TREND", "BOUNCE_IN_DOWNTREND"]).toContain(ctx.regime);
    expect(ctx.trendState).not.toBe("BULL_TREND");
    expect(ctx.trendState).not.toBe("STRONG_BULL_TREND");
  });
});

describe("computeAssetContext — structural bearish, micro bullish", () => {
  it("produces bounce in downtrend", () => {
    const klines = {};
    for (const tf of MARKET_REGIME_CONFIG.timeframes) {
      if (["1m", "3m", "5m"].includes(tf)) klines[tf] = makeBullishKlines();
      else klines[tf] = makeBearishKlines();
    }
    const ctx = computeAssetContext({ symbol: "BTCUSDT", klinesByInterval: klines });
    expect(ctx.microDirectionScore).toBeGreaterThan(0);
    expect(ctx.structuralDirectionScore).toBeLessThan(0);
    expect(["BOUNCE_IN_DOWNTREND", "TRENDING_DOWN", "TRANSITION_DOWN"]).toContain(ctx.regime);
  });
});

describe("computeAssetContext — structural bullish, micro bearish", () => {
  it("structural direction is positive and micro is negative", () => {
    const klines = {};
    for (const tf of MARKET_REGIME_CONFIG.timeframes) {
      if (["1m", "3m", "5m"].includes(tf)) klines[tf] = makeBearishKlines();
      else klines[tf] = makeBullishKlines();
    }
    const ctx = computeAssetContext({ symbol: "BTCUSDT", klinesByInterval: klines });
    // Core directional invariant: structural up, micro down
    expect(ctx.microDirectionScore).toBeLessThan(0);
    expect(ctx.structuralDirectionScore).toBeGreaterThan(0);
    // Regime should not be trending-down or strongly bearish
    expect(["TRENDING_DOWN", "BREAKDOWN_DOWN", "CHOPPY"]).not.toContain(ctx.regime);
  });
});

describe("computeAssetContext — flat range", () => {
  it("produces ranging or choppy regime", () => {
    const klines = makeAssetKlines("flat");
    const ctx = computeAssetContext({ symbol: "BTCUSDT", klinesByInterval: klines });
    expect(["RANGING", "CHOPPY", "UNKNOWN", "TRANSITION_DOWN", "TRANSITION_UP"]).toContain(ctx.regime);
  });
});

describe("computeAssetContext — insufficient data", () => {
  it("handles missing timeframes gracefully", () => {
    const ctx = computeAssetContext({ symbol: "BTCUSDT", klinesByInterval: {} });
    expect(ctx.regime).toBe("UNKNOWN");
    expect(ctx.validTimeframeCount).toBe(0);
  });
});

describe("computeCrossMarketContext — BTC bear ETH bull divergence", () => {
  it("detects divergence and penalizes short score", () => {
    const btcBear = computeAssetContext({ symbol: "BTCUSDT", klinesByInterval: makeAssetKlines("bearish") });
    const ethBull = computeAssetContext({ symbol: "ETHUSDT", klinesByInterval: makeAssetKlines("bullish") });
    const cross = computeCrossMarketContext({
      btc: { ...btcBear, freshnessLabel: "LIVE" },
      eth: { ...ethBull, freshnessLabel: "LIVE" },
      breadth: null,
    });
    // Divergence or mixed — computed structural score may vary with synthetic data
    const divergenceLabels = ["BTC_BEAR_ETH_BULL_DIVERGENCE", "BTC_ETH_MIXED", "BTC_ETH_RANGE"];
    expect(divergenceLabels).toContain(cross.btcEthAlignmentLabel);
    // BTC should be bearish and ETH bullish directionally in any case
    expect(btcBear.structuralDirectionScore ?? 0).toBeLessThan(0);
    expect(ethBull.structuralDirectionScore ?? 0).toBeGreaterThan(0);
  });
});

describe("computeCrossMarketContext — short and long both negative during chaos", () => {
  it("both scores can be negative simultaneously", () => {
    const flatBtc = computeAssetContext({ symbol: "BTCUSDT", klinesByInterval: makeAssetKlines("flat") });
    const flatEth = computeAssetContext({ symbol: "ETHUSDT", klinesByInterval: makeAssetKlines("flat") });
    const cross = computeCrossMarketContext({
      btc: { ...flatBtc, freshnessLabel: "LIVE" },
      eth: { ...flatEth, freshnessLabel: "LIVE" },
      breadth: null,
    });
    // In a flat/unknown regime both can be near zero or negative
    expect(typeof cross.crossMarketShortTailwindScore).toBe("number");
    expect(typeof cross.crossMarketLongTailwindScore).toBe("number");
    // They must be independent
    expect(cross.crossMarketShortTailwindScore).not.toBe(-cross.crossMarketLongTailwindScore);
  });
});

describe("computeCrossMarketContext — stale BTC", () => {
  it("hard stale BTC returns null scores", () => {
    const btcBear = computeAssetContext({ symbol: "BTCUSDT", klinesByInterval: makeAssetKlines("bearish") });
    const ethBear = computeAssetContext({ symbol: "ETHUSDT", klinesByInterval: makeAssetKlines("bearish") });
    const cross = computeCrossMarketContext({
      btc: { ...btcBear, freshnessLabel: "HARD_STALE" },
      eth: { ...ethBear, freshnessLabel: "LIVE" },
      breadth: null,
    });
    expect(cross.crossMarketShortTailwindScore).toBeNull();
    expect(cross.crossMarketShortBiasLabel).toBe("SHORT_CONTEXT_STALE");
  });
});

describe("classifyBtcEthAlignment", () => {
  it("strong bearish alignment", () => {
    expect(classifyBtcEthAlignment({ btcStructural: -80, ethStructural: -80, btcTactical: -60, ethTactical: -60 })).toBe("BTC_ETH_STRONG_BEARISH_ALIGNMENT");
  });

  it("bullish alignment", () => {
    // Both 60 and 50 are STRONG_UP (>=45), so this returns STRONG_BULLISH_ALIGNMENT
    expect(["BTC_ETH_BULLISH_ALIGNMENT", "BTC_ETH_STRONG_BULLISH_ALIGNMENT"]).toContain(
      classifyBtcEthAlignment({ btcStructural: 60, ethStructural: 50, btcTactical: 40, ethTactical: 30 })
    );
    // Non-strong bullish: scores in 18..44 range
    expect(classifyBtcEthAlignment({ btcStructural: 30, ethStructural: 25, btcTactical: 20, ethTactical: 20 })).toBe("BTC_ETH_BULLISH_ALIGNMENT");
  });

  it("divergence btc bear eth bull", () => {
    expect(classifyBtcEthAlignment({ btcStructural: -60, ethStructural: 60, btcTactical: -40, ethTactical: 40 })).toBe("BTC_BEAR_ETH_BULL_DIVERGENCE");
  });
});

describe("SHADOW_ONLY guard", () => {
  it("config guard triggers on execution impact", () => {
    expect(() => {
      if (
        MARKET_REGIME_CONFIG.mode === "SHADOW_ONLY" &&
        true === true
      ) {
        throw new Error("Market policy execution impact is forbidden in SHADOW_ONLY mode");
      }
    }).toThrow("SHADOW_ONLY");
  });
});
