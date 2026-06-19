// ─── SHADOW LONG AUDIT ────────────────────────────────────────────────────────
// OBSERVER-ONLY. No real LONG orders. No effect on LongLAB execution.
// Simulates LONG reversals after early SHORT stop losses for research.

export const SHADOW_LONG_CONFIG = {
  enabled: true,
  mode: "OBSERVER_ONLY",

  captureMaxSourceSlDurationMs: 180_000,
  hypothesisMaxSourceSlDurationMs: 60_000,
  minHypothesisAtrPct: 0.60,

  maxAuditDurationMs: 10 * 60_000,

  horizonMs: [
    15_000,
    30_000,
    60_000,
    120_000,
    180_000,
    300_000,
    600_000,
  ],

  fee: {
    takerFeePerSidePct: 0.05,
    roundTripFeePct: 0.10,
  },

  estimatedSlippage: {
    entryPct: 0.02,
    exitPct: 0.02,
  },

  defaultLeverageMode: "SAME_AS_SOURCE_SHORT",

  mirrorProfile: {
    enabled: true,
    stopLossPricePct: 1.0,
    takeProfitPricePct: 3.0,
    trailingDistancePricePct: 1.5,
    maxHoldMs: 10 * 60_000,
  },

  atrAdaptiveProfile: {
    enabled: true,
    stopAtrMultiple: 0.75,
    trailArmAtrMultiple: 1.0,
    trailDistanceAtrMultiple: 0.50,
    hardTpAtrMultiple: 2.0,
    maxHoldMs: 5 * 60_000,

    minStopPricePct: 0.35,
    maxStopPricePct: 1.50,
    minTrailPricePct: 0.20,
    maxTrailPricePct: 0.80,
  },
};

// ─── DURATION CLASSIFICATION ──────────────────────────────────────────────────

export function getEarlySlDurationLabel(durationMs) {
  if (durationMs <= 15_000) return "SHORT_SL_WITHIN_15S";
  if (durationMs <= 30_000) return "SHORT_SL_WITHIN_30S";
  if (durationMs <= 60_000) return "SHORT_SL_WITHIN_60S";
  if (durationMs <= 120_000) return "SHORT_SL_WITHIN_120S";
  if (durationMs <= 180_000) return "SHORT_SL_WITHIN_180S";
  return "SHORT_SL_NOT_EARLY";
}

export function getEarlySlBooleans(durationMs) {
  return {
    sourceShortInstantSl:  durationMs <= 60_000,
    sourceShortEarlySl:    durationMs <= 180_000,
    sourceShortUltraFastSl: durationMs <= 30_000,
  };
}

// ─── ATR CLASSIFICATION ───────────────────────────────────────────────────────

export function classifyShadowLongAtr(atrPct) {
  if (atrPct == null) return "ATR_UNKNOWN";
  if (atrPct < 0.20)  return "ATR_VERY_LOW";
  if (atrPct < 0.40)  return "ATR_LOW";
  if (atrPct < 0.60)  return "ATR_MEDIUM";
  if (atrPct < 1.00)  return "ATR_HIGH";
  if (atrPct < 2.00)  return "ATR_VERY_HIGH";
  return "ATR_EXTREME";
}

// ─── CANDIDATE CHECKS ─────────────────────────────────────────────────────────

export function isEarlySlAuditCandidate(sourceTrade, config = SHADOW_LONG_CONFIG) {
  if (!sourceTrade) return false;
  if (sourceTrade.closeReason !== "SL") return false;
  if (sourceTrade.closedAt == null || sourceTrade.entryTime == null) return false;
  const durationMs = sourceTrade.closedAt - sourceTrade.entryTime;
  return durationMs <= config.captureMaxSourceSlDurationMs;
}

export function isShadowLongHypothesisEligible(sourceTrade, config = SHADOW_LONG_CONFIG) {
  const reasons = [];
  if (!sourceTrade) return { eligible: false, reasons: ["NO_SOURCE_TRADE"] };

  if (sourceTrade.closeReason !== "SL") {
    reasons.push("NOT_SL_CLOSE");
  }

  const durationMs =
    sourceTrade.closedAt != null && sourceTrade.entryTime != null
      ? sourceTrade.closedAt - sourceTrade.entryTime
      : null;

  if (durationMs == null) {
    reasons.push("MISSING_TIMESTAMPS");
  } else if (durationMs > config.hypothesisMaxSourceSlDurationMs) {
    reasons.push("DURATION_TOO_LONG");
  }

  const atrPct = sourceTrade.atrPct ?? null;
  if (atrPct == null) {
    reasons.push("ATR_MISSING");
  } else if (atrPct < config.minHypothesisAtrPct) {
    reasons.push("ATR_BELOW_THRESHOLD");
  }

  if (sourceTrade.isStale === true) {
    reasons.push("STALE_MARKET");
  }
  if (sourceTrade.isInvalidMarket === true) {
    reasons.push("INVALID_MARKET");
  }

  return { eligible: reasons.length === 0, reasons };
}

