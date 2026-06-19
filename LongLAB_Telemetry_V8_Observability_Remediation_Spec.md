# LongLAB Telemetry-V8 Observability Remediation Specification

**Spec version:** `LONGLAB_REMEDIATION_V2_2026_06_17_TELEMETRY_V8`
**Supersedes:** `LONGLAB_REMEDIATION_V1_2026_06_17`
**Target codebase:** `LongLAB-main-june17-telemetry-v8-fixed` (app `1.0.4`, schemas `*_V8`)
**Source evidence:** `longlab_current_view_all_1781691106486` (400 rows / 301 settled, 16 sets, 2 batches, 2026-06-17)
**Mode:** Log-only / observer. **Nothing in this spec blocks, gates, sizes, or alters which candidates are created.** It changes only what the logs *say*. Block/filter construction is explicitly deferred to a later phase (see §9).

---

## Mission

The June 17 batch ran entirely inside a regime the system itself flagged hostile to longs (`LONG_CONTEXT_STRONG_HEADWIND` + `LONG_BREADTH_HARD_DANGER` on all 301 settled trades; net −0.237/trade, 0 of 16 sets positive). The empirical analysis surfaced eight defects, three of which cause the system's "best" labels to be anti-predictive. The Telemetry-V8 build fixed real stability and telemetry-size problems but **did not touch any of the eight**; all remain byte-identical at the same source lines.

This spec corrects them so the observed telemetry is **accurate and predictive**. Every change is a correction to a logged value or the addition of an observational field. None of it decides anything. The deliverable is honest logs you can trust when you build the actual block filters next phase.

---

## 1. V8 audit verdict

### What V8 fixed (verified, good work — out of scope here)

- Blank-page render crash: closed `FINALIZATION_FAILED` rows have `finalPnlPct = null`; the equity renderer called `.toFixed()` on null. Now contained via `safeFormat.js`, `hasFiniteClosedPnl()`, `closedPnlSamples` separation, and `AppErrorBoundary`.
- Scanner overruns: split into a 12 s fast universe lane and a ≤60 s background deep-telemetry lane with a busy flag.
- WebSocket close-before-open warning: deferred close for `CONNECTING` sockets.
- Telemetry compaction: 87% default-export size reduction; heavy nested objects (`entryResearchSnapshot`, `longComboDetails`, `longWinningSetupMatchDetails`, `entrySnapshotFieldStatus`) removed from the default master and pushed to `forensics/exit_events.jsonl`; static registry metadata moved to `manifest.json`.
- One genuine telemetry fix overlapping our concerns: the previously-inert, all-null `entryPolicyShadowDecision` is now populated as `entryPolicyDiagnosticDecision` from the real evaluator.

### What V8 did not fix (verified byte-identical in the V8 tree)

| # | Defect | V8 location (unchanged) | Status |
|---|---|---|---|
| 1 | Gate score has no regime term; ATR `+5` reward; `PREMIUM` = top band | `longGate/longGateAudit.js:122`, `:196` | **Outstanding** |
| 2 | `longQualityTierV2` aggregates with `Math.max`, regime-blind | `research/longEvidenceSemantics.js:171` | **Outstanding** |
| 3 | `longAtrContext = QUALIFIED_VOLATILITY_BOOST` ungated by regime | `research/longEvidenceSemantics.js:111` | **Outstanding** |
| 4 | `longAesConfidence*` = feature-coverage in disguise (weights sum to 1.0) | `scoring/longAbsoluteEntryScore/longAbsoluteEntryScore.labels.js:38-41` | **Outstanding** |
| 5 | Raw `SL` persisted alongside canonical `STOP_LOSS` | `lifecycle/longTradeLifecycle.js:52` | **Outstanding** |
| 6 | `STALE_FINAL_PRICE` nulls 15.5% of PnL; no pre-close refresh | `lifecycle/tradeFinalization.js:27` | **Outstanding** |
| 7 | 59% of entries log `MICRO_NO_LONG_CONFIRMATION`; not observed as a discrete fact | `longGate/longGateAudit.js:26-33` | **Outstanding** |
| 8 | Exit distribution not sliceable by regime | `lifecycle/openPositionLifecycle.js` | Diagnostic only |

