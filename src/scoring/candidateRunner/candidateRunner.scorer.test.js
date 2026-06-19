import { describe, expect, it } from "vitest";
import {
  CANDIDATE_RUNNER_CANDIDATE_MIN,
  CANDIDATE_RUNNER_ELITE_MIN,
  CANDIDATE_RUNNER_HIGH_MIN,
  CANDIDATE_RUNNER_WATCH_MIN,
  classifyCandidateRunnerTier,
  computeCandidateRunnerScore,
} from "./candidateRunner.scorer.js";

const baseLoser = {
  shortParentBucket: "TOP_LOSER_SHORTS",
  atrPct: 1.2,
  volAccel: -4,
  change24h: -6,
  last3TicksDirection: "DOWN",
  redImpulseDetected: true,
  immediateRedImpulse: true,
  greenImpulseDetected: false,
  immediateGreenImpulse: false,
  cvdLabel: "BEAR",
  priceVsVwapLabel: "BELOW_VWAP_WITH_RED_CONFIRMATION",
  failedBreakout1m: true,
  macdHistogram1m: -0.02,
  macdHistogramDelta1m: -0.01,
  macdHistogramState1m: "NEGATIVE_EXPANDING",
  rsi1mDelta: -3,
  rsiSpread1m3m: -4,
  shortGateWouldPass: true,
  spreadPct: 0.02,
  entryRank: 5,
  longAuditDangerLabel: "NONE",
  longAuditDangerFlags: [],
  btcMicroRegime: "FLAT",
  btcTacticalRegime: "DOWN",
};

const baseGainer = {
  shortParentBucket: "TOP_GAINER_SHORTS",
  atrPct: 1.0,
  volAccel: -5,
  change24h: 12,
  last3TicksDirection: "DOWN",
  redImpulseDetected: true,
  immediateRedImpulse: false,
  greenImpulseDetected: false,
  immediateGreenImpulse: false,
  cvdLabel: "BEAR",
  priceVsVwapLabel: "ABOVE_VWAP_REJECTION_SETUP",
  aboveVwapRejectionSetup: true,
  failedBreakout1m: true,
  macdHistogram1m: -0.01,
  macdHistogramDelta1m: -0.005,
  rsi1mDelta: -2,
  topGainerExhaustionScore: 85,
  topGainerExhaustionQualityScore: 130,
  microMomentumLabel: "MICRO_MULTI_CONFIRM",
  longAuditDangerLabel: "NONE",
  longAuditDangerFlags: [],
};

const s = (base, overrides) => ({ ...base, ...(overrides ?? {}) });
const sl = overrides => s(baseLoser, overrides);
const sg = overrides => s(baseGainer, overrides);

// ── Entry-safety boundary tests ────────────────────────────────────────────

