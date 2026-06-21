// ─── LONG LIFECYCLE CLOSE COORDINATOR ────────────────────────────────────────
// Arbitrates concurrent close candidates for a single trade lifecycle.
// Prevents the first-callback-wins race where multiple price-trigger paths
// (REST poll, WS aggTrade, WS bookTicker) submit closes for the same event.
//
// State machine per (canonicalTradeId + lifecycleRevision):
//   OPEN → ARBITRATION_PENDING → CLOSE_REQUESTED → CLOSE_COMMITTED

export const COORDINATOR_VERSION = 'LONG_LIFECYCLE_CLOSE_COORDINATOR_V1_2026_06';

export const COORDINATOR_STATE = Object.freeze({
  OPEN:                 'OPEN',
  ARBITRATION_PENDING:  'ARBITRATION_PENDING',
  CLOSE_REQUESTED:      'CLOSE_REQUESTED',
  CLOSE_COMMITTED:      'CLOSE_COMMITTED',
});

const TRIGGER_PRIORITY = Object.freeze({
  TAKE_PROFIT:   1,
  TRAILING_EXIT: 2,
  PROFIT_LOCK:   3,
  STOP_LOSS:     4,
  TIMEOUT:       5,
  RUN_STOP:      6,
  APP_SHUTDOWN:  7,
});

const EQUAL_TIME_TOLERANCE_MS = 5;

/**
 * Select the winner from a list of candidates using the spec §A1 algorithm.
 * Assumes all candidates have already been filtered for stale lifecycle revision.
 */
function selectWinner(candidates) {
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => {
    const aEvt = a.exchangeEventTime;
    const bEvt = b.exchangeEventTime;

    // a. Smallest exchangeEventTime when both present
    if (aEvt != null && bEvt != null) {
      const diff = aEvt - bEvt;
      if (Math.abs(diff) > EQUAL_TIME_TOLERANCE_MS) return diff; // smaller first
    } else if (aEvt != null) {
      return -1; // a has event time, b doesn't → a wins
    } else if (bEvt != null) {
      return 1;
    }

    // b. Smallest observedAt
    const obsDiff = a.observedAt - b.observedAt;
    if (Math.abs(obsDiff) > EQUAL_TIME_TOLERANCE_MS) return obsDiff;

    // c. Deterministic TRIGGER_PRIORITY (lower = higher priority)
    const aPri = TRIGGER_PRIORITY[a.triggerReason] ?? 99;
    const bPri = TRIGGER_PRIORITY[b.triggerReason] ?? 99;
    if (aPri !== bPri) return aPri - bPri;

    // d. Smaller sourceFreshnessMs
    const aFresh = a.sourceFreshnessMs ?? Infinity;
    const bFresh = b.sourceFreshnessMs ?? Infinity;
    if (aFresh !== bFresh) return aFresh - bFresh;

    // e. Lexicographic triggerSource
    return String(a.triggerSource ?? '').localeCompare(String(b.triggerSource ?? ''));
  })[0];
}

/**
 * Create a new coordinator instance.  All state is encapsulated.
 *
 * @param {object} options
 * @param {number} options.arbitrationWindowMs   Window to collect candidates before selecting (default 25ms)
 * @param {function} options.now                  Monotonic clock supplier
 * @param {function} options.schedule             Scheduler (fn, ms) → timer handle
 * @param {function} options.cancelSchedule       Cancel a timer handle
 */