// ─── BUILD AUDIT ──────────────────────────────────────────────────────────────

export function buildShadowLongAudit(sourceTrade, firstTickPrice, firstTickTime, marketSnap = {}, config = SHADOW_LONG_CONFIG) {
  const durationMs = (sourceTrade.closedAt ?? 0) - (sourceTrade.entryTime ?? 0);
  const { eligible, reasons } = isShadowLongHypothesisEligible(sourceTrade, config);

  const slippagePct = config.estimatedSlippage.entryPct;
  const entryPrice = firstTickPrice * (1 + slippagePct / 100);
  const leverage = sourceTrade.leverage ?? 5;

  const grossShortMarginPnlPct = sourceTrade.finalPnlPct ?? null;
  const feeAdjustedShortMarginPnlPct = sourceTrade.feeAdjustedFinalPnlPct ?? null;
  const sourceShortFeeNetMarginPnlPct =
    feeAdjustedShortMarginPnlPct != null
      ? feeAdjustedShortMarginPnlPct
      : grossShortMarginPnlPct != null
        ? grossShortMarginPnlPct - (config.fee.roundTripFeePct * leverage)
        : null;

  const sourceShortFeeNetNormPnlPct =
    sourceShortFeeNetMarginPnlPct != null && leverage > 0
      ? sourceShortFeeNetMarginPnlPct / leverage
      : null;

  const mirrorProfile = { ...config.mirrorProfile };
  const atrPct = sourceTrade.atrPct ?? null;
  const atrAdaptiveProfile = buildAtrAdaptiveProfileConfig(atrPct, config);

  return {
    id: `shadow-long:${sourceTrade.id}`,
    version: "shadow-long-audit-v1",

    mode: "OBSERVER_ONLY",
    status: "PENDING_ENTRY",

    symbol: sourceTrade.symbol,

    sourceShortTradeId:      sourceTrade.id,
    sourceShortRun:          sourceTrade.run ?? null,
    sourceShortSetId:        sourceTrade.setId ?? null,
    sourceShortParentBucket: sourceTrade.shortParentBucket ?? null,
    sourceShortSubBucket:    sourceTrade.shortSubBucket ?? null,
    sourceShortEntryTime:    sourceTrade.entryTime,
    sourceShortClosedAt:     sourceTrade.closedAt,
    sourceShortDurationMs:   durationMs,
    sourceShortDurationLabel: getEarlySlDurationLabel(durationMs),
    ...getEarlySlBooleans(durationMs),

    sourceShortEntryPrice:         sourceTrade.entryPrice ?? null,
    sourceShortExitPrice:          sourceTrade.exitPrice ?? sourceTrade.slPrice ?? null,
    sourceShortLeverage:           leverage,
    sourceShortGrossMarginPnlPct:  grossShortMarginPnlPct,
    sourceShortFeeNetMarginPnlPct,
    sourceShortGrossNormPnlPct:
      grossShortMarginPnlPct != null && leverage > 0
        ? grossShortMarginPnlPct / leverage
        : null,
    sourceShortFeeNetNormPnlPct,

    shadowLongHypothesisEligible:    eligible,
    shadowLongHypothesisFailReasons: reasons,

    atrPct,
    atrBucket:           sourceTrade.atrBucket ?? null,
    shadowLongAtrClass:  classifyShadowLongAtr(atrPct),

    aes:                 sourceTrade.absoluteEntryScore ?? sourceTrade.aes ?? null,
    absoluteEntryScore:  sourceTrade.absoluteEntryScore ?? null,

    entryRank:               sourceTrade.entryRank ?? null,
    change24h:               sourceTrade.change24h ?? null,
    spreadPct:               sourceTrade.spreadPct ?? null,
    cvdLabel:                sourceTrade.cvdLabel ?? null,
    priceVsVwapPct:          sourceTrade.priceVsVwapPct ?? null,
    last3TicksDirection:     sourceTrade.last3TicksDirection ?? null,
    immediateRedImpulse:     sourceTrade.immediateRedImpulse ?? null,
    immediateGreenImpulse:   sourceTrade.immediateGreenImpulse ?? null,
    redImpulseDetected:      sourceTrade.redImpulseDetected ?? null,
    greenImpulseDetected:    sourceTrade.greenImpulseDetected ?? null,
    macdHistogramDirection:  sourceTrade.macdHistogramDirection ?? null,
    rsi1m:                   sourceTrade.rsi1m ?? null,
    rsi3m:                   sourceTrade.rsi3m ?? null,
    rsi5m:                   sourceTrade.rsi5m ?? null,

    btcDirection:        marketSnap.btcDirection ?? sourceTrade.btcDirection ?? null,
    btcRegime:           marketSnap.btcRegime ?? sourceTrade.btcRegime ?? null,
    ethDirection:        marketSnap.ethDirection ?? sourceTrade.ethDirection ?? null,
    ethRegime:           marketSnap.ethRegime ?? sourceTrade.ethRegime ?? null,
    marketLivePnlState:  marketSnap.marketLivePnlState ?? null,
    marketNetPnlState:   marketSnap.marketNetPnlState ?? null,

    shadowLongSignalTime:          sourceTrade.closedAt,
    shadowLongFirstTickTime:       firstTickTime,
    shadowLongEntryTime:           firstTickTime,
    shadowLongEntryReferencePrice: firstTickPrice,
    shadowLongEntryPrice:          entryPrice,
    shadowLongTriggerDelayMs:      firstTickTime != null ? firstTickTime - sourceTrade.closedAt : null,
    shadowLongLeverage:            leverage,

    currentPrice:  firstTickPrice,
    priceHistory:  [{ t: firstTickTime, p: firstTickPrice }],

    grossMfeNormPct: 0,
    grossMaeNormPct: 0,
    mfeAtrMultiple:  null,
    maeAtrMultiple:  null,

    pnlAt15sNormPct:   null,
    pnlAt30sNormPct:   null,
    pnlAt60sNormPct:   null,
    pnlAt120sNormPct:  null,
    pnlAt180sNormPct:  null,
    pnlAt300sNormPct:  null,
    pnlAt600sNormPct:  null,

    feeNetPnlAt15sNormPct:   null,
    feeNetPnlAt30sNormPct:   null,
    feeNetPnlAt60sNormPct:   null,
    feeNetPnlAt120sNormPct:  null,
    feeNetPnlAt180sNormPct:  null,
    feeNetPnlAt300sNormPct:  null,
    feeNetPnlAt600sNormPct:  null,

    mirrorProfile,
    atrAdaptiveProfile,

    primaryProfileName:            "MIRROR_SOURCE_V1",
    shadowLongGrossNormPnlPct:     null,
    shadowLongFeeNetNormPnlPct:    null,
    shadowLongFeeNetMarginPnlPct:  null,

    combinedAdditiveMarginPnlPct:    null,
    combinedCompoundedMarginPnlPct:  null,
    combinedFeeNetNormPnlPct:        null,

    shortLossRecoveryRatio:    null,
    fullyRecoveredShortLoss:   null,
    profitableAfterFullRescue: null,

    mirrorCloseReason:           null,
    mirrorGrossNormPnlPct:       null,
    mirrorFeeNetNormPnlPct:      null,
    mirrorFeeNetMarginPnlPct:    null,
    mirrorHighestPrice:          null,
    mirrorLowestPrice:           null,
    mirrorTrailHigh:             null,

    atrProfileCloseReason:       null,
    atrProfileGrossNormPnlPct:   null,
    atrProfileFeeNetNormPnlPct:  null,
    atrProfileFeeNetMarginPnlPct: null,

    closeReason:    null,
    closedAt:       null,
    durationMs:     null,

    outcomeLabel:      null,
    diagnosticLabels:  [],

    priceSource:       "REST_POLL",
    samplingPrecision: "COARSE",
    dataWarnings:      ["SHADOW_LONG_COARSE_TIMING_WARNING"],
  };
}

