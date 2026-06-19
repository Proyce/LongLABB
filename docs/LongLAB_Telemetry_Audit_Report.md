# LongLAB Telemetry Audit Report

## Scope

Audited the latest `LongLAB-main-june17-analysis-zip-safe-fixed` source tree and the uploaded 100-trade current-view export.

- 316 top-level exported telemetry fields
- 200 production source files reviewed by static field-usage scan
- 100 trades across runs 99 and 100 in one batch
- Current JSON size: approximately 8.51 MiB

## Executive finding

The app is not primarily bloated by the new small scalar diagnostics. It is bloated by retaining a full nested research snapshot and then exporting the same information again as flattened top-level fields.

The four heaviest duplicated fields account for approximately 85.25% of the current JSON payload:

| Field | Approximate size for 100 trades | Recommendation |
|---|---:|---|
| `entryResearchSnapshot` | 4.90 MiB | Remove from default CSV/JSONL. Put in separate forensic snapshot JSONL only. |
| `longWinningSetupMatchDetails` | 1.48 MiB | Keep matched IDs/counts in master. Put clause-level details in separate file. |
| `longComboDetails` | 0.83 MiB | Keep matched IDs/counts in master. Put all rule evaluations in separate file. |
| `entrySnapshotFieldStatus` | 0.21 MiB | Export only missing/invalid fields, or move the full map to forensic output. |

Removing only these four fields reduces the 100-trade JSON from about 8.51 MiB to about 1.26 MiB, an 85.2% reduction.

The Analysis ZIP worker already strips these fields before `postMessage`, which prevents the browser-refresh problem. However, the ordinary current-view JSON and CSV schemas still include them, so direct exports and stored trade objects remain heavy.

## High-confidence duplicate aliases

### PnL aliases

- `rawMarginPnlPct` duplicates `grossLeveragedPnlPct` in current LONG records.
- `rawNormPnlPct` duplicates `grossNormPnlPct`.
- `priceMovePct` is calculated as the same value as `grossNormPnlPct` for LONG trades.
- `feeAdjustedMarginPnlPct` duplicates `feeAdjustedLeveragedPnlPct`.

Recommended canonical names:

- `grossNormPnlPct`
- `grossLeveragedPnlPct`
- `feeAdjustedNormPnlPct`
- `feeAdjustedLeveragedPnlPct`

Keep legacy aliases only in migration/import compatibility, not in new V8 default exports.

### Adaptive AES aliases

The flattener intentionally writes the same values twice:

- `absoluteEntryBaseScore` = `longAdaptiveAesBaseScore`
- `absoluteEntryAdaptiveScore` = `longAdaptiveAesScore`
- `absoluteEntryRequiredScore` = `longAdaptiveAesRequiredScore`
- `absoluteEntryAesGap` = `longAdaptiveAesGap`
- `absoluteEntryWouldPassAdaptive` = `longAdaptiveAesWouldPass`

Keep the `absoluteEntry*` family as canonical and deprecate `longAdaptiveAes*` after consumers are migrated.

### Setup/combo aliases

- `activeWinningSetupIds` = `longWinningSetupMatchedIds`
- `rawPositiveComboCount` = `longCombosPositiveCount`
- `rawAntiComboCount` = `longCombosAntiCount`
- `longAesV2MinusV1` = `longAesV2DeltaVsV1`

### Version aliases and drift

- `tradeSchemaVersion` = `exportSchemaVersion`
- `entryResearchSchemaVersion` = `entrySnapshotSchemaVersion`
- `longWinningSetupsVersion`, `longWinningSetupCatalogVersion`, and `winningSetupRegistryVersion` overlap.
- `longComboRegistryVersion` and `comboRegistrySchemaVersion` represent the same registry in different formats.

There is active version drift in the sample:

- `winningSetupRegistryVersion = LONG_WINNING_SETUPS_V2_2026_06`
- `longWinningSetupCatalogVersion = LONG_WINNING_SETUPS_V1`
- `longWinningSetupsVersion = LONG_WINNING_SETUPS_V1`

Use one canonical winning-setup registry version.

### Profit-lock legacy aliases

The old and new lock models are exported together:

- `profitLockActive` and `profitLockStrategyActive`
- `profitLockLevelPrice` and `profitLockProtectedFloorPrice`
- `profitLockLevelMarginPct` and `profitLockProtectedFloorMarginPct`
- `profitLockStage` and `profitLockProtectedStage`
- `profitLockFloorEnforcementSucceeded` and `profitLockFloorPreserved`

Additionally:

- `floorExitEnforced` is ambiguous and should be removed from new records.
- `profitLockDetectionLatencyMs` is superseded by `profitLockCrossToLocalDetectionLatencyMs` and is null in current records.

Keep legacy fields only in the migration layer.

