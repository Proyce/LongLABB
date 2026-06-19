// ─── AES DISCOVERY CONFIG ─────────────────────────────────────────────────────
// Research-only. LOG_ONLY. No execution impact.
// Feature: AES_DISCOVERY_V1

export const AES_DISCOVERY_CONFIG = {
  enabled: true,
  executionMode: "LOG_ONLY",
  scannerVersion: "AES_DISCOVERY_V1",

  // Universe
  quoteAsset: "USDT",
  contractType: "PERPETUAL",
  contractStatus: "TRADING",
  minQuoteVolume: 10_000_000,
  maxSideRankToResearch: 250,
  excludeStablecoinPairs: true,
  exchangeInfoRefreshMs: 6 * 60 * 60_000,

  // Rank bands
  rankBands: [
    { label: "TOP_1_25",      min: 1,   max: 25       },
    { label: "RANK_26_50",    min: 26,  max: 50       },
    { label: "RANK_51_100",   min: 51,  max: 100      },
    { label: "RANK_101_200",  min: 101, max: 200      },
    { label: "RANK_201_PLUS", min: 201, max: Infinity },
  ],

  // Broad scan and deep enrichment
  broadScanIntervalMs: 15_000,
  deepScanIntervalMs: 60_000,
  maxDeepCandidatesPerCycle: 10,
  maxDeepCandidatesPerSidePerCycle: 5,
  deepScanConcurrency: 2,
  telemetryCacheTtlMs: 120_000,
  candidateQueueTtlMs: 180_000,
  maxRateLimitWeightPct: 50,

  // Candidate distribution by side
  perSideBandQuota: {
    RANK_26_50:   2,
    RANK_51_100:  2,
    RANK_101_200: 1,
  },

  // Score thresholds
  aesThresholds: {
    watch:  60,
    high:   70,
    sniper: 80,
    elite:  90,
    reset:  55,
  },

  // Telemetry validity
  minimumTelemetryCoveragePct: 70,
  staleTelemetryMs: 180_000,

  // Shadow trade lifecycle
  createRawHighAesShadow: true,
  createConfirmedHighAesShadow: true,
  oneActiveShadowPerSymbol: true,
  reentryCooldownMs: 15 * 60_000,
  requireScoreResetBeforeReentry: true,
  maxActiveShadowTrades: 100,
  maxStoredDiscoveryEvents: 20_000,
  maxStoredShadowTrades: 10_000,

  // Comparison and fees
  takerFeeRatePctPerSide: 0.05,
  normalizedRoundTripFeePct: 0.10,
  defaultResearchLeverage: 3,

  // Rolling history
  tickHistoryMaxSnapshots: 10,
  tickHistoryMaxAgeMs: 10 * 60_000,

  // Stablecoins to exclude
  stablecoinSymbols: [
    "USDCUSDT","BUSDUSDT","TUSDUSDT","USDPUSDT","FDUSDUSDT","DAIUSDT","EURUSDT",
  ],

  // Storage keys — longlab:v1:* namespace
  storageKeys: {
    discoveryEvents: "longlab:v1:discoveryEvents",
    shadowTrades:    "longlab:v1:shadowTrades",
    config:          "longlab:v1:discoveryConfig",
  },
};

// Merge user overrides — never allows execution impact
export function mergeDiscoveryConfig(overrides = {}) {
  return {
    ...AES_DISCOVERY_CONFIG,
    ...overrides,
    executionMode: "LOG_ONLY",
    enabled: overrides.enabled !== false,
  };
}
