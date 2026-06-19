# LongLAB June 16 Implementation Specification

## Mission

Modify `LongLAB-main-finished` so the June 16 research findings become first-class, reproducible, **log-only** research features. Add a fast, visually clear Winning Setups view to the Filters area for the strongest gates, labels, buckets, filters, and formal combos, including `LONG_UNIVERSAL_CORE_V1`.

This work must improve research visibility and telemetry correctness without changing candidate selection, simulated entry creation, leverage, sizing, exit profile selection, API cadence, or live execution behavior.

---

## 1. Non-negotiable safety constraints

1. Keep every entry-policy, gate, score, combo, preset, quick view, and shadow verdict **research-only**.
2. Do not block, skip, rank out, resize, delay, accelerate, or alter a trade because a winning setup matches or fails.
3. Preserve and extend:
   - `src/config/entryPolicyLogOnlyConfig.js`
   - `src/safety/assertLongResearchOnly.js`
   - `src/safety/longResearchOnly.integration.test.js`
   - `src/safety/longResearchOnly.endToEnd.test.js`
4. Every new result object must explicitly carry:
   ```js
   logOnly: true
   canAffectExecution: false
   executionApplied: false
   ```
5. The Filters UI may only mutate research filter state. It must never mutate the candidate universe, active sample creation, leverage, position size, exit profile, or close logic.
6. Do not use outcome, MFE, MAE, close reason, profit-lock result, or post-entry Runner Capture fields to define an entry setup.
7. Retain `feeAdjustedNormPnlPct` as the default research metric.
8. Do not rename existing exported fields without migration aliases. Add versioned fields instead.

---

## 2. Evidence to encode

Treat these as reference evidence, not hard-coded live performance claims.

### Broad rich + compact export validation

- Gate score `>= 95`: 293 trades, `+0.6606` average, 60.1% win, positive in 8/8 sessions.
- Gate score `>= 90`: 365 trades, `+0.5290` average, 57.5% win, positive in 8/8 sessions.
- Gate tier `>= STRONG`: 938 rich trades, `+0.2581` average, 50.9% win, positive and almost identical across all three rich intraday windows.
- Gate tier `PREMIUM`: 492 rich trades, `+0.3816` average, 55.1% win.

### Formal combos and stacks

- `LONG_UNIVERSAL_CORE_V1`: 665 trades, `+0.2236` average.
- `LONG_UNIVERSAL_CORE_V1 + narrow micro-up`: 314 trades, `+0.4787`, 58.3% win.
- Gate `PREMIUM` + PF10 `ELITE` + Runner Entry `ELITE`: 399 trades, `+0.4297`, 57.4% win.
- Gate `>= STRONG` + narrow micro-up + zero anti-combos: 583 trades, `+0.4159`, 55.6% win.
- Gate score `>= 90` + RSI momentum expansion + MACD bullish expansion: 114 trades, `+1.1477`, 71.1% win, 6.1% SL, PF 9.17.
- Bull-confirmed VWAP reclaim: 69 trades, `+0.9649`, 65.2% win, positive in all rich sessions.

### Side-specific winners

- Top Gainer Green Reacceleration was profitable; generic Top Gainer Continuation was negative.
- Top Loser Scalp Reversal Candidate was profitable; blind falling-knife buying was negative.

### Anti-combos

- `LONG_RED_CVD_BEAR_ANTI_V1`: 155 trades, approximately `-0.6289`, about 19% win.
- `LONG_FALLING_KNIFE_ANTI_V1`: 93 trades, approximately `-0.5595`, about 22% win.

### Correctness failures

- `absoluteEntryAdaptiveScore` and `absoluteEntryRequiredScore` were null.
- `absoluteEntryWouldPassAdaptive` defaulted false across the book.
- The current flattened defaults convert “not computed” into false.
- `evaluateEntryPolicyLogOnly()` reads `requiredAdaptiveAes`, not the canonical `absoluteEntryRequiredScore`.
- Confidence fields were effectively constant and must not present false certainty.
- `ATR_GE_1(+24)` was negatively associated with outcomes and is overweighted.
- `PROFIT_LOCK` is strongly negative while `TRAIL` is strongly positive. Do not combine them in primary UI analytics.

---

## 3. Current codebase anchors

Use the existing architecture instead of creating parallel filtering logic.

### Canonical research pipeline

- `src/research/buildLongEntryResearchSnapshot.js`
- `src/research/normalizeLongEntryFacts.js`
- `src/research/buildLongShadowDecision.js`
- `src/research/longResearchSchemaVersions.js`

### Gate, scores, combos and buckets

- `src/longGate/longGateAudit.js`
- `src/longGate/sniperLongGateLogOnly.js`
- `src/audits/bestDnaLongAudit.js`
- `src/scoring/longAbsoluteEntryScore/*`
- `src/scoring/longPostFee10/*`
- `src/scoring/longCandidateRunner/*`
- `src/combos/longComboRegistry.js`
- `src/longBuckets/topGainerLongClassifier.js`
- `src/longBuckets/topLoserLongClassifier.js`

