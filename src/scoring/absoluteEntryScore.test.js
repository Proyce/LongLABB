import { describe, it, expect } from "vitest";

// V3 (via facade) — the primary path used by all application code
import {
  computeAbsoluteEntryScore,
  classifyAbsoluteEntryTier,
  classifySniperLabels,
  flattenAbsoluteEntryScore,
  absoluteEntryScoreCSVRow,
  ABSOLUTE_ENTRY_SCORE_CSV_HEADERS,
} from "./absoluteEntryScore.js";

// V3 direct imports for additional contract assertions
import {
  computeAbsoluteEntryScoreV3,
  flattenAbsoluteEntryScoreV3,
  ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS,
  absoluteEntryScoreV3CSVRow,
  buildAbsoluteEntryPreviewSnapshot,
} from "./absoluteEntryScore/index.js";

import { classifyAesTier } from "./absoluteEntryScore/absoluteEntryScore.labels.js";

// V2 legacy — imported directly so V2 regression tests stay isolated
import {
  computeAbsoluteEntryScore as computeV2,
  classifyAbsoluteEntryTier as classifyTierV2,
  classifySniperLabels as classifySniperLabelsV2,
  flattenAbsoluteEntryScore as flattenV2,
  absoluteEntryScoreCSVRow as csvRowV2,
  ABSOLUTE_ENTRY_SCORE_CSV_HEADERS as csvHeadersV2,
} from "./absoluteEntryScore/absoluteEntryScore.legacy-v2.js";

// ─── BASE FIXTURES ────────────────────────────────────────────────────────────

const baseLoser = {
  shortParentBucket:    "TOP_LOSER_SHORTS",
  leaderboardSide:      "LOSERS",
  entryTimingGrade:     "B",
  candleColorAtEntry:   "RED",
  immediateRedImpulse:  true,
  immediateGreenImpulse: false,
  redImpulseDetected:   true,
  greenImpulseDetected: false,
  hasRedConfirmation:   true,
  hasRsiRollover:       false,
  hasGreenDanger:       false,
  last3TicksDirection:  "DOWN",
  last5TicksDirection:  "DOWN",
  cvdLabel:             "BEAR",
  atrPct:               0.8,
  spreadPct:            0.03,
  entryRank:            10,
  entryRankInBucket:    10,
  priceVsVwapLabel:     "BELOW_VWAP",
  btcRegime:            "BTC_CHOP",
  btcShortContextLabel: "BTC_CHOP_OK",
  shortGateWouldPass:   true,
  microMomentumLabel:   "MICRO_MULTI_CONFIRM",
  isBlindWeaknessShort: false,
  isBtcBounceTrapRisk:  false,
  isCorpseChaseRisk:    false,
  isInvalidMarket:      false,
  isStale:              false,
  macdHistogramState1m: "NEGATIVE_EXPANDING",
  rsi1mSlope:           "FALLING",
  rsi3mSlope:           "FALLING",
};

const baseGainer = {
  shortParentBucket:    "TOP_GAINER_SHORTS",
  leaderboardSide:      "GAINERS",
  entryTimingGrade:     "B",
  candleColorAtEntry:   "RED",
  immediateRedImpulse:  false,
  immediateGreenImpulse: false,
  redImpulseDetected:   true,
  greenImpulseDetected: false,
  hasRedConfirmation:   true,
  hasRsiRollover:       false,
  hasGreenDanger:       false,
  cvdLabel:             "NEUT",
  atrPct:               0.8,
  spreadPct:            0.03,
  entryRank:            12,
  entryRankInBucket:    12,
  priceVsVwapLabel:     "BELOW_VWAP",
  btcRegime:            "BTC_CHOP",
  btcShortContextLabel: "BTC_CHOP_OK",
  shortGateWouldPass:   true,
  microMomentumLabel:   "MICRO_RED_IMPULSE",
  isBlindWeaknessShort: false,
  isBtcBounceTrapRisk:  false,
  isCorpseChaseRisk:    false,
  isInvalidMarket:      false,
  isStale:              false,
  topGainerExhaustionQualityScore:   130,
  topGainerContinuationDangerScore:  20,
  topGainerWouldPassExhaustionAudit: true,
  hasGainerExhaustionConfirmation:   true,
  hasGainerRedRejection:             true,
  hasGainerFailedBreakout:           true,
  hasGainerContinuationDanger:       false,
  hasGainerRsiRollover:              true,
  hasGainerTrendRollover:            false,
  hasGainerVolumeFade:               true,
  topGainerThesisLaneLabel:          "TOP_GAINER_FAILED_BREAKOUT_SHORT",
  topGainerPumpPhaseLabel:           "GAINER_PUMP_ROLLOVER_STARTING",
  topGainerContinuationPressureLabel: "GAINER_CONTINUATION_LOW",
  topGainerVwapContextLabel:         "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION",
  topGainerVolumeFlowContextLabel:   "GAINER_FLOW_DISTRIBUTION",
  topGainerQualityWarningLabels:     [],
};

function s(overrides = {}) { return { ...baseLoser, ...overrides }; }
function g(overrides = {}) { return { ...baseGainer, ...overrides }; }

