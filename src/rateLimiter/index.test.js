import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RL, WEIGHTS, WEIGHT_OF, RATE_LIMIT_PRIORITY,
  rollWindowIfNeeded, effectiveWeight, currentMode, snapshot,
  apiFetch, onRateLimitChange, endRun, _resetForTests,
} from './index.js';

const BASE = 'https://fapi.binance.com/fapi/v1';

// ─── WEIGHT_OF ────────────────────────────────────────────────────────────────
describe('WEIGHT_OF', () => {
  it('returns 40 for /ticker/24hr', () => {
    expect(WEIGHT_OF(`${BASE}/ticker/24hr`)).toBe(40);
  });

  it('returns 2 for /ticker/price all-symbol fallback', () => {
    expect(WEIGHT_OF(`${BASE}/ticker/price`)).toBe(2);
  });

  it('returns 10 for /premiumIndex', () => {
    expect(WEIGHT_OF(`${BASE}/premiumIndex`)).toBe(10);
  });

  it('returns 2 for /depth', () => {
    expect(WEIGHT_OF(`${BASE}/depth?symbol=BTCUSDT&limit=5`)).toBe(2);
  });

  it('returns 1 for /openInterest', () => {
    expect(WEIGHT_OF(`${BASE}/openInterest?symbol=BTCUSDT`)).toBe(1);
  });

  it('returns 1 for /klines limit ≤ 100', () => {
    expect(WEIGHT_OF(`${BASE}/klines?symbol=BTCUSDT&interval=1m&limit=20`)).toBe(1);
    expect(WEIGHT_OF(`${BASE}/klines?symbol=BTCUSDT&interval=1m&limit=100`)).toBe(1);
  });

  it('returns 2 for /klines 101–500', () => {
    expect(WEIGHT_OF(`${BASE}/klines?symbol=BTCUSDT&interval=1m&limit=101`)).toBe(2);
    expect(WEIGHT_OF(`${BASE}/klines?symbol=BTCUSDT&interval=1m&limit=500`)).toBe(2);
  });

  it('returns 5 for /klines 501–1000', () => {
    expect(WEIGHT_OF(`${BASE}/klines?symbol=BTCUSDT&interval=1m&limit=501`)).toBe(5);
    expect(WEIGHT_OF(`${BASE}/klines?symbol=BTCUSDT&interval=1m&limit=1000`)).toBe(5);
  });

  it('returns 10 for /klines > 1000', () => {
    expect(WEIGHT_OF(`${BASE}/klines?symbol=BTCUSDT&interval=1m&limit=1001`)).toBe(10);
    expect(WEIGHT_OF(`${BASE}/klines?symbol=BTCUSDT&interval=1m&limit=1500`)).toBe(10);
  });

  it('returns 1 (default) for unknown paths', () => {
    expect(WEIGHT_OF(`${BASE}/someUnknown`)).toBe(1);
  });

  it('handles malformed url without throwing', () => {
    expect(() => WEIGHT_OF('not-a-url')).not.toThrow();
    expect(WEIGHT_OF('not-a-url')).toBe(1);
  });
});

// ─── rollWindowIfNeeded ────────────────────────────────────────────────────────
describe('rollWindowIfNeeded', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('zeroes committed when Date.now() crosses a UTC minute boundary', () => {
    // Start at :59.500 of some minute
    const minuteEdge = Math.floor(Date.now() / 60_000) * 60_000;
    vi.setSystemTime(minuteEdge + 59_500);

    // Seed windowStartMs by calling rollWindowIfNeeded
    rollWindowIfNeeded();
    const snapBefore = snapshot();
    expect(snapBefore.committed).toBe(0);

    // Advance past the boundary
    vi.setSystemTime(minuteEdge + 60_500);
    rollWindowIfNeeded();

    // windowResetMs should now point to the next minute
    const snapAfter = snapshot();
    expect(snapAfter.committed).toBe(0);
    expect(snapAfter.windowResetMs).toBeGreaterThan(minuteEdge + 60_000);
  });
});

// ─── effectiveWeight ──────────────────────────────────────────────────────────
describe('effectiveWeight', () => {
  beforeEach(() => _resetForTests());

  it('equals max(committed, measured) — both zero initially', () => {
    const snap = snapshot();
    expect(snap.effectiveWeight).toBe(Math.max(snap.committed, snap.measured));
    expect(snap.effectiveWeight).toBe(0);
  });

  it('headroom = limit - effectiveWeight', () => {
    const snap = snapshot();
    expect(snap.headroom).toBe(snap.limit - snap.effectiveWeight);
  });

  it('pctOfLimit = effectiveWeight / limit * 100', () => {
    const snap = snapshot();
    expect(snap.pctOfLimit).toBeCloseTo(snap.effectiveWeight / snap.limit * 100, 5);
  });
});

