// ─── LONGLAB IDENTITY CONSTANTS ──────────────────────────────────────────────
// All runtime identity fields for LongLAB. Every trade object must include these.

export const LONG_LAB_ID             = "LONG_LAB";
export const LONG_LAB_SCHEMA_VERSION = "longlab-schema-v1";
export const LONG_ENGINE_VERSION     = "long-engine-v1";
export const LONG_SCORE_VERSION      = "long-aes-v1";
export const LONG_STRATEGY_VERSION   = "long-strategies-v1";

// Execution mode: LongLAB never places real orders
export const LONG_EXECUTION_MODE = "LOG_ONLY";

// Trade identity fields to stamp on every created sample
export const LONG_TRADE_IDENTITY = {
  lab:                          LONG_LAB_ID,
  tradeSide:                    "LONG",
  executionMode:                LONG_EXECUTION_MODE,
  schemaVersion:                LONG_LAB_SCHEMA_VERSION,
  engineVersion:                LONG_ENGINE_VERSION,
  scoreVersion:                 LONG_SCORE_VERSION,
  strategyVersion:              LONG_STRATEGY_VERSION,
  entryPolicyExecutionApplied:  false,
  entryPolicyCanAffectExecution: false,
  realOrderPlacementEnabled:    false,
};

// ─── BUCKET CONFIGURATION ────────────────────────────────────────────────────

export const LONG_BUCKET_TARGET = 25;
export const MAX_LONG_SAMPLES   = LONG_BUCKET_TARGET * 2;

export const LONG_PARENT_BUCKETS = {
  TOP_LOSER_LONGS:  "TOP_LOSER_LONGS",
  TOP_GAINER_LONGS: "TOP_GAINER_LONGS",
};

export const LONG_BUCKET_POSITION_LIMITS = {
  maxOpenLongsTotal:     50,
  maxOpenLongsPerSymbol: 1,
  parentBucketCaps: {
    TOP_LOSER_LONGS:  LONG_BUCKET_TARGET,
    TOP_GAINER_LONGS: LONG_BUCKET_TARGET,
  },
};

// Mixed run: balanced 25 losers + 25 gainers
export const MIXED_LONG_RUN_TARGET = "MIXED_LONG_25_25";

// ─── SCORE TIERS ─────────────────────────────────────────────────────────────

export const LONG_AES_TIERS = {
  LOW:             { min: 0,  max: 39,  label: "LONG_AES_LOW"             },
  WATCH:           { min: 40, max: 59,  label: "LONG_AES_WATCH"           },
  CANDIDATE:       { min: 60, max: 74,  label: "LONG_AES_CANDIDATE"       },
  HIGH:            { min: 75, max: 84,  label: "LONG_AES_HIGH"            },
  SNIPER_RESEARCH: { min: 85, max: 92,  label: "LONG_AES_SNIPER_RESEARCH" },
  ELITE_RESEARCH:  { min: 93, max: 100, label: "LONG_AES_ELITE_RESEARCH"  },
};

export const SNIPER_LONG_TIERS = {
  NONE:           "LONG_SNIPER_NONE",
  WATCH:          "LONG_SNIPER_WATCH",
  CANDIDATE:      "LONG_SNIPER_CANDIDATE",
  HIGH:           "LONG_SNIPER_HIGH",
  ELITE_RESEARCH: "LONG_SNIPER_ELITE_RESEARCH",
};