### Filters cockpit

- `src/filters/FiltersTab.jsx`
- `src/filters/HighlightTab.jsx`
- `src/filters/longFilterRegistry.js`
- `src/filters/longFilterPresets.js`
- `src/filters/longFilterEngine.js`
- `src/filters/longFilterState.js`
- `src/filters/longFilterAnalytics.js`
- `src/filters/longCompareMode.js`
- `src/filters/components/*`

### Adaptive policy and exports

- `src/entryPolicy/adaptiveAes.js`
- `src/entryPolicy/evaluateEntryPolicyLogOnly.js`
- `src/entryPolicy/entryPolicy.flatten.js`
- `src/export/longTradeExportSchema.js`
- `src/export/longTradeExport.js`
- `src/filters/longFilterSnapshot.js`

### Exit engine

- `src/app/LongLabApp.jsx`
- `src/fees/feeSafeProfitLock.js`
- `src/fees/feeAccounting.js`
- `src/liveExitAudit/*`
- `src/exitProfiles/dynamicExitProfiles.js`

---

## 4. Add canonical derived entry fields

### 4.1 Narrow micro-up confirmation

The winning micro signal is narrower than the existing `hasLongMicroMomentum`. The current gate includes RSI rollover in `hasLongMicroMomentum`, but the profitable stack was driven by actual upward microstructure.

Add to `src/longGate/longGateAudit.js`:

```js
const longMicroUpConfirmation =
  s.last3TicksDirection === "UP" ||
  s.immediateGreenImpulse === true ||
  [
    "MICRO_GREEN_MULTI_CONFIRM",
    "MICRO_GREEN_IMPULSE",
    "MICRO_TICKS_UP",
  ].includes(s.longMicroMomentumLabel);

const longMicroUpConfirmationReasons = [
  s.last3TicksDirection === "UP" ? "LAST_3_TICKS_UP" : null,
  s.immediateGreenImpulse === true ? "IMMEDIATE_GREEN_IMPULSE" : null,
  ["MICRO_GREEN_MULTI_CONFIRM", "MICRO_GREEN_IMPULSE", "MICRO_TICKS_UP"]
    .includes(s.longMicroMomentumLabel)
    ? s.longMicroMomentumLabel
    : null,
].filter(Boolean);
```

Return and flatten:

```text
longMicroUpConfirmation
longMicroUpConfirmationReasons
longMicroUpConfirmationSourceCount
```

Do not define this field from RSI alone.

### 4.2 RSI momentum expansion

`rsiLongSetupLabel` is a pipe-separated label string. Add a canonical boolean during fact normalization:

```js
rsiLongMomentumExpansion =
  String(rsiLongSetupLabel ?? "")
    .split("|")
    .includes("RSI_LONG_MOMENTUM_EXPANSION");
```

Add:

```text
rsiLongMomentumExpansion
rsiLongMomentumExpansionSource = "RSI_LONG_SETUP_LABEL"
```

### 4.3 MACD bullish expansion

Normalize a single canonical boolean:

```text
macdBullishExpansion
```

It should be true when any canonical long-native MACD condition confirms positive expansion, for example:

```js
macdHistogramState1m in [
  "POSITIVE_EXPANDING",
  "BULLISH_EXPANDING",
]
OR
macdHistogram1m > 0 && macdHistogramDelta1m > 0
```

Do not read the old short-oriented `absoluteEntryScore` polarity for this field.

### 4.4 Gate research band

Do not mutate the historical meaning of `longGateTier`. Keep its existing thresholds.

Add a more granular V2 research band:

```text
longGateResearchBandV2
```

```js
score >= 95 ? "GATE_ELITE_95" :
score >= 90 ? "GATE_PREMIUM_90" :
score >= 85 ? "GATE_PREMIUM_85" :
score >= 75 ? "GATE_STRONG_75" :
score >= 60 ? "GATE_WATCH_60" :
              "GATE_RESEARCH_REJECT";
```

Export both the old tier and the new band.

### 4.5 Top-loser thesis lane

The profitable `TOP_LOSER_SCALP_REVERSAL_CANDIDATE` currently originates from `topLoserLongThesisLane` in `longGateAudit.js`, but it is not a first-class filter in the registry.

Add and flatten:

```text
topLoserLongThesisLane
```

Ensure its enum includes:

```text
TOP_LOSER_SCALP_REVERSAL_CANDIDATE
```

---

## 5. Extend the filter registry

Modify `src/filters/longFilterRegistry.js`.

### Add these filters

```text
LONG_GATE_TIER
LONG_GATE_RESEARCH_BAND_V2
LONG_MICRO_UP_CONFIRMATION
LONG_MICRO_UP_CONFIRMATION_REASONS
RSI_LONG_MOMENTUM_EXPANSION
MACD_BULLISH_EXPANSION
TOP_LOSER_THESIS_LANE
```

