// ─── FEE LABELS ───────────────────────────────────────────────────────────────
// Canonical fee status labels for LongLAB.

export const FEE_STATUS = {
  FEE_UNKNOWN:                       "FEE_UNKNOWN",
  FEE_INCOMPLETE:                    "FEE_INCOMPLETE",
  FEE_SAFE_WIN:                      "FEE_SAFE_WIN",
  FEE_EFFICIENT_WIN:                 "FEE_EFFICIENT_WIN",
  FEE_HEAVY_WIN:                     "FEE_HEAVY_WIN",
  FEE_FLIPPED_WIN_TO_LOSS:           "FEE_FLIPPED_WIN_TO_LOSS",
  FEE_BREAKEVEN:                     "FEE_BREAKEVEN",
  FEE_DEEPENS_LOSS:                  "FEE_DEEPENS_LOSS",
  FEE_DOMINATED_TRADE:               "FEE_DOMINATED_TRADE",
  FEE_MODEL_MIXED:                   "FEE_MODEL_MIXED",
  FEE_SOURCE_ESTIMATED:              "FEE_SOURCE_ESTIMATED",
  FEE_SOURCE_EXCHANGE_ACTUAL:        "FEE_SOURCE_EXCHANGE_ACTUAL",
  ACTIVE_NET_IF_CLOSED_POSITIVE:     "ACTIVE_NET_IF_CLOSED_POSITIVE",
  ACTIVE_NET_IF_CLOSED_NEGATIVE:     "ACTIVE_NET_IF_CLOSED_NEGATIVE",
  ENTRY_FEE_APPLIED:                 "ENTRY_FEE_APPLIED",
  EXIT_FEE_PROJECTED:                "EXIT_FEE_PROJECTED",
  EXIT_FEE_FINALIZED:                "EXIT_FEE_FINALIZED",
  LOCK_FLOOR_BELOW_FEE_BREAKEVEN:    "LOCK_FLOOR_BELOW_FEE_BREAKEVEN",
  TP_TARGET_BELOW_FEE_BREAKEVEN:     "TP_TARGET_BELOW_FEE_BREAKEVEN",
  FIRST_LOCK_FEE_SAFE:               "FIRST_LOCK_FEE_SAFE",
  FIRST_LOCK_FLOOR_RAISED_FOR_FEES:  "FIRST_LOCK_FLOOR_RAISED_FOR_FEES",
  FIRST_LOCK_TRIGGER_RAISED_FOR_HEADROOM: "FIRST_LOCK_TRIGGER_RAISED_FOR_HEADROOM",
  FIRST_LOCK_ALREADY_FEE_SAFE:       "FIRST_LOCK_ALREADY_FEE_SAFE",
  FIRST_LOCK_FEE_MODEL_INCOMPLETE:   "FIRST_LOCK_FEE_MODEL_INCOMPLETE",
  FIRST_LOCK_CONSERVATIVE_FEE_FALLBACK: "FIRST_LOCK_CONSERVATIVE_FEE_FALLBACK",
  FIRST_LOCK_NET_BUFFER_VIOLATION:   "FIRST_LOCK_NET_BUFFER_VIOLATION",
  GROSS_PROFIT_NET_LOSS:             "GROSS_PROFIT_NET_LOSS",
  NET_EDGE_TOO_THIN:                 "NET_EDGE_TOO_THIN",
};

// Fee burden thresholds — configurable and research-visible
export const FEE_BURDEN_THRESHOLDS = {
  EFFICIENT: 15,
  SAFE:      35,
  HEAVY:     70,
};

/**
 * Assign the primary fee status label for a closed trade.
 */
