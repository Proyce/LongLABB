// ─── FEE ACCOUNTING ───────────────────────────────────────────────────────────
// Canonical fee calculation engine.
// All PnL in this codebase is leverage-scaled margin PnL.
// normPnlPct = marginPnlPct / leverage (unlevered notional return).

import { DEFAULT_FEE_CONFIG, FEE_SOURCE, FEE_CALCULATION_CONFIDENCE } from "./feeConfig.js";

const ROUNDING = 4;

function r(n) { return parseFloat(n.toFixed(ROUNDING)); }

// ─── Percentage-only model (no position size) ─────────────────────────────────

/**
 * Compute fee percentages when no position-size information is available.
 * Result is labelled ESTIMATED_PERCENT_MODEL and must never show dollar totals.
 */
export function computePercentOnlyFees({ leverage, entryFeeRatePct, exitFeeRatePct }) {
  const lev = Number(leverage) || 1;
  const entFee  = Number(entryFeeRatePct)  || 0;
  const exitFee = Number(exitFeeRatePct)   || 0;

  const entryFeeNormPct          = r(entFee);
  const projectedExitFeeNormPct  = r(exitFee);
  const projectedRoundTripFeeNormPct = r(entFee + exitFee);

  const entryFeeMarginPct          = r(entFee  * lev);
  const projectedExitFeeMarginPct  = r(exitFee * lev);
  const projectedRoundTripFeeMarginPct = r((entFee + exitFee) * lev);

  return {
    calculationModel: "ESTIMATED_PERCENT_MODEL",
    feeCalculationConfidence: FEE_CALCULATION_CONFIDENCE.ESTIMATED,

    entryFeeNormPct,
    projectedExitFeeNormPct,
    projectedRoundTripFeeNormPct,

    entryFeeMarginPct,
    projectedExitFeeMarginPct,
    projectedRoundTripFeeMarginPct,

    // Currency fields unavailable
    entryFeeUsd:             null,
    projectedExitFeeUsd:     null,
    totalTradingFeeUsd:      null,
    feeCalculationStatus:    "PERCENT_ONLY",
    feeCalculationWarning:   "MISSING_POSITION_SIZE",
  };
}

// ─── Notional-aware model ────────────────────────────────────────────────────

/**
 * Compute exact fees when margin and price are available.
 */
export function computeNotionalAwareFees({
  marginUsedUsd,
  leverage,
  entryPrice,
  currentOrExitPrice,
  entryFeeRatePct,
  exitFeeRatePct,
}) {
  const lev      = Number(leverage)           || 1;
  const margin   = Number(marginUsedUsd);
  const entPrice = Number(entryPrice);
  const exPrice  = Number(currentOrExitPrice);
  const entFee   = Number(entryFeeRatePct)   || 0;
  const exitFee  = Number(exitFeeRatePct)    || 0;

  if (!margin || !entPrice || !exPrice) {
    return computePercentOnlyFees({ leverage: lev, entryFeeRatePct: entFee, exitFeeRatePct: exitFee });
  }

  const entryNotionalUsd    = r(margin * lev);
  const quantity            = entryNotionalUsd / entPrice;
  const exitNotionalUsd     = r(quantity * exPrice);

  const entryFeeUsd         = r(entryNotionalUsd  * (entFee  / 100));
  const exitFeeUsd          = r(exitNotionalUsd   * (exitFee / 100));
  const totalTradingFeeUsd  = r(entryFeeUsd + exitFeeUsd);

  const entryFeeMarginPct   = r((entryFeeUsd / margin) * 100);
  const exitFeeMarginPct    = r((exitFeeUsd  / margin) * 100);
  const tradingFeeMarginPct = r(entryFeeMarginPct + exitFeeMarginPct);

  const entryFeeNormPct     = r(entryFeeMarginPct  / lev);
  const exitFeeNormPct      = r(exitFeeMarginPct   / lev);
  const tradingFeeNormPct   = r(tradingFeeMarginPct / lev);

  return {
    calculationModel: "NOTIONAL_AWARE",
    feeCalculationConfidence: FEE_CALCULATION_CONFIDENCE.EXACT,

    entryNotionalUsd,
    exitNotionalUsd,
    quantity,

    entryFeeUsd,
    exitFeeUsd,
    totalTradingFeeUsd,

    entryFeeMarginPct,
    entryFeeNormPct,
    exitFeeMarginPct,
    exitFeeNormPct,
    tradingFeeMarginPct,
    tradingFeeNormPct,

    // Aliases for callers expecting the projected-fee field names on active trades
    projectedExitFeeMarginPct:  exitFeeMarginPct,
    projectedExitFeeNormPct:    exitFeeNormPct,
    projectedRoundTripFeeMarginPct: tradingFeeMarginPct,
    projectedRoundTripFeeNormPct:   tradingFeeNormPct,

    projectedExitFeeUsd: exitFeeUsd,
    feeCalculationStatus: "COMPLETE",
    feeCalculationWarning: null,
  };
}

