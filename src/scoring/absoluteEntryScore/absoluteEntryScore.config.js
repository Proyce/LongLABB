// ─── AES V3 CONFIG ────────────────────────────────────────────────────────────
// All weights and thresholds live here. The scorer imports these constants and
// never has magic numbers.

export const ABSOLUTE_ENTRY_SCORE_VERSION = "aes-v3-log-only-2026-06-07";

export const DEFAULT_AES_CONFIG = {
  enabled: true,
  logOnly: true,
  allowExecutionImpact: false,
  version: ABSOLUTE_ENTRY_SCORE_VERSION,
};

export function mergeAesConfig(overrides = {}) {
  if (overrides.logOnly === false) {
    throw new Error("AES V3: logOnly must be true — cannot be set to false");
  }
  if (overrides.allowExecutionImpact === true) {
    throw new Error("AES V3: allowExecutionImpact must not be set to true");
  }
  return {
    ...DEFAULT_AES_CONFIG,
    ...overrides,
    logOnly: true,
    allowExecutionImpact: false,
  };
}

// ── Family bounds (used for documentation and clamp calls) ────────────────────
export const FAMILY_BOUNDS = {
  direction:        { min: -18, max: 16 },
  movementMaturity: { min: -8,  max: 18 },
  volatility:       { min: -6,  max: 8  },
  location:         { min: -10, max: 10 },
  flowMomentum:     { min: -12, max: 10 },
  execution:        { min: -8,  max: 6  },
  marketContext:    { min: -8,  max: 8  },
  sideSpecific:     { min: -18, max: 20 },
  interaction:      { min: 0,   max: 12 },
  riskPenalty:      { min: 0,   max: 50 },
};

// ── Direction family weights ───────────────────────────────────────────────────
export const DIRECTION_WEIGHTS = {
  immediateRedOrDetected: 10,
  hasRedConfirmation: 7,
  redCandle: 3,
  noActiveGreenImpulse: 4,
  greenCandleNoActive: -4,
  // Green impulse signals belong in risk penalty; direction only gets the candle penalty
};

// ── Movement maturity family weights ─────────────────────────────────────────
export const MOVEMENT_MATURITY_WEIGHTS = {
  // Bounce tiers (only applied when hasRedResumption AND no active green)
  bounceTiers: [
    { max: 0.20, points: -4 },
    { max: 0.50, points:  1 },
    { max: 0.80, points:  4 },
    { max: 1.50, points:  8 },
    { max: 3.00, points: 10 },
    { max: Infinity, points: 8 },  // >3% with HIGH_MICRO_BOUNCE_VARIANCE warning
  ],
  highBounceThreshold: 3.00,
  // Ticks + micro labels
  last3DownWithRedNoGreen: 6,
  last3DownOther: 3,
  microMultiConfirm: 4,
  microRedImpulse: 3,
  // MICRO_TICKS_DOWN: gainer penalty without red/RSI confirmation
  gainerMicroTicksDownPenalty: -6,
};

// ── Volatility family weights ─────────────────────────────────────────────────
export const VOLATILITY_WEIGHTS = {
  bands: [
    { max: 0.20, points: -6 },
    { max: 0.40, points:  1 },
    { max: 0.60, points:  2 },
    { max: 1.00, points:  4 },
    { max: 1.50, points:  7 },
    { max: 2.00, points:  4 },
    { max: Infinity, points: 5 }, // >2% with HIGH_ATR_VARIANCE warning
  ],
  highAtrThreshold: 2.00,
};

// ── VWAP/location family weights ──────────────────────────────────────────────
export const LOCATION_WEIGHTS = {
  belowVwapRedConfirmation: 4,
  belowVwapRedLast3Down: 1,
  aboveVwapGainerRedRejectionFailedBreakout: 5,
  aboveVwapVolAccelNoRedNoRejection: -8,
  vwapReclaimNoActiveGreen: -8,
  magnitudeCapPct: 1.5,
  magnitudeMaxBonus: 3,
};

// ── Flow + momentum family weights ────────────────────────────────────────────
export const FLOW_MOMENTUM_WEIGHTS = {
  cvdBear: 3,
  cvdNeut: 2,
  cvdBullGainerStrongRejection: -1,
  cvdBullLoser: -3,
  macdNegativeExpanding: 5,
  macdBearishGainerRollover: 2,
  macdBullishExpansion: -6,
  rsiRolloverNoGreen: 4,
};

// ── Execution family weights ──────────────────────────────────────────────────
export const EXECUTION_WEIGHTS = {
  spreadTiers: [
    { max: 0.03, points:  3 },
    { max: 0.05, points:  2 },
    { max: 0.08, points: -3 },
    { max: Infinity, points: -8 }, // >0.08 + WIDE_SPREAD warning
  ],
  wideSpreadsThreshold: 0.08,
  rankTiers: [
    { max: 15, points:  2 },
    { max: 25, points:  1 },
    { max: Infinity, points: -1 },
  ],
};

