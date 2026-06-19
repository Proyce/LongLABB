// ─── AES DISCOVERY PREFILTER ──────────────────────────────────────────────────
// Lightweight prefilter to decide which outside-leaderboard symbols get deep
// telemetry.  Uses only fields from the all-ticker response + rolling broad-tick
// history.  Never used as an entry score.

import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";
import { computeTickHistoryFields } from "./aesDiscoveryUniverse.js";

// ── Score components ──────────────────────────────────────────────────────────

const PREFILTER_WEIGHTS = {
  sufficientLiquidity:     15, // quoteVolume >= configured min
  last3TicksDown:          15, // last 3 broad ticks direction DOWN
  last5WeakeningOrDown:    10, // last 5 ticks DOWN or weakening
  negativeAcceleration:    10, // shortTermAccelerationPct < 0
  rankImproving:           10, // rank improving toward leaderboard top
  meaningful24hMove:       10, // meaningful 24h % move without top-50 membership
  usefulRangeLocation:     10, // price between 20-80% of 24h range
  volumeExpansion:         10, // quoteVolumeDeltaPct > 0
  freshAndMoving:          10, // not stale, not price-frozen
};

export function computeAesDiscoveryPrefilter(candidate, tickHistoryStore, config = AES_DISCOVERY_CONFIG, now = Date.now()) {
  const reasons  = [];
  const warnings = [];
  let score = 0;

  const symbol   = candidate.symbol;
  const pcp      = parseFloat(candidate.priceChangePercent);
  const qv       = parseFloat(candidate.quoteVolume);
  const rank     = candidate.side24hRank ?? null;
  const highPrice = parseFloat(candidate.highPrice);
  const lowPrice  = parseFloat(candidate.lowPrice);
  const lastPrice = parseFloat(candidate.lastPrice);

  // Gate: must be outside top 25
  if (rank != null && rank <= 25) {
    return {
      prefilterScore: 0,
      prefilterReasons: ["INSIDE_TOP25_EXCLUDED"],
      prefilterWarnings: [],
      eligibleForDeepScan: false,
    };
  }

  // Gate: zero-change symbols stay out of discovery queues
  if (!Number.isFinite(pcp) || pcp === 0) {
    return {
      prefilterScore: 0,
      prefilterReasons: ["ZERO_CHANGE_EXCLUDED"],
      prefilterWarnings: [],
      eligibleForDeepScan: false,
    };
  }

  // Tick history fields
  const tickFields = computeTickHistoryFields(symbol, tickHistoryStore, now);

  // 1. Sufficient liquidity (+15)
  if (Number.isFinite(qv) && qv >= config.minQuoteVolume) {
    score += PREFILTER_WEIGHTS.sufficientLiquidity;
    reasons.push("SUFFICIENT_LIQUIDITY");
    if (qv >= config.minQuoteVolume * 5)   reasons.push("HIGH_LIQUIDITY_TIER");
    if (qv >= config.minQuoteVolume * 20)  reasons.push("VERY_HIGH_LIQUIDITY_TIER");
  } else {
    warnings.push("BELOW_MIN_VOLUME");
  }

  // 2. Last 3 broad ticks DOWN (+15)
  if (tickFields.last3BroadTicksDirection === "DOWN") {
    score += PREFILTER_WEIGHTS.last3TicksDown;
    reasons.push("LAST3_BROAD_TICKS_DOWN");
  }

  // 3. Last 5 broad ticks DOWN or weakening (+10)
  if (tickFields.last5BroadTicksDirection === "DOWN") {
    score += PREFILTER_WEIGHTS.last5WeakeningOrDown;
    reasons.push("LAST5_BROAD_TICKS_DOWN");
  } else if (tickFields.shortTermChangePct != null && tickFields.shortTermChangePct < 0) {
    score += Math.round(PREFILTER_WEIGHTS.last5WeakeningOrDown * 0.6);
    reasons.push("SHORT_TERM_WEAKENING");
  }

  // 4. Negative short-term acceleration (+10)
  if (tickFields.shortTermAccelerationPct != null && tickFields.shortTermAccelerationPct < 0) {
    score += PREFILTER_WEIGHTS.negativeAcceleration;
    reasons.push("NEGATIVE_SHORT_TERM_ACCELERATION");
  }

  // 5. Rank improving (+10)
  if (tickFields.rankVelocity != null && tickFields.rankVelocity > 0) {
    score += PREFILTER_WEIGHTS.rankImproving;
    reasons.push("RANK_IMPROVING");
  } else if (tickFields.rankImprovement60s != null && tickFields.rankImprovement60s > 0) {
    score += Math.round(PREFILTER_WEIGHTS.rankImproving * 0.5);
    reasons.push("RANK_IMPROVING_60S");
  }

  // 6. Meaningful 24h movement (+10)
  const absPcp = Math.abs(pcp);
  if (absPcp >= 3) {
    score += PREFILTER_WEIGHTS.meaningful24hMove;
    reasons.push("MEANINGFUL_24H_MOVE");
  } else if (absPcp >= 1.5) {
    score += Math.round(PREFILTER_WEIGHTS.meaningful24hMove * 0.5);
    reasons.push("MODERATE_24H_MOVE");
  } else {
    warnings.push("SMALL_24H_MOVE");
  }

  // 7. Useful range location (+10)
  if (Number.isFinite(highPrice) && Number.isFinite(lowPrice) && Number.isFinite(lastPrice) && highPrice > lowPrice) {
    const rangePct = ((lastPrice - lowPrice) / (highPrice - lowPrice)) * 100;
    if (rangePct >= 20 && rangePct <= 80) {
      score += PREFILTER_WEIGHTS.usefulRangeLocation;
      reasons.push("USEFUL_RANGE_LOCATION");
    } else if (rangePct > 80) {
      warnings.push("NEAR_24H_HIGH");
    } else {
      warnings.push("NEAR_24H_LOW");
    }
  }

  // 8. Volume expansion (+10)
  if (tickFields.quoteVolumeDeltaPct != null && tickFields.quoteVolumeDeltaPct > 0) {
    score += PREFILTER_WEIGHTS.volumeExpansion;
    reasons.push("VOLUME_EXPANDING");
  } else if (tickFields.quoteVolumeDeltaPct != null && tickFields.quoteVolumeDeltaPct < -20) {
    warnings.push("VOLUME_CONTRACTING");
  }

  // 9. Not stale (+10)
  const latestSnap = (tickHistoryStore[symbol] ?? []).slice(-1)[0];
  const isStale = latestSnap && (now - latestSnap.ts > config.staleTelemetryMs);
  if (!isStale) {
    score += PREFILTER_WEIGHTS.freshAndMoving;
    reasons.push("FRESH_DATA");
  } else {
    warnings.push("STALE_BROAD_TICK");
    score = Math.max(0, score - 10);
  }

  const finalScore = Math.min(100, Math.max(0, score));

  // Eligible for deep scan when rank is in research range and score is non-zero
  const eligibleForDeepScan = (
    rank != null &&
    rank >= 26 &&
    rank <= config.maxSideRankToResearch &&
    qv >= config.minQuoteVolume &&
    finalScore > 0
  );

  return {
    prefilterScore: finalScore,
    prefilterReasons: reasons,
    prefilterWarnings: warnings,
    eligibleForDeepScan,
  };
}

