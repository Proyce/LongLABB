import { describe, it, expect } from "vitest";
import { applyLongFilterState, getLongFilterOutcomePnl } from "./longFilterEngine.js";
import { DEFAULT_LONG_FILTER_STATE, makeFilterGroup, makePredicate, addPredicateToGroup } from "./longFilterState.js";
import { LONG_SCOPE, OPERATOR, PNL_METRIC } from "./longFilterConstants.js";
import { LONG_FILTER_REGISTRY } from "./longFilterRegistry.js";

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

function makeLongTrade(overrides = {}) {
  return {
    id: Math.random().toString(36),
    symbol: "TESTUSDT",
    run: 1,
    longParentBucket: "TOP_LOSER_LONGS",
    longGateWouldPass: true,
    longGateScore: 65,
    longGateAuditLabel: "WOULD_PASS_LONG_GATE",
    longGateFailReasons: [],
    hasLongMicroMomentum: true,
    hasGreenConfirmation: true,
    hasRedDanger: false,
    longMicroMomentumLabel: "MICRO_GREEN_IMPULSE",
    immediateGreenImpulse: true,
    greenImpulseDetected: true,
    immediateRedImpulse: false,
    redImpulseDetected: false,
    entryCvdLabel: "BULL",
    entryPriceVsVwapLabel: "ABOVE_VWAP",
    vwapLongContextLabel: "ABOVE_VWAP_GREEN_CVD_BULL_SUPPORT",
    failedBreakdown1m: true,
    failedBreakdown3m: false,
    higherLow1m: true,
    higherLow3m: false,
    atrPct: 0.8,
    spreadPct: 0.03,
    last3TicksDirection: "UP",
    btcLongContextLabel: "BTC_CHOP_LONG_SELECTIVE",
    longAesScore: 72,
    longAesTier: "LONG_AES_HIGH",
    bestDnaLongScore: 80,
    bestDnaLongTier: "BEST_DNA_LONG_HIGH",
    bestDnaLongPositiveGenes: ["ATR_ACTIVE", "GREEN_IMPULSE"],
    bestDnaLongPenaltyGenes: [],
    longPostFee10EntryScore: 70,
    longPostFee10EntryTier: "LONG_PF10_HIGH",
    longCandidateRunnerScoreAtEntry: 70,
    longCandidateRunnerTierAtEntry: "LONG_RUNNER_HIGH",
    sniperLongWouldPass: false,
    longCombosPositiveMatched: ["LONG_UNIVERSAL_CORE_V1"],
    longCombosAntiMatched: [],
    longCombosPositiveCount: 1,
    longCombosAntiCount: 0,
    topLoserReversalScore: 65,
    topLoserReversalWouldPass: true,
    topLoserReversalThesisLabel: "REVERSAL_LIKELY",
    topLoserReversalReasons: ["FAILED_BREAKDOWN", "GREEN_IMPULSE"],
    topLoserReversalWarnings: [],
    longFilterSnapshotVersion: "LONG_FILTER_SNAPSHOT_V4",
    longFilterSnapshotTiming: "ENTRY_FINAL",
    filterRecordSchemaClass: "NATIVE_LONG_V4",
    legacyShortSemanticData: false,
    rawNormPnlPct: 1.6,
    feeAdjustedNormPnlPct: 1.44,
    finalPnlPct: 8,
    grossMarginPnlPct: 8,
    feeAdjustedMarginPnlPct: 7.2,
    isFinalOutcome: true,
    closeReason: "PROFIT_LOCK",
    closed: true,
    fundingRate: -0.01,
    ...overrides,
  };
}

function makeGainerTrade(overrides = {}) {
  return makeLongTrade({
    longParentBucket: "TOP_GAINER_LONGS",
    topGainerContinuationScore: 60,
    topGainerBlowoffRiskScore: 15,
    topGainerContinuationWouldPass: true,
    topGainerContinuationThesisLabel: "CONTINUATION_LIKELY",
    topGainerContinuationReasons: ["ABOVE_VWAP_SUPPORT", "HIGHER_LOW"],
    topGainerContinuationWarnings: [],
    higherLow1m: true,
    ...overrides,
  });
}

const BASE_STATE = { ...DEFAULT_LONG_FILTER_STATE };

// ─── PNL RESOLUTION ───────────────────────────────────────────────────────────