// ── Market context family weights ─────────────────────────────────────────────
export const MARKET_CONTEXT_WEIGHTS = {
  btcDown: 4,
  btcFlatMixed: 1,
  btcUp: -4,
  shortFriendlyCandidate: 3,
  unfriendlyBullishSession: -3,
  loserRegimeInteraction: 5,  // BTC_30m_FLAT + BTC_2h_DOWN
};

// ── Side-specific weights ─────────────────────────────────────────────────────
export const GAINER_WEIGHTS = {
  exhaustionScore80: 4,
  exhaustionQuality120: 5,
  exhaustionConfirmation: 4,
  gainerRedRejection: 3,
  failedBreakout: 4,
  classicExhaustionLane: 3,
  vwapLossRedConfirmation: 3,
  broadContinuationDangerPenalty: -3,
  exactContinuationDangerLane: -8,
  pumpStillHot: -10,
  rankMidExhaustionLane: -7,
  vwapLossStillBullish: -10,
  noExhaustionConfirmation: -6,
};

export const LOSER_WEIGHTS = {
  shortGateWouldPass: 6,
  belowVwapRedConfirmation: 4,
  last3DownLoserBase: 3,
  topLoserScalpCandidate: 3,
  blindWeakness: -8,
  corpseChase: -8,
  btcBounceTrap: -8,
  noImmediateRedConfirmation: -5,
};

// ── Interaction family weights ────────────────────────────────────────────────
export const INTERACTION_WEIGHTS = {
  universalCore: 5,        // red + no green + ATR>=0.2 + CVD BEAR/NEUT
  universalCoreHighAtr: 2, // additional when ATR>=0.6
  gainerSniper: 8,         // gainer base + quality>=120 + last3 DOWN + ATR>=0.6
  failedBreakoutRsi: 5,    // failed breakout + RSI rollover + red + no green
  loserSniper: 7,          // red impulse + no green + CVD BEAR/NEUT + ATR>=0.6 + spread<=0.05
  bounceMature: 5,         // microBouncePct>0.8 + red + last3 DOWN + no green
  familyCap: 12,
};

// ── Risk penalty weights ──────────────────────────────────────────────────────
// NOTE: signals that already get large negative direction/flow scores receive
// REDUCED weights here to prevent double-counting.
export const RISK_PENALTY_WEIGHTS = {
  immediateGreenImpulse: 30,
  greenImpulseDetected: 25,
  greenCandleWithoutActive: 6,
  cvdBullActiveGreen: 20,          // combined CVD BULL + active green
  spreadGt008: 15,
  vwapReclaim: 15,
  entryTimingGradeF: 35,
  gainerPumpStillHot: 20,
  gainerContinuationExtreme: 20,
  belowVwapGreenDanger: 30,
  rejectedGreenFadeCandidate: 50,
  greenPressureWithRsiRollover: 50,
  invalidOrStale: 50,
};

// ── Research block conditions ─────────────────────────────────────────────────
export const RESEARCH_BLOCK_CONDITIONS = [
  "INVALID_MARKET",
  "STALE_ENTRY_TELEMETRY",
  "GREEN_PRESSURE_WITH_RSI_ROLLOVER",
  "TOP_LOSER_REJECTED_GREEN_FADE_CANDIDATE",
  "BELOW_VWAP_WITH_GREEN_DANGER",
  "ENTRY_TIMING_GRADE_F",
  "ACTIVE_GREEN_AND_CVD_BULL",
  "ACTIVE_GREEN_AND_VWAP_RECLAIM",
  "GAINER_PUMP_HOT_CONTINUATION_EXTREME",
  "RISK_PENALTY_MAX",
];

// ── Confidence caps ───────────────────────────────────────────────────────────
export const CONFIDENCE_CONFIG = {
  previewMax: 45,
  sideUnknownMax: 35,
  missingAtrOrBounceMax: 60,
  missingRedGreenStateMax: 40,
  regimeSpecificPenalty: -5,
  experimentalFailedBreakoutPenalty: -5,
  staleConfidence: 0,
};

// ── Tier boundaries ───────────────────────────────────────────────────────────
export const TIER_BOUNDS = [
  { max: 24,  tier: "AES_RESEARCH_BLOCKED" },
  { max: 39,  tier: "AES_LOW" },
  { max: 54,  tier: "AES_NEUTRAL" },
  { max: 69,  tier: "AES_PROMISING" },
  { max: 79,  tier: "AES_HIGH_QUALITY_RESEARCH" },
  { max: 89,  tier: "AES_SNIPER_RESEARCH" },
  { max: 100, tier: "AES_ELITE_RESEARCH" },
];