function buildAtrAdaptiveProfileConfig(atrPct, config) {
  const ap = config.atrAdaptiveProfile;
  if (!atrPct || atrPct <= 0) {
    return {
      ...ap,
      resolvedStopPricePct:  ap.minStopPricePct,
      resolvedTrailPricePct: ap.minTrailPricePct,
      resolvedTpPricePct:    ap.minStopPricePct * 4,
    };
  }
  const rawStop  = atrPct * ap.stopAtrMultiple;
  const rawTrail = atrPct * ap.trailDistanceAtrMultiple;
  const rawTp    = atrPct * ap.hardTpAtrMultiple;

  return {
    ...ap,
    resolvedStopPricePct:  Math.min(ap.maxStopPricePct,  Math.max(ap.minStopPricePct,  rawStop)),
    resolvedTrailPricePct: Math.min(ap.maxTrailPricePct, Math.max(ap.minTrailPricePct, rawTrail)),
    resolvedTpPricePct:    rawTp,
  };
}

// ─── PNL CALCULATIONS ─────────────────────────────────────────────────────────

export function computeShadowLongPnl(entryPrice, exitPrice, leverage, config = SHADOW_LONG_CONFIG) {
  if (!entryPrice || !exitPrice) return { gross: null, feeNetNorm: null, feeNetMargin: null };
  const grossNormPct = ((exitPrice - entryPrice) / entryPrice) * 100;
  const feeNetNormPct =
    grossNormPct
    - config.fee.roundTripFeePct
    - config.estimatedSlippage.entryPct
    - config.estimatedSlippage.exitPct;
  const feeNetMarginPct = feeNetNormPct * leverage;
  return { gross: grossNormPct, feeNetNorm: feeNetNormPct, feeNetMargin: feeNetMarginPct };
}

