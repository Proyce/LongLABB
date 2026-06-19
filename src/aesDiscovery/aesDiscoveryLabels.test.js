import { describe, it, expect } from "vitest";
import {
  assignDiscoveryLabels, assignOutcomeLabels, classifyNConfidence,
  RANK_LABELS, SCORE_LABELS, GATE_LABELS, SNIPER_LABELS, CONFIDENCE_LABELS,
} from "./aesDiscoveryLabels.js";
import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";

const BASE = {
  side24hRank: 30,
  outsideTop25: true, outsideTop50: false, outsideTop100: false, outsideTop200: false,
  leaderboardSide: "LOSERS",
  aesFull: 75, aesNoRank: 72, aesSetupOnly: 68,
  telemetryCoveragePct: 85,
  snapshot: {
    immediateGreenImpulse: false, greenImpulseDetected: false,
    hasRedConfirmation: true, immediateRedImpulse: true, redImpulseDetected: true,
    atrPct: 0.7, cvdLabel: "BEAR", spreadPct: 0.03,
    candleColorAtEntry: "RED", macdHistogramState1m: "NEGATIVE_EXPANDING",
    last3TicksDirection: "DOWN",
  },
};

describe("assignDiscoveryLabels — rank labels", () => {
  it("rank 25 gets TOP_1_25", () => {
    const l = assignDiscoveryLabels({ ...BASE, side24hRank: 25, outsideTop25: false });
    expect(l).toContain(RANK_LABELS.AES_TOP_1_25);
    expect(l).not.toContain(RANK_LABELS.AES_OUTSIDE_TOP25);
  });

  it("rank 26 gets RANK_26_50 and OUTSIDE_TOP25", () => {
    const l = assignDiscoveryLabels({ ...BASE, side24hRank: 26, outsideTop25: true, outsideTop50: false });
    expect(l).toContain(RANK_LABELS.AES_RANK_26_50);
    expect(l).toContain(RANK_LABELS.AES_OUTSIDE_TOP25);
  });

  it("rank 50 gets RANK_26_50 but not OUTSIDE_TOP50", () => {
    const l = assignDiscoveryLabels({ ...BASE, side24hRank: 50, outsideTop25: true, outsideTop50: false });
    expect(l).toContain(RANK_LABELS.AES_RANK_26_50);
    expect(l).not.toContain(RANK_LABELS.AES_OUTSIDE_TOP50);
  });

  it("rank 51 gets RANK_51_100 and OUTSIDE_TOP50", () => {
    const l = assignDiscoveryLabels({ ...BASE, side24hRank: 51, outsideTop25: true, outsideTop50: true, outsideTop100: false });
    expect(l).toContain(RANK_LABELS.AES_RANK_51_100);
    expect(l).toContain(RANK_LABELS.AES_OUTSIDE_TOP50);
  });

  it("rank 201 gets RANK_201_PLUS", () => {
    const l = assignDiscoveryLabels({ ...BASE, side24hRank: 201, outsideTop25: true, outsideTop50: true, outsideTop100: true, outsideTop200: true });
    expect(l).toContain(RANK_LABELS.AES_RANK_201_PLUS);
    expect(l).toContain(RANK_LABELS.AES_OUTSIDE_TOP200);
  });
});

describe("assignDiscoveryLabels — score thresholds (boundary exact)", () => {
  it("aesFull 69.99 does NOT get HIGH_AES_70_PLUS", () => {
    const l = assignDiscoveryLabels({ ...BASE, aesFull: 69.99 });
    expect(l).not.toContain(SCORE_LABELS.HIGH_AES_70_PLUS);
  });

  it("aesFull 70 gets HIGH_AES_70_PLUS", () => {
    const l = assignDiscoveryLabels({ ...BASE, aesFull: 70 });
    expect(l).toContain(SCORE_LABELS.HIGH_AES_70_PLUS);
  });

  it("aesFull 79.99 does NOT get SNIPER_AES_80_PLUS", () => {
    const l = assignDiscoveryLabels({ ...BASE, aesFull: 79.99 });
    expect(l).not.toContain(SCORE_LABELS.SNIPER_AES_80_PLUS);
  });

  it("aesFull 80 gets SNIPER_AES_80_PLUS", () => {
    const l = assignDiscoveryLabels({ ...BASE, aesFull: 80 });
    expect(l).toContain(SCORE_LABELS.SNIPER_AES_80_PLUS);
  });

  it("aesFull 89.99 does NOT get ELITE_AES_90_PLUS", () => {
    const l = assignDiscoveryLabels({ ...BASE, aesFull: 89.99 });
    expect(l).not.toContain(SCORE_LABELS.ELITE_AES_90_PLUS);
  });

  it("aesFull 90 gets ELITE_AES_90_PLUS", () => {
    const l = assignDiscoveryLabels({ ...BASE, aesFull: 90 });
    expect(l).toContain(SCORE_LABELS.ELITE_AES_90_PLUS);
  });
});

