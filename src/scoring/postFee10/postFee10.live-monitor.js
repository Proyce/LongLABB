const CHECKPOINTS_MS = [5_000, 15_000, 30_000, 60_000];

const finiteNumberOrNull = v => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function marginPnlAtPrice(trade, price) {
  const entry = finiteNumberOrNull(trade?.entryPrice);
  const p = finiteNumberOrNull(price);
  const leverage = finiteNumberOrNull(trade?.leverage) ?? 1;
  if (!entry || p == null) return null;
  return ((entry - p) / entry) * 100 * leverage;
}

function adverseMoveAtPrice(trade, price) {
  const entry = finiteNumberOrNull(trade?.entryPrice);
  const p = finiteNumberOrNull(price);
  if (!entry || p == null) return null;
  return ((p - entry) / entry) * 100;
}

function checkpointPoint(history, entryTime, checkpointMs) {
  return history
    .filter(p => finiteNumberOrNull(p?.t) != null && finiteNumberOrNull(p.t) - entryTime >= checkpointMs)
    .sort((a, b) => a.t - b.t)[0] ?? null;
}

export function evaluatePostFee10LiveConfirmation(trade, now = Date.now()) {
  const history = Array.isArray(trade?.priceHistory) ? trade.priceHistory : [];
  const entryTime = finiteNumberOrNull(trade?.entryTime);
  if (!entryTime || !history.length) {
    return {
      postFee10LiveConfirmationScore: null,
      postFee10LiveConfirmationLabels: [],
      postFee10LiveConfirmationWarnings: [],
      postFee10LiveConfirmationCheckpoints: [],
    };
  }

  const available = history.filter(p => finiteNumberOrNull(p?.t) != null && p.t <= now);
  let mfe = 0;
  let mae = 0;
  for (const point of available) {
    const pnl = marginPnlAtPrice(trade, point?.p);
    const adverse = adverseMoveAtPrice(trade, point?.p);
    if (pnl != null) mfe = Math.max(mfe, pnl);
    if (adverse != null) mae = Math.max(mae, adverse);
  }

  let score = 50;
  const labels = [];
  const warnings = [];
  if (mfe >= 5) {
    score += 20;
    labels.push("POST_FEE_10_FAST_MFE_EXPANSION");
  } else if (mfe >= 3) {
    score += 12;
  } else if (now - entryTime >= 30_000) {
    score -= 10;
    labels.push("POST_FEE_10_EARLY_STALLED");
  }

  if (mae <= 0.25) {
    score += 10;
    labels.push("POST_FEE_10_LOW_MAE_START");
  } else if (mae >= 1) {
    score -= 15;
    warnings.push("POST_FEE_10_BUYER_DANGER_RETURNED");
  }

  if (trade?.greenImpulseDetected === true || trade?.immediateGreenImpulse === true) {
    score -= 20;
    warnings.push("POST_FEE_10_BUYER_DANGER_RETURNED");
  }
  if (trade?.vwapContextLabel === "VWAP_RECLAIM" || trade?.priceVsVwapLabel === "ABOVE_VWAP") {
    score -= 10;
    warnings.push("POST_FEE_10_BUYER_DANGER_RETURNED");
  }
  if (trade?.btcRunDirection === "UP" || trade?.btcDirection15m === "UP") {
    score -= 8;
  }

  if (score >= 65) labels.push("POST_FEE_10_EARLY_CONFIRMING");
  if (score < 45 && now - entryTime >= 30_000) labels.push("POST_FEE_10_FAILED_FOLLOW_THROUGH");

  const checkpoints = CHECKPOINTS_MS
    .map(ms => {
      const point = checkpointPoint(available, entryTime, ms);
      if (!point) return null;
      return {
        checkpointMs: ms,
        evaluatedAt: new Date(point.t).toISOString(),
        marginPnlPct: marginPnlAtPrice(trade, point.p),
        adverseMovePct: adverseMoveAtPrice(trade, point.p),
      };
    })
    .filter(Boolean);

  return {
    postFee10LiveConfirmationScore: Math.max(0, Math.min(100, Math.round(score))),
    postFee10LiveConfirmationLabels: [...new Set(labels)],
    postFee10LiveConfirmationWarnings: [...new Set(warnings)],
    postFee10LiveConfirmationCheckpoints: checkpoints,
  };
}
