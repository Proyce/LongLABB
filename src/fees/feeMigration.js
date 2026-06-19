// ─── FEE MIGRATION ────────────────────────────────────────────────────────────
// Migrate legacy trade records to the canonical fee schema.
// Does NOT overwrite original fields. Adds v2 fee fields alongside existing data.

import { DEFAULT_FEE_CONFIG, FEE_SOURCE, FEE_CALCULATION_CONFIDENCE } from "./feeConfig.js";
import { computePercentOnlyFees } from "./feeAccounting.js";
import { assignFeeStatusLabel, buildFeeDisplaySummary } from "./feeLabels.js";

const MIGRATION_VERSION = "fee-migration-v2.0.0";

/**
 * Migrate a single legacy trade record.
 * Preserves all original fields. Adds v2 fee accounting fields.
 * Marks as LEGACY_RECOMPUTED with ESTIMATED confidence.
 */
export function migrateLegacyTrade(trade, config = DEFAULT_FEE_CONFIG) {
  if (!trade) return trade;
  if (trade._feeMigrationVersion === MIGRATION_VERSION) return trade;

  // Preserve existing raw PnL as gross
  const grossMarginPnlPct =
    typeof trade.grossMarginPnlPct === "number" ? trade.grossMarginPnlPct :
    typeof trade.finalPnlPct        === "number" ? trade.finalPnlPct : null;

  const leverage = Number(trade.leverage) || null;

  // Use existing stored fee fields when present
  const existingEntryFeeMarginPct = trade.entryFeeMarginPct ?? null;
  const existingExitFeeMarginPct  = trade.exitFeeMarginPct  ?? null;
  const existingFeeDragMarginPct  = trade.feeDragMarginPct ?? trade.feeDragPct ?? null;

  let fees = null;
  let feeSource = FEE_SOURCE.LEGACY_RECOMPUTED;
  let feeCalculationConfidence = FEE_CALCULATION_CONFIDENCE.ESTIMATED;

  if (existingEntryFeeMarginPct != null && existingExitFeeMarginPct != null) {
    // Re-use stored fee fields
    const tradingFeeMarginPct = existingEntryFeeMarginPct + existingExitFeeMarginPct;
    fees = {
      entryFeeMarginPct:            existingEntryFeeMarginPct,
      exitFeeMarginPct:             existingExitFeeMarginPct,
      tradingFeeMarginPct,
      entryFeeNormPct:  leverage ? existingEntryFeeMarginPct / leverage : null,
      exitFeeNormPct:   leverage ? existingExitFeeMarginPct  / leverage : null,
      tradingFeeNormPct: leverage ? tradingFeeMarginPct       / leverage : null,
    };
  } else if (existingFeeDragMarginPct != null) {
    // Use existing drag as total fee, split equally
    const half = existingFeeDragMarginPct / 2;
    fees = {
      entryFeeMarginPct:   half,
      exitFeeMarginPct:    half,
      tradingFeeMarginPct: existingFeeDragMarginPct,
      entryFeeNormPct:  leverage ? half / leverage : null,
      exitFeeNormPct:   leverage ? half / leverage : null,
      tradingFeeNormPct: leverage ? existingFeeDragMarginPct / leverage : null,
    };
  } else if (leverage) {
    // Recompute from legacy default config
    const pct = computePercentOnlyFees({
      leverage,
      entryFeeRatePct: config.takerFeeRatePct,
      exitFeeRatePct:  config.takerFeeRatePct,
    });
    fees = {
      entryFeeMarginPct:    pct.entryFeeMarginPct,
      exitFeeMarginPct:     pct.projectedExitFeeMarginPct,
      tradingFeeMarginPct:  pct.projectedRoundTripFeeMarginPct,
      entryFeeNormPct:      pct.entryFeeNormPct,
      exitFeeNormPct:       pct.projectedExitFeeNormPct,
      tradingFeeNormPct:    pct.projectedRoundTripFeeNormPct,
    };
  } else {
    feeCalculationConfidence = FEE_CALCULATION_CONFIDENCE.INCOMPLETE;
  }

  const tradingFeeMarginPct = fees?.tradingFeeMarginPct ?? null;
  const feeAdjustedMarginPnlPct = (grossMarginPnlPct != null && tradingFeeMarginPct != null)
    ? parseFloat((grossMarginPnlPct - tradingFeeMarginPct).toFixed(4)) : null;

  const grossNormPnlPct = (grossMarginPnlPct != null && leverage)
    ? parseFloat((grossMarginPnlPct / leverage).toFixed(4)) : null;

  const tradingFeeNormPct = fees?.tradingFeeNormPct ?? null;
  const feeAdjustedNormPnlPct = (grossNormPnlPct != null && tradingFeeNormPct != null)
    ? parseFloat((grossNormPnlPct - tradingFeeNormPct).toFixed(4)) : null;

  const feeStatusLabel = assignFeeStatusLabel({
    grossMarginPnlPct,
    feeAdjustedMarginPnlPct,
    tradingFeeMarginPct,
    feeCalculationStatus: tradingFeeMarginPct != null ? "COMPLETE" : "INCOMPLETE",
  });

  return {
    ...trade,

    // Preserve original
    finalPnlPct: trade.finalPnlPct,

    // V2 gross
    grossMarginPnlPct,
    grossNormPnlPct,

    // Fee fields
    feeModelId:      config.feeModelId,
    feeModelVersion: config.feeModelVersion,
    feeSource,
    feeMode:         "TAKER_TAKER",
    feeCalculationStatus:     tradingFeeMarginPct != null ? "COMPLETE" : "INCOMPLETE",
    feeCalculationConfidence,
    feeSnapshotCapturedAt:    null,
    feeAppliedAtEntry:        false,
    feeFinalizedAtClose:      true,

    entryFeeRatePct:  config.takerFeeRatePct,
    exitFeeRatePct:   config.takerFeeRatePct,
    makerFeeRatePct:  config.makerFeeRatePct,
    takerFeeRatePct:  config.takerFeeRatePct,

    entryFeeMarginPct:   fees?.entryFeeMarginPct   ?? null,
    entryFeeNormPct:     fees?.entryFeeNormPct      ?? null,
    exitFeeMarginPct:    fees?.exitFeeMarginPct     ?? null,
    exitFeeNormPct:      fees?.exitFeeNormPct       ?? null,
    tradingFeeMarginPct,
    tradingFeeNormPct,

    feeAdjustedMarginPnlPct,
    feeAdjustedNormPnlPct,

    feeStatusLabel,
    feeDisplaySummary: buildFeeDisplaySummary({
      feeSource,
      feeMode: "TAKER_TAKER",
      entryFeeRatePct: config.takerFeeRatePct,
      exitFeeRatePct:  config.takerFeeRatePct,
      leverage,
      tradingFeeMarginPct,
      feeAdjustedMarginPnlPct,
    }),

    _feeMigrationVersion: MIGRATION_VERSION,
    _feeMigratedAt: Date.now(),
  };
}

/**
 * Migrate an array of legacy trades.
 */
export function migrateLegacyTrades(trades, config = DEFAULT_FEE_CONFIG) {
  if (!Array.isArray(trades)) return [];
  return trades.map(t => migrateLegacyTrade(t, config));
}
