// ─── LONG-NATIVE POST-FEE-10 SUPPORT ──────────────────────────────────────────
// All PnL formulas use LONG polarity: upward price movement is favorable.
// This module replaces src/scoring/postFee10/ for all active LongLAB paths.
// LOG ONLY — must never affect simulation execution.

export const LONG_POST_FEE_10_SUPPORT_VERSION = 'long-pf10-support-v1';

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────

const finiteNumberOrNull = v => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ─── LONG PNL FORMULAS ────────────────────────────────────────────────────────

/**
 * LONG polarity: upward price movement is favorable.
 * Returns margin PnL % = ((currentPrice - entryPrice) / entryPrice) * 100 * leverage
 */
export function calculateLongMarginPnlPct({ entryPrice, currentPrice, leverage }) {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(currentPrice) ||
    entryPrice <= 0
  ) {
    return null;
  }
  return ((currentPrice - entryPrice) / entryPrice) * 100 * leverage;
}

/**
 * LONG polarity: downward price movement is adverse.
 * Returns adverse move % = ((entryPrice - currentPrice) / entryPrice) * 100
 * A positive value means price has moved against the LONG position.
 */
export function calculateLongAdverseMovePct({ entryPrice, currentPrice }) {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(currentPrice) ||
    entryPrice <= 0
  ) {
    return null;
  }
  return ((entryPrice - currentPrice) / entryPrice) * 100;
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function marginPnlAtPrice(trade, price) {
  const entry    = finiteNumberOrNull(trade?.entryPrice);
  const p        = finiteNumberOrNull(price);
  const leverage = finiteNumberOrNull(trade?.leverage) ?? 1;
  if (entry == null || entry <= 0 || p == null) return null;
  // LONG polarity: up is favorable
  return ((p - entry) / entry) * 100 * leverage;
}

