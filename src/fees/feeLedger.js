// ─── FEE LEDGER ───────────────────────────────────────────────────────────────
// Fee event record structure and helpers.
// Only meaningful state transitions are persisted; projected-exit fees are
// recalculated in memory on each tick.

export const FEE_EVENT_TYPE = {
  ENTRY_COMMISSION:           "ENTRY_COMMISSION",
  EXIT_COMMISSION:            "EXIT_COMMISSION",
  PROJECTED_EXIT_COMMISSION:  "PROJECTED_EXIT_COMMISSION",
  FUNDING_PAYMENT:            "FUNDING_PAYMENT",
  FUNDING_RECEIPT:            "FUNDING_RECEIPT",
  REBATE:                     "REBATE",
  ADJUSTMENT:                 "ADJUSTMENT",
};

export const FEE_EVENT_STATUS = {
  ESTIMATED:    "ESTIMATED",
  ACCRUED:      "ACCRUED",
  RECONCILED:   "RECONCILED",
};

let _eventCounter = 0;

function nextEventId() {
  return `fee_evt_${Date.now()}_${++_eventCounter}`;
}

/**
 * Create a fee event record.
 */
export function createFeeEvent({
  tradeId,
  runId,
  setId,
  sessionId,
  eventType,
  status,
  source,
  orderType,
  feeRatePct,
  notionalUsd,
  feeAmountUsd,
  feeMarginPct,
  feeNormPct,
  asset = "USDT",
  occurredAt,
  exchangeOrderId = null,
  exchangeFillId  = null,
  feeModelId,
  feeModelVersion,
}) {
  return {
    feeEventId:      nextEventId(),
    tradeId,
    runId,
    setId,
    sessionId,

    eventType,
    status,
    source,

    orderType,
    feeRatePct,
    notionalUsd:  notionalUsd  ?? null,
    feeAmountUsd: feeAmountUsd ?? null,
    feeMarginPct: feeMarginPct ?? null,
    feeNormPct:   feeNormPct   ?? null,
    asset,

    occurredAt:     occurredAt ?? Date.now(),
    calculatedAt:   Date.now(),
    exchangeOrderId,
    exchangeFillId,
    feeModelId,
    feeModelVersion,
  };
}

/**
 * Create an entry commission event from a trade sample's fee accounting data.
 */
export function createEntryFeeEvent(sample, feeAccounting, source) {
  return createFeeEvent({
    tradeId:      sample.id ?? sample.tradeId,
    runId:        sample.run ?? sample.runId,
    setId:        sample.set ?? sample.setId,
    sessionId:    sample.sessionId,
    eventType:    FEE_EVENT_TYPE.ENTRY_COMMISSION,
    status:       source === "EXCHANGE_FILL" ? FEE_EVENT_STATUS.RECONCILED : FEE_EVENT_STATUS.ESTIMATED,
    source:       source ?? "SIMULATED_CONFIG",
    orderType:    feeAccounting.entryOrderType,
    feeRatePct:   feeAccounting.entryFeeRatePct,
    notionalUsd:  feeAccounting.entryNotionalUsd,
    feeAmountUsd: feeAccounting.entryFeeUsd,
    feeMarginPct: feeAccounting.entryFeeMarginPct,
    feeNormPct:   feeAccounting.entryFeeNormPct,
    occurredAt:   sample.entryTime ?? Date.now(),
    feeModelId:   feeAccounting.feeModelId,
    feeModelVersion: feeAccounting.feeModelVersion,
  });
}

/**
 * Create a finalized exit commission event.
 */
export function createExitFeeEvent(sample, feeAccounting, source) {
  return createFeeEvent({
    tradeId:      sample.id ?? sample.tradeId,
    runId:        sample.run ?? sample.runId,
    setId:        sample.set ?? sample.setId,
    sessionId:    sample.sessionId,
    eventType:    FEE_EVENT_TYPE.EXIT_COMMISSION,
    status:       source === "EXCHANGE_FILL" ? FEE_EVENT_STATUS.RECONCILED : FEE_EVENT_STATUS.ESTIMATED,
    source:       source ?? "SIMULATED_CONFIG",
    orderType:    feeAccounting.exitOrderType,
    feeRatePct:   feeAccounting.exitFeeRatePct,
    notionalUsd:  feeAccounting.exitNotionalUsd,
    feeAmountUsd: feeAccounting.exitFeeUsd,
    feeMarginPct: feeAccounting.exitFeeMarginPct,
    feeNormPct:   feeAccounting.exitFeeNormPct,
    occurredAt:   sample.closeTime ?? Date.now(),
    feeModelId:   feeAccounting.feeModelId,
    feeModelVersion: feeAccounting.feeModelVersion,
  });
}

/**
 * Build a structured fee log payload for debug logging.
 */
export function buildFeeLogPayload(sample, feeAccounting, extras = {}) {
  return {
    tradeId:       sample.id ?? sample.tradeId,
    runId:         sample.run ?? sample.runId,
    setId:         sample.set ?? sample.setId,
    sessionId:     sample.sessionId,
    symbol:        sample.symbol,
    leverage:      sample.leverage,
    feeModelId:    feeAccounting.feeModelId,
    feeModelVersion: feeAccounting.feeModelVersion,
    feeSource:     feeAccounting.feeSource,
    feeMode:       feeAccounting.feeMode,
    entryFeeRatePct:  feeAccounting.entryFeeRatePct,
    exitFeeRatePct:   feeAccounting.exitFeeRatePct,
    grossMarginPnlPct:       feeAccounting.grossMarginPnlPct,
    tradingFeeMarginPct:     feeAccounting.tradingFeeMarginPct,
    feeAdjustedMarginPnlPct: feeAccounting.feeAdjustedMarginPnlPct,
    calculationConfidence:   feeAccounting.feeCalculationConfidence,
    timestamp: Date.now(),
    ...extras,
  };
}
