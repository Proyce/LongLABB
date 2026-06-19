import { describe, it, expect } from "vitest";
import {
  DEFAULT_SHADOW_LONG_FILTER_STATE,
  applyShadowLongFilters,
  buildShadowLongFilterOptions,
} from "./shadowLongFilters.js";

function makeAudit(overrides = {}) {
  return {
    id: `audit-${Math.random()}`,
    status: "COMPLETED",
    sourceShortDurationLabel: "SHORT_SL_WITHIN_60S",
    sourceShortDurationMs: 45_000,
    shadowLongAtrClass: "ATR_HIGH",
    shadowLongHypothesisEligible: true,
    atrPct: 0.8,
    aes: 75,
    outcomeLabel: "SHADOW_LONG_FULL_RESCUE_AND_PROFIT",
    mirrorCloseReason: "TP",
    diagnosticLabels: ["SHADOW_LONG_HIGH_AES"],
    btcDirection: "UP",
    btcRegime: "BULL",
    ethDirection: "UP",
    ethRegime: "BULL",
    cvdLabel: "CVD_BULLISH",
    last3TicksDirection: "UP",
    shadowLongFeeNetNormPnlPct: 1.5,
    combinedCompoundedMarginPnlPct: 2.0,
    shortLossRecoveryRatio: 1.5,
    fullyRecoveredShortLoss: true,
    partialRecovery: false,
    durationMs: 120_000,
    samplingPrecision: "REALTIME",
    dataWarnings: [],
    sourceShortParentBucket: "TOP_LOSER_SHORTS",
    ...overrides,
  };
}

describe("applyShadowLongFilters - default passes all", () => {
  it("empty filters pass all audits", () => {
    const audits = [makeAudit(), makeAudit()];
    const result = applyShadowLongFilters(audits, DEFAULT_SHADOW_LONG_FILTER_STATE);
    expect(result).toHaveLength(2);
  });
});

describe("applyShadowLongFilters - hypothesisEligibleOnly", () => {
  it("filters out non-eligible when flag set", () => {
    const audits = [
      makeAudit({ shadowLongHypothesisEligible: true }),
      makeAudit({ shadowLongHypothesisEligible: false }),
    ];
    const result = applyShadowLongFilters(audits, { ...DEFAULT_SHADOW_LONG_FILTER_STATE, hypothesisEligibleOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0].shadowLongHypothesisEligible).toBe(true);
  });
});

describe("applyShadowLongFilters - duration labels", () => {
  it("filters by selected duration label", () => {
    const audits = [
      makeAudit({ sourceShortDurationLabel: "SHORT_SL_WITHIN_15S" }),
      makeAudit({ sourceShortDurationLabel: "SHORT_SL_WITHIN_60S" }),
    ];
    const result = applyShadowLongFilters(audits, {
      ...DEFAULT_SHADOW_LONG_FILTER_STATE,
      selectedDurationLabels: ["SHORT_SL_WITHIN_15S"],
    });
    expect(result).toHaveLength(1);
    expect(result[0].sourceShortDurationLabel).toBe("SHORT_SL_WITHIN_15S");
  });
});

describe("applyShadowLongFilters - ATR filters", () => {
  it("min ATR filter works", () => {
    const audits = [
      makeAudit({ atrPct: 0.5 }),
      makeAudit({ atrPct: 0.9 }),
    ];
    const result = applyShadowLongFilters(audits, { ...DEFAULT_SHADOW_LONG_FILTER_STATE, minAtrPct: 0.6 });
    expect(result).toHaveLength(1);
    expect(result[0].atrPct).toBe(0.9);
  });

  it("max ATR filter works", () => {
    const audits = [makeAudit({ atrPct: 0.3 }), makeAudit({ atrPct: 0.9 })];
    const result = applyShadowLongFilters(audits, { ...DEFAULT_SHADOW_LONG_FILTER_STATE, maxAtrPct: 0.6 });
    expect(result).toHaveLength(1);
    expect(result[0].atrPct).toBe(0.3);
  });

  it("ATR class filter works", () => {
    const audits = [
      makeAudit({ shadowLongAtrClass: "ATR_HIGH" }),
      makeAudit({ shadowLongAtrClass: "ATR_LOW" }),
    ];
    const result = applyShadowLongFilters(audits, {
      ...DEFAULT_SHADOW_LONG_FILTER_STATE,
      selectedAtrClasses: ["ATR_HIGH"],
    });
    expect(result).toHaveLength(1);
  });
});

