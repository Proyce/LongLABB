const finiteNumberOrNull = v => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function feeAdjustedFinalPnlPct(trade) {
  const explicit =
    finiteNumberOrNull(trade?.feeAdjustedFinalPnlPct) ??
    finiteNumberOrNull(trade?.feeAdjustedMarginPnlPct);
  if (explicit != null) return explicit;

  const normalizedMarginPnlPct =
    finiteNumberOrNull(trade?.normalizedMarginPnlPct) ??
    finiteNumberOrNull(trade?.rawMarginPnlPct) ??
    finiteNumberOrNull(trade?.finalPnlPct);
  if (normalizedMarginPnlPct == null) return null;

  const totalFeeDragPct =
    finiteNumberOrNull(trade?.totalFeeDragPct) ??
    finiteNumberOrNull(trade?.feeDragMarginPct) ??
    finiteNumberOrNull(trade?.feeDragPct) ??
    0;

  return Number((normalizedMarginPnlPct - totalFeeDragPct).toFixed(4));
}

function normalizedMarginPnlPct(trade) {
  return (
    finiteNumberOrNull(trade?.normalizedMarginPnlPct) ??
    finiteNumberOrNull(trade?.rawMarginPnlPct) ??
    finiteNumberOrNull(trade?.finalPnlPct) ??
    null
  );
}

function marginPnlAtPrice(trade, price) {
  const entry = finiteNumberOrNull(trade?.entryPrice);
  const p = finiteNumberOrNull(price);
  const leverage = finiteNumberOrNull(trade?.leverage) ?? 1;
  if (!entry || p == null) return null;
  return ((entry - p) / entry) * 100 * leverage;
}

function feeAdjustedPnlAtPrice(trade, price) {
  const margin = marginPnlAtPrice(trade, price);
  if (margin == null) return null;
  const feeDrag =
    finiteNumberOrNull(trade?.feeDragMarginPct) ??
    finiteNumberOrNull(trade?.feeDragPct) ??
    0;
  return margin - feeDrag;
}

function adverseMoveAtPrice(trade, price) {
  const entry = finiteNumberOrNull(trade?.entryPrice);
  const p = finiteNumberOrNull(price);
  if (!entry || p == null) return null;
  return ((p - entry) / entry) * 100;
}

function firstReachedPostFee10(trade) {
  const history = Array.isArray(trade?.priceHistory) ? trade.priceHistory : [];
  const entryTime = finiteNumberOrNull(trade?.entryTime);
  for (const point of history) {
    const net = feeAdjustedPnlAtPrice(trade, point?.p);
    if (net != null && net >= 10) {
      const ts = finiteNumberOrNull(point?.t) ?? entryTime;
      return {
        reachedPostFee10At: ts != null ? new Date(ts).toISOString() : null,
        timeToPostFee10Ms: ts != null && entryTime != null ? ts - entryTime : null,
      };
    }
  }

  const finalNet = feeAdjustedFinalPnlPct(trade);
  if (finalNet != null && finalNet >= 10) {
    const ts = finiteNumberOrNull(trade?.closedAt);
    return {
      reachedPostFee10At: ts != null ? new Date(ts).toISOString() : null,
      timeToPostFee10Ms: ts != null && entryTime != null ? ts - entryTime : null,
    };
  }

  return { reachedPostFee10At: null, timeToPostFee10Ms: null };
}

function reachedBeforeMae(trade, thresholdPct, reachedAtIso) {
  if (!reachedAtIso) return null;
  const reachedTs = Date.parse(reachedAtIso);
  if (!Number.isFinite(reachedTs)) return null;
  const history = Array.isArray(trade?.priceHistory) ? trade.priceHistory : [];
  for (const point of history) {
    const ts = finiteNumberOrNull(point?.t);
    if (ts == null || ts > reachedTs) continue;
    const adverse = adverseMoveAtPrice(trade, point?.p);
    if (adverse != null && adverse >= thresholdPct) return false;
  }
  return true;
}