// ─── Mode transitions ─────────────────────────────────────────────────────────
describe('currentMode', () => {
  beforeEach(() => _resetForTests());

  it('is OK when effectiveWeight is 0', () => {
    expect(snapshot().mode).toBe('OK');
  });

  it('isFrozen matches mode === FROZEN', () => {
    const snap = snapshot();
    expect(snap.isFrozen).toBe(snap.mode === 'FROZEN');
  });

  it('isBanned matches banUntil > now', () => {
    const snap = snapshot();
    expect(snap.isBanned).toBe(snap.banUntil > Date.now());
  });

  it('throttling is true when THROTTLE or FROZEN', () => {
    const snap = snapshot();
    expect(snap.throttling).toBe(snap.mode === 'THROTTLE' || snap.mode === 'FROZEN');
  });
});

// ─── 429 response handling ────────────────────────────────────────────────────
describe('apiFetch 429 handling', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns RATE_LIMITED error code on 429', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 429,
      headers: { get: (h) => h === 'retry-after' ? '15' : null },
    });
    vi.stubGlobal('fetch', mockFetch);

    let caughtCode;
    // Attach catch before running timers to avoid unhandled-rejection warning
    const p = apiFetch(`${BASE}/ticker/24hr`).catch(e => { caughtCode = e.code; });
    await vi.runAllTimersAsync();
    await p;
    expect(caughtCode).toBe('RATE_LIMITED');
  });
});

// ─── 418 response handling ────────────────────────────────────────────────────
describe('apiFetch 418 handling', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns IP_BANNED error code on 418', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 418,
      headers: { get: (h) => h === 'retry-after' ? '300' : null },
    });
    vi.stubGlobal('fetch', mockFetch);

    let caughtCode;
    const p = apiFetch(`${BASE}/ticker/24hr`).catch(e => { caughtCode = e.code; });
    await vi.runAllTimersAsync();
    await p;
    expect(caughtCode).toBe('IP_BANNED');
  });
});

// ─── committed ledger: WEIGHT_OF credited at launch ──────────────────────────
describe('committed ledger', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('committed increments by WEIGHT_OF(url) on launch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', mockFetch);

    const before = snapshot().committed;
    const url = `${BASE}/ticker/24hr`;
    const expectedW = WEIGHT_OF(url); // 40

    const p = apiFetch(url).catch(() => {});
    await vi.runAllTimersAsync();
    await p;

    const after = snapshot().committed;
    expect(after - before).toBe(expectedW);
  });

  it('measured > committed snaps committed up on response', async () => {
    // Binance reports 500 but we only committed 40 (untracked external call)
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: (h) => h === 'x-mbx-used-weight-1m' ? '500' : null },
    });
    vi.stubGlobal('fetch', mockFetch);

    const p = apiFetch(`${BASE}/ticker/24hr`).catch(() => {});
    await vi.runAllTimersAsync();
    await p;

    const snap = snapshot();
    expect(snap.measured).toBe(500);
    // committed should snap up to measured
    expect(snap.committed).toBeGreaterThanOrEqual(500);
  });
});

// ─── Snapshot shape ───────────────────────────────────────────────────────────
describe('snapshot shape', () => {
  beforeEach(() => _resetForTests());

  it('has all required new keys', () => {
    const snap = snapshot();
    const required = [
      'mode', 'effectiveWeight', 'committed', 'measured', 'limit',
      'freezeCeiling', 'softCeiling', 'headroom', 'pctOfLimit',
      'windowResetMs', 'inflight', 'inflightByPriority', 'waiting', 'byPriority',
      'isFrozen', 'isBackoff', 'isBanned', 'backoffUntil', 'banUntil',
    ];
    for (const k of required) {
      expect(snap, `missing key: ${k}`).toHaveProperty(k);
    }
  });

  it('has legacy keys: weight, calls, throttling', () => {
    const snap = snapshot();
    expect('weight' in snap).toBe(true);
    expect(typeof snap.calls).toBe('number');
    expect(typeof snap.throttling).toBe('boolean');
  });

  it('weight is alias for measured', () => {
    const snap = snapshot();
    expect(snap.weight).toBe(snap.measured);
  });

  it('windowResetMs is the next UTC minute boundary', () => {
    const snap = snapshot();
    const msIntoMinute = Date.now() % 60_000;
    const msToNextMin  = 60_000 - msIntoMinute;
    expect(snap.windowResetMs - Date.now()).toBeLessThanOrEqual(60_000);
    expect(snap.windowResetMs - Date.now()).toBeGreaterThanOrEqual(0);
  });

  it('byPriority has CRITICAL HIGH NORMAL LOW keys', () => {
    const snap = snapshot();
    expect(snap.byPriority).toHaveProperty('CRITICAL');
    expect(snap.byPriority).toHaveProperty('HIGH');
    expect(snap.byPriority).toHaveProperty('NORMAL');
    expect(snap.byPriority).toHaveProperty('LOW');
  });
});

