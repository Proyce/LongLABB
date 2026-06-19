import { getPostFee10CanonicalPnlPct } from "./postFee10.outcomes.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../../lifecycle/closeReasons.js";

const finite = v => v != null && v !== "" && Number.isFinite(Number(v));
const n = v => finite(v) ? Number(v) : null;
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const median = arr => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function profitFactor(pnls) {
  const grossWin = pnls.filter(v => v > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pnls.filter(v => v < 0).reduce((a, b) => a + b, 0));
  if (grossLoss === 0) return grossWin > 0 ? Infinity : null;
  return grossWin / grossLoss;
}

function sideOf(trade) {
  const raw = String(trade?.leaderboardTab ?? trade?.leaderboardSide ?? trade?.shortParentBucket ?? "").toLowerCase();
  if (raw.includes("gainer")) return "gainers";
  if (raw.includes("loser")) return "losers";
  return "unknown";
}

function groupBy(trades, keyFn) {
  const map = new Map();
  for (const trade of trades) {
    const key = keyFn(trade);
    if (key == null || key === "") continue;
    if (!map.has(String(key))) map.set(String(key), []);
    map.get(String(key)).push(trade);
  }
  return map;
}

function summarize(scope, key, trades, baselineHitRate, allWinnerCount) {
  const eligible = trades
    .filter(t => t?.closed === true)
    .map(t => ({ trade: t, pnl: getPostFee10CanonicalPnlPct(t) }))
    .filter(x => finite(x.pnl));
  const pnls = eligible.map(x => x.pnl);
  const winners = eligible.filter(x => x.pnl >= 10);
  const predicted = eligible.filter(x => (x.trade.postFee10EntryScore ?? -Infinity) >= 75);
  const predictedWinners = predicted.filter(x => x.pnl >= 10);
  const top3 = eligible.filter(x =>
    x.trade.isTop3WinnerInRun ||
    x.trade.isTop3WinnerInSet ||
    x.trade.isTop3WinnerInBatch
  );
  const positiveRuns = [...groupBy(eligible.map(x => x.trade), t => t.runId ?? t.run).values()]
    .map(runTrades => runTrades.reduce((sum, t) => sum + (getPostFee10CanonicalPnlPct(t) ?? 0), 0));
  const hitRate = eligible.length ? winners.length / eligible.length * 100 : null;
  const predictedHitRate = predicted.length ? predictedWinners.length / predicted.length * 100 : null;

  return {
    scope,
    key,
    tradeCount: eligible.length,
    postFee10WinnerCount: winners.length,
    postFee10HitRate: hitRate,
    averageFeeAdjustedPnl: avg(pnls),
    medianFeeAdjustedPnl: median(pnls),
    totalFeeAdjustedPnl: pnls.reduce((a, b) => a + b, 0),
    winRate: eligible.length ? eligible.filter(x => x.pnl > 0).length / eligible.length * 100 : null,
    slRate: eligible.length ? eligible.filter(x => x.normalizeLongCloseReason(trade.closeReason) === CLOSE_REASON.STOP_LOSS).length / eligible.length * 100 : null,
    averageMfe: avg(eligible.map(x => n(x.trade.mfePct ?? x.trade.mfe)).filter(v => v != null)),
    averageMae: avg(eligible.map(x => n(x.trade.maePct ?? x.trade.mae)).filter(v => v != null)),
    medianTimeToPostFee10Ms: median(eligible.map(x => n(x.trade.timeToPostFee10Ms)).filter(v => v != null)),
    topThreeCaptureRate: top3.length
      ? top3.filter(x => (x.trade.postFee10EntryScore ?? -Infinity) >= 75).length / top3.length * 100
      : null,
    precision: predicted.length ? predictedWinners.length / predicted.length : null,
    recall: allWinnerCount ? predictedWinners.length / allWinnerCount : null,
    lift: baselineHitRate && predictedHitRate != null ? predictedHitRate / baselineHitRate : null,
    profitFactor: profitFactor(pnls),
    positiveRunConsistency: positiveRuns.length
      ? positiveRuns.filter(v => v > 0).length / positiveRuns.length * 100
      : null,
    predictedCount: predicted.length,
    predictedWinnerCount: predictedWinners.length,
    predictedPostFee10HitRate: predictedHitRate,
  };
}

export function buildPostFee10AnalyticsReport(trades) {
  const closed = trades.filter(t => t?.closed === true && finite(getPostFee10CanonicalPnlPct(t)));
  const baselineWinnerCount = closed.filter(t => getPostFee10CanonicalPnlPct(t) >= 10).length;
  const baselineHitRate = closed.length ? baselineWinnerCount / closed.length * 100 : null;

  const groups = [
    summarize("all", "all", closed, baselineHitRate, baselineWinnerCount),
  ];

  for (const [key, group] of groupBy(closed, t => t.runId ?? t.run)) {
    groups.push(summarize("run", key, group, baselineHitRate, baselineWinnerCount));
  }
  for (const [key, group] of groupBy(closed, t => t.setId)) {
    groups.push(summarize("set", key, group, baselineHitRate, baselineWinnerCount));
  }
  for (const [key, group] of groupBy(closed, t => t.batchId ?? t.autoRunId)) {
    groups.push(summarize("batch", key, group, baselineHitRate, baselineWinnerCount));
  }
  for (const [key, group] of groupBy(closed, sideOf)) {
    groups.push(summarize("side", key, group, baselineHitRate, baselineWinnerCount));
  }
  for (const [key, group] of groupBy(closed, t => t.postFee10EntryTier)) {
    groups.push(summarize("tier", key, group, baselineHitRate, baselineWinnerCount));
  }

  const topThree = closed.filter(t => t.isTop3WinnerInRun || t.isTop3WinnerInSet || t.isTop3WinnerInBatch);
  const winners = closed.filter(t => getPostFee10CanonicalPnlPct(t) >= 10);
  const highScoreFalsePositive = closed.filter(t =>
    (t.postFee10EntryScore ?? -Infinity) >= 75 &&
    getPostFee10CanonicalPnlPct(t) < 10
  );
  const missedBecauseGreen = winners.filter(t =>
    (t.postFee10EntryScore ?? 0) < 75 &&
    (t.postFee10EntryWarnings ?? []).some(w => String(w).includes("GREEN"))
  );

  return {
    version: "post-fee-10-analytics-v1",
    generatedAt: new Date().toISOString(),
    baseline: groups[0],
    groups,
    topThreeScore75Pct: topThree.length ? topThree.filter(t => (t.postFee10EntryScore ?? -Infinity) >= 75).length / topThree.length * 100 : null,
    topThreeScore85Pct: topThree.length ? topThree.filter(t => (t.postFee10EntryScore ?? -Infinity) >= 85).length / topThree.length * 100 : null,
    postFee10WinnersMissedByGreenPenaltyPct: winners.length ? missedBecauseGreen.length / winners.length * 100 : null,
    highScoreFalsePositivePct: closed.length ? highScoreFalsePositive.length / closed.length * 100 : null,
  };
}