// ═══════════════════════════════════════════════════════════════════════════════
// V3 TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── V3 Safety contract ───────────────────────────────────────────────────────

describe("V3 — Safety contract", () => {
  it("throws when logOnly is false", () => {
    expect(() => computeAbsoluteEntryScoreV3(baseLoser, { logOnly: false })).toThrow();
  });

  it("throws when allowExecutionImpact is true", () => {
    expect(() => computeAbsoluteEntryScoreV3(baseLoser, { allowExecutionImpact: true })).toThrow();
  });

  it("always outputs absoluteEntryIsLogOnly: true", () => {
    const r = computeAbsoluteEntryScoreV3(baseLoser);
    expect(r.absoluteEntryIsLogOnly).toBe(true);
  });

  it("always outputs absoluteEntryCanAffectExecution: false", () => {
    const r = computeAbsoluteEntryScoreV3(baseLoser);
    expect(r.absoluteEntryCanAffectExecution).toBe(false);
  });

  it("always outputs absoluteEntryAction: LOG_ONLY_OBSERVE", () => {
    const r = computeAbsoluteEntryScoreV3(baseLoser);
    expect(r.absoluteEntryAction).toBe("LOG_ONLY_OBSERVE");
  });

  it("recommendedMaxOpenMode is null", () => {
    expect(computeAbsoluteEntryScoreV3(baseLoser).recommendedMaxOpenMode).toBeNull();
  });

  it("recommendedLeverageMode is null", () => {
    expect(computeAbsoluteEntryScoreV3(baseLoser).recommendedLeverageMode).toBeNull();
  });

  it("recommendedExitBias is null", () => {
    expect(computeAbsoluteEntryScoreV3(baseLoser).recommendedExitBias).toBeNull();
  });

  it("initialExitBias is null", () => {
    expect(computeAbsoluteEntryScoreV3(baseLoser).initialExitBias).toBeNull();
  });
});

// ─── V3 Neutral baseline ─────────────────────────────────────────────────────

describe("V3 — Neutral baseline", () => {
  it("empty sample scores near 50 (neutral, not 0)", () => {
    const r = computeAbsoluteEntryScoreV3({});
    expect(r.absoluteEntryScore).toBeGreaterThanOrEqual(35);
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(65);
  });

  it("score is always in [0, 100]", () => {
    for (const sample of [baseLoser, baseGainer, {}, { isInvalidMarket: true }]) {
      const r = computeAbsoluteEntryScoreV3(sample);
      expect(r.absoluteEntryScore).toBeGreaterThanOrEqual(0);
      expect(r.absoluteEntryScore).toBeLessThanOrEqual(100);
    }
  });

  it("score is deterministic for identical input", () => {
    const r1 = computeAbsoluteEntryScoreV3(baseLoser);
    const r2 = computeAbsoluteEntryScoreV3(baseLoser);
    expect(r1.absoluteEntryScore).toBe(r2.absoluteEntryScore);
  });
});

// ─── V3 Hindsight leakage test ────────────────────────────────────────────────

describe("V3 — Hindsight leakage: closing fields must not affect score", () => {
  it("adding finalPnlPct does not change score", () => {
    const base = computeAbsoluteEntryScoreV3(baseLoser);
    const withPnl = computeAbsoluteEntryScoreV3({ ...baseLoser, finalPnlPct: 15.5 });
    expect(withPnl.absoluteEntryScore).toBe(base.absoluteEntryScore);
  });

  it("adding feeAdjustedFinalPnlPct does not change score", () => {
    const base = computeAbsoluteEntryScoreV3(baseLoser);
    const withFee = computeAbsoluteEntryScoreV3({ ...baseLoser, feeAdjustedFinalPnlPct: 12.0 });
    expect(withFee.absoluteEntryScore).toBe(base.absoluteEntryScore);
  });

  it("adding closeReason does not change score", () => {
    const base = computeAbsoluteEntryScoreV3(baseLoser);
    const withClose = computeAbsoluteEntryScoreV3({ ...baseLoser, closeReason: "SL" });
    expect(withClose.absoluteEntryScore).toBe(base.absoluteEntryScore);
  });

  it("adding mfe/mae does not change score", () => {
    const base = computeAbsoluteEntryScoreV3(baseLoser);
    const withMfe = computeAbsoluteEntryScoreV3({ ...baseLoser, mfe: 25, mae: -8 });
    expect(withMfe.absoluteEntryScore).toBe(base.absoluteEntryScore);
  });

  it("adding bestSimExitProfile does not change score", () => {
    const base = computeAbsoluteEntryScoreV3(baseLoser);
    const withExit = computeAbsoluteEntryScoreV3({ ...baseLoser, bestSimExitProfile: "FAST_LOCK" });
    expect(withExit.absoluteEntryScore).toBe(base.absoluteEntryScore);
  });
});

// ─── V3 Research block ────────────────────────────────────────────────────────