// ─── RL constants ─────────────────────────────────────────────────────────────
describe('RL constants', () => {
  it('FREEZE_CEILING is 65% of WEIGHT_PER_MIN', () => {
    expect(RL.FREEZE_CEILING / RL.WEIGHT_PER_MIN).toBeCloseTo(0.65, 2);
  });

  it('SOFT_CEILING is below FREEZE_CEILING', () => {
    expect(RL.SOFT_CEILING).toBeLessThan(RL.FREEZE_CEILING);
  });

  it('RESUME_CEILING is below SOFT_CEILING', () => {
    expect(RL.RESUME_CEILING).toBeLessThan(RL.SOFT_CEILING);
  });

  it('HARD_CEILING legacy alias is present', () => {
    expect(RL.HARD_CEILING).toBeDefined();
    expect(typeof RL.HARD_CEILING).toBe('number');
  });

  it('HIGH_RESERVE and safety margins are present', () => {
    expect(RL.HIGH_RESERVE).toBeDefined();
    expect(RL.SAFETY_MARGIN).toBeDefined();
    expect(RL.CRITICAL_SAFETY_MARGIN).toBeDefined();
    expect(RL.CRITICAL_CONCURRENT_RESERVE).toBe(2);
  });

  it('NORMAL ceiling = FREEZE_CEILING - HIGH_RESERVE = 1260', () => {
    expect(RL.FREEZE_CEILING - RL.HIGH_RESERVE).toBe(1260);
  });

  it('HIGH ceiling = WEIGHT_PER_MIN - SAFETY_MARGIN = 2200', () => {
    expect(RL.WEIGHT_PER_MIN - RL.SAFETY_MARGIN).toBe(2200);
  });

  it('CRITICAL ceiling preserves only the final 50-weight emergency margin', () => {
    expect(RL.WEIGHT_PER_MIN - RL.CRITICAL_SAFETY_MARGIN).toBe(2350);
    expect(RATE_LIMIT_PRIORITY.CRITICAL).toBe('CRITICAL');
  });
});

// ─── snapshot shape (laneBudget + activeRuns) ─────────────────────────────────
describe('snapshot laneBudget and activeRuns', () => {
  beforeEach(() => _resetForTests());

  it('has laneBudget with CRITICAL/HIGH/NORMAL/LOW keys and ceilings', () => {
    const snap = snapshot();
    expect(snap.laneBudget).toBeDefined();
    expect(snap.laneBudget.CRITICAL.ceiling).toBe(2350);
    expect(snap.laneBudget.HIGH.ceiling).toBe(2200);
    expect(snap.laneBudget.NORMAL.ceiling).toBe(1260);
    expect(snap.laneBudget.LOW.ceiling).toBe(1000);
  });

  it('activeRuns is 0 when no runs have launched', () => {
    expect(snapshot().activeRuns).toBe(0);
  });
});