describe("getLongFilterOutcomePnl", () => {
  it("returns net after fees when available", () => {
    const t = makeLongTrade({ feeAdjustedMarginPnlPct: 7.2 });
    const r = getLongFilterOutcomePnl(t, PNL_METRIC.NET_AFTER_FEES);
    expect(r.pnlValue).toBe(7.2);
    expect(r.pnlMetricAvailable).toBe(true);
    expect(r.pnlMetricFallbackUsed).toBe(false);
  });

  it("returns null when net fee data is missing", () => {
    const t = makeLongTrade({ feeAdjustedMarginPnlPct: undefined });
    const r = getLongFilterOutcomePnl(t, PNL_METRIC.NET_AFTER_FEES);
    expect(r.pnlMetricAvailable).toBe(false);
    expect(r.pnlValue).toBeNull();
    expect(r.pnlMetricFallbackUsed).toBe(false);
  });

  it("returns gross margin", () => {
    const t = makeLongTrade({ grossMarginPnlPct: 10, feeAdjustedMarginPnlPct: 9 });
    const r = getLongFilterOutcomePnl(t, PNL_METRIC.GROSS_MARGIN);
    expect(r.pnlValue).toBe(10);
  });

  it("returns null for all-costs when field absent", () => {
    const t = makeLongTrade();
    const r = getLongFilterOutcomePnl(t, PNL_METRIC.NET_AFTER_ALL_COSTS);
    expect(r.pnlValue).toBeNull();
    expect(r.pnlMetricAvailable).toBe(false);
  });
});

// ─── SCOPE FILTERING ──────────────────────────────────────────────────────────

describe("applyLongFilterState — scope", () => {
  const loser = makeLongTrade({ longParentBucket: "TOP_LOSER_LONGS" });
  const gainer = makeGainerTrade({ longParentBucket: "TOP_GAINER_LONGS" });
  const trades = [loser, gainer];

  it("ALL_LONGS returns both", () => {
    const r = applyLongFilterState(trades, { ...BASE_STATE, scope: LONG_SCOPE.ALL_LONGS });
    expect(r.outputCount).toBe(2);
    expect(r.excludedByScope).toBe(0);
  });

  it("TOP_LOSER_LONGS excludes gainer", () => {
    const r = applyLongFilterState(trades, { ...BASE_STATE, scope: LONG_SCOPE.TOP_LOSER_LONGS });
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longParentBucket).toBe("TOP_LOSER_LONGS");
    expect(r.excludedByScope).toBe(1);
  });

  it("TOP_GAINER_LONGS excludes loser", () => {
    const r = applyLongFilterState(trades, { ...BASE_STATE, scope: LONG_SCOPE.TOP_GAINER_LONGS });
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longParentBucket).toBe("TOP_GAINER_LONGS");
  });
});

// ─── BOOLEAN OPERATORS ────────────────────────────────────────────────────────

describe("applyLongFilterState — boolean operators", () => {
  const passT = makeLongTrade({ longGateWouldPass: true });
  const failT = makeLongTrade({ longGateWouldPass: false });
  const unknownT = makeLongTrade({ longGateWouldPass: undefined });

  function withPredicate(filterId, operator) {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate(filterId, operator)];
    return { ...BASE_STATE, groups: [group] };
  }

  it("IS_TRUE passes only true", () => {
    const r = applyLongFilterState([passT, failT, unknownT], withPredicate("LONG_GATE_PASS", OPERATOR.IS_TRUE));
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longGateWouldPass).toBe(true);
  });

  it("IS_FALSE passes only false", () => {
    const r = applyLongFilterState([passT, failT, unknownT], withPredicate("LONG_GATE_PASS", OPERATOR.IS_FALSE));
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longGateWouldPass).toBe(false);
  });

  it("IS_KNOWN passes true and false, not undefined", () => {
    const r = applyLongFilterState([passT, failT, unknownT], withPredicate("LONG_GATE_PASS", OPERATOR.IS_KNOWN));
    expect(r.outputCount).toBe(2);
  });

  it("IS_UNKNOWN passes only undefined/null", () => {
    const r = applyLongFilterState([passT, failT, unknownT], withPredicate("LONG_GATE_PASS", OPERATOR.IS_UNKNOWN));
    expect(r.outputCount).toBe(1);
  });
});

// ─── NUMERIC OPERATORS ────────────────────────────────────────────────────────

