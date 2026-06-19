// ─── GLOBAL RATE LIMITER ──────────────────────────────────────────────────────
// Predicted-weight ledger: committed counter is authoritative for gating.
// Reconciled against x-mbx-used-weight-1m headers after each response.
//
// Safety architecture:
//   CRITICAL — open-position lifecycle/reconciliation only. It owns the final
//              reserved band, reserved concurrency, and NEVER waits indefinitely.
//   HIGH     — entry/open-trade enrichment. May pass scan freezes, but cannot
//              consume the CRITICAL reserve.
//   NORMAL   — coordinated main polling.
//   LOW      — discovery/research enrichment; first traffic to pause.
//
// The rate limiter may pause discovery. It must never suspend timers, websocket
// position monitoring, or local exit evaluation. CRITICAL REST reads fail fast
// when the safe budget is unavailable so callers can use websocket/cache/degraded
// reconciliation rather than leaving a trade frozen in a queue.

export const RATE_LIMIT_PRIORITY = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW',
});

export const RL = {
  WEIGHT_PER_MIN:             2400,
  FREEZE_CEILING:             1560,  // scanner/UI freeze threshold
  SOFT_CEILING:               1000,  // discovery throttle threshold
  RESUME_CEILING:              800,  // legacy hysteresis read
  HIGH_RESERVE:                300,  // NORMAL/LOW cannot spend this HIGH band
  SAFETY_MARGIN:               200,  // HIGH ceiling = 2200
  CRITICAL_SAFETY_MARGIN:       50,  // CRITICAL ceiling = 2350; never spend last 50
  CRITICAL_CONCURRENT_RESERVE:   2,  // NORMAL/LOW can occupy at most 4 of 6 slots
  HIGH_CONCURRENT_RESERVE:       1,  // HIGH can occupy at most 5 of 6 slots
  CRITICAL_MAX_QUEUE_MS:      1500,  // fail over; never wait to next minute
  MAX_CONCURRENT:                6,
  THROTTLE_CONCURRENT:           3,
  NORMAL_SPACING_MS:            40,
  THROTTLE_SPACING_MS:         150,
  HIGH_SPACING_MS:              20,
  CRITICAL_SPACING_MS:           0,
  JITTER_MS:                    25,
  BACKOFF_429_MS:           15_000,
  BAN_LOCKOUT_MS:          300_000,
  // Legacy alias — retained so existing RL.HARD_CEILING reads don't break
  HARD_CEILING:               1600,
};

// ── Endpoint weight map ────────────────────────────────────────────────────────
export const WEIGHTS = {
  '/ticker/24hr':  40,
  '/ticker/price':   2, // conservative all-symbol price fallback estimate
  '/premiumIndex': 10,
  '/depth':         2,
  '/openInterest':  1,
  '/klines':        1,
  _default:         1,
};

export function WEIGHT_OF(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/fapi\/v\d+/, '');
    if (path === '/klines') {
      const lim = +new URLSearchParams(parsed.search).get('limit') || 100;
      return lim > 1000 ? 10 : lim > 500 ? 5 : lim > 100 ? 2 : 1;
    }
    return WEIGHTS[path] ?? WEIGHTS._default;
  } catch {
    return WEIGHTS._default;
  }
}

function normalizePriority(priority) {
  const p = String(priority ?? RATE_LIMIT_PRIORITY.NORMAL).toUpperCase();
  return RATE_LIMIT_PRIORITY[p] ?? RATE_LIMIT_PRIORITY.NORMAL;
}

// ── Singleton state ────────────────────────────────────────────────────────────
const s = {
  committed:       0,
  windowStartMs:   0,
  measured:        0,
  measuredAt:      0,
  inflight:        0,
  inflightByPriority: { CRITICAL: 0, HIGH: 0, NORMAL: 0, LOW: 0 },
  waiting:         0,
  lastLaunchAt:    0,
  backoffUntil:    0,
  banUntil:        0,
  calls:           [],
  byPriority:      { CRITICAL: 0, HIGH: 0, NORMAL: 0, LOW: 0 },
  abortGeneration: 0,
  activeRuns:      new Set(),
  criticalFailFastCount: 0,
  criticalLaunchCount: 0,
};

