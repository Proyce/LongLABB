import { describe, expect, it } from 'vitest';
import {
  deriveLongAtrContext,
  deriveLongCvdSemantics,
  deriveLongEvidenceSummary,
  deriveLongQualityBuckets,
} from './longEvidenceSemantics.js';

describe('LONG research semantics', () => {
  it('marks bearish CVD without reversal support as a LONG contradiction', () => {
    const out = deriveLongCvdSemantics({ entryCvdLabel: 'BEAR' });
    expect(out.cvdContradictsLongAtEntry).toBe(true);
    expect(out.cvdLongInterpretation).toBe('CVD_BEAR_LONG_CONTRADICTION');
  });

  it('allows an explicit reversal override without hiding the entry CVD', () => {
    const out = deriveLongCvdSemantics({ entryCvdLabel: 'BEAR', immediateGreenImpulse: true, longGateScore: 95 });
    expect(out.cvdStateAtEntry).toBe('BEAR');
    expect(out.cvdOverrideApplied).toBe(true);
  });

  it('treats ATR as an amplifier, not a direction signal', () => {
    expect(deriveLongAtrContext({ atrPct: 0.8, longGateScore: 20 }).longAtrContext).toBe('UNQUALIFIED_VOLATILITY_DANGER');
    expect(deriveLongAtrContext({ atrPct: 0.8, longGateScore: 90, last3TicksDirection: 'UP' }).longAtrContext).toBe('QUALIFIED_VOLATILITY_BOOST');
  });

  it('separates raw combo count from independent evidence count', () => {
    const out = deriveLongEvidenceSummary({
      longCombosPositiveMatched: ['LONG_UNIVERSAL_CORE_V1', 'LONG_UNIVERSAL_CORE_MICRO_UP_V1'],
      longCombosAntiMatched: [],
      longGateScore: 95,
      last3TicksDirection: 'UP',
    });
    expect(out.rawPositiveComboCount).toBe(2);
    expect(out.independentPositiveEvidenceCount).toBe(2);
    expect(out.eliteCleanComboStackWouldAllowLogOnly).toBe(true);
  });

  it('classifies a hard anti-combo independently of positive badges', () => {
    const out = deriveLongEvidenceSummary({
      longCombosPositiveMatched: ['LONG_PREMIUM_PF10_RUNNER_V1'],
      longCombosAntiMatched: ['LONG_FALLING_KNIFE_ANTI_V1'],
    });
    expect(out.hardAntiComboPresent).toBe(true);
    expect(out.cleanComboStackWouldAllowLogOnly).toBe(false);
  });

  it('keeps quality, eligibility, and data quality separate', () => {
    const out = deriveLongQualityBuckets({ longGateScore: 92, longShadowDecision: 'WOULD_BLOCK', longFilterDataQuality: 'INCOMPLETE' });
    expect(out.longQualityTierV2).toBe('ELITE');
    expect(out.longEligibilityTierV2).toBe('RESEARCH_BLOCK');
    expect(out.longDataQualityTierV2).toBe('INCOMPLETE');
  });
});
