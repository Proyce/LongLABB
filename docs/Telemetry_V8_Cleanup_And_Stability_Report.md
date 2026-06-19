# LongLAB Telemetry V8 Cleanup and Stability Report

## Release

- Application version: `1.0.4`
- Entry research schema: `LONG_ENTRY_RESEARCH_V8`
- Filter snapshot schema: `LONG_FILTER_SNAPSHOT_V8`
- Trade export schema: `LONG_TRADE_EXPORT_V8`
- Batch analysis package: `LONG_BATCH_ANALYSIS_V3_TELEMETRY_V8`
- Default export columns: 267 unique columns
- Execution policy: unchanged, research gates remain log-only

## Scope

This build fixes the blank-page render crash and scanner-overrun behavior observed during long sessions, then applies the audited V8 telemetry cleanup without removing analysis-critical evidence.

The work was completed in this order:

1. Render crash containment and source fix.
2. Fast scanner and deep telemetry separation.
3. WebSocket lifecycle cleanup.
4. Runtime telemetry compaction.
5. Default export compaction and forensic separation.
6. V7 import compatibility and V8 schema migration.
7. Full automated regression and three real-time five-minute deterministic soak runs.

## 1. Blank-page crash

### Root cause

The Runs/analytics population treated every `closed` record as PnL-valid. A closed `FINALIZATION_FAILED` record can legitimately have `finalPnlPct = null`. The equity-curve renderer then executed:

```js
sample.finalPnlPct.toFixed(2)
```

React threw `Cannot read properties of null (reading 'toFixed')`, unmounted the cockpit, and left a blank page.

### Repair

- Added `src/ui/safeFormat.js` with null-safe finite-number helpers.
- Added `hasFiniteClosedPnl()` and separated `closedSamples` from `closedPnlSamples`.
- PnL analytics, IC, equity, scatter, rank, UTC-hour, and profit-lock analytics now operate on finite PnL rows only.
- Replaced unsafe render formatting with `safeFixed()`, `safeRound()`, and `safeSignedPercent()`.
- Added `AppErrorBoundary` as a final containment layer so an unexpected render fault shows a recovery screen instead of an empty page.
- Added source-contract regression tests that reject the old `finalPnlPct.toFixed()` path.

### Result

A closed record with null PnL remains visible for operational audit but cannot enter performance arithmetic or crash rendering.

## 2. Scanner overruns

### Root cause

The nominal 15-second scan awaited hundreds of kline and open-interest enrichment requests. Under rate limiting or slow networking, a scan could take 44 to 78 seconds and overlap later cycles.

### Repair

The scan was split into two lanes:

### Fast universe scan

- Ticker and funding refresh only.
- 12-second request deadline through `AbortController`.
- Retains the last complete universe snapshot when a deadline is exceeded.
- Never waits for deep telemetry fan-out.

### Deep telemetry scan

- Kline and OI enrichment runs in the background.
- At most once every 60 seconds.
- Protected by a busy flag so cycles cannot overlap.
- Slow deep cycles are reported independently and do not block the cockpit or lifecycle engine.

### Result

In the real-time soak, fast-scan maximum duration was below 0.6 ms in the deterministic harness, while simulated deep scans reached 141.58 ms without delaying lifecycle ticks or rendering.

## 3. WebSocket close-before-open warning

### Root cause

The stream manager could call `close()` while a routed WebSocket was still in the `CONNECTING` state. Chrome reports this as a connection failure warning.

### Repair

- Event handlers are detached during teardown.
- An OPEN socket closes immediately.
- A CONNECTING socket receives a deferred `onopen` close instead of an invalid immediate close.
- Added a permanent regression test for CONNECTING-state destruction.

## 4. Telemetry cleanup

### Heavy duplicate objects removed from compact runtime/default export

The following nested objects duplicated already-flattened fields:

- `entryResearchSnapshot`
- `longWinningSetupMatchDetails`
- `longComboDetails`
- `entrySnapshotFieldStatus`

They are no longer retained in compact runtime persistence or the default V8 master export.

### Static metadata moved to the batch manifest