describe("V3 — Research block caps score at 24", () => {
  it("isInvalidMarket caps score at 24", () => {
    const r = computeAbsoluteEntryScoreV3({ ...baseLoser, isInvalidMarket: true });
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(24);
    expect(r.absoluteEntryResearchBlockReasons).toContain("INVALID_MARKET");
    expect(r.absoluteEntryEligibility).toBe("RESEARCH_BLOCK");
  });

  it("isStale caps score at 24", () => {
    const r = computeAbsoluteEntryScoreV3({ ...baseLoser, isStale: true });
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(24);
    expect(r.absoluteEntryResearchBlockReasons).toContain("STALE_ENTRY_TELEMETRY");
  });

  it("research blocked trade retains absoluteEntryQualityScoreUncapped", () => {
    const r = computeAbsoluteEntryScoreV3({ ...baseLoser, isInvalidMarket: true });
    expect(typeof r.absoluteEntryQualityScoreUncapped).toBe("number");
    expect(r.absoluteEntryQualityScoreUncapped).toBeGreaterThanOrEqual(r.absoluteEntryScore);
  });

  it("entryTimingGrade F is a research block", () => {
    const r = computeAbsoluteEntryScoreV3({ ...baseLoser, entryTimingGrade: "F" });
    expect(r.absoluteEntryResearchBlockReasons).toContain("ENTRY_TIMING_GRADE_F");
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(24);
  });

  it("GREEN_PRESSURE_WITH_RSI_ROLLOVER is a research block", () => {
    const r = computeAbsoluteEntryScoreV3({
      ...baseLoser,
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
      hasRsiRollover: true,
    });
    expect(r.absoluteEntryResearchBlockReasons).toContain("GREEN_PRESSURE_WITH_RSI_ROLLOVER");
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(24);
  });
});

// ─── V3 Scoring behaviors ─────────────────────────────────────────────────────

describe("V3 — Scoring: CVD BULL alone is NOT a research block", () => {
  it("CVD BULL alone does not research-block", () => {
    const r = computeAbsoluteEntryScoreV3({ ...baseLoser, cvdLabel: "BULL" });
    expect(r.absoluteEntryResearchBlockReasons).not.toContain("CVD_BULL");
  });

  it("CVD BULL + active green IS a research block", () => {
    const r = computeAbsoluteEntryScoreV3({
      ...baseLoser,
      cvdLabel: "BULL",
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
    });
    expect(r.absoluteEntryResearchBlockReasons).toContain("ACTIVE_GREEN_AND_CVD_BULL");
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(24);
  });
});

// Moderate loser fixture — scores mid-range so comparison tests don't clamp at 100
const moderateLoser = {
  shortParentBucket:   "TOP_LOSER_SHORTS",
  leaderboardSide:     "LOSERS",
  entryTimingGrade:    "C",
  candleColorAtEntry:  "RED",
  immediateRedImpulse: false,
  immediateGreenImpulse: false,
  redImpulseDetected:  false,
  greenImpulseDetected: false,
  hasRedConfirmation:  true,
  hasRsiRollover:      false,
  last3TicksDirection: "MIXED",
  cvdLabel:            "NEUT",
  atrPct:              0.5,
  spreadPct:           0.05,
  entryRank:           20,
  entryRankInBucket:   20,
  priceVsVwapLabel:    "AT_VWAP",
  btcRegime:           "BTC_CHOP",
  shortGateWouldPass:  false,
  isBlindWeaknessShort: false,
  isBtcBounceTrapRisk: false,
  isCorpseChaseRisk:   false,
  isInvalidMarket:     false,
  isStale:             false,
};

describe("V3 — Scoring: Green candle is a penalty, not a research block", () => {
  it("GREEN candle alone does not research-block", () => {
    const r = computeAbsoluteEntryScoreV3({ ...moderateLoser, candleColorAtEntry: "GREEN" });
    expect(r.absoluteEntryResearchBlockReasons).toHaveLength(0);
    expect(r.absoluteEntryEligibility).not.toBe("RESEARCH_BLOCK");
  });

  it("GREEN candle lowers score compared to RED candle", () => {
    const red = computeAbsoluteEntryScoreV3({ ...moderateLoser, candleColorAtEntry: "RED" });
    const green = computeAbsoluteEntryScoreV3({ ...moderateLoser, candleColorAtEntry: "GREEN" });
    expect(red.absoluteEntryScore).toBeGreaterThan(green.absoluteEntryScore);
  });
});

describe("V3 — Scoring: microBouncePct boost requires red resumption", () => {
  it("microBouncePct > 0.8 boosts score when red confirmation + no green", () => {
    const withBounce = computeAbsoluteEntryScoreV3({
      ...moderateLoser,
      microBouncePct: 1.0,
      hasRedConfirmation: true,
      immediateGreenImpulse: false,
      greenImpulseDetected: false,
    });
    const noBounce = computeAbsoluteEntryScoreV3({
      ...moderateLoser,
      microBouncePct: 0.1,
    });
    expect(withBounce.absoluteEntryScore).toBeGreaterThan(noBounce.absoluteEntryScore);
  });

  it("microBouncePct > 0.8 does NOT boost when active green present", () => {
    const withGreen = computeAbsoluteEntryScoreV3({
      ...moderateLoser,
      microBouncePct: 1.2,
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
    });
    const noGreen = computeAbsoluteEntryScoreV3({
      ...moderateLoser,
      microBouncePct: 1.2,
      immediateGreenImpulse: false,
      greenImpulseDetected: false,
    });
    expect(noGreen.absoluteEntryScore).toBeGreaterThan(withGreen.absoluteEntryScore);
  });
});

