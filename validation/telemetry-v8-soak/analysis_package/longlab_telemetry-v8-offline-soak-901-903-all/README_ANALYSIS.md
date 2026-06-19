# LongLAB batch analysis export

- Batch: Telemetry V8 three-run five-minute offline soak
- Runs: 901, 902, 903
- Run count: 3/20
- Trades: 150
- Side filter: ALL
- Generated: 2026-06-17T13:30:35.481Z

## Recommended analysis order

1. `summary/batch_summary.json` for the batch headline.
2. `summary/run_summary.csv` for cross-run consistency.
3. `research_clean/closed_trades.csv` for fee-aware strategy research.
4. `summary/signal_summary.csv` for combo/setup/evidence ranking.
5. `master/trades.csv` for the complete operational book.
6. `master/trades.jsonl` for fast Python/streaming ingestion.
7. `runs/run_*.csv` for individual-run inspection.
8. `summary/data_quality_summary.csv` and `field_coverage.csv` before trusting any subgroup.
9. `forensics/exit_events.jsonl` for sparse exceptional lifecycle evidence.

The master files are deduplicated by trade ID and retain the newest/final state.
The V8 master contract is compact: duplicate nested objects and row-constant registry metadata are moved out of every trade row.
Exceptional lifecycle evidence is persisted sparsely in `forensics/exit_events.jsonl`.
Missing telemetry remains missing; it is not converted to a false rule match.
Research-clean files contain only closed, strategyResearchEligible trades.
Excluded and active records remain available in separate folders for operational auditing.