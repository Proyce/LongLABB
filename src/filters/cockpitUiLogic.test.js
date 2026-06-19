import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LONG_FILTER_STATE,
  addGroup, removeGroup, duplicateGroup, reorderGroups, reorderPredicate,
  setGroupOperator, setGroupComposition,
  addPredicateToGroup, makePredicate,
  serializeFilterStateToURL, deserializeFilterStateFromURL,
  makeSavedView, restoreSavedView,
  RESEARCH_COCKPIT_STORAGE_KEY,
} from './longFilterState.js';
import { compareFilterConfigurations } from './longCompareMode.js';

function seededState() {
  let s = { ...DEFAULT_LONG_FILTER_STATE, groups: [] };
  s = addGroup(s);
  const gid = s.groups[0].id;
  s = addPredicateToGroup(s, gid, makePredicate('LONG_AES_SCORE', 'GTE', 70));
  s = addPredicateToGroup(s, gid, makePredicate('LONG_GATE_WOULD_PASS', 'IS_TRUE'));
  return s;
}

// ─── §17: GROUP OPERATIONS ──────────────────────────────────────────────────

describe('§17 group operations', () => {
  it('adds and removes groups', () => {
    let s = addGroup({ ...DEFAULT_LONG_FILTER_STATE, groups: [] });
    expect(s.groups).toHaveLength(1);
    s = removeGroup(s, s.groups[0].id);
    expect(s.groups).toHaveLength(0);
  });

  it('duplicates a group with a new id directly after the original', () => {
    const s = seededState();
    const dup = duplicateGroup(s, s.groups[0].id);
    expect(dup.groups).toHaveLength(2);
    expect(dup.groups[1].id).not.toBe(dup.groups[0].id);
    expect(dup.groups[1].predicates).toHaveLength(2);
  });

  it('reorders groups', () => {
    let s = addGroup(addGroup({ ...DEFAULT_LONG_FILTER_STATE, groups: [] }));
    const [a, b] = s.groups.map(g => g.id);
    s = reorderGroups(s, 0, 1);
    expect(s.groups.map(g => g.id)).toEqual([b, a]);
  });

  it('reorders predicates within a group', () => {
    const s = seededState();
    const gid = s.groups[0].id;
    const moved = reorderPredicate(s, gid, 0, 1);
    expect(moved.groups[0].predicates[0].filterId).toBe('LONG_GATE_WOULD_PASS');
  });

  it('sets group predicate-join and cross-group composition operators', () => {
    let s = seededState();
    s = setGroupOperator(s, s.groups[0].id, 'NONE_OF');
    expect(s.groups[0].operator).toBe('NONE_OF');
    s = setGroupComposition(s, 'ANY_GROUPS');
    expect(s.groupOperator).toBe('ANY_GROUPS');
  });
});

// ─── §20: URL STATE + SAVED VIEWS ────────────────────────────────────────────

describe('§20 URL state and saved views', () => {
  it('uses the canonical storage key', () => {
    expect(RESEARCH_COCKPIT_STORAGE_KEY).toBe('longlab.researchCockpit.v4');
  });

  it('round-trips state through URL serialization', () => {
    const s = setGroupComposition(seededState(), 'ANY_GROUPS');
    const encoded = serializeFilterStateToURL(s);
    const decoded = deserializeFilterStateFromURL(encoded);
    expect(decoded.groupOperator).toBe('ANY_GROUPS');
    expect(decoded.groups).toHaveLength(1);
    expect(decoded.groups[0].predicates).toHaveLength(2);
    expect(decoded.groups[0].predicates[0].filterId).toBe('LONG_AES_SCORE');
  });

  it('falls back to defaults on malformed URL state', () => {
    expect(deserializeFilterStateFromURL('not-valid-base64!!!').groups).toEqual([]);
    expect(deserializeFilterStateFromURL(null)).toMatchObject({ groups: [] });
    expect(deserializeFilterStateFromURL(btoa('{"garbage":true}')).groups).toEqual([]);
  });

  it('saves and restores a named view', () => {
    const s = seededState();
    const view = makeSavedView('AES 70+', s);
    expect(view.name).toBe('AES 70+');
    const restored = restoreSavedView(view);
    expect(restored.groups[0].predicates).toHaveLength(2);
  });
});