describe("applyLongFilterState — numeric operators", () => {
  const t70 = makeLongTrade({ longAesScore: 70 });
  const t80 = makeLongTrade({ longAesScore: 80 });
  const t55 = makeLongTrade({ longAesScore: 55 });

  function withPredicate(op, value) {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("LONG_AES_SCORE", op, value)];
    return { ...BASE_STATE, groups: [group] };
  }

  it("GTE filters correctly", () => {
    const r = applyLongFilterState([t55, t70, t80], withPredicate(OPERATOR.GTE, 70));
    expect(r.outputCount).toBe(2);
  });

  it("LTE filters correctly", () => {
    const r = applyLongFilterState([t55, t70, t80], withPredicate(OPERATOR.LTE, 70));
    expect(r.outputCount).toBe(2);
  });

  it("BETWEEN filters correctly", () => {
    const r = applyLongFilterState([t55, t70, t80], withPredicate(OPERATOR.BETWEEN, [60, 75]));
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longAesScore).toBe(70);
  });

  it("EQ filters correctly", () => {
    const r = applyLongFilterState([t55, t70, t80], withPredicate(OPERATOR.EQ, 80));
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longAesScore).toBe(80);
  });

  it("unknown numeric is excluded by GTE", () => {
    const tNull = makeLongTrade({ longAesScore: null });
    const r = applyLongFilterState([t70, tNull], withPredicate(OPERATOR.GTE, 50));
    expect(r.outputCount).toBe(1);
  });
});

// ─── ENUM OPERATORS ───────────────────────────────────────────────────────────

describe("applyLongFilterState — enum operators", () => {
  const bull = makeLongTrade({ entryCvdLabel: "BULL" });
  const neut = makeLongTrade({ entryCvdLabel: "NEUT" });
  const bear = makeLongTrade({ entryCvdLabel: "BEAR" });

  function withPredicate(op, value) {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("CVD_LABEL", op, value)];
    return { ...BASE_STATE, groups: [group] };
  }

  it("CVD BULL or NEUT passes bull and neut", () => {
    const r = applyLongFilterState([bull, neut, bear], withPredicate(OPERATOR.IN, ["BULL", "NEUT"]));
    expect(r.outputCount).toBe(2);
  });

  it("NOT_IN excludes BEAR", () => {
    const r = applyLongFilterState([bull, neut, bear], withPredicate(OPERATOR.NOT_IN, ["BEAR"]));
    expect(r.outputCount).toBe(2);
  });

  it("CVD BEAR fails CVD-not-bear filter", () => {
    const r = applyLongFilterState([bear], withPredicate(OPERATOR.IN, ["BULL", "NEUT"]));
    expect(r.outputCount).toBe(0);
  });
});

// ─── ARRAY OPERATORS ──────────────────────────────────────────────────────────