export function assignFeeStatusLabel({
  grossMarginPnlPct,
  feeAdjustedMarginPnlPct,
  tradingFeeMarginPct,
  feeCalculationStatus,
}) {
  if (feeCalculationStatus === "INCOMPLETE" || feeCalculationStatus == null) {
    return FEE_STATUS.FEE_INCOMPLETE;
  }

  if (grossMarginPnlPct == null || !Number.isFinite(grossMarginPnlPct)) {
    return FEE_STATUS.FEE_UNKNOWN;
  }

  if (feeAdjustedMarginPnlPct == null) {
    return FEE_STATUS.FEE_UNKNOWN;
  }

  const gross = Number(grossMarginPnlPct);
  const net   = Number(feeAdjustedMarginPnlPct);

  if (gross > 0 && net < 0) return FEE_STATUS.FEE_FLIPPED_WIN_TO_LOSS;
  if (gross > 0 && Math.abs(net) < 0.001) return FEE_STATUS.FEE_BREAKEVEN;
  if (gross <= 0) return FEE_STATUS.FEE_DEEPENS_LOSS;

  const burden = tradingFeeMarginPct != null
    ? Number(tradingFeeMarginPct) / gross * 100
    : null;

  if (burden == null) return FEE_STATUS.FEE_SAFE_WIN;
  if (burden >= FEE_BURDEN_THRESHOLDS.HEAVY)    return FEE_STATUS.FEE_DOMINATED_TRADE;
  if (burden >= FEE_BURDEN_THRESHOLDS.SAFE)     return FEE_STATUS.FEE_HEAVY_WIN;
  if (burden >= FEE_BURDEN_THRESHOLDS.EFFICIENT) return FEE_STATUS.FEE_SAFE_WIN;
  return FEE_STATUS.FEE_EFFICIENT_WIN;
}

/**
 * Build the array of diagnostic labels for a trade.
 */
export function buildFeeDiagnosticLabels({
  grossMarginPnlPct,
  feeAdjustedMarginPnlPct,
  tradingFeeMarginPct,
  feeCalculationConfidence,
  feeSource,
  isActive,
  firstLockFeeSafetyApplied,
  firstLockFloorRaisedForFees,
  firstLockTriggerRaisedForHeadroom,
  firstLockAlreadyFeeSafe,
  feeCalculationStatus,
}) {
  const labels = [];

  if (feeSource === "EXCHANGE_FILL") labels.push(FEE_STATUS.FEE_SOURCE_EXCHANGE_ACTUAL);
  if (feeCalculationConfidence === "ESTIMATED") labels.push(FEE_STATUS.FEE_SOURCE_ESTIMATED);

  if (isActive) {
    labels.push(FEE_STATUS.ENTRY_FEE_APPLIED);
    labels.push(FEE_STATUS.EXIT_FEE_PROJECTED);
    if (feeAdjustedMarginPnlPct != null) {
      labels.push(
        feeAdjustedMarginPnlPct >= 0
          ? FEE_STATUS.ACTIVE_NET_IF_CLOSED_POSITIVE
          : FEE_STATUS.ACTIVE_NET_IF_CLOSED_NEGATIVE
      );
    }
  } else {
    labels.push(FEE_STATUS.EXIT_FEE_FINALIZED);
  }

  if (grossMarginPnlPct > 0 && feeAdjustedMarginPnlPct < 0) {
    labels.push(FEE_STATUS.GROSS_PROFIT_NET_LOSS);
  }

  if (firstLockAlreadyFeeSafe)           labels.push(FEE_STATUS.FIRST_LOCK_ALREADY_FEE_SAFE);
  if (firstLockFloorRaisedForFees)       labels.push(FEE_STATUS.FIRST_LOCK_FLOOR_RAISED_FOR_FEES);
  if (firstLockTriggerRaisedForHeadroom) labels.push(FEE_STATUS.FIRST_LOCK_TRIGGER_RAISED_FOR_HEADROOM);
  if (firstLockFeeSafetyApplied)         labels.push(FEE_STATUS.FIRST_LOCK_FEE_SAFE);
  if (feeCalculationStatus === "INCOMPLETE") labels.push(FEE_STATUS.FIRST_LOCK_FEE_MODEL_INCOMPLETE);

  return labels;
}

/**
 * Build a one-line human-readable fee summary string.
 */
export function buildFeeDisplaySummary({
  feeSource,
  feeMode,
  entryFeeRatePct,
  exitFeeRatePct,
  leverage,
  tradingFeeMarginPct,
  feeAdjustedMarginPnlPct,
}) {
  const src  = feeSource === "EXCHANGE_FILL" ? "ACTUAL" : "SIM";
  const drag = tradingFeeMarginPct != null ? `${tradingFeeMarginPct.toFixed(2)}% margin drag` : "? drag";
  const net  = feeAdjustedMarginPnlPct != null
    ? `net ${feeAdjustedMarginPnlPct >= 0 ? "+" : ""}${feeAdjustedMarginPnlPct.toFixed(2)}%`
    : "net ?";
  return `${src} | ${feeMode ?? "TT"} | ${entryFeeRatePct ?? "?"}%+${exitFeeRatePct ?? "?"}% | ${leverage ?? "?"}× ${drag} | ${net}`;
}