Recommended definitions:

```js
{
  id: "LONG_GATE_TIER",
  field: "longGateTier",
  fieldType: FIELD_TYPE.ENUM,
  enumValues: ["PREMIUM", "STRONG", "WATCH", "RESEARCH_REJECT", "INSUFFICIENT_DATA"],
  family: FILTER_FAMILY.UNIVERSAL_GATE,
  timing: FILTER_TIMING.ENTRY_FINAL,
  entryPredictive: true,
  executionSafe: false,
}
```

```js
{
  id: "LONG_MICRO_UP_CONFIRMATION",
  field: "longMicroUpConfirmation",
  fieldType: FIELD_TYPE.BOOLEAN,
  family: FILTER_FAMILY.MICRO_MOMENTUM,
  timing: FILTER_TIMING.ENTRY_FINAL,
  polarity: "POSITIVE",
  entryPredictive: true,
  executionSafe: false,
}
```

```js
{
  id: "RSI_LONG_MOMENTUM_EXPANSION",
  field: "rsiLongMomentumExpansion",
  fieldType: FIELD_TYPE.BOOLEAN,
  family: FILTER_FAMILY.MICRO_MOMENTUM,
  timing: FILTER_TIMING.ENTRY_FINAL,
  polarity: "POSITIVE",
  entryPredictive: true,
  executionSafe: false,
}
```

```js
{
  id: "MACD_BULLISH_EXPANSION",
  field: "macdBullishExpansion",
  fieldType: FIELD_TYPE.BOOLEAN,
  family: FILTER_FAMILY.MICRO_MOMENTUM,
  timing: FILTER_TIMING.ENTRY_FINAL,
  polarity: "POSITIVE",
  entryPredictive: true,
  executionSafe: false,
}
```

Update `LONG_GATE_SCORE.presets` from:

```js
[40, 55, 65, 75]
```

to:

```js
[60, 75, 85, 90, 95]
```

Do not remove the old lower thresholds from historical saved views. Deserialization must continue to accept them.

### Registry cleanup

While editing, remove duplicate object keys already present in the file, including repeated `version` and `fieldType` declarations. Add a registry integrity test that fails when one object literal is generated with duplicate semantic IDs or duplicate registry IDs.

---

## 6. Expand the formal combo registry

Modify `src/combos/longComboRegistry.js`.

Keep all existing combos and add the following. Increment the registry version to `long-combo-v2` while preserving each V1 combo ID unchanged.

### 6.1 Core plus narrow micro-up

```text
LONG_UNIVERSAL_CORE_MICRO_UP_V1
```

```js
matched =
  longCombosPositiveMatched.includes("LONG_UNIVERSAL_CORE_V1") &&
  longMicroUpConfirmation === true;
```

Because combos are calculated in one pass, do not rely on the current combo output array while calculating another combo. Extract the Universal Core predicate into a reusable pure helper and call it from both combo definitions.

### 6.2 Gate, RSI and MACD expansion

```text
LONG_GATE_RSI_MACD_EXPANSION_V1
```

```js
matched =
  longGateScore >= 90 &&
  rsiLongMomentumExpansion === true &&
  macdBullishExpansion === true;
```

### 6.3 Premium triple

```text
LONG_PREMIUM_PF10_RUNNER_V1
```

```js
matched =
  longGateTier === "PREMIUM" &&
  longPostFee10EntryTier === "LONG_PF10_ELITE" &&
  longCandidateRunnerTierAtEntry === "LONG_RUNNER_ELITE";
```

Use the actual constants from:

- `src/scoring/longPostFee10/longPostFee10.constants.js`
- `src/scoring/longCandidateRunner/longCandidateRunner.constants.js`

Do not hard-code guessed enum strings if constants differ.

### 6.4 Gate Strong, micro-up, no anti

```text
LONG_GATE_STRONG_MICRO_UP_CLEAN_V1
```

```js
matched =
  ["PREMIUM", "STRONG"].includes(longGateTier) &&
  longMicroUpConfirmation === true &&
  no anti-combo condition matches;
```

Evaluate this after anti-combo helper predicates are available, or derive anti booleans from reusable helpers. Do not create circular dependency on `longCombosAntiMatched`.

### 6.5 Bull-confirmed VWAP reclaim

```text
LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1
```

```js
matched =
  ["VWAP_RECLAIM_CONFIRMED", "VWAP_RECLAIM_ATTEMPT_WITH_BULL"]
    .includes(vwapLongContextLabel) &&
  longMicroUpConfirmation === true &&
  ["BULL", "NEUT"].includes(entryCvdLabel) &&
  immediateRedImpulse !== true;
```

### 6.6 Gainer green reacceleration

```text
LONG_GAINER_GREEN_REACCELERATION_V1
```

```js
matched =
  longParentBucket === "TOP_GAINER_LONGS" &&
  topGainerLongSubBucket === "TOP_GAINER_GREEN_REACCELERATION_LONG" &&
  longMicroUpConfirmation === true &&
  immediateRedImpulse !== true;
```

