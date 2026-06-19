// ─── FEE TELEMETRY ───────────────────────────────────────────────────────────
// Backward-compatible facade over the v2 fee accounting engine.
// All PnL in this codebase is leverage-scaled margin PnL.
// normPnlPct = marginPnlPct / leverage (unlevered notional return).
//
// New code should import directly from src/fees/* modules.
// This module re-exports the v2 engine while preserving all original signatures.

export {
  DEFAULT_FEE_CONFIG as FEE_CONFIG_V2,
  captureFeeSnapshot,
} from "../fees/feeConfig.js";
export { computePercentOnlyFees, computeNotionalAwareFees, computeFeeAccounting } from "../fees/feeAccounting.js";
export { assignFeeStatusLabel, buildFeeDiagnosticLabels, FEE_STATUS } from "../fees/feeLabels.js";
export { getNetMarginPnlPct, isNetWinner, isFeeFlipped } from "../fees/feeSelectors.js";

export const FEE_CONFIG = {
  takerFeeRatePct: 0.05,
  roundTripNotionalFeePct: 0.10,
  defaultFeeMode: "TAKER_ROUND_TRIP",
};

/** Round-trip notional fee: entry + exit taker, expressed as % of notional. */
export function computeRoundTripFeeNotionalPct(takerFeeRatePct = FEE_CONFIG.takerFeeRatePct) {
  return parseFloat((2 * takerFeeRatePct).toFixed(4));
}

/** Margin-level fee drag for a leveraged position. */
export function computeFeeDragMarginPct(leverage, takerFeeRatePct = FEE_CONFIG.takerFeeRatePct) {
  const lev = Number(leverage) || 1;
  return parseFloat((computeRoundTripFeeNotionalPct(takerFeeRatePct) * lev).toFixed(4));
}

/** Unlevered (normalized) PnL from margin-level PnL. */
export function computeNormPnlPct(marginPnlPct, leverage) {
  const lev = Number(leverage) || 1;
  if (marginPnlPct == null || !Number.isFinite(Number(marginPnlPct))) return null;
  return parseFloat((Number(marginPnlPct) / lev).toFixed(4));
}

/**
 * Full fee telemetry for a closed or live sample.
 * Returns both raw and fee-adjusted values at margin and normalized levels.
 */
export function computeFeeTelemetry({
  marginPnlPct,
  leverage,
  takerFeeRatePct = FEE_CONFIG.takerFeeRatePct,
}) {
  const lev = Number(leverage) || 1;
  const rawMarginPnlPct = Number(marginPnlPct);

  if (marginPnlPct == null || !Number.isFinite(rawMarginPnlPct)) {
    return {
      feeMode: FEE_CONFIG.defaultFeeMode,
      takerFeeRatePct,
      roundTripFeeNotionalPct: computeRoundTripFeeNotionalPct(takerFeeRatePct),
      feeDragMarginPct: computeFeeDragMarginPct(lev, takerFeeRatePct),
      rawMarginPnlPct: null,
      rawNormPnlPct: null,
      feeAdjustedMarginPnlPct: null,
      feeAdjustedNormPnlPct: null,
      feeAdjustedWin: false,
      feeAdjustedLoss: false,
      feeStatusLabel: "FEE_UNKNOWN",
      feeDisplayLabel: "",
    };
  }

  const roundTripFeeNotionalPct = computeRoundTripFeeNotionalPct(takerFeeRatePct);
  const feeDragMarginPct = computeFeeDragMarginPct(lev, takerFeeRatePct);
  const rawNormPnlPct = computeNormPnlPct(rawMarginPnlPct, lev);

  const feeAdjustedMarginPnlPct = parseFloat((rawMarginPnlPct - feeDragMarginPct).toFixed(4));
  const feeAdjustedNormPnlPct = parseFloat((rawNormPnlPct - roundTripFeeNotionalPct).toFixed(4));

  let feeStatusLabel = "FEE_NEUTRAL";
  if (rawMarginPnlPct > 0 && feeAdjustedMarginPnlPct < 0) {
    feeStatusLabel = "FEE_FLIPPED_WIN_TO_LOSS";
  } else if (rawMarginPnlPct > 0 && feeAdjustedMarginPnlPct >= 0) {
    feeStatusLabel = "FEE_SAFE_WIN";
  } else if (rawMarginPnlPct <= 0) {
    feeStatusLabel = "FEE_DEEPENS_LOSS";
  }

  return {
    feeMode: FEE_CONFIG.defaultFeeMode,
    takerFeeRatePct,
    roundTripFeeNotionalPct,
    feeDragMarginPct,

    rawMarginPnlPct: parseFloat(rawMarginPnlPct.toFixed(4)),
    rawNormPnlPct,

    feeAdjustedMarginPnlPct,
    feeAdjustedNormPnlPct,

    feeAdjustedWin: feeAdjustedMarginPnlPct > 0,
    feeAdjustedLoss: feeAdjustedMarginPnlPct < 0,
    feeStatusLabel,

    feeDisplayLabel:
      `${rawMarginPnlPct >= 0 ? "+" : ""}${rawMarginPnlPct.toFixed(2)}% raw / ` +
      `${feeAdjustedMarginPnlPct >= 0 ? "+" : ""}${feeAdjustedMarginPnlPct.toFixed(2)}% net`,
  };
}

/**
 * Compute fee telemetry for a single simulated exit profile PnL value.
 * Returns normalized subset used by computeCloseDiagnostics.
 */
export function computeSimProfileFeeTelemetry(simPnl, leverage) {
  if (simPnl == null) {
    return {
      marginPnlPct: null,
      normPnlPct: null,
      feeAdjustedMarginPnlPct: null,
      feeAdjustedNormPnlPct: null,
    };
  }

  const fee = computeFeeTelemetry({ marginPnlPct: simPnl, leverage });

  return {
    marginPnlPct: fee.rawMarginPnlPct,
    normPnlPct: fee.rawNormPnlPct,
    feeAdjustedMarginPnlPct: fee.feeAdjustedMarginPnlPct,
    feeAdjustedNormPnlPct: fee.feeAdjustedNormPnlPct,
  };
}
