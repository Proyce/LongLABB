// ─── AES DISCOVERY UNIVERSE BUILDER ──────────────────────────────────────────
// Builds the full eligible Binance USDT perpetual universe before any Top-30
// truncation.  The existing UI arrays continue to be populated from
// gainersTop30 / losersTop30 — backward-compatible.

import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";

// ── Eligibility ───────────────────────────────────────────────────────────────

function isStablecoinPair(symbol, stablecoinList) {
  return stablecoinList.some(s => s === symbol);
}

function isEligible(ticker, exchangeInfoMap, config) {
  const symbol = ticker.symbol;
  if (!symbol || !symbol.endsWith("USDT")) return false;
  if (config.excludeStablecoinPairs && isStablecoinPair(symbol, config.stablecoinSymbols)) return false;

  const lastPrice = parseFloat(ticker.lastPrice);
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return false;

  const pcp = parseFloat(ticker.priceChangePercent);
  if (!Number.isFinite(pcp)) return false;

  const qv = parseFloat(ticker.quoteVolume);
  if (!Number.isFinite(qv) || qv < config.minQuoteVolume) return false;

  // Optional exchange info filtering (contractType, status)
  if (exchangeInfoMap && exchangeInfoMap[symbol]) {
    const info = exchangeInfoMap[symbol];
    if (config.contractType && info.contractType && info.contractType !== config.contractType) return false;
    if (config.contractStatus && info.status && info.status !== config.contractStatus) return false;
  }

  return true;
}

// ── Rank bands ────────────────────────────────────────────────────────────────

export function classifyRankBand(rank, rankBands) {
  if (!Number.isFinite(rank)) return "UNKNOWN";
  for (const band of rankBands) {
    if (rank >= band.min && rank <= band.max) return band.label;
  }
  return "RANK_201_PLUS";
}

// ── Rolling tick history helpers ──────────────────────────────────────────────

// Legacy name: this stores periodic broad 24-hour ticker snapshots, not genuine
// bookTicker/aggTrade events.
export function updateTickHistory(historyStore, allEligible, config, now = Date.now()) {
  const maxAge = config.tickHistoryMaxAgeMs;
  const maxSnaps = config.tickHistoryMaxSnapshots;
  const gracePeriod = 120_000;

  const eligibleSet = new Set(allEligible.map(t => t.symbol));

  for (const t of allEligible) {
    const sym = t.symbol;
    const snap = {
      ts: now,
      lastPrice: parseFloat(t.lastPrice),
      priceChangePercent: parseFloat(t.priceChangePercent),
      quoteVolume: parseFloat(t.quoteVolume),
      highPrice: parseFloat(t.highPrice),
      lowPrice: parseFloat(t.lowPrice),
      side24hRank: t.side24hRank ?? null,
    };
    const arr = historyStore[sym] ?? [];
    arr.push(snap);
    const cutoff = now - maxAge;
    const pruned = arr.filter(s => s.ts >= cutoff).slice(-maxSnaps);
    historyStore[sym] = pruned;
  }

  // Prune symbols no longer eligible after grace period
  for (const sym of Object.keys(historyStore)) {
    if (!eligibleSet.has(sym)) {
      const arr = historyStore[sym];
      if (arr && arr.length > 0) {
        const latest = arr[arr.length - 1];
        if (now - latest.ts > gracePeriod) {
          delete historyStore[sym];
        }
      }
    }
  }
}

// ── Derive lightweight fields from tick history ───────────────────────────────

