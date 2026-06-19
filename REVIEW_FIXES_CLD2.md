# LongLAB — Review Fixes (cld2)

This pass is a surgical follow-up to the `cld1` review. It closes the four P0
data-integrity blockers, hardens the Highlight engine statistically, completes
the unfinished cockpit features, archives the legacy parallel filter
infrastructure, and makes the single-command CI gate terminate reliably.

## Full CI (single command — now terminates)

```
npm run test:ci
  ✓ Syntax OK — 213 files checked
  ✓ Build
  ✓ Unit tests shard 1/2 — 33 files
  ✓ Unit tests shard 2/2 — 33 files (809 tests)        → 66 files / 1,331 tests
  ✓ Research cockpit tests — 18 files / 261 tests
  ✓ Runtime purity: PASS
  ✓ Filter purity: PASS
  ✓ Export purity: PASS — 109 unique columns, 14 critical populated
  ✓ ALL CI CHECKS PASSED
```

## P0 blockers

### 1. Single filter-snapshot version
`src/filters/longFilterConstants.js` no longer declares `long-filter-snapshot-v1`.
It re-exports the canonical `LONG_FILTER_SNAPSHOT_VERSION` (and the export
version) from `src/research/longResearchSchemaVersions.js`. Top-level and nested
`entryResearchSnapshot.filterSnapshot` now both report `LONG_FILTER_SNAPSHOT_V4`.

### 2. Normalized PnL is the real engine default
`PNL_METRIC` gained four explicit, unit-unambiguous members —
`FEE_ADJUSTED_NORMALIZED`, `RAW_NORMALIZED`, `FEE_ADJUSTED_MARGIN`, `RAW_MARGIN`
— plus `DEFAULT_PNL_METRIC = FEE_ADJUSTED_NORMALIZED`. `getLongFilterOutcomePnl`
reads one unit-matched field per metric and **never** substitutes a margin value
for a missing normalized value (it returns `pnlMetricAvailable: false` instead).
`DEFAULT_LONG_FILTER_STATE`, the URL serializer, and the analytics metric
defaults all switched to normalized.

### 3. Real Post-Fee preview scorer
New `tickerPostFee10PreviewAssessment` in `src/research/longPreviewScorers.js`
builds canonical preview facts, derives a legitimate preview danger tier, and
calls the canonical `scoreLongPostFee10Entry`. It is tagged
`sourceTiming: ENTRY_PREVIEW · logOnly · canAffectExecution:false`. The app's
`postFee10TickerDisplay` no longer routes Post-Fee through Best DNA.

### 4. Compact filter snapshot
`freezeLongFilterSnapshot` returns a compact canonical snapshot (meta + data
quality + canonical entry-final field values + shadow verdict) instead of
spreading the whole working trade. Per-trade snapshot dropped from ~190 keys /
~15 KB to ~44 keys / ~1.4 KB, with no loss of canonical fields.

## Cockpit + statistics

- **Quick filters folded into the effective state.** Compare Mode, saved views,
  and the shared URL now capture `buildEngineState(filterState, quickFilters)`,
  so "current configuration" reproduces the visible trade set.
- **Full per-group predicate editing.** The group editor displays each group's
  predicates and supports add (field/operator/value form) / remove / reorder,
  per target group. Empty groups are labelled "empty → matches all".
- **Canonical Shadow Decision panel.** The retired Entry-Policy-V2 panel was
  replaced with one reading only `longShadowDecision`,
  `longShadowComponentVerdicts`, and the positive/caution/block/unknown reason
  arrays.
- **Compare breakdowns + persisted configs.** Compare Mode now shows session
  positivity (positive/negative sessions), leverage, close-reason, AUTO_END,
  TIMEOUT, and SL distributions; captured A/B configs persist across sessions.
- **Highlights hardened.** Positive synergy is enforced on 2-combos as well as
  3-combos; the unit-mixing margin fallback was removed (margin-only records are
  excluded and counted); promotion sample floors and a
  `DISCOVERY → CROSS_RUN_VALIDATED → CROSS_SESSION_VALIDATED → OOS` grade ladder
  were added; and an `EXPLORATORY · IN-SAMPLE · NOT VALIDATED` disclaimer is
  surfaced on the page.

## Architecture / CI

- **Legacy parallel filter infrastructure archived.** `longFilterExport.js` and
  `longFilterMigration.js` moved to `src/archive/legacy-filter-infra/` (neither
  was imported by the active cockpit). Canonical paths remain
  `src/export/longTradeExport*` and `src/migrations/migrateLongTradeRecord.js`.
- **CI termination.** The unit suite runs as two independent `--shard`
  invocations inside `scripts/run-ci.mjs`; each terminates in ~10 s, so
  `npm run test:ci` is now a dependable one-command gate.

## New regression tests
- `src/research/reviewFixesP0.test.js` — 13 tests locking P0 #1–#4.
- `src/filters/longHighlightEngine.test.js` — added disclaimer, single-run
  DISCOVERY grading, no-unit-mixing, and cross-session promotion cases.
- `src/filters/cockpitUiLogic.test.js` — added session-positivity and
  close-reason/leverage breakdown assertions.

## Verification boundary
All logic, scoring, snapshot, analytics, highlight, compare, and purity behaviour
is covered by the test suite and a clean production build. Interactive
click-through of the new group predicate editor, Compare breakdowns, and Shadow
panel was not browser-tested in this environment.