## Unused or unimplemented telemetry

### `longAesConfidenceDistinctValueCountAtRun`

The scorer writes it as `null`; no implementation later populates it. It is exported but unused.

Recommendation: remove until the run-level calibration calculation exists.

### `entryPolicyShadowDecision`

There is a naming mismatch:

- `evaluateEntryPolicyLogOnly()` emits `entryPolicyDiagnosticDecision`.
- `flattenEntryPolicy()` expects `entryPolicyShadowDecision`.
- The export contains `entryPolicyShadowDecision`, which is therefore null.

The useful diagnostic decision/action, hard-block, reduced-capacity, sniper-only, and quality-tier fields are not reaching the canonical top-level export.

Recommendation: select one canonical name, preferably `entryPolicyDiagnosticDecision`, and update the flattener/export.

### `marketContextFreshnessMs`

It is only a passthrough from optional input fields and is null in the current batch. The context pipeline has timestamps available elsewhere but does not derive this value.

Recommendation: calculate it from the market snapshot timestamp or omit it until implemented.

### `cvdStateCurrent`

It is created from `cvdLabel` at entry and is never updated during the trade. In current records:

- `cvdLabel`
- `cvdStateAtEntry`
- `cvdStateCurrent`

are identical.

Recommendation: keep `cvdStateAtEntry`; only export `cvdStateCurrent` once a live CVD updater exists.

## Batch-level metadata repeated per trade

The following values are configuration or registry metadata, not trade-specific facts. They should be written once in the batch manifest:

- `longAesV2ComponentWeights`
- score/filter/label/combo/anti-combo/setup registry versions
- market-context version
- exit-system version
- fee-model version
- PnL-model version
- price-stream schema version
- lifecycle engine identifier
- V1/V2 promotion statuses
- primary score-version roles
- `logOnly`, `canAffectExecution`, and `executionApplied`

For standalone row portability, retain only `tradeSchemaVersion` per trade. The batch manifest can carry the rest.

The current 100-trade sample contains 101 fields with one constant value across both runs. Not all should be removed, but this confirms that a manifest would materially reduce repetition.

## Sparse diagnostics that should remain

The following fields are mostly null/false in healthy trades but are valuable when a failure occurs:

- finalization failure and research exclusion fields
- price-integrity failure fields
- REST fallback reason
- source-run completion fields
- profit-lock breach and emergency fields

Do not remove them merely because the current sample is healthy. Instead, use sparse serialization:

- omit null fields from compact JSONL, or
- move failure-only details to `forensics/events.jsonl`.

## Misleading or confusing parallel quality fields

### Two different completeness percentages

- `entrySnapshotCompletenessPct = 100`
- `longFilterCoveragePct = 63`

They use different denominators, but the names make them look contradictory.

Recommended names:

- `requiredEntrySnapshotCompletenessPct`
- `optionalResearchFeatureCoveragePct`

### Data-quality alias

`longDataQualityTierV2` currently mirrors `longFilterDataQuality` exactly. Keep one unless the V2 tier is redesigned to mean something different.

### Confidence label noise

The batch repeatedly exports:

- `longAesConfidenceLabel = VERY_HIGH_CONFIDENCE`
- `longAesConfidenceIsInformative = false`
- `longAesConfidenceCalibrationStatus = UNCALIBRATED`

The label is misleading while the score itself says it is not informative. Remove the display/export label or rename it to describe input completeness rather than predictive confidence.

## Recommended V8 export layout

### `master_trades.csv` and `master_trades.jsonl`

Contain only compact, analysis-ready scalar fields and short matched-ID arrays.

### `manifest.json`

Contain registry versions, model weights, execution mode, engine versions, schema contracts, and batch metadata.

### `forensics/entry_snapshots.jsonl`

Optional full snapshots, keyed by `tradeId` or a content hash. Do not duplicate the snapshot inside every master row.

### `forensics/rule_details.jsonl`

Only clause-level combo/setup evaluations when explicitly requested or when a trade is exceptional.

### `forensics/exit_events.jsonl`

Only abnormal exits, price-integrity failures, fallback events, lock misses, and bounded tick audits.

## Recommended implementation order

1. Remove the four heavy nested objects from default direct JSON/CSV exports.
2. Add a separate forensic export option.
3. Consolidate exact aliases while retaining migration support.
4. Fix the entry-policy naming mismatch.
5. Remove hard-coded-null fields.
6. Move constant registry/config metadata into the batch manifest.
7. Rename the two completeness metrics.
8. Implement sparse diagnostic serialization.
9. Bump the export contract to V8 and provide a V7 import migration.

## Audit artifacts

A full 316-field inventory accompanies this report. It includes sample population rate, unique-value count, payload size, static production read/write counts, source files, and a preliminary recommendation per field.
