// Tests for B-05 and B-06 bug fixes in the AES feature normalizer.
import { describe, it, expect } from "vitest";
import { normalizeLongAesFeatures } from "./longAbsoluteEntryScore.features.js";

// ── B-05: hasGreenConfirmation must not derive true from last3TicksDirection ──

describe("B-05: hasGreenConfirmation derivation", () => {
  it("returns true when immediateGreenImpulse is true", () => {
    const { features } = normalizeLongAesFeatures({ immediateGreenImpulse: true });
    expect(features.hasGreenConfirmation).toBe(true);
  });

  it("returns true when greenImpulseDetected is true", () => {
    const { features } = normalizeLongAesFeatures({ greenImpulseDetected: true });
    expect(features.hasGreenConfirmation).toBe(true);
  });

  it("does NOT return true when only last3TicksDirection is UP", () => {
    const { features } = normalizeLongAesFeatures({
      immediateGreenImpulse: false,
      greenImpulseDetected: false,
      last3TicksDirection: "UP",
    });
    // Must be false (both impulse fields explicitly false), NOT true
    expect(features.hasGreenConfirmation).toBe(false);
  });

  it("returns null when impulse fields are absent and last3TicksDirection is UP", () => {
    const { features } = normalizeLongAesFeatures({ last3TicksDirection: "UP" });
    // Neither impulse field is present → cannot derive
    expect(features.hasGreenConfirmation).toBeNull();
  });

  it("returns false when both impulse fields are explicitly false", () => {
    const { features } = normalizeLongAesFeatures({
      immediateGreenImpulse: false,
      greenImpulseDetected: false,
    });
    expect(features.hasGreenConfirmation).toBe(false);
  });

  it("returns null when both impulse fields are absent (null)", () => {
    const { features } = normalizeLongAesFeatures({});
    expect(features.hasGreenConfirmation).toBeNull();
  });

  it("preserves explicit hasGreenConfirmation: true from the source snapshot", () => {
    const { features } = normalizeLongAesFeatures({
      hasGreenConfirmation: true,
      immediateGreenImpulse: false,
      greenImpulseDetected: false,
    });
    expect(features.hasGreenConfirmation).toBe(true);
  });

  it("preserves explicit hasGreenConfirmation: false from the source snapshot", () => {
    const { features } = normalizeLongAesFeatures({
      hasGreenConfirmation: false,
      immediateGreenImpulse: true,
    });
    expect(features.hasGreenConfirmation).toBe(false);
  });
});

// ── B-06: hasGainerGreenConfirmation must not fall back to greenImpulseDetected ─

describe("B-06: hasGainerGreenConfirmation derivation", () => {
  it("does NOT derive hasGainerGreenConfirmation from greenImpulseDetected alone", () => {
    const { features } = normalizeLongAesFeatures({
      longParentBucket: "TOP_GAINER_LONGS",
      greenImpulseDetected: true,
    });
    expect(features.hasGainerGreenConfirmation).toBeNull();
  });

  it("does NOT derive hasGainerGreenConfirmation from immediateGreenImpulse alone", () => {
    const { features } = normalizeLongAesFeatures({
      longParentBucket: "TOP_GAINER_LONGS",
      immediateGreenImpulse: true,
      hasGainerGreenConfirmation: undefined,
    });
    expect(features.hasGainerGreenConfirmation).toBeNull();
  });

  it("returns true when hasGainerGreenConfirmation is explicitly true", () => {
    const { features } = normalizeLongAesFeatures({
      longParentBucket: "TOP_GAINER_LONGS",
      hasGainerGreenConfirmation: true,
      greenImpulseDetected: false,
    });
    expect(features.hasGainerGreenConfirmation).toBe(true);
  });

  it("returns false when hasGainerGreenConfirmation is explicitly false", () => {
    const { features } = normalizeLongAesFeatures({
      longParentBucket: "TOP_GAINER_LONGS",
      hasGainerGreenConfirmation: false,
    });
    expect(features.hasGainerGreenConfirmation).toBe(false);
  });

  it("returns null when hasGainerGreenConfirmation is absent", () => {
    const { features } = normalizeLongAesFeatures({
      longParentBucket: "TOP_GAINER_LONGS",
    });
    expect(features.hasGainerGreenConfirmation).toBeNull();
  });
});
