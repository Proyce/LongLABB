// ─── DNA V2 FIELD-CONTRACT TESTS ─────────────────────────────────────────────
// Verifies that evaluateCanonicalShadowPolicyV3 uses the correct field names
// for DNA V2 scores: bestDnaLongScoreV2Shadow / bestDnaLongTierV2Shadow.
// These fields were previously misnamed as bestDnaLongV2Score / bestDnaLongV2Tier (R-09).

import { describe, it, expect } from 'vitest';
import { evaluateCanonicalShadowPolicyV3, CANONICAL_SHADOW_VERDICT } from './evaluateCanonicalShadowPolicyV3.js';

const BASE_ALLOW_INPUTS = {
  longGateScore:      75,
  longGateTier:       'STRONG',
  longGateWouldPass:  true,
  longAuditDangerTier: 'SAFE',
  longFilterDataQuality: 'COMPLETE',
  entryCvdLabel:      'BULL',
  immediateGreenImpulse: true,
};

describe('evaluateCanonicalShadowPolicyV3 — DNA V2 field-contract (R-09)', () => {
  it('uses bestDnaLongScoreV2Shadow for V2 DNA score — correct field name', () => {
    const result = evaluateCanonicalShadowPolicyV3({
      ...BASE_ALLOW_INPUTS,
      bestDnaLongScoreV2Shadow: 85,
      bestDnaLongTierV2Shadow: 'A',
    });
    expect(result.canonicalShadowDnaVersionUsed).toBe('V2_SHADOW');
    expect(result.canonicalShadowEntryPolicyDecision).not.toBe(CANONICAL_SHADOW_VERDICT.UNKNOWN);
  });

  it('does NOT pick up the old misnamed field bestDnaLongV2Score', () => {
    // If the old field name were used, this would give a different dna version
    const result = evaluateCanonicalShadowPolicyV3({
      ...BASE_ALLOW_INPUTS,
      bestDnaLongV2Score: 85,   // wrong field name — should be ignored
      bestDnaLongV2Tier:  'A',  // wrong field name — should be ignored
    });
    // Without V2 shadow or V1 fallback, DNA is UNAVAILABLE
    expect(result.canonicalShadowDnaVersionUsed).toBe('UNAVAILABLE');
  });

  it('falls back to V1 score when V2 shadow is absent', () => {
    const result = evaluateCanonicalShadowPolicyV3({
      ...BASE_ALLOW_INPUTS,
      bestDnaLongScore: 80,
    });
    expect(result.canonicalShadowDnaVersionUsed).toBe('V1_FALLBACK');
    expect(result.canonicalShadowEntryPolicyDecision).not.toBe(CANONICAL_SHADOW_VERDICT.UNKNOWN);
  });

  it('V2 shadow score takes precedence over V1 score', () => {
    const result = evaluateCanonicalShadowPolicyV3({
      ...BASE_ALLOW_INPUTS,
      bestDnaLongScoreV2Shadow: 90,
      bestDnaLongScore: 30, // low V1 that would cause issues if used
    });
    expect(result.canonicalShadowDnaVersionUsed).toBe('V2_SHADOW');
  });

  it('UNAVAILABLE dna version with insufficient coverage returns UNKNOWN', () => {
    // No gate, no DNA, no danger — should return UNKNOWN due to coverage
    const result = evaluateCanonicalShadowPolicyV3({});
    expect(result.canonicalShadowEntryPolicyDecision).toBe(CANONICAL_SHADOW_VERDICT.UNKNOWN);
    expect(result.canonicalShadowDnaVersionUsed).toBe('UNAVAILABLE');
  });

  it('safety fields are always present and correct', () => {
    const result = evaluateCanonicalShadowPolicyV3({ ...BASE_ALLOW_INPUTS, bestDnaLongScoreV2Shadow: 85 });
    expect(result.canonicalShadowCanAffectExecution).toBe(false);
    expect(result.canonicalShadowExecutionApplied).toBe(false);
    expect(result.logOnly).toBe(true);
  });

  it('bestDnaLongTierV2Shadow is read for V2 tier — tier field contract', () => {
    const withTier = evaluateCanonicalShadowPolicyV3({
      ...BASE_ALLOW_INPUTS,
      bestDnaLongScoreV2Shadow: 85,
      bestDnaLongTierV2Shadow: 'A',
    });
    const withoutTier = evaluateCanonicalShadowPolicyV3({
      ...BASE_ALLOW_INPUTS,
      bestDnaLongScoreV2Shadow: 85,
      bestDnaLongTierV2Shadow: undefined,
    });
    // Both should use V2_SHADOW — tier presence doesn't change dna version
    expect(withTier.canonicalShadowDnaVersionUsed).toBe('V2_SHADOW');
    expect(withoutTier.canonicalShadowDnaVersionUsed).toBe('V2_SHADOW');
  });

  it('high V2 DNA score ≥ 70 contributes DNA_V2_SHADOW_HIGH reason', () => {
    const result = evaluateCanonicalShadowPolicyV3({
      ...BASE_ALLOW_INPUTS,
      bestDnaLongScoreV2Shadow: 80,
    });
    const reasons = (result.canonicalShadowEntryPolicyReasons ?? []).join(',');
    expect(reasons).toMatch(/DNA_V2_SHADOW_HIGH/);
  });
});
