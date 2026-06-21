// Retained for backward compatibility — arbiter is superseded by
// longLifecycleCloseCoordinator for new arbitration logic.
// The original synchronous-commit tests documented broken behavior and have
// been removed.  New tests live in longLifecycleCloseCoordinator.test.js.

import { describe, it, expect } from 'vitest';
import { LongCloseArbiter, createLongCloseArbiter } from './longCloseArbiter.js';
import { PROFIT_LOCK_FLOOR_OUTCOME } from './profitLockProtection.js';

function makeTrade(overrides = {}) {
  return {
    id: 'test-trade-1',
    entryPrice: 100,
    profitLockProtectedFloorPrice: 102,
    stopLossPrice: 99,
    ...overrides,
  };
}

describe('LongCloseArbiter — single commit invariant', () => {
  it('commits exactly once; later requests are suppressed', () => {
    const commits = [];
    const arbiter = new LongCloseArbiter();
    arbiter.init('rev-1');
    arbiter.onCommit(result => commits.push(result));

    const trade = makeTrade();
    const win1 = arbiter.requestClose({ trade, triggerReason: 'STOP_LOSS', triggerSource: 'WS', observedPrice: 99, observedAt: 1000 });
    const win2 = arbiter.requestClose({ trade, triggerReason: 'TIMEOUT',   triggerSource: 'REST', observedPrice: 99, observedAt: 2000 });

    expect(win1).toBe(true);
    expect(win2).toBe(false);
    expect(commits).toHaveLength(1);
    expect(commits[0].canonicalCloseReason).toBe('STOP_LOSS');
    const trail = arbiter.getAuditTrail();
    expect(trail.suppressedRequests).toHaveLength(1);
    expect(trail.suppressedRequests[0].triggerReason).toBe('TIMEOUT');
  });
});

describe('LongCloseArbiter — floor outcome classification', () => {
  it('records PRESERVED when profit-lock exit price is at or above floor', () => {
    const commits = [];
    const arbiter = new LongCloseArbiter();
    arbiter.init('rev-4');
    arbiter.onCommit(result => commits.push(result));

    arbiter.requestClose({
      trade: makeTrade({ profitLockProtectedFloorPrice: 102 }),
      triggerReason: 'PROFIT_LOCK',
      triggerSource: 'WS',
      observedPrice: 102.5,
      observedAt: 1000,
    });

    expect(commits[0].profitLockFloorOutcome).toBe(PROFIT_LOCK_FLOOR_OUTCOME.PRESERVED);
  });

  it('records MISSED when profit-lock exit price is below floor', () => {
    const commits = [];
    const arbiter = new LongCloseArbiter();
    arbiter.init('rev-5');
    arbiter.onCommit(result => commits.push(result));

    arbiter.requestClose({
      trade: makeTrade({ profitLockProtectedFloorPrice: 102 }),
      triggerReason: 'PROFIT_LOCK',
      triggerSource: 'WS',
      observedPrice: 101.5,
      observedAt: 1000,
    });

    expect(commits[0].profitLockFloorOutcome).toBe(PROFIT_LOCK_FLOOR_OUTCOME.MISSED);
    expect(commits[0].profitLockFloorOutcomeReason).toBeTruthy();
  });

  it('records NOT_APPLICABLE for non-profit-lock exits', () => {
    const commits = [];
    const arbiter = new LongCloseArbiter();
    arbiter.init('rev-6');
    arbiter.onCommit(result => commits.push(result));

    arbiter.requestClose({ trade: makeTrade(), triggerReason: 'TIMEOUT', triggerSource: 'WS', observedPrice: 101, observedAt: 1000 });
    expect(commits[0].profitLockFloorOutcome).toBe(PROFIT_LOCK_FLOOR_OUTCOME.NOT_APPLICABLE);
  });
});

describe('createLongCloseArbiter factory', () => {
  it('wires onCommit callback via factory', () => {
    const commits = [];
    const trade = makeTrade();
    const arbiter = createLongCloseArbiter(trade, result => commits.push(result));

    arbiter.requestClose({ trade, triggerReason: 'TAKE_PROFIT', triggerSource: 'REST', observedPrice: 105, observedAt: 1000 });
    expect(commits).toHaveLength(1);
    expect(commits[0].canonicalCloseReason).toBe('TAKE_PROFIT');
  });
});
