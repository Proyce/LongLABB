// ─── LONG TRADE LIFECYCLE (shared production functions) ──────────────────────
// Real, single-source lifecycle helpers used by both the app and tests.
// Research verdicts never gate insertion, updates, or finalization.

import {
  CLOSE_REASON,
  classifyLongCloseReason,
  normalizeLongCloseReason,
} from './closeReasons.js';

export { CLOSE_REASON, classifyLongCloseReason, normalizeLongCloseReason };

let __tradeSeq = 0;

/** Insert a candidate into the simulator. Research verdicts never block it. */
export function insertSimulatedTrade(enrichedTrade, now = Date.now()) {
  const tradeId = enrichedTrade.tradeId ?? enrichedTrade.id ?? `long-${++__tradeSeq}-${now}`;
  return {
    ...enrichedTrade,
    tradeId,
    id: enrichedTrade.id ?? tradeId,
    closed: false,
    closeReason: CLOSE_REASON.ACTIVE,
    currentPrice: enrichedTrade.entryPrice ?? null,
    insertedAt: now,
    executionApplied: false,
    canAffectExecution: false,
  };
}

/** Apply a live price update to an active trade. */
export function applyPriceUpdate(trade, price, now = Date.now(), source = 'UNKNOWN') {
  if (!trade) return null;
  const entry = trade.entryPrice ?? price;
  const marginPnlPct = entry > 0
    ? ((price - entry) / entry) * 100 * (trade.leverage ?? 1)
    : null;
  return {
    ...trade,
    currentPrice: price,
    lastPriceUpdateAt: now,
    lastPriceTimestamp: now,
    lastPriceSource: source,
    mfe: Math.max(trade.mfe ?? -Infinity, marginPnlPct ?? -Infinity),
    mae: Math.min(trade.mae ?? Infinity, marginPnlPct ?? Infinity),
  };
}

/** Finalize a trade using canonical close-reason semantics. */
export function finalizeLongTrade(trade, closeReason, finalPnlPct, extra = {}) {
  const classification = classifyLongCloseReason(closeReason);
  // Only keep codes that are already canonical CLOSE_REASON values verbatim.
  // Short legacy aliases (SL/TP/TRAIL) must normalize so the persisted
  // closeReason never diverges from canonicalCloseReason (e.g. 'SL' -> 'STOP_LOSS').
  const stableLegacyCodes = new Set(['PROFIT_LOCK', 'TIMEOUT']);
  const persistedReason = stableLegacyCodes.has(String(closeReason))
    ? String(closeReason)
    : classification.closeReason;
  return {
    ...trade,
    ...extra,
    closed: true,
    closeReason: persistedReason,
    canonicalCloseReason: classification.closeReason,
    legacyCloseReason: classification.legacyCloseReason,
    closedAt: extra.closedAt ?? trade.closedAt ?? Date.now(),
    finalPnlPct,
    isFinalOutcome: classification.closeReason !== CLOSE_REASON.ACTIVE,
    closeReasonCategory: classification.closeReasonCategory,
    closeReasonDetail: classification.closeReasonDetail,
    closeTriggerSource: extra.closeTriggerSource ?? trade.closeTriggerSource ?? null,
    closeExecutionMechanism: extra.closeExecutionMechanism ?? trade.closeExecutionMechanism ?? null,
    executionApplied: false,
    canAffectExecution: false,
  };
}