### 6.7 Loser scalp reversal confirmation

```text
LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1
```

```js
matched =
  longParentBucket === "TOP_LOSER_LONGS" &&
  topLoserLongThesisLane === "TOP_LOSER_SCALP_REVERSAL_CANDIDATE" &&
  macdBullishExpansion === true &&
  entryCvdLabel !== "BEAR" &&
  immediateRedImpulse !== true;
```

### Combo output requirements

Every combo detail must include:

```text
comboId
comboVersion
comboTiming
comboDirection
label
matched
reasons
missingConditions
logOnly
canAffectExecution
executionApplied
```

Update the enum values for `LONG_COMBOS_POSITIVE_MATCHED` in `longFilterRegistry.js`.

---

## 7. Add a curated Winning Setups catalog

Create:

```text
src/filters/longWinningSetups.js
```

This catalog must be separate from `longHighlightEngine.js`.

- **Highlights** remain automatic, in-sample discovery.
- **Winning Setups** are manually curated, versioned research hypotheses based on reviewed batches.

### Catalog shape

```js
export const LONG_WINNING_SETUP_CATALOG_VERSION = "LONG_WINNING_SETUPS_V1";

export const LONG_WINNING_SETUPS = [
  {
    id: "GATE_ELITE_95",
    title: "Gate Elite 95+",
    family: "GATES",
    scope: LONG_SCOPE.ALL_LONGS,
    status: "PRIORITY_SHADOW_CANDIDATE",
    description: "Highest-expectancy broad Gate cohort in the June 16 batch.",
    predicates: [
      { filterId: "LONG_GATE_SCORE", operator: OPERATOR.GTE, value: 95 },
    ],
    referenceEvidence: {
      corpus: "JUNE_16_BROAD_5778",
      n: 293,
      avgFeeAdjustedNormPnlPct: 0.6606,
      winRatePct: 60.1,
      positiveSessions: 8,
      sessionCount: 8,
    },
    researchOnly: true,
    executionEffect: false,
  },
];
```

### Required curated views

#### Gates

1. Gate Elite 95+
2. Gate Premium 90+
3. Gate Tier PREMIUM
4. Gate Tier PREMIUM or STRONG

#### Universal filters and combos

5. Universal Core, exact formal combo:
   ```text
   LONG_COMBOS_POSITIVE_MATCHED includes LONG_UNIVERSAL_CORE_V1
   ```
6. Universal Core + Micro-Up
7. Gate 90 + RSI Momentum Expansion + MACD Bullish Expansion
8. Gate >= STRONG + Micro-Up + Zero Anti-Combos
9. Premium + PF10 Elite + Runner Elite
10. Bull-Confirmed VWAP Reclaim
11. Last 3 Ticks UP + RSI Momentum Expansion

#### Top Gainer views

12. Gainer Green Reacceleration bucket
13. Gainer Gate 90 + Last3 UP + RSI Expansion
14. Gainer Gate 90 + MACD Expansion + CVD BULL

#### Top Loser views

15. Loser Scalp Reversal Candidate
16. Loser Gate 90 + MACD Expansion + CVD Not Bear
17. Loser Immediate Green + RSI Momentum Expansion

#### Anti-pattern controls

18. Red + CVD Bear anti-combo
19. Falling Knife anti-combo
20. Immediate Red Impulse
21. Gate Research Reject
22. Top Gainer Overextended, No Pullback

#### Exit diagnostics

23. PROFIT_LOCK exits only
24. PROFIT_LOCK below floor
25. TRAIL exits only
26. TIMEOUT exits only

Exit views are outcome diagnostics and must be visually separated from entry setups.

### Important Universal Core distinction

The current preset `PRESET_UNIVERSAL_LONG_CORE` is not identical to the formal combo. It adds Long Gate pass and `HAS_RED_DANGER = false`.

Do not silently call both of them “Universal Core.” Use these names:

- `Universal Core (Formal V1)` for exact combo matching.
- `Gate + Universal Core` for the stricter preset.

---

## 8. Add the Winning Setups quick view to Filters

### 8.1 New component

Create:

```text
src/filters/components/WinningSetupsPanel.jsx
```

Optional supporting component:

```text
src/filters/components/WinningSetupCard.jsx
```

### 8.2 Add a new inner tab

Modify `INNER_TABS` in `src/filters/FiltersTab.jsx`:

```js
{ id: "winningSetups", label: "★ Winning Setups" }
```

Place it before `Highlights`.

Set the default inner tab to:

```js
useState("winningSetups")
```

The user should land on the curated source-of-truth view, while automatic Highlights remains one click away.

### 8.3 Add a persistent quick strip

Directly below `BucketScopePills` and above the existing `FilterBar`, add a compact horizontal strip named:

```text
WINNING QUICK VIEW
```

Show these first-line pills:

```text
Gate 95+
Gate 90+
Gate Premium
Gate >= Strong
Universal Core
Core + Micro Up
Premium Triple
Bull VWAP Reclaim
Gainer Reaccel
Loser Scalp Reversal
No Anti
```

The strip must:

- Wrap on small screens.
- Show active state.
- Display the current matched trade count inside the pill when inexpensive, for example `Gate 95+ · 18`.
- Use the real registry engine for counts.
- Have a `More` button that jumps to the Winning Setups tab.
- Have a `Clear Winning View` button that removes only the curated winning-view group, not all advanced filters.

### 8.4 Winning setup cards

Group cards under:

1. Priority Gates
2. Universal Winners
3. Top Gainer Winners
4. Top Loser Winners
5. Toxic Controls
6. Exit Diagnostics

Each card must show:

```text
Title
Status badge
Logic summary
Current corpus n
Average fee-adjusted normalized PnL
Win rate
SL rate
Profit factor
Positive sessions / total sessions
Top Gainer n and average
Top Loser n and average
Data coverage
Reference evidence badge
Research-only badge
```

Reference evidence and current-corpus stats must be visually distinct:

- `REFERENCE: June 16 reviewed batch`
- `CURRENT: currently loaded app trades`

Never present old reference metrics as if they are current live results.

### 8.5 Card actions

Each card must offer:

- `VIEW TRADES`: replace the active curated-view group, preserve advanced user groups, and jump to Trades.
- `ADD`: append the setup as a new `ALL_OF` group.
- `COMPARE`: send the setup state to the existing comparison tools in `CockpitToolsPanel`.
- `EXPLAIN`: open `ExplainMatchDrawer` with matched reasons, missing conditions, coverage and field values.

Do not make a single ambiguous `Apply` button that silently combines unrelated filters.

### 8.6 Filter state identity

Use a stable group ID:

```text
winning-view
```

Do not generate a fresh timestamp group every time the user switches quick views. Replace only that group when `VIEW TRADES` is used.

For `ADD`, create a separate timestamped group.

Persist the selected winning view in saved state and URL state:

```text
activeWinningSetupId
```

Update `serializeFilterStateToURL()` and `deserializeFilterStateFromURL()` without breaking old URLs.

---

## 9. Improve presets

Modify `src/filters/longFilterPresets.js`.

Add:

```text
PRESET_UNIVERSAL_CORE_FORMAL
PRESET_UNIVERSAL_CORE_MICRO_UP
PRESET_GATE_STRONG_MICRO_UP_CLEAN
PRESET_GATE_90_RSI_MACD
PRESET_PREMIUM_PF10_RUNNER
PRESET_BULL_CONFIRMED_VWAP_RECLAIM
PRESET_GAINER_GREEN_REACCELERATION
PRESET_LOSER_SCALP_REVERSAL
PRESET_RED_CVD_BEAR_FORENSICS
```

Rename only display labels, not existing IDs:

```text
PRESET_UNIVERSAL_LONG_CORE label -> Gate + Universal Core
```

Its predicate behavior should stay backward compatible.

Do not keep the current Top Gainer Continuation presets visually promoted as winners. Move them into a `Research / Unstable` presentation group because generic continuation was negative in this batch.

---

## 10. Wire adaptive AES and entry policy correctly

### Current problem

`src/entryPolicy/adaptiveAes.js` works in isolation, but `buildLongEntryResearchSnapshot.js` does not call it. The flattened defaults then turn missing computation into `false`.

### Required pipeline change

Modify `src/research/buildLongEntryResearchSnapshot.js`.

After Long AES and normalized market context are available, calculate adaptive AES using the **Long-native AES score**:

```js
const adaptiveAes = computeAdaptiveAes({
  baseAes: workingTrade.longAesScore,
  side: workingTrade.longParentBucket === "TOP_LOSER_LONGS"
    ? "LOSER"
    : workingTrade.longParentBucket === "TOP_GAINER_LONGS"
      ? "GAINER"
      : "UNKNOWN",
  marketContext: normalizedMarketContext,
  sessionHealth: sessionContext?.sessionHealth ?? null,
});
```

Then merge `flattenAdaptiveAes(adaptiveAes)` into `workingTrade`.

After Sniper and combos are available, call:

```js
const entryPolicy = evaluateEntryPolicyLogOnly({
  ...workingTrade,
  requiredAdaptiveAes: adaptiveAes?.absoluteEntryRequiredScore,
});
```

Merge `flattenEntryPolicy(entryPolicy)`.

### Fix the policy reader

In `src/entryPolicy/evaluateEntryPolicyLogOnly.js`, replace:

```js
const requiredAes = Number(candidate.requiredAdaptiveAes ?? 73);
```

with:

```js
const requiredAes = Number(
  candidate.absoluteEntryRequiredScore ??
  candidate.requiredAdaptiveAes ??
  73
);
```

### Tri-state defaults

In `src/entryPolicy/entryPolicy.flatten.js`, change missing computation defaults:

```text
absoluteEntryWouldPassAdaptive: null
entryPolicyWouldAllow: null
entryPolicyWouldBlock: null
```