export function createLongLifecycleCloseCoordinator({
  arbitrationWindowMs = 25,
  now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancelSchedule = clearTimeout,
} = {}) {
  // tradeKey → { state, registered, candidates[], suppressed[], timer,
  //               resolvedAt, winner, commitId, onCloseRequested,
  //               lastCommittedEventTime }
  const _trades = new Map();
  let _destroyed = false;

  function _getOrThrow(tradeKey) {
    const entry = _trades.get(tradeKey);
    if (!entry) throw new Error(`Trade not registered: ${tradeKey}`);
    return entry;
  }

  /**
   * Register a trade so the coordinator can accept candidates for it.
   * Must be called before any submitCloseCandidate calls.
   */
  function registerTrade(trade) {
    if (_destroyed) return;
    const tradeKey = `${trade.canonicalTradeId}:${trade.lifecycleRevision}`;
    if (_trades.has(tradeKey)) return; // idempotent
    _trades.set(tradeKey, {
      state:           COORDINATOR_STATE.OPEN,
      lifecycleRevision: trade.lifecycleRevision,
      candidates:      [],
      suppressed:      [],
      timer:           null,
      resolvedAt:      null,
      winner:          null,
      commitId:        null,
      onCloseRequested: null,
      lastCommittedEventTime: null,
    });
  }

  /**
   * Register a callback that will be called exactly once when the arbitration
   * window expires and a winner is selected.  Must be called after registerTrade.
   */
  function onCloseRequested(tradeKey, callback) {
    const entry = _trades.get(tradeKey);
    if (!entry) return;
    entry.onCloseRequested = callback;
  }

  /**
   * Submit a close candidate.  Starts the arbitration window if this is the first
   * candidate for a given trade.  Subsequent candidates within the window are
   * collected; the winner is selected when the window expires.
   */
  function submitCloseCandidate(candidate) {
    if (_destroyed) return;
    const entry = _trades.get(candidate.tradeKey);
    if (!entry) return;

    // Stale lifecycle revision check
    if (candidate.lifecycleRevision !== entry.lifecycleRevision) {
      entry.suppressed.push({ ...candidate, suppressReason: 'STALE_LIFECYCLE_REVISION' });
      return;
    }

    // Already committed — suppress
    if (entry.state === COORDINATOR_STATE.CLOSE_REQUESTED ||
        entry.state === COORDINATOR_STATE.CLOSE_COMMITTED) {
      entry.suppressed.push({ ...candidate, suppressReason: 'ALREADY_COMMITTED' });
      return;
    }

    // Late event before last committed time
    if (entry.lastCommittedEventTime != null &&
        candidate.exchangeEventTime != null &&
        candidate.exchangeEventTime < entry.lastCommittedEventTime) {
      entry.suppressed.push({ ...candidate, suppressReason: 'EVENT_BEFORE_LAST_COMMIT' });
      return;
    }

    entry.candidates.push(candidate);

    if (entry.state === COORDINATOR_STATE.OPEN) {
      entry.state = COORDINATOR_STATE.ARBITRATION_PENDING;
      entry.timer = schedule(() => {
        _flush(candidate.tradeKey);
      }, arbitrationWindowMs);
    }
    // If already ARBITRATION_PENDING, just add to candidates — window already running
  }

  function _flush(tradeKey) {
    const entry = _trades.get(tradeKey);
    if (!entry) return;
    if (entry.state === COORDINATOR_STATE.CLOSE_REQUESTED ||
        entry.state === COORDINATOR_STATE.CLOSE_COMMITTED) return;

    entry.timer = null;

    const validCandidates = entry.candidates.filter(
      c => c.lifecycleRevision === entry.lifecycleRevision
    );
    const winner = selectWinner(validCandidates);
    const suppressed = validCandidates.filter(c => c !== winner);

    entry.suppressed.push(...suppressed.map(c => ({ ...c, suppressReason: 'LOST_ARBITRATION' })));
    entry.winner    = winner;
    entry.state     = COORDINATOR_STATE.CLOSE_REQUESTED;
    entry.resolvedAt = now();

    if (winner && typeof entry.onCloseRequested === 'function') {
      entry.onCloseRequested(winner);
    }
  }

  /**
   * Force-flush immediately (e.g. app shutdown, run stop).
   */
  function flushTrade(tradeKey) {
    const entry = _trades.get(tradeKey);
    if (!entry) return;
    if (entry.timer != null) {
      cancelSchedule(entry.timer);
      entry.timer = null;
    }
    _flush(tradeKey);
  }

  /**
   * Mark the trade as fully committed (exchange order acknowledged, PnL resolved).
   */
  function commitResolvedClose(tradeKey, commitContext = {}) {
    const entry = _trades.get(tradeKey);
    if (!entry) return;
    entry.state    = COORDINATOR_STATE.CLOSE_COMMITTED;
    entry.commitId = commitContext.commitId ?? `commit-${now()}`;
    entry.lastCommittedEventTime =
      entry.winner?.exchangeEventTime ?? entry.lastCommittedEventTime;
  }

  /**
   * Cancel a trade without committing (e.g. error path, lifecycle reset).
   */
  function cancelTrade(tradeKey, reason = 'CANCELLED') {
    const entry = _trades.get(tradeKey);
    if (!entry) return;
    if (entry.timer != null) {
      cancelSchedule(entry.timer);
      entry.timer = null;
    }
    _trades.delete(tradeKey);
  }

  /**
   * Return a snapshot of the arbitration audit trail for a given trade.
   */
  function getAudit(tradeKey) {
    const entry = _trades.get(tradeKey);
    if (!entry) return null;
    return {
      tradeKey,
      state:               entry.state,
      winner:              entry.winner,
      suppressedCandidates: entry.suppressed,
      candidateCount:      entry.candidates.length,
      suppressedCount:     entry.suppressed.length,
      arbitrationWindowMs,
      resolvedAt:          entry.resolvedAt,
      commitId:            entry.commitId,
      version:             COORDINATOR_VERSION,
    };
  }

  /**
   * Destroy the coordinator, cancelling all pending timers.
   */
  function destroy() {
    _destroyed = true;
    for (const entry of _trades.values()) {
      if (entry.timer != null) cancelSchedule(entry.timer);
    }
    _trades.clear();
  }

  return {
    registerTrade,
    onCloseRequested,
    submitCloseCandidate,
    flushTrade,
    commitResolvedClose,
    cancelTrade,
    getAudit,
    destroy,

    // Module invariants
    logOnly:           true,
    canAffectExecution: false,
    executionApplied:  false,
  };
}
