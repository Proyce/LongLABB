# LongLAB V8 Telemetry Field Migration

## Default-export canonicalization

The V8 default master export prefers one canonical field per concept. Legacy aliases remain import-compatible but are omitted from new compact output.

| Legacy/duplicate field | V8 canonical field or location |
|---|---|
| `rawMarginPnlPct` | `grossLeveragedPnlPct` |
| `rawNormPnlPct` | `grossNormPnlPct` |
| `feeAdjustedMarginPnlPct` | `feeAdjustedLeveragedPnlPct` |
| `longAdaptiveAesBaseScore` | `absoluteEntryBaseScore` |
| `longAdaptiveAesScore` | `absoluteEntryAdaptiveScore` |
| `longAdaptiveAesRequiredScore` | `absoluteEntryRequiredScore` |
| `longAdaptiveAesGap` | `absoluteEntryAesGap` |
| `longAdaptiveAesWouldPass` | `absoluteEntryWouldPassAdaptive` |
| `activeWinningSetupIds` | `longWinningSetupMatchedIds` |
| `rawPositiveComboCount` | `longCombosPositiveCount` |
| `rawAntiComboCount` | `longCombosAntiCount` |
| `longAesV2MinusV1` | `longAesV2DeltaVsV1` |
| `profitLockActive` | `profitLockStrategyActive` |
| `profitLockLevelPrice` | `profitLockProtectedFloorPrice` |
| `profitLockLevelMarginPct` | `profitLockProtectedFloorMarginPct` |
| `profitLockStage` | `profitLockProtectedStage` |
| `profitLockDetectionLatencyMs` | `profitLockCrossToLocalDetectionLatencyMs` |
| `profitLockFloorEnforcementSucceeded` | `profitLockFloorPreserved` |
| `entryPolicyShadowDecision` | `entryPolicyDiagnosticDecision` |
| `entrySnapshotCompletenessPct` | `requiredEntrySnapshotCompletenessPct` |
| `longFilterCoveragePct` | `optionalResearchFeatureCoveragePct` |
| `exportSchemaVersion` | `tradeSchemaVersion` |
| `entryResearchSchemaVersion` | `entrySnapshotSchemaVersion` |

## Removed from compact runtime/default master

```text
entryResearchSnapshot
longComboDetails
longWinningSetupMatchDetails
entrySnapshotFieldStatus
```

Their analysis-ready scalars, counts, matched IDs, scores, labels, clause outcomes, and completeness indicators remain flattened in the compact contract.

## Manifest-level metadata

Static registry and model metadata is emitted once in the batch manifest rather than repeated on every trade row.

## Sparse failure evidence

Exceptional exit evidence is written to:

```text
forensics/exit_events.jsonl
```

This includes failure-only or ambiguity-only fields without making every healthy record carry a large forensic payload.

## Legacy import

`migrateLongTradeRecord()` continues to accept earlier schemas. It maps available legacy fields into V8 canonical fields but does not re-create removed nested duplicates.