describe("applyLongFilterState — array operators", () => {
  const withCombo = makeLongTrade({ longCombosPositiveMatched: ["LONG_UNIVERSAL_CORE_V1", "FAILED_BREAKDOWN_VWAP_RECLAIM_LONG_V1"] });
  const noCombo = makeLongTrade({ longCombosPositiveMatched: [] });
  const antiCombo = makeLongTrade({ longCombosAntiMatched: ["LONG_FALLING_KNIFE_ANTI_V1"], longCombosPositiveMatched: [] });

  function withPredicate(filterId, op, value) {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate(filterId, op, value)];
    return { ...BASE_STATE, groups: [group] };
  }

  it("INCLUDES_ANY matches either combo", () => {
    const r = applyLongFilterState([withCombo, noCombo], withPredicate("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_UNIVERSAL_CORE_V1"]));
    expect(r.outputCount).toBe(1);
  });

  it("INCLUDES_ALL requires both combos", () => {
    const r = applyLongFilterState([withCombo, noCombo], withPredicate("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ALL, ["LONG_UNIVERSAL_CORE_V1", "FAILED_BREAKDOWN_VWAP_RECLAIM_LONG_V1"]));
    expect(r.outputCount).toBe(1);
  });

  it("INCLUDES_NONE excludes anti-combo trades", () => {
    const r = applyLongFilterState([withCombo, antiCombo], withPredicate("LONG_COMBOS_ANTI_MATCHED", OPERATOR.INCLUDES_NONE, ["LONG_FALLING_KNIFE_ANTI_V1"]));
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longCombosPositiveMatched).toContain("LONG_UNIVERSAL_CORE_V1");
  });

  it("IS_EMPTY passes empty array", () => {
    const r = applyLongFilterState([withCombo, noCombo], withPredicate("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.IS_EMPTY));
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longCombosPositiveMatched).toHaveLength(0);
  });

  it("IS_NOT_EMPTY passes non-empty array", () => {
    const r = applyLongFilterState([withCombo, noCombo], withPredicate("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.IS_NOT_EMPTY));
    expect(r.outputCount).toBe(1);
  });
});

// ─── AND / OR / NOT ───────────────────────────────────────────────────────────

describe("applyLongFilterState — AND within group, OR between groups", () => {
  const t1 = makeLongTrade({ longGateWouldPass: true, longAesScore: 80, entryCvdLabel: "BULL" });
  const t2 = makeLongTrade({ longGateWouldPass: true, longAesScore: 50, entryCvdLabel: "NEUT" });
  const t3 = makeLongTrade({ longGateWouldPass: false, longAesScore: 90, entryCvdLabel: "BULL" });

  it("AND within group: both must match", () => {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [
      makePredicate("LONG_GATE_PASS", OPERATOR.IS_TRUE),
      makePredicate("LONG_AES_SCORE", OPERATOR.GTE, 70),
    ];
    const r = applyLongFilterState([t1, t2, t3], { ...BASE_STATE, groups: [group] });
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longAesScore).toBe(80);
  });

  it("OR between groups: at least one group matches", () => {
    const g1 = makeFilterGroup({ join: "AND" });
    g1.predicates = [makePredicate("LONG_AES_SCORE", OPERATOR.GTE, 90)];
    const g2 = makeFilterGroup({ join: "AND" });
    g2.predicates = [makePredicate("LONG_GATE_PASS", OPERATOR.IS_TRUE), makePredicate("CVD_LABEL", OPERATOR.IN, ["NEUT"])];
    const r = applyLongFilterState([t1, t2, t3], { ...BASE_STATE, groupOperator: "ANY_GROUPS", groups: [g1, g2] });
    // t3 matches g1 (AES >= 90), t2 matches g2 (gate pass + CVD NEUT)
    expect(r.outputCount).toBe(2);
  });
});

// ─── NON-MUTATION ─────────────────────────────────────────────────────────────

describe("applyLongFilterState — non-mutation", () => {
  it("does not mutate input trades", () => {
    const trades = [makeLongTrade(), makeLongTrade()];
    const original = [...trades];
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("LONG_GATE_PASS", OPERATOR.IS_TRUE)];
    applyLongFilterState(trades, { ...BASE_STATE, groups: [group] });
    expect(trades).toHaveLength(original.length);
  });
});

// ─── UNKNOWN FILTER ID ERROR ──────────────────────────────────────────────────

describe("applyLongFilterState — invalid IDs and operators", () => {
  it("reports error for unknown filter ID", () => {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("NONEXISTENT_FILTER", OPERATOR.IS_TRUE)];
    const r = applyLongFilterState([makeLongTrade()], { ...BASE_STATE, groups: [group] });
    expect(r.errors.some(e => e.includes("NONEXISTENT_FILTER"))).toBe(true);
  });

  it("reports error for incompatible operator", () => {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("LONG_GATE_PASS", OPERATOR.GTE, 5)];
    const r = applyLongFilterState([makeLongTrade()], { ...BASE_STATE, groups: [group] });
    expect(r.errors.some(e => e.includes("LONG_GATE_PASS"))).toBe(true);
  });
});

// ─── LEGACY EXCLUSION ─────────────────────────────────────────────────────────

describe("applyLongFilterState — legacy record exclusion", () => {
  const native = makeLongTrade({ filterRecordSchemaClass: "NATIVE_LONG_V4", legacyShortSemanticData: false });
  const legacy = makeLongTrade({ filterRecordSchemaClass: "LEGACY_SHORT_SEMANTIC", legacyShortSemanticData: true });

  it("excludes legacy records by default", () => {
    const r = applyLongFilterState([native, legacy], BASE_STATE);
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].filterRecordSchemaClass).toBe("NATIVE_LONG_V4");
  });

  it("includes legacy when flag enabled", () => {
    const r = applyLongFilterState([native, legacy], { ...BASE_STATE, includeLegacyShortSemanticData: true });
    expect(r.outputCount).toBe(2);
  });
});

// ─── LONG POLARITY TESTS (spec §23.2) ────────────────────────────────────────

