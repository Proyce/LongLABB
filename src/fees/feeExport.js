// ─── FEE EXPORT ───────────────────────────────────────────────────────────────
// Canonical export helpers for CSV and JSON fee data.

import { getGrossMarginPnlPct, getNetMarginPnlPct, getTradingFeeMarginPct } from "./feeSelectors.js";

/**
 * Extract all canonical fee export fields from a single trade record.
 */
export function extractTradeFeeExportFields(trade) {
  if (!trade) return {};
  return {
    feeModelId:               trade.feeModelId                ?? null,
    feeModelVersion:          trade.feeModelVersion           ?? null,
    feeSource:                trade.feeSource                 ?? null,
    feeMode:                  trade.feeMode                   ?? null,
    feeCalculationStatus:     trade.feeCalculationStatus      ?? null,
    feeCalculationConfidence: trade.feeCalculationConfidence  ?? null,
    feeSnapshotCapturedAt:    trade.feeSnapshotCapturedAt     ?? null,
    entryOrderType:           trade.entryOrderType            ?? null,
    exitOrderType:            trade.exitOrderType             ?? null,
    entryFeeRatePct:          trade.entryFeeRatePct           ?? null,
    exitFeeRatePct:           trade.exitFeeRatePct            ?? null,
    makerFeeRatePct:          trade.makerFeeRatePct           ?? null,
    takerFeeRatePct:          trade.takerFeeRatePct           ?? null,

    marginUsedUsd:            trade.marginUsedUsd             ?? null,
    entryNotionalUsd:         trade.entryNotionalUsd          ?? null,
    exitNotionalUsd:          trade.exitNotionalUsd           ?? null,
    quantity:                 trade.quantity                  ?? null,

    grossMarginPnlPct:        getGrossMarginPnlPct(trade),
    grossNormPnlPct:          trade.grossNormPnlPct           ?? null,

    entryFeeMarginPct:        trade.entryFeeMarginPct         ?? null,
    entryFeeNormPct:          trade.entryFeeNormPct           ?? null,
    exitFeeMarginPct:         trade.exitFeeMarginPct          ?? null,
    exitFeeNormPct:           trade.exitFeeNormPct            ?? null,
    projectedExitFeeMarginPct: trade.projectedExitFeeMarginPct ?? null,
    projectedExitFeeNormPct:  trade.projectedExitFeeNormPct   ?? null,
    tradingFeeMarginPct:      getTradingFeeMarginPct(trade),
    tradingFeeNormPct:        trade.tradingFeeNormPct         ?? null,

    feeAdjustedMarginPnlPct:  getNetMarginPnlPct(trade),
    feeAdjustedNormPnlPct:    trade.feeAdjustedNormPnlPct    ?? null,

    grossPnlUsd:              trade.grossPnlUsd               ?? null,
    entryFeeUsd:              trade.entryFeeUsd               ?? null,
    exitFeeUsd:               trade.exitFeeUsd                ?? null,
    projectedExitFeeUsd:      trade.projectedExitFeeUsd       ?? null,
    totalTradingFeeUsd:       trade.totalTradingFeeUsd        ?? null,
    netPnlUsdAfterFees:       trade.netPnlUsdAfterFees        ?? null,

    feeBurdenPct:             trade.feeBurdenPct              ?? null,
    feeLossAmplificationPct:  trade.feeLossAmplificationPct   ?? null,
    feeBreakevenGrossMarginPct: trade.feeBreakevenGrossMarginPct ?? null,
    feeBreakevenGrossNormPct:   trade.feeBreakevenGrossNormPct   ?? null,
    feeStatusLabel:           trade.feeStatusLabel             ?? null,
    feeDiagnosticLabels:      Array.isArray(trade.feeDiagnosticLabels) ? trade.feeDiagnosticLabels.join("|") : null,
    feeDisplaySummary:        trade.feeDisplaySummary          ?? null,

    rawFirstLockTriggerMarginPct:      trade.rawFirstLockTriggerMarginPct      ?? null,
    rawFirstLockFloorMarginPct:        trade.rawFirstLockFloorMarginPct        ?? null,
    feeSafeFirstLockTriggerMarginPct:  trade.feeSafeFirstLockTriggerMarginPct  ?? null,
    feeSafeFirstLockFloorMarginPct:    trade.feeSafeFirstLockFloorMarginPct    ?? null,
    feeSafeFirstLockMinNetBufferMarginPct: trade.feeSafeFirstLockMinNetBufferMarginPct ?? null,
    projectedFirstLockNetAfterFeesMarginPct: trade.projectedFirstLockNetAfterFeesMarginPct ?? null,
    firstLockFeeSafetyApplied:         trade.firstLockFeeSafetyApplied         ?? null,
    firstLockFeeSafetyAdjustmentMarginPct: trade.firstLockFeeSafetyAdjustmentMarginPct ?? null,
    firstLockFeeCalculationStatus:     trade.firstLockFeeCalculationStatus     ?? null,
    firstLockFeeCalculationSource:     trade.firstLockFeeCalculationSource     ?? null,
    firstLockFeeSafetyVersion:         trade.firstLockFeeSafetyVersion         ?? null,
  };
}

/**
 * Convert an array of trades to a CSV string containing all fee export fields.
 */
export function tradesToFeeCSV(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return "";

  const rows = trades.map(t => ({ ...t, ...extractTradeFeeExportFields(t) }));
  const feeKeys = Object.keys(extractTradeFeeExportFields({}));
  const baseKeys = ["symbol", "run", "set", "entryTime", "closeTime", "leverage", "closeReason"];
  const cols = [...baseKeys, ...feeKeys.filter(k => !baseKeys.includes(k))];

  const header = cols.join(",");
  const lines  = rows.map(row =>
    cols.map(col => {
      const val = row[col];
      if (val == null) return "";
      const s = String(val);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  );

  return [header, ...lines].join("\n");
}

/**
 * Build a fee metadata block to attach to every export.
 */
export function buildExportFeeMetadata(config, trades) {
  const n = (trades ?? []).length;
  return {
    exportGeneratedAt:  new Date().toISOString(),
    feeModelId:         config?.feeModelId        ?? null,
    feeModelVersion:    config?.feeModelVersion   ?? null,
    feeSource:          config?.source            ?? null,
    takerFeeRatePct:    config?.takerFeeRatePct   ?? null,
    makerFeeRatePct:    config?.makerFeeRatePct   ?? null,
    defaultEntryOrderType: config?.defaultEntryOrderType ?? null,
    defaultExitOrderType:  config?.defaultExitOrderType  ?? null,
    tradeCoverageCount: n,
  };
}