// ── Queue selection ───────────────────────────────────────────────────────────
// Given a set of outside-leaderboard candidates, select the best batch for deep scan.

export function selectDeepScanCandidates({
  candidates,
  config = AES_DISCOVERY_CONFIG,
  tickHistoryStore = {},
  activeSymbols = new Set(),
  queuedSymbols = new Set(),
  cachedTelemetry = {},
  sideAlternatePriority = "GAINERS",
  now = Date.now(),
}) {
  const { perSideBandQuota, maxDeepCandidatesPerCycle, maxDeepCandidatesPerSidePerCycle } = config;

  // Score each candidate
  const scored = candidates
    .filter(c => {
      if (activeSymbols.has(c.symbol)) return false;
      if (queuedSymbols.has(c.symbol)) return false;
      // Skip if cached telemetry is fresh
      const cached = cachedTelemetry[c.symbol];
      if (cached && (now - cached.telemetryComputedAt) < config.telemetryCacheTtlMs) return false;
      return true;
    })
    .map(c => {
      const pf = computeAesDiscoveryPrefilter(c, tickHistoryStore, config, now);
      return { ...c, prefilterScore: pf.prefilterScore, prefilterReasons: pf.prefilterReasons, eligibleForDeepScan: pf.eligibleForDeepScan };
    })
    .filter(c => c.eligibleForDeepScan);

  // Group by side and rank band
  const groups = {};
  for (const c of scored) {
    const side = c.leaderboardSide ?? (parseFloat(c.priceChangePercent) > 0 ? "GAINERS" : "LOSERS");
    const band = c.rankBand ?? "RANK_201_PLUS";
    const key  = `${side}:${band}`;
    (groups[key] = groups[key] ?? []).push(c);
  }

  // Sort each group by prefilterScore desc, then quoteVolume desc, then by how long since last scored
  for (const g of Object.values(groups)) {
    g.sort((a, b) => {
      if (b.prefilterScore !== a.prefilterScore) return b.prefilterScore - a.prefilterScore;
      return parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume);
    });
  }

  const selected = [];
  const sideOrder = sideAlternatePriority === "GAINERS" ? ["GAINERS", "LOSERS"] : ["LOSERS", "GAINERS"];

  for (const side of sideOrder) {
    let sideCount = 0;
    for (const [bandLabel, quota] of Object.entries(perSideBandQuota)) {
      const key    = `${side}:${bandLabel}`;
      const bucket = groups[key] ?? [];
      let taken = 0;
      for (const c of bucket) {
        if (taken >= quota) break;
        if (sideCount >= maxDeepCandidatesPerSidePerCycle) break;
        if (selected.length >= maxDeepCandidatesPerCycle) break;
        selected.push(c);
        taken++;
        sideCount++;
      }
      if (selected.length >= maxDeepCandidatesPerCycle) break;
    }
    if (selected.length >= maxDeepCandidatesPerCycle) break;
  }

  return selected;
}
