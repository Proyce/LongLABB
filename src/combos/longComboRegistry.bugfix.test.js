// Tests for B-15: LONG_GAINER_GREEN_REACCELERATION_V1 retired from positive combos.
import { describe, it, expect } from "vitest";
import {
  REGISTERED_LONG_COMBOS,
  LONG_POSITIVE_COMBOS,
  RETIRED_LONG_COMBOS_V1,
  LONG_GAINER_GREEN_REACCELERATION_V1,
  evaluateLongCombos,
} from "./longComboRegistry.js";

// ── B-15: LONG_GAINER_GREEN_REACCELERATION_V1 retired ───────────────────────

describe("B-15: LONG_GAINER_GREEN_REACCELERATION_V1 retirement", () => {
  it("LONG_GAINER_GREEN_REACCELERATION_V1 is NOT in REGISTERED_LONG_COMBOS", () => {
    const ids = REGISTERED_LONG_COMBOS.map(c => c.comboId);
    expect(ids).not.toContain("LONG_GAINER_GREEN_REACCELERATION_V1");
  });

  it("LONG_GAINER_GREEN_REACCELERATION_V1 is NOT in LONG_POSITIVE_COMBOS", () => {
    const ids = LONG_POSITIVE_COMBOS.map(c => c.comboId);
    expect(ids).not.toContain("LONG_GAINER_GREEN_REACCELERATION_V1");
  });

  it("LONG_GAINER_GREEN_REACCELERATION_V1 is in RETIRED_LONG_COMBOS_V1", () => {
    const ids = RETIRED_LONG_COMBOS_V1.map(c => c.comboId);
    expect(ids).toContain("LONG_GAINER_GREEN_REACCELERATION_V1");
  });

  it("evaluateLongCombos no longer includes REACCELERATION in matched positives", () => {
    const result = evaluateLongCombos({
      longParentBucket: "TOP_GAINER_LONGS",
      topGainerLongSubBucket: "TOP_GAINER_GREEN_REACCELERATION_LONG",
      immediateGreenImpulse: true,
      greenImpulseDetected: true,
      immediateRedImpulse: false,
      entryCvdLabel: "BULL",
      last3TicksDirection: "UP",
      longMicroMomentumLabel: "MICRO_GREEN_MULTI_CONFIRM",
    });
    expect(result.longCombosPositiveMatched).not.toContain("LONG_GAINER_GREEN_REACCELERATION_V1");
    expect(result.canAffectExecution).toBe(false);
    expect(result.logOnly).toBe(true);
  });

  it("the retired combo function is still callable (for historical IC analysis)", () => {
    const sample = {
      longParentBucket: "TOP_GAINER_LONGS",
      topGainerLongSubBucket: "TOP_GAINER_GREEN_REACCELERATION_LONG",
      immediateGreenImpulse: true,
      immediateRedImpulse: false,
      entryCvdLabel: "BULL",
      last3TicksDirection: "UP",
      longMicroMomentumLabel: "MICRO_GREEN_MULTI_CONFIRM",
    };
    const result = LONG_GAINER_GREEN_REACCELERATION_V1(sample);
    expect(result.matched).toBe(true);
    expect(result.logOnly).toBe(true);
    expect(result.canAffectExecution).toBe(false);
  });

  it("REGISTERED_LONG_COMBOS and LONG_POSITIVE_COMBOS are the same array", () => {
    expect(REGISTERED_LONG_COMBOS).toBe(LONG_POSITIVE_COMBOS);
  });
});
