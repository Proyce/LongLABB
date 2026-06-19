# LongLAB Run-79 Lifecycle Feed Watchdog Fix

## Status

Implemented in LongLAB v1.0.2.

This repair addresses the delayed-stop pattern found in the June 17 run-79/80 exports, where individual positions could receive no lifecycle websocket tick for roughly two minutes and were only evaluated after a REST all-prices refresh. The delayed refresh caused clustered stop-loss closures and severe stop overshoot on affected symbols.

## Evidence reproduced

The permanent regression fixture uses the observed VELVETUSDT pattern:

- Entry price: `0.4435`
- Delayed observed price: `0.4129`
- Missing/stale lifecycle interval: `120,386 ms`
- Expected result: immediate `STOP_LOSS` on the first valid safety tick

The test verifies that activity on another symbol cannot hide a stale VELVETUSDT position.

## Root causes

1. Binance futures websocket streams now require routed endpoints for the relevant stream families.
2. A single unrouted connection did not provide reliable aggregate-trade coverage.
3. Any existing book tick could suppress aggregate-trade handling even after becoming stale.
4. Subscription effects rebuilt the entire socket membership when individual trades closed.
5. Health was effectively global, allowing a busy symbol to hide another stale symbol.
6. REST fallback was the only practical safety path for some quiet or disconnected symbols.
7. Several UI and analysis panels still counted legacy close codes (`SL`, `TRAIL`, `TP`) after runtime finalization moved to canonical values (`STOP_LOSS`, `TRAILING_EXIT`, `TAKE_PROFIT`).
8. Session-health live PnL still used short-side price direction in one legacy calculation.

## New lifecycle price architecture

### Primary path 1: routed book ticker

- Endpoint family: `/public`
- Stream: `<symbol>@bookTicker`
- Uses lowercase `b` and `a` as bid and ask prices.
- Best source for spread-aware midpoint lifecycle pricing.

### Primary path 2: routed aggregate trades

- Endpoint family: `/market`
- Stream: `<symbol>@aggTrade`
- Supplies frequent traded prices when the book stream is delayed or reconnecting.

### Safety path: all-symbol mark price

- Endpoint family: `/market`
- Stream: `!markPrice@arr@1s`
- Independent of REST rate limits.
- Only emits to a position when that symbol has not received a recent book/trade tick.
- Lower priority than book and trade prices.

### Final emergency path: CRITICAL REST

- Per-symbol stale watchdog runs independently of discovery.
- One compact all-prices request refreshes only stale active symbols.
- Uses the CRITICAL rate-limiter lane and fails fast.
- No normal scanner request can sit ahead of an open-position emergency refresh.

## Reconnect and subscription repair

- Separate reconnect state exists for book, trade, and mark sockets.
- Individual trade closure no longer disconnects all remaining symbols.
- Symbol membership is retained until the last active position closes.
- Adding a new symbol rebuilds only symbol-specific book/trade sockets.
- The global mark-price safety socket remains connected during membership changes.
- Reconnection continues at a capped retry delay instead of permanently giving up.

## Tick processing repair

- Lifecycle ticks are validated before touching PnL, MAE, MFE, locks, trails, or exits.
- Valid ticks are coalesced per symbol and flushed every 100 ms to protect UI performance.
- Source priority is:
  1. `BOOK_TICKER`
  2. `AGG_TRADE`
  3. `REST_CRITICAL_FALLBACK_V2`
  4. `MARK_PRICE_1S`
  5. legacy REST fallback
- The mark stream is suppressed while a primary tick is fresh.
- Staleness is evaluated per symbol, never only per socket.

## Data-quality and export repairs

- `longMicroMomentumLabel` is deterministically derived before the entry snapshot is frozen when the raw label is absent.
- All new trades receive the complete V7 research/version stamp at creation, including trades that close before asynchronous enrichment completes.
- `priceMovePct` is populated during finalization.
- Lifecycle freshness and fallback telemetry is included in the canonical CSV export.
- Export schema is now `LONG_TRADE_EXPORT_V7` with 316 unique columns.
- Entry snapshot schema is now `LONG_ENTRY_RESEARCH_V7`.
- Filter snapshot schema is now `LONG_FILTER_SNAPSHOT_V7`.
- Exit system is now `LONG_EXIT_SYSTEM_V4_2026_06`.

## Canonical close-reason repair

All LongLAB run summaries, Filter analytics, AES analytics, side/sub-bucket statistics, early-stop banners, session health, and closed-card colors now normalize close reasons before classification.

Canonical codes include:

- `TAKE_PROFIT`
- `STOP_LOSS`
- `TRAILING_EXIT`
- `PROFIT_LOCK`
- `TIMEOUT`
- `RUN_STOP`
- `APP_SHUTDOWN`

This fixes the incorrect zero counts previously shown for TP/trail and SL distribution despite visible closed rows.

## Session-health direction repair

Live fee-adjusted session PnL now uses LONG direction:

```text
(currentPrice - entryPrice) / entryPrice
```

The former legacy short-direction expression was removed.

## Protection boundary

This remains a browser research/simulation application. The lifecycle is now protected by three websocket paths plus CRITICAL REST fallback, but it does not claim to place authenticated exchange-native stop orders. Real resting Binance stop orders require the future authenticated backend execution adapter.

## Validation

- Source syntax: 251 files passed
- Production build: passed
- Unit tests: 87 files, 1,434 tests passed
- Routed price-stream tests: passed
- Run-77 bookTicker field regression: passed
- Run-79 delayed VELVET stop regression: passed
- LONG runtime purity: passed
- LONG filter purity: passed
- LONG export purity: passed
- Export columns: 316 unique