// ─── §19: COMPARE MODE ───────────────────────────────────────────────────────

describe('§19 compare mode', () => {
  const trades = [
    { id: 't1', symbol: 'AAA', entryTime: 1, closed: true, closeReason: 'AUTO_END', closeReasonDetail: 'RUN_AUTO_END', longParentBucket: 'TOP_GAINER_LONGS', leverage: 25, longAesScore: 90, longGateWouldPass: true,  feeAdjustedNormPnlPct: 2.0, feeAdjustedMarginPnlPct: 1.5 },
    { id: 't2', symbol: 'BBB', entryTime: 2, closed: true, closeReason: 'SL',       closeReasonDetail: 'STOP_LOSS',    longParentBucket: 'TOP_LOSER_LONGS',  leverage: 25, longAesScore: 40, longGateWouldPass: false, feeAdjustedNormPnlPct: -1.0, feeAdjustedMarginPnlPct: -0.8 },
    { id: 't3', symbol: 'CCC', entryTime: 3, closed: true, closeReason: 'AUTO_END', closeReasonDetail: 'RUN_AUTO_END', longParentBucket: 'TOP_GAINER_LONGS', leverage: 10, longAesScore: 80, longGateWouldPass: true,  feeAdjustedNormPnlPct: 1.0, feeAdjustedMarginPnlPct: 0.9 },
  ];

  const stateAll = { ...DEFAULT_LONG_FILTER_STATE, groups: [], pnlMetric: 'NET_AFTER_FEES' };
  function stateAesGte(threshold) {
    let s = addGroup({ ...DEFAULT_LONG_FILTER_STATE, groups: [], pnlMetric: 'NET_AFTER_FEES' });
    s = addPredicateToGroup(s, s.groups[0].id, makePredicate('LONG_AES_SCORE', 'GTE', threshold));
    return s;
  }

  it('runs both configs through the real engine and reports overlap/A-only/B-only', () => {
    const result = compareFilterConfigurations(trades, stateAesGte(85), stateAesGte(75));
    expect(result.metricField).toBe('feeAdjustedNormPnlPct');
    expect(result.a.tradeCount).toBeGreaterThanOrEqual(0);
    expect(result.b.tradeCount).toBeGreaterThanOrEqual(result.a.tradeCount);
    expect(result).toHaveProperty('overlapCount');
    expect(result).toHaveProperty('aOnlyCount');
    expect(result).toHaveProperty('bOnlyCount');
  });

  it('computes default-metric stats and bucket breakdowns', () => {
    const result = compareFilterConfigurations(trades, stateAll, stateAll);
    expect(result.a.tradeCount).toBe(result.b.tradeCount);
    expect(result.a).toHaveProperty('avgMetric');
    expect(result.a).toHaveProperty('feeWinRatePct');
    expect(result.a).toHaveProperty('slRatePct');
    expect(result.a).toHaveProperty('profitFactor');
    expect(result.a).toHaveProperty('topGainer');
    expect(result.a).toHaveProperty('topLoser');
    expect(result.a).toHaveProperty('autoEndBreakdown');
  });

  it('reports session positivity and close-reason / leverage breakdowns (review item 8)', () => {
    const result = compareFilterConfigurations(trades, stateAll, stateAll);
    expect(result.a).toHaveProperty('sessionCount');
    expect(result.a).toHaveProperty('positiveSessionCount');
    expect(result.a).toHaveProperty('negativeSessionCount');
    expect(result.a.positiveSessionCount + result.a.negativeSessionCount).toBe(result.a.sessionCount);
    expect(result.a).toHaveProperty('closeReasonBreakdown');
    expect(result.a).toHaveProperty('leverageBreakdown');
    expect(result.a).toHaveProperty('timeoutBreakdown');
    expect(result.a).toHaveProperty('slBreakdown');
    // close-reason counts sum to the matched trade count
    const crTotal = Object.values(result.a.closeReasonBreakdown).reduce((s, n) => s + n, 0);
    expect(crTotal).toBe(result.a.tradeCount);
  });
});
