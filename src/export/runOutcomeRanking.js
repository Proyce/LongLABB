// ─── LONG RUN OUTCOME RANKING ─────────────────────────────────────────────────
// LONG-native: higher feeAdjustedNormPnlPct = better outcome.
// Replaces assignRunBestNormRanks from bestDnaAudit.js (ShortLAB).
// LOG ONLY — must never affect simulation execution.

function finiteNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function longFeeAdjustedNormPnlPct(trade) {
  const explicit = finiteNumberOrNull(trade?.feeAdjustedNormPnlPct);
  if (explicit != null) return explicit;
  const margin = finiteNumberOrNull(trade?.feeAdjustedFinalPnlPct ?? trade?.feeAdjustedMarginPnlPct);
  const lev = finiteNumberOrNull(trade?.selectedLeverage ?? trade?.leverage);
  if (margin != null && lev != null && lev !== 0) return parseFloat((margin / lev).toFixed(4));
  const norm = finiteNumberOrNull(trade?.normPnlPct ?? trade?.rawNormPnlPct);
  return norm != null ? parseFloat((norm - 0.10).toFixed(4)) : null;
}

export { longFeeAdjustedNormPnlPct };

function runValue(trade) {
  return trade?.runId ?? trade?.run ?? null;
}

function tradeStableId(trade, index = 0) {
  return String(
    trade?.tradeId ?? trade?.id ?? `${trade?.symbol ?? "unknown"}:${trade?.entryTime ?? index}`,
  );
}

function compareNormRanked(a, b) {
  const ap = longFeeAdjustedNormPnlPct(a);
  const bp = longFeeAdjustedNormPnlPct(b);
  if (bp !== ap) return (bp ?? -Infinity) - (ap ?? -Infinity);
  const ac = Number(a?.closedAt ?? Number.MAX_SAFE_INTEGER);
  const bc = Number(b?.closedAt ?? Number.MAX_SAFE_INTEGER);
  if (ac !== bc) return ac - bc;
  const ae = Number(a?.entryTime ?? Number.MAX_SAFE_INTEGER);
  const be = Number(b?.entryTime ?? Number.MAX_SAFE_INTEGER);
  if (ae !== be) return ae - be;
  return tradeStableId(a).localeCompare(tradeStableId(b));
}

export function assignRunBestNormRanksLong(trades) {
  const next = trades.map(t => ({
    ...t,
    isRunBest1Norm: false,
    isRunBest3Norm: false,
    runNormRank: null,
    runClosedTradeCount: null,
  }));

  const byId = new Map(next.map((trade, i) => [tradeStableId(trade, i), trade]));
  const grouped = new Map();
  const seen = new Set();

  next.forEach((trade, index) => {
    const group = runValue(trade);
    if (trade?.closed !== true || group == null || group === "") return;
    const pnl = longFeeAdjustedNormPnlPct(trade);
    if (!Number.isFinite(pnl)) return;
    const id = tradeStableId(trade, index);
    const key = `${group}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const groupKey = String(group);
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(trade);
  });

  for (const group of grouped.values()) {
    const ranked = [...group].sort(compareNormRanked);
    ranked.forEach((trade, index) => {
      const target = byId.get(tradeStableId(trade));
      if (!target) return;
      const rank = index + 1;
      target.runNormRank = rank;
      target.isRunBest1Norm = rank === 1;
      target.isRunBest3Norm = rank <= 3;
      target.runClosedTradeCount = ranked.length;
    });
  }

  return next;
}
