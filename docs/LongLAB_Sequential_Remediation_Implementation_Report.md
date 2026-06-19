# LongLAB Sequential Remediation Implementation Report

## Delivery status

Implemented against `LongLAB-main-june16-winning-setups`.

This delivery completes the requested sequential remediation across:

1. profit-lock and open-position lifecycle correctness;
2. frozen final-price and close-reason integrity;
3. immutable entry-snapshot provenance;
4. schema, PnL-unit, and migration truthfulness;
5. shared Long rule semantics;
6. LONG-aware CVD, market-context, ATR, anti-combo, and evidence-family research fields;
7. analysis-first 20-run batch export;
8. rate-limit isolation so scanner throttling cannot freeze open-trade monitoring.

The application remains a browser-side research/simulation cockpit. It does not contain authenticated Binance order credentials or a backend exchange execution service. Consequently, this patch does not falsely claim to place a live exchange-native stop. It implements:

- an honest `SIMULATED_LOCAL_STOP` protection venue;
- a formal protection state machine;
- websocket-first open-position lifecycle monitoring;
- immediate local closure on floor breach, including after PnL has crossed below zero;
- a `ProfitLockProtectionAdapter` contract for a future authenticated backend.

## Critical safety result

A calculated lock is no longer presented as exchange protection.

The lifecycle distinguishes:

```text
NOT_ELIGIBLE
CALCULATED
SUBMITTING
PROTECTION_PENDING
PROTECTED
UPDATE_REQUIRED
UPDATING
FLOOR_BREACHED_UNCLOSED
EXCHANGE_TRIGGERED
PARTIALLY_FILLED
FILLED
EMERGENCY_EXIT_PENDING
EMERGENCY_EXITED
DEGRADED
FAILED
CLOSED
```

For this frontend build, verified protection is explicitly labelled:

```text
SIMULATED_LOCAL_STOP
```

The adapter contract reserves:

```text
EXCHANGE_NATIVE
```

for a future backend implementation.

---

# 1. Wave 1: execution and data truth

## 1.1 Profit-lock enforcement

Created:

- `src/lifecycle/profitLockProtection.js`
- `src/lifecycle/profitLockProtection.test.js`
- `src/lifecycle/profitLockStrategy.js`
- `src/lifecycle/openPositionLifecycle.js`
- `src/lifecycle/openPositionLifecycle.test.js`

Key repairs:

- once a lock arms, it remains armed until closure;
- a LONG floor is monotonic and can never move downward;
- floor breach closes the trade even when current leveraged PnL is already negative;
- no positive-PnL guard may block closure;
- websocket observations are distinguished from REST observations;
- REST polling does not pretend to know the true floor-cross timestamp;
- local calculation, submitted protection, verified protection, floor breach, and preservation are separate facts;
- simulated protection is never mislabelled as exchange-native protection;
- an exchange adapter interface now defines submit, replace, cancel, reconciliation, and emergency-close operations for later backend integration.

New or corrected telemetry includes:

```text
profitLockStrategyActive
profitLockProtectionState
profitLockProtectionVenue
profitLockProtectionVerified
profitLockProtectionVersion
profitLockProtectionRequested
profitLockOrderSubmitted
profitLockOrderAcknowledged
profitLockOrderResting
profitLockProtectedFloorPrice
profitLockProtectedFloorMarginPct
profitLockProtectedStage
profitLockFloorBreachedWhilePositionOpen
profitLockFloorBreachedInLoss
profitLockPnlAtFloorBreach
profitLockFloorCrossedAt
profitLockLocalTriggerDetectedAt
profitLockCrossToLocalDetectionLatencyMs
profitLockCrossTimePrecision
profitLockFloorPreserved
profitLockFloorMissed
profitLockEmergencyFallbackUsed
profitLockEnforcementFailed
profitLockCloseBlockedByPositivePnlGuard
profitLockProtectionModeHonestLabel
```

## 1.2 Independent open-position lifecycle

`LongLabApp.jsx` now maintains active-position price handlers independently of discovery.

The lifecycle path uses Binance websocket updates for active positions only. It continues to manage trades when:

- discovery is paused;
- a run finishes;
- the next scanner cycle is delayed;
- scanner REST traffic is held by the rate limiter.

A run-window ending no longer manufactures `AUTO_END` records. Positions remain managed until a real exit condition occurs.

## 1.3 Stale-websocket fallback

When the active-position websocket is stale, the app performs one compact all-symbol `/ticker/price` refresh through the CRITICAL lifecycle lane and dispatches prices to existing open-position handlers.

The fallback:

- does not enqueue behind normal scanner traffic;
- fails fast when safe REST capacity is unavailable;
- marks lifecycle protection degraded rather than silently freezing state;
- never converts a rate-limiter delay into a fake trade outcome.

