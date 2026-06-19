# LongLAB Analysis ZIP Live-Run Safety Fix

## Problem

Clicking **ANALYSIS ZIP** could reload/crash the browser tab and terminate the active run.

## Root cause

The export handler selected a 20-run descriptor, but sent the entire `rankedSamples` history to the Web Worker. With V7 telemetry, a single trade can carry very large nested forensic objects. The browser had to structured-clone the entire historical store before the worker could select the requested batch. On a mature LongLAB store this could create a very large transient memory spike and cause the renderer to reload.

The shared button component also did not declare `type="button"`. While LongLAB currently has no intentional form around this control, an explicit non-submit type and event suppression are now enforced so the export action cannot trigger navigation through form semantics.

## Corrections

1. The app now computes `selectedExportBatchTrades` and sends only that batch to the worker.
2. The worker payload strips four heavyweight nested forensic objects before `postMessage`:
   - `entryResearchSnapshot`
   - `longComboDetails`
   - `longWinningSetupMatchDetails`
   - `entrySnapshotFieldStatus`
3. Their useful values remain available through the existing flattened analysis columns.
4. The analysis package uses a compact batch schema for master, research-clean, active, excluded, and per-run files.
5. Export buttons use `type="button"`.
6. The handler calls `preventDefault()` and `stopPropagation()`.
7. The Blob URL remains valid for 60 seconds, preventing large downloads from losing their source before the browser download manager acquires it.
8. The export operates on an immutable snapshot. It never pauses, stops, or mutates the active run.

## Format version

`LONG_BATCH_ANALYSIS_V2_SAFE`

## Reproduction benchmark

Using the uploaded 100-trade V7 current-view JSON:

- Source JSON: 8,921,558 bytes
- New uncompressed analysis package: 2,993,209 bytes
- Files produced: 20

The largest nested forensic objects are no longer cloned into the worker or duplicated across several ZIP members.

## Regression coverage

- Analysis ZIP buttons cannot behave as submit controls.
- The handler sends `selectedExportBatchTrades`, not the full history.
- Worker transport does not mutate live trade records.
- Heavy forensic fields are omitted from the compact analysis schema.
- Flattened fields such as `longGateScore` remain available.
- Already-selected worker payloads retain exactly the selected runs.

## Validation

- Production Vite build: passed
- Test shard 1: 45 files, 539 tests passed
- Test shard 2: 44 files, 900 tests passed
- Total: 89 files, 1,439 tests passed
- Long runtime purity: passed
- Long filter purity: passed
- Long export purity: passed, 316 canonical trade columns
