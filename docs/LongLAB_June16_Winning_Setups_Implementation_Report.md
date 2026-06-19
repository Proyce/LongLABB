> **Post-remediation note:** The later sequential execution, data-integrity, V6 export, 20-run batch export, and rate-limiter work is documented in `LongLAB_Sequential_Remediation_Implementation_Report.md`. This document remains the historical Winning Setups V5 report.

# LongLAB June 16 Winning Setups Implementation Report

## Delivery summary

This implementation applies the June 16 Winning Setups specification to `LongLAB-main-finished` while preserving the application as a Long-only, research-only cockpit.

The patch adds:

- A first-class **Winning Setups** tab and persistent quick-view strip.
- Twenty-seven curated, versioned setup views.
- New canonical Long micro-up, RSI expansion, MACD expansion, Gate V2 band and loser-thesis fields.
- Seven new formal positive combos while retaining the existing positive and anti-combo registries.
- Registry-native filters, presets, URL persistence and saved-view support.
- Canonical adaptive AES wiring with explicit `PASS`, `FAIL` and `INCOMPLETE` semantics.
- AES V2 and Best DNA V2 shadow scorers without changing historical V1 fields.
- Honest Profit Lock telemetry with Profit Lock and Trail separated everywhere.
- V5 entry-research, filter-snapshot and trade-export contracts.
- V4-to-V5 migration with null-safe unknown values.
- Focused tests for signals, setups, combos, migrations, exports, safety and lock telemetry.

## Safety invariants

All additions remain research-only.

Every new setup, combo, shadow score and recommendation exposes or preserves:

```text
logOnly: true
canAffectExecution: false
executionApplied: false
```

No new feature changes:

- candidate selection,
- trade creation,
- entry timing,
- leverage,
- position size,
- exchange requests,
- order placement,
- exit-profile selection, or
- trade closing.

The existing Long runtime, filter and export purity checks pass after the changes.

---

# 1. Winning Setups cockpit

## 1.1 New default tab

`src/filters/FiltersTab.jsx` now opens on:

```text
★ Winning Setups
```

It is placed before the automatic `Highlights` tab.

The distinction is preserved:

- **Winning Setups** contains manually reviewed, versioned hypotheses.
- **Highlights** continues to mine the currently loaded corpus automatically.

## 1.2 Persistent quick-view strip

A `WINNING QUICK VIEW` strip is rendered directly under the Long bucket controls.

One-click views include:

- Gate 95+
- Gate 90+
- Gate Premium
- Gate >= Strong
- Universal Core
- Core + Micro Up
- Premium Triple
- Gate 90 + RSI + MACD
- Bull VWAP Reclaim
- Gainer Reacceleration
- Loser Scalp Reversal
- No Anti

Each quick view uses the canonical registry through `applyLongFilterState()`. No independent UI-only `.filter()` engine was introduced.

The active curated view uses the stable group ID:

```text
winning-view
```

Replacing a quick view replaces only the curated group. User-created advanced groups are preserved. `ADD` appends a setup without replacing the active curated view.

## 1.3 Setup actions

Every setup supports:

- `VIEW TRADES`
- `ADD`
- `COMPARE`
- `EXPLAIN`

The explanation flow uses the existing match-explanation infrastructure.

## 1.4 Current metrics versus reference evidence

Each setup card keeps two evidence layers separate:

1. **Current corpus metrics**, calculated from loaded trades with the registry engine.
2. **Reference evidence**, copied from the reviewed June 16 analysis.

Historical evidence is never presented as current performance.

Current-corpus analytics include:

- trade count,
- metric-valid count,
- total and average fee-adjusted normalized PnL,
- median,
- win rate,
- SL rate,
- profit factor,
- positive and negative sessions,
- run consistency,
- Top Gainer split,
- Top Loser split,
- source-field coverage,
- AES V1/V2 summaries,
- DNA V1/V2 summaries, and
- confidence-field informativeness.

## 1.5 Exit-health cards

The cockpit now displays separate health cards for:

- PROFIT_LOCK
- TRAIL
- TIMEOUT
- AUTO_END
- SL

Profit Lock and Trail are no longer blurred into a single primary analytics bucket.

---

# 2. Curated setup catalog

Created:

```text
src/filters/longWinningSetups.js
src/filters/components/WinningSetupsPanel.jsx
src/filters/evaluateLongWinningSetupMatches.js
```

Catalog version:

