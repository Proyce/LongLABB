// ─── LONG TRADE MATH ─────────────────────────────────────────────────────────
// Single source of truth for all direction-correct LONG formulas.
// Favorable move = price RISES above entry.
// SL is BELOW entry. TP is ABOVE entry. Trail follows highest price.

// ─── PRICE PNL ───────────────────────────────────────────────────────────────

export function computeLongPricePnlPct(entryPrice, currentPrice) {
  if (!entryPrice || entryPrice === 0) return 0;
  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

export function computeLongMarginPnlPct(entryPrice, currentPrice, leverage) {
  return computeLongPricePnlPct(entryPrice, currentPrice) * leverage;
}

// ─── SL / TP PRICES ──────────────────────────────────────────────────────────

// SL is below entry for a long
export function computeLongSlPrice(entryPrice, stopLossPricePct) {
  return entryPrice * (1 - stopLossPricePct / 100);
}

// TP is above entry for a long
export function computeLongTpPrice(entryPrice, takeProfitPricePct) {
  return entryPrice * (1 + takeProfitPricePct / 100);
}

// ─── TRAILING STOP ───────────────────────────────────────────────────────────

// Trail high: the highest price seen since entry. Never decreases.
export function updateLongTrailHigh(prevTrailHigh, currentPrice) {
  if (prevTrailHigh == null) return currentPrice;
  return Math.max(prevTrailHigh, currentPrice);
}

// Trail stop is below the trail high. Close when price drops to/through this.
export function computeLongTrailStop(trailHigh, trailingDistancePricePct) {
  if (trailHigh == null) return null;
  return trailHigh * (1 - trailingDistancePricePct / 100);
}

export function isLongTrailTriggered(currentPrice, trailStop) {
  if (trailStop == null) return false;
  return currentPrice <= trailStop;
}

// ─── PROFIT LOCK ─────────────────────────────────────────────────────────────

// Profit lock price is ABOVE entry for longs.
// lockedMarginPct is a percentage of margin (e.g. 2.0 for 2% margin PnL lock floor).
export function computeLongProfitLockPrice(entryPrice, lockedMarginPct, leverage) {
  if (!leverage || leverage === 0) return entryPrice;
  const lockedPricePct = lockedMarginPct / leverage;
  return entryPrice * (1 + lockedPricePct / 100);
}

// Profit lock activates once current price has risen past the lock price.
// After activation, close if price falls back to or through the lock price.
export function isLongProfitLockTriggered(currentPrice, profitLockPrice) {
  if (profitLockPrice == null) return false;
  return currentPrice <= profitLockPrice;
}

// ─── MFE / MAE ───────────────────────────────────────────────────────────────

// MFE (Maximum Favorable Excursion): how far price rose above entry. Positive value.
// MAE (Maximum Adverse Excursion): how far price fell below entry. Positive magnitude.
export function computeLongMfeMae(entryPrice, highestPrice, lowestPrice, atrPct) {
  if (!entryPrice) {
    return { mfePricePct: 0, maePricePct: 0, mfeAtrMultiple: null, maeAtrMultiple: null };
  }
  const mfePricePct = ((highestPrice - entryPrice) / entryPrice) * 100;  // positive when price rose
  const maePricePct = ((entryPrice - lowestPrice) / entryPrice) * 100;   // positive when price fell
  const mfeAtrMultiple = atrPct > 0 ? mfePricePct / atrPct : null;
  const maeAtrMultiple = atrPct > 0 ? maePricePct / atrPct : null;
  return { mfePricePct, maePricePct, mfeAtrMultiple, maeAtrMultiple };
}

// Incremental MFE/MAE update (called on each price tick)
export function updateLongMfeMae(prevMfePricePct, prevMaePricePct, entryPrice, currentPrice) {
  const currentPricePnlPct = computeLongPricePnlPct(entryPrice, currentPrice);
  const mfePricePct = Math.max(prevMfePricePct ?? 0, currentPricePnlPct);
  const maePricePct = Math.max(prevMaePricePct ?? 0, -currentPricePnlPct);
  return { mfePricePct, maePricePct };
}

// ─── FEE-ADJUSTED PNL ────────────────────────────────────────────────────────

export function computeLongFeeAdjustedPnl(grossNormPct, roundTripFeePct, slippagePct, leverage) {
  const feeAdjustedNormPct = grossNormPct - roundTripFeePct - slippagePct;
  const feeAdjustedMarginPct = feeAdjustedNormPct * leverage;
  return { feeAdjustedNormPct, feeAdjustedMarginPct };
}

// Convenience: compute full PnL bundle for a closed long trade
export function computeClosedLongPnl(entryPrice, exitPrice, leverage, roundTripFeePct = 0.10, slippagePct = 0.04) {
  if (!entryPrice || !exitPrice) {
    return {
      priceMovePct: null,
      grossNormPct: null,
      grossNormPnlPct: null,
      grossMarginPct: null,
      grossLeveragedPnlPct: null,
      feeAdjustedNormPct: null,
      feeAdjustedNormPnlPct: null,
      feeAdjustedMarginPct: null,
      feeAdjustedLeveragedPnlPct: null,
    };
  }
  const grossNormPct   = computeLongPricePnlPct(entryPrice, exitPrice);
  const grossMarginPct = grossNormPct * leverage;
  const { feeAdjustedNormPct, feeAdjustedMarginPct } = computeLongFeeAdjustedPnl(
    grossNormPct, roundTripFeePct, slippagePct, leverage
  );
  const priceMovePct = parseFloat(grossNormPct.toFixed(4));
  const grossLeveragedPnlPct = parseFloat(grossMarginPct.toFixed(4));
  const feeAdjustedNormPnlPct = parseFloat(feeAdjustedNormPct.toFixed(4));
  const feeAdjustedLeveragedPnlPct = parseFloat(feeAdjustedMarginPct.toFixed(4));
  return {
    // Canonical unambiguous names.
    priceMovePct,
    grossNormPnlPct: priceMovePct,
    grossLeveragedPnlPct,
    feeAdjustedNormPnlPct,
    feeAdjustedLeveragedPnlPct,
    // Backward-compatible aliases retained for existing analytics.
    grossNormPct: priceMovePct,
    grossMarginPct: grossLeveragedPnlPct,
    feeAdjustedNormPct: feeAdjustedNormPnlPct,
    feeAdjustedMarginPct: feeAdjustedLeveragedPnlPct,
  };
}