describe("Entry-safety: post-entry fields must not affect candidateRunnerScore", () => {
  it("adding normalizedMfePct does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withMfe = computeCandidateRunnerScore(sl({ normalizedMfePct: 5 }));
    expect(withMfe.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding mfeNormPct does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withMfe = computeCandidateRunnerScore(sl({ mfeNormPct: 3 }));
    expect(withMfe.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding maeBeforeMfe1NormPct does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withMae = computeCandidateRunnerScore(sl({ maeBeforeMfe1NormPct: 0.1 }));
    expect(withMae.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding feeAdjustedNormPnlPct does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withPnl = computeCandidateRunnerScore(sl({ feeAdjustedNormPnlPct: 3 }));
    expect(withPnl.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding closeReason does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withClose = computeCandidateRunnerScore(sl({ closeReason: "TP" }));
    expect(withClose.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding profitLockActive does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withLock = computeCandidateRunnerScore(sl({ profitLockActive: true }));
    expect(withLock.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding lockArmed does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withLock = computeCandidateRunnerScore(sl({ lockArmed: true }));
    expect(withLock.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding runnerScorePeak does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withPeak = computeCandidateRunnerScore(sl({ runnerScorePeak: 95 }));
    expect(withPeak.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding buyerReturnDetectedAfterEntry does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withBuyerReturn = computeCandidateRunnerScore(sl({ buyerReturnDetectedAfterEntry: true }));
    expect(withBuyerReturn.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding greenImpulseDetectedAfterEntry does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withGreenAfter = computeCandidateRunnerScore(sl({ greenImpulseDetectedAfterEntry: true }));
    expect(withGreenAfter.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding mfeVelocityNormPctPerMin does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withVel = computeCandidateRunnerScore(sl({ mfeVelocityNormPctPerMin: 2.5 }));
    expect(withVel.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding timeSinceEntryMs does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withTime = computeCandidateRunnerScore(sl({ timeSinceEntryMs: 120_000 }));
    expect(withTime.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("adding currentLockFloorNormPct does not change score", () => {
    const base = computeCandidateRunnerScore(sl());
    const withFloor = computeCandidateRunnerScore(sl({ currentLockFloorNormPct: 1.5 }));
    expect(withFloor.candidateRunnerScore).toBe(base.candidateRunnerScore);
  });

  it("regression: full set of post-entry fields produces identical score to clean candidate", () => {
    const cleanScore = computeCandidateRunnerScore(sl()).candidateRunnerScore;
    const postEntryScore = computeCandidateRunnerScore(sl({
      normalizedMfePct: 4,
      mfeNormPct: 4,
      mfe: 4,
      normalizedMaePct: 0.2,
      mae: 0.2,
      maeBeforeMfe1NormPct: 0.15,
      feeAdjustedNormPnlPct: 3.5,
      feeAdjustedLeveragedPnlPct: 35,
      closeReason: "TP",
      profitLockActive: true,
      lockArmed: true,
      currentLockFloorNormPct: 2,
      profitLockLevelMarginPct: 1.5,
      activeLockFloorMarginPct: 1.5,
      priceHistory: [{ price: 1.0, ts: 1000 }, { price: 0.95, ts: 2000 }],
      entryTime: Date.now() - 60_000,
      timeSinceEntryMs: 60_000,
      buyerReturnDetectedAfterEntry: true,
      greenImpulseDetectedAfterEntry: false,
      immediateGreenImpulseAfterEntry: false,
      runnerScorePeak: 88,
      mfeVelocityNormPctPerMin: 2.0,
      timeToMfe05NormMs: 15_000,
      timeToMfe1NormMs: 30_000,
    })).candidateRunnerScore;
    expect(postEntryScore).toBe(cleanScore);
  });
});

// ── candidateRunnerEntrySafe always true ───────────────────────────────────

describe("candidateRunnerEntrySafe is always true", () => {
  it("returns true for strong loser candidate", () => {
    expect(computeCandidateRunnerScore(sl()).candidateRunnerEntrySafe).toBe(true);
  });

  it("returns true for strong gainer candidate", () => {
    expect(computeCandidateRunnerScore(sg()).candidateRunnerEntrySafe).toBe(true);
  });

  it("returns true for empty sample", () => {
    expect(computeCandidateRunnerScore({}).candidateRunnerEntrySafe).toBe(true);
  });

  it("returns true even with danger flags present", () => {
    expect(computeCandidateRunnerScore(sl({ longAuditDangerLabel: "DANGER", cvdLabel: "BULL" })).candidateRunnerEntrySafe).toBe(true);
  });
});

// ── candidateRunnerScoreAtScan aliases ─────────────────────────────────────

describe("candidateRunnerScoreAtScan aliases candidateRunnerScore", () => {
  it("AtScan equals candidateRunnerScore", () => {
    const r = computeCandidateRunnerScore(sl());
    expect(r.candidateRunnerScoreAtScan).toBe(r.candidateRunnerScore);
  });

  it("AtEntry equals candidateRunnerScore", () => {
    const r = computeCandidateRunnerScore(sl());
    expect(r.candidateRunnerScoreAtEntry).toBe(r.candidateRunnerScore);
  });
});

// ── Scoring direction tests ────────────────────────────────────────────────

describe("Scoring direction", () => {
  it("ATR 1.5 scores higher than ATR 0.3 (raw scores)", () => {
    const highAtr = computeCandidateRunnerScore(sl({ atrPct: 1.5 })).candidateRunnerScoreRaw;
    const lowAtr  = computeCandidateRunnerScore(sl({ atrPct: 0.3 })).candidateRunnerScoreRaw;
    expect(highAtr).toBeGreaterThan(lowAtr);
  });

  it("DOWN ticks + red impulse + no green scores higher than UP ticks + green impulse (raw scores)", () => {
    const bearish = computeCandidateRunnerScore(sl({
      last3TicksDirection: "DOWN",
      redImpulseDetected: true,
      immediateRedImpulse: true,
      greenImpulseDetected: false,
      immediateGreenImpulse: false,
    })).candidateRunnerScoreRaw;
    const bullish = computeCandidateRunnerScore(sl({
      last3TicksDirection: "UP",
      redImpulseDetected: false,
      immediateRedImpulse: false,
      greenImpulseDetected: true,
      immediateGreenImpulse: true,
    })).candidateRunnerScoreRaw;
    expect(bearish).toBeGreaterThan(bullish);
  });

  it("CVD BULL applies large penalty vs CVD BEAR (raw scores)", () => {
    const bear = computeCandidateRunnerScore(sl({ cvdLabel: "BEAR" })).candidateRunnerScoreRaw;
    const bull = computeCandidateRunnerScore(sl({ cvdLabel: "BULL" })).candidateRunnerScoreRaw;
    expect(bear - bull).toBeGreaterThanOrEqual(25);
  });

  it("longAuditDangerLabel DANGER applies large penalty (raw scores)", () => {
    const clean  = computeCandidateRunnerScore(sl({ longAuditDangerLabel: "NONE" })).candidateRunnerScoreRaw;
    const danger = computeCandidateRunnerScore(sl({ longAuditDangerLabel: "DANGER" })).candidateRunnerScoreRaw;
    expect(clean - danger).toBeGreaterThanOrEqual(30);
  });

  it("LONG_AUDIT_DANGER keeps score low with minimal base", () => {
    // Use a minimal candidate (just ATR + CVD) so danger flags dominate
    const score = computeCandidateRunnerScore({
      shortParentBucket: "TOP_LOSER_SHORTS",
      atrPct: 1.0,
      cvdLabel: "BEAR",
      longAuditDangerLabel: "DANGER",
      longAuditDangerFlags: ["RSI_LONG_MOMENTUM_EXPANSION", "MACD_LONG_BULLISH_EXPANSION"],
    }).candidateRunnerScore;
    expect(score).toBeLessThan(CANDIDATE_RUNNER_HIGH_MIN);
  });

  it("green impulse detected triggers large penalty (raw scores)", () => {
    const noGreen   = computeCandidateRunnerScore(sl({ greenImpulseDetected: false, immediateGreenImpulse: false })).candidateRunnerScoreRaw;
    const withGreen = computeCandidateRunnerScore(sl({ greenImpulseDetected: true })).candidateRunnerScoreRaw;
    expect(noGreen - withGreen).toBeGreaterThanOrEqual(25);
  });

  it("VWAP reclaim danger applies penalty (raw scores)", () => {
    const noReclaim = computeCandidateRunnerScore(sl({ priceVsVwapLabel: "BELOW_VWAP" })).candidateRunnerScoreRaw;
    const reclaim   = computeCandidateRunnerScore(sl({ priceVsVwapLabel: "VWAP_RECLAIM" })).candidateRunnerScoreRaw;
    expect(noReclaim).toBeGreaterThan(reclaim);
  });
});

// ── Tier boundary tests ────────────────────────────────────────────────────

describe("classifyCandidateRunnerTier", () => {
  it("90 → CANDIDATE_RUNNER_ELITE", () => {
    expect(classifyCandidateRunnerTier(90)).toBe("CANDIDATE_RUNNER_ELITE");
  });
  it("89 → CANDIDATE_RUNNER_HIGH", () => {
    expect(classifyCandidateRunnerTier(89)).toBe("CANDIDATE_RUNNER_HIGH");
  });
  it("75 → CANDIDATE_RUNNER_HIGH", () => {
    expect(classifyCandidateRunnerTier(75)).toBe("CANDIDATE_RUNNER_HIGH");
  });
  it("74 → CANDIDATE_RUNNER_STRONG", () => {
    expect(classifyCandidateRunnerTier(74)).toBe("CANDIDATE_RUNNER_STRONG");
  });
  it("60 → CANDIDATE_RUNNER_STRONG", () => {
    expect(classifyCandidateRunnerTier(60)).toBe("CANDIDATE_RUNNER_STRONG");
  });
  it("59 → CANDIDATE_RUNNER_CANDIDATE", () => {
    expect(classifyCandidateRunnerTier(59)).toBe("CANDIDATE_RUNNER_CANDIDATE");
  });
  it("45 → CANDIDATE_RUNNER_CANDIDATE", () => {
    expect(classifyCandidateRunnerTier(CANDIDATE_RUNNER_CANDIDATE_MIN)).toBe("CANDIDATE_RUNNER_CANDIDATE");
  });
  it("44 → CANDIDATE_RUNNER_WATCH", () => {
    expect(classifyCandidateRunnerTier(44)).toBe("CANDIDATE_RUNNER_WATCH");
  });
  it("25 → CANDIDATE_RUNNER_WATCH", () => {
    expect(classifyCandidateRunnerTier(CANDIDATE_RUNNER_WATCH_MIN)).toBe("CANDIDATE_RUNNER_WATCH");
  });
  it("24 → CANDIDATE_RUNNER_LOW", () => {
    expect(classifyCandidateRunnerTier(24)).toBe("CANDIDATE_RUNNER_LOW");
  });
  it("0 → CANDIDATE_RUNNER_LOW", () => {
    expect(classifyCandidateRunnerTier(0)).toBe("CANDIDATE_RUNNER_LOW");
  });
});

// ── Entry mode tests ───────────────────────────────────────────────────────

describe("candidateRunnerEntryMode", () => {
  it("score < 25 → BLOCK_SHADOW", () => {
    const r = computeCandidateRunnerScore({ shortParentBucket: "TOP_LOSER_SHORTS", cvdLabel: "BULL", greenImpulseDetected: true, longAuditDangerLabel: "DANGER", longAuditDangerFlags: ["MACD_LONG_BULLISH_EXPANSION"] });
    expect(r.candidateRunnerEntryMode).toBe("BLOCK_SHADOW");
    expect(r.candidateRunnerWouldBlock).toBe(true);
  });

  it("strong loser candidate → candidateRunnerWouldAllow is true", () => {
    expect(computeCandidateRunnerScore(sl()).candidateRunnerWouldAllow).toBe(true);
  });

  it("ELITE_SNIPER is only returned for score >= 90", () => {
    const r = computeCandidateRunnerScore(sl());
    if (r.candidateRunnerScore >= CANDIDATE_RUNNER_ELITE_MIN) {
      expect(r.candidateRunnerEntryMode).toBe("ELITE_SNIPER");
    }
  });
});

// ── Gene structure tests ───────────────────────────────────────────────────

describe("Gene structure", () => {
  it("ATR gene appears in positiveGenes", () => {
    const r = computeCandidateRunnerScore(sl({ atrPct: 1.5 }));
    expect(r.candidateRunnerPositiveGenes.some(g => g.includes("CR_ATR"))).toBe(true);
  });

  it("CVD BULL gene appears in penaltyGenes", () => {
    const r = computeCandidateRunnerScore(sl({ cvdLabel: "BULL" }));
    expect(r.candidateRunnerPenaltyGenes.some(g => g.includes("CR_CVD_BULL"))).toBe(true);
  });

  it("long audit danger gene appears in penaltyGenes when danger present", () => {
    const r = computeCandidateRunnerScore(sl({ longAuditDangerLabel: "DANGER" }));
    expect(r.candidateRunnerPenaltyGenes.some(g => g.includes("CR_LONG_AUDIT_DANGER"))).toBe(true);
  });
});

// ── Gainer-specific tests ──────────────────────────────────────────────────

describe("Gainer-specific scoring", () => {
  it("exhaustion >= 80 boosts gainer score (raw scores)", () => {
    const withExh    = computeCandidateRunnerScore(sg({ topGainerExhaustionScore: 85 })).candidateRunnerScoreRaw;
    const withoutExh = computeCandidateRunnerScore(sg({ topGainerExhaustionScore: 50 })).candidateRunnerScoreRaw;
    expect(withExh).toBeGreaterThan(withoutExh);
  });

  it("pump continuation danger penalizes gainer score (raw scores)", () => {
    const safe   = computeCandidateRunnerScore(sg({ hasGainerContinuationDanger: false })).candidateRunnerScoreRaw;
    const danger = computeCandidateRunnerScore(sg({ hasGainerContinuationDanger: true })).candidateRunnerScoreRaw;
    expect(safe).toBeGreaterThan(danger);
  });

  it("exhaustion bonus does not apply to loser bucket", () => {
    const loserWithExh = computeCandidateRunnerScore(sl({ topGainerExhaustionScore: 90 })).candidateRunnerPositiveGenes;
    expect(loserWithExh.some(g => g.includes("CR_EXHAUSTION"))).toBe(false);
  });
});

// ── Score version ──────────────────────────────────────────────────────────

describe("Score version", () => {
  it("always CANDIDATE_RUNNER_V1", () => {
    expect(computeCandidateRunnerScore(sl()).candidateRunnerScoreVersion).toBe("CANDIDATE_RUNNER_V1");
    expect(computeCandidateRunnerScore({}).candidateRunnerScoreVersion).toBe("CANDIDATE_RUNNER_V1");
  });
});
