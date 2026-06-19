# LongLAB Telemetry-V9 Regime & Integrity Remediation — Implementation Report

**Base:** `LongLAB-main-june17-telemetry-v8-fixed` (app `1.0.4`)
**Spec:** `LongLAB_Telemetry_V8_Observability_Remediation_Spec.md` (included in repo root)
**Mode:** Log-only / observer. Nothing here blocks, gates, sizes, or alters which candidates are created or how positions close. Every change corrects a *logged value* or adds an *observational field*. Block-filter construction remains a separate future phase.

---

## What was implemented (all 8 defects + wiring)

1. **Gate score/tier ignored regime** → `src/longGate/longGateAudit.js` + new `src/longGate/longGateRegimeConfig.js`. The gate now consumes the V8 `marketRegime` labels: ATR `+5` reward is suppressed in a headwind, a breadth/context penalty is applied before clamp, and an observational tier ceiling caps the emitted tier (`HARD_DANGER → WATCH`, `DANGER → STRONG`). Replaced in place; no legacy copy. New diagnostics: `longGateRegimePenaltyApplied`, `longGateTierCeilingApplied`, `longGateRegimeVersion`.
2. **`longQualityTierV2` used `Math.max`** → `src/research/longEvidenceSemantics.js`. Replaced with consensus (median + in-band counts) plus a regime cap. Version bumped to `LONG_QUALITY_BUCKET_V3_2026_06_17`; adds `longQualityTierV2Aggregation: 'CONSENSUS_MEDIAN'`.
3. **`longAtrContext` boost ungated by regime** → same file. `QUALIFIED_VOLATILITY_BOOST` is now gated behind `!headwind && !hardDanger`; otherwise `UNQUALIFIED_VOLATILITY_DANGER`.
4. **`longAesConfidence` = coverage in disguise** → `src/scoring/longAbsoluteEntryScore/longAbsoluteEntryScore.labels.js` + `.scorer.js`. Rebuilt as `50 + scoreMargin ± evidenceAgreement − conflictPenalty`, with coverage as a precondition (returns 0 below floor). `calibrationStatus = CALIBRATED`.
5. **Raw `SL` persisted next to canonical** → `src/lifecycle/longTradeLifecycle.js`. `stableLegacyCodes` trimmed to `{PROFIT_LOCK, TIMEOUT}`; analytics key on `canonicalCloseReason`. Verified in soak: run 903 emits `STOP_LOSS`, never `SL`.
6. **`STALE_FINAL_PRICE` nulled 15.5% of PnL** → `src/lifecycle/tradeFinalization.js` + `src/app/LongLabApp.jsx`. Added a pre-finalize freshness guard (`resolveFreshFinalPrice`) that re-stamps a stale close price via the existing REST path before recording — never loosens the 30 s staleness bar. New fields: `finalPriceRefreshAttempted/Succeeded`, `finalPricePreRefreshAgeMs`.
7. **`MICRO_NO_LONG_CONFIRMATION` not a discrete fact** → `src/research/buildLongEntryResearchSnapshot.js`. Pure observation tag `longMicroConfirmObserved` (+ reversal-lane flag, version). No gate, no promotion path.
8. **Exit distribution not sliceable by regime** → `src/app/LongLabApp.jsx`. Diagnostic `exitVsRegimeAttribution {regime, context, closeReason, lane}` on each closed sample.

**Export wiring (required for a log-only deliverable):** all eleven new diagnostic fields are registered in `src/export/longTradeExportSchema.js` (V8 compact column set) and surfaced through the explicit flat snapshot in `buildLongEntryResearchSnapshot.js`, so they appear in `master/trades.csv`/`.jsonl`. Verified by direct serialization and a regression test.

---

## Validation results

- **Syntax:** 263 files OK.
- **Full unit suite:** 95 files, **1475 tests pass** (includes 26 new remediation tests across `longGateRegime.test.js`, `regimeRemediation.test.js`, `finalizationRefresh.test.js`).
- **Production build:** `vite build` succeeds (799 modules).
- **Purity guards:** runtime, filter, and export all pass; `tradeSchemaVersion = LONG_TRADE_EXPORT_V8`; all 22 critical columns populate; no `[object Object]`.
- **Soak — full 300 logical seconds (3 profiles, 150 trades):** `allRunsPassed: true`, 0 invalid ticks, 0 heavy-duplicate telemetry fields.
- **Soak — genuine 120 s realtime:** completed full wall-clock, all trades closed, max event-loop lag **1.8 ms** (threshold 500 ms), fast-scan max sub-millisecond (threshold 12 s). Artifacts under `validation/telemetry-v8-soak*`.

## Invariants preserved

No change to scan cadence, fee model, PnL model, or storage keys. Every new field carries `logOnly: true` / `canAffectExecution: false`. No `*Legacy`/`*PreRegime` shadow columns. Net PnL is intentionally unchanged — these correct the *observation*, not the trade.

## Out of scope (next phase)

Any actual blocking/filtering/sizing built on these now-trustworthy fields is a separate spec, to be designed once a few clean observation batches confirm the thresholds.
