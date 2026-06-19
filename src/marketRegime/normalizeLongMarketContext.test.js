import { describe, expect, it } from 'vitest';
import { normalizeLongMarketContext } from './normalizeLongMarketContext.js';

describe('LONG market context normalization', () => {
  it('maps bullish raw directions to LONG tailwind labels', () => {
    const out = normalizeLongMarketContext({
      btcMicroDirectionLabel: 'UP', btcTacticalDirectionLabel: 'UP', btcStructuralDirectionLabel: 'UP',
      ethMicroDirectionLabel: 'UP', ethTacticalDirectionLabel: 'FLAT',
      btcEthAlignmentLabel: 'BULLISH', breadthBullishPct: 70, breadthBearishPct: 20,
    });
    expect(out.longMicroContextLabel).toBe('LONG_MICRO_TAILWIND');
    expect(out.marketContextExpectedLongEffect).toBe('SUPPORTIVE');
    expect(out.longMarketContextLabel).toContain('TAILWIND');
  });

  it('never reuses a directional label when context is stale', () => {
    const out = normalizeLongMarketContext({
      btcMicroDirectionLabel: 'UP', btcTacticalDirectionLabel: 'UP', marketContextStale: true,
    });
    expect(out.longMarketContextLabel).toBe('LONG_CONTEXT_STALE');
    expect(out.longMicroContextLabel).toBe('LONG_MICRO_CONTEXT_STALE');
    expect(out.marketContextExpectedLongEffect).toBe('UNKNOWN_STALE');
  });
});