let _listener = null;

export function onRateLimitChange(fn) {
  _listener = fn;
}

function _emit() {
  if (_listener) _listener(snapshot());
}

// ── UTC minute window ──────────────────────────────────────────────────────────
function currentMinuteStart() {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

export function rollWindowIfNeeded() {
  const m = currentMinuteStart();
  if (m !== s.windowStartMs) {
    s.windowStartMs = m;
    s.committed = 0;
    s.activeRuns.clear();
  }
}

// ── Effective weight ───────────────────────────────────────────────────────────
export function effectiveWeight() {
  rollWindowIfNeeded();
  const activeMeasured = s.measuredAt >= s.windowStartMs ? s.measured : 0;
  return Math.max(s.committed, activeMeasured);
}

// ── Priority lane helpers ──────────────────────────────────────────────────────
function bumpPriority(p) {
  if (p === RATE_LIMIT_PRIORITY.LOW) return RATE_LIMIT_PRIORITY.NORMAL;
  if (p === RATE_LIMIT_PRIORITY.NORMAL) return RATE_LIMIT_PRIORITY.HIGH;
  return p; // HIGH never steals CRITICAL; CRITICAL remains CRITICAL
}

function effectivePriority(basePriority, runId) {
  return runId && s.activeRuns.has(runId) ? bumpPriority(basePriority) : basePriority;
}

function laneCeiling(priority) {
  switch (priority) {
    case RATE_LIMIT_PRIORITY.CRITICAL:
      return RL.WEIGHT_PER_MIN - RL.CRITICAL_SAFETY_MARGIN; // 2350
    case RATE_LIMIT_PRIORITY.HIGH:
      return RL.WEIGHT_PER_MIN - RL.SAFETY_MARGIN; // 2200
    case RATE_LIMIT_PRIORITY.NORMAL:
      return RL.FREEZE_CEILING - RL.HIGH_RESERVE; // 1260
    case RATE_LIMIT_PRIORITY.LOW:
      return RL.SOFT_CEILING; // 1000
    default:
      return RL.SOFT_CEILING;
  }
}

function canLaunch(priority, requestWeight = 1) {
  return effectiveWeight() + requestWeight <= laneCeiling(priority);
}

function concurrencyCeiling(priority) {
  const mode = currentMode();
  if (priority === RATE_LIMIT_PRIORITY.CRITICAL) return RL.MAX_CONCURRENT;
  if (priority === RATE_LIMIT_PRIORITY.HIGH) {
    return Math.max(1, RL.MAX_CONCURRENT - RL.HIGH_CONCURRENT_RESERVE);
  }
  const reservedCeiling = Math.max(1, RL.MAX_CONCURRENT - RL.CRITICAL_CONCURRENT_RESERVE);
  if (mode === 'THROTTLE' || mode === 'FROZEN') {
    return Math.min(reservedCeiling, RL.THROTTLE_CONCURRENT);
  }
  return reservedCeiling;
}

// ── Mode state machine ─────────────────────────────────────────────────────────
export function currentMode() {
  const now = Date.now();
  if (s.banUntil     > now) return 'BANNED';
  if (s.backoffUntil > now) return 'BACKOFF';
  const eff = effectiveWeight();
  if (eff >= RL.FREEZE_CEILING) return 'FROZEN';
  if (eff >= RL.SOFT_CEILING)   return 'THROTTLE';
  return 'OK';
}

// ── Public snapshot ────────────────────────────────────────────────────────────
export function snapshot() {
  const now = Date.now();
  while (s.calls.length && now - s.calls[0] > 60_000) s.calls.shift();
  rollWindowIfNeeded();
  const eff  = effectiveWeight();
  const mode = currentMode();
  const criticalCeiling = laneCeiling(RATE_LIMIT_PRIORITY.CRITICAL);
  const highCeiling = laneCeiling(RATE_LIMIT_PRIORITY.HIGH);
  const normalCeiling = laneCeiling(RATE_LIMIT_PRIORITY.NORMAL);
  return {
    mode,
    effectiveWeight: eff,
    committed:       s.committed,
    measured:        s.measured,
    limit:           RL.WEIGHT_PER_MIN,
    freezeCeiling:   RL.FREEZE_CEILING,
    softCeiling:     RL.SOFT_CEILING,
    headroom:        RL.WEIGHT_PER_MIN - eff,
    pctOfLimit:      eff / RL.WEIGHT_PER_MIN * 100,
    windowResetMs:   currentMinuteStart() + 60_000,
    inflight:        s.inflight,
    inflightByPriority: { ...s.inflightByPriority },
    waiting:         s.waiting,
    byPriority:      { ...s.byPriority },
    laneBudget: {
      CRITICAL: { used: Math.min(eff, criticalCeiling), ceiling: criticalCeiling },
      HIGH:     { used: Math.min(eff, highCeiling), ceiling: highCeiling },
      NORMAL:   { used: Math.min(eff, normalCeiling), ceiling: normalCeiling },
      LOW:      { used: Math.min(eff, RL.SOFT_CEILING), ceiling: RL.SOFT_CEILING },
    },
    activeRuns:      s.activeRuns.size,
    isFrozen:        mode === 'FROZEN',
    isBackoff:       s.backoffUntil > now,
    isBanned:        s.banUntil > now,
    backoffUntil:    s.backoffUntil,
    banUntil:        s.banUntil,
    criticalFailFastCount: s.criticalFailFastCount,
    criticalLaunchCount: s.criticalLaunchCount,
    criticalLaneAvailable: !['BANNED', 'BACKOFF'].includes(mode) && canLaunch(RATE_LIMIT_PRIORITY.CRITICAL, 1),
    tradeLifecyclePolicy: 'WEBSOCKET_INDEPENDENT_CRITICAL_FAIL_FAST',
    scannerMayPause: true,
    tradesMayFreeze: false,
    // Legacy aliases
    weight:          s.measured,
    calls:           s.calls.length,
    throttling:      mode === 'THROTTLE' || mode === 'FROZEN',
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function abortError() {
  const err = new Error('ABORTED: rate-limit request cancelled');
  err.code = 'ABORTED';
  return err;
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function sleep(ms, signal) {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', onAbort);
      reject(abortError());
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function jitter(priority) {
  if (priority === RATE_LIMIT_PRIORITY.CRITICAL) return 0;
  return (Math.random() * 2 - 1) * RL.JITTER_MS;
}

function criticalUnavailableError(code, message, extra = {}) {
  s.criticalFailFastCount += 1;
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function waitBudgetExceeded(priority, startedAt, maxWaitMs) {
  return priority === RATE_LIMIT_PRIORITY.CRITICAL && Date.now() - startedAt >= maxWaitMs;
}

// ── Run lifecycle ──────────────────────────────────────────────────────────────
export function endRun(runId) {
  if (runId) s.activeRuns.delete(runId);
}

// ── Core fetch ─────────────────────────────────────────────────────────────────
// CRITICAL calls never wait indefinitely. If the safe lane, backoff, ban, or
// concurrency budget is unavailable, they reject promptly with a structured code.
// The open-position engine must continue from websocket/cache and mark REST
// reconciliation degraded; it must not suspend the trade lifecycle.
export async function apiFetch(url, {
  priority = RATE_LIMIT_PRIORITY.NORMAL,
  runId = null,
  signal = null,
  maxWaitMs = null,
  purpose = null,
} = {}) {
  const basePriority = normalizePriority(priority);
  const requestWeight = WEIGHT_OF(url);
  const queueStartedAt = Date.now();
  const criticalMaxWaitMs = Number.isFinite(Number(maxWaitMs))
    ? Math.max(0, Number(maxWaitMs))
    : RL.CRITICAL_MAX_QUEUE_MS;
  let countedWaiting = true;

  s.waiting++;
  s.byPriority[basePriority] = (s.byPriority[basePriority] ?? 0) + 1;
  _emit();

  const leaveWaiting = () => {
    if (!countedWaiting) return;
    countedWaiting = false;
    s.waiting = Math.max(0, s.waiting - 1);
    s.byPriority[basePriority] = Math.max(0, (s.byPriority[basePriority] ?? 0) - 1);
  };

  const failQueued = error => {
    leaveWaiting();
    _emit();
    throw error;
  };

  try {
    assertNotAborted(signal);

    if (s.banUntil > Date.now()) {
      const err = new Error(`IP_BANNED: retry after ${new Date(s.banUntil).toISOString()}`);
      err.code = 'IP_BANNED';
      err.retryAt = s.banUntil;
      return failQueued(err);
    }

    while (true) {
      assertNotAborted(signal);
      const now = Date.now();
      const effPriority = effectivePriority(basePriority, runId);

      // A global backoff is real, but CRITICAL must fail over promptly instead
      // of sitting in a sleeping promise while the trade waits unmanaged.
      if (s.backoffUntil > now) {
        if (effPriority === RATE_LIMIT_PRIORITY.CRITICAL) {
          return failQueued(criticalUnavailableError(
            'CRITICAL_RATE_LIMIT_BACKOFF',
            `CRITICAL lifecycle REST unavailable until ${new Date(s.backoffUntil).toISOString()}`,
            { retryAt: s.backoffUntil, purpose },
          ));
        }
        await sleep(Math.min(s.backoffUntil - now, 1_000), signal);
        continue;
      }

      if (canLaunch(effPriority, requestWeight)) break;

      if (waitBudgetExceeded(effPriority, queueStartedAt, criticalMaxWaitMs)) {
        return failQueued(criticalUnavailableError(
          'CRITICAL_RATE_BUDGET_EXHAUSTED',
          'CRITICAL lifecycle REST budget unavailable; use websocket/cache fallback.',
          {
            purpose,
            effectiveWeight: effectiveWeight(),
            requestWeight,
            ceiling: laneCeiling(effPriority),
            retryAt: currentMinuteStart() + 60_000,
          },
        ));
      }

      const nextMin = currentMinuteStart() + 60_000;
      const remainingCritical = Math.max(0, criticalMaxWaitMs - (Date.now() - queueStartedAt));
      const wait = effPriority === RATE_LIMIT_PRIORITY.CRITICAL
        ? Math.min(100, remainingCritical || 1)
        : effPriority === RATE_LIMIT_PRIORITY.LOW
          ? 500
          : Math.min(1_000, Math.max(100, nextMin - Date.now()));
      await sleep(wait, signal);
    }

    // Reserve physical concurrency for trade lifecycle work. NORMAL/LOW can
    // never occupy all six slots; HIGH can never occupy the final CRITICAL slot.
    while (s.inflight >= concurrencyCeiling(effectivePriority(basePriority, runId))) {
      assertNotAborted(signal);
      const effPriority = effectivePriority(basePriority, runId);
      if (waitBudgetExceeded(effPriority, queueStartedAt, criticalMaxWaitMs)) {
        return failQueued(criticalUnavailableError(
          'CRITICAL_CONCURRENCY_BUSY',
          'CRITICAL lifecycle REST concurrency unavailable; use websocket/cache fallback.',
          { purpose, retryAt: Date.now() + 100 },
        ));
      }
      await sleep(effPriority === RATE_LIMIT_PRIORITY.CRITICAL ? 25 : 50, signal);
    }

    const effPriorityAtLaunch = effectivePriority(basePriority, runId);
    const spacing = effPriorityAtLaunch === RATE_LIMIT_PRIORITY.CRITICAL
      ? RL.CRITICAL_SPACING_MS
      : effPriorityAtLaunch === RATE_LIMIT_PRIORITY.HIGH
        ? RL.HIGH_SPACING_MS
        : effectiveWeight() >= RL.SOFT_CEILING
          ? RL.THROTTLE_SPACING_MS
          : RL.NORMAL_SPACING_MS;
    const gap = Date.now() - s.lastLaunchAt;
    const targetSpacing = spacing + jitter(effPriorityAtLaunch);
    if (gap < targetSpacing) await sleep(targetSpacing - gap, signal);

    leaveWaiting();
    s.lastLaunchAt = Date.now();
    s.inflight++;
    s.inflightByPriority[effPriorityAtLaunch] = (s.inflightByPriority[effPriorityAtLaunch] ?? 0) + 1;
    s.calls.push(s.lastLaunchAt);
    s.committed += requestWeight;
    if (runId) s.activeRuns.add(runId);
    if (effPriorityAtLaunch === RATE_LIMIT_PRIORITY.CRITICAL) s.criticalLaunchCount += 1;
    const genAtLaunch = s.abortGeneration;
    _emit();

    const finishInflight = () => {
      s.inflight = Math.max(0, s.inflight - 1);
      s.inflightByPriority[effPriorityAtLaunch] = Math.max(0, (s.inflightByPriority[effPriorityAtLaunch] ?? 0) - 1);
    };

    let response;
    try {
      response = await fetch(url, signal ? { signal } : undefined);
    } catch (networkErr) {
      finishInflight();
      _emit();
      throw networkErr;
    }

    // Discovery/main-poll calls can be invalidated by a sibling 418/429. A
    // CRITICAL call is allowed to inspect its own response so a successful trade
    // reconciliation is not discarded merely because discovery hit a limit.
    if (s.abortGeneration !== genAtLaunch && effPriorityAtLaunch !== RATE_LIMIT_PRIORITY.CRITICAL) {
      finishInflight();
      _emit();
      const err = new Error('ABORTED: sibling received ban/rate-limit');
      err.code = 'ABORTED';
      throw err;
    }

    const wh = response.headers.get('x-mbx-used-weight-1m');
    if (wh) {
      s.measured = parseInt(wh, 10);
      s.measuredAt = Date.now();
      rollWindowIfNeeded();
      if (s.measured > s.committed) s.committed = s.measured;
    }

    finishInflight();

    if (response.status === 418) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '300', 10);
      s.banUntil = Date.now() + retryAfter * 1_000;
      s.abortGeneration++;
      console.error(
        `[RateLimit] P0: 418 IP_BANNED for ${retryAfter}s` +
        ` — committed=${s.committed} measured=${s.measured} priority=${effPriorityAtLaunch} url=${url}`
      );
      _emit();
      const err = new Error(`418_IP_BANNED: banned for ${retryAfter}s`);
      err.code = 'IP_BANNED';
      err.retryAt = s.banUntil;
      throw err;
    }

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '15', 10);
      s.backoffUntil = Date.now() + Math.max(retryAfter * 1_000, RL.BACKOFF_429_MS);
      s.abortGeneration++;
      console.error(
        `[RateLimit] P0: 429 RATE_LIMITED for ${retryAfter}s` +
        ` — committed=${s.committed} measured=${s.measured} priority=${effPriorityAtLaunch} url=${url}`
      );
      _emit();
      const err = new Error(`429_RATE_LIMITED: retry after ${retryAfter}s`);
      err.code = 'RATE_LIMITED';
      err.retryAt = s.backoffUntil;
      throw err;
    }

    _emit();
    return response;
  } catch (error) {
    leaveWaiting();
    _emit();
    throw error;
  }
}

// ── apiGet convenience wrapper ─────────────────────────────────────────────────
export const apiGet = (url, options) => apiFetch(url, options).then(r => r.json());

// ── Test isolation helper ──────────────────────────────────────────────────────
export function _resetForTests() {
  s.committed = 0; s.windowStartMs = 0;
  s.measured = 0;  s.measuredAt = 0;
  s.inflight = 0;  s.waiting = 0;
  s.lastLaunchAt = 0; s.backoffUntil = 0; s.banUntil = 0;
  s.calls.length = 0;
  for (const priority of Object.keys(s.byPriority)) {
    s.byPriority[priority] = 0;
    s.inflightByPriority[priority] = 0;
  }
  s.abortGeneration = 0;
  s.activeRuns.clear();
  s.criticalFailFastCount = 0;
  s.criticalLaunchCount = 0;
}