export function computeCombinedFlipPnl(sourceShortFeeNetMarginPnlPct, shadowLongFeeNetMarginPnlPct, sourceShortFeeNetNormPnlPct, shadowLongFeeNetNormPnlPct) {
  const combined = {};

  if (sourceShortFeeNetNormPnlPct != null && shadowLongFeeNetNormPnlPct != null) {
    combined.combinedFeeNetNormPnlPct = sourceShortFeeNetNormPnlPct + shadowLongFeeNetNormPnlPct;
  } else {
    combined.combinedFeeNetNormPnlPct = null;
  }

  if (sourceShortFeeNetMarginPnlPct != null && shadowLongFeeNetMarginPnlPct != null) {
    combined.combinedAdditiveMarginPnlPct = sourceShortFeeNetMarginPnlPct + shadowLongFeeNetMarginPnlPct;

    const shortReturn = sourceShortFeeNetMarginPnlPct / 100;
    const longReturn  = shadowLongFeeNetMarginPnlPct  / 100;
    combined.combinedCompoundedMarginPnlPct = ((1 + shortReturn) * (1 + longReturn) - 1) * 100;
  } else {
    combined.combinedAdditiveMarginPnlPct   = null;
    combined.combinedCompoundedMarginPnlPct = null;
  }

  return combined;
}

export function computeRescueMeasurements(sourceShortFeeNetMarginPnlPct, shadowLongFeeNetMarginPnlPct, combinedCompoundedMarginPnlPct) {
  const ratio =
    shadowLongFeeNetMarginPnlPct != null && shadowLongFeeNetMarginPnlPct > 0 && sourceShortFeeNetMarginPnlPct != null
      ? shadowLongFeeNetMarginPnlPct / Math.abs(sourceShortFeeNetMarginPnlPct)
      : 0;

  return {
    shortLossRecoveryRatio:    ratio,
    fullyRecoveredShortLoss:   combinedCompoundedMarginPnlPct != null ? combinedCompoundedMarginPnlPct >= 0 : null,
    profitableAfterFullRescue: combinedCompoundedMarginPnlPct != null ? combinedCompoundedMarginPnlPct > 0 : null,
    partialRecovery:           ratio > 0 && ratio < 1,
  };
}

// ─── HORIZON SNAPSHOTS ────────────────────────────────────────────────────────

export function captureHorizonPnl(audit, currentTime, currentPrice, config = SHADOW_LONG_CONFIG) {
  if (!audit.shadowLongEntryPrice || !currentPrice) return {};
  const elapsed = currentTime - (audit.shadowLongEntryTime ?? audit.shadowLongSignalTime);
  const entry   = audit.shadowLongEntryPrice;
  const updates = {};

  for (const horizonMs of config.horizonMs) {
    const key = horizonMsToKey(horizonMs);
    if (audit[key] == null && elapsed >= horizonMs) {
      const grossNorm = ((currentPrice - entry) / entry) * 100;
      const feeNet    = grossNorm - config.fee.roundTripFeePct - config.estimatedSlippage.entryPct - config.estimatedSlippage.exitPct;
      updates[key] = parseFloat(grossNorm.toFixed(4));
      updates[feeNetKey(horizonMs)] = parseFloat(feeNet.toFixed(4));
    }
  }
  return updates;
}