function firstTimeToMfe(trade, targetPct) {
  const history = Array.isArray(trade?.priceHistory) ? trade.priceHistory : [];
  const entryTime = finiteNumberOrNull(trade?.entryTime);
  if (entryTime == null) return null;
  for (const point of history) {
    const margin = marginPnlAtPrice(trade, point?.p);
    if (margin != null && margin >= targetPct) {
      const ts = finiteNumberOrNull(point?.t);
      return ts != null ? ts - entryTime : null;
    }
  }
  return null;
}

export function calculatePostFee10OutcomeAssessment(trade) {
  const feeAdjusted = feeAdjustedFinalPnlPct(trade);
  const reached = firstReachedPostFee10(trade);
  const postFee10Winner = feeAdjusted != null && feeAdjusted >= 10;

  return {
    postFee10Winner,
    feeAdjustedFinalPnlPct: feeAdjusted,
    normalizedMarginPnlPct: normalizedMarginPnlPct(trade),

    maxFavorableExcursionPct: finiteNumberOrNull(trade?.mfePct) ?? finiteNumberOrNull(trade?.mfe),
    maxAdverseExcursionPct: finiteNumberOrNull(trade?.maePct) ?? finiteNumberOrNull(trade?.mae),

    reachedPostFee10At: reached.reachedPostFee10At,
    timeToPostFee10Ms: reached.timeToPostFee10Ms,

    reachedPostFee10BeforeMae1Pct: reachedBeforeMae(trade, 1, reached.reachedPostFee10At),
    reachedPostFee10BeforeMae2Pct: reachedBeforeMae(trade, 2, reached.reachedPostFee10At),

    bestRankInRun: finiteNumberOrNull(trade?.bestRankInRun),
    bestRankInSet: finiteNumberOrNull(trade?.bestRankInSet),
    bestRankInBatch: finiteNumberOrNull(trade?.bestRankInBatch),

    isTop3WinnerInRun: trade?.isTop3WinnerInRun === true,
    isTop3WinnerInSet: trade?.isTop3WinnerInSet === true,
    isTop3WinnerInBatch: trade?.isTop3WinnerInBatch === true,

    timeToMfe3PctMs: finiteNumberOrNull(trade?.timeToMfe3PctMs) ?? firstTimeToMfe(trade, 3),
    timeToMfe5PctMs: finiteNumberOrNull(trade?.timeToMfe5PctMs) ?? firstTimeToMfe(trade, 5),
    timeToMfe10PctMs: finiteNumberOrNull(trade?.timeToMfe10PctMs) ?? firstTimeToMfe(trade, 10),
  };
}

export function flattenPostFee10OutcomeAssessment(outcome) {
  if (!outcome) return {};
  return {
    postFee10Winner: outcome.postFee10Winner,
    normalizedMarginPnlPct: outcome.normalizedMarginPnlPct,
    mfePct: outcome.maxFavorableExcursionPct,
    maePct: outcome.maxAdverseExcursionPct,
    timeToMfe3PctMs: outcome.timeToMfe3PctMs,
    timeToMfe5PctMs: outcome.timeToMfe5PctMs,
    timeToMfe10PctMs: outcome.timeToMfe10PctMs,
    reachedPostFee10: outcome.reachedPostFee10At != null || outcome.postFee10Winner === true,
    reachedPostFee10At: outcome.reachedPostFee10At,
    timeToPostFee10Ms: outcome.timeToPostFee10Ms,
    reachedPostFee10BeforeMae1Pct: outcome.reachedPostFee10BeforeMae1Pct,
    reachedPostFee10BeforeMae2Pct: outcome.reachedPostFee10BeforeMae2Pct,
    bestRankInRun: outcome.bestRankInRun,
    bestRankInSet: outcome.bestRankInSet,
    bestRankInBatch: outcome.bestRankInBatch,
    isTop3WinnerInRun: outcome.isTop3WinnerInRun,
    isTop3WinnerInSet: outcome.isTop3WinnerInSet,
    isTop3WinnerInBatch: outcome.isTop3WinnerInBatch,
  };
}

export { feeAdjustedFinalPnlPct as getPostFee10CanonicalPnlPct };
