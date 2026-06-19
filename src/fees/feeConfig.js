// ─── FEE CONFIG ───────────────────────────────────────────────────────────────
// Canonical fee model configuration for LongLAB.
// All fee arithmetic uses values from this config unless overridden by a
// trade-level frozen snapshot.

export const FEE_MODE = {
  TAKER_TAKER:      "TAKER_TAKER",
  MAKER_TAKER:      "MAKER_TAKER",
  TAKER_MAKER:      "TAKER_MAKER",
  MAKER_MAKER:      "MAKER_MAKER",
  EXCHANGE_ACTUAL:  "EXCHANGE_ACTUAL",
  IMPORTED:         "IMPORTED",
  MIXED:            "MIXED",
};

export const FEE_SOURCE = {
  SIMULATED_CONFIG:  "SIMULATED_CONFIG",
  EXCHANGE_FILL:     "EXCHANGE_FILL",
  IMPORTED_LOG:      "IMPORTED_LOG",
  LEGACY_RECOMPUTED: "LEGACY_RECOMPUTED",
  MIXED:             "MIXED",
};

export const FEE_CALCULATION_CONFIDENCE = {
  EXACT:      "EXACT",
  ESTIMATED:  "ESTIMATED",
  INCOMPLETE: "INCOMPLETE",
};

export const FEE_AWARE_EXECUTION_MODE = {
  LOG_ONLY:               "LOG_ONLY",
  APPLY_FIRST_LOCK_ONLY:  "APPLY_FIRST_LOCK_ONLY",
};

export const POSITION_SIZING_MODE = {
  PERCENT_ONLY:          "PERCENT_ONLY",
  FIXED_MARGIN_USD:      "FIXED_MARGIN_USD",
  FIXED_NOTIONAL_USD:    "FIXED_NOTIONAL_USD",
};

export const DEFAULT_FEE_CONFIG = {
  feeModelId:      "BINANCE_USDTM_DEFAULT",
  feeModelVersion: "2.0.0",

  source:          FEE_SOURCE.SIMULATED_CONFIG,
  market:          "BINANCE_USDT_M",
  settlementAsset: "USDT",

  makerFeeRatePct: 0.02,
  takerFeeRatePct: 0.05,

  defaultEntryOrderType: "TAKER",
  defaultExitOrderType:  "TAKER",

  positionSizingMode:       POSITION_SIZING_MODE.PERCENT_ONLY,
  simulatedMarginPerTradeUsd: null,

  includeFundingInNetAfterAllCosts:   false,
  includeSlippageInNetAfterAllCosts:  false,

  defaultAccountingView: "NET_AFTER_FEES",
  feeAwareExecutionMode: FEE_AWARE_EXECUTION_MODE.LOG_ONLY,

  profitLockFeeSafety: {
    enabled:                              true,
    executionMode:                        FEE_AWARE_EXECUTION_MODE.APPLY_FIRST_LOCK_ONLY,
    minProtectedNetAfterFeesMarginPct:    0.25,
    minTriggerToFloorHeadroomMarginPct:   0.50,
    floorRoundingIncrementMarginPct:      0.05,
    useActualEntryFeeWhenAvailable:       true,
    useProjectedTakerExitFeeForMarketLockExit: true,
    includeFunding:   false,
    includeSlippage:  false,
    neverLowerExistingFloor: true,
  },
};

/** Resolve the entry fee rate for a given order type from a fee config. */
export function resolveEntryFeeRate(config = DEFAULT_FEE_CONFIG, orderType) {
  const ot = orderType ?? config.defaultEntryOrderType;
  return ot === "MAKER" ? config.makerFeeRatePct : config.takerFeeRatePct;
}

/** Resolve the exit fee rate for a given order type from a fee config. */
export function resolveExitFeeRate(config = DEFAULT_FEE_CONFIG, orderType) {
  const ot = orderType ?? config.defaultExitOrderType;
  return ot === "MAKER" ? config.makerFeeRatePct : config.takerFeeRatePct;
}

/** Resolve the fee mode string from entry + exit order types. */
export function resolveFeeMode(entryOrderType, exitOrderType) {
  const e = entryOrderType === "MAKER" ? "MAKER" : "TAKER";
  const x = exitOrderType  === "MAKER" ? "MAKER" : "TAKER";
  return `${e}_${x}`;
}

/** Create a frozen fee snapshot for a trade at entry time. */
export function captureFeeSnapshot(config = DEFAULT_FEE_CONFIG) {
  return {
    feeModelId:      config.feeModelId,
    feeModelVersion: config.feeModelVersion,
    feeSource:       config.source,
    feeMode:         resolveFeeMode(config.defaultEntryOrderType, config.defaultExitOrderType),
    feeSnapshotCapturedAt: Date.now(),

    entryOrderType:  config.defaultEntryOrderType,
    exitOrderType:   config.defaultExitOrderType,
    entryFeeRatePct: resolveEntryFeeRate(config),
    exitFeeRatePct:  resolveExitFeeRate(config),
    makerFeeRatePct: config.makerFeeRatePct,
    takerFeeRatePct: config.takerFeeRatePct,
  };
}
