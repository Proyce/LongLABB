// ─── FEE SELECTORS ────────────────────────────────────────────────────────────
// Canonical selectors for trade fee values.
// All analytics must use these instead of directly accessing finalPnlPct.

/**
 * Returns the gross margin PnL for a trade.
 * Prefers grossMarginPnlPct, falls back to finalPnlPct for legacy records.
 */
export function getGrossMarginPnlPct(trade) {
  if (trade == null) return null;
  if (typeof trade.grossMarginPnlPct === "number") return trade.grossMarginPnlPct;
  if (typeof trade.finalPnlPct === "number") return trade.finalPnlPct;
  return null;
}

/**
 * Returns the gross normalized PnL (unlevered) for a trade.
 */
export function getGrossNormPnlPct(trade) {
  if (trade == null) return null;
  if (typeof trade.grossNormPnlPct === "number") return trade.grossNormPnlPct;
  const gross = getGrossMarginPnlPct(trade);
  if (gross == null) return null;
  const lev = Number(trade.leverage) || 1;
  return parseFloat((gross / lev).toFixed(4));
}

/**
 * Returns the net margin PnL after trading fees.
 * Prefers feeAdjustedMarginPnlPct, then computes from gross - feeDrag.
 */
export function getNetMarginPnlPct(trade) {
  if (trade == null) return null;
  if (typeof trade.feeAdjustedMarginPnlPct === "number") return trade.feeAdjustedMarginPnlPct;
  const gross = getGrossMarginPnlPct(trade);
  if (gross == null) return null;
  const drag = Number(trade.tradingFeeMarginPct ?? trade.feeDragPct ?? 0);
  return parseFloat((gross - drag).toFixed(4));
}

/**
 * Returns the net normalized PnL after trading fees.
 */
export function getNetNormPnlPct(trade) {
  if (trade == null) return null;
  if (typeof trade.feeAdjustedNormPnlPct === "number") return trade.feeAdjustedNormPnlPct;
  const net = getNetMarginPnlPct(trade);
  if (net == null) return null;
  const lev = Number(trade.leverage) || 1;
  return parseFloat((net / lev).toFixed(4));
}

/**
 * Returns the round-trip trading fee as margin PnL percentage.
 */
export function getTradingFeeMarginPct(trade) {
  if (trade == null) return null;
  if (typeof trade.tradingFeeMarginPct === "number") return trade.tradingFeeMarginPct;
  if (typeof trade.feeDragPct === "number") return trade.feeDragPct;
  if (typeof trade.feeDragMarginPct === "number") return trade.feeDragMarginPct;
  return null;
}

/**
 * Returns the round-trip trading fee as normalized (unlevered) percentage.
 */
export function getTradingFeeNormPct(trade) {
  if (trade == null) return null;
  if (typeof trade.tradingFeeNormPct === "number") return trade.tradingFeeNormPct;
  const drag = getTradingFeeMarginPct(trade);
  if (drag == null) return null;
  const lev = Number(trade.leverage) || 1;
  return parseFloat((drag / lev).toFixed(4));
}

/**
 * Returns net-if-closed-now for an active trade.
 */
export function getNetIfClosedNowMarginPct(trade) {
  if (trade == null) return null;
  if (typeof trade.feeAdjustedLiveMarginPnlPct === "number") return trade.feeAdjustedLiveMarginPnlPct;
  return getNetMarginPnlPct(trade);
}

/**
 * True if the gross PnL is positive.
 */
export function isGrossWinner(trade) {
  const gross = getGrossMarginPnlPct(trade);
  return gross != null && gross > 0;
}

/**
 * True if the net-after-fees PnL is positive.
 */
export function isNetWinner(trade) {
  const net = getNetMarginPnlPct(trade);
  return net != null && net > 0;
}

/**
 * True if the trade was a gross winner but a net loser (fee flip).
 */
export function isFeeFlipped(trade) {
  return isGrossWinner(trade) && !isNetWinner(trade);
}

/**
 * True if the trade has closed (has a finalPnlPct or grossMarginPnlPct).
 */
export function isClosed(trade) {
  return trade != null && (
    typeof trade.grossMarginPnlPct === "number" ||
    typeof trade.finalPnlPct === "number"
  ) && trade.closed !== false;
}