Repeated registry/configuration values are represented once in `manifest.json`, including score, filter, label, combo, setup, market-context, exit-system, and PnL-model versions.

The per-trade schema and fee information needed for safe row interpretation remain available.

### Exact aliases removed from the default V8 export

Examples include:

- legacy raw PnL aliases where canonical gross/fee-adjusted fields exist;
- duplicate adaptive AES names;
- duplicate setup/combo counts;
- deprecated profit-lock aliases;
- overlapping schema/version aliases;
- hard-coded-null or unimplemented fields.

The migration layer still accepts V7/legacy records and maps them into the V8 canonical model.

### Sparse forensic events

The batch analysis ZIP contains:

```text
forensics/exit_events.jsonl
```

Only exceptional records are written there, including price-integrity failures, finalization failures, lock misses, degraded fallback events, and classified stop-gap events.

Healthy rows are not burdened with forensic payloads.

## 5. Telemetry correctness fixes

- `entryPolicyDiagnosticDecision`, action, and quality tier now use the actual evaluator names instead of a null `entryPolicyShadowDecision` alias.
- `marketContextFreshnessMs` is derived from context timestamps when possible.
- Required entry completeness and optional research coverage are explicitly separated:
  - `requiredEntrySnapshotCompletenessPct`
  - `optionalResearchFeatureCoveragePct`
- A required-complete but optional-partial snapshot is now labelled `REQUIRED_COMPLETE_OPTIONAL_PARTIAL`, not generically defective.
- V8 migration does not rehydrate removed heavy nested objects or deprecated aliases.

## 6. Measured size reduction

Benchmark source: the uploaded 100-trade current-view JSON from runs 99 and 100.

| Payload | Bytes | Approximate size |
|---|---:|---:|
| Original JSON | 8,921,558 | 8.51 MiB |
| Compact runtime JSON | 1,219,807 | 1.16 MiB |
| Default V8 export JSON | 1,122,281 | 1.07 MiB |
| Default V8 CSV | 449,617 | 0.43 MiB |

Default V8 JSON reduction: **87.42%**.

No heavy duplicate field remained in the default export.

## 7. Files changed

### Stability and lifecycle

- `src/app/LongLabApp.jsx`
- `src/main.jsx`
- `src/ui/safeFormat.js`
- `src/ui/safeFormat.test.js`
- `src/ui/AppErrorBoundary.jsx`
- `src/ui/appStabilitySource.test.js`
- `src/shadowLong/binancePriceStream.js`
- `src/shadowLong/binancePriceStream.test.js`

### Telemetry and schemas

- `src/telemetry/telemetryCompaction.js`
- `src/telemetry/telemetryCompaction.test.js`
- `src/research/buildLongEntryResearchSnapshot.js`
- `src/research/longResearchSchemaVersions.js`
- `src/entryPolicy/entryPolicy.flatten.js`
- `src/marketRegime/normalizeLongMarketContext.js`
- `src/migrations/migrateLongTradeRecord.js`
- `src/migrations/migrateLongTradeRecord.v5.test.js`

### Export

- `src/export/longTradeExportSchema.js`
- `src/export/longTradeExport.js`
- `src/export/longBatchExport.js`
- `src/export/longBatchExport.test.js`
- `src/export/longTradeExportSchema.v5.test.js`
- `scripts/check-long-export-purity.mjs`

### Validation and packaging

- `scripts/run-telemetry-v8-soak.mjs`
- `scripts/check-all-source-syntax.mjs`
- `package.json`
- `package-lock.json`
- `BUILD_INFO.txt`
- `CHANGELOG.md`

## 8. Important boundary

The three five-minute validations are real wall-clock deterministic lifecycle soaks using the production calculation, lifecycle, telemetry compaction, and export modules. They are not live Binance market runs because the build environment cannot resolve or access Binance endpoints.

The local browser app should still be given a short live-market verification run after extraction. The supplied deterministic runs prove timing, memory, lifecycle, null safety, export shape, and fallback behavior without pretending that inaccessible external market connectivity was tested.