function horizonMsToKey(ms) {
  const map = {
    15_000:  "pnlAt15sNormPct",
    30_000:  "pnlAt30sNormPct",
    60_000:  "pnlAt60sNormPct",
    120_000: "pnlAt120sNormPct",
    180_000: "pnlAt180sNormPct",
    300_000: "pnlAt300sNormPct",
    600_000: "pnlAt600sNormPct",
  };
  return map[ms] ?? null;
}

function feeNetKey(ms) {
  const map = {
    15_000:  "feeNetPnlAt15sNormPct",
    30_000:  "feeNetPnlAt30sNormPct",
    60_000:  "feeNetPnlAt60sNormPct",
    120_000: "feeNetPnlAt120sNormPct",
    180_000: "feeNetPnlAt180sNormPct",
    300_000: "feeNetPnlAt300sNormPct",
    600_000: "feeNetPnlAt600sNormPct",
  };
  return map[ms] ?? null;
}

// ─── MFE / MAE ────────────────────────────────────────────────────────────────

export function computeMfeMae(entryPrice, highestPrice, lowestPrice, atrPct) {
  if (!entryPrice) return { grossMfeNormPct: 0, grossMaeNormPct: 0, mfeAtrMultiple: null, maeAtrMultiple: null };
  const grossMfeNormPct = ((highestPrice - entryPrice) / entryPrice) * 100;
  const grossMaeNormPct = ((lowestPrice  - entryPrice) / entryPrice) * 100;
  const mfeAtrMultiple  = atrPct > 0 ? grossMfeNormPct / atrPct : null;
  const maeAtrMultiple  = atrPct > 0 ? Math.abs(grossMaeNormPct) / atrPct : null;
  return { grossMfeNormPct, grossMaeNormPct, mfeAtrMultiple, maeAtrMultiple };
}

// ─── MIRROR PROFILE SIMULATION ────────────────────────────────────────────────

export function simulateMirrorLongProfile(audit, priceHistory, config = SHADOW_LONG_CONFIG) {
  const prof = audit.mirrorProfile ?? config.mirrorProfile;
  const entry = audit.shadowLongEntryPrice;
  if (!entry || !priceHistory?.length) {
    return { closeReason: null, exitPrice: null, grossNormPnlPct: null, feeNetNormPnlPct: null, feeNetMarginPnlPct: null };
  }

  const slPrice = entry * (1 - prof.stopLossPricePct / 100);
  const tpPrice = entry * (1 + prof.takeProfitPricePct / 100);
  let trailHigh = entry;
  let trailStop = null;
  const maxTime = (audit.shadowLongEntryTime ?? audit.shadowLongSignalTime) + prof.maxHoldMs;

  for (const { t, p } of priceHistory) {
    if (p < slPrice) {
      return _mirrorExit(entry, slPrice, audit.shadowLongLeverage, "SL", config);
    }
    if (p >= tpPrice) {
      return _mirrorExit(entry, tpPrice, audit.shadowLongLeverage, "TP", config);
    }
    if (p > trailHigh) {
      trailHigh = p;
      trailStop = trailHigh * (1 - prof.trailingDistancePricePct / 100);
    }
    if (trailStop != null && p <= trailStop) {
      return _mirrorExit(entry, trailStop, audit.shadowLongLeverage, "TRAIL", config);
    }
    if (t >= maxTime) {
      return _mirrorExit(entry, p, audit.shadowLongLeverage, "TIMEOUT", config);
    }
  }
  return { closeReason: null, exitPrice: null, grossNormPnlPct: null, feeNetNormPnlPct: null, feeNetMarginPnlPct: null };
}

function _mirrorExit(entry, exitPrice, leverage, reason, config) {
  const gross = ((exitPrice - entry) / entry) * 100;
  const feeNetNorm = gross - config.fee.roundTripFeePct - config.estimatedSlippage.entryPct - config.estimatedSlippage.exitPct;
  return {
    closeReason: reason,
    exitPrice,
    grossNormPnlPct: parseFloat(gross.toFixed(4)),
    feeNetNormPnlPct: parseFloat(feeNetNorm.toFixed(4)),
    feeNetMarginPnlPct: parseFloat((feeNetNorm * leverage).toFixed(4)),
  };
}

// ─── ATR ADAPTIVE PROFILE SIMULATION ─────────────────────────────────────────

