// ─── POSITION PRICE WATCHDOG ─────────────────────────────────────────────────
// Pure helpers for per-symbol freshness and CRITICAL REST fallback construction.

export const POSITION_PRICE_WATCHDOG_VERSION = 'POSITION_PRICE_WATCHDOG_V2_2026_06';
export const DEFAULT_SYMBOL_STALE_MS = 3_000;

const finite = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function classifyLifecycleSymbolFreshness({
  symbol,
  health,
  staleAfterMs = DEFAULT_SYMBOL_STALE_MS,
}) {
  const age = finite(health?.latestTickAgeMs);
  const stale = age == null || age > staleAfterMs;
  return Object.freeze({
    symbol: String(symbol ?? '').toUpperCase(),
    stale,
    latestTickAgeMs: age,
    latestSource: health?.latestSource ?? null,
    reason: age == null ? 'NO_SYMBOL_TICK' : stale ? 'SYMBOL_TICK_STALE' : 'FRESH',
  });
}

export function collectStaleLifecycleSymbols(symbols, getHealth, staleAfterMs = DEFAULT_SYMBOL_STALE_MS) {
  return (symbols ?? [])
    .map(symbol => classifyLifecycleSymbolFreshness({
      symbol,
      health: getHealth(symbol),
      staleAfterMs,
    }))
    .filter(result => result.stale);
}

export function buildCriticalRestFallbackTick({ symbol, price, checkedAt = Date.now(), stale }) {
  const parsedPrice = finite(price);
  if (!symbol || parsedPrice == null || parsedPrice <= 0) return null;
  return Object.freeze({
    symbol: String(symbol).toUpperCase(),
    price: parsedPrice,
    source: 'REST_CRITICAL_FALLBACK_V2',
    precision: 'COARSE',
    schemaValidated: true,
    priceStreamSchemaVersion: 'REST_ALL_PRICES_V2_PER_SYMBOL_STALE',
    t: checkedAt,
    receivedAt: checkedAt,
    staleAgeMs: finite(stale?.latestTickAgeMs),
    fallbackReason: stale?.reason ?? 'PER_SYMBOL_STALE',
    watchdogVersion: POSITION_PRICE_WATCHDOG_VERSION,
  });
}
