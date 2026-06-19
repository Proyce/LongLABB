# LongLAB Tick Direction V9 Implementation Report

## Outcome

Implemented a research-only Binance Futures tick-direction observatory that:

- warms genuine `bookTicker` and `aggTrade` buffers before entry;
- isolates candidate research sockets from the open-position lifecycle stream;
- freezes entry snapshots synchronously without delaying or blocking entries;
- keeps raw events in bounded runtime-only buffers;
- separates legacy closed-candle aliases from genuine market-tick fields;
- calculates count-window, time-window, aggressor-flow, book-pressure, agreement, pattern, bias, confidence, and ATR-context telemetry;
- records 1s/3s/5s/10s/30s/60s fixed-horizon outcomes incrementally;
- exposes V9 filters, exports, migration, hypotheses, purity guards, and a Tick Direction Lab;
- preserves Long Gate, AES, BestDNA, Candidate Runner, PF10, sizing, leverage, admission, and exit behavior.

All new research records carry `logOnly: true`, `canAffectExecution: false`, and `executionApplied: false`, plus tick-specific shadow-only safety flags.

## New modules

- `src/marketData/binanceFuturesTickParsers.js`
- `src/tickDirection/tickDirection.config.js`
- `src/tickDirection/tickDirection.types.js`
- `src/tickDirection/tickDirection.parsers.js`
- `src/tickDirection/tickDirectionBuffer.js`
- `src/tickDirection/candidateTickStream.js`
- `src/tickDirection/tickDirectionFeatures.js`
- `src/tickDirection/tickDirectionLabels.js`
- `src/tickDirection/tickDirectionScore.js`
- `src/tickDirection/tickDirectionSnapshot.js`
- `src/tickDirection/tickDirectionOutcomeAudit.js`
- `src/tickDirection/tickDirection.flatten.js`
- `src/tickDirection/tickDirectionAnalytics.js`
- `src/tickDirection/TickDirectionLabPanel.jsx`

Colocated tests cover parsers, buffers, features, snapshot timing, scores through integration parity, outcome filling, schema migration, isolated sockets, 250,000-event bounded ingestion, and payload-size budgets.

## Main integration changes

- `src/app/LongLabApp.jsx`
  - starts/stops the isolated collector;
  - updates debounced membership from top losers, top gainers, and lifecycle handover symbols;
  - captures one frozen snapshot per manual/batch entry using the authoritative entry timestamp and price;
  - enriches the frozen evidence after REST telemetry without recapturing ticks;
  - applies fixed-horizon audits in the existing lifecycle tick flush;
  - passes stream health to the research cockpit.
- `src/shadowLong/binancePriceStream.js`
  - reuses neutral shared parsers while retaining its independent lifecycle sockets and mark-price safety fallback.
- `src/research/*`
  - adds normalized `tickMicrostructure` facts and a shadow-only pipeline stage;
  - keeps genuine tick fields outside required global Long data quality.
- `src/filters/*`
  - relabels `LAST_3_TICKS_DIRECTION` as a closed-1m-candle legacy alias;
  - adds the `TICK_MICROSTRUCTURE` family and outcome-only horizon filters;
  - recognizes native V9 and historical V8 schemas.
- `src/export/*`
  - exports explicit scalar entry/outcome fields;
  - includes tick configuration, thresholds, windows, neutral rule, and stream schema in the batch manifest.
- `src/migrations/migrateLongTradeRecord.js`
  - maps legacy candle aliases without fabricating genuine tick evidence.
- `src/telemetry/telemetryCompaction.js`
  - excludes raw/nested tick payloads and keeps a compact analysis subset.
- `src/research/longResearchSchemaVersions.js`
  - canonical single source of truth for all 14 research/export/runtime version constants;
  - re-exported by filter constants, export schema, migration, and snapshot builder so all modules resolve the same identity.
- `scripts/check-long-*.mjs`
  - reject execution dependencies and entry/outcome leakage.
- `scripts/run-ci.mjs`
  - orchestrates the full gate: syntax → build → unit shard 1/2 → runtime purity → filter purity → export purity; exits non-zero on first failure.

## Version changes

All 14 constants are exported from `src/research/longResearchSchemaVersions.js` and stamped into every trade record and batch manifest.

- `LONG_ENTRY_RESEARCH_V9`
- `LONG_FILTER_SNAPSHOT_V9`
- `LONG_TRADE_EXPORT_V9`
- `LONG_SCORE_REGISTRY_V7_2026_06`
- `LONG_FILTER_REGISTRY_V7_2026_06`
- `LONG_LABEL_REGISTRY_V7_2026_06`
- `LONG_COMBO_REGISTRY_SCHEMA_V4_2026_06`
- `LONG_TICK_DIRECTION_V1_2026_06`
- `LONG_ANTI_COMBO_REGISTRY_V2_2026_06`
- `LONG_WINNING_SETUPS_V2_2026_06`
- `LONG_MARKET_CONTEXT_V2_2026_06`
- `LONG_EXIT_SYSTEM_V4_2026_06`
- `LONG_FEE_MODEL_V2_2026_06`
- `LONG_PNL_MODEL_V2_2026_06`

## Payload budgets

Synthetic full snapshot overhead: 5,902 bytes.

Synthetic compact runtime overhead: 1,627 bytes.

Both remain below the requested 8 KB forensic and 2 KB compact targets. No raw event arrays are attached to trades, persistence, React state, CSV, or analysis ZIP rows.

## Validation

- source syntax: passed (286 files);
- production build: passed;
- unit shard 1 (53 files): 566 tests passed;
- unit shard 2 (52 files): 934 tests passed — 1,500 total across 105 test files;
- tick-direction suite: 16 tests passed (covered within both shards; independently runnable);
- filter purity: passed;
- export purity: passed;
- runtime/execution purity: passed;
- 250,000 synthetic events across 80 symbols: bounded, completed in 624 ms on the validation machine (under the 15 s test timeout and below the 1 s informal target).

## Initial analysis tables

The Tick Direction Lab now produces:

- accuracy by ATR tier and horizon;
- pattern performance;
- confidence calibration;
- 5-second prediction/actual confusion matrix;
- canonical-source and trade/book-agreement diagnostics;
- legacy closed-candle versus genuine-tick comparison;
- high-ATR hypothesis counts/status;
- recent tick-audited trade rows.

No directional edge is claimed in this implementation report because no new live V9 run corpus existed during implementation.

## Known validation boundary

The three separate five-minute live browser soaks (Top Losers, Top Gainers, Mixed 25/25) were not executed in this coding environment. The collector and runtime paths are covered by deterministic unit, integration, purity, build, and high-volume synthetic tests, but live Binance socket uptime/reconnect and browser-render soak metrics still require an operator run with the app open.