export function computeTickHistoryFields(symbol, historyStore, now = Date.now()) {
  const arr = historyStore[symbol];
  if (!arr || arr.length < 2) return {};

  const recent = arr.slice(-5);
  const last3  = arr.slice(-3);

  // Direction from last N ticks
  function getDirection(snaps) {
    if (snaps.length < 2) return "FLAT";
    const diffs = [];
    for (let i = 1; i < snaps.length; i++) diffs.push(snaps[i].priceChangePercent - snaps[i - 1].priceChangePercent);
    const downs = diffs.filter(d => d < 0).length;
    const ups   = diffs.filter(d => d > 0).length;
    if (downs > ups) return "DOWN";
    if (ups > downs) return "UP";
    return "FLAT";
  }

  const last3BroadTicksDirection = getDirection(last3);
  const last5BroadTicksDirection = getDirection(recent);

  // Short-term change from oldest to newest in window
  const oldest = recent[0];
  const newest = recent[recent.length - 1];
  const shortTermChangePct = newest.priceChangePercent - oldest.priceChangePercent;

  // Acceleration: difference of differences
  let shortTermAccelerationPct = null;
  if (recent.length >= 3) {
    const midIdx = Math.floor(recent.length / 2);
    const firstHalf  = recent[midIdx].priceChangePercent - recent[0].priceChangePercent;
    const secondHalf = newest.priceChangePercent - recent[midIdx].priceChangePercent;
    shortTermAccelerationPct = secondHalf - firstHalf;
  }

  // Rank velocity (positive = rank improving toward top)
  let rankVelocity = null;
  let rankImprovement15s = null;
  let rankImprovement60s = null;
  const rankedSnaps = arr.filter(s => s.side24hRank != null);
  if (rankedSnaps.length >= 2) {
    const rNewest = rankedSnaps[rankedSnaps.length - 1];
    const rPrev   = rankedSnaps[rankedSnaps.length - 2];
    rankVelocity = rPrev.side24hRank - rNewest.side24hRank; // positive = moving up (lower rank number)

    const t15 = rankedSnaps.filter(s => now - s.ts <= 15_000);
    if (t15.length >= 2) {
      rankImprovement15s = t15[0].side24hRank - t15[t15.length - 1].side24hRank;
    }
    const t60 = rankedSnaps.filter(s => now - s.ts <= 60_000);
    if (t60.length >= 2) {
      rankImprovement60s = t60[0].side24hRank - t60[t60.length - 1].side24hRank;
    }
  }

  // Price range location
  let priceNear24hHighPct = null;
  let priceNear24hLowPct  = null;
  const latestSnap = arr[arr.length - 1];
  if (Number.isFinite(latestSnap.highPrice) && latestSnap.highPrice > 0 &&
      Number.isFinite(latestSnap.lowPrice)  && latestSnap.lowPrice  > 0) {
    const range = latestSnap.highPrice - latestSnap.lowPrice;
    if (range > 0) {
      priceNear24hHighPct = (latestSnap.highPrice - latestSnap.lastPrice) / range * 100;
      priceNear24hLowPct  = (latestSnap.lastPrice - latestSnap.lowPrice)  / range * 100;
    }
  }

  // Volume delta
  let quoteVolumeDeltaPct = null;
  if (arr.length >= 2) {
    const prev = arr[arr.length - 2];
    if (prev.quoteVolume > 0) {
      quoteVolumeDeltaPct = (latestSnap.quoteVolume - prev.quoteVolume) / prev.quoteVolume * 100;
    }
  }

  return {
    last3BroadTicksDirection,
    last5BroadTicksDirection,
    shortTermChangePct,
    shortTermAccelerationPct,
    rankVelocity,
    rankImprovement15s,
    rankImprovement60s,
    priceNear24hHighPct,
    priceNear24hLowPct,
    quoteVolumeDeltaPct,
  };
}

// ── Main universe builder ─────────────────────────────────────────────────────