// ─── Priority lane ceilings ───────────────────────────────────────────────────
// These tests verify the reserved-band logic: NORMAL blocks at 1260 (not 1560),
// and HIGH passes through up to 2200.
describe('priority lane ceilings', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('HIGH passes through when eff = 1310 (above NORMAL ceiling, below HIGH ceiling)', async () => {
    // Seed eff = 1310 via measured header on a NORMAL call
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '1310' : null },
    }));
    const p0 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`);
    await vi.runAllTimersAsync();
    await p0;
    expect(snapshot().effectiveWeight).toBe(1310);

    // HIGH ceiling = 2200; 1310 < 2200 → should launch immediately
    let highResolved = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
    }));
    const pH = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'HIGH' })
      .then(() => { highResolved = true; });
    await vi.runAllTimersAsync();
    await pH;
    expect(highResolved).toBe(true);
  });

  it('NORMAL blocks when eff = 1310 (≥ NORMAL ceiling of 1260)', async () => {
    // Seed eff = 1310
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '1310' : null },
    }));
    const p0 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`);
    await vi.runAllTimersAsync();
    await p0;
    expect(snapshot().effectiveWeight).toBe(1310);

    // NORMAL should block until next minute (stale measured resets after window roll)
    let normalResolved = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
    }));
    const pN = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'NORMAL' })
      .then(() => { normalResolved = true; });

    // Not yet resolved (blocked by reserved band)
    await vi.advanceTimersByTimeAsync(500);
    expect(normalResolved).toBe(false);

    // Cross the minute boundary → stale measured clears, committed = 0, NORMAL can launch
    await vi.advanceTimersByTimeAsync(65_000);
    await pN;
    expect(normalResolved).toBe(true);
  });

  it('LOW blocks when mode is THROTTLE (eff ≥ SOFT_CEILING)', async () => {
    // Seed eff = 1050 (THROTTLE: SOFT ≤ 1050 < FREEZE)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '1050' : null },
    }));
    const p0 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`);
    await vi.runAllTimersAsync();
    await p0;
    expect(snapshot().mode).toBe('THROTTLE');

    let lowResolved = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
    }));
    const pL = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'LOW' })
      .then(() => { lowResolved = true; });

    // Blocked — mode is THROTTLE, eff = 1050 ≥ SOFT_CEILING
    await vi.advanceTimersByTimeAsync(600);
    expect(lowResolved).toBe(false);

    // Advance past minute boundary → committed + stale measured reset → mode OK → LOW unblocks
    await vi.advanceTimersByTimeAsync(65_000);
    await pL;
    expect(lowResolved).toBe(true);
  });
});

// ─── Reserved band: with eff = 1260, HIGH launches; NORMAL/LOW don't ──────────
describe('reserved band', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('at eff=1260: HIGH launches, NORMAL does not', async () => {
    // Seed eff exactly at NORMAL ceiling (1260)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '1260' : null },
    }));
    const p0 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`);
    await vi.runAllTimersAsync();
    await p0;
    expect(snapshot().effectiveWeight).toBe(1260);

    // NORMAL → blocked (1260 >= 1260)
    let normalResolved = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => null },
    }));
    const pN = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'NORMAL' })
      .then(() => { normalResolved = true; });
    await vi.advanceTimersByTimeAsync(300);
    expect(normalResolved).toBe(false);

    // HIGH → passes (1260 < 2200)
    let highResolved = false;
    const pH = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'HIGH' })
      .then(() => { highResolved = true; });
    await vi.runAllTimersAsync();
    await pH;
    expect(highResolved).toBe(true);

    // Let NORMAL eventually clear after minute roll
    await vi.advanceTimersByTimeAsync(65_000);
    await pN;
    expect(normalResolved).toBe(true);
  });
});

