// ─── LONG CLOSE ARBITER ───────────────────────────────────────────────────────
// Centralizes close-request arbitration so REST and WebSocket paths cannot
// race to produce duplicate close commits or conflicting reasons.
//
// Deterministic priority when two triggers share the same event time:
//   1. TAKE_PROFIT (hard ceiling)
//   2. TRAILING_EXIT (valid trailing)
//   3. PROFIT_LOCK (active floor breach)
//   4. STOP_LOSS
//   5. TIMEOUT
//   6. RUN_STOP / SHUTDOWN
//
// The arbiter accepts exactly one winning request per lifecycle revision.
// Later requests are suppressed and preserved for analysis.

import { PROFIT_LOCK_FLOOR_OUTCOME } from './profitLockProtection.js';

const TRIGGER_PRIORITY = {
  TAKE_PROFIT:    1,
  TRAILING_EXIT:  2,
  PROFIT_LOCK:    3,
  STOP_LOSS:      4,
  TIMEOUT:        5,
  RUN_STOP:       6,
  SHUTDOWN:       6,
};

function priorityOf(reason) {
  return TRIGGER_PRIORITY[String(reason).toUpperCase()] ?? 99;
}

let arbiterCommitSequence = 0;

export class LongCloseArbiter {
  constructor() {
    this._winner   = null;
    this._suppressed = [];
    this._committed  = false;
    this._commitId   = null;
    this._commitCallback = null;
    this._lifecycleRevision = null;
  }

  /** Attach the arbiter to a specific lifecycle revision (trade lifecycle key). */
  init(lifecycleRevision) {
    this._lifecycleRevision = lifecycleRevision;
    this._winner     = null;
    this._suppressed = [];
    this._committed  = false;
    this._commitId   = null;
  }

  /** Register the callback that executes the actual close commit (runs once). */
  onCommit(fn) {
    this._commitCallback = fn;
  }

  /**
   * Request a close.  Returns true if this request won and commit was triggered.
   * Returns false if this request was suppressed.
   */
  requestClose({
    trade,
    triggerReason,
    triggerSource,
    observedPrice,
    observedAt,
    exchangeEventTime = null,
    triggerEvidence = null,
  }) {
    const reason   = String(triggerReason ?? 'UNKNOWN').toUpperCase();
    const source   = String(triggerSource ?? 'UNKNOWN');
    const at       = Number(observedAt ?? Date.now());
    const evtTime  = exchangeEventTime != null ? Number(exchangeEventTime) : null;

    if (this._committed) {
      // Already committed — record suppressed request for analysis.
      this._suppressed.push({
        triggerReason: reason, triggerSource: source,
        observedAt: at, observedPrice, exchangeEventTime: evtTime, triggerEvidence,
        suppressedBecause: 'ALREADY_COMMITTED',
      });
      return false;
    }

    if (this._winner == null) {
      // First request always wins initially.
      this._winner = { reason, source, at, evtTime, observedPrice, triggerEvidence };
      this._commit(trade);
      return true;
    }

    // Decide whether the new request should displace the current winner.
    const currentPriority = priorityOf(this._winner.reason);
    const incomingPriority = priorityOf(reason);
    // Use event chronology first; tie-break by deterministic priority.
    const currentTime  = this._winner.evtTime ?? this._winner.at;
    const incomingTime = evtTime ?? at;
    const shouldDisplace =
      incomingTime < currentTime ||
      (incomingTime === currentTime && incomingPriority < currentPriority);

    if (!this._committed && shouldDisplace) {
      this._suppressed.push({
        ...this._winner,
        suppressedBecause: 'DISPLACED_BY_EARLIER_OR_HIGHER_PRIORITY',
      });
      this._winner = { reason, source, at, evtTime, observedPrice, triggerEvidence };
      // We haven't committed yet (commit runs synchronously above), so trigger.
      this._commit(trade);
      return true;
    }

    this._suppressed.push({
      triggerReason: reason, triggerSource: source,
      observedAt: at, observedPrice, exchangeEventTime: evtTime, triggerEvidence,
      suppressedBecause: 'LOST_ARBITRATION',
    });
    return false;
  }

  _commit(trade) {
    if (this._committed) return;
    this._committed = true;
    this._commitId  = `CLOSE-COMMIT-${Date.now()}-${++arbiterCommitSequence}`;

    const w = this._winner;

    // Floor outcome truth: floor is PRESERVED only after close is committed at or
    // above the floor price.  If the price is also below stop, record that too.
    let floorOutcome = PROFIT_LOCK_FLOOR_OUTCOME.NOT_APPLICABLE;
    let floorOutcomeReason = null;
    let stopLossAlsoBreached = false;

    if (w.reason === 'PROFIT_LOCK' && trade != null) {
      const floor    = Number(trade?.profitLockProtectedFloorPrice ?? 0);
      const stop     = Number(trade?.stopLossPrice ?? 0);
      const exitPrice = Number(w.observedPrice ?? 0);
      stopLossAlsoBreached = stop > 0 && exitPrice <= stop;
      if (exitPrice > 0 && floor > 0) {
        if (exitPrice >= floor) {
          floorOutcome = PROFIT_LOCK_FLOOR_OUTCOME.PRESERVED;
        } else {
          floorOutcome = PROFIT_LOCK_FLOOR_OUTCOME.MISSED;
          floorOutcomeReason = stopLossAlsoBreached
            ? 'GAP_OR_DETECTION_DELAY_BELOW_STOP'
            : 'SLIPPAGE_BELOW_FLOOR';
        }
      } else {
        floorOutcome = PROFIT_LOCK_FLOOR_OUTCOME.UNKNOWN;
      }
    }

    const commitResult = {
      closeCommitId:              this._commitId,
      lifecycleRevision:          this._lifecycleRevision,
      closeRequestId:             `REQ-${this._lifecycleRevision ?? 'unknown'}-${arbiterCommitSequence}`,
      closeRequestSequence:       arbiterCommitSequence,
      closeRequestWinnerReason:   w.reason,
      closeRequestWinnerSource:   w.source,
      closeRequestWinnerObservedAt: w.at,
      closeRequestWinnerPrice:    w.observedPrice,
      closeRequestSuppressedCount: this._suppressed.length,
      closeRequestSuppressedReasons: this._suppressed.map(s => s.triggerReason),
      closeCommittedAt:           Date.now(),
      closeCommitSource:          w.source,
      canonicalCloseReason:       w.reason,
      profitLockFloorOutcome:     floorOutcome,
      profitLockFloorOutcomeReason: floorOutcomeReason,
      stopLossAlsoBreachedAtClose: stopLossAlsoBreached,
    };

    if (typeof this._commitCallback === 'function') {
      this._commitCallback(commitResult, w.triggerEvidence);
    }
  }

  getAuditTrail() {
    return {
      lifecycleRevision:          this._lifecycleRevision,
      committed:                  this._committed,
      commitId:                   this._commitId,
      winner:                     this._winner,
      suppressedRequests:         [...this._suppressed],
      suppressedCount:            this._suppressed.length,
    };
  }

  get committed() { return this._committed; }
}

/** Convenience factory — creates and initializes an arbiter for a trade. */
export function createLongCloseArbiter(trade, onCommit) {
  const arbiter = new LongCloseArbiter();
  const revision = String(
    trade?.canonicalTradeId ?? trade?.tradeId ?? trade?.id ?? `unknown-${Date.now()}`
  );
  arbiter.init(revision);
  if (typeof onCommit === 'function') arbiter.onCommit(onCommit);
  return arbiter;
}