Missing is not failure.

Add:

```text
absoluteEntryAdaptiveStatus = PASS | FAIL | INCOMPLETE
entryPolicyEvaluationStatus = COMPLETE | INCOMPLETE
```

### Canonical long aliases

To reduce confusing short-era naming, add aliases while retaining old fields:

```text
longAdaptiveAesBaseScore
longAdaptiveAesScore
longAdaptiveAesRequiredScore
longAdaptiveAesGap
longAdaptiveAesWouldPass
```

Both old and new names must hold identical values until a later migration removes the aliases.

---

## 11. Stop false confidence presentation

The current Long AES scorer can calculate a confidence value, but the reviewed exports showed it behaving as effectively constant.

Do not simply delete the fields. Add calibration diagnostics.

### Add fields

```text
longAesConfidenceIsInformative
longAesConfidenceDistinctValueCountAtRun
longAesConfidenceCalibrationStatus
```

At trade level:

```text
longAesConfidenceCalibrationStatus = UNCALIBRATED
```

In the UI:

- Do not use bright “VERY HIGH CONFIDENCE” styling while calibration status is not `CALIBRATED`.
- Show `Uncalibrated confidence` or hide the label.
- Never use confidence for quick-view matching, sorting or sizing in this change.

Add run-level diagnostics that flag a field when more than 95% of records share one value.

---

## 12. Rebuild Best DNA as V2 shadow, do not overwrite V1

Modify `src/audits/bestDnaLongAudit.js` only to preserve V1 behavior and create a V2 scorer beside it, or create:

```text
src/audits/bestDnaLongAuditV2.js
```

### Required V2 principles

1. `ATR_GE_1` must not receive a standalone +24 directional reward.
2. ATR should act as a conditional amplifier only when strict directional evidence exists.
3. `CONTROLLED_ATR` must not score if it is effectively constant.
4. `SUPPORTIVE_MARKET_CONTEXT` must not receive an unconditional positive reward.
5. Increase relative importance of:
   - `LAST_3_TICKS_UP`
   - `IMMEDIATE_GREEN_IMPULSE`
   - `MACD_BULLISH_ROLLOVER` / expansion
   - `RSI_LONG_MOMENTUM_EXPANSION`
   - `CVD_BULL` or `CVD_NEUT`
   - Gate `PREMIUM` / score >= 90
6. Preserve strong penalties for:
   - immediate red
   - CVD bear
   - no green confirmation
   - falling knife
   - wide spread
   - seller acceleration below VWAP

Suggested V2 ATR behavior:

```js
if (atr >= 1.0 && strictDirectionalConfirmation) {
  score += 4; // small amplifier, not primary evidence
} else if (atr >= 1.0 && !strictDirectionalConfirmation) {
  score -= 8;
}
```

Do not adopt those exact numbers blindly. Put weights in a versioned config and export all contributions for later calibration.

Export V1 and V2 side-by-side:

```text
bestDnaLongScore
bestDnaLongTier
bestDnaLongScoreV2Shadow
bestDnaLongTierV2Shadow
bestDnaLongV2PositiveGenes
bestDnaLongV2PenaltyGenes
```

No V2 score may affect execution.

---

## 13. Add AES V2 shadow focused on Flow Momentum

Do not mutate `LONG_AES_V1` in place.

Create a shadow V2 or alternative score that visibly reweights the components because Flow Momentum had substantially stronger IC than the composite.

Export:

```text
longAesScoreV2Shadow
longAesTierV2Shadow
longAesV2ComponentWeights
longAesV2PositiveContributions
longAesV2NegativeContributions
longAesV2DeltaVsV1
```

The Filters Winning Setups view should show V1 and V2 as diagnostics, but no curated setup should depend on V2 until a later independent batch validates it.

---

## 14. Repair Profit Lock telemetry and UI separation

### 14.1 Never combine Lock and Trail in primary analytics

In `src/filters/FiltersTab.jsx`, replace the existing combined quick field:

```text
showOnlyProfitLockOrTrail
```

with independent fields:

```text
showOnlyProfitLock
showOnlyTrail
showOnlyTimeout
showOnlyProfitLockBelowFloor
```

Update:

- `QUICK_FILTER_DEFAULTS`
- `quickFiltersToPredicates()`
- `quickPredicatesToFilters()`
- `removeQuickPredicate()`
- `FilterBar`
- saved/URL state tests

### 14.2 Detect floor crossing, not only sampled price below floor

In `src/app/LongLabApp.jsx`, the current close check uses:

```js
cp <= lockPrice
```

Add previous-price crossing diagnostics:

```js
const previousObservedPrice = hist.length >= 2 ? hist[hist.length - 2].price : null;
const profitLockCrossDetected =
  lockActive &&
  lockPrice != null &&
  previousObservedPrice != null &&
  previousObservedPrice > lockPrice &&
  cp <= lockPrice;
```

Record:

```text
profitLockCrossDetected
profitLockCrossDetectedAt
profitLockCrossFromPrice
profitLockCrossToPrice
profitLockDetectionLatencyMs
profitLockTriggerPrice
profitLockObservedFillPrice
profitLockSlippagePricePct
profitLockSlippageMarginPct
profitLockFloorEnforcementAttempted
profitLockFloorEnforcementSucceeded
```

Do not fake a fill at the lock floor. Preserve the observed fill and separately quantify the miss.

### 14.3 Make `floorExitEnforced` truthful

It is currently hard-coded false. Define it from actual flow:

```text
true  = the close path was triggered by a detected floor crossing
false = close occurred later or through another exit
null  = no active floor or telemetry incomplete
```

### 14.4 Add lock-to-trail shadow recommendation

Use current entry-quality and live Runner Capture signals to log, not execute:

```text
LOCK_HOLD
LOCK_TIGHTEN
SWITCH_TO_TRAIL
FAST_HARVEST
EMERGENCY_EXIT
```

Add a `profitLockRecommendedActionLogOnly` field and reasons. It must not change close behavior in this task unless the existing simulator already uses the same rule and tests explicitly cover it.

### 14.5 Exit Health UI

Show separate cards for:

- PROFIT_LOCK
- TRAIL
- TIMEOUT
- AUTO_END
- SL

Each card must display n, average fee-adjusted normalized PnL, win rate, PF, below-floor count and MFE giveback count where relevant.

---

## 15. Export and snapshot changes

Modify:

- `src/export/longTradeExportSchema.js`
- `src/filters/longFilterSnapshot.js`
- `src/research/buildLongEntryResearchSnapshot.js`

Export all new entry-time fields:

```text
longGateResearchBandV2
longMicroUpConfirmation
longMicroUpConfirmationReasons
longMicroUpConfirmationSourceCount
rsiLongMomentumExpansion
macdBullishExpansion
topLoserLongThesisLane
longAdaptiveAesBaseScore
longAdaptiveAesScore
longAdaptiveAesRequiredScore
longAdaptiveAesGap
longAdaptiveAesWouldPass
absoluteEntryAdaptiveStatus
entryPolicyEvaluationStatus
activeWinningSetupIds
longWinningSetupCatalogVersion
bestDnaLongScoreV2Shadow
bestDnaLongTierV2Shadow
longAesScoreV2Shadow
```

Export new exit fields separately as exit/live fields, not entry snapshot fields.

Because `longFilterSnapshot.js` derives entry fields from the registry, new entry-predictive registry fields should automatically enter the compact snapshot. Add an explicit test proving that they are present and not null when source telemetry exists.

### Version increments

Update only in `src/research/longResearchSchemaVersions.js`:

```text
LONG_ENTRY_RESEARCH_V5
LONG_FILTER_SNAPSHOT_V5
LONG_TRADE_EXPORT_V5
```

Update:

```text
LONG_FILTER_REGISTRY_VERSION -> long-filter-registry-v2
LONG_FILTER_SYSTEM_VERSION -> long-filter-v2
LONG_WINNING_SETUP_CATALOG_VERSION -> LONG_WINNING_SETUPS_V1
```

Add migration support in `src/migrations/migrateLongTradeRecord.js` for V4 records. Missing V5 fields must become null/unknown, not false.

---

## 16. Analytics helpers for the Winning Setups panel

Create or reuse a single analytics function. Prefer adding to `src/filters/longFilterAnalytics.js` rather than duplicating logic inside JSX.

Required output:

```js
{
  tradeCount,
  metricCount,
  total,
  avg,
  median,
  winRatePct,
  slRatePct,
  profitFactor,
  positiveSessionCount,
  negativeSessionCount,
  sessionCount,
  positiveRunCount,
  runCount,
  topGainer: { ... },
  topLoser: { ... },
  dataCoveragePct,
}
```

Use `applyLongFilterState()` for matching. Do not implement setup-specific `.filter()` chains in the UI.

Cache results with `useMemo()` by `closedSamples`, catalog version and setup ID.

---

## 17. Visual and UX requirements

1. Preserve the current dark cockpit design tokens from `src/ui/tokens.js`.
2. Do not introduce a second design system.
3. Use concise badges:
   - `PRIORITY SHADOW`
   - `CROSS-BATCH`
   - `WATCH`
   - `TOXIC CONTROL`
   - `OUTCOME ONLY`
4. Add a visible banner:
   ```text
   RESEARCH ONLY · FILTERS DO NOT AFFECT EXECUTION
   ```
5. Show data-quality badges when compact or incomplete exports lack inputs.
6. A card with insufficient source fields must show `UNAVAILABLE`, not zero matches.
7. On mobile/narrow width:
   - Cards become one column.
   - Quick strip wraps.
   - Logic chips truncate with tooltip.
