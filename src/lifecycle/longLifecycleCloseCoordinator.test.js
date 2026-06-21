import { describe, it, expect, vi } from 'vitest';
import { createLongLifecycleCloseCoordinator, COORDINATOR_STATE } from './longLifecycleCloseCoordinator.js';

function makeTrade(overrides = {}) {
  return {
    canonicalTradeId:  'trade-abc',
    lifecycleRevision: 1,
    ...overrides,
  };
}

function makeCandidate(overrides = {}) {
  return {
    tradeKey:          'trade-abc:1',
    lifecycleRevision: 1,
    triggerReason:     'STOP_LOSS',
    triggerSource:     'REST_POLL',
    observedPrice:     99,
    observedAt:        1000,
    exchangeEventTime: null,
    sourcePrecision:   'REST_POLL_INTERVAL_ESTIMATE',
    sourceFreshnessMs: 100,
    triggerEvidence:   {},
    ...overrides,
  };
}

function makeSync(windowMs = 0) {
  let pending = [];
  const schedule = (fn, ms) => {
    const handle = { fn, ms };
    pending.push(handle);
    return handle;
  };
  const cancelSchedule = handle => {
    pending = pending.filter(h => h !== handle);
  };
  const flush = () => {
    const toRun = [...pending];
    pending = [];
    for (const h of toRun) h.fn();
  };
  return { schedule, cancelSchedule, flush };
}

describe('longLifecycleCloseCoordinator — arbitration window', () => {
  it('later callback with earlier exchangeEventTime replaces the provisional winner before flush', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25,
      now: () => 1000,
      schedule: timer.schedule,
      cancelSchedule: timer.cancelSchedule,
    });

    const trade = makeTrade();
    coordinator.registerTrade(trade);

    const closes = [];
    coordinator.onCloseRequested('trade-abc:1', winner => closes.push(winner));

    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'STOP_LOSS', observedAt: 2000, exchangeEventTime: 1800,
    }));
    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'TAKE_PROFIT', observedAt: 2001, exchangeEventTime: 1500,
    }));

    timer.flush(); // expire arbitration window

    expect(closes).toHaveLength(1);
    expect(closes[0].triggerReason).toBe('TAKE_PROFIT'); // earlier evt time wins
    expect(closes[0].exchangeEventTime).toBe(1500);
  });

  it('equal-time TAKE_PROFIT beats STOP_LOSS', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);
    const closes = [];
    coordinator.onCloseRequested('trade-abc:1', w => closes.push(w));

    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'STOP_LOSS',   observedAt: 1000, exchangeEventTime: 900,
    }));
    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'TAKE_PROFIT', observedAt: 1001, exchangeEventTime: 900,
    }));

    timer.flush();

    expect(closes[0].triggerReason).toBe('TAKE_PROFIT');
  });

  it('earlier STOP_LOSS beats later TAKE_PROFIT regardless of callback order', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);
    const closes = [];
    coordinator.onCloseRequested('trade-abc:1', w => closes.push(w));

    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'TAKE_PROFIT', observedAt: 2001, exchangeEventTime: 1800,
    }));
    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'STOP_LOSS',   observedAt: 2000, exchangeEventTime: 1500,
    }));

    timer.flush();

    expect(closes[0].triggerReason).toBe('STOP_LOSS');
    expect(closes[0].exchangeEventTime).toBe(1500);
  });

  it('TIMEOUT cannot beat any earlier price-triggered candidate', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);
    const closes = [];
    coordinator.onCloseRequested('trade-abc:1', w => closes.push(w));

    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'TIMEOUT', observedAt: 1000, exchangeEventTime: null,
    }));
    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'STOP_LOSS', observedAt: 1001, exchangeEventTime: null,
    }));

    timer.flush();

    // STOP_LOSS has higher priority than TIMEOUT (lower number)
    expect(closes[0].triggerReason).toBe('STOP_LOSS');
  });

  it('REST and WebSocket candidates from same market movement yield exactly one close request', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);
    const closes = [];
    coordinator.onCloseRequested('trade-abc:1', w => closes.push(w));

    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'STOP_LOSS', triggerSource: 'REST_POLL',   observedAt: 2000, exchangeEventTime: null,
    }));
    coordinator.submitCloseCandidate(makeCandidate({
      triggerReason: 'STOP_LOSS', triggerSource: 'WS_AGG_TRADE', observedAt: 2001, exchangeEventTime: 1900,
    }));

    timer.flush();

    expect(closes).toHaveLength(1);
  });

  it('candidate after CLOSE_REQUESTED is suppressed and recorded', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);
    coordinator.onCloseRequested('trade-abc:1', () => {});

    coordinator.submitCloseCandidate(makeCandidate({ triggerReason: 'STOP_LOSS' }));
    timer.flush(); // → CLOSE_REQUESTED

    coordinator.submitCloseCandidate(makeCandidate({ triggerReason: 'TAKE_PROFIT' }));

    const audit = coordinator.getAudit('trade-abc:1');
    expect(audit.state).toBe(COORDINATOR_STATE.CLOSE_REQUESTED);
    expect(audit.suppressedCandidates.some(c => c.suppressReason === 'ALREADY_COMMITTED')).toBe(true);
  });

  it('candidate after CLOSE_COMMITTED is suppressed and recorded', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);
    coordinator.onCloseRequested('trade-abc:1', () => {});

    coordinator.submitCloseCandidate(makeCandidate({ triggerReason: 'STOP_LOSS' }));
    timer.flush();
    coordinator.commitResolvedClose('trade-abc:1', { commitId: 'c1' });

    coordinator.submitCloseCandidate(makeCandidate({ triggerReason: 'TAKE_PROFIT' }));

    const audit = coordinator.getAudit('trade-abc:1');
    expect(audit.state).toBe(COORDINATOR_STATE.CLOSE_COMMITTED);
    expect(audit.commitId).toBe('c1');
    expect(audit.suppressedCandidates.some(c => c.suppressReason === 'ALREADY_COMMITTED')).toBe(true);
  });

  it('mismatched lifecycleRevision candidate is rejected', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);

    coordinator.submitCloseCandidate(makeCandidate({
      lifecycleRevision: 99, // stale
    }));

    const audit = coordinator.getAudit('trade-abc:1');
    expect(audit.suppressedCandidates[0].suppressReason).toBe('STALE_LIFECYCLE_REVISION');
  });

  it('coordinator cleanup removes trade state after commit', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);
    coordinator.onCloseRequested('trade-abc:1', () => {});

    coordinator.submitCloseCandidate(makeCandidate());
    timer.flush();
    coordinator.commitResolvedClose('trade-abc:1', { commitId: 'done' });
    coordinator.cancelTrade('trade-abc:1', 'CLEANUP');

    expect(coordinator.getAudit('trade-abc:1')).toBeNull();
  });

  it('arbitration window expiry triggers selection even with only one candidate', () => {
    const timer = makeSync();
    const coordinator = createLongLifecycleCloseCoordinator({
      arbitrationWindowMs: 25, now: () => 1000,
      schedule: timer.schedule, cancelSchedule: timer.cancelSchedule,
    });
    const trade = makeTrade();
    coordinator.registerTrade(trade);
    const closes = [];
    coordinator.onCloseRequested('trade-abc:1', w => closes.push(w));

    coordinator.submitCloseCandidate(makeCandidate({ triggerReason: 'TIMEOUT' }));
    expect(closes).toHaveLength(0); // not yet — window hasn't expired

    timer.flush();

    expect(closes).toHaveLength(1);
    expect(closes[0].triggerReason).toBe('TIMEOUT');
  });
});
