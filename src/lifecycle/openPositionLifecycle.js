// ─── OPEN POSITION LIFECYCLE ENGINE ─────────────────────────────────────────
// Pure immediate-exit evaluator shared by REST and websocket price paths.

import { CLOSE_REASON } from './closeReasons.js';
import { evaluateLongProfitLockBreach } from './profitLockProtection.js';

const finite = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function validateLongLifecyclePriceTick(tick) {
  const price = finite(tick?.mid ?? tick?.price);
  if (price == null || price <= 0) {
    return Object.freeze({ valid: false, price: null, reason: 'INVALID_PRICE' });
  }

  const source = String(tick?.source ?? 'UNKNOWN').toUpperCase();
  if (source === 'BOOK_TICKER') {
    const bid = finite(tick?.bid);
    const ask = finite(tick?.ask);
    const schemaValidated = tick?.schemaValidated === true;
    if (!schemaValidated) return Object.freeze({ valid: false, price, reason: 'UNVALIDATED_BOOK_TICKER_SCHEMA' });
    if (bid == null || ask == null || bid <= 0 || ask <= 0 || ask < bid) {
      return Object.freeze({ valid: false, price, reason: 'INVALID_BOOK_PRICES' });
    }
    const expectedMid = (bid + ask) / 2;
    const tolerance = Math.max(1e-12, expectedMid * 1e-9);
    if (Math.abs(price - expectedMid) > tolerance) {
      return Object.freeze({ valid: false, price, reason: 'BOOK_MID_MISMATCH' });
    }
    const spreadPct = expectedMid > 0 ? ((ask - bid) / expectedMid) * 100 : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(spreadPct) || spreadPct > 20) {
      return Object.freeze({ valid: false, price, reason: 'ABSURD_BOOK_SPREAD' });
    }
  }

  return Object.freeze({ valid: true, price, reason: null });
}

export function computeLongMarginPnlAtPrice(trade, price) {
  const entry = finite(trade?.entryPrice);
  const current = finite(price);
  if (entry == null || entry <= 0 || current == null) return null;
  return ((current - entry) / entry) * 100 * Number(trade?.leverage ?? 1);
}

export function evaluateLongImmediateExit({
  trade,
  currentPrice,
  now = Date.now(),
  source = 'UNKNOWN',
  trailingEnabled = true,
  takeProfitPricePct = 3,
  stopLossPricePct = 1,
  trailingDistancePricePct = 1.5,
  defaultHoldMs = 10_800_000,
}) {
  if (!trade || trade.closed === true) return Object.freeze({ shouldClose: false, reason: null });
  const price = finite(currentPrice);
  const entry = finite(trade.entryPrice);
  if (price == null || entry == null || entry <= 0) return Object.freeze({ shouldClose: false, reason: null, invalidPrice: true });

  const priceMovePct = ((price - entry) / entry) * 100;
  const marginPnlPct = priceMovePct * Number(trade.leverage ?? 1);
  const lockBreach = evaluateLongProfitLockBreach({ trade, currentPrice: price, observedAt: now, source });

  if (!trailingEnabled && priceMovePct >= takeProfitPricePct) {
    return Object.freeze({ shouldClose: true, reason: CLOSE_REASON.TAKE_PROFIT, marginPnlPct, priceMovePct, lockBreach });
  }
  if (lockBreach.shouldCloseImmediately) {
    return Object.freeze({
      shouldClose: true,
      reason: CLOSE_REASON.PROFIT_LOCK,
      marginPnlPct,
      priceMovePct,
      lockBreach,
      emergencyBecauseAlreadyBelowFloor: true,
    });
  }
  const trailPeak = finite(trade.trailPeak);
  if (trade.trailActive === true && trailPeak != null && price <= trailPeak * (1 - trailingDistancePricePct / 100)) {
    return Object.freeze({ shouldClose: true, reason: CLOSE_REASON.TRAILING_EXIT, marginPnlPct, priceMovePct, lockBreach });
  }
  if (((entry - price) / entry) * 100 >= stopLossPricePct) {
    return Object.freeze({ shouldClose: true, reason: CLOSE_REASON.STOP_LOSS, marginPnlPct, priceMovePct, lockBreach });
  }
  const heldMs = now - Number(trade.entryTime ?? now);
  if (heldMs >= Number(trade.holdMs ?? defaultHoldMs)) {
    return Object.freeze({ shouldClose: true, reason: CLOSE_REASON.TIMEOUT, marginPnlPct, priceMovePct, lockBreach });
  }
  return Object.freeze({ shouldClose: false, reason: null, marginPnlPct, priceMovePct, lockBreach });
}
