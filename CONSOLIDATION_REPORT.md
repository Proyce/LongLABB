# LongLAB Research Cockpit — Consolidation Report

Final CI: `npm run test:ci` → **ALL CI CHECKS PASSED**
- Syntax check: 210 files OK
- Production build: OK
- Unit suite: **1299 passed / 64 files**
- Focused cockpit suite: **228 passed / 16 files**
- Runtime purity: PASS
- Filter purity: PASS
- Export purity: PASS (109 columns, unique keys/headers, no deprecated keys)

## Section-by-section

- **§2** Removed unused `src/research/longResearchGateConfig.js` (no importers).
- **§4** New `src/research/longResearchSchemaVersions.js` is the single source of the three version constants; builder, migration, and export import from it.
- **§5** Removed batch adaptive-AES / entry-policy retrofit and all related imports from `LongLabApp.jsx`. The canonical builder is the sole research authority for both paths.
- **§6** Builder rewritten around one cumulative `workingTrade`; every stage merges before the next consumes. Gate values are injected into the AES feature snapshot (downstream invariant test included).
- **§7** Canonical snapshot keys: `bucketClassification, gate, bucketAudit, marketContext, marketBreadth, longAudit, longAes, bestDnaLong, candidateRunner, postFee10, sniperLongGate, comboResult, shadowDecision, filterSnapshot`, plus `entryResearchStatus`. No parallel aliases.
- **§8** Flattened trade maps each canonical field explicitly. Canonical shadow field is `longShadowDecision` with reason groups + `longShadowComponentVerdicts`; component errors are `entryResearchComponentErrors`.
- **§9** Two-phase data quality with strict precedence (CONFLICTED > INCOMPLETE > DEGRADED > COMPLETE); conflicts dominate.
- **§10** Shadow decision uses canonical `LONG_CONTEXT_*` / `LONG_BREADTH_*` mappings (legacy `BTC_*` retained for back-compat), CONFLICTED→UNKNOWN guard, <75% required coverage→UNKNOWN, and the §10 final priority.
- **§11** `assertEntrySnapshotConsistency` rebuilt as an explicit `CONSISTENCY_CHECKS` table with nested paths, `MISSING_PATH` detection, and test/dev/prod behavior. Mutation test covers every listed field.
- **§12** Migration imports canonical `LONG_RUNNER_*` / `LONG_PF10_*` tier constants; no hard-coded tier strings.
- **§13** Load-time migration wired (`migrateLongTradeRecord` before sanitation). V4 records are repaired idempotently; missing tiers are flagged (`longFilterMissingTierFields` + DEGRADED), never fabricated.
- **§14/§15** Filters use canonical entry fields (`longPostFee10EntryScore/Tier`, `longCandidateRunner*AtEntry`, `longShadowDecision`); live runner-capture fields reclassified `EXIT_MANAGEMENT` / `POST_ENTRY_LIVE` / non-entry-predictive. FiltersTab cards/columns relabeled with explicit timing.
- **§16** `computeLongFilterCoverage` keyed by `filter.id` with `{ filterId, sourceFields, implemented, totalTrades, knownTrades, unknownTrades, notApplicableTrades, coveragePct, health }` and the `ACTIVE/DEGRADED/NO_DATA/NOT_IMPLEMENTED` vocabulary (legacy fields retained for existing UI consumers).
- **§17** Engine already implements arbitrary groups + UNKNOWN propagation; added state helpers `duplicateGroup / reorderGroups / reorderPredicate / setGroupOperator / setGroupComposition`.
- **§18** `ExplainMatchDrawer` reads engine `filterResultsByTradeId` (no recompute) and shows verdicts, missing inputs, and the full research context.
- **§19** `compareFilterConfigurations` runs both configs through the real engine; default metric `feeAdjustedNormPnlPct`; reports counts/overlap/A-only/B-only, win/SL rates, profit factor, bucket and close-reason breakdowns.
- **§20** URL serialize/deserialize with safe fallback to defaults, `makeSavedView`/`restoreSavedView`, storage key `longlab.researchCockpit.v4`.
- **§21** `feeAdjustedNormPnlPct` is the default research metric; `finalPnlPct` remains a backward-compat fallback only.
- **§22** Export schema aligned to builder output; dropped dead columns; canonical `longShadowDecision` + `entryResearchComponentErrors`.
- **§23** Real `buildManualResearchTrade` / `buildBatchResearchTrade` adapters wired into the app; parity + static no-scorer-import tests pass.
- **§24** Shared `longTradeLifecycle.js` (single-source close-reason classifier the app imports); no-block lifecycle test runs through real insert→update→finalize→export.
- **§25** Best-DNA test no longer expects Post-Fee fields and asserts their absence; cockpit suite adds the other mandated assertions.
- **§26** Runtime purity inverted to forbid direct scorer imports in app/adapters (preview scorers extracted to `longPreviewScorers.js`); `buildFullShortUniverse` renamed direction-neutral. Filter purity now rejects long-legacy fields and requires the active cockpit component imports.
- **§27** `package.json` scripts updated to the spec definitions; `test:ci` runs `scripts/run-ci.mjs`, which chains all seven steps and terminates.
- **§28** Smoke greps all return zero; shadow/migration/consistency/gate-visible-to-AES probes included as tests.

## Verification boundary

UI behaviour for §17–20 is verified at the **logic layer** (pure functions, unit-tested) and via successful production build of the new components (`ExplainMatchDrawer`, Compare Mode helper). Interactive click-through/drag-reorder UX was not browser-tested in this environment; the engine, state, URL, saved-view, and compare logic are covered by tests.

---

## Filters Tab upgrade — Highlights + interactivity