8. Avoid showing more than six metrics on the first card row. Put detailed side/session breakdowns in an expandable section.
9. Preserve `ExplainMatchDrawer` for exact trade-level inspection.
10. Add tooltips explaining the difference between:
    - Gate Pass
    - Gate Tier
    - Gate Score 90/95
    - Formal Universal Core
    - Gate + Universal Core preset

---

## 18. Tests

### 18.1 Derived signals

Add tests proving:

- RSI-only rollover does not set `longMicroUpConfirmation`.
- Last3 UP sets it.
- Immediate green sets it.
- Red impulse does not set it.
- `rsiLongMomentumExpansion` parses pipe-separated labels correctly.
- MACD expansion is long-native and correctly signed.

### 18.2 Combo tests

Extend combo tests for every new combo:

- exact positive match
- one missing condition
- wrong bucket
- CVD bear rejection
- immediate red rejection
- reasons and missing conditions
- log-only invariants

### 18.3 Registry and preset tests

Prove:

- every Winning Setup predicate references a real registry ID
- all enum values exist in the registry
- no outcome field appears in an entry setup
- all curated setup states evaluate through `applyLongFilterState()`
- Universal Core formal view is different from Gate + Universal Core
- saved views round-trip through URL serialization

### 18.4 Adaptive AES tests

Prove:

- the canonical pipeline populates adaptive score, required score, gap and pass/fail
- missing inputs produce `INCOMPLETE`, not false
- `evaluateEntryPolicyLogOnly()` uses `absoluteEntryRequiredScore`
- no policy output changes execution fields

### 18.5 Export tests

Extend `buildLongEntryResearchSnapshot.integration.test.js` and export schema tests:

- unique headers
- V5 fields present
- arrays serialize correctly
- compact snapshot includes new entry-predictive fields
- V4 migration gives nulls rather than false defaults

### 18.6 UI logic tests

Extend `src/filters/cockpitUiLogic.test.js`:

- selecting a quick winning view replaces only `winning-view`
- ADD appends a new group
- clearing winning view preserves advanced filters
- Profit Lock and Trail filters remain separate
- active count is correct
- incomplete setup displays unavailable

### 18.7 Profit Lock tests

Add tests for:

- previous price above floor, current price below floor = crossing detected
- current price already below floor at activation does not create a fake clean fill
- observed fill remains actual price
- miss amount and latency are exported
- Trail remains a separate close reason
- `floorExitEnforced` is not hard-coded

### Required final commands

```bash
npm run check:all-source-syntax
npm run build
npm run test:unit
npm run test:long-purity
npm run check:long-filter-purity
npm run check:long-export-purity
npm run test:long-research-cockpit
npm run test:ci
```

Do not report completion if any command fails.

---

## 19. Implementation order

### Phase P0: correctness

1. Wire adaptive AES into the canonical research pipeline.
2. Fix tri-state defaults.
3. Normalize micro-up, RSI expansion and MACD expansion.
4. Export the fields and increment schema versions.
5. Split Profit Lock and Trail filters and analytics.
6. Add truthful lock-floor-cross diagnostics.

### Phase P1: winning research layer

7. Extend the registry.
8. Add new formal combos.
9. Add curated Winning Setup catalog.
10. Add presets.
11. Add Winning Quick View strip and Winning Setups tab.
12. Add dynamic current-corpus analytics and Compare/Explain actions.

### Phase P2: score research

13. Add Best DNA V2 shadow.
14. Add Flow-weighted AES V2 shadow.
15. Add confidence informativeness diagnostics.

### Phase P3: validation

16. Run all tests.
17. Run a fresh autorun export.
18. Confirm V5 fields populate.
19. Confirm no execution flags changed.
20. Compare V1 versus V2 score ladders and new setup cohorts.

---

## 20. Definition of done

The work is complete only when:

1. The Filters area opens on `★ Winning Setups`.
2. A persistent `WINNING QUICK VIEW` strip is visible.
3. Universal Core appears as an exact formal combo view.
4. Gate 95, Gate 90, Premium, Strong+, Core + Micro-Up, Premium Triple, bull VWAP reclaim, gainer reacceleration and loser scalp reversal are one-click views.
5. Every view uses the registry engine.
6. Each card shows current-corpus metrics and separately labelled reference evidence.
7. Anti-combos and outcome diagnostics are visually distinct from winners.
8. Profit Lock and Trail are never merged in primary stats.
9. Adaptive AES fields are populated or explicitly incomplete.
10. Missing telemetry never defaults to a fake failure.
11. V5 exports contain all new fields.
12. V4 migration remains readable.
13. All research-only assertions pass.
14. No new code can affect execution.
15. All required tests and build commands pass.

---

## 21. Final implementation report required from the coding bot

The coding bot must return:

1. Files created.
2. Files modified.
3. Exact new filter IDs.
4. Exact new combo IDs.
5. Exact new exported fields.
6. Screenshots or a precise UI description of the Winning Setups tab and quick strip.
7. Test command results.
8. Any incomplete item.
9. Confirmation that execution remains unaffected.
10. A short migration note for V4 exports and saved views.
