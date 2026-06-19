# LongLAB Migration Report
**Date**: 2026-06-14
**Status**: COMPLETE

---

## Summary

Full semantic transformation of LongLAB from ShortLAB mechanics into a native LONG research application. All simulated trades are LONG. All PnL math is direction-correct for longs. All storage keys use `longlab:v1:*`. App remains LOG_ONLY research — no exchange orders placed.

---

## Test Delta

| | Baseline | Final |
|---|---|---|
| Test files | 42 | 54 |
| Tests | 931 | 1,128 |
| Status | All pass | All pass |

---

## Build Output

```
built in ~3s
index.html:     0.49 kB (gzip: 0.29 kB)
react-vendor:   deferred manual chunk
longScoring:    standalone, not yet wired to monolith
discovery:      1.43 kB (gzip: 0.79 kB)
charts:       549.08 kB (gzip: 156.50 kB)
index:        779.27 kB (gzip: 161.51 kB)
```

---

## New Files Created

### Phase 1 — Domain Math
- `src/domain/longTradeMath.js` — LONG PnL math (28 tests)
- `src/storage/storageKeys.js` — `longlab:v1:*` namespace constants
- `src/app/longLab.constants.js` — LONG_LAB identity constants

### Phase 2 — Classification and Gating
- `src/longBuckets/topLoserLongClassifier.js` + test
- `src/longBuckets/topGainerLongClassifier.js` + test
- `src/longBuckets/longBucketClassifier.js` + test
- `src/longGate/longGateAudit.js` + test (all signal polarities inverted)
- `src/longGate/sniperLongGateLogOnly.js` + test
- `src/longAudits/shortPressureDangerLogOnly.js` + test
- `src/longAudits/topLoserReversalAudit.js` + test
- `src/longAudits/topGainerContinuationAudit.js` + test
- `src/vwapFlip/vwapFlipState.js` + `vwapFlipTracker.js` + tests
- `src/funding/fundingTelemetry.js` + `fundingLabels.js` + tests

### Phase 4 — Scoring
- `src/scoring/longAbsoluteEntryScore/` (6 files) — Long AES v1 (15 tests)
- `src/audits/bestDnaLongAudit.js` + test (19 tests, all polarities inverted)

### Phase 5 — Monolith Surgery
- `src/app/LongLabApp.jsx` — Full transformation of short-losers-tracker.jsx
- `src/main.jsx` — Storage migration bridge + import update

### Phase 6 — Supporting Files
- `src/combos/longComboRegistry.js` — 6 positive + 2 anti combos

---

## Key Field Migration Map

| Old (ShortLAB) | New (LongLAB) |
|---|---|
| shortParentBucket | longParentBucket |
| shortSubBucket | longSubBucket |
| shortGateWouldPass | longGateWouldPass |
| shortGateAuditLabel | longGateAuditLabel |
| shortGateScore | longGateScore |
| TOP_LOSER_SHORTS | TOP_LOSER_LONGS |
| TOP_GAINER_SHORTS | TOP_GAINER_LONGS |
| sl_v3:samples | longlab:v1:samples |
| sl_v3:watchlist | longlab:v1:watchlist |
| sl_v3:run | longlab:v1:run |
| sl_v3:holdMs | longlab:v1:holdMs |
| shortlab_*.csv | longlab_*.csv |
| CVD BEAR = good | CVD BULL = good |
| Green impulse = danger | Green impulse = positive |
| BTC UP = danger | BTC UP = tailwind |
| MFE = downside | MFE = upside |
| MAE = upside | MAE = downside |
| SL: price rises above entry | SL: price falls below entry |
| TP: price falls below entry | TP: price rises above entry |
| Lock price below entry | Lock price above entry |
| Trail: follows min price | Trail: follows max price |

---

## PnL Math Inversion

| Operation | Short (old) | Long (new) |
|---|---|---|
| Favorable direction | Price down | Price up |
| MFE | max(mfe, priceDn) | max(mfe, priceUp) |
| MAE | max(mae, priceUp) | max(mae, priceDn) |
| TP trigger | priceDn >= TP_PCT | priceUp >= TP_PCT |
| SL trigger | priceUp >= SL_PCT | priceDn >= SL_PCT |
| Trail activation | priceDn >= TP_PCT | priceUp >= TP_PCT |
| Trail peak | min(trailPeak, cp) | max(trailPeak, cp) |
| Trail exit | cp > trailPeak * (1 + trail%) | cp < trailPeak * (1 - trail%) |
| Lock price | entry * (1 - lock%/lev/100) | entry * (1 + lock%/lev/100) |
| Lock exit | cp >= lockPrice | cp <= lockPrice |
| Profit favor | (entry - cp) / entry | (cp - entry) / entry |

---

## Safety Rules Verified

- entryPolicyExecutionApplied: false hardcoded in all policy outputs
- No candidate creation function checks longEntryPolicyWouldBlock
- No authenticated Binance endpoints called
- realOrderPlacementEnabled: false on every trade
- All block/allow decisions are observational fields only
- Storage namespace: longlab:v1:* for all new writes
- Legacy sl_v3:* keys preserved and never deleted
- Zero sl_v3: write calls in active src/
- Zero shadowLong references in LongLabApp.jsx

---

## Preserved Modules (Used by aesDiscovery)

These keep shortParentBucket semantics because aesDiscovery scans both sides per spec:
- src/shortBucket/shortBucketClassifier.js
- src/shortGate/shortGateAudit.js
- src/audits/bestDnaAudit.js
- src/scoring/absoluteEntryScore/
- src/shadowLong/ (discovery shadow engine)

## Archived Modules

Copied to src/archive/shortlab-reference/ (not deleted, not active in LongLabApp):
- src/archive/shortlab-reference/shadowLong/ (10 files)
- src/archive/shortlab-reference/shortBucket/
- src/archive/shortlab-reference/shortGate/
- src/archive/shortlab-reference/sniperShortGateLogOnly.js