### What V8 newly enables

V8 added `src/marketRegime/` with normalized regime intelligence that fix #1 needs and that did not exist when the V1 spec was written:

- `marketRegime/longMarketBreadthLogOnly.js` exports `LONG_BREADTH_LABEL` (`SUPPORTIVE`, … , `HARD_DANGER`) and already computes `longMarketBreadthWouldBlock = (label === HARD_DANGER)` — **log-only, consumed by nothing.**
- `marketRegime/normalizeLongMarketContext.js` (`LONG_MARKET_CONTEXT_VERSION = 'long-market-context-v2'`) emits `LONG_CONTEXT_STRONG_HEADWIND … LONG_CONTEXT_STRONG_TAILWIND`.

The gate (`longGateAudit.js`) imports only from `longWinningSignals.js`; it never imports the regime module. The regime data is clean and available — it is simply not consumed by the scorers. Fix #1 is now a wiring + scoring change, not a build-the-regime change.

---

## 2. V8 field-name changes that affect this work

V8 canonicalized fields. All patches and all future analysis must use the V8 canonical names. The analysis that produced this spec used pre-V8 names; the mapping:

| Pre-V8 (used in analysis) | V8 canonical |
|---|---|
| `rawAntiComboCount` (top negative predictor) | `longCombosAntiCount` |
| `rawPositiveComboCount` | `longCombosPositiveCount` |
| `activeWinningSetupIds` | `longWinningSetupMatchedIds` |
| `entryPolicyShadowDecision` (was all-null) | `entryPolicyDiagnosticDecision` |
| `entrySnapshotCompletenessPct` | `requiredEntrySnapshotCompletenessPct` |
| `longFilterCoveragePct` | `optionalResearchFeatureCoveragePct` |
| `feeAdjustedNormPnlPct` (outcome var) | retained; `feeAdjustedLeveragedPnlPct` is the margin-space canonical |

**Analysis-continuity note:** `longComboDetails` and `longWinningSetupMatchDetails` are no longer in the default export (now in `forensics/exit_events.jsonl` for exceptional rows only). Per-tag combo analysis still works off the flattened `longCombosPositiveMatched` / `longCombosAntiMatched` / `longWinningSetupMatchedIds` arrays and the `*Count` scalars, which remain. Clause-level combo dissection now requires the forensics file.

---

## 3. Non-negotiable constraints