## 1.4 Final-price integrity

Created:

- `src/lifecycle/tradeFinalization.js`
- `src/lifecycle/tradeFinalization.test.js`

Finalization now validates:

- entry price;
- final price;
- final-price timestamp;
- maximum age;
- data quality;
- source provenance.

New fields include:

```text
finalPriceSource
finalPriceTimestamp
finalPriceAgeMs
finalPriceFresh
finalPriceValidationPassed
finalPriceFallbackUsed
autoEndUsedEntryPriceFallback
finalizationDataQuality
finalizationFailureCode
finalizationVersion
```

Missing or stale final prices fail explicitly. They are not replaced silently with entry price.

## 1.5 Legacy frozen records

`migrateLongTradeRecord.js` now identifies legacy frozen-price, fee-only run-end records and preserves them as operational history while excluding them from clean strategy research.

Legacy `AUTO_END` is canonicalized to an explicit run-stop meaning where appropriate, and suspicious records receive research-exclusion/data-quality metadata rather than masquerading as valid market outcomes.

## 1.6 Close-reason semantics

Created:

- `src/lifecycle/closeReasons.js`
- `src/lifecycle/closeReasons.test.js`

Canonical reasons now distinguish actual causes such as:

```text
TAKE_PROFIT
STOP_LOSS
TRAILING_EXIT
PROFIT_LOCK
TIMEOUT
RUN_STOP
APP_SHUTDOWN
EMERGENCY_EXIT
POSITION_RECONCILIATION
MANUAL_CLOSE
FINALIZATION_FAILED
```

New runtime code no longer creates ambiguous `AUTO_END` outcomes.

## 1.7 Canonical PnL model

`src/domain/longTradeMath.js` centralizes fee-aware Long PnL calculations and separates:

```text
priceMovePct
grossNormPnlPct
grossLeveragedPnlPct
entryFeeNormPct
exitFeeNormPct
totalFeeNormPct
feeAdjustedNormPnlPct
feeAdjustedLeveragedPnlPct
```

Lock floors and closed outcomes use explicit unit names rather than generic `pnl` or `floorPct` semantics.

---

# 2. Wave 1: entry snapshot, schema, and export truth

## 2.1 Entry provenance

Created:

- `src/research/entrySnapshotProvenance.js`
- `src/research/entrySnapshotProvenance.test.js`

Entry fields now distinguish:

```text
RECORDED
NOT_RECORDED
UNAVAILABLE
STALE
CALCULATION_FAILED
```

A missing value is not converted into `false`.

Provenance records whether a value belongs to:

```text
ENTRY
LIVE
EXIT
RECONSTRUCTED
```

The V6 entry research snapshot includes schema/registry versions and explicit completeness metadata.

## 2.2 V6 version contract

`src/research/longResearchSchemaVersions.js` is now the single version source:

```text
LONG_ENTRY_RESEARCH_V6
LONG_FILTER_SNAPSHOT_V6
LONG_TRADE_EXPORT_V6
LONG_SCORE_REGISTRY_V6_2026_06
LONG_FILTER_REGISTRY_V6_2026_06
LONG_LABEL_REGISTRY_V6_2026_06
LONG_COMBO_REGISTRY_SCHEMA_V3_2026_06
LONG_ANTI_COMBO_REGISTRY_V2_2026_06
LONG_WINNING_SETUPS_V2_2026_06
LONG_MARKET_CONTEXT_V2_2026_06
LONG_EXIT_SYSTEM_V3_2026_06
LONG_FEE_MODEL_V2_2026_06
LONG_PNL_MODEL_V2_2026_06
```

Older records remain readable through migration. Missing fields in older schemas remain missing, not false.

## 2.3 Export schema

The Long trade export contains 306 unique, purity-checked columns.

The export guard verifies:

- unique keys;
- unique headers;
- no deprecated aliases;
- required fields;
- V6 schema version;
- no `[object Object]` serialization;
- callable getters;
- populated critical V6 columns.

---

# 3. Wave 2: rule truth

## 3.1 Shared rule semantics

Updated:

- `src/combos/longComboRegistry.js`
- `src/filters/evaluateLongWinningSetupMatches.js`
- `src/filters/longFilterRegistry.js`
- `src/filters/longCompareMode.js`
- `src/filters/FiltersTab.jsx`
- `src/research/buildLongEntryResearchSnapshot.js`

The same normalized research fields now drive the registry, setup matching, filters, exports, and cockpit explanations.

## 3.2 LONG-aware evidence semantics

Created:

- `src/research/longEvidenceSemantics.js`
- `src/research/longEvidenceSemantics.test.js`

The module provides versioned research-only semantics for:

- entry versus live CVD;
- LONG support versus contradiction;
- CVD override explanations;
- raw positive combo count;
- raw anti-combo count;
- independent positive evidence families;
- independent negative evidence families;
- evidence conflicts;
- conditional ATR context;
- anti-combo severity;
- clean and elite-clean combo-stack shadow decisions.

Evidence families include:

```text
ENTRY_QUALITY
MICRO_MOMENTUM
FLOW_CVD
VWAP_STRUCTURE
REVERSAL_EXHAUSTION
VOLATILITY
FUNDING
MARKET_CONTEXT
```

This prevents three correlated combo badges from pretending to be three independent ideas.

## 3.3 CVD semantics

The research snapshot now separates:

```text
cvdStateAtEntry
cvdStateCurrent
cvdSupportsLongAtEntry
cvdContradictsLongAtEntry
cvdChangedSinceEntry
cvdOverrideApplied
cvdOverrideReason
```

CVD remains log-only. `CVD_BEAR + no green confirmation` is represented as a strong Long contradiction rather than a generic badge.

## 3.4 Market-context normalization

Updated and tested:

- `src/marketRegime/normalizeLongMarketContext.js`
- `src/marketRegime/normalizeLongMarketContext.test.js`

The normalizer now keeps raw horizons, staleness, and LONG interpretation explicit. It avoids silently treating missing context as neutral and version-tags the normalized result.

## 3.5 Conditional ATR

ATR is no longer represented as universally good or bad.

Research-only context distinguishes:

```text
LOW_ENERGY
NORMAL
UNQUALIFIED_VOLATILITY_DANGER
QUALIFIED_VOLATILITY_BOOST
EXTREME_VOLATILITY_RESEARCH
```

High ATR becomes a boost only when elite quality, micro confirmation, and anti-combo safety already exist.

## 3.6 Anti-combo severity

Anti-combos now expose:

```text
INFO
SOFT
STRONG
HARD
```

The highest severity, counts, and explanations are exported for research. No new execution block was enabled.

## 3.7 Score-version roles

V1/V2 roles are explicit:

- BestDNA V1 remains the primary reference.
- BestDNA V2 remains shadow-only.
- AES V1 remains the primary reference.
- AES V2 remains shadow-only.

No V2 score can affect execution.

---

# 4. Analysis-first 20-run export

Created:

- `src/export/longBatchExport.js`
- `src/export/longBatchExport.worker.js`
- `src/export/longBatchExporter.js`
- `src/export/longBatchExport.test.js`

Added dependency:

```text
fflate
```

## 4.1 UI behavior

The Runs overview now contains:

```text
ALL EXPORT · ANALYSIS ZIP
```

The operator can select any available 20-run batch. The selector displays:

- batch identity;
- run count out of 20;
- trade count.

The export button shows worker progress and does not compress the archive on the main UI thread.

Current-view CSV and JSON exports remain available separately.

## 4.2 Performance correction

The former CSV hot path repeatedly migrated and sanitized a trade once per cell. With hundreds of columns, that multiplied work unnecessarily.

The V6 path prepares each trade once and serializes prepared values, substantially reducing repeated computation.

ZIP generation runs in a Web Worker, preventing compression from freezing the cockpit.

## 4.3 ZIP layout

Each selected batch produces one analysis ZIP containing:

```text
README_ANALYSIS.md
manifest.json

master/trades.csv
master/trades.jsonl

research_clean/closed_trades.csv
research_clean/closed_trades.jsonl

excluded/excluded_trades.csv
active/open_trades.csv

summary/batch_summary.json
summary/run_summary.csv
summary/data_quality_summary.csv
summary/field_coverage.csv
summary/exit_summary.csv
summary/side_summary.csv
summary/signal_summary.csv

schema/columns.json
schema/observed_versions.json
schema/analysis_contract.json

runs/run_<id>.csv   # one file for each of the selected runs
```

## 4.4 Analysis contract

The archive states:

```text
Primary metric: feeAdjustedNormPnlPct
Research-clean: closed and strategy-research eligible
Deduplication: newest/final state per trade ID
Missing values: preserved as missing, never converted to false
Batch size: 20 runs
```

The recommended analysis order is included inside every ZIP.

---

# 5. Rate limiter: trade lifecycle must not freeze

Reworked:

- `src/rateLimiter/index.js`
- `src/rateLimiter/index.test.js`
- `src/app/LongLabApp.jsx`

## 5.1 Four priority lanes

```text
CRITICAL
HIGH
NORMAL
LOW
```

`CRITICAL` is reserved for open-position lifecycle and reconciliation.

## 5.2 Capacity isolation

Normal and low scanner traffic cannot occupy all concurrency slots. Critical lifecycle capacity is retained.