export function simulateAtrAdaptiveLongProfile(audit, priceHistory, config = SHADOW_LONG_CONFIG) {
  const prof  = audit.atrAdaptiveProfile ?? {};
  const entry = audit.shadowLongEntryPrice;
  if (!entry || !priceHistory?.length) {
    return { closeReason: null, exitPrice: null, grossNormPnlPct: null, feeNetNormPnlPct: null, feeNetMarginPnlPct: null };
  }

  const stopPct  = prof.resolvedStopPricePct  ?? config.atrAdaptiveProfile.minStopPricePct;
  const trailPct = prof.resolvedTrailPricePct ?? config.atrAdaptiveProfile.minTrailPricePct;
  const tpPct    = prof.resolvedTpPricePct    ?? stopPct * 4;
  const maxMs    = prof.maxHoldMs ?? config.atrAdaptiveProfile.maxHoldMs;

  const slPrice  = entry * (1 - stopPct / 100);
  const tpPrice  = entry * (1 + tpPct / 100);
  const armPrice = entry * (1 + (prof.trailArmAtrMultiple ?? 1.0) * (audit.atrPct ?? stopPct) / 100);

  let trailHigh  = entry;
  let trailArmed = false;
  let trailStop  = null;
  const entryTime = audit.shadowLongEntryTime ?? audit.shadowLongSignalTime;
  const maxTime   = entryTime + maxMs;

  for (const { t, p } of priceHistory) {
    if (p < slPrice && !trailArmed) {
      return _atrExit(entry, slPrice, audit.shadowLongLeverage, "SL", config);
    }
    if (p >= tpPrice) {
      return _atrExit(entry, tpPrice, audit.shadowLongLeverage, "TP", config);
    }
    if (p >= armPrice) trailArmed = true;
    if (trailArmed && p > trailHigh) {
      trailHigh = p;
      trailStop = trailHigh * (1 - trailPct / 100);
    }
    if (trailArmed && trailStop != null && p <= trailStop) {
      return _atrExit(entry, trailStop, audit.shadowLongLeverage, "TRAIL", config);
    }
    if (trailArmed && p < slPrice) {
      return _atrExit(entry, p, audit.shadowLongLeverage, "SL_AFTER_TRAIL", config);
    }
    if (t >= maxTime) {
      return _atrExit(entry, p, audit.shadowLongLeverage, "TIMEOUT", config);
    }
  }
  return { closeReason: null, exitPrice: null, grossNormPnlPct: null, feeNetNormPnlPct: null, feeNetMarginPnlPct: null };
}

function _atrExit(entry, exitPrice, leverage, reason, config) {
  const gross = ((exitPrice - entry) / entry) * 100;
  const feeNetNorm = gross - config.fee.roundTripFeePct - config.estimatedSlippage.entryPct - config.estimatedSlippage.exitPct;
  return {
    closeReason: reason,
    exitPrice,
    grossNormPnlPct: parseFloat(gross.toFixed(4)),
    feeNetNormPnlPct: parseFloat(feeNetNorm.toFixed(4)),
    feeNetMarginPnlPct: parseFloat((feeNetNorm * leverage).toFixed(4)),
  };
}

// ─── OUTCOME LABELS ───────────────────────────────────────────────────────────

export function classifyShadowLongOutcome(audit) {
  const {
    combinedCompoundedMarginPnlPct,
    shortLossRecoveryRatio,
    shadowLongFeeNetMarginPnlPct,
    status,
  } = audit;

  let outcomeLabel;

  if (status === "DATA_GAP") {
    outcomeLabel = "SHADOW_LONG_DATA_GAP";
  } else if (status === "EXPIRED") {
    outcomeLabel = "SHADOW_LONG_EXPIRED";
  } else if (combinedCompoundedMarginPnlPct == null) {
    outcomeLabel = null;
  } else if (combinedCompoundedMarginPnlPct > 0) {
    outcomeLabel = "SHADOW_LONG_FULL_RESCUE_AND_PROFIT";
  } else if ((shortLossRecoveryRatio ?? 0) >= 0.95) {
    outcomeLabel = "SHADOW_LONG_FULL_RESCUE_ONLY";
  } else if ((shortLossRecoveryRatio ?? 0) > 0) {
    outcomeLabel = "SHADOW_LONG_PARTIAL_RECOVERY";
  } else if ((shadowLongFeeNetMarginPnlPct ?? 0) < 0) {
    outcomeLabel = "SHADOW_LONG_ADDED_TO_LOSS";
  } else {
    outcomeLabel = "SHADOW_LONG_NO_RECOVERY";
  }

  const diagnostics = buildDiagnosticLabels(audit);

  return { outcomeLabel, diagnosticLabels: diagnostics };
}