```text
LONG_WINNING_SETUPS_V1
```

The catalog contains 27 setup definitions.

## 2.1 Priority gates

1. `GATE_ELITE_95`
2. `GATE_PREMIUM_90`
3. `GATE_TIER_PREMIUM`
4. `GATE_TIER_GE_STRONG`

## 2.2 Universal winners

5. `UNIVERSAL_CORE_FORMAL_V1`
6. `UNIVERSAL_CORE_MICRO_UP`
7. `GATE_STRONG_MICRO_UP_CLEAN`
8. `PREMIUM_PF10_RUNNER`
9. `GATE_90_RSI_MACD`
10. `BULL_CONFIRMED_VWAP_RECLAIM`
11. `LAST3_UP_RSI_EXPANSION`
12. `NO_ANTI_COMBOS`

## 2.3 Top Gainer winners

13. `GAINER_GREEN_REACCELERATION`
14. `GAINER_GATE90_LAST3_RSI`
15. `GAINER_GATE90_MACD_CVD_BULL`

## 2.4 Top Loser winners

16. `LOSER_SCALP_REVERSAL_CANDIDATE`
17. `LOSER_GATE90_MACD_CVD_NOT_BEAR`
18. `LOSER_IMMEDIATE_GREEN_RSI`

## 2.5 Toxic controls

19. `RED_CVD_BEAR_ANTI`
20. `FALLING_KNIFE_ANTI`
21. `IMMEDIATE_RED_TOXIC`
22. `GATE_RESEARCH_REJECT`
23. `GAINER_OVEREXTENDED_NO_PULLBACK`

## 2.6 Exit diagnostics

24. `PROFIT_LOCK_ONLY`
25. `PROFIT_LOCK_BELOW_FLOOR`
26. `TRAIL_ONLY`
27. `TIMEOUT_ONLY`

Outcome-only exit views are kept out of entry-time setup-match telemetry, preventing outcome leakage into entry analysis.

---

# 3. Universal Core naming correction

The implementation explicitly separates two concepts that were previously easy to confuse.

## Formal combo

```text
LONG_UNIVERSAL_CORE_V1
```

This is displayed as:

```text
Universal Core (Formal V1)
```

## Gate-qualified preset

The backward-compatible preset is displayed as:

```text
Gate + Universal Core
```

The formal combo is available as its own one-click setup and preset.

---

# 4. Canonical Long entry signals

Created:

```text
src/research/longWinningSignals.js
```

The canonical pipeline now derives and exports:

- `longMicroUpConfirmation`
- `longMicroUpConfirmationReasons`
- `longMicroUpConfirmationSourceCount`
- `rsiLongMomentumExpansion`
- `rsiLongMomentumExpansionSource`
- `macdBullishExpansion`
- `longGateResearchBandV2`
- `topLoserLongThesisLane`

## 4.1 Narrow micro-up definition

`longMicroUpConfirmation` requires actual upward microstructure:

```text
last3TicksDirection = UP
OR immediateGreenImpulse = true
OR longMicroMomentumLabel in:
  MICRO_GREEN_MULTI_CONFIRM
  MICRO_GREEN_IMPULSE
  MICRO_TICKS_UP
```

RSI-only rollover does not qualify as narrow micro-up confirmation.

## 4.2 RSI momentum expansion

The app normalizes the Long RSI momentum-expansion evidence into a dedicated boolean and source field rather than burying it inside general labels.

## 4.3 MACD bullish expansion

Positive and expanding MACD histogram telemetry is normalized into `macdBullishExpansion`.

## 4.4 Gate research band V2

Historical `longGateTier` behavior is preserved.

A separate research band was added:

```text
GATE_ELITE_95
GATE_PREMIUM_90
GATE_PREMIUM_85
GATE_STRONG_75
GATE_WATCH_60
GATE_RESEARCH_REJECT
INSUFFICIENT_DATA
```

Null scores produce `INSUFFICIENT_DATA`, not a fabricated rejection.

---

# 5. Filter registry V2

Modified:

```text
src/filters/longFilterRegistry.js
```

The registry now contains 102 unique filters.

New registry filters:

1. `ACTIVE_WINNING_SETUP_IDS`
2. `LONG_GATE_RESEARCH_BAND_V2`
3. `LONG_GATE_TIER`
4. `LONG_MICRO_UP_CONFIRMATION`
5. `LONG_MICRO_UP_CONFIRMATION_REASONS`
6. `LONG_PARENT_BUCKET`
7. `LONG_WINNING_SETUP_CATALOG_VERSION`
8. `MACD_BULLISH_EXPANSION`
9. `PROFIT_LOCK_EXIT_BELOW_FLOOR`
10. `RSI_LONG_MOMENTUM_EXPANSION`
11. `TOP_LOSER_THESIS_LANE`

Long Gate score presets now include:

```text
60, 75, 85, 90, 95
```

Historical saved filters using older values remain readable.

Registry integrity tests verify:

- unique filter IDs,
- unique enum values,
- research-only metadata, and
- no execution-safe promotion.

---

# 6. Formal combo registry V2

Modified:

```text
src/combos/longComboRegistry.js
```

Registry version:

```text
long-combo-v2
```

The registry now has:

- 13 positive combos
- 2 anti-combos

Seven positive combos were added:

1. `LONG_UNIVERSAL_CORE_MICRO_UP_V1`
2. `LONG_GATE_RSI_MACD_EXPANSION_V1`
3. `LONG_PREMIUM_PF10_RUNNER_V1`
4. `LONG_GATE_STRONG_MICRO_UP_CLEAN_V1`
5. `LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1`
6. `LONG_GAINER_GREEN_REACCELERATION_V1`
7. `LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1`

Existing anti-combos remain prominent:

- `LONG_RED_CVD_BEAR_ANTI_V1`
- `LONG_FALLING_KNIFE_ANTI_V1`

Reusable pure condition helpers prevent circular dependence on already-produced combo arrays.

All combo outputs include research-only safety metadata.

---

# 7. New registry-backed presets

Nine presets were added:

1. `UNIVERSAL_CORE_FORMAL`
2. `UNIVERSAL_CORE_MICRO_UP`
3. `GATE_STRONG_MICRO_UP_CLEAN`
4. `GATE_90_RSI_MACD`
5. `PREMIUM_PF10_RUNNER`
6. `BULL_CONFIRMED_VWAP_RECLAIM`
7. `GAINER_GREEN_REACCELERATION`
8. `LOSER_SCALP_REVERSAL`
9. `RED_CVD_BEAR_FORENSICS`

The existing universal preset remains available but is renamed in the UI to `Gate + Universal Core` for semantic accuracy.

---

# 8. Adaptive AES repair

The previously inert adaptive entry path is now wired into:

```text
src/research/buildLongEntryResearchSnapshot.js
```

The canonical calculation uses Long-native AES inputs and populates:

- `absoluteEntryBaseScore`
- `absoluteEntryAdaptiveScore`
- `absoluteEntryRequiredScore`
- `absoluteEntryAesGap`
- `absoluteEntryWouldPassAdaptive`
- `absoluteEntryAdaptiveStatus`

Long-native aliases are also populated:

- `longAdaptiveAesBaseScore`
- `longAdaptiveAesScore`
- `longAdaptiveAesRequiredScore`
- `longAdaptiveAesGap`
- `longAdaptiveAesWouldPass`

The policy evaluator now reads `absoluteEntryRequiredScore` before legacy fallbacks.

Missing inputs produce:

```text
status = INCOMPLETE
score/pass values = null
```

They do not default to `false`.

---

# 9. Confidence correction

The UI and research pipeline no longer treat a constant `confidence = 100` field as meaningful evidence.

Added fields:

- `longAesConfidenceIsInformative`
- `longAesConfidenceDistinctValueCountAtRun`
- `longAesConfidenceCalibrationStatus`

Until calibrated, status is:

```text
UNCALIBRATED
```

A cohort-level informativeness audit identifies constant or near-constant fields using dominant-value percentage and distinct-value count.

Confidence is not used for:

- curated setup matching,
- trade sorting,
- sizing,
- execution policy, or
- bright confidence presentation.

---

# 10. AES V2 shadow scorer

Created:

```text
src/scoring/longAbsoluteEntryScore/longAbsoluteEntryScore.v2Shadow.js
```

V1 remains unchanged for historical comparisons.

V2 is explicitly shadow-only and gives Flow Momentum the largest component weight.

Exported diagnostics:

- `longAesScoreV2Shadow`
- `longAesTierV2Shadow`
- `longAesV2ComponentWeights`
- `longAesV2PositiveContributions`
- `longAesV2NegativeContributions`
- `longAesV2RawUtility`
- `longAesV2DeltaVsV1`
- `longAesV2Version`