describe("assignDiscoveryLabels — gate labels", () => {
  it("RAW_SHADOW requires outsideTop25 + high aes + coverage", () => {
    const l = assignDiscoveryLabels(BASE);
    expect(l).toContain(GATE_LABELS.HIGH_AES_RAW_SHADOW);
  });

  it("no RAW_SHADOW when inside top 25", () => {
    const l = assignDiscoveryLabels({ ...BASE, outsideTop25: false, side24hRank: 10 });
    expect(l).not.toContain(GATE_LABELS.HIGH_AES_RAW_SHADOW);
  });

  it("GOLD_CONFIRMED when long gate passes (green + CVD BULL + no red)", () => {
    const longSnap = {
      ...BASE.snapshot,
      immediateGreenImpulse: true, greenImpulseDetected: true,
      immediateRedImpulse: false, hasRedConfirmation: false, redImpulseDetected: false,
      cvdLabel: "BULL",
    };
    const l = assignDiscoveryLabels({ ...BASE, snapshot: longSnap });
    expect(l).toContain(GATE_LABELS.HIGH_AES_GOLD_CONFIRMED_SHADOW);
  });

  it("UNIVERSAL_GATE_FAIL when no green impulse (long candidate lacks continuation)", () => {
    // BASE has no green, CVD BEAR, has red → long gate fails
    const l = assignDiscoveryLabels(BASE);
    expect(l).toContain(GATE_LABELS.HIGH_AES_UNIVERSAL_GATE_FAIL);
    expect(l).not.toContain(GATE_LABELS.HIGH_AES_GOLD_CONFIRMED_SHADOW);
  });

  it("TELEMETRY_INCOMPLETE when coverage below threshold", () => {
    const l = assignDiscoveryLabels({ ...BASE, telemetryCoveragePct: 50 });
    expect(l).toContain(GATE_LABELS.HIGH_AES_TELEMETRY_INCOMPLETE);
  });
});

describe("assignDiscoveryLabels — sniper labels", () => {
  const longSnap = {
    immediateGreenImpulse: true, greenImpulseDetected: true,
    immediateRedImpulse: false, hasRedConfirmation: false, redImpulseDetected: false,
    atrPct: 0.7, cvdLabel: "BULL", spreadPct: 0.03,
    candleColorAtEntry: "GREEN", last3TicksDirection: "UP",
    macdHistogramState1m: "POSITIVE_EXPANDING", hasRsiRollover: false,
  };

  it("HIDDEN_AES_SNIPER_LONG requires outsideTop50, green, and CVD BULL", () => {
    // No outsideTop50 → no sniper
    const lNoTop50 = assignDiscoveryLabels({ ...BASE, outsideTop50: false, aesNoRank: 85, snapshot: longSnap });
    expect(lNoTop50).not.toContain(SNIPER_LABELS.HIDDEN_AES_SNIPER_LONG);

    // Has long conditions → sniper fires
    const lLong = assignDiscoveryLabels({ ...BASE, outsideTop50: true, aesNoRank: 85, side24hRank: 60, snapshot: longSnap });
    expect(lLong).toContain(SNIPER_LABELS.HIDDEN_AES_SNIPER_LONG);
  });

  it("SUPER_SNIPER requires atrPct >= 0.6 and spreadPct <= 0.05 and last3 UP (long continuation)", () => {
    const snap = { ...longSnap, atrPct: 0.7, spreadPct: 0.04, macdHistogramState1m: "POSITIVE_EXPANDING", last3TicksDirection: "UP" };
    const l = assignDiscoveryLabels({ ...BASE, outsideTop50: true, aesNoRank: 85, side24hRank: 60, snapshot: snap });
    expect(l).toContain(SNIPER_LABELS.HIDDEN_AES_SUPER_SNIPER_LONG);
  });
});

describe("classifyNConfidence", () => {
  it("n < 20 → INSUFFICIENT", ()   => expect(classifyNConfidence(10)).toBe(CONFIDENCE_LABELS.INSUFFICIENT_N_LT_20));
  it("n = 20 → EARLY", ()          => expect(classifyNConfidence(20)).toBe(CONFIDENCE_LABELS.EARLY_N_20_TO_49));
  it("n = 50 → DEVELOPING", ()     => expect(classifyNConfidence(50)).toBe(CONFIDENCE_LABELS.DEVELOPING_N_50_TO_99));
  it("n = 100 → USABLE", ()        => expect(classifyNConfidence(100)).toBe(CONFIDENCE_LABELS.USABLE_N_100_TO_299));
  it("n = 300 → STRONG", ()        => expect(classifyNConfidence(300)).toBe(CONFIDENCE_LABELS.STRONG_N_300_PLUS));
});

describe("assignOutcomeLabels", () => {
  it("positive normFeeAdjustedPnlPct → POST_FEE_WINNER", () => {
    const t = { normFeeAdjustedPnlPct: 1.5, closeReason: "TP", enteredTop50: false, mfe: 2, mae: 0 };
    const l = assignOutcomeLabels(t, AES_DISCOVERY_CONFIG);
    expect(l).toContain("POST_FEE_WINNER");
  });

  it("negative normFeeAdjustedPnlPct → POST_FEE_LOSER", () => {
    const t = { normFeeAdjustedPnlPct: -0.5, closeReason: "SL", enteredTop50: false, holdMsActual: 5 * 60_000 };
    const l = assignOutcomeLabels(t, AES_DISCOVERY_CONFIG);
    expect(l).toContain("POST_FEE_LOSER");
  });

  it("SL under 1m → INSTANT_SL_UNDER_1M", () => {
    const t = { normFeeAdjustedPnlPct: -0.5, closeReason: "SL", holdMsActual: 30_000, enteredTop50: false };
    const l = assignOutcomeLabels(t, AES_DISCOVERY_CONFIG);
    expect(l).toContain("INSTANT_SL_UNDER_1M");
  });

  it("!enteredTop50 → NEVER_ENTERED_TOP50", () => {
    const t = { normFeeAdjustedPnlPct: 1, closeReason: "TP", enteredTop50: false };
    const l = assignOutcomeLabels(t, AES_DISCOVERY_CONFIG);
    expect(l).toContain("NEVER_ENTERED_TOP50");
  });
});
