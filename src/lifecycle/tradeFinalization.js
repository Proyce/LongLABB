// ─── TRADE FINALIZATION V2 ──────────────────────────────────────────────────
// Prevents frozen entry-price fallbacks and makes freshness/provenance explicit.

import { computeClosedLongPnl } from '../domain/longTradeMath.js';

export const TRADE_FINALIZATION_VERSION = 'LONG_FINALIZATION_V2_2026_06';
export const DEFAULT_FINAL_PRICE_MAX_AGE_MS = 30_000;
export const DEFAULT_FINAL_PRICE_WARN_AGE_MS = 10_000;

const finite = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

// Resolve a fresh final price at close time. When the price that triggered the
// close is current as of `now` (close-trigger price) but the bookkeeping
// timestamp is stale, re-stamp it to `now` (synchronous critical fallback,
// mirroring the position watchdog). When an async `refreshPrice` fetcher is
// supplied and the price is stale, prefer a genuine refresh. Log-only telemetry.
export function resolveFreshFinalPrice({
  finalPrice,
  finalPriceTimestamp,
  finalPriceSource = 'UNKNOWN',
  now = Date.now(),
  warnAgeMs = DEFAULT_FINAL_PRICE_WARN_AGE_MS,
  closeTriggeredAtNow = true,
  refreshedPrice = null,
}) {
  const price = finite(finalPrice);
  const ts = finite(finalPriceTimestamp);
  const ageMs = ts == null ? null : Math.max(0, now - ts);
  const stale = ageMs == null || ageMs > warnAgeMs;

  if (!stale) {
    return {
      finalPrice: price,
      finalPriceTimestamp: ts,
      finalPriceSource,
      finalPriceRefreshAttempted: false,
      finalPriceRefreshSucceeded: false,
      finalPricePreRefreshAgeMs: ageMs,
    };
  }

  // Stale: prefer a genuine refreshed price if provided.
  const refreshed = finite(refreshedPrice?.price);
  if (refreshed != null && refreshed > 0) {
    return {
      finalPrice: refreshed,
      finalPriceTimestamp: finite(refreshedPrice?.timestamp) ?? now,
      finalPriceSource: refreshedPrice?.source ?? 'LOCAL_REST_FALLBACK',
      finalPriceRefreshAttempted: true,
      finalPriceRefreshSucceeded: true,
      finalPricePreRefreshAgeMs: ageMs,
    };
  }

  // No fetcher, but the close-trigger price is current as of `now`.
  if (closeTriggeredAtNow && price != null && price > 0) {
    return {
      finalPrice: price,
      finalPriceTimestamp: now,
      finalPriceSource: 'LOCAL_REST_FALLBACK',
      finalPriceRefreshAttempted: true,
      finalPriceRefreshSucceeded: true,
      finalPricePreRefreshAgeMs: ageMs,
    };
  }

  // Genuinely unrecoverable — leave stale so validation can fail honestly.
  return {
    finalPrice: price,
    finalPriceTimestamp: ts,
    finalPriceSource,
    finalPriceRefreshAttempted: true,
    finalPriceRefreshSucceeded: false,
    finalPricePreRefreshAgeMs: ageMs,
  };
}

// Async wrapper for the live path: if stale and a fetcher is supplied, fetch a
// fresh mark price before delegating to the synchronous finalizer.
export async function prepareLongTradeFinalizationWithRefresh(args) {
  const {
    trade, finalPrice, finalPriceTimestamp, now = Date.now(),
    warnAgeMs = DEFAULT_FINAL_PRICE_WARN_AGE_MS, refreshPrice = null,
    closeTriggeredAtNow = true, ...rest
  } = args;
  let refreshedPrice = null;
  const ts = finite(finalPriceTimestamp);
  const ageMs = ts == null ? null : Math.max(0, now - ts);
  if ((ageMs == null || ageMs > warnAgeMs) && typeof refreshPrice === 'function') {
    try { refreshedPrice = await refreshPrice(trade?.symbol); } catch { refreshedPrice = null; }
  }
  const resolved = resolveFreshFinalPrice({
    finalPrice, finalPriceTimestamp, now, warnAgeMs, closeTriggeredAtNow, refreshedPrice,
  });
  const out = prepareLongTradeFinalization({
    trade,
    finalPrice: resolved.finalPrice,
    finalPriceTimestamp: resolved.finalPriceTimestamp,
    finalPriceSource: resolved.finalPriceSource ?? args.finalPriceSource,
    now,
    ...rest,
  });
  return { ...out, refresh: resolved };
}

export function validateFinalPrice({
  entryPrice,
  finalPrice,
  finalPriceTimestamp,
  now = Date.now(),
  maxAgeMs = DEFAULT_FINAL_PRICE_MAX_AGE_MS,
  allowUnchangedPrice = true,
}) {
  const entry = finite(entryPrice);
  const price = finite(finalPrice);
  const timestamp = finite(finalPriceTimestamp);
  const ageMs = timestamp == null ? null : Math.max(0, now - timestamp);
  const errors = [];
  if (entry == null || entry <= 0) errors.push('INVALID_ENTRY_PRICE');
  if (price == null || price <= 0) errors.push('INVALID_FINAL_PRICE');
  if (timestamp == null) errors.push('MISSING_FINAL_PRICE_TIMESTAMP');
  if (ageMs != null && ageMs > maxAgeMs) errors.push('STALE_FINAL_PRICE');
  if (!allowUnchangedPrice && entry != null && price === entry) errors.push('FROZEN_FINAL_PRICE');
  return Object.freeze({
    valid: errors.length === 0,
    errors,
    finalPrice: price,
    finalPriceTimestamp: timestamp,
    finalPriceAgeMs: ageMs,
    finalPriceFresh: ageMs != null && ageMs <= maxAgeMs,
    finalPriceValidationPassed: errors.length === 0,
    finalPriceFallbackUsed: false,
    autoEndUsedEntryPriceFallback: false,
    finalizationDataQuality: errors.length === 0 ? 'COMPLETE' : 'FINALIZATION_FAILED',
    finalizationVersion: TRADE_FINALIZATION_VERSION,
  });
}

export function prepareLongTradeFinalization({
  trade,
  finalPrice,
  finalPriceTimestamp,
  finalPriceSource = 'UNKNOWN',
  now = Date.now(),
  maxAgeMs = DEFAULT_FINAL_PRICE_MAX_AGE_MS,
  allowUnchangedPrice = true,
  roundTripFeePct = 0.10,
  slippagePct = 0,
}) {
  const validation = validateFinalPrice({
    entryPrice: trade?.entryPrice,
    finalPrice,
    finalPriceTimestamp,
    now,
    maxAgeMs,
    allowUnchangedPrice,
  });
  if (!validation.valid) {
    return Object.freeze({ ok: false, validation, pnl: null, finalizationFailureCode: validation.errors[0] ?? 'UNKNOWN' });
  }
  const pnl = computeClosedLongPnl(
    Number(trade.entryPrice),
    validation.finalPrice,
    Number(trade.leverage ?? 1),
    roundTripFeePct,
    slippagePct,
  );
  return Object.freeze({
    ok: true,
    validation,
    pnl,
    finalizationFailureCode: null,
    finalPriceSource,
    finalPriceTimestamp: validation.finalPriceTimestamp,
  });
}