// ─── CRITICAL lifecycle lane ─────────────────────────────────────────────────
describe('CRITICAL lifecycle lane', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('passes above the HIGH ceiling while preserving the final hard safety margin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '2250' : null },
    }));
    const seed = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`);
    await vi.runAllTimersAsync();
    await seed;
    expect(snapshot().effectiveWeight).toBe(2250);

    const criticalFetch = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => null } });
    vi.stubGlobal('fetch', criticalFetch);
    const request = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, {
      priority: 'CRITICAL',
      purpose: 'OPEN_POSITION_RECONCILIATION',
    });
    await vi.runAllTimersAsync();
    await expect(request).resolves.toBeDefined();
    expect(criticalFetch).toHaveBeenCalledTimes(1);
    expect(snapshot().criticalLaunchCount).toBe(1);
  });

  it('fails fast instead of waiting to the next minute when the CRITICAL budget is exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '2350' : null },
    }));
    const seed = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`);
    await vi.runAllTimersAsync();
    await seed;

    const shouldNotLaunch = vi.fn();
    vi.stubGlobal('fetch', shouldNotLaunch);
    let caught;
    const request = apiFetch(`${BASE}/openInterest?symbol=ETHUSDT`, {
      priority: 'CRITICAL',
      maxWaitMs: 100,
      purpose: 'OPEN_POSITION_PRICE_FALLBACK',
    }).catch(error => { caught = error; });
    await vi.advanceTimersByTimeAsync(150);
    await request;

    expect(caught?.code).toBe('CRITICAL_RATE_BUDGET_EXHAUSTED');
    expect(shouldNotLaunch).not.toHaveBeenCalled();
    expect(snapshot().waiting).toBe(0);
    expect(snapshot().tradesMayFreeze).toBe(false);
  });

  it('fails CRITICAL reads immediately during 429 backoff instead of sleeping in the trade path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 429,
      headers: { get: h => h === 'retry-after' ? '15' : null },
    }));
    const limited = apiFetch(`${BASE}/ticker/24hr`).catch(() => {});
    await vi.runAllTimersAsync();
    await limited;
    expect(snapshot().isBackoff).toBe(true);

    const shouldNotLaunch = vi.fn();
    vi.stubGlobal('fetch', shouldNotLaunch);
    let caught;
    await apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, {
      priority: 'CRITICAL',
      purpose: 'OPEN_POSITION_RECONCILIATION',
    }).catch(error => { caught = error; });

    expect(caught?.code).toBe('CRITICAL_RATE_LIMIT_BACKOFF');
    expect(shouldNotLaunch).not.toHaveBeenCalled();
  });

  it('supports cancellation while a non-critical request is queued', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '1310' : null },
    }));
    const seed = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`);
    await vi.runAllTimersAsync();
    await seed;

    const controller = new AbortController();
    let caught;
    const queued = apiFetch(`${BASE}/openInterest?symbol=ETHUSDT`, {
      priority: 'NORMAL',
      signal: controller.signal,
    }).catch(error => { caught = error; });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await queued;
    expect(caught?.code).toBe('ABORTED');
    expect(snapshot().waiting).toBe(0);
  });
});

// ─── Run-bump ─────────────────────────────────────────────────────────────────
// Once a run has launched its first request (registered in activeRuns), subsequent
// requests for the same runId get +1 lane bump (NORMAL→HIGH, LOW→NORMAL).
describe('run-bump', () => {
  beforeEach(() => {
    _resetForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('NORMAL run-bump: second request with same runId gets HIGH gating at eff=1310', async () => {
    // First NORMAL request with runId: eff=0 → OK, launches, returns 1310 header
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '1310' : null },
    }));
    const p1 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'NORMAL', runId: 'scan:001' });
    await vi.runAllTimersAsync();
    await p1;
    // eff now 1310; runId 'scan:001' is in activeRuns
    expect(snapshot().effectiveWeight).toBe(1310);
    expect(snapshot().activeRuns).toBe(1);

    // Second NORMAL request with same runId → bumped to HIGH → 1310 < 2200 → proceeds
    let secondResolved = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => null },
    }));
    const p2 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'NORMAL', runId: 'scan:001' })
      .then(() => { secondResolved = true; });
    await vi.runAllTimersAsync();
    await p2;
    expect(secondResolved).toBe(true);

    // NORMAL without runId at eff=1310 → blocked (no bump)
    let thirdResolved = false;
    const p3 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'NORMAL' })
      .then(() => { thirdResolved = true; });
    await vi.advanceTimersByTimeAsync(500);
    expect(thirdResolved).toBe(false);  // still blocked — no runId bump
    // Cleanup: advance past minute to let it through
    await vi.advanceTimersByTimeAsync(65_000);
    await p3;
  });

  it('endRun removes the run so subsequent requests lose the bump', async () => {
    // Register 'scan:002' by making a successful launch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: h => h === 'x-mbx-used-weight-1m' ? '1310' : null },
    }));
    const p1 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'NORMAL', runId: 'scan:002' });
    await vi.runAllTimersAsync();
    await p1;
    expect(snapshot().activeRuns).toBe(1);

    // Remove the run
    endRun('scan:002');
    expect(snapshot().activeRuns).toBe(0);

    // Now a NORMAL request with same runId gets no bump → blocked at eff=1310
    let resolved = false;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => null },
    }));
    const p2 = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { priority: 'NORMAL', runId: 'scan:002' })
      .then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(false);   // no bump → blocked

    // Cleanup
    await vi.advanceTimersByTimeAsync(65_000);
    await p2;
  });

  it('activeRuns clears on window roll', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => null },
    }));
    const p = apiFetch(`${BASE}/openInterest?symbol=BTCUSDT`, { runId: 'roll-test' });
    await vi.runAllTimersAsync();
    await p;
    expect(snapshot().activeRuns).toBe(1);

    // Cross a minute boundary
    await vi.advanceTimersByTimeAsync(65_000);
    // Trigger roll by calling effectiveWeight via snapshot
    const snap = snapshot();
    expect(snap.activeRuns).toBe(0);
  });
});
