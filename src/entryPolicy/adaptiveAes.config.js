export const ADAPTIVE_AES_VERSION = "adaptive-aes-v2-long-2026-06";

export const ADAPTIVE_AES_CONFIG = {
  version: ADAPTIVE_AES_VERSION,
  mode: "SHADOW_ONLY",
  allowExecutionImpact: false,

  adjustmentCap: { min: -15, max: 12 },
  adaptiveScoreCap: { min: 0, max: 100 },

  baseRequiredScore: {
    LOSER:   70,
    GAINER:  72,
    UNKNOWN: 75,
  },

  // Market adjustment table for LONG bias labels (native long — not inverted short)
  longBiasAdjustments: {
    STRONG_LONG_TAILWIND:  7,
    LONG_TAILWIND:         4,
    LONG_NEUTRAL:          0,
    LONG_HEADWIND:        -5,
    STRONG_LONG_HEADWIND: -10,
    LONG_CONTEXT_STALE:   -15,
  },

  // BTC/ETH alignment: bearish alignment is a LONG headwind, bullish is a LONG tailwind
  alignmentAdjustments: {
    BTC_ETH_STRONG_BULLISH_ALIGNMENT:  4,
    BTC_ETH_BULLISH_ALIGNMENT:         2,
    BTC_ETH_STRONG_BEARISH_ALIGNMENT: -4,
    BTC_ETH_BEARISH_ALIGNMENT:        -2,
    BTC_ETH_MIXED:                     0,
    BTC_ETH_RANGE:                     0,
    BTC_BEAR_ETH_BULL_DIVERGENCE:     -2,
    BTC_BULL_ETH_BEAR_DIVERGENCE:     -2,
    BTC_ETH_STALE:                    -3,
  },

  // Breadth: bullish breadth = long tailwind, bearish = long headwind
  breadthAdjustments: {
    BREADTH_STRONGLY_BULLISH:  2,
    BREADTH_BULLISH:           1,
    BREADTH_MIXED:             0,
    BREADTH_BEARISH:          -2,
    BREADTH_STRONGLY_BEARISH: -4,
    BREADTH_INSUFFICIENT:      0,
    BREADTH_STALE:            -2,
  },

  // Extra threshold penalty for severe long-adverse conditions
  marketPolicyThresholdConditions: {
    LONG_CONTEXT_STALE:          10,
    STRONG_LONG_HEADWIND:         5,
    BTC_ETH_STRONG_BEARISH_ALIGN: 3,
  },
};

if (
  ADAPTIVE_AES_CONFIG.mode === "SHADOW_ONLY" &&
  ADAPTIVE_AES_CONFIG.allowExecutionImpact === true
) {
  throw new Error("Adaptive AES execution impact is forbidden in SHADOW_ONLY mode");
}