describe("V3 — Scoring: MICRO_TICKS_DOWN gainer vs loser behavior", () => {
  it("MICRO_TICKS_DOWN penalizes unconfirmed GAINER", () => {
    const withMicro = computeAbsoluteEntryScoreV3({
      ...baseGainer,
      microMomentumLabel: "MICRO_TICKS_DOWN",
      hasRedConfirmation: false,
      hasRsiRollover: false,
      hasGainerRsiRollover: false,
    });
    const noMicro = computeAbsoluteEntryScoreV3({
      ...baseGainer,
      microMomentumLabel: null,
      hasRedConfirmation: false,
      hasRsiRollover: false,
    });
    expect(withMicro.absoluteEntryMovementMaturityScore).toBeLessThan(noMicro.absoluteEntryMovementMaturityScore);
  });

  it("MICRO_TICKS_DOWN does not universally block LOSER", () => {
    const loserMicro = computeAbsoluteEntryScoreV3({
      ...baseLoser,
      microMomentumLabel: "MICRO_TICKS_DOWN",
    });
    expect(loserMicro.absoluteEntryResearchBlockReasons).toHaveLength(0);
  });
});

describe("V3 — Scoring: ATR continuous bands", () => {
  it("ATR < 0.2 scores negatively", () => {
    const r = computeAbsoluteEntryScoreV3({ ...baseLoser, atrPct: 0.15 });
    expect(r.absoluteEntryVolatilityScore).toBeLessThan(0);
  });

  it("ATR in 1.0-1.5 range scores highest", () => {
    const r1_0 = computeAbsoluteEntryScoreV3({ ...baseLoser, atrPct: 1.0 });
    const r0_4 = computeAbsoluteEntryScoreV3({ ...baseLoser, atrPct: 0.4 });
    expect(r1_0.absoluteEntryVolatilityScore).toBeGreaterThan(r0_4.absoluteEntryVolatilityScore);
  });

  it("ATR > 2.0 emits HIGH_ATR_VARIANCE warning", () => {
    const r = computeAbsoluteEntryScoreV3({ ...baseLoser, atrPct: 2.5 });
    expect(r.absoluteEntryWarnings).toContain("HIGH_ATR_VARIANCE");
  });
});

describe("V3 — Scoring: CVD BEAR > NEUT > BULL for flow momentum", () => {
  it("CVD BEAR scores higher flow momentum than NEUT", () => {
    const bear = computeAbsoluteEntryScoreV3({ ...moderateLoser, cvdLabel: "BEAR" });
    const neut = computeAbsoluteEntryScoreV3({ ...moderateLoser, cvdLabel: "NEUT" });
    expect(bear.absoluteEntryFlowMomentumScore).toBeGreaterThan(neut.absoluteEntryFlowMomentumScore);
  });

  it("CVD BEAR scores higher total than NEUT (moderate fixture avoids 100-clamp)", () => {
    const bear = computeAbsoluteEntryScoreV3({ ...moderateLoser, cvdLabel: "BEAR" });
    const neut = computeAbsoluteEntryScoreV3({ ...moderateLoser, cvdLabel: "NEUT" });
    expect(bear.absoluteEntryScore).toBeGreaterThan(neut.absoluteEntryScore);
  });
});

// Moderate gainer fixture to avoid 100-clamp in comparison tests
const moderateGainer = {
  shortParentBucket:   "TOP_GAINER_SHORTS",
  leaderboardSide:     "GAINERS",
  entryTimingGrade:    "C",
  candleColorAtEntry:  "RED",
  immediateRedImpulse: false,
  immediateGreenImpulse: false,
  redImpulseDetected:  false,
  greenImpulseDetected: false,
  hasRedConfirmation:  true,
  hasRsiRollover:      false,
  cvdLabel:            "NEUT",
  atrPct:              0.5,
  spreadPct:           0.04,
  entryRank:           15,
  entryRankInBucket:   15,
  priceVsVwapLabel:    "BELOW_VWAP",
  btcRegime:           "BTC_CHOP",
  shortGateWouldPass:  false,
  isInvalidMarket:     false,
  isStale:             false,
  topGainerExhaustionQualityScore: 75,
  topGainerWouldPassExhaustionAudit: false,
  hasGainerExhaustionConfirmation:  false,
  hasGainerRedRejection:  true,
  hasGainerFailedBreakout: false,
  hasGainerContinuationDanger: false,
  topGainerContinuationPressureLabel: "GAINER_CONTINUATION_LOW",
  topGainerPumpPhaseLabel: "GAINER_PUMP_ROLLOVER_STARTING",
  topGainerThesisLaneLabel: "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT",
  topGainerQualityWarningLabels: [],
};

