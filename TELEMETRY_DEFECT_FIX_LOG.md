# Telemetry Defect Audit & Fix — Work Log

**Build:** `LongLAB-main-june17-telemetry-v9-remediated` (base app `1.0.4`)
**Scope:** Six telemetry defects raised against the prior export, plus a sweep for other unpopulated telemetry. All changes are log-only — no blocking, gating, sizing, fee/PnL, cadence, or storage-key changes.

---

## Method

Each defect was checked against the actual source in this tree and verified empirically by running the real `buildLongEntryResearchSnapshot`, the relevant derivers, and the real CSV exporter — not by reading code alone. Two defects needed new fixes; four were already resolved in this build and were confirmed.

## Per-defect outcome

| # | Defect | Status in this build | Mechanism |
|---|--------|----------------------|-----------|
| 1 | All rows `FINAL_WITH_MISSING_DATA` / `INCOMPLETE` | **Diagnosed + diagnostic added** | Verdict logic is correct on complete input (`COMPLETE`/`FINAL`). INCOMPLETE fires only on a genuinely-null required field or critical component error. Added scalar drivers so the cause is visible per row. |
| 2 | `longMicroMomentumLabel` "missing" yet populated | **Does not reproduce** | `deriveLongMicroMomentumLabel` always returns a label (default `MICRO_NO_LONG_CONFIRMATION`); the candidate carries it before the data-quality assessment reads it. Verified: populated, never in the missing list. |
| 3 | `entryPolicyShadowDecision` blank | **Fixed (renamed)** | Populated under canonical `entryPolicyDiagnosticDecision` (e.g. `WOULD_ALLOW_FULL`). Old field retired. |
| 4 | `longAesConfidenceLabel` VERY_HIGH/uninformative | **Fixed** | Confidence rebuilt from score margin + evidence agreement with coverage as a precondition; `isInformative=true`, `calibrationStatus=CALIBRATED`. |
| 5 | `macdBullishExpansion` true-or-blank, never false | **Fixed** | Deriver now uses the histogram slope the feed supplies (and previous-histogram / bearish-state) so explicit `false` is reachable. |
| 6 | `floorExitEnforced=true` while `…Succeeded=false` | **Resolved (disambiguated)** | `floorExitEnforced` = enforcement *attempted* and is tagged `floorExitEnforcedDeprecated:true`; real outcome is `profitLockFloorEnforcementSucceeded` / `profitLockFloorMissed`. |

## Changes made (defects 1 and 5)

**Defect 5 — macd tri-state** (`src/research/longWinningSignals.js`, `src/research/normalizeLongEntryFacts.js`):
- `deriveMacdBullishExpansion` now derives the delta from `macdHistogramSlope1m`/`macdHistogramSlope` (the rate-of-change the feed already emits) or from a previous histogram (`macdHistogramPrev1m`), then returns `histogram>0 && delta>0` — a real boolean. Added a symmetric explicit-`false` branch for bearish/contracting histogram states.
- Normalizer persists the slope as the `histogramDelta` fallback so the stored fact isn't null when only slope is present.

**Defect 1 — name the INCOMPLETE driver** (`src/research/buildLongEntryResearchSnapshot.js`, `src/export/longTradeExportSchema.js`):
- New log-only scalars on every row: `longDataQualityMissingRequiredCount`, `longDataQualityPrimaryMissingField`, `longDataQualityVerdictDriver` (one of `MISSING_REQUIRED_FIELD` / `CRITICAL_COMPONENT_ERROR` / `CONFLICTED_FIELD` / `LOW_OPTIONAL_COVERAGE_OR_STALE` / `NONE`). Registered in the V8 compact export so the 983-row data can be grouped by cause without parsing the JSON array. No data fabricated — a genuinely-missing field (e.g. `atrPct`) is reported, not invented.

## Missing-telemetry sweep

Ran a richly-populated entry candidate through all 281 export columns. The 75 null entry-time columns were all legitimate: identity/runtime fields that live on the trade record (not the research snapshot), outcome/finalization fields that are correctly null before close, empty arrays for a clean row (no fail/conflict/anti-combo), and correctly-conditional fields (`longGateTierCeilingApplied` null when no ceiling fires; `longDataQualityPrimaryMissingField` null when nothing is missing). **No genuine unpopulated telemetry found.**

## Validation

- Syntax: 264 files OK.
- Full unit suite: **96 files, 1484 tests pass** (incl. new `telemetryDefectFixes.test.js`, 9 tests).
- `vite build`: success.
- Purity guards: export / filter / runtime all pass; `tradeSchemaVersion = LONG_TRADE_EXPORT_V8`.
- Soak — full 300 logical seconds (150 trades, 3 profiles): `allRunsPassed: true`.
- Soak — 60 s realtime: full wall-clock, `allRunsPassed: true`, max event-loop lag 2.1 ms.
- Final consolidated probe: all six defects report FIXED/RESOLVED.

## Note on the two confirmed-by-disambiguation items

For defects 3 and 6 the underlying value is now correct, but the field name changed (`entryPolicyShadowDecision → entryPolicyDiagnosticDecision`; `floorExitEnforced → profitLockFloorEnforcementSucceeded` for the success signal). Any downstream analysis still reading the old column names should be repointed.