1. **Log-only. No blocking.** No field introduced or corrected here may gate, skip, delay, or alter candidate creation or position lifecycle decisions. The gate file's own header contract holds: *observer-mode, does NOT block or alter candidate creation.* These changes alter emitted observations only.
2. **Replace fully, no legacy copies.** The broken derivations (#1 gate score/tier, #2 quality tier, #3 ATR context, #4 confidence) are corrected **in place**. Do not emit `*Legacy`, `*PreRegime`, or `*V1` shadows of the replaced value. Historical comparison is done against archived prior exports, not against duplicated columns.
3. **Additive diagnostics are allowed** where they describe *why* a corrected value came out as it did (e.g. `longGateRegimePenaltyApplied`), as long as they are not copies of the replaced field.
4. **No change** to scan cadence, fee model, PnL model, storage keys, or the V8 compaction/export-size contract.
5. **Version every touched module** and bump `tradeSchemaVersion` / export schema per V8 convention.
6. **Deterministic + unit-tested**, including the specific failing rows from this batch and the full regime matrix. Existing purity guards (`scripts/check-long-export-purity.mjs`, `check-long-runtime-purity.mjs`) must still pass.

---

# Wave 1 — Regime-aware observation (fixes #1, #2, #3)

These three are one root cause: the scorers grade entry micro-structure in isolation and never subtract for the macro regime, so in a headwind a violent green spike on a top-loser scores into the top band — exactly the trades that fade. In observer mode this means the **logged tier is misleading**, not that a bad trade was blocked or allowed. We correct the logged values to be regime-aware so the labels match reality.

## 1.1 Gate score and tier — consume the regime (replace in place)

**Root cause.** `computeLongGateScore(s, ctx)` (`longGateAudit.js:103-134`) is a pure local-microstructure sum with `atrPct >= 0.6 → +5` (line 122) and no regime term. Tier (`:194-198`) puts `PREMIUM` at the top (`gateScore >= 85`). Result in-batch: `PREMIUM` −0.290 vs `STRONG` +0.015, `WATCH` −0.099 — inverted.

**Add config** `src/longGate/longGateRegimeConfig.js`:

```js
import { LONG_BREADTH_LABEL } from '../marketRegime/longMarketBreadthLogOnly.js';
export const LONG_GATE_REGIME_VERSION = 'LONG_GATE_REGIME_V1_2026_06_17';

export const LONG_GATE_REGIME_PENALTY = Object.freeze({
  breadth: {
    [LONG_BREADTH_LABEL.HARD_DANGER]: -30,
    [LONG_BREADTH_LABEL.DANGER]:      -15,
    [LONG_BREADTH_LABEL.CAUTION]:     -6,
    [LONG_BREADTH_LABEL.NEUTRAL]:      0,
    [LONG_BREADTH_LABEL.SUPPORTIVE]:  +4,
  },
  context: {
    LONG_CONTEXT_STRONG_HEADWIND: -20,
    LONG_CONTEXT_HEADWIND:        -10,
    LONG_CONTEXT_NEUTRAL:          0,
    LONG_CONTEXT_TAILWIND:        +6,
    LONG_CONTEXT_STRONG_TAILWIND: +10,
  },
});

// Tier ceiling = an OBSERVATIONAL cap on the emitted tier label, not a block.
export const LONG_GATE_TIER_CEILING = Object.freeze({
  [LONG_BREADTH_LABEL.HARD_DANGER]: 'WATCH',
  [LONG_BREADTH_LABEL.DANGER]:      'STRONG',
});
```

**Patch the ATR reward** (`longGateAudit.js:122`) so volatility is not rewarded in a headwind:

```js
// BEFORE
if (Number.isFinite(s.atrPct) && s.atrPct >= 0.6) score += 5;
// AFTER
const headwind = ctx.marketContextLabel === 'LONG_CONTEXT_STRONG_HEADWIND'
              || ctx.marketContextLabel === 'LONG_CONTEXT_HEADWIND';
if (Number.isFinite(s.atrPct) && s.atrPct >= 0.6 && !headwind) score += 5;
```

**Apply the regime penalty** before the final clamp in `computeLongGateScore`:

```js
score += LONG_GATE_REGIME_PENALTY.breadth[ctx.marketBreadthLabel] ?? 0;
score += LONG_GATE_REGIME_PENALTY.context[ctx.marketContextLabel] ?? 0;
return Math.max(0, Math.min(100, score));
```

**Thread regime labels into `ctx`** in `evaluateLongGateAudit` before the score call:

```js
ctx.marketBreadthLabel = s.longMarketBreadthLabel ?? null;
ctx.marketContextLabel = s.longMarketContextLabel ?? null;
```

**Replace the tier derivation** (`:194-198`) to apply the observational ceiling:

```js
const TIER_ORDER = ['RESEARCH_REJECT', 'WATCH', 'STRONG', 'PREMIUM'];
const rawTier =
  !hasSufficientInputs ? 'INSUFFICIENT_DATA' :
  gateScore >= 85 ? 'PREMIUM' :
  gateScore >= 75 ? 'STRONG'  :
  gateScore >= 60 ? 'WATCH'   : 'RESEARCH_REJECT';
const ceiling = LONG_GATE_TIER_CEILING[s.longMarketBreadthLabel];
const longGateTier =
  rawTier === 'INSUFFICIENT_DATA' ? rawTier :
  ceiling && TIER_ORDER.indexOf(rawTier) > TIER_ORDER.indexOf(ceiling) ? ceiling : rawTier;
```

**New diagnostic fields (additive, not copies of the replaced value):** `longGateRegimePenaltyApplied` (number), `longGateTierCeilingApplied` (string|null), `longGateRegimeVersion`. The replaced `gateScore`/`longGateTier` are emitted with their new regime-aware values directly; no pre-regime shadow is kept.

**Acceptance (batch replay).** With breadth `HARD_DANGER` on all rows, ceiling = `WATCH`: zero `PREMIUM` and zero `STRONG` tiers emitted; tier→mean-PnL ordering is non-inverted within ±0.05.

## 1.2 `longQualityTierV2` — consensus aggregation + regime (replace in place)

**Root cause.** `deriveLongQualityBuckets` (`longEvidenceSemantics.js:171`) uses `Math.max(gate, dna, pf10, runner)`; one inflated scorer (typically the regime-blind gate) promotes the whole tier, so `STRONG` (80-89) collected the falling-knife spikes and came out worst (−0.320).

**Replace** the `max` line and tier assignment:

```js
const scores = [gate, dna, pf10, runner].filter(Number.isFinite);
if (scores.length === 0) { /* return UNKNOWN tier as today */ }
const sorted = [...scores].sort((a, b) => a - b);
const median = sorted[Math.floor((sorted.length - 1) / 2)];
const inBand90 = scores.filter(v => v >= 90).length;
const inBand80 = scores.filter(v => v >= 80).length;

let qualityTier =
  (inBand90 >= 2 || median >= 90) ? 'ELITE'    :
  (inBand80 >= 2 || median >= 80) ? 'STRONG'   :
  median >= 70 ? 'QUALIFIED' :
  median >= 50 ? 'WATCH'     : 'REJECT';

const ORDER = ['REJECT','WATCH','QUALIFIED','STRONG','ELITE'];
const cap = sample.longMarketBreadthLabel === 'LONG_BREADTH_HARD_DANGER' ? 'WATCH'
          : sample.longMarketBreadthLabel === 'LONG_BREADTH_DANGER' ? 'QUALIFIED' : null;
if (cap && ORDER.indexOf(qualityTier) > ORDER.indexOf(cap)) qualityTier = cap;
```

Bump `longQualityBucketVersion → LONG_QUALITY_BUCKET_V3_2026_06_17`. Add diagnostic `longQualityTierV2Aggregation: 'CONSENSUS_MEDIAN'`. No legacy copy of the old tier.

**Acceptance.** Monotonic non-increasing mean PnL ELITE→REJECT within noise band; no `STRONG` in `HARD_DANGER`.

## 1.3 `longAtrContext` — regime-gate the "boost" (replace in place)

**Root cause.** `deriveLongAtrContext` (`longEvidenceSemantics.js:111`) labels high ATR + green micro-up as `QUALIFIED_VOLATILITY_BOOST`, the worst bucket in-batch (−0.407), because high vol on these reversals is anti-predictive.

**Replace** the branch:

```js
const headwind = sample.longMarketContextLabel === 'LONG_CONTEXT_STRONG_HEADWIND'
              || sample.longMarketContextLabel === 'LONG_CONTEXT_HEADWIND';
const hardDanger = sample.longMarketBreadthLabel === 'LONG_BREADTH_HARD_DANGER';

let context = 'NORMAL';
if (atr < 0.2) context = 'LOW_ENERGY';
else if (atr >= activeThreshold && qualityElite && microUp && !hardAnti && !headwind && !hardDanger)
  context = 'QUALIFIED_VOLATILITY_BOOST';
else if (atr >= activeThreshold) context = 'UNQUALIFIED_VOLATILITY_DANGER';
```

Bump `longEvidenceSemanticsVersion`. **Acceptance.** Zero `QUALIFIED_VOLATILITY_BOOST` in the batch; all `atr >= 0.6` rows → `UNQUALIFIED_VOLATILITY_DANGER`.

---

# Wave 2 — Telemetry accuracy (fixes #4, #5)

## 2.1 `longAesConfidence` — rebuild from signal, not coverage (replace in place)

**Root cause.** `longAbsoluteEntryScore.labels.js:38-41` inside `computeLongAesConfidenceScore`:

```js
const coreScore = Math.round(featureCoveragePct * 0.70);
const sideScore = Math.round(featureCoveragePct * 0.20);
const ctxScore  = Math.round(featureCoveragePct * 0.10);   // weights sum to 1.0
let confidence  = coreScore + sideScore + ctxScore;        // == featureCoveragePct
```

Coverage is 100 on every batch row ⇒ confidence 100 ⇒ `VERY_HIGH_CONFIDENCE` everywhere; `calibrationStatus = UNCALIBRATED` self-reports it. The scorer passes `featureCoveragePct` at `longAbsoluteEntryScore.scorer.js:639-640`.

**Replace the body** of `computeLongAesConfidenceScore` so coverage is a precondition and confidence reflects score margin and evidence agreement:

```js
// Inputs (already available to the scorer): aesScore, requiredScore,
// posFamilies (independentPositiveEvidenceCount), negFamilies, conflictCount,
// featureCoveragePct, missingFields, previewMode, stale.
if (stale) return 0;
if (!Number.isFinite(featureCoveragePct) || featureCoveragePct < 80) return 0;  // coverage = gate, not score

const margin = (Number.isFinite(aesScore) && Number.isFinite(requiredScore)) ? aesScore - requiredScore : 0;
const marginPts = Math.max(-40, Math.min(40, margin));
const agreement = (posFamilies - negFamilies) * 8;
const conflictPenalty = conflictCount * 10;
let confidence = 50 + marginPts + agreement - conflictPenalty;

// existing missing-field caps still apply
if (hasMissingAtrOrPullback) confidence = Math.min(confidence, LONG_CONFIDENCE_CONFIG.missingAtrOrPullbackMax);
if (hasMissingGreenRed)      confidence = Math.min(confidence, LONG_CONFIDENCE_CONFIG.missingGreenRedStateMax);
confidence = Math.max(0, Math.min(100, Math.round(confidence)));
if (previewMode) confidence = Math.min(confidence, LONG_CONFIDENCE_CONFIG.previewMax);
return confidence;
```

Update the scorer call site (`scorer.js:639`) to pass `aesScore`, `requiredScore`, and the evidence counts (`independentPositiveEvidenceCount`, `independentNegativeEvidenceCount`, `evidenceConflictCount`) instead of relying on coverage. Set `longAesConfidenceCalibrationStatus = 'CALIBRATED'` and recompute `longAesConfidenceIsInformative` / `longAesConfidenceDistinctValueCountAtRun` from the realized run distribution. Keep `classifyLongAesConfidenceLabel` thresholds (90/80/65/40).

**Acceptance.** Any run ≥30 trades shows ≥3 distinct confidence labels; Spearman(confidence, coverage) < 0.5.

## 2.2 Close-reason — make canonical authoritative (no blocking, telemetry only)

**Root cause.** `finalizeLongTrade` (`longTradeLifecycle.js:52-61`) keeps raw legacy codes (`SL`, `TP`, `TRAIL`) in `closeReason` while the correct value already exists as `canonicalCloseReason`. Both `SL` rows in-batch closed via `REST_POLL`.

**Two telemetry fixes (no lifecycle behavior change):**

1. Trim the alias-preserving set to codes already canonical: `const stableLegacyCodes = new Set(['PROFIT_LOCK', 'TIMEOUT']);`
2. In `export/longTradeExportSchema.js` and `filters/longFilterAnalytics.js`, every aggregation (win-rate, PnL-by-exit, IC) keys on `canonicalCloseReason ?? normalizeLongCloseReason(closeReason)`. Display `closeReason` may remain for human reads.

**Acceptance.** Canonical close-reason column shows only `CLOSE_REASON` enum values; `SL` count = 0; the 52 risk exits collapse into one `STOP_LOSS` bucket. Test: `finalizeLongTrade(t,'SL',p)` rollup ⇒ `STOP_LOSS`.

---

# Wave 3 — Data liveness + observational confirmation tag (fixes #6, #7)

## 3.1 Eliminate `STALE_FINAL_PRICE` finalization loss (included per direction)

**Root cause.** `tradeFinalization.js:27` flags `STALE_FINAL_PRICE` when the final price is older than `maxAgeMs = 30_000`; the trade gets `pnl = null` and drops out of analysis. All 62 batch failures are `STALE_FINAL_PRICE` (the integrity layer is clean — `priceIntegrityFailureCode` null on all rows). This silently deletes 15.5% of the sample. **Do not loosen the 30 s threshold** (that would admit stale prices into PnL). Fix the liveness with a pre-finalize refresh.

This touches the close/lifecycle path. It is **not** a blocking change — it does not decide whether to close; the close is already decided. It only ensures the price used to *record* the already-decided close is fresh.

**Patch.** Before `prepareLongTradeFinalization`, if the last tick exceeds a warn age, do one synchronous REST mark-price fetch (reusing the existing `REST_POLL` path already present in the lifecycle):

```js
const TICK_WARN_AGE_MS = 10_000;
async function resolveFreshFinalPrice(symbol, lastTick, now = Date.now()) {
  const age = lastTick?.timestamp == null ? Infinity : now - lastTick.timestamp;
  if (age <= TICK_WARN_AGE_MS) {
    return { price: lastTick.price, timestamp: lastTick.timestamp, source: 'LOCAL_WEBSOCKET_WATCH' };
  }
  const rest = await fetchMarkPriceRest(symbol);   // same REST surface used by REST_POLL closes
  return rest?.price != null
    ? { price: rest.price, timestamp: rest.timestamp ?? now, source: 'LOCAL_REST_FALLBACK' }
    : { price: lastTick?.price, timestamp: lastTick?.timestamp, source: 'STALE_UNREFRESHED' };
}
```

Pair with the lifecycle watchdog (this branch already carries the Run79 watchdog and V8 websocket cleanup) so the per-symbol stream stays warm for open positions and `positionLifecycleSymbolTickAgeMs` is emitted continuously.

**New fields:** `finalPriceRefreshAttempted`, `finalPriceRefreshSucceeded`, `finalPricePreRefreshAgeMs`.

**Acceptance.** Re-run finalization-failure rate < 3% (target 0%); residual failures carry a non-`STALE_FINAL_PRICE` code; no refreshed trade has `finalPriceAgeMs > 30_000`.

## 3.2 Observe micro-confirmation as a discrete fact (no gate)

**Root cause.** The label logic (`longGateAudit.js:26-33`) is correct; `MICRO_NO_LONG_CONFIRMATION` is the default when none of green/ticks-up/RSI-rollover fire. 177/301 (59%) of entries logged it, mapping onto the worst lane (`TOP_LOSER_NO_LONG_MOMENTUM_YET`, −0.344). Today this is buried inside a multi-valued label.

**Add observational fields only — no blocking, no shadow-gate, no promotion path.** This is purely so the fact is directly sliceable for next-phase filter design:

```js
export const MICRO_CONFIRM_OBS_VERSION = 'LONG_MICRO_CONFIRM_OBS_V1_2026_06_17';
function observeMicroConfirm(s) {
  const confirmed = s.longMicroMomentumLabel !== 'MICRO_NO_LONG_CONFIRMATION';
  return {
    longMicroConfirmObserved: confirmed,                                 // bool fact
    longMicroConfirmReversalLane: s.topLoserLongThesisLane === 'TOP_LOSER_LONG_REVERSAL_WATCH',
    longMicroConfirmObsVersion: MICRO_CONFIRM_OBS_VERSION,
    logOnly: true, canAffectExecution: false, executionApplied: false,
  };
}
```

No `WOULD_BLOCK` decision, no counter that implies a future gate, nothing wired to entry. It records what happened. **Whether to ever gate on it is a next-phase decision (§9).**

---

# Wave 4 — Exit attribution (issue #8, diagnostic only)

The fixed-distance stop (`openPositionLifecycle.js`) clustering near −1.30, `PROFIT_LOCK` at breakeven, and `TIMEOUT` drift are downstream symptoms of entry quality, not exit bugs — no exit-engine change. Add one diagnostic so post-fix exit behavior is sliceable by regime without recomputation:

- **New field** `exitVsRegimeAttribution`: `{ regime: longMarketBreadthLabel, closeReason: canonicalCloseReason, lane: topLoserLongThesisLane }`.

---

## 4. File manifest (V8 paths)

**Modified**
- `src/longGate/longGateAudit.js` — regime penalty, ATR conditionalization, tier ceiling, thread regime into `ctx` (§1.1, §1.3)
- `src/research/longEvidenceSemantics.js` — quality consensus + regime, ATR regime-gate (§1.2, §1.3)
- `src/scoring/longAbsoluteEntryScore/longAbsoluteEntryScore.labels.js` + `.scorer.js` — confidence rebuild + call-site inputs (§2.1)
- `src/lifecycle/longTradeLifecycle.js` — trim `stableLegacyCodes` (§2.2)
- `src/lifecycle/tradeFinalization.js` + watchdog/price-stream module — pre-finalize refresh (§3.1)
- `src/export/longTradeExportSchema.js`, `src/export/longTradeExport.js` — new fields, canonical close-reason grouping (all waves)
- `src/filters/longFilterAnalytics.js` — group on `canonicalCloseReason` (§2.2)

**New**
- `src/longGate/longGateRegimeConfig.js` (§1.1)
- micro-confirm observer (co-located with entry research) (§3.2)

**Versions bumped:** `LONG_GATE_REGIME_VERSION`, `longQualityBucketVersion → V3`, `longEvidenceSemanticsVersion`, AES labels version, `MICRO_CONFIRM_OBS_VERSION`, `tradeSchemaVersion` / V8 export schema.

---

## 5. Test plan

1. **Regime matrix** for gate, quality, ATR across `{HARD_DANGER…SUPPORTIVE} × {STRONG_HEADWIND…STRONG_TAILWIND}` with a fixed strong-micro-up sample: tier never exceeds ceiling; quality never exceeds cap; ATR is `UNQUALIFIED_VOLATILITY_DANGER` whenever headwind/hard-danger and `atr ≥ 0.6`.
2. **Failing-row replay** by `id` for the highest pre-fix `PREMIUM`/`STRONG` losers: post-fix tier ≤ `WATCH`; `longMicroConfirmObserved = false` where applicable.
3. **Confidence distribution**: margin ∈ [-40,+40] × family agreement; ≥3 distinct labels; equal coverage + different margin ⇒ different confidence.
4. **Close-reason**: `finalizeLongTrade(t,'SL'|'sl',p)` rollup ⇒ canonical `STOP_LOSS`; no `SL` key in any aggregation.
5. **Finalization refresh**: tick aged 25 s ⇒ refresh attempted, REST price used, `finalPriceAgeMs ≤ 30_000`, no `STALE_FINAL_PRICE`.
6. **Purity guards** still pass: every new field `logOnly`, no execution wiring; `check-long-export-purity.mjs` and `check-long-runtime-purity.mjs` green.
7. **V8 contract intact**: default export still compacted (no rehydrated heavy nested objects), schema version bumped, manifest metadata unchanged.

**Batch-replay acceptance:** `PREMIUM` → 0; `STRONG` in `HARD_DANGER` → 0; `QUALIFIED_VOLATILITY_BOOST` → 0; confidence distinct labels ≥3; `SL` → 0; finalization failures (with refresh) < 3%. Net PnL is unchanged by every wave — these are observation corrections, not trade changes.

---

## 6. Sequencing

| Wave | Fixes | Touches | Why first |
|---|---|---|---|
| 1 | Gate regime, quality consensus, ATR gate | scorers (label output only) | Resolves 3 inversions at once; everything downstream reads truthful tiers |
| 2 | Confidence rebuild, canonical close-reason | scorer + analytics | Clean confidence + correct exit rollups |
| 3.1 | Stale-price pre-finalize refresh | close path (record-only) | Recovers 15% lost sample |
| 3.2 | Micro-confirm observation tag | research snapshot | Feeds next-phase filter design |
| 4 | Exit attribution | export | Post-fix verification |

---

## 7. Explicitly out of scope — next phase

The following are deferred and **must not** be built in this round:

- Any filter, gate, or rule that **blocks, skips, or down-selects** candidates based on regime, micro-confirmation, tier, or confidence.
- Promotion of `longMicroConfirmObserved` (or any observational field) into an arming precondition.
- Consuming `longMarketBreadthWouldBlock` to actually withhold a candidate.
- Position sizing, leverage, or exit-parameter changes.

When the observation phase has produced enough clean batches to justify thresholds, the block-filter design becomes its own spec, built on the now-trustworthy telemetry this spec delivers.
