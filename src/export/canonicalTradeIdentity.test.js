import { describe, expect, it } from 'vitest';
import {
  resolveCanonicalTradeId,
  compareCanonicalTradeSnapshots,
  classifyResearchExclusion,
  deduplicateByCanonicalId,
  CANONICAL_RESEARCH_EXCLUSION,
} from './canonicalTradeIdentity.js';

function trade(overrides = {}) {
  return {
    id: 'trade-a',
    symbol: 'BTCUSDT',
    entryTime: 1_000_000,
    entryPrice: 50_000,
    closed: true,
    feeAdjustedFinalPnlPct: 1.5,
    ...overrides,
  };
}

describe('resolveCanonicalTradeId', () => {
  it('prefers canonicalTradeId', () => {
    const r = resolveCanonicalTradeId(trade({ canonicalTradeId: 'canon-1' }));
    expect(r.canonicalTradeId).toBe('canon-1');
    expect(r.canonicalTradeIdSource).toBe('PERSISTED');
    expect(r.canonicalTradeIdentityConfidence).toBe('HIGH');
  });

  it('falls back to tradeId', () => {
    const r = resolveCanonicalTradeId(trade({ tradeId: 'tid-2' }));
    expect(r.canonicalTradeId).toBe('tid-2');
    expect(r.canonicalTradeIdSource).toBe('TRADE_ID');
  });

  it('falls back to id', () => {
    const r = resolveCanonicalTradeId(trade({ id: 'simple-3' }));
    expect(r.canonicalTradeId).toBe('simple-3');
    expect(r.canonicalTradeIdSource).toBe('ID');
  });

  it('uses deterministic legacy composite when no id field exists', () => {
    const r = resolveCanonicalTradeId({ symbol: 'ETHUSDT', entryTime: 2000, entryPrice: 3000 });
    expect(r.canonicalTradeId).toMatch(/^LEGACY:/);
    expect(r.canonicalTradeIdSource).toBe('LEGACY_COMPOSITE');
    expect(r.canonicalTradeIdentityConfidence).toBe('LOW');
  });
});

describe('deduplicateByCanonicalId — order independence', () => {
  const baseT = trade({ canonicalTradeId: 'dup-1', lifecycleRevision: 1 });
  const laterT = trade({ canonicalTradeId: 'dup-1', lifecycleRevision: 2, closedAt: 1_000_100 });

  it('always selects the higher-revision snapshot regardless of input order', () => {
    const r1 = deduplicateByCanonicalId([baseT, laterT]);
    const r2 = deduplicateByCanonicalId([laterT, baseT]);
    expect(r1.canonical).toHaveLength(1);
    expect(r2.canonical).toHaveLength(1);
    expect(r1.canonical[0].lifecycleRevision).toBe(2);
    expect(r2.canonical[0].lifecycleRevision).toBe(2);
  });

  it('reports exactly one superseded snapshot', () => {
    const { totalSuperseded, duplicateAudit } = deduplicateByCanonicalId([baseT, laterT]);
    expect(totalSuperseded).toBe(1);
    expect(duplicateAudit).toHaveLength(1);
  });

  it('returns distinct trades when IDs differ', () => {
    const t1 = trade({ canonicalTradeId: 'a' });
    const t2 = trade({ canonicalTradeId: 'b' });
    const { canonical } = deduplicateByCanonicalId([t1, t2]);
    expect(canonical).toHaveLength(2);
  });
});

describe('classifyResearchExclusion', () => {
  it('returns null for a clean closed trade', () => {
    expect(classifyResearchExclusion(trade())).toBe(null);
  });

  it('returns ACTIVE for an unclosed trade', () => {
    expect(classifyResearchExclusion(trade({ closed: false }))).toBe(CANONICAL_RESEARCH_EXCLUSION.ACTIVE);
  });

  it('returns FINALIZATION_INVALID when data quality is INVALID', () => {
    expect(classifyResearchExclusion(trade({ finalizationDataQuality: 'INVALID' }))).toBe(CANONICAL_RESEARCH_EXCLUSION.FINALIZATION_INVALID);
  });

  it('returns ENTRY_PRICE_FALLBACK_USED_AS_FINAL when final price is the entry fallback', () => {
    expect(classifyResearchExclusion(trade({ finalPriceIsEntryFallback: true }))).toBe(CANONICAL_RESEARCH_EXCLUSION.ENTRY_PRICE_FALLBACK_USED_AS_FINAL);
  });

  it('returns FINAL_PNL_MISSING when PnL is absent', () => {
    expect(classifyResearchExclusion(trade({ feeAdjustedFinalPnlPct: undefined, finalPnlPct: undefined }))).toBe(CANONICAL_RESEARCH_EXCLUSION.FINAL_PNL_MISSING);
  });
});

describe('compareCanonicalTradeSnapshots', () => {
  it('prefers finalized over active', () => {
    const active   = trade({ closed: false });
    const finalized = trade({ closed: true });
    expect(compareCanonicalTradeSnapshots(active, finalized)).toBeGreaterThan(0);
    expect(compareCanonicalTradeSnapshots(finalized, active)).toBeLessThan(0);
  });

  it('prefers higher lifecycleRevision', () => {
    const old  = trade({ lifecycleRevision: 1 });
    const newer = trade({ lifecycleRevision: 5 });
    expect(compareCanonicalTradeSnapshots(old, newer)).toBeGreaterThan(0);
  });
});