describe("V3 — Scoring: broad gainer continuation danger is small penalty, not hard block", () => {
  it("broad continuation danger penalizes but does not research-block", () => {
    const withDanger = computeAbsoluteEntryScoreV3({ ...moderateGainer, hasGainerContinuationDanger: true });
    const noDanger = computeAbsoluteEntryScoreV3({ ...moderateGainer, hasGainerContinuationDanger: false });
    expect(withDanger.absoluteEntryScore).toBeLessThan(noDanger.absoluteEntryScore);
    expect(withDanger.absoluteEntryResearchBlockReasons).not.toContain("GAINER_CONTINUATION_DANGER");
  });
});

describe("V3 — Scoring: pump-still-hot + continuation-extreme is research block", () => {
  it("PUMP_STILL_HOT + CONTINUATION_EXTREME research-blocks", () => {
    const r = computeAbsoluteEntryScoreV3({
      ...baseGainer,
      topGainerPumpPhaseLabel: "GAINER_PUMP_STILL_HOT",
      topGainerContinuationPressureLabel: "GAINER_CONTINUATION_EXTREME",
    });
    expect(r.absoluteEntryResearchBlockReasons).toContain("GAINER_PUMP_HOT_CONTINUATION_EXTREME");
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(24);
  });
});

describe("V3 — Scoring: UTC hour has no effect", () => {
  it("adding utcHour field does not change score", () => {
    const base = computeAbsoluteEntryScoreV3(baseLoser);
    const withHour = computeAbsoluteEntryScoreV3({ ...baseLoser, utcHour: 14 });
    expect(withHour.absoluteEntryScore).toBe(base.absoluteEntryScore);
  });
});

describe("V3 — Scoring: correlated red fields use strongest state", () => {
  it("adding extra red fields on top of immediateRedImpulse does not keep doubling score", () => {
    const single = computeAbsoluteEntryScoreV3({
      ...baseLoser,
      immediateRedImpulse: true,
      redImpulseDetected: false,
      hasRedConfirmation: false,
    });
    const all = computeAbsoluteEntryScoreV3({
      ...baseLoser,
      immediateRedImpulse: true,
      redImpulseDetected: true,
      hasRedConfirmation: true,
    });
    // Both pick "strongest" red — direction score should be same or all slightly higher via other families
    expect(all.absoluteEntryDirectionScore).toBe(single.absoluteEntryDirectionScore);
  });
});

describe("V3 — Spread: wide spread emits warning", () => {
  it("spread > 0.08 emits WIDE_SPREAD warning", () => {
    const r = computeAbsoluteEntryScoreV3({ ...baseLoser, spreadPct: 0.09 });
    expect(r.absoluteEntryWarnings).toContain("WIDE_SPREAD");
  });

  it("tight spread gives better execution score than wide spread", () => {
    const tight = computeAbsoluteEntryScoreV3({ ...baseLoser, spreadPct: 0.02 });
    const wide = computeAbsoluteEntryScoreV3({ ...baseLoser, spreadPct: 0.07 });
    expect(tight.absoluteEntryExecutionScore).toBeGreaterThan(wide.absoluteEntryExecutionScore);
  });
});

// ─── V3 Preview pipeline ─────────────────────────────────────────────────────

describe("V3 — Preview pipeline: never returns null", () => {
  it("buildAbsoluteEntryPreviewSnapshot with empty kl returns valid snapshot", () => {
    const snap = buildAbsoluteEntryPreviewSnapshot({ kl: {}, ticker: {}, rankIndex: 0, side: "LOSERS" });
    expect(snap).not.toBeNull();
    expect(snap.shortParentBucket).toBe("TOP_LOSER_SHORTS");
    expect(snap.previewMode).toBe(true);
  });

  it("buildAbsoluteEntryPreviewSnapshot with missing cvdLabel still works", () => {
    const snap = buildAbsoluteEntryPreviewSnapshot({ kl: { atrPct: 0.8 }, ticker: {}, rankIndex: 2, side: "GAINERS" });
    expect(snap).not.toBeNull();
    expect(snap.cvdLabel).toBe("UNKNOWN");
  });

  it("scoring a preview snapshot always returns a numeric score", () => {
    const snap = buildAbsoluteEntryPreviewSnapshot({ kl: {}, ticker: {}, rankIndex: 0, side: "LOSERS" });
    const r = computeAbsoluteEntryScoreV3(snap);
    expect(typeof r.absoluteEntryScore).toBe("number");
    expect(r.absoluteEntryScore).toBeGreaterThanOrEqual(0);
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(100);
  });

  it("preview confidence is always <= 45", () => {
    const snap = buildAbsoluteEntryPreviewSnapshot({ kl: { ...baseLoser }, ticker: {}, rankIndex: 0, side: "LOSERS" });
    const r = computeAbsoluteEntryScoreV3(snap);
    expect(r.absoluteEntryConfidence).toBeLessThanOrEqual(45);
  });

  it("preview source is LIVE_PREVIEW", () => {
    const snap = buildAbsoluteEntryPreviewSnapshot({ kl: {}, ticker: {}, rankIndex: 0, side: "LOSERS" });
    const r = computeAbsoluteEntryScoreV3(snap);
    expect(r.absoluteEntryScoreSource).toBe("LIVE_PREVIEW");
  });

  it("missing boolean telemetry stays null (not false) in preview snapshot", () => {
    const snap = buildAbsoluteEntryPreviewSnapshot({ kl: {}, ticker: {}, rankIndex: 0, side: "LOSERS" });
    // Should be null (unknown), not false (confirmed absent)
    expect(snap.immediateRedImpulse).toBeNull();
    expect(snap.immediateGreenImpulse).toBeNull();
    expect(snap.redImpulseDetected).toBeNull();
    expect(snap.greenImpulseDetected).toBeNull();
  });
});