function buildDiagnosticLabels(audit) {
  const labels = [];

  if (audit.samplingPrecision === "COARSE" || audit.samplingPrecision === "FIFTEEN_SECOND") {
    labels.push("SHADOW_LONG_COARSE_TIMING_WARNING");
  }

  const shortDur = audit.sourceShortDurationMs ?? Infinity;
  const longDur  = audit.durationMs ?? Infinity;
  if (shortDur <= 60_000 && audit.mirrorCloseReason === "SL" && longDur <= 60_000) {
    labels.push("SHADOW_LONG_WHIPSAW_TRAP");
    labels.push("SHORT_SL_THEN_LONG_INSTANT_SL");
  }

  if ((audit.combinedCompoundedMarginPnlPct ?? -1) >= 0) {
    labels.push("SHORT_SL_REVERSAL_CONFIRMED");
  }

  const entry = audit.shadowLongEntryPrice;
  const mfe   = audit.grossMfeNormPct ?? 0;
  const finPnl = audit.shadowLongFeeNetNormPnlPct ?? null;
  if (entry && finPnl != null && finPnl > 0 && longDur <= 30_000) {
    labels.push("SHADOW_LONG_INSTANT_WIN");
  }
  if (entry && audit.mirrorCloseReason === "SL" && longDur != null && longDur <= 30_000) {
    labels.push("SHADOW_LONG_INSTANT_SL");
  }

  if (mfe > 0 && finPnl != null && finPnl <= 0) {
    labels.push("SHADOW_LONG_MFE_WITHOUT_CAPTURE");
  }

  const feeOnly = audit.shadowLongFeeNetNormPnlPct ?? null;
  const gross   = audit.shadowLongGrossNormPnlPct ?? null;
  if (gross != null && gross > 0 && feeOnly != null && feeOnly <= 0) {
    labels.push("SHADOW_LONG_FEE_ONLY_EDGE");
  }

  const atrNet    = audit.atrProfileFeeNetNormPnlPct ?? null;
  const mirrorNet = audit.mirrorFeeNetNormPnlPct ?? null;
  if (atrNet != null && mirrorNet != null) {
    if (atrNet > mirrorNet + 0.05) labels.push("SHADOW_LONG_ATR_PROFILE_OUTPERFORMED");
    if (mirrorNet > atrNet + 0.05) labels.push("SHADOW_LONG_MIRROR_PROFILE_OUTPERFORMED");
  }

  if (audit.btcDirection === "UP") labels.push("SHADOW_LONG_BTC_UP_TAILWIND");
  if (audit.btcDirection === "DOWN") labels.push("SHADOW_LONG_BTC_DOWN_HEADWIND");
  if (audit.ethDirection === "UP") labels.push("SHADOW_LONG_ETH_UP_TAILWIND");
  if (audit.ethDirection === "DOWN") labels.push("SHADOW_LONG_ETH_DOWN_HEADWIND");

  const aes = audit.aes ?? null;
  if (aes != null) {
    if (aes >= 70) labels.push("SHADOW_LONG_HIGH_AES");
    else labels.push("SHADOW_LONG_LOW_AES");
  }

  const bucket = audit.sourceShortParentBucket ?? "";
  if (bucket.includes("GAINER")) labels.push("SHADOW_LONG_FROM_GRAINER_SHORT");
  else if (bucket.includes("LOSER")) labels.push("SHADOW_LONG_FROM_LOSER_SHORT");

  const shortPnl = audit.sourceShortFeeNetMarginPnlPct ?? null;
  if (shortPnl != null && shortPnl < 0) labels.push("SHADOW_LONG_FROM_LOSER_SHORT");
  if (shortPnl != null && shortPnl > 0) labels.push("SHADOW_LONG_FROM_GRAINER_SHORT");

  return [...new Set(labels)];
}

// ─── WHIPSAW CHECK ────────────────────────────────────────────────────────────

export function checkWhipsaw(audit) {
  return (
    (audit.sourceShortDurationMs ?? Infinity) <= 60_000 &&
    audit.mirrorCloseReason === "SL" &&
    (audit.durationMs ?? Infinity) <= 60_000
  );
}

// ─── UPDATE AUDIT ─────────────────────────────────────────────────────────────

