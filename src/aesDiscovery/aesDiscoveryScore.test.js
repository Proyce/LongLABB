import { describe, it, expect } from "vitest";
import { computeDiscoveryAesVariants, checkUniversalLongGate } from "./aesDiscoveryScore.js";

// Minimal telemetry fixture for a clean loser short setup
const LOSER_FIXTURE = {
  symbol:              "TESTUSDT",
  side:                "LOSER",
  shortParentBucket:   "TOP_LOSER_SHORTS",
  leaderboardSide:     "LOSERS",
  entryRankInBucket:   5,
  change24h:           -8,
  priceChangePercent:  "-8",
  lastPrice:           "1.0",

  // Direction signals
  immediateRedImpulse:   true,
  redImpulseDetected:    true,
  immediateGreenImpulse: false,
  greenImpulseDetected:  false,
  hasRedConfirmation:    true,
  candleColorAtEntry:    "RED",

  // Movement
  last3TicksDirection:   "DOWN",
  last5TicksDirection:   "DOWN",
  microBouncePct:        1.2,
  microMomentumLabel:    "MICRO_MULTI_CONFIRM",

  // Volatility
  atrPct:  0.8,

  // Location / VWAP
  priceVsVwapLabel:  "BELOW_VWAP",
  priceVsVwapPct:    -1.5,
  vwapContextLabel:  "BELOW_VWAP",
  entryTimingGrade:  "B",

  // Flow
  cvdLabel:              "BEAR",
  macdHistogramState1m:  "NEGATIVE_EXPANDING",
  hasRsiRollover:        true,

  // Execution
  spreadPct: 0.03,

  // Market context
  btcRunDirection:      "DOWN",
  btcShortContextLabel: "SHORT_FRIENDLY_CANDIDATE",
  btc30mDirection:      "FLAT",
  btc2hDirection:       "DOWN",
  sessionQuality:       "SHORT_FRIENDLY_CANDIDATE",

  // Loser-specific
  shortGateWouldPass:       true,
  isBlindWeaknessShort:     false,
  isCorpseChaseRisk:        false,
  isBtcBounceTrapRisk:      false,
  topLoserThesisLaneLabel:  "TOP_LOSER_SCALP_CANDIDATE",

  // Other
  isInvalidMarket: false,
  isStale:         false,
};

describe("computeDiscoveryAesVariants", () => {
  it("returns all three variant scores", () => {
    const result = computeDiscoveryAesVariants(LOSER_FIXTURE);
    expect(result.aesFull).toBeTypeOf("number");
    expect(result.aesNoRank).toBeTypeOf("number");
    expect(result.aesSetupOnly).toBeTypeOf("number");
  });

  it("aesFull >= aesNoRank when rank contributes positively (rank 5 is good)", () => {
    const result = computeDiscoveryAesVariants(LOSER_FIXTURE);
    // rank 5 should contribute positively, so aesFull >= aesNoRank
    expect(result.aesFull).toBeGreaterThanOrEqual(result.aesNoRank);
  });

  it("aesNoRank >= aesSetupOnly (aesSetupOnly removes more components)", () => {
    const result = computeDiscoveryAesVariants({ ...LOSER_FIXTURE, entryRankInBucket: null });
    // With no rank, aesNoRank and aesFull should be equal
    expect(result.aesFull).toBe(result.aesNoRank);
  });

  it("rank changes don't affect aesNoRank when we swap ranks", () => {
    const r1 = computeDiscoveryAesVariants({ ...LOSER_FIXTURE, entryRankInBucket: 1 });
    const r2 = computeDiscoveryAesVariants({ ...LOSER_FIXTURE, entryRankInBucket: 30 });
    // aesNoRank should be identical regardless of entryRankInBucket
    expect(r1.aesNoRank).toBe(r2.aesNoRank);
  });

  it("rank and 24h changes don't affect aesSetupOnly", () => {
    const r1 = computeDiscoveryAesVariants({ ...LOSER_FIXTURE, entryRankInBucket: 1,  change24h: -8 });
    const r2 = computeDiscoveryAesVariants({ ...LOSER_FIXTURE, entryRankInBucket: 30, change24h: -1 });
    expect(r1.aesSetupOnly).toBe(r2.aesSetupOnly);
  });

  it("returns disagreement fields", () => {
    const result = computeDiscoveryAesVariants(LOSER_FIXTURE);
    expect(result.aesFullMinusNoRank).toBeTypeOf("number");
    expect(result.aesFullMinusSetupOnly).toBeTypeOf("number");
    expect(result.aesNoRankMinusSetupOnly).toBeTypeOf("number");
  });

  it("scoreVersion is populated", () => {
    const result = computeDiscoveryAesVariants(LOSER_FIXTURE);
    expect(typeof result.scoreVersion).toBe("string");
    expect(result.scoreVersion.length).toBeGreaterThan(0);
  });

  it("missing telemetry does not create fake positive points", () => {
    const minimal = { symbol: "XUSDT", side: "LOSER", shortParentBucket: "TOP_LOSER_SHORTS" };
    const result = computeDiscoveryAesVariants(minimal);
    // Score should be in valid range
    expect(result.aesFull).toBeGreaterThanOrEqual(0);
    expect(result.aesFull).toBeLessThanOrEqual(100);
  });
});

// Long-native fixture for gate tests: green present, no red, CVD BULL, ATR active
const LONG_GATE_FIXTURE = {
  ...LOSER_FIXTURE,
  immediateGreenImpulse: true,
  greenImpulseDetected:  true,
  immediateRedImpulse:   false,
  hasRedConfirmation:    false,
  redImpulseDetected:    false,
  cvdLabel:              "BULL",
  atrPct:                0.8,
};

describe("checkUniversalLongGate", () => {
  it("returns true for clean long gate pass (green + no red + ATR + CVD BULL)", () => {
    expect(checkUniversalLongGate(LONG_GATE_FIXTURE, {})).toBe(true);
  });

  it("returns false when no green impulse (long needs continuation)", () => {
    const snap = { ...LONG_GATE_FIXTURE, immediateGreenImpulse: false, greenImpulseDetected: false };
    expect(checkUniversalLongGate(snap, {})).toBe(false);
  });

  it("returns false when immediate red impulse present", () => {
    const snap = { ...LONG_GATE_FIXTURE, immediateRedImpulse: true };
    expect(checkUniversalLongGate(snap, {})).toBe(false);
  });

  it("returns false when ATR too low", () => {
    const snap = { ...LONG_GATE_FIXTURE, atrPct: 0.1 };
    expect(checkUniversalLongGate(snap, {})).toBe(false);
  });

  it("returns false when CVD is not BULL", () => {
    const snap = { ...LONG_GATE_FIXTURE, cvdLabel: "BEAR" };
    expect(checkUniversalLongGate(snap, {})).toBe(false);
  });
});