---

# 11. Best DNA V2 shadow scorer

Created:

```text
src/audits/bestDnaLongAuditV2.js
```

The historical V1 score is preserved.

V2 removes the large unconditional positive reward for `ATR_GE_1`.

High ATR now behaves as follows:

- unconfirmed high ATR receives no positive directional reward and can receive a penalty,
- confirmed high ATR receives only a small amplifier bonus behind strict Long confirmation.

V2 emphasizes:

- Last3 UP,
- immediate green impulse,
- MACD bullish expansion,
- RSI momentum expansion,
- CVD BULL/NEUT,
- Gate Premium, and
- Gate score >= 90.

Exported fields:

- `bestDnaLongScoreV2ShadowRaw`
- `bestDnaLongScoreV2Shadow`
- `bestDnaLongTierV2Shadow`
- `bestDnaLongV2PositiveGenes`
- `bestDnaLongV2PenaltyGenes`
- `bestDnaLongV2Contributions`
- `bestDnaLongV2Penalties`
- `bestDnaLongV2StrictDirectionalConfirmation`
- `bestDnaLongV2Version`

---

# 12. Profit Lock telemetry repair

Created:

```text
src/fees/profitLockTelemetry.js
```

Profit Lock and Trail are separate throughout filters, analytics and exports.

## 12.1 Floor-cross detection

The runtime now observes previous and current prices and records whether a Long lock floor was crossed between observations.

Added diagnostics:

- `profitLockCrossDetected`
- `profitLockCrossDetectedAt`
- `profitLockCrossFromPrice`
- `profitLockCrossToPrice`
- `profitLockDetectionLatencyMs`
- `profitLockTriggerPrice`
- `profitLockObservedFillPrice`
- `profitLockSlippagePricePct`
- `profitLockSlippageMarginPct`
- `profitLockFloorEnforcementAttempted`
- `profitLockFloorEnforcementSucceeded`
- `profitLockFloorMissed`
- `profitLockExitBelowFloor`
- `floorExitEnforced`

The observed fill is retained. It is never rewritten to the intended floor price.

`floorExitEnforced` indicates that the floor-close path was invoked. It is separate from whether the intended floor was successfully preserved.

## 12.2 Log-only exit recommendations

Added research recommendations:

- `LOCK_HOLD`
- `LOCK_TIGHTEN`
- `SWITCH_TO_TRAIL`
- `FAST_HARVEST`
- `EMERGENCY_EXIT`

These recommendations are telemetry only and do not alter exits.

---

# 13. Filter state, URLs and saved views

Filter state now persists:

- `activeWinningSetupId`
- `winningSetupsVersion`
- curated group ID,
- setup ID,
- group source,
- outcome-only setup ID where relevant.

Old URLs and saved states continue to load with default values.

Quick-view replacement and `ADD` behavior are separately tested.

---

# 14. V5 research and export contracts

Updated versions:

```text
LONG_ENTRY_RESEARCH_V5
LONG_FILTER_SNAPSHOT_V5
LONG_TRADE_EXPORT_V5
```

The canonical trade export now contains 200 unique columns.

Ninety-one export fields were added:

1. `absoluteEntryAdaptiveScore`
2. `absoluteEntryAdaptiveStatus`
3. `absoluteEntryAesGap`
4. `absoluteEntryBaseScore`
5. `absoluteEntryMarketAdjustment`
6. `absoluteEntryMarketAdjustmentContributions`
7. `absoluteEntryMarketAdjustmentPenalties`
8. `absoluteEntryMarketAdjustmentVersion`
9. `absoluteEntryRequiredScore`
10. `absoluteEntryWouldPassAdaptive`
11. `activeWinningSetupIds`
12. `bestDnaLongScoreV2Shadow`
13. `bestDnaLongScoreV2ShadowRaw`
14. `bestDnaLongTierV2Shadow`
15. `bestDnaLongV2Contributions`
16. `bestDnaLongV2Penalties`
17. `bestDnaLongV2PenaltyGenes`
18. `bestDnaLongV2PositiveGenes`
19. `bestDnaLongV2StrictDirectionalConfirmation`
20. `bestDnaLongV2Version`
21. `canAffectExecution`
22. `entryPolicyAesGap`
23. `entryPolicyEvaluationStatus`
24. `entryPolicyExecutionApplied`
25. `entryPolicyMode`
26. `entryPolicyPrimaryReason`
27. `entryPolicyRequiredAes`
28. `entryPolicyShadowDecision`
29. `executionApplied`
30. `floorExitEnforced`
31. `hasLongMicroMomentum`
32. `immediateGreenImpulse`
33. `immediateRedImpulse`
34. `last3TicksDirection`
35. `last5TicksDirection`
36. `logOnly`
37. `longAdaptiveAesBaseScore`
38. `longAdaptiveAesGap`
39. `longAdaptiveAesRequiredScore`
40. `longAdaptiveAesScore`
41. `longAdaptiveAesWouldPass`
42. `longAesConfidenceCalibrationStatus`
43. `longAesConfidenceDistinctValueCountAtRun`
44. `longAesConfidenceIsInformative`
45. `longAesScoreV2Shadow`
46. `longAesTierV2Shadow`
47. `longAesV2ComponentWeights`
48. `longAesV2DeltaVsV1`
49. `longAesV2NegativeContributions`
50. `longAesV2PositiveContributions`
51. `longAesV2RawUtility`
52. `longAesV2Version`
53. `longComboDetails`
54. `longComboRegistryVersion`
55. `longCombosAntiCount`
56. `longCombosAntiMatched`
57. `longCombosPositiveCount`
58. `longCombosPositiveMatched`
59. `longGateResearchBandV2`
60. `longMicroMomentumLabel`
61. `longMicroUpConfirmation`
62. `longMicroUpConfirmationReasons`
63. `longMicroUpConfirmationSourceCount`
64. `longWinningSetupCatalogVersion`
65. `longWinningSetupMatchDetails`
66. `longWinningSetupMatchedIds`
67. `longWinningSetupsVersion`
68. `macdBullishExpansion`
69. `profitLockActivatedAt`
70. `profitLockActive`
71. `profitLockCrossDetected`
72. `profitLockCrossDetectedAt`
73. `profitLockCrossFromPrice`
74. `profitLockCrossToPrice`
75. `profitLockDetectionLatencyMs`
76. `profitLockExitBelowFloor`
77. `profitLockFloorEnforcementAttempted`
78. `profitLockFloorEnforcementSucceeded`
79. `profitLockFloorMissed`
80. `profitLockLevelMarginPct`
81. `profitLockLevelPrice`
82. `profitLockObservedFillPrice`
83. `profitLockRecommendationReasons`
84. `profitLockRecommendedActionLogOnly`
85. `profitLockSlippageMarginPct`
86. `profitLockSlippagePricePct`
87. `profitLockStage`
88. `profitLockTriggerPrice`
89. `rsiLongMomentumExpansion`
90. `rsiLongMomentumExpansionSource`
91. `topLoserLongThesisLane`

The export checker verifies:

- 200 keys and 200 headers,
- no duplicates,
- no deprecated keys,
- no `[object Object]` serialization,
- all getters callable on incomplete trades,
- V5 version emitted, and
- all 21 critical V5 columns populated on an enriched fixture.

---

# 15. V4-to-V5 migration

Modified:

```text
src/migrations/migrateLongTradeRecord.js
```

Migration behavior:

- preserves historical V4 scores and tiers,
- adds V5 setup, signal, adaptive, confidence, combo and lock fields,
- uses `null` for unknown V5 booleans,
- uses empty arrays only for genuine collection fields,
- does not turn missing telemetry into a fake failed signal,
- preserves idempotence.

---

# 16. Test coverage added

New or expanded tests cover:

- narrow micro-up derivation,
- RSI expansion parsing,
- MACD bullish expansion,
- null-safe Gate V2 bands,
- every new formal combo,
- failure cases for wrong bucket, CVD bear, immediate red and anti contamination,
- all curated setup definitions,
- formal Universal Core versus Gate-qualified Universal Core,
- outcome-only setup isolation,
- active setup matching,
- registry ID uniqueness,
- registry enum-value uniqueness,
- preset behavior,
- active-view replacement versus `ADD`,
- URL and saved-state persistence,
- adaptive AES pipeline wiring,
- explicit incomplete adaptive status,
- AES V2 Flow Momentum weighting,
- Best DNA V2 ATR conditioning,
- confidence-field informativeness,
- Profit Lock/Trail separation,
- floor-cross detection,
- observed-fill and floor-miss calculations,
- V4-to-V5 migration,
- V5 export uniqueness and critical-field coverage,
- Long research-only safety invariants.

