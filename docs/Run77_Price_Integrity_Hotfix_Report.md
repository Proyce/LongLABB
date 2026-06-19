# Run-77 Price Integrity Hotfix Report

## Root cause

Binance USD-M Futures `bookTicker` fields are case-sensitive:

- `b`: best bid price
- `B`: best bid quantity
- `a`: best ask price
- `A`: best ask quantity

The websocket parser used uppercase `A` as the ask price. For the reproduced NOTUSDT payload:

```text
b = 0.0004196
a = 0.0004200
A = 852212
```

The defective calculation became:

```text
(0.0004196 + 852212) / 2 = 426106.0002098
```

That fake price then contaminated MFE, activated trailing state, and caused fake trailing or stop exits.

## Corrections

1. Added a single schema-aware `parseBookTickerTick` parser.
2. Ask price is read only from lowercase `a`.
3. Quantity fields `B` and `A` are retained only as quantity telemetry.
4. Missing lowercase `a`, crossed books, and absurd spreads are rejected.
5. Added a second lifecycle gate requiring schema-validated book ticks before PnL/MFE/MAE/exit processing.
6. New records carry `BINANCE_PRICE_STREAM_V2_2026_06_BOOK_PRICE_FIELDS`.
7. Closed records from the unversioned websocket lifecycle build are quarantined from aggregate metrics after reload.
8. Quarantined rows remain visible and exportable for audit.

## Run 77 audit

The supplied JSON contains 50 records. Migration now classifies all 50 as:

```text
priceIntegrityStatus = INVALID
priceIntegrityFailureCode = UNVERIFIED_BOOK_TICKER_SCHEMA_V1
strategyResearchEligible = false
strategyResearchExclusionReason = PRICE_FEED_SCHEMA_CORRUPTION
```

They are excluded from PnL, win rate, MAE, MFE, best/worst, and normalized run statistics.

## Tests

- Exact NOTUSDT regression payload test
- Lowercase ask-price versus uppercase ask-quantity test
- Missing lowercase ask-price rejection
- Crossed-book rejection
- Absurd-spread rejection
- Lifecycle secondary integrity-gate tests
- Migration quarantine tests
- Clean versioned-record eligibility test

Final validation:

```text
Source syntax: 249 files passed
Production build: passed
Test shard 1: 43 files / 532 tests passed
Test shard 2: 43 files / 896 tests passed
Total: 86 files / 1,428 tests passed
LONG runtime purity: passed
LONG filter purity: passed
LONG export purity: passed, 310 unique columns
```