function adverseMoveAtPrice(trade, price) {
  const entry = finiteNumberOrNull(trade?.entryPrice);
  const p     = finiteNumberOrNull(price);
  if (entry == null || entry <= 0 || p == null) return null;
  // LONG polarity: down is adverse
  return ((entry - p) / entry) * 100;
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

function resolveFeeDrag(trade) {
  return (
    finiteNumberOrNull(trade?.totalFeeDragPct) ??
    finiteNumberOrNull(trade?.feeDragMarginPct) ??
    finiteNumberOrNull(trade?.feeDragPct) ??
    0
  );
}

function resolveFeeAdjustedFinalPnl(trade) {
  const explicit =
    finiteNumberOrNull(trade?.feeAdjustedFinalPnlPct) ??
    finiteNumberOrNull(trade?.feeAdjustedMarginPnlPct);
  if (explicit != null) return explicit;

  const rawMargin =
    finiteNumberOrNull(trade?.rawMarginPnlPct) ??
    finiteNumberOrNull(trade?.normalizedMarginPnlPct) ??
    finiteNumberOrNull(trade?.finalPnlPct);
  if (rawMargin == null) return null;

  return Number((rawMargin - resolveFeeDrag(trade)).toFixed(4));
}

function resolveRawMarginPnl(trade) {
  return (
    finiteNumberOrNull(trade?.rawMarginPnlPct) ??
    finiteNumberOrNull(trade?.normalizedMarginPnlPct) ??
    finiteNumberOrNull(trade?.finalPnlPct) ??
    null
  );
}

function firstReachedPostFee10(trade) {
  const history   = Array.isArray(trade?.priceHistory) ? trade.priceHistory : [];
  const entryTime = finiteNumberOrNull(trade?.entryTime);

  for (const point of history) {
    const net = feeAdjustedPnlAtPrice(trade, point?.p);
    if (net != null && net >= 10) {
      const ts = finiteNumberOrNull(point?.t) ?? entryTime;
      return {
        reachedPostFee10At:  ts != null ? new Date(ts).toISOString() : null,
        timeToPostFee10Ms:   ts != null && entryTime != null ? ts - entryTime : null,
      };
    }
  }

  const finalNet = resolveFeeAdjustedFinalPnl(trade);
  if (finalNet != null && finalNet >= 10) {
    const ts = finiteNumberOrNull(trade?.closedAt);
    return {
      reachedPostFee10At: ts != null ? new Date(ts).toISOString() : null,
      timeToPostFee10Ms:  ts != null && entryTime != null ? ts - entryTime : null,
    };
  }

  return { reachedPostFee10At: null, timeToPostFee10Ms: null };
}

function reachedBeforeLongAdverse(trade, thresholdPct, reachedAtIso) {
  if (!reachedAtIso) return null;
  const reachedTs = Date.parse(reachedAtIso);
  if (!Number.isFinite(reachedTs)) return null;

  const history = Array.isArray(trade?.priceHistory) ? trade.priceHistory : [];
  for (const point of history) {
    const ts = finiteNumberOrNull(point?.t);
    if (ts == null || ts > reachedTs) continue;
    // LONG adverse: price below entry
    const adverse = adverseMoveAtPrice(trade, point?.p);
    if (adverse != null && adverse >= thresholdPct) return false;
  }
  return true;
}

function firstTimeToMfe(trade, targetPct) {
  const history   = Array.isArray(trade?.priceHistory) ? trade.priceHistory : [];
  const entryTime = finiteNumberOrNull(trade?.entryTime);
  if (entryTime == null) return null;

  for (const point of history) {
    // LONG favorable: price above entry
    const margin = marginPnlAtPrice(trade, point?.p);
    if (margin != null && margin >= targetPct) {
      const ts = finiteNumberOrNull(point?.t);
      return ts != null ? ts - entryTime : null;
    }
  }
  return null;
}

// ─── OUTCOME ASSESSMENT ───────────────────────────────────────────────────────

/**
 * Calculates LONG-polarity outcome for a completed trade.
 * A Post-Fee-10 winner requires feeAdjustedMarginPnlPct >= 10.
 */
export function calculatePostFee10OutcomeAssessment(trade) {
  const feeAdjusted = resolveFeeAdjustedFinalPnl(trade);
  const reached     = firstReachedPostFee10(trade);
  const postFee10Winner = feeAdjusted != null && feeAdjusted >= 10;

  return {
    postFee10Winner,
    feeAdjustedFinalPnlPct: feeAdjusted,
    rawMarginPnlPct:        resolveRawMarginPnl(trade),

    maxFavorableExcursionPct: finiteNumberOrNull(trade?.mfePct) ?? finiteNumberOrNull(trade?.mfe),
    maxAdverseExcursionPct:   finiteNumberOrNull(trade?.maePct) ?? finiteNumberOrNull(trade?.mae),

    reachedPostFee10At: reached.reachedPostFee10At,
    timeToPostFee10Ms:  reached.timeToPostFee10Ms,

    reachedPostFee10BeforeMae1Pct: reachedBeforeLongAdverse(trade, 1, reached.reachedPostFee10At),
    reachedPostFee10BeforeMae2Pct: reachedBeforeLongAdverse(trade, 2, reached.reachedPostFee10At),

    bestRankInRun:   finiteNumberOrNull(trade?.bestRankInRun),
    bestRankInSet:   finiteNumberOrNull(trade?.bestRankInSet),
    bestRankInBatch: finiteNumberOrNull(trade?.bestRankInBatch),

    isTop3WinnerInRun:   trade?.isTop3WinnerInRun   === true,
    isTop3WinnerInSet:   trade?.isTop3WinnerInSet   === true,
    isTop3WinnerInBatch: trade?.isTop3WinnerInBatch === true,

    timeToMfe3PctMs:  finiteNumberOrNull(trade?.timeToMfe3PctMs)  ?? firstTimeToMfe(trade, 3),
    timeToMfe5PctMs:  finiteNumberOrNull(trade?.timeToMfe5PctMs)  ?? firstTimeToMfe(trade, 5),
    timeToMfe10PctMs: finiteNumberOrNull(trade?.timeToMfe10PctMs) ?? firstTimeToMfe(trade, 10),

    logOnly:            true,
    canAffectExecution: false,
  };
}

export function flattenPostFee10OutcomeAssessment(outcome) {
  if (!outcome) return {};
  return {
    postFee10Winner:                  outcome.postFee10Winner,
    feeAdjustedFinalPnlPct:          outcome.feeAdjustedFinalPnlPct,
    rawMarginPnlPct:                  outcome.rawMarginPnlPct,
    mfePct:                           outcome.maxFavorableExcursionPct,
    maePct:                           outcome.maxAdverseExcursionPct,
    timeToMfe3PctMs:                  outcome.timeToMfe3PctMs,
    timeToMfe5PctMs:                  outcome.timeToMfe5PctMs,
    timeToMfe10PctMs:                 outcome.timeToMfe10PctMs,
    reachedPostFee10:                 outcome.reachedPostFee10At != null || outcome.postFee10Winner === true,
    reachedPostFee10At:               outcome.reachedPostFee10At,
    timeToPostFee10Ms:                outcome.timeToPostFee10Ms,
    reachedPostFee10BeforeMae1Pct:    outcome.reachedPostFee10BeforeMae1Pct,
    reachedPostFee10BeforeMae2Pct:    outcome.reachedPostFee10BeforeMae2Pct,
    bestRankInRun:                    outcome.bestRankInRun,
    bestRankInSet:                    outcome.bestRankInSet,
    bestRankInBatch:                  outcome.bestRankInBatch,
    isTop3WinnerInRun:                outcome.isTop3WinnerInRun,
    isTop3WinnerInSet:                outcome.isTop3WinnerInSet,
    isTop3WinnerInBatch:              outcome.isTop3WinnerInBatch,
  };
}

// ─── LIVE CONFIRMATION ────────────────────────────────────────────────────────

const CHECKPOINTS_MS = [5_000, 15_000, 30_000, 60_000];

function checkpointPoint(history, entryTime, checkpointMs) {
  return history
    .filter(p => finiteNumberOrNull(p?.t) != null && finiteNumberOrNull(p.t) - entryTime >= checkpointMs)
    .sort((a, b) => a.t - b.t)[0] ?? null;
}

/**
 * LONG-polarity live confirmation.
 * Green impulse, VWAP reclaim, BTC UP are all POSITIVE signals.
 * Red pressure, BTC DOWN are negative signals.
 */
export function evaluatePostFee10LiveConfirmation(trade, now = Date.now()) {
  const history   = Array.isArray(trade?.priceHistory) ? trade.priceHistory : [];
  const entryTime = finiteNumberOrNull(trade?.entryTime);

  if (!entryTime || !history.length) {
    return {
      postFee10LiveConfirmationScore:       null,
      postFee10LiveConfirmationLabels:      [],
      postFee10LiveConfirmationWarnings:    [],
      postFee10LiveConfirmationCheckpoints: [],
    };
  }

  const available = history.filter(
    p => finiteNumberOrNull(p?.t) != null && p.t <= now,
  );

  // Track MFE (favorable: price UP) and MAE (adverse: price DOWN) for LONG
  let mfe = 0;
  let mae = 0;
  for (const point of available) {
    const pnl     = marginPnlAtPrice(trade, point?.p);
    const adverse = adverseMoveAtPrice(trade, point?.p);
    if (pnl != null && pnl > mfe)       mfe = pnl;
    if (adverse != null && adverse > mae) mae = adverse;
  }

  let score = 50;
  const labels   = [];
  const warnings = [];

  // LONG: fast upward MFE expansion is positive
  if (mfe >= 5) {
    score += 20;
    labels.push('POST_FEE_10_FAST_MFE_EXPANSION');
  } else if (mfe >= 3) {
    score += 12;
    labels.push('POST_FEE_10_MFE_BUILDING');
  } else if (now - entryTime >= 30_000) {
    score -= 10;
    labels.push('POST_FEE_10_EARLY_STALLED');
  }

  // LONG: low adverse move (price held up) is positive
  if (mae <= 0.25) {
    score += 10;
    labels.push('POST_FEE_10_LOW_MAE_START');
  } else if (mae >= 1) {
    score -= 15;
    warnings.push('POST_FEE_10_HIGH_EARLY_MAE');
  }

  // LONG: green confirmation is POSITIVE
  if (trade?.immediateGreenImpulse === true || trade?.greenImpulseDetected === true) {
    score += 15;
    labels.push('POST_FEE_10_GREEN_CONFIRMATION');
  }
  // LONG: red impulse is NEGATIVE
  if (trade?.immediateRedImpulse === true || trade?.redImpulseDetected === true) {
    score -= 20;
    warnings.push('POST_FEE_10_RED_IMPULSE_DANGER');
  }

  // LONG: VWAP reclaim is POSITIVE
  const vwapCtx = trade?.longVwapContextLabel ?? trade?.vwapLongContextLabel ?? trade?.vwapContextLabel ?? '';
  if (vwapCtx.includes('RECLAIM') || trade?.entryPriceVsVwapLabel === 'ABOVE_VWAP') {
    score += 10;
    labels.push('POST_FEE_10_VWAP_SUPPORT');
  } else if (vwapCtx.includes('RECLAIM_FAIL')) {
    score -= 10;
    warnings.push('POST_FEE_10_VWAP_LOST');
  }

  // LONG: BTC UP is supportive, BTC DOWN is a headwind
  const btcLabel = trade?.btcTacticalDirectionLabel ?? trade?.btcMicroDirectionLabel ?? '';
  if (btcLabel === 'UP' || btcLabel === 'STRONG_UP') {
    score += 8;
    labels.push('POST_FEE_10_BTC_TAILWIND');
  } else if (btcLabel === 'DOWN' || btcLabel === 'STRONG_DOWN') {
    score -= 8;
    warnings.push('POST_FEE_10_BTC_HEADWIND');
  }

  if (score >= 65) labels.push('POST_FEE_10_EARLY_CONFIRMING');
  if (score < 45 && now - entryTime >= 30_000) labels.push('POST_FEE_10_FAILED_FOLLOW_THROUGH');

  const checkpoints = CHECKPOINTS_MS
    .map(ms => {
      const point = checkpointPoint(available, entryTime, ms);
      if (!point) return null;
      return {
        checkpointMs:    ms,
        evaluatedAt:     new Date(point.t).toISOString(),
        // LONG polarity
        marginPnlPct:    marginPnlAtPrice(trade, point.p),
        adverseMovePct:  adverseMoveAtPrice(trade, point.p),
      };
    })
    .filter(Boolean);

  return {
    postFee10LiveConfirmationScore:       Math.max(0, Math.min(100, Math.round(score))),
    postFee10LiveConfirmationLabels:      [...new Set(labels)],
    postFee10LiveConfirmationWarnings:    [...new Set(warnings)],
    postFee10LiveConfirmationCheckpoints: checkpoints,
    logOnly:            true,
    canAffectExecution: false,
  };
}

// ─── RANKINGS ─────────────────────────────────────────────────────────────────

function assignWinnerRanks(trades) {
  if (!Array.isArray(trades) || !trades.length) return trades;

  const sorted = [...trades].sort((a, b) => {
    const aFee = resolveFeeAdjustedFinalPnl(a) ?? -Infinity;
    const bFee = resolveFeeAdjustedFinalPnl(b) ?? -Infinity;
    return bFee - aFee;
  });

  return trades.map(trade => {
    const rank = sorted.indexOf(trade) + 1;
    return {
      ...trade,
      runNormRank:       rank,
      isTop3WinnerInRun: rank <= 3,
      bestRankInRun:     rank,
    };
  });
}

export function assignAllPostFee10WinnerRanks(trades) {
  if (!Array.isArray(trades)) return trades;
  return assignWinnerRanks(trades);
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

export function buildPostFee10AnalyticsReport(trades) {
  const arr = Array.isArray(trades) ? trades : [];
  const closed = arr.filter(t => t.closed !== false && resolveFeeAdjustedFinalPnl(t) != null);
  if (!closed.length) {
    return {
      totalTrades:          arr.length,
      closedTrades:         0,
      postFee10Winners:     0,
      postFee10WinRate:     null,
      avgFeeAdjustedPnl:    null,
      medianFeeAdjustedPnl: null,
      logOnly:              true,
      canAffectExecution:   false,
    };
  }

  const pnls   = closed.map(t => resolveFeeAdjustedFinalPnl(t));
  const winners = pnls.filter(p => p >= 10).length;
  const sum     = pnls.reduce((a, b) => a + b, 0);
  const sorted  = [...pnls].sort((a, b) => a - b);
  const mid     = Math.floor(sorted.length / 2);
  const median  = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  return {
    totalTrades:          arr.length,
    closedTrades:         closed.length,
    postFee10Winners:     winners,
    postFee10WinRate:     Number((winners / closed.length * 100).toFixed(2)),
    avgFeeAdjustedPnl:    Number((sum / closed.length).toFixed(4)),
    medianFeeAdjustedPnl: Number(median.toFixed(4)),
    logOnly:              true,
    canAffectExecution:   false,
  };
}

// ─── CSV EXPORT SUPPORT ───────────────────────────────────────────────────────

export const POST_FEE_10_DEFAULT_FIELDS = {
  postFee10Winner:               null,
  feeAdjustedFinalPnlPct:       null,
  rawMarginPnlPct:               null,
  reachedPostFee10:              null,
  reachedPostFee10At:            null,
  timeToPostFee10Ms:             null,
  reachedPostFee10BeforeMae1Pct: null,
  reachedPostFee10BeforeMae2Pct: null,
  timeToMfe3PctMs:               null,
  timeToMfe5PctMs:               null,
  timeToMfe10PctMs:              null,
  mfePct:                        null,
  maePct:                        null,
  bestRankInRun:                 null,
  bestRankInSet:                 null,
  bestRankInBatch:               null,
  isTop3WinnerInRun:             null,
  isTop3WinnerInSet:             null,
  isTop3WinnerInBatch:           null,
  postFee10LiveConfirmationScore: null,
};

export const POST_FEE_10_CSV_HEADERS = Object.keys(POST_FEE_10_DEFAULT_FIELDS);

export function postFee10CSVRow(trade) {
  const t = trade ?? {};
  return POST_FEE_10_CSV_HEADERS.map(k => {
    const v = t[k];
    return v == null ? '' : String(v);
  });
}