export function updateShadowLongAudit(audit, newPrice, newTime, config = SHADOW_LONG_CONFIG) {
  if (audit.status === "COMPLETED" || audit.status === "EXPIRED" || audit.status === "DATA_GAP") {
    return audit;
  }

  const entry = audit.shadowLongEntryPrice;
  if (!entry || !newPrice) return { ...audit, status: "ACTIVE" };

  const updatedHistory = [...(audit.priceHistory ?? []), { t: newTime, p: newPrice }]
    .slice(-500);

  const prices    = updatedHistory.map(h => h.p);
  const highPrice = Math.max(...prices, entry);
  const lowPrice  = Math.min(...prices, entry);

  const { grossMfeNormPct, grossMaeNormPct, mfeAtrMultiple, maeAtrMultiple } =
    computeMfeMae(entry, highPrice, lowPrice, audit.atrPct);

  const horizonUpdates = captureHorizonPnl(audit, newTime, newPrice, config);

  const mirrorResult = simulateMirrorLongProfile(
    { ...audit, priceHistory: updatedHistory },
    updatedHistory,
    config,
  );
  const atrResult = simulateAtrAdaptiveLongProfile(
    { ...audit, priceHistory: updatedHistory },
    updatedHistory,
    config,
  );

  const entryTime  = audit.shadowLongEntryTime ?? audit.shadowLongSignalTime;
  const elapsedMs  = newTime - entryTime;
  const maxMs      = config.maxAuditDurationMs;

  const isExpired  = elapsedMs >= maxMs;
  const mirrorDone = mirrorResult.closeReason != null;

  const primaryExitPrice = mirrorDone ? mirrorResult.exitPrice : (isExpired ? newPrice : null);
  const primaryClose     = mirrorDone ? mirrorResult.closeReason : (isExpired ? "TIMEOUT" : null);

  let updated = {
    ...audit,
    ...horizonUpdates,
    status:        primaryClose != null ? "COMPLETED" : "ACTIVE",
    currentPrice:  newPrice,
    priceHistory:  updatedHistory,
    grossMfeNormPct,
    grossMaeNormPct,
    mfeAtrMultiple,
    maeAtrMultiple,

    mirrorCloseReason:         mirrorResult.closeReason,
    mirrorGrossNormPnlPct:     mirrorResult.grossNormPnlPct,
    mirrorFeeNetNormPnlPct:    mirrorResult.feeNetNormPnlPct,
    mirrorFeeNetMarginPnlPct:  mirrorResult.feeNetMarginPnlPct,

    atrProfileCloseReason:        atrResult.closeReason,
    atrProfileGrossNormPnlPct:    atrResult.grossNormPnlPct,
    atrProfileFeeNetNormPnlPct:   atrResult.feeNetNormPnlPct,
    atrProfileFeeNetMarginPnlPct: atrResult.feeNetMarginPnlPct,
  };

  if (primaryClose != null) {
    updated = finalizeShadowLongAudit(updated, primaryExitPrice, primaryClose, newTime, config);
  }

  return updated;
}

// ─── FINALIZE ─────────────────────────────────────────────────────────────────

export function finalizeShadowLongAudit(audit, exitPrice, closeReason, closedAt, config = SHADOW_LONG_CONFIG) {
  const entry    = audit.shadowLongEntryPrice;
  const leverage = audit.shadowLongLeverage ?? 1;
  const entryTime = audit.shadowLongEntryTime ?? audit.shadowLongSignalTime;

  const pnl = computeShadowLongPnl(entry, exitPrice, leverage, config);

  const combined = computeCombinedFlipPnl(
    audit.sourceShortFeeNetMarginPnlPct,
    pnl.feeNetMargin,
    audit.sourceShortFeeNetNormPnlPct,
    pnl.feeNetNorm,
  );

  const rescue = computeRescueMeasurements(
    audit.sourceShortFeeNetMarginPnlPct,
    pnl.feeNetMargin,
    combined.combinedCompoundedMarginPnlPct,
  );

  const finalized = {
    ...audit,
    status: "COMPLETED",
    closeReason,
    closedAt,
    durationMs: closedAt - entryTime,

    shadowLongGrossNormPnlPct:    pnl.gross != null ? parseFloat(pnl.gross.toFixed(4)) : null,
    shadowLongFeeNetNormPnlPct:   pnl.feeNetNorm != null ? parseFloat(pnl.feeNetNorm.toFixed(4)) : null,
    shadowLongFeeNetMarginPnlPct: pnl.feeNetMargin != null ? parseFloat(pnl.feeNetMargin.toFixed(4)) : null,

    ...combined,
    ...rescue,
  };

  const { outcomeLabel, diagnosticLabels } = classifyShadowLongOutcome(finalized);
  return { ...finalized, outcomeLabel, diagnosticLabels };
}