// ─── V3 Preview eligibility markers ──────────────────────────────────────────

describe("V3 — Preview eligibility markers", () => {
  it("RESEARCH_BLOCK preview shows eligibility RESEARCH_BLOCK", () => {
    const snap = buildAbsoluteEntryPreviewSnapshot({
      kl: { ...baseLoser, isInvalidMarket: true },
      ticker: {},
      rankIndex: 0,
      side: "LOSERS",
    });
    const r = computeAbsoluteEntryScoreV3(snap);
    expect(r.absoluteEntryEligibility).toBe("RESEARCH_BLOCK");
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(24);
  });
});

// ─── V3 Confidence ───────────────────────────────────────────────────────────

describe("V3 — Confidence: missing fields reduce confidence", () => {
  it("full baseLoser has higher confidence than empty sample", () => {
    const full = computeAbsoluteEntryScoreV3(baseLoser);
    const empty = computeAbsoluteEntryScoreV3({});
    expect(full.absoluteEntryConfidence).toBeGreaterThan(empty.absoluteEntryConfidence);
  });

  it("missing fields do not crash scoring", () => {
    expect(() => computeAbsoluteEntryScoreV3({ shortParentBucket: "TOP_LOSER_SHORTS" })).not.toThrow();
  });
});

// ─── V3 Tiers ────────────────────────────────────────────────────────────────

describe("V3 — Tier classification", () => {
  it("0-24 → AES_RESEARCH_BLOCKED", () => {
    expect(classifyAesTier(0)).toBe("AES_RESEARCH_BLOCKED");
    expect(classifyAesTier(24)).toBe("AES_RESEARCH_BLOCKED");
  });
  it("25-39 → AES_LOW", () => {
    expect(classifyAesTier(25)).toBe("AES_LOW");
    expect(classifyAesTier(39)).toBe("AES_LOW");
  });
  it("40-54 → AES_NEUTRAL", () => {
    expect(classifyAesTier(40)).toBe("AES_NEUTRAL");
    expect(classifyAesTier(54)).toBe("AES_NEUTRAL");
  });
  it("55-69 → AES_PROMISING", () => {
    expect(classifyAesTier(55)).toBe("AES_PROMISING");
  });
  it("70-79 → AES_HIGH_QUALITY_RESEARCH", () => {
    expect(classifyAesTier(70)).toBe("AES_HIGH_QUALITY_RESEARCH");
  });
  it("80-89 → AES_SNIPER_RESEARCH", () => {
    expect(classifyAesTier(80)).toBe("AES_SNIPER_RESEARCH");
  });
  it("90-100 → AES_ELITE_RESEARCH", () => {
    expect(classifyAesTier(90)).toBe("AES_ELITE_RESEARCH");
    expect(classifyAesTier(100)).toBe("AES_ELITE_RESEARCH");
  });
});

// ─── V3 CSV ───────────────────────────────────────────────────────────────────

describe("V3 — CSV helpers", () => {
  it("headers contain V3-specific fields", () => {
    expect(ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS).toContain("absoluteEntryScore");
    expect(ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS).toContain("absoluteEntryTier");
    expect(ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS).toContain("absoluteEntryDirectionScore");
    expect(ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS).toContain("absoluteEntryRiskPenaltyScore");
    expect(ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS).toContain("legacyAbsoluteEntryScoreV2");
  });

  it("row length matches header length", () => {
    const flat = flattenAbsoluteEntryScoreV3(computeAbsoluteEntryScoreV3(baseLoser));
    const row = absoluteEntryScoreV3CSVRow(flat);
    expect(row.length).toBe(ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS.length);
  });

  it("empty row when score is null", () => {
    const row = absoluteEntryScoreV3CSVRow({});
    expect(row.length).toBe(ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS.length);
    expect(row.every(v => v === "")).toBe(true);
  });
});

// ─── Facade backward compatibility ────────────────────────────────────────────

