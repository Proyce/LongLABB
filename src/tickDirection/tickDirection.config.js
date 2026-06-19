export const TICK_DIRECTION_VERSION = "LONG_TICK_DIRECTION_V1_2026_06";
export const TICK_DIRECTION_STREAM_SCHEMA_VERSION =
  "LONG_TICK_RESEARCH_STREAM_V1_2026_06";

export const TICK_DIRECTION_CONFIG = Object.freeze({
  enabled: true,
  mode: "LOG_ONLY",
  maxSymbols: 80,
  topSymbolsPerSide: 35,
  membershipGraceMs: 30_000,
  membershipDebounceMs: 1_000,
  maxEventsPerSymbolPerSource: 512,
  maxEventAgeMs: 45_000,
  entryLookbackMs: 30_000,
  countWindows: [3, 5, 10],
  timeWindowsMs: [1_000, 3_000, 5_000, 10_000, 30_000],
  outcomeHorizonsMs: [1_000, 3_000, 5_000, 10_000, 30_000, 60_000],
  minimumCanonicalEvents: 4,
  minimumDistinctPriceChanges: 2,
  minimumWindowDurationMs: 400,
  staleAfterMs: 2_500,
  flatThresholdBps: 0.20,
  cleanDirectionEfficiencyMin: 0.55,
  cleanDirectionDominanceMin: 0.60,
  chaoticEfficiencyMax: 0.25,
  chaoticMinimumReversals: 3,
  highAtrMin: 0.6,
  veryHighAtrMin: 1.0,
  extremeAtrMin: 1.5,
  lifecycleHandoverGraceMs: 5_000,
  socketChunkSize: 40,
  uiRefreshMs: 500,
});

export const TICK_DIRECTION_SAFETY = Object.freeze({
  logOnly: true,
  canAffectExecution: false,
  executionApplied: false,
  marketTickPromotionStatus: "SHADOW_ONLY",
  marketTickCanAffectExecution: false,
  marketTickExecutionApplied: false,
});