describe("applyShadowLongFilters - outcome filters", () => {
  it("outcome label filter works", () => {
    const audits = [
      makeAudit({ outcomeLabel: "SHADOW_LONG_FULL_RESCUE_AND_PROFIT" }),
      makeAudit({ outcomeLabel: "SHADOW_LONG_ADDED_TO_LOSS" }),
    ];
    const result = applyShadowLongFilters(audits, {
      ...DEFAULT_SHADOW_LONG_FILTER_STATE,
      selectedOutcomeLabels: ["SHADOW_LONG_FULL_RESCUE_AND_PROFIT"],
    });
    expect(result).toHaveLength(1);
  });
});

describe("applyShadowLongFilters - whipsaw", () => {
  it("whipsaw filter works", () => {
    const audits = [
      makeAudit({ sourceShortDurationMs: 30_000, mirrorCloseReason: "SL", durationMs: 25_000 }),
      makeAudit({ sourceShortDurationMs: 90_000, mirrorCloseReason: "TP", durationMs: 120_000 }),
    ];
    const result = applyShadowLongFilters(audits, {
      ...DEFAULT_SHADOW_LONG_FILTER_STATE,
      showOnlyWhipsaw: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].mirrorCloseReason).toBe("SL");
  });
});

describe("applyShadowLongFilters - combined winner", () => {
  it("combined winner filter works", () => {
    const audits = [
      makeAudit({ combinedCompoundedMarginPnlPct: 3.0 }),
      makeAudit({ combinedCompoundedMarginPnlPct: -2.0 }),
    ];
    const result = applyShadowLongFilters(audits, {
      ...DEFAULT_SHADOW_LONG_FILTER_STATE,
      showOnlyCombinedWinners: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].combinedCompoundedMarginPnlPct).toBeGreaterThan(0);
  });
});

describe("applyShadowLongFilters - BTC context", () => {
  it("BTC direction filter works", () => {
    const audits = [
      makeAudit({ btcDirection: "UP" }),
      makeAudit({ btcDirection: "DOWN" }),
    ];
    const result = applyShadowLongFilters(audits, {
      ...DEFAULT_SHADOW_LONG_FILTER_STATE,
      selectedBtcDirections: ["UP"],
    });
    expect(result).toHaveLength(1);
    expect(result[0].btcDirection).toBe("UP");
  });
});

describe("applyShadowLongFilters - reset", () => {
  it("reset to default restores all audits", () => {
    const audits = [makeAudit(), makeAudit()];
    const filtered = applyShadowLongFilters(audits, {
      ...DEFAULT_SHADOW_LONG_FILTER_STATE,
      showOnlyLongWinners: true,
    });
    const reset = applyShadowLongFilters(audits, DEFAULT_SHADOW_LONG_FILTER_STATE);
    expect(reset).toHaveLength(2);
  });
});

describe("buildShadowLongFilterOptions", () => {
  it("extracts unique outcome labels", () => {
    const audits = [
      makeAudit({ outcomeLabel: "SHADOW_LONG_FULL_RESCUE_AND_PROFIT" }),
      makeAudit({ outcomeLabel: "SHADOW_LONG_ADDED_TO_LOSS" }),
      makeAudit({ outcomeLabel: "SHADOW_LONG_FULL_RESCUE_AND_PROFIT" }),
    ];
    const opts = buildShadowLongFilterOptions(audits);
    expect(opts.outcomeLabels).toHaveLength(2);
  });

  it("extracts diagnostic labels from arrays", () => {
    const audits = [
      makeAudit({ diagnosticLabels: ["SHADOW_LONG_HIGH_AES", "SHADOW_LONG_BTC_UP_TAILWIND"] }),
      makeAudit({ diagnosticLabels: ["SHADOW_LONG_HIGH_AES"] }),
    ];
    const opts = buildShadowLongFilterOptions(audits);
    expect(opts.diagnosticLabels).toContain("SHADOW_LONG_HIGH_AES");
    expect(opts.diagnosticLabels).toContain("SHADOW_LONG_BTC_UP_TAILWIND");
  });
});
