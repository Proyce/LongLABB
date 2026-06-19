## v1.0.4 — Telemetry V8 Cleanup and Long-Session Stability

### Critical UI stability
- Fixed the nullable `finalPnlPct.toFixed()` render crash that could blank the page after a finalization failure.
- Added finite-PnL analytics populations, null-safe formatters, and an application error boundary.

### Scanner and stream stability
- Split the 15-second fast ticker/funding scan from the 60-second background kline/OI enrichment scan.
- Added a 12-second scan request deadline and retained the last complete universe snapshot on timeout.
- Deferred WebSocket closing while a socket is still CONNECTING to remove close-before-open warnings.

### Telemetry V8
- Removed four heavy duplicated nested objects from compact runtime persistence and default exports.
- Moved static registry/model metadata to the batch manifest.
- Consolidated duplicate aliases, corrected entry-policy diagnostic naming, and separated required completeness from optional research coverage.
- Added sparse exceptional lifecycle evidence in `forensics/exit_events.jsonl`.
- Reduced the uploaded 100-trade default JSON export by 87.42%, from 8.51 MiB to 1.07 MiB.

### Validation
- Three concurrent real-time five-minute deterministic soak runs completed, 150/150 trades closed, zero invalid PnL, zero heavy duplicate fields.
- Production build and LONG runtime/filter/export purity passed.
- 92 test files / 1,449 tests passed.

## v1.0.2 — Run-79 Lifecycle Feed Watchdog and Canonical Analytics Repair

### Active-position feed safety
- Added routed `/public` bookTicker and `/market` aggTrade sockets.
- Added a low-priority all-symbol `markPrice@1s` websocket safety stream so quiet positions do not depend on REST.
- Added per-symbol freshness monitoring and CRITICAL fail-fast REST as the final emergency layer.
- Prevented trade closures from reconnecting every remaining symbol.
- Buffered/coalesced lifecycle ticks to avoid UI saturation.

### Research/export completeness
- Derived `longMicroMomentumLabel` before freezing the entry snapshot.
- Applied complete version stamps at trade creation.
- Populated `priceMovePct` on finalization.
- Upgraded entry/filter/export contracts to V7 and exit system to V4.
- Added lifecycle freshness/fallback fields; export now has 316 unique columns.

### Analytics correctness
- Normalized canonical close reasons across Runs, Filters, AES, session, side, and sub-bucket analytics.
- Fixed the zero TP/TRAIL and SL distribution counts.
- Corrected legacy short-direction live PnL in LongLAB session health.

### Validation
- 251 source files passed syntax checks.
- Production build passed.
- 87 test files / 1,434 tests passed.
- LONG runtime, filter, and export purity passed.

# Changelog

## v1.0.1 — Run-77 Binance bookTicker Price-Field Hotfix

### Critical fix
- Corrected Binance USD-M `bookTicker` parsing: lowercase `a` is the best ask **price**; uppercase `A` is ask **quantity**.
- The previous parser used `A` as price, producing impossible mids such as `426106.0002098` for NOTUSDT and contaminating MFE, trailing exits, and run totals.

### Defense in depth
- Added schema-validated book-ticker parsing with crossed-book and absurd-spread rejection.
- Added a second lifecycle price-integrity gate before any tick can update PnL, MFE, MAE, locks, trails, or exits.
- Added explicit `priceStreamSchemaVersion`, `priceTickSchemaValidated`, `priceIntegrityStatus`, and failure telemetry.
- Quarantines records from the unversioned `INDEPENDENT_WEBSOCKET_V1` build from run metrics while preserving them for operational audit/export.
- Runs UI now excludes quarantined records from PnL, win-rate, MAE, and MFE and displays a visible integrity warning.

### Validation
- Exact run-77 regression payload now resolves to `0.0004198`, not `426106.0002098`.
- Uploaded run 77: 50/50 records correctly quarantined after migration.
- Production build passed.
- 86 test files / 1,428 tests passed.
- LONG runtime, filter, and export purity passed.


## v3 — Evidence-Gathering + Profit Locks

### Profit Locks (live enforcement)
- Ratchet-up lock mechanism: once triggered, floor never decreases
- Leverage-specific tiers: 5x (2 stages), 10x (3 stages), fallback (2 stages)
- Exit priority: TP → TRAIL → PROFIT_LOCK → SL → TIMEOUT
- Beep on lock exit (440 Hz), tracked as `closeReason: "PROFIT_LOCK"`

### Analytics & Telemetry (logs only — no blocking)
- **Loss profile**: WIN / INSTANT_BAD_ENTRY / CHOPPY_STOP / PROFIT_THEN_REVERSED / SLOW_BLEED
- **Entry timing grade A–F**: tick direction, micro-bounce, VWAP position, green impulse
- **Session quality**: SHORT_FRIENDLY / BOUNCE_TRAP / HIGH_CHOP / MIXED — fetched from BTC+ETH 15m klines on set start
- **Spread bucket**: 4 tiers from ≤0.02% to >0.10%
- **ATR bucket**: 6 tiers from ≤0.2% to >2.0%
- **Entry rank bucket**: RANK_1_TO_5 through RANK_21_TO_25
- **CVD interpretation**: telemetry label only
- **Bounce context**: FRESH_BREAKDOWN / NEAR_LOW / BOUNCED_AND_REJECTING / BOUNCE_CONTINUING
- **Warning flags**: SPREAD_ABOVE_0_05/0_10, SPREAD_WIDE_FOR_10X, ATR_ABOVE_1/2, LOWER_PRIORITY_RANK
- **Stale detection**: trades with no price movement after 5 min marked isStale / isInvalidMarket

### New STATS Sections
- PROFIT LOCK ANALYTICS (activations, exits, SL avoided, PnL saved, missed opportunities)
- LOSS PROFILE breakdown
- ENTRY TIMING GRADE (A–F win rate, avg PnL, MFE)
- SPREAD BUCKET performance
- ATR BUCKET performance
- BOUNCE CONTEXT breakdown
- SESSION QUALITY HISTORY
- STALE DATA COMPARISON (all trades vs clean-only)

### UI
- Session quality banner in LOSERS tab (color-coded)
- Kill switch info banner (≥5 early SL hits in 15m)
- ActiveCard: profit lock stage badge, warning flags, entry timing row, bounce context
- ClosedCard: loss profile chip, LOCK EXIT badge, stale badge, timing grade
- IC Research: CLEAN ONLY toggle (excludes stale/invalid from Pearson r)

### CSV Export
- 28 new columns: all profit lock fields, timing, bucket labels, stale flags