export function buildFullDiscoveryUniverse({
  tickers,
  exchangeInfo = null,
  minQuoteVolume = AES_DISCOVERY_CONFIG.minQuoteVolume,
  config = AES_DISCOVERY_CONFIG,
}) {
  const effectiveConfig = { ...config, minQuoteVolume };
  const exchangeInfoMap = buildExchangeInfoMap(exchangeInfo);

  const allEligible = [];
  for (const t of tickers) {
    if (isEligible(t, exchangeInfoMap, effectiveConfig)) {
      allEligible.push(t);
    }
  }

  // Gainers: positive priceChangePercent, sorted descending
  const gainersAll = allEligible
    .filter(t => parseFloat(t.priceChangePercent) > 0)
    .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent));

  // Losers: negative priceChangePercent, sorted ascending (most negative first)
  const losersAll = allEligible
    .filter(t => parseFloat(t.priceChangePercent) < 0)
    .sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent));

  // Assign side24hRank
  gainersAll.forEach((t, i) => { t.side24hRank = i + 1; t.leaderboardSide = "GAINERS"; });
  losersAll.forEach((t, i)  => { t.side24hRank = i + 1; t.leaderboardSide = "LOSERS";  });

  // Global absolute-change rank (all eligible sorted by |pcp|)
  const byAbsChange = [...allEligible].sort(
    (a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent))
  );
  const absChangeRankMap = new Map();
  byAbsChange.forEach((t, i) => absChangeRankMap.set(t.symbol, i + 1));

  const gainerUniverseSize = gainersAll.length;
  const loserUniverseSize  = losersAll.length;
  const eligibleUniverseSize = allEligible.length;

  // Enrich each eligible symbol with rank fields
  for (const t of allEligible) {
    const pcp  = parseFloat(t.priceChangePercent);
    const side24hRank = t.side24hRank ?? null;
    const globalAbsChangeRank = absChangeRankMap.get(t.symbol) ?? null;
    const isGainer = pcp > 0;
    const isLoser  = pcp < 0;

    const rankBand = side24hRank != null
      ? classifyRankBand(side24hRank, config.rankBands)
      : "UNKNOWN";

    Object.assign(t, {
      gainer24hRank: isGainer ? side24hRank : null,
      loser24hRank:  isLoser  ? side24hRank : null,
      globalAbsChangeRank,
      rankBand,
      outsideTop25:  side24hRank != null ? side24hRank > 25  : null,
      outsideTop50:  side24hRank != null ? side24hRank > 50  : null,
      outsideTop100: side24hRank != null ? side24hRank > 100 : null,
      outsideTop200: side24hRank != null ? side24hRank > 200 : null,
      eligibleUniverseSize,
      gainerUniverseSize,
      loserUniverseSize,
    });
  }

  const gainersTop30 = gainersAll.slice(0, 30);
  const losersTop30  = losersAll.slice(0, 30);

  const universeMeta = {
    builtAt: Date.now(),
    eligibleUniverseSize,
    gainerUniverseSize,
    loserUniverseSize,
    outsideTop25Count: allEligible.filter(t => t.outsideTop25).length,
    outsideTop50Count: allEligible.filter(t => t.outsideTop50).length,
    minQuoteVolume: effectiveConfig.minQuoteVolume,
  };

  return {
    allEligible,
    gainersAll,
    losersAll,
    gainersTop30,
    losersTop30,
    universeMeta,
  };
}

// ── Long universe builder (primary for LongLAB) ───────────────────────────────
// Wraps buildFullDiscoveryUniverse but annotates each ticker with long-native
// bucket labels: longParentBucket = TOP_GAINER_LONGS | TOP_LOSER_LONGS.

export function buildFullLongUniverse({
  tickers,
  exchangeInfo = null,
  minQuoteVolume = AES_DISCOVERY_CONFIG.minQuoteVolume,
  config = AES_DISCOVERY_CONFIG,
}) {
  const base = buildFullDiscoveryUniverse({ tickers, exchangeInfo, minQuoteVolume, config });

  // Annotate all eligible tickers with long-native bucket labels
  for (const t of base.allEligible) {
    if (t.leaderboardSide === "GAINERS") {
      t.longParentBucket = "TOP_GAINER_LONGS";
    } else if (t.leaderboardSide === "LOSERS") {
      t.longParentBucket = "TOP_LOSER_LONGS";
    }
  }

  return base;
}

// ── Exchange info map builder ─────────────────────────────────────────────────

function buildExchangeInfoMap(exchangeInfo) {
  if (!exchangeInfo || !Array.isArray(exchangeInfo.symbols)) return null;
  const map = {};
  for (const s of exchangeInfo.symbols) {
    if (s.symbol) map[s.symbol] = s;
  }
  return map;
}
