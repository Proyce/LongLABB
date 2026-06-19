// ─── LONG AES V1 CONFIG ────────────────────────────────────────────────────────
// All signal polarities are INVERTED vs absoluteEntryScore (short AES).
// Green = tailwind. CVD BULL = tailwind. BTC UP = tailwind.
// LOG ONLY — must never affect execution paths.

export const LONG_AES_VERSION = "long-aes-v1-log-only-2026-06";

export const DEFAULT_LONG_AES_CONFIG = {
  enabled: true,
  logOnly: true,
  allowExecutionImpact: false,
  version: LONG_AES_VERSION,
};

export function mergeLongAesConfig(overrides = {}) {
  if (overrides.logOnly === false) {
    throw new Error("LONG AES V1: logOnly must be true");
  }
  if (overrides.allowExecutionImpact === true) {
    throw new Error("LONG AES V1: allowExecutionImpact must not be set to true");
  }
  return {
    ...DEFAULT_LONG_AES_CONFIG,
    ...overrides,
    logOnly: true,
    allowExecutionImpact: false,
  };
}

// ── Family bounds (symmetric; same as short AES) ──────────────────────────────
export const LONG_FAMILY_BOUNDS = {
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

// ── Direction family — GREEN is now the signal (inverted from short AES) ───────
export const LONG_DIRECTION_WEIGHTS = {
  immediateGreenOrDetected: 10,  // was red +10 for shorts
  hasGreenConfirmation: 7,
  greenCandle: 3,
  noActiveRedImpulse: 4,
  redCandleNoActiveGreen: -4,
};

// ── Movement maturity — UP ticks are now the signal ───────────────────────────
export const LONG_MOVEMENT_MATURITY_WEIGHTS = {
  pullbackTiers: [
    { max: 0.20, points: -4 },
    { max: 0.50, points:  1 },
    { max: 0.80, points:  4 },
    { max: 1.50, points:  8 },
    { max: 3.00, points: 10 },
    { max: Infinity, points: 8 },
  ],
  highPullbackThreshold: 3.00,
  last3UpWithGreenNoRed: 6,
  last3UpOther: 3,
  microMultiConfirm: 4,
  microGreenImpulse: 3,
  loserMicroTicksUpPenalty: -6,
};

// ── Volatility — direction-neutral ────────────────────────────────────────────
export const LONG_VOLATILITY_WEIGHTS = {
  bands: [
    { max: 0.20, points: -6 },
    { max: 0.40, points:  1 },
    { max: 0.60, points:  2 },
    { max: 1.00, points:  4 },
    { max: 1.50, points:  7 },
    { max: 2.00, points:  4 },
    { max: Infinity, points: 5 },
  ],
  highAtrThreshold: 2.00,
};

// ── Location/VWAP — ABOVE VWAP + green is now positive ───────────────────────
export const LONG_LOCATION_WEIGHTS = {
  aboveVwapGreenConfirmation: 4,
  aboveVwapGreenLast3Up: 1,
  belowVwapLoserRedRejectionNoReclaim: 5,
  belowVwapGreenDangerForLong: -8,
  vwapReclaimWithGreen: 8,
  magnitudeCapPct: 1.5,
  magnitudeMaxBonus: 3,
};

// ── Flow + momentum — CVD BULL is now positive ────────────────────────────────
export const LONG_FLOW_MOMENTUM_WEIGHTS = {
  cvdBull: 4,
  cvdNeut: 2,
  cvdBearLoserNoGreen: -4,
  macdPositiveExpanding: 5,
  macdBullishGainerContinuation: 2,
  macdBearishExpansion: -6,
  rsiRolloverUp: 4,
};

// ── Execution — direction-neutral ─────────────────────────────────────────────
export const LONG_EXECUTION_WEIGHTS = {
  spreadTiers: [
    { max: 0.03, points:  3 },
    { max: 0.05, points:  2 },
    { max: 0.08, points: -3 },
    { max: Infinity, points: -8 },
  ],
  wideSpreadsThreshold: 0.08,
  rankTiers: [
    { max: 15, points:  2 },
    { max: 25, points:  1 },
    { max: Infinity, points: -1 },
  ],
};

// ── Market context — BTC UP is now positive ───────────────────────────────────
export const LONG_MARKET_CONTEXT_WEIGHTS = {
  btcUp: 4,
  btcFlatMixed: 1,
  btcDown: -4,
  longFriendlyCandidate: 3,
  unfriendlyBearishSession: -3,
  gainerRegimeInteraction: 5,
};

// ── Side-specific: Top Loser Longs ────────────────────────────────────────────
export const LONG_LOSER_WEIGHTS = {
  longGateWouldPass: 6,
  aboveVwapGreenConfirmation: 4,
  last3UpLoserBase: 3,
  topLoserReversalCandidate: 3,
  fallingKnifeDanger: -8,
  cvdBearChase: -8,
  btcBounceFadeRisk: -8,
  noGreenConfirmation: -5,
};

// ── Side-specific: Top Gainer Longs ──────────────────────────────────────────
export const LONG_GAINER_WEIGHTS = {
  continuationScore80: 4,
  continuationQuality120: 5,
  continuationConfirmation: 4,
  gainerGreenConfirmation: 3,
  higherLow: 4,
  classicContinuationLane: 3,
  aboveVwapBullish: 3,
  broadBlowoffDangerPenalty: -3,
  exactBlowoffDangerLane: -8,
  pumpBlowoffExtreme: -10,
  rankMidBlowoffLane: -7,
  vwapLossAfterPump: -10,
  noContinuationConfirmation: -6,
};

// ── Interaction — core combination bonuses ────────────────────────────────────
export const LONG_INTERACTION_WEIGHTS = {
  universalCore: 5,        // green + no red + ATR>=0.2 + CVD BULL/NEUT
  universalCoreHighAtr: 2,
  gainerSniper: 8,         // continuation quality >= 120 + last3 UP + ATR>=0.6
  failedBreakdownGreen: 5, // failed breakdown + green + no red + CVD BULL/NEUT
  loserSniper: 7,          // green impulse + no red + CVD BULL/NEUT + ATR>=0.6 + spread<=0.05
  pullbackMature: 5,       // pullback > 0.8% + green + last3 UP + no red
  familyCap: 12,
};

// ── Risk penalty — RED signals now incur the penalty ─────────────────────────
export const LONG_RISK_PENALTY_WEIGHTS = {
  immediateRedImpulse: 30,
  redImpulseDetected: 25,
  redCandleWithoutActive: 6,
  cvdBearActiveRed: 20,
  spreadGt008: 15,
  belowVwapNoGreen: 15,
  entryTimingGradeF: 35,
  loserFallingKnifeExtreme: 20,
  gainerBlowoffExtreme: 20,
  aboveVwapRedDanger: 30,
  shortPressureDangerHard: 50,
  invalidOrStale: 50,
};

// ── Research block conditions ─────────────────────────────────────────────────
export const LONG_RESEARCH_BLOCK_CONDITIONS = [
  "INVALID_MARKET",
  "STALE_ENTRY_TELEMETRY",
  "LONG_AUDIT_HARD_DANGER",
  "ABOVE_VWAP_WITH_RED_DANGER",
  "ENTRY_TIMING_GRADE_F",
  "ACTIVE_RED_AND_CVD_BEAR",
  "GAINER_BLOWOFF_EXTREME",
  "RISK_PENALTY_MAX",
];

// ── Confidence caps ───────────────────────────────────────────────────────────
export const LONG_CONFIDENCE_CONFIG = {
  previewMax: 45,
  sideUnknownMax: 35,
  missingAtrOrPullbackMax: 60,
  missingGreenRedStateMax: 40,
  regimeSpecificPenalty: -5,
  experimentalFailedBreakdownPenalty: -5,
  staleConfidence: 0,
};

// ── Tier boundaries — LONG tiers per spec §15.8 ──────────────────────────────
export const LONG_TIER_BOUNDS = [
  { max: 24,  tier: "LONG_AES_RESEARCH_BLOCKED" },
  { max: 39,  tier: "LONG_AES_LOW" },
  { max: 54,  tier: "LONG_AES_WATCH" },
  { max: 69,  tier: "LONG_AES_CANDIDATE" },
  { max: 79,  tier: "LONG_AES_HIGH" },
  { max: 89,  tier: "LONG_AES_SNIPER_RESEARCH" },
  { max: 100, tier: "LONG_AES_ELITE_RESEARCH" },
];
