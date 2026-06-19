import { describe, expect, it } from 'vitest';
import { evaluateLongGateAudit } from './longGateAudit.js';
import { longGateRegimePenalty, applyLongGateTierCeiling } from './longGateRegimeConfig.js';

// A clean strong-micro long: green impulse + ticks up + bull CVD => high raw score.
const strongMicro = {
  immediateGreenImpulse: true,
  greenImpulseDetected: true,
  last3TicksDirection: 'UP',
  cvdLabel: 'BULL',
  rsiSpread1m3m: 1,
  rsi1mDelta: 1,
};

describe('LONG gate regime awareness (observer-mode, log-only)', () => {
  it('emits a top tier for a strong micro setup in a neutral regime', () => {
    const out = evaluateLongGateAudit({ ...strongMicro, longMarketBreadthLabel: 'LONG_BREADTH_MIXED', longMarketContextLabel: 'LONG_CONTEXT_NEUTRAL' });
    expect(['PREMIUM', 'STRONG']).toContain(out.longGateTier);
    expect(out.longGateRegimePenaltyApplied).toBe(longGateRegimePenalty('LONG_BREADTH_MIXED', 'LONG_CONTEXT_NEUTRAL'));
  });

  it('caps the SAME setup below STRONG in HARD_DANGER + STRONG_HEADWIND', () => {
    const out = evaluateLongGateAudit({ ...strongMicro, longMarketBreadthLabel: 'LONG_BREADTH_HARD_DANGER', longMarketContextLabel: 'LONG_CONTEXT_STRONG_HEADWIND' });
    expect(['PREMIUM', 'STRONG']).not.toContain(out.longGateTier);
    expect(out.longGateRegimePenaltyApplied).toBe(-50);
  });

  it('applies the tier CEILING when a very strong raw score survives the penalty', () => {
    // Stack enough positive micro-structure that even after the -30 HARD_DANGER
    // penalty the raw score lands in PREMIUM, forcing the ceiling to cap it.
    const veryStrong = {
      ...strongMicro,
      failedBreakdown1m: true,
      higherLow1m: true,
      atrPct: 0.8,
      spreadPct: 0.01,
      longMarketBreadthLabel: 'LONG_BREADTH_HARD_DANGER',
      longMarketContextLabel: 'LONG_CONTEXT_NEUTRAL',
    };
    const out = evaluateLongGateAudit(veryStrong);
    expect(out.longGateTier).toBe('WATCH');
    expect(out.longGateTierCeilingApplied).toBe('WATCH');
  });

  it('never emits PREMIUM/STRONG in HARD_DANGER regardless of score', () => {
    const out = evaluateLongGateAudit({ ...strongMicro, longMarketBreadthLabel: 'LONG_BREADTH_HARD_DANGER' });
    expect(['PREMIUM', 'STRONG']).not.toContain(out.longGateTier);
  });

  it('penalty config: hard danger + strong headwind = -50', () => {
    expect(longGateRegimePenalty('LONG_BREADTH_HARD_DANGER', 'LONG_CONTEXT_STRONG_HEADWIND')).toBe(-50);
    expect(longGateRegimePenalty(null, null)).toBe(0);
  });

  it('tier ceiling helper: caps but never promotes', () => {
    expect(applyLongGateTierCeiling('PREMIUM', 'LONG_BREADTH_HARD_DANGER')).toBe('WATCH');
    expect(applyLongGateTierCeiling('RESEARCH_REJECT', 'LONG_BREADTH_HARD_DANGER')).toBe('RESEARCH_REJECT');
    expect(applyLongGateTierCeiling('PREMIUM', 'LONG_BREADTH_MIXED')).toBe('PREMIUM');
    expect(applyLongGateTierCeiling('INSUFFICIENT_DATA', 'LONG_BREADTH_HARD_DANGER')).toBe('INSUFFICIENT_DATA');
  });
});
