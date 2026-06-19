export const MARKET_REGIME_VERSION = "market-regime-v2-shadow-2026-06";

export const MARKET_REGIME_CONFIG = {
  enabled: true,
  mode: "SHADOW_ONLY",
  allowExecutionImpact: false,

  sourceExchange: "binance",
  marketType: "futures",

  symbols: {
    btc: "BTCUSDT",
    eth: "ETHUSDT",
  },

  refreshMs: 15_000,
  maxContextAgeMs: 30_000,
  hardStaleAgeMs: 60_000,
  useClosedCandlesOnly: true,

  timeframes: ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h"],

  candleLimits: {
    "1m": 160,
    "3m": 160,
    "5m": 160,
    "15m": 160,
    "30m": 160,
    "1h": 160,
    "2h": 160,
    "4h": 160,
  },

  groups: {
    micro:      ["1m", "3m", "5m"],
    tactical:   ["15m", "30m"],
    structural: ["1h", "2h", "4h"],
  },

  groupWeights: {
    micro:      { "1m": 0.45, "3m": 0.35, "5m": 0.20 },
    tactical:   { "15m": 0.60, "30m": 0.40 },
    structural: { "1h": 0.45, "2h": 0.35, "4h": 0.20 },
  },

  thresholds: {
    directionStrong:           45,
    directionWeak:             18,
    adxTrend:                  20,
    adxStrongTrend:            25,
    adxVeryStrong:             35,
    chopEfficiencyMax:         0.28,
    rangeWidthAtrMax:          2.2,
    volatilityExpansionRatio:  1.30,
    volatilityCompressionRatio: 0.75,
    vwapFlatPct:               0.05,
    emaSlopeFlatPct:           0.03,
  },

  breadth: {
    enabled:         true,
    maxSymbols:      30,
    refreshMs:       30_000,
    minValidSymbols: 12,
    minQuoteVolume:  10_000_000,
    excludeSymbols:  ["BTCUSDT", "ETHUSDT"],
  },
};

if (
  MARKET_REGIME_CONFIG.mode === "SHADOW_ONLY" &&
  MARKET_REGIME_CONFIG.allowExecutionImpact === true
) {
  throw new Error("Market policy execution impact is forbidden in SHADOW_ONLY mode");
}