**Highlight curation engine** (`src/filters/longHighlightEngine.js`, 9 tests):
- Generates candidate ENTRY-timing predicates from the registry (boolean → IS_TRUE, numeric → preset thresholds, enum/array → observed values). Live/exit fields are never used as entry evidence (`entryPredictive` + `ENTRY_FINAL` gate).
- Scores each signal's univariate edge vs the population baseline using **shrinkage-adjusted lift** (robust to tiny samples) blended with a **t-like confidence**; enforces a minimum-support floor so flukey small-n signals never surface.
- Assigns coverage **bands** — SHARP (narrow, high edge) → STRONG → BROAD — and `sortSharpToBroad` orders best/narrowest first.
- **Combo discovery**: an apriori/greedy miner builds 2- and 3-signal conjunctions over the top singles, reusing the real engine's `evaluatePredicate` for matching. Combos survive only with sufficient joint support and **positive synergy** (joint lift beats the best constituent), guarding against overfitting. Output is ranked by edge.
- Curates **top labels** (shadow verdict, combo labels, DNA/Runner/Post-Fee tiers, sub-bucket, micro-momentum) by edge.
- Default metric `feeAdjustedNormPnlPct`. Recomputes live as trades/RUNs accumulate.

**Highlights sub-tab** (`src/filters/HighlightTab.jsx`, wired as the first inner tab):
- Baseline header (population n, baseline PnL, win%), live sort toggles (SHARP→BROAD / BY EDGE / BY COVERAGE), and show-N controls.
- Top Filters, Discovered Combos (expandable to show member predicates + synergy chip), and Top Labels — each row with a lift bar, band chip, avg/win%/n/coverage/t-stat.
- **Interactivity**: one click on APPLY injects the signal (or whole combo, as an ALL_OF group) into the active filter state and jumps to Trades to show the result, via `handleApplyHighlight` in `FiltersTab`.

UI behaviour is verified by the engine's unit tests and a successful production build of the components; interactive click-through was not browser-tested in this environment.

---

## Review-fix pass (addresses the independent ~80% review)

Final CI after this pass: **1314 unit / 65 files**, **243 cockpit / 17 files**, runtime + filter + export purity all green.

**Scoring / pipeline blockers**
1. **AES canonical inputs.** `normalizeLongAesFeatures` now reads `entryCvdLabel ?? cvdLabel` (probe: `cvdLabel = BULL`, previously `UNKNOWN`), and `deriveBtcRunDirection` prefers `btcMicroDirectionLabel`/`btcTacticalDirectionLabel`. Locked by regression tests.
2. **Canonical filter snapshot.** `freezeLongFilterSnapshot` core/extended fields are canonical (`longPostFee10EntryScore`, `entryCvdLabel`, `entryPriceVsVwapLabel`, `longCandidateRunnerScoreAtEntry`, `longShadowDecision`). It no longer runs a competing data-quality classification — it inherits the builder's finalized verdict via `opts.inheritedDataQuality`, and the builder stamps the canonical verdict + shadow decision onto it. The three quality verdicts (top-level, `snapshot.dataQuality`, `snapshot.filterSnapshot`) now always agree (regression-tested).
3. **Quality finalized after the snapshot.** Builder order is now: build filter snapshot (record error if it throws) → finalize data quality (error-aware) → build shadow → stamp canonical verdict + shadow onto snapshot.
4. **Ticker previews canonical.** `postFee10TickerDisplay`, `runnerTickerDisplay`, and the `postFee10BySymbol` filter read `longPostFee10EntryScore/Tier` and `longCandidateRunnerScoreAtEntry/TierAtEntry`. Runtime purity now fails on the legacy reads (regression guard).

**Cockpit UI (now active, not dead code)**
5. **Explain Match** — Trades rows are clickable and open `ExplainMatchDrawer`, consuming the engine's `filterResultsByTradeId` (no recompute).
6. **Cockpit Tools tab** bundles **Compare Mode** (two configs through the real engine, default `feeAdjustedNormPnlPct`), the **arbitrary group editor** (add / duplicate / remove / reorder / per-group ALL_OF·ANY_OF·NONE_OF / ALL_GROUPS·ANY_GROUPS), and **saved views + share URL**.
7. **URL state** — filter state hydrates from `#f=` on mount and is mirrored to the URL on every change; named views persist under `longlab.researchCockpit.v4.views`.

**Analytics / tests / purity**
8. **Normalized PnL everywhere.** `buildRunFilterSummary`, `buildAbsoluteEntryScoreAnalytics`, and `longFilterAnalytics.closedTrades` route through the normalized-first selector; `finalPnlPct` is only a fallback.
9. **App uses the shared lifecycle helper.** `LongLabApp.finalizeClosedSample` now builds its closed-trade base via `finalizeLongTrade` (regression-tested), so the app and lifecycle module share close-reason classification and the log-only flags. (`insertSimulatedTrade`/`applyPriceUpdate` remain tested helper utilities; the live sim loop still drives its own ticks.)
10. **Export purity** builds a populated real V4 trade and asserts 14 critical columns actually populate — a dead column can no longer pass.
11. **Stale parity checks rewritten** to assert the real canonical paths (`snapshot.gate`, `snapshot.bucketClassification`, `snapshot.longAes`, `snapshot.shadowDecision`) instead of silently skipping.
12. **Filter purity** now enforces `longFilterSnapshot.js` (removed from the legacy allowlist once it became canonical).

**Verification boundary (unchanged honesty):** all logic, scoring, snapshot, analytics, and purity behaviour is covered by the test suite and a clean production build of the UI components. Interactive click-through of the cockpit (drawer, compare panel, group drag-order, URL share) was not browser-tested in this environment.