---

# 17. Validation results

## Source syntax

```text
231 source files checked
PASS
```

## Production build

```text
782 modules transformed
PASS
```

The build retains the existing large-chunk warning for the chart and main bundles. It is a warning, not a compilation failure.

## Full unit suite

```text
78 test files passed
1,385 tests passed
0 failed
```

## Long research cockpit

```text
26 test files passed
298 tests passed
0 failed
```

## Runtime purity

```text
PASS
No short-legacy violations found
```

## Filter purity

```text
PASS
Static and behavioral checks passed
```

## Export purity

```text
PASS
200 unique columns
LONG_TRADE_EXPORT_V5
21/21 critical enriched-fixture fields populated
```

## Aggregate CI-wrapper note

The repository's original `npm run test:ci` chains two Vitest shards and all static gates in one long npm process. In this tool environment, that aggregate wrapper repeatedly exceeded the outer command timeout while a shard was still printing successful tests. No failing assertion was recorded.

The same components were therefore executed and verified independently:

- shard 1: 39 files, 498 tests passed,
- shard 2: 39 files, 887 tests passed,
- combined unit run: 78 files, 1,385 tests passed,
- build: passed,
- runtime purity: passed,
- filter purity: passed,
- export purity: passed,
- research cockpit: 298 tests passed.

The original package scripts were preserved rather than shipping an environment-specific CI workaround.

---

# 18. Files created

```text
src/audits/bestDnaLongAuditV2.js
src/audits/bestDnaLongAuditV2.test.js
src/combos/longComboRegistry.test.js
src/export/longTradeExportSchema.v5.test.js
src/fees/profitLockTelemetry.js
src/fees/profitLockTelemetry.test.js
src/filters/components/WinningSetupsPanel.jsx
src/filters/evaluateLongWinningSetupMatches.js
src/filters/evaluateLongWinningSetupMatches.test.js
src/filters/longFilterRegistry.v2.test.js
src/filters/longFilterSnapshot.v5.test.js
src/filters/longWinningSetups.js
src/filters/longWinningSetups.test.js
src/migrations/migrateLongTradeRecord.v5.test.js
src/research/longWinningSignals.js
src/research/longWinningSignals.test.js
src/scoring/longAbsoluteEntryScore/longAbsoluteEntryScore.v2Shadow.js
src/scoring/longAbsoluteEntryScore/longAbsoluteEntryScore.v2Shadow.test.js
docs/LongLAB_June16_Winning_Setups_Bot_Spec.md
docs/LongLAB_June16_Winning_Setups_Implementation_Report.md
```

# 19. Files modified

```text
scripts/check-long-export-purity.mjs
src/app/LongLabApp.jsx
src/combos/longComboRegistry.js
src/entryPolicy/adaptiveAes.js
src/entryPolicy/entryPolicy.flatten.js
src/entryPolicy/evaluateEntryPolicyLogOnly.js
src/export/longTradeExportSchema.js
src/filters/FiltersTab.jsx
src/filters/longFilterAnalytics.js
src/filters/longFilterAnalytics.test.js
src/filters/longFilterConstants.js
src/filters/longFilterPresets.js
src/filters/longFilterRegistry.js
src/filters/longFilterSnapshot.js
src/filters/longFilterState.js
src/longGate/longGateAudit.js
src/migrations/migrateLongTradeRecord.js
src/research/buildLongEntryResearchSnapshot.js
src/research/longResearchSchemaVersions.js
src/research/normalizeLongEntryFacts.js
src/scoring/longAbsoluteEntryScore/longAbsoluteEntryScore.scorer.js
```

---

# 20. Deliberately not armed

The following remain shadow/research candidates and do not control execution:

- Gate >= STRONG
- Gate >= 90
- Gate >= 95
- Core + Micro Up
- Premium + PF10 + Runner
- Gate 90 + RSI + MACD
- Bull-confirmed VWAP reclaim
- gainer reacceleration
- loser scalp reversal
- AES V2
- DNA V2
- Profit Lock recommendations

A fresh real autorun and additional independent cross-day/regime logs are still required before any production promotion.

---

# 21. Running the patched app

From the project root:

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run check:all-source-syntax
npm run build
npm run test:unit
npm run test:long-purity
npm run check:long-filter-purity
npm run check:long-export-purity
npm run test:long-research-cockpit
```