describe("Facade — backward compatibility", () => {
  it("computeAbsoluteEntryScore via facade returns a score in [0,100]", () => {
    const r = computeAbsoluteEntryScore(baseLoser);
    expect(typeof r.absoluteEntryScore).toBe("number");
    expect(r.absoluteEntryScore).toBeGreaterThanOrEqual(0);
    expect(r.absoluteEntryScore).toBeLessThanOrEqual(100);
  });

  it("flattenAbsoluteEntryScore via facade returns absoluteEntryScore", () => {
    const r = computeAbsoluteEntryScore(baseLoser);
    const flat = flattenAbsoluteEntryScore(r);
    expect(flat.absoluteEntryScore).toBe(r.absoluteEntryScore);
    expect(flat.absoluteEntryScoreResult).toBe(r);
  });

  it("absoluteEntryHardBlocks is always empty array in V3", () => {
    const r = computeAbsoluteEntryScore(baseLoser);
    expect(Array.isArray(r.absoluteEntryHardBlocks)).toBe(true);
    expect(r.absoluteEntryHardBlocks).toHaveLength(0);
  });

  it("facade CSV row length matches facade headers", () => {
    const flat = flattenAbsoluteEntryScore(computeAbsoluteEntryScore(baseLoser));
    const row = absoluteEntryScoreCSVRow(flat);
    expect(row.length).toBe(ABSOLUTE_ENTRY_SCORE_CSV_HEADERS.length);
  });

  it("classifySniperLabels compat shim returns expected shape", () => {
    const labels = classifySniperLabels(baseLoser, computeAbsoluteEntryScore(baseLoser));
    expect(labels.sniperLabel).toBeNull();
    expect(labels.isSniperCandidate).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V2 REGRESSION TESTS (imported directly from legacy file)
// ═══════════════════════════════════════════════════════════════════════════════

const loserSniperSample = { ...baseLoser, cvdLabel: "NEUT", macdHistogramState1m: undefined, rsi1mSlope: undefined, rsi3mSlope: undefined };
const weakLoserBase = {
  shortParentBucket:   "TOP_LOSER_SHORTS",
  leaderboardSide:     "LOSERS",
  entryTimingGrade:    "B",
  candleColorAtEntry:  "RED",
  immediateRedImpulse: false,
  immediateGreenImpulse: false,
  redImpulseDetected:  false,
  greenImpulseDetected: false,
  hasRedConfirmation:  true,
  hasRsiRollover:      false,
  last3TicksDirection: "DOWN",
  last5TicksDirection: "MIXED",
  atrPct:              0.65,
  spreadPct:           0.04,
  entryRank:           18,
  entryRankInBucket:   18,
  priceVsVwapLabel:    "AT_VWAP",
  btcRegime:           "BTC_CHOP",
  btcShortContextLabel: "BTC_CHOP_OK",
  shortGateWouldPass:  false,
  microMomentumLabel:  "MICRO_TICKS_DOWN",
  isBlindWeaknessShort: false,
  isBtcBounceTrapRisk: false,
  isCorpseChaseRisk:   false,
  isInvalidMarket:     false,
  isStale:             false,
};

describe("V2 regression — A: Universal gate pass", () => {
  it("passes with red confirmation, no green, ATR >= 0.6, CVD NEUT, spread <= 0.05", () => {
    const sample = { ...baseLoser, cvdLabel: "NEUT", spreadPct: 0.04 };
    const result = computeV2(sample);
    expect(result.isUniversalShortGatePass).toBe(true);
    expect(result.absoluteEntryScore).toBeGreaterThanOrEqual(75);
    expect(result.absoluteEntryHardBlocks).toHaveLength(0);
  });
});

describe("V2 regression — B: Loser sniper LOSER_SNIPER_CLEAN_RED_DUMP", () => {
  it("assigns loser sniper label when conditions met", () => {
    const result = computeV2(loserSniperSample);
    expect(result.loserSniperLabel).toBe("LOSER_SNIPER_CLEAN_RED_DUMP");
    expect(result.isSniperCandidate).toBe(true);
    expect(result.absoluteEntryScore).toBeGreaterThanOrEqual(85);
  });

  it("does not assign when CVD BULL (hard block)", () => {
    const result = computeV2({ ...baseLoser, cvdLabel: "BULL" });
    expect(result.loserSniperLabel).toBeNull();
    expect(result.absoluteEntryScore).toBeLessThanOrEqual(49);
  });

  it("does not assign when spread > 0.05", () => {
    expect(computeV2({ ...baseLoser, spreadPct: 0.06 }).loserSniperLabel).toBeNull();
  });

  it("does not assign when blind weakness", () => {
    expect(computeV2({ ...baseLoser, isBlindWeaknessShort: true }).loserSniperLabel).toBeNull();
  });
});

describe("V2 regression — C: Loser super sniper LOSER_SUPER_SNIPER_BEAR_CVD_ATR", () => {
  it("assigns super sniper with BEAR, ATR >= 1.0, MACD NEGATIVE_EXPANDING", () => {
    const r = computeV2({ ...baseLoser, cvdLabel: "BEAR", atrPct: 1.2, macdHistogramState1m: "NEGATIVE_EXPANDING" });
    expect(r.loserSniperLabel).toBe("LOSER_SUPER_SNIPER_BEAR_CVD_ATR");
    expect(r.isSuperSniperCandidate).toBe(true);
  });
  it("assigns with RSI rollover instead of MACD", () => {
    const r = computeV2({ ...baseLoser, cvdLabel: "BEAR", atrPct: 1.0, macdHistogramState1m: undefined, hasRsiRollover: true });
    expect(r.loserSniperLabel).toBe("LOSER_SUPER_SNIPER_BEAR_CVD_ATR");
  });
});

describe("V2 regression — D: Gainer sniper GAINER_SNIPER_CONFIRMED_EXHAUSTION_BREAKDOWN", () => {
  const gainerSniperSample = g({ hasGainerFailedBreakout: false, topGainerThesisLaneLabel: "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT" });
  it("assigns gainer sniper when conditions met", () => {
    const r = computeV2(gainerSniperSample);
    expect(r.gainerSniperLabel).toBe("GAINER_SNIPER_CONFIRMED_EXHAUSTION_BREAKDOWN");
    expect(r.isSniperCandidate).toBe(true);
  });
  it("does not assign when continuation danger", () => {
    expect(computeV2(g({ hasGainerContinuationDanger: true })).gainerSniperLabel).toBeNull();
  });
});

describe("V2 regression — E: Gainer super sniper", () => {
  it("assigns super sniper with failed breakout, score >= 90", () => {
    const r = computeV2(g({ hasGainerFailedBreakout: true, topGainerThesisLaneLabel: "TOP_GAINER_FAILED_BREAKOUT_SHORT", topGainerPumpPhaseLabel: "GAINER_PUMP_ROLLOVER_STARTING" }));
    expect(r.gainerSniperLabel).toBe("GAINER_SUPER_SNIPER_FAILED_BREAKOUT_EXHAUSTION");
  });
});

describe("V2 regression — F: Hard blocks", () => {
  it("immediateGreenImpulse hard blocks", () => {
    const r = computeV2({ ...baseLoser, immediateGreenImpulse: true });
    expect(r.absoluteEntryHardBlocks).toContain("IMMEDIATE_GREEN_IMPULSE");
    expect(r.absoluteEntryTier).toBe("BLOCKED");
  });
  it("CVD BULL hard blocks", () => {
    expect(computeV2({ ...baseLoser, cvdLabel: "BULL" }).absoluteEntryHardBlocks).toContain("CVD_BULL");
  });
  it("isBlindWeaknessShort hard blocks", () => {
    expect(computeV2({ ...baseLoser, isBlindWeaknessShort: true }).absoluteEntryHardBlocks).toContain("BLIND_WEAKNESS_SHORT");
  });
  it("entryTimingGrade F hard blocks", () => {
    expect(computeV2({ ...baseLoser, entryTimingGrade: "F" }).absoluteEntryHardBlocks).toContain("ENTRY_GRADE_F");
  });
  it("SPREAD_GT_0_08 hard blocks", () => {
    const r = computeV2({ ...baseLoser, spreadPct: 0.09 });
    expect(r.absoluteEntryHardBlocks).toContain("SPREAD_GT_0_08");
    expect(r.absoluteEntryTier).toBe("BLOCKED");
  });
});

describe("V2 regression — G: CVD BEAR > NEUT", () => {
  it("BEAR loser quality score > NEUT", () => {
    const bear = computeV2({ ...weakLoserBase, cvdLabel: "BEAR" });
    const neut = computeV2({ ...weakLoserBase, cvdLabel: "NEUT" });
    expect(bear.loserQualityScore).toBeGreaterThan(neut.loserQualityScore);
  });
});

describe("V2 regression — H: Spread penalty tiers", () => {
  it("spread <= 0.03 gives higher execution score than 0.04-0.05", () => {
    const tight = computeV2({ ...weakLoserBase, cvdLabel: "BEAR", spreadPct: 0.02 });
    const normal = computeV2({ ...weakLoserBase, cvdLabel: "BEAR", spreadPct: 0.04 });
    expect(tight.executionQualityScore).toBeGreaterThan(normal.executionQualityScore);
  });
});

describe("V2 regression — classifyAbsoluteEntryTier (V2 behavior)", () => {
  it("BLOCKED when hardBlocks non-empty", () => {
    expect(classifyTierV2(95, ["CVD_BULL"])).toBe("BLOCKED");
  });
  it("GOD_TIER_SNIPER at 95+", () => {
    expect(classifyTierV2(95, [])).toBe("GOD_TIER_SNIPER");
  });
  it("REJECT below 50", () => {
    expect(classifyTierV2(49, [])).toBe("REJECT");
  });
});

describe("V2 regression — CSV helpers", () => {
  it("V2 CSV row length matches V2 headers", () => {
    const flat = flattenV2(computeV2(baseLoser));
    const row = csvRowV2(flat);
    expect(row.length).toBe(csvHeadersV2.length);
  });
  it("V2 CSV headers contain sniperLabel and recommendedExitBias", () => {
    expect(csvHeadersV2).toContain("sniperLabel");
    expect(csvHeadersV2).toContain("recommendedExitBias");
  });
});

describe("V2 regression — Edge cases", () => {
  it("empty sample does not throw", () => {
    expect(() => computeV2({})).not.toThrow();
  });
  it("classifySniperLabels standalone matches score result", () => {
    const scoreResult = computeV2(baseLoser);
    const labels = classifySniperLabelsV2(baseLoser, scoreResult);
    expect(labels.sniperLabel).toBe(scoreResult.sniperLabel);
  });
});
