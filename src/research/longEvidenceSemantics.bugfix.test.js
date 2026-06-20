// Tests for B-12 (median fix) and B-13 (V2 shadow score) in longEvidenceSemantics.
import { describe, it, expect } from "vitest";
import { deriveLongQualityBuckets, deriveLongEvidenceSummary } from "./longEvidenceSemantics.js";

// ── B-12: Median fix for even-length score arrays ────────────────────────────

describe("B-12: quality tier median correct for even-length arrays", () => {
  it("correctly elevates to QUALIFIED when even-length median crosses 70", () => {
    // [69, 71]: old formula picks sorted[0]=69 → WATCH; fix gives (69+71)/2=70 → QUALIFIED
    const result = deriveLongQualityBuckets({
      longGateScore: 69,
      bestDnaLongScore: 71,
    });
    // inBand80 = 0, inBand90 = 0; median = (69+71)/2 = 70 → QUALIFIED
    expect(result.longQualityTierV2).toBe("QUALIFIED");
    expect(result.logOnly).toBe(true);
    expect(result.canAffectExecution).toBe(false);
  });

  it("correctly identifies STRONG tier when median is exactly 80", () => {
    const result = deriveLongQualityBuckets({
      longGateScore: 79,
      bestDnaLongScore: 81,
    });
    // With fix: median = (79+81)/2 = 80 → STRONG (median >= 80)
    // Without fix: sorted[0] = 79 → QUALIFIED
    expect(result.longQualityTierV2).toBe("STRONG");
  });

  it("single-element array still works correctly (odd length)", () => {
    const result = deriveLongQualityBuckets({ longGateScore: 92 });
    expect(result.longQualityTierV2).toBe("ELITE");
  });

  it("three-element array median is the middle value", () => {
    const result = deriveLongQualityBuckets({
      longGateScore: 50,
      bestDnaLongScore: 70,
      longPostFee10EntryScore: 90,
    });
    // sorted = [50, 70, 90], median = sorted[1] = 70 → QUALIFIED
    expect(result.longQualityTierV2).toBe("QUALIFIED");
  });

  it("two-element array [55, 65] has median 60 → WATCH", () => {
    const result = deriveLongQualityBuckets({
      longGateScore: 55,
      bestDnaLongScore: 65,
    });
    // inBand80=0, inBand90=0; median = (55+65)/2 = 60 → WATCH (>= 50, < 70)
    expect(result.longQualityTierV2).toBe("WATCH");
  });
});

// ── B-13: V2 shadow score preferred over V1 ──────────────────────────────────

describe("B-13: quality tier uses V2 shadow score when available", () => {
  it("prefers V2 shadow score over V1 in quality tier aggregation", () => {
    const result = deriveLongQualityBuckets({
      longGateScore: 75,
      bestDnaLongScore: 60,          // V1 low
      bestDnaLongScoreV2Shadow: 85,  // V2 high — should be used
      longPostFee10EntryScore: null,
      longCandidateRunnerScoreAtEntry: null,
    });
    // With V2 (85): scores=[75,85], median=(75+85)/2=80 → STRONG
    // With V1 (60): scores=[75,60], median=(60+75)/2=67.5 → WATCH
    expect(result.longQualityTierV2).toBe("STRONG");
    expect(result.logOnly).toBe(true);
    expect(result.canAffectExecution).toBe(false);
  });

  it("falls back to V1 when V2 shadow is not available", () => {
    const result = deriveLongQualityBuckets({
      longGateScore: 75,
      bestDnaLongScore: 85,
      bestDnaLongScoreV2Shadow: null,
    });
    // V2 null → uses V1 (85): scores=[75,85], median=80 → STRONG
    expect(result.longQualityTierV2).toBe("STRONG");
  });

  it("falls back to V1 when V2 shadow is undefined", () => {
    const result = deriveLongQualityBuckets({
      longGateScore: 60,
      bestDnaLongScore: 80,
    });
    // V2 undefined → uses V1 (80): scores=[60,80], median=(60+80)/2=70 → QUALIFIED
    expect(result.longQualityTierV2).toBe("QUALIFIED");
  });
});

// ── B-13: deriveLongEvidenceSummary eliteScore uses V2 shadow ────────────────

describe("B-13: deriveLongEvidenceSummary uses V2 shadow for eliteScore", () => {
  it("eliteCleanComboStackWouldAllowLogOnly true when V2 shadow >= 90 (V1 below)", () => {
    const result = deriveLongEvidenceSummary({
      longCombosPositiveMatched: ["LONG_UNIVERSAL_CORE_V1", "LONG_UNIVERSAL_CORE_MICRO_UP_V1"],
      longCombosAntiMatched: [],
      bestDnaLongScore: 70,           // V1 — not elite
      bestDnaLongScoreV2Shadow: 92,   // V2 — elite
      last3TicksDirection: "UP",
      immediateGreenImpulse: true,
    });
    expect(result.eliteCleanComboStackWouldAllowLogOnly).toBe(true);
    expect(result.canAffectExecution).toBe(false);
  });
});
