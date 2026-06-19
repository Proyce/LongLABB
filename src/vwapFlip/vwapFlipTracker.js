// ─── VWAP FLIP TRACKER ───────────────────────────────────────────────────────
// Per-symbol VWAP state history management.
// Maintains rolling state so entry snapshot captures the transition context.

import {
  VWAP_STATES,
  transitionVwapState,
  classifyVwapLongLabel,
  computeVwapReclaimQualityScore,
} from "./vwapFlipState.js";

// ─── HISTORY MANAGEMENT ──────────────────────────────────────────────────────

const MAX_HISTORY_PER_SYMBOL = 20;

/**
 * Update VWAP flip history for a symbol on a new price tick.
 * @param {Map<string, object>} historyMap - symbol → tracker state
 * @param {string} symbol
 * @param {object} tick - { priceVsVwapLabel, priceVsVwapPct, cvdLabel, greenImpulse, timestamp }
 * @param {object} config
 * @returns {object} updated tracker state for this symbol
 */
export function updateVwapFlipHistory(historyMap, symbol, tick, config = {}) {
  const now = tick.timestamp ?? Date.now();
  const prev = historyMap.get(symbol) ?? createEmptyTracker(now);

  const nextState = transitionVwapState({
    currentState:          prev.state,
    priceVsVwapLabel:      tick.priceVsVwapLabel,
    prevPriceVsVwapLabel:  prev.lastPriceVsVwapLabel,
    barsAboveAfterReclaim: prev.barsAboveAfterReclaim,
    cvdLabel:              tick.cvdLabel,
    greenImpulse:          tick.greenImpulse ?? false,
    priceVsVwapPct:        tick.priceVsVwapPct ?? 0,
    config,
  });

  const isAbove =
    tick.priceVsVwapLabel === "ABOVE_VWAP" ||
    tick.priceVsVwapLabel === "AT_VWAP";

  const barsAbove = isAbove
    ? (prev.barsAboveAfterReclaim ?? 0) + 1
    : 0;

  const flipDetected  = nextState !== prev.state;
  const vwapLongLabel = classifyVwapLongLabel(nextState, tick.greenImpulse, tick.cvdLabel);
  const qualityScore  = computeVwapReclaimQualityScore(nextState, barsAbove, tick.cvdLabel);

  const timestamps = { ...prev.timestamps };
  if (flipDetected) {
    if (nextState === VWAP_STATES.RECLAIM_ATTEMPT)   timestamps.reclaimAttemptAt   = now;
    if (nextState === VWAP_STATES.RECLAIM_CONFIRMED)  timestamps.reclaimConfirmedAt  = now;
    if (nextState === VWAP_STATES.RETEST_IN_PROGRESS) timestamps.retestStartedAt     = now;
    if (nextState === VWAP_STATES.RETEST_HOLD)        timestamps.retestHeldAt        = now;
    if (nextState === VWAP_STATES.RECLAIM_FAILED)     timestamps.reclaimFailedAt     = now;
  }

  const events = prev.events.slice(-MAX_HISTORY_PER_SYMBOL);
  if (flipDetected) {
    events.push({ from: prev.state, to: nextState, at: now });
  }

  const updated = {
    symbol,
    state:                  nextState,
    statePrevious:          flipDetected ? prev.state : prev.statePrevious,
    lastPriceVsVwapLabel:   tick.priceVsVwapLabel,
    barsAboveAfterReclaim:  barsAbove,
    vwapLongLabel,
    vwapReclaimQualityScore: qualityScore,
    flipDetected,
    flipDetectedAt:         flipDetected ? now : prev.flipDetectedAt,
    timestamps,
    events,
    lastUpdatedAt:          now,
  };

  historyMap.set(symbol, updated);
  return updated;
}

// ─── SNAPSHOT FOR ENTRY TELEMETRY ────────────────────────────────────────────

/**
 * Build the entry-time VWAP state snapshot to freeze on a trade object.
 */
export function buildVwapEntrySnapshot(tracker) {
  if (!tracker) {
    return {
      vwapStateAtEntry:             VWAP_STATES.UNKNOWN,
      vwapStateCurrent:             VWAP_STATES.UNKNOWN,
      vwapStatePrevious:            null,
      vwapFlipDetected:             false,
      vwapFlipDetectedAt:           null,
      vwapReclaimAttemptAt:         null,
      vwapReclaimConfirmedAt:       null,
      vwapRetestStartedAt:          null,
      vwapRetestHeldAt:             null,
      vwapReclaimFailedAt:          null,
      vwapBarsAboveAfterReclaim:    0,
      vwapReclaimQualityScore:      0,
      vwapLongLabel:                "VWAP_STATE_UNKNOWN",
      vwapHistoryCoverage:          0,
    };
  }
  return {
    vwapStateAtEntry:             tracker.state,
    vwapStateCurrent:             tracker.state,
    vwapStatePrevious:            tracker.statePrevious ?? null,
    vwapFlipDetected:             tracker.flipDetected ?? false,
    vwapFlipDetectedAt:           tracker.flipDetectedAt ?? null,
    vwapReclaimAttemptAt:         tracker.timestamps?.reclaimAttemptAt ?? null,
    vwapReclaimConfirmedAt:       tracker.timestamps?.reclaimConfirmedAt ?? null,
    vwapRetestStartedAt:          tracker.timestamps?.retestStartedAt ?? null,
    vwapRetestHeldAt:             tracker.timestamps?.retestHeldAt ?? null,
    vwapReclaimFailedAt:          tracker.timestamps?.reclaimFailedAt ?? null,
    vwapBarsAboveAfterReclaim:    tracker.barsAboveAfterReclaim ?? 0,
    vwapReclaimQualityScore:      tracker.vwapReclaimQualityScore ?? 0,
    vwapLongLabel:                tracker.vwapLongLabel ?? "VWAP_STATE_UNKNOWN",
    vwapHistoryCoverage:          tracker.events?.length ?? 0,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function createEmptyTracker(now) {
  return {
    state:                 VWAP_STATES.UNKNOWN,
    statePrevious:         null,
    lastPriceVsVwapLabel:  null,
    barsAboveAfterReclaim: 0,
    vwapLongLabel:         "VWAP_STATE_UNKNOWN",
    vwapReclaimQualityScore: 0,
    flipDetected:          false,
    flipDetectedAt:        null,
    timestamps:            {},
    events:                [],
    lastUpdatedAt:         now,
  };
}
