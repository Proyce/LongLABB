import { getPostFee10CanonicalPnlPct } from "./postFee10.outcomes.js";

function groupValue(trade, groupKey) {
  if (groupKey === "runId") return trade?.runId ?? trade?.run ?? null;
  if (groupKey === "setId") return trade?.setId ?? null;
  if (groupKey === "batchId") return trade?.batchId ?? trade?.autoRunId ?? null;
  return trade?.[groupKey] ?? null;
}

function tradeStableId(trade, index = 0) {
  return String(trade?.tradeId ?? trade?.id ?? `${trade?.symbol ?? "unknown"}:${trade?.entryTime ?? index}`);
}

function compareRankedTrades(a, b) {
  const ap = getPostFee10CanonicalPnlPct(a);
  const bp = getPostFee10CanonicalPnlPct(b);
  if (bp !== ap) return bp - ap;

  const ac = Number(a?.closedAt ?? Number.MAX_SAFE_INTEGER);
  const bc = Number(b?.closedAt ?? Number.MAX_SAFE_INTEGER);
  if (ac !== bc) return ac - bc;

  const ae = Number(a?.entryTime ?? Number.MAX_SAFE_INTEGER);
  const be = Number(b?.entryTime ?? Number.MAX_SAFE_INTEGER);
  if (ae !== be) return ae - be;

  return tradeStableId(a).localeCompare(tradeStableId(b));
}

function rankFieldNames(groupKey) {
  if (groupKey === "runId") return ["bestRankInRun", "isTop3WinnerInRun"];
  if (groupKey === "setId") return ["bestRankInSet", "isTop3WinnerInSet"];
  if (groupKey === "batchId") return ["bestRankInBatch", "isTop3WinnerInBatch"];
  throw new Error(`Unsupported postFee10 ranking group: ${groupKey}`);
}

export function assignWinnerRanks(trades, groupKey) {
  const [rankField, top3Field] = rankFieldNames(groupKey);
  const next = trades.map(t => ({ ...t, [rankField]: null, [top3Field]: false }));
  const byId = new Map(next.map((trade, i) => [tradeStableId(trade, i), trade]));
  const grouped = new Map();
  const seenInGroup = new Set();

  next.forEach((trade, index) => {
    if (trade?.closed !== true) return;
    const group = groupValue(trade, groupKey);
    if (group == null || group === "") return;
    const pnl = getPostFee10CanonicalPnlPct(trade);
    if (!Number.isFinite(pnl)) return;

    const id = tradeStableId(trade, index);
    const dedupeKey = `${groupKey}:${group}:${id}`;
    if (seenInGroup.has(dedupeKey)) return;
    seenInGroup.add(dedupeKey);

    if (!grouped.has(String(group))) grouped.set(String(group), []);
    grouped.get(String(group)).push(trade);
  });

  for (const group of grouped.values()) {
    const ranked = [...group].sort(compareRankedTrades);
    ranked.forEach((trade, index) => {
      const target = byId.get(tradeStableId(trade));
      if (!target) return;
      const rank = index + 1;
      target[rankField] = rank;
      target[top3Field] = rank <= 3;
    });
  }

  return next;
}

export function assignAllPostFee10WinnerRanks(trades) {
  return ["runId", "setId", "batchId"].reduce(
    (acc, groupKey) => assignWinnerRanks(acc, groupKey),
    trades,
  );
}

