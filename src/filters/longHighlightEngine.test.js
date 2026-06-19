import { describe, it, expect } from 'vitest';
import { curateHighlights, sortSharpToBroad, HIGHLIGHT_DEFAULTS } from './longHighlightEngine.js';

// Build a synthetic corpus with a known edge:
//   - High AES (>=70) AND gate pass → strong positive trades
//   - Otherwise → weak/negative
// plus a synergistic interaction: AES>=70 alone is good, gate pass alone is mild,
// but the conjunction is markedly better.
function makeCorpus() {
  const trades = [];
  let id = 0;
  const mk = (over) => ({
    id: `t${id++}`, symbol: 'AAA', entryTime: id, closed: true,
    longParentBucket: 'TOP_GAINER_LONGS', leverage: 25,
    longGateWouldPass: false, longAesScore: 40,
    longShadowDecision: 'WOULD_ALLOW',
    feeAdjustedNormPnlPct: 0,
    ...over,
  });

  // 30 strong: AES high + gate pass → avg ~ +3
  for (let i = 0; i < 30; i++) trades.push(mk({ longAesScore: 85, longGateWouldPass: true, feeAdjustedNormPnlPct: 3 + (i % 3) * 0.2 }));
  // 25 mild: AES high, gate fail → avg ~ +0.6
  for (let i = 0; i < 25; i++) trades.push(mk({ longAesScore: 80, longGateWouldPass: false, feeAdjustedNormPnlPct: 0.6 }));
  // 25 mild: gate pass, AES low → avg ~ +0.5
  for (let i = 0; i < 25; i++) trades.push(mk({ longAesScore: 45, longGateWouldPass: true, feeAdjustedNormPnlPct: 0.5 }));
  // 40 poor baseline drag → avg ~ -1.2
  for (let i = 0; i < 40; i++) trades.push(mk({ longAesScore: 35, longGateWouldPass: false, feeAdjustedNormPnlPct: -1.2 }));
  return trades;
}

describe('curateHighlights', () => {
  it('returns a baseline and empty curation for too-few trades', () => {
    const r = curateHighlights([{ id: 'x', closed: true, feeAdjustedNormPnlPct: 1 }]);
    expect(r.baseline.n).toBe(1);
    expect(r.filters).toEqual([]);
    expect(r.combos).toEqual([]);
  });

  it('computes a baseline over the population', () => {
    const r = curateHighlights(makeCorpus());
    expect(r.baseline.n).toBe(120);
    expect(typeof r.baseline.avg).toBe('number');
    expect(r.metricField).toBe('feeAdjustedNormPnlPct');
  });

  it('surfaces high-AES and gate-pass as positive-edge filters', () => {
    const r = curateHighlights(makeCorpus());
    const fields = new Set(r.filters.map(f => f.field));
    expect(fields.has('longAesScore')).toBe(true);
    expect(fields.has('longGateWouldPass')).toBe(true);
    // Every surfaced filter must beat the baseline (positive lift).
    for (const f of r.filters) expect(f.edgeScore).toBeGreaterThan(0);
  });

  it('ranks filters by edge and assigns coverage bands', () => {
    const r = curateHighlights(makeCorpus());
    expect(r.filters[0].rank).toBe(1);
    for (const f of r.filters) expect(['SHARP', 'STRONG', 'BROAD']).toContain(f.band);
    // edgeScore is monotonically non-increasing by rank
    for (let i = 1; i < r.filters.length; i++) {
      expect(r.filters[i - 1].edgeScore).toBeGreaterThanOrEqual(r.filters[i].edgeScore);
    }
  });

  it('discovers the AES∧gate synergy combo with positive interaction', () => {
    const r = curateHighlights(makeCorpus());
    expect(r.combos.length).toBeGreaterThan(0);
    const top = r.combos[0];
    // The strongest combo should out-lift the population and beat its members.
    expect(top.lift).toBeGreaterThan(r.baseline.avg);
    expect(top.members.length).toBeGreaterThanOrEqual(2);
    expect(top.predicates.length).toBe(top.members.length);
    // Combos carry applyable predicates.
    expect(top.predicates[0]).toHaveProperty('filterId');
    expect(top.predicates[0]).toHaveProperty('operator');
  });

  it('respects minimum support (no flukey tiny-sample signals)', () => {
    const r = curateHighlights(makeCorpus());
    for (const f of r.filters) expect(f.n).toBeGreaterThanOrEqual(HIGHLIGHT_DEFAULTS.minSupport);
    for (const c of r.combos) expect(c.n).toBeGreaterThanOrEqual(HIGHLIGHT_DEFAULTS.minComboSupport);
  });

  it('curates labels by edge', () => {
    const r = curateHighlights(makeCorpus());
    expect(Array.isArray(r.labels)).toBe(true);
    for (let i = 1; i < r.labels.length; i++) {
      expect(r.labels[i - 1].edgeScore).toBeGreaterThanOrEqual(r.labels[i].edgeScore);
    }
  });

  it('never uses live/exit fields as entry evidence', () => {
    const r = curateHighlights(makeCorpus());
    for (const f of r.filters) {
      expect(f.field).not.toBe('runnerCapturePotentialScore');
      expect(f.field).not.toBe('runnerCapturePotentialTier');
    }
  });
});