The current policy uses:

```text
Total budget: 2400 weight/minute
Critical safety reserve: final 50 weight remains unused
Critical queue deadline: 1500 ms
Critical concurrency reserve: 2 slots
```

## 5.3 Fail-fast lifecycle fallback

A CRITICAL request never waits until the next minute. It produces a structured fail-fast result such as:

```text
CRITICAL_RATE_LIMIT_BACKOFF
CRITICAL_RATE_BUDGET_EXHAUSTED
CRITICAL_CONCURRENCY_BUSY
```

The caller then continues websocket/cache lifecycle handling and marks REST fallback degraded. It does not park the trade.

## 5.4 Scanner holds versus trade holds

The UI now labels limiter freezes as scanner holds and explicitly shows:

```text
TRADES LIVE · WS INDEPENDENT
CRITICAL REST READY
```

or:

```text
CRITICAL REST FAIL-FAST / WS FALLBACK
```

The limiter snapshot exports:

```text
tradeLifecyclePolicy = WEBSOCKET_INDEPENDENT_CRITICAL_FAIL_FAST
tradesMayFreeze = false
```

This describes the app architecture: trade lifecycle does not depend on a queued scanner request.

---

# 6. Modified and created areas

## Major modified files

```text
package.json
package-lock.json
scripts/check-long-export-purity.mjs
src/app/LongLabApp.jsx
src/combos/longComboRegistry.js
src/domain/longTradeMath.js
src/export/longTradeExport.js
src/export/longTradeExportSchema.js
src/fees/profitLockTelemetry.js
src/filters/FiltersTab.jsx
src/filters/evaluateLongWinningSetupMatches.js
src/filters/longCompareMode.js
src/filters/longFilterRegistry.js
src/lifecycle/longTradeLifecycle.js
src/marketRegime/normalizeLongMarketContext.js
src/migrations/migrateLongTradeRecord.js
src/rateLimiter/index.js
src/research/buildLongEntryResearchSnapshot.js
src/research/longResearchSchemaVersions.js
src/shadowLong/binancePriceStream.js
```

## Major created files

```text
src/export/longBatchExport.js
src/export/longBatchExport.worker.js
src/export/longBatchExporter.js
src/export/longBatchExport.test.js

src/lifecycle/closeReasons.js
src/lifecycle/closeReasons.test.js
src/lifecycle/openPositionLifecycle.js
src/lifecycle/openPositionLifecycle.test.js
src/lifecycle/profitLockProtection.js
src/lifecycle/profitLockProtection.test.js
src/lifecycle/profitLockStrategy.js
src/lifecycle/tradeFinalization.js
src/lifecycle/tradeFinalization.test.js

src/marketRegime/normalizeLongMarketContext.test.js

src/research/entrySnapshotProvenance.js
src/research/entrySnapshotProvenance.test.js
src/research/longEvidenceSemantics.js
src/research/longEvidenceSemantics.test.js
```

---

# 7. Validation results

Completed successfully:

```text
Source syntax check: PASS, 249 files
Production Vite build: PASS
Unit test shard 1: PASS, 43 files / 530 tests
Unit test shard 2: PASS, 43 files / 889 tests
Combined regression suite: PASS, 86 files / 1,419 tests
Long runtime purity: PASS
Long filter purity: PASS
Long export purity: PASS, 306 columns
Git diff whitespace/error check: PASS
```

The production build emits the batch-export worker as an independent asset chunk.

The only build advisory is Vite's existing large-main-chunk warning. It is non-fatal and unrelated to the export worker, which is split independently.

---

# 8. Remaining boundary for production trading

This codebase is a frontend research/simulation application. It does not contain a secure backend or authenticated exchange-order service.

Therefore, true exchange-native protection still requires a backend implementation of:

```text
ProfitLockProtectionAdapter.submitProtection()
ProfitLockProtectionAdapter.replaceProtection()
ProfitLockProtectionAdapter.cancelProtection()
ProfitLockProtectionAdapter.getProtection()
ProfitLockProtectionAdapter.emergencyClose()
```

That backend must own credentials, position reconciliation, order acknowledgement, reduce-only semantics, and exchange-order event processing.

This delivery deliberately does not embed Binance secrets in the browser or claim that a simulated local stop is a live resting exchange order.

---

# 9. Final state

The repaired application now:

- manages open trades independently of scanner REST traffic;
- closes breached locks even after they have fallen into loss;
- stops manufacturing ambiguous run-end outcomes;
- preserves missing telemetry honestly;
- exports a V6 analysis contract;
- offers a worker-based selectable 20-run ALL Export;
- prevents scanner rate-limit holds from freezing trade lifecycle;
- keeps all new scoring, context, combo, ATR, and anti-combo decisions research-only.