// ─── Canonical fee telemetry for a sample ────────────────────────────────────

/**
 * Full fee accounting for a trade sample.
 * Accepts a frozen feeSnapshot (from captureFeeSnapshot) plus live/final prices.
 * Returns both gross and net values.
 */
export function computeFeeAccounting({
  grossMarginPnlPct,
  leverage,
  feeSnapshot,
  marginUsedUsd      = null,
  entryPrice         = null,
  currentOrExitPrice = null,
  isActive           = false,
  config             = DEFAULT_FEE_CONFIG,
}) {
  const lev = Number(leverage) || 1;
  const snap = feeSnapshot ?? {};

  const entryOrderType  = snap.entryOrderType  ?? config.defaultEntryOrderType ?? "TAKER";
  const exitOrderType   = snap.exitOrderType   ?? config.defaultExitOrderType  ?? "TAKER";
  const entryFeeRatePct = snap.entryFeeRatePct ??
    (entryOrderType === "MAKER" ? (snap.makerFeeRatePct ?? config.makerFeeRatePct ?? config.takerFeeRatePct) : config.takerFeeRatePct);
  const exitFeeRatePct  = snap.exitFeeRatePct  ??
    (exitOrderType  === "MAKER" ? (snap.makerFeeRatePct ?? config.makerFeeRatePct ?? config.takerFeeRatePct) : config.takerFeeRatePct);

  // Choose calculation model
  const fees = (marginUsedUsd && entryPrice && currentOrExitPrice)
    ? computeNotionalAwareFees({ marginUsedUsd, leverage: lev, entryPrice, currentOrExitPrice, entryFeeRatePct, exitFeeRatePct })
    : computePercentOnlyFees({ leverage: lev, entryFeeRatePct, exitFeeRatePct });

  const gross = (grossMarginPnlPct != null && Number.isFinite(Number(grossMarginPnlPct)))
    ? Number(grossMarginPnlPct) : null;

  const grossNormPnlPct = gross != null ? r(gross / lev) : null;

  const tradingFeeMarginPct = fees.tradingFeeMarginPct ?? fees.projectedRoundTripFeeMarginPct ?? 0;
  const tradingFeeNormPct   = fees.tradingFeeNormPct   ?? fees.projectedRoundTripFeeNormPct   ?? 0;

  const feeAdjustedMarginPnlPct = gross != null ? r(gross - tradingFeeMarginPct) : null;
  const feeAdjustedNormPnlPct   = gross != null ? r(grossNormPnlPct - tradingFeeNormPct) : null;

  const grossPnlUsd     = (marginUsedUsd && gross != null) ? r(Number(marginUsedUsd) * gross / 100) : null;
  const netPnlUsdAfterFees = (grossPnlUsd != null && fees.totalTradingFeeUsd != null)
    ? r(grossPnlUsd - fees.totalTradingFeeUsd) : null;

  const feeBreakevenGrossMarginPct = tradingFeeMarginPct;
  const feeBreakevenGrossNormPct   = tradingFeeNormPct;

  const feeBurdenPct = (gross != null && gross > 0)
    ? r(tradingFeeMarginPct / gross * 100) : null;

  const feeLossAmplificationPct = (gross != null && gross < 0)
    ? r(tradingFeeMarginPct / Math.abs(gross) * 100) : null;

  // Live vs finalized naming
  const livePrefix = isActive ? "feeAdjustedLive" : null;

  const result = {
    // Provenance
    feeModelId:      snap.feeModelId      ?? config.feeModelId,
    feeModelVersion: snap.feeModelVersion ?? config.feeModelVersion,
    feeSource:       snap.feeSource       ?? FEE_SOURCE.SIMULATED_CONFIG,
    feeMode:         snap.feeMode         ?? "TAKER_TAKER",
    feeCalculationStatus:     fees.feeCalculationStatus,
    feeCalculationConfidence: fees.feeCalculationConfidence,
    feeCalculationWarning:    fees.feeCalculationWarning ?? null,
    feeAppliedAtEntry:  true,
    feeFinalizedAtClose: !isActive,

    // Position sizing
    marginUsedUsd:    marginUsedUsd ?? null,
    entryNotionalUsd: fees.entryNotionalUsd ?? null,
    exitNotionalUsd:  fees.exitNotionalUsd  ?? null,
    currentNotionalUsd: isActive ? (fees.exitNotionalUsd ?? null) : null,
    quantity:         fees.quantity ?? null,
    settlementAsset:  config.settlementAsset ?? "USDT",

    // Rates
    entryOrderType:   snap.entryOrderType  ?? config.defaultEntryOrderType,
    exitOrderType:    snap.exitOrderType   ?? config.defaultExitOrderType,
    entryFeeRatePct,
    exitFeeRatePct,
    makerFeeRatePct: snap.makerFeeRatePct ?? config.makerFeeRatePct,
    takerFeeRatePct: snap.takerFeeRatePct ?? config.takerFeeRatePct,

    // Gross
    grossMarginPnlPct: gross,
    grossNormPnlPct,

    // Entry fee
    entryFeeMarginPct: fees.entryFeeMarginPct ?? fees.entryFeeNormPct * lev,
    entryFeeNormPct:   fees.entryFeeNormPct   ?? entryFeeRatePct,
    entryFeeUsd:       fees.entryFeeUsd        ?? null,

    // Exit fee (projected for active, finalized for closed)
    projectedExitFeeMarginPct: isActive ? (fees.projectedExitFeeMarginPct ?? null) : null,
    projectedExitFeeNormPct:   isActive ? (fees.projectedExitFeeNormPct   ?? null) : null,
    projectedExitFeeUsd:       isActive ? (fees.projectedExitFeeUsd       ?? null) : null,
    exitFeeMarginPct:  !isActive ? (fees.exitFeeMarginPct ?? fees.projectedExitFeeMarginPct ?? null) : null,
    exitFeeNormPct:    !isActive ? (fees.exitFeeNormPct   ?? fees.projectedExitFeeNormPct   ?? null) : null,
    exitFeeUsd:        !isActive ? (fees.exitFeeUsd       ?? null) : null,

    // Totals
    tradingFeeMarginPct,
    tradingFeeNormPct,
    totalTradingFeeUsd: fees.totalTradingFeeUsd ?? null,

    // Net after fees
    feeAdjustedMarginPnlPct,
    feeAdjustedNormPnlPct,
    grossPnlUsd,
    netPnlUsdAfterFees,

    // Active-specific aliases
    ...(isActive ? {
      feeAdjustedLiveMarginPnlPct: feeAdjustedMarginPnlPct,
      feeAdjustedLiveNormPnlPct:   feeAdjustedNormPnlPct,
    } : {}),

    // Diagnostics
    feeBreakevenGrossMarginPct,
    feeBreakevenGrossNormPct,
    feeBurdenPct,
    feeLossAmplificationPct,
  };

  return result;
}

/**
 * Compute the projected exit fee at a specific candidate gross margin floor.
 * Used by feeSafeProfitLock to find the minimum required gross floor.
 *
 * When notional data is unavailable, falls back to the percentage model.
 */
export function computeProjectedExitFeeAtFloor({
  candidateGrossFloorMarginPct,
  leverage,
  marginUsedUsd,
  entryPrice,
  exitFeeRatePct,
}) {
  const lev = Number(leverage) || 1;

  if (marginUsedUsd && entryPrice) {
    const margin         = Number(marginUsedUsd);
    const entNotional    = margin * lev;
    const qty            = entNotional / Number(entryPrice);
    // price rise implied by candidateGrossFloorMarginPct for a long
    const grossFloor     = Number(candidateGrossFloorMarginPct);
    const pricePct       = grossFloor / lev;  // price-level % rise (long favors price up)
    const floorPrice     = Number(entryPrice) * (1 + pricePct / 100);
    const exitNotional   = qty * floorPrice;
    const exitFeeUsd     = exitNotional * (Number(exitFeeRatePct) / 100);
    return r((exitFeeUsd / margin) * 100);
  }

  // Percentage model fallback
  return r(Number(exitFeeRatePct) * lev);
}