describe('sortSharpToBroad', () => {
  it('orders SHARP before STRONG before BROAD, then by edge', () => {
    const items = [
      { band: 'BROAD', edgeScore: 5 },
      { band: 'SHARP', edgeScore: 1 },
      { band: 'STRONG', edgeScore: 9 },
      { band: 'SHARP', edgeScore: 2 },
    ];
    const sorted = sortSharpToBroad(items);
    expect(sorted.map(s => s.band)).toEqual(['SHARP', 'SHARP', 'STRONG', 'BROAD']);
    expect(sorted[0].edgeScore).toBe(2); // higher-edge SHARP first
  });
});

// ─── REVIEW HARDENING (Highlights #1–#5 + presentation) ───────────────────────
describe('curateHighlights — review hardening', () => {
  it('always carries the in-sample disclaimer', () => {
    const r = curateHighlights(makeCorpus());
    expect(r.disclaimer).toMatch(/IN-SAMPLE/);
    expect(r.disclaimer).toMatch(/NOT VALIDATED/);
  });

  it('single-run corpus grades everything DISCOVERY (no false validation)', () => {
    const r = curateHighlights(makeCorpus()); // all NO_RUN / NO_SESSION
    for (const f of r.filters) expect(f.validationGrade).toBe('DISCOVERY');
    for (const f of r.filters) expect(f.promotable).toBe(false);
    for (const c of r.combos) expect(c.validationGrade).toBe('DISCOVERY');
  });

  it('does NOT mix units — margin-only records are excluded from baseline', () => {
    const corpus = makeCorpus();
    // add 10 records that only have a margin field (no normalized metric)
    for (let i = 0; i < 10; i++) {
      corpus.push({ id: `m${i}`, symbol: 'AAA', entryTime: 9000 + i, closed: true, feeAdjustedMarginPnlPct: 50 });
    }
    const r = curateHighlights(corpus);
    expect(r.baseline.n).toBe(120);          // unchanged — margin-only excluded
    expect(r.mixedUnitExcludedCount).toBe(10);
  });

  it('promotes a signal to CROSS_SESSION_VALIDATED only with run + session breadth', () => {
    // Build a strong signal that is consistently positive across 4 runs / 3 sessions.
    const trades = [];
    let id = 0;
    for (let run = 0; run < 4; run++) {
      for (let i = 0; i < 12; i++) {
        const session = `S${run % 3}`;
        const strong = i < 8;
        trades.push({
          id: `g${id++}`, symbol: `SYM${i % 5}`, entryTime: id, closed: true,
          run, sessionId: session,
          longGateWouldPass: strong, longAesScore: strong ? 88 : 40,
          longShadowDecision: 'WOULD_ALLOW',
          feeAdjustedNormPnlPct: strong ? 3 : -1,
        });
      }
    }
    const r = curateHighlights(trades);
    const gate = r.filters.find(f => f.field === 'longGateWouldPass');
    expect(gate).toBeDefined();
    expect(gate.consistency.runCount).toBeGreaterThanOrEqual(3);
    expect(['CROSS_RUN_VALIDATED', 'CROSS_SESSION_VALIDATED']).toContain(gate.validationGrade);
    expect(gate.promotable).toBe(true);
  });
});
