# LongLAB Analysis Batch Export Format

## Purpose

The `ALL EXPORT · ANALYSIS ZIP` action packages one selected LongLAB batch of up to exactly 20 runs into a structure optimized for repeatable trade-log analysis.

## Recommended files

### Strategy analysis

```text
research_clean/closed_trades.csv
```

Use this for fee-aware filter, label, setup, combo, score, side, and cross-run analysis.

### Full operational audit

```text
master/trades.csv
```

Includes closed, active, valid, incomplete, and research-excluded records.

### Fast programmatic loading

```text
master/trades.jsonl
research_clean/closed_trades.jsonl
```

JSONL permits streaming ingestion without parsing one very large JSON array.

### Cross-run validation

```text
summary/run_summary.csv
```

### Signal discovery

```text
summary/signal_summary.csv
```

### Data-quality checks

```text
summary/data_quality_summary.csv
summary/field_coverage.csv
excluded/excluded_trades.csv
```

### Individual-run inspection

```text
runs/run_<id>.csv
```

## Primary metric

```text
feeAdjustedNormPnlPct
```

This is the canonical 1x normalized, fee-adjusted metric for cross-leverage analysis.

## Missing-data policy

Missing telemetry remains missing. It is not converted to a false filter match, zero score, neutral context, or valid outcome.

## Deduplication policy

The exporter keeps the newest/final state for each trade ID before producing master, clean, summary, and run files.

## Batch selection

The Runs overview lists available 20-run batches. Select the required batch and use:

```text
↓ ANALYSIS ZIP
```

The worker-generated ZIP reports progress without blocking the main cockpit.