describe("long polarity correctness", () => {
  function withBool(filterId, op) {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate(filterId, op)];
    return { ...BASE_STATE, groups: [group] };
  }

  it("green confirmation increases positive cohort", () => {
    const green = makeLongTrade({ hasGreenConfirmation: true });
    const noGreen = makeLongTrade({ hasGreenConfirmation: false });
    const r = applyLongFilterState([green, noGreen], withBool("HAS_GREEN_CONFIRMATION", OPERATOR.IS_TRUE));
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].hasGreenConfirmation).toBe(true);
  });

  it("immediate red excludes green-no-red filters", () => {
    const redDanger = makeLongTrade({ hasRedDanger: true });
    const noRed = makeLongTrade({ hasRedDanger: false });
    const r = applyLongFilterState([redDanger, noRed], withBool("HAS_RED_DANGER", OPERATOR.IS_FALSE));
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].hasRedDanger).toBe(false);
  });

  it("CVD BULL passes CVD-not-bear filter", () => {
    const bull = makeLongTrade({ entryCvdLabel: "BULL" });
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("CVD_LABEL", OPERATOR.IN, ["BULL", "NEUT"])];
    const r = applyLongFilterState([bull], { ...BASE_STATE, groups: [group] });
    expect(r.outputCount).toBe(1);
  });

  it("CVD BEAR fails CVD-not-bear filter", () => {
    const bear = makeLongTrade({ entryCvdLabel: "BEAR" });
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("CVD_LABEL", OPERATOR.IN, ["BULL", "NEUT"])];
    const r = applyLongFilterState([bear], { ...BASE_STATE, groups: [group] });
    expect(r.outputCount).toBe(0);
  });

  it("ticks UP passes long momentum label filter", () => {
    const up = makeLongTrade({ longMicroMomentumLabel: "MICRO_TICKS_UP" });
    const down = makeLongTrade({ longMicroMomentumLabel: "MICRO_RED_PRESSURE" });
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("LONG_MICRO_MOMENTUM_LABEL", OPERATOR.IN, ["MICRO_TICKS_UP", "MICRO_GREEN_IMPULSE", "MICRO_GREEN_MULTI_CONFIRM", "MICRO_RSI_ROLLOVER_UP"])];
    const r = applyLongFilterState([up, down], { ...BASE_STATE, groups: [group] });
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].longMicroMomentumLabel).toBe("MICRO_TICKS_UP");
  });

  it("failed breakdown passes loser reversal structure filter", () => {
    const breakdown = makeLongTrade({ failedBreakdown1m: true });
    const noBreakdown = makeLongTrade({ failedBreakdown1m: false, failedBreakdown3m: false });
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("FAILED_BREAKDOWN_1M", OPERATOR.IS_TRUE)];
    const r = applyLongFilterState([breakdown, noBreakdown], { ...BASE_STATE, groups: [group] });
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].failedBreakdown1m).toBe(true);
  });

  it("higher low passes gainer continuation structure", () => {
    const higherLow = makeGainerTrade({ higherLow1m: true });
    const noHigherLow = makeGainerTrade({ higherLow1m: false, higherLow3m: false });
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("HIGHER_LOW_1M", OPERATOR.IS_TRUE)];
    const r = applyLongFilterState([higherLow, noHigherLow], { ...BASE_STATE, groups: [group] });
    expect(r.outputCount).toBe(1);
  });

  it("VWAP loss does not pass VWAP support filter", () => {
    const belowVwap = makeLongTrade({ entryPriceVsVwapLabel: "BELOW_VWAP" });
    const aboveVwap = makeLongTrade({ entryPriceVsVwapLabel: "ABOVE_VWAP" });
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = [makePredicate("PRICE_VS_VWAP_LABEL", OPERATOR.IN, ["ABOVE_VWAP", "AT_VWAP"])];
    const r = applyLongFilterState([belowVwap, aboveVwap], { ...BASE_STATE, groups: [group] });
    expect(r.outputCount).toBe(1);
    expect(r.trades[0].entryPriceVsVwapLabel).toBe("ABOVE_VWAP");
  });
});

// ─── DEDUPLICATION ────────────────────────────────────────────────────────────

describe("applyLongFilterState — deduplication", () => {
  it("deduplicates by trade ID keeping snapshot version", () => {
    const id = "dup-1";
    const withSnap = makeLongTrade({ id, longFilterSnapshotVersion: "LONG_FILTER_SNAPSHOT_V4" });
    const withoutSnap = { ...makeLongTrade({ id }), longFilterSnapshotVersion: undefined };
    const r = applyLongFilterState([withoutSnap, withSnap], BASE_STATE);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].longFilterSnapshotVersion).toBe("LONG_FILTER_SNAPSHOT_V4");
  });
});
