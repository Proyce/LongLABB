// ─── AES DISCOVERY SHADOW ENGINE ─────────────────────────────────────────────
// Creates, manages, and exits isolated shadow trades.
// NEVER places orders. NEVER touches normal samples array.

import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";
import { assignDiscoveryLabels, assignOutcomeLabels, GATE_LABELS } from "./aesDiscoveryLabels.js";
import { computeDiscoveryAesVariants, checkUniversalLongGate } from "./aesDiscoveryScore.js";

// ── Safety assertion ──────────────────────────────────────────────────────────

export function assertShadowSafe(trade) {
  if (!trade) return;
  if (trade.isShadowTrade !== true || trade.orderSubmitted !== false || trade.orderId !== null) {
    const msg = "[AES_DISCOVERY_ERROR] Shadow trade safety violation — isShadowTrade/orderSubmitted/orderId corrupted";
    console.error(msg, trade?.id);
  }
  if (typeof trade.executionMode !== "string" || trade.executionMode !== "LOG_ONLY") {
    console.error("[AES_DISCOVERY_ERROR] Shadow trade executionMode is not LOG_ONLY", trade?.id);
  }
}

// ── Episode state ─────────────────────────────────────────────────────────────

export function createEpisodeState() {
  return {
    lastScores:        {},  // symbol → { aesFull, aesNoRank, aesSetupOnly, ts }
    cooldownUntil:     {},  // symbol → timestamp
    scoreResetSeen:    {},  // symbol → boolean
    activeTradeId:     {},  // symbol → shadow trade id
  };
}

function isInCooldown(episodeState, symbol, now) {
  const until = episodeState.cooldownUntil[symbol];
  return until != null && now < until;
}

function hasActiveTrade(episodeState, symbol) {
  return episodeState.activeTradeId[symbol] != null;
}

function hasCrossedThreshold(prevScore, currScore, threshold) {
  if (prevScore == null || currScore == null) return false;
  return prevScore < threshold && currScore >= threshold;
}

// ── Shadow trade creation ─────────────────────────────────────────────────────

export function maybeShadowEntry({
  snapshot,
  candidate,
  aesVariants,
  episodeState,
  existingShadowTrades,
  config = AES_DISCOVERY_CONFIG,
  now = Date.now(),
}) {
  // Safety: must never be in normal execution path
  const symbol = snapshot.symbol;
  const { aesFull, aesNoRank, aesSetupOnly } = aesVariants;

  // Coverage gate
  if ((snapshot.telemetryCoveragePct ?? 0) < config.minimumTelemetryCoveragePct) {
    return null;
  }

  // Staleness gate
  const staleCutoff = now - config.staleTelemetryMs;
  if ((snapshot.telemetryComputedAt ?? 0) < staleCutoff) {
    return null;
  }

  // Must be outside top 25
  if (!candidate.outsideTop25) return null;

  // One active shadow per symbol
  if (hasActiveTrade(episodeState, symbol)) return null;

  // Cooldown check
  if (isInCooldown(episodeState, symbol, now)) return null;

  // Score reset requirement
  const thresholds = config.aesThresholds;
  if (config.requireScoreResetBeforeReentry) {
    const prev = episodeState.lastScores[symbol];
    if (prev != null && !episodeState.scoreResetSeen[symbol]) {
      const maxPrev = Math.max(prev.aesFull ?? 0, prev.aesNoRank ?? 0, prev.aesSetupOnly ?? 0);
      if (maxPrev >= thresholds.high) return null; // score hasn't reset
    }
  }

  // Threshold crossing check — require actual crossing
  const prev = episodeState.lastScores[symbol];
  let triggerThreshold = null;
  let triggerScoreVariant = null;

  const crossed =
    hasCrossedThreshold(prev?.aesFull,      aesFull,      thresholds.high) ||
    hasCrossedThreshold(prev?.aesNoRank,    aesNoRank,    thresholds.high) ||
    hasCrossedThreshold(prev?.aesSetupOnly, aesSetupOnly, thresholds.high);

  const anyHighAes = (aesFull ?? 0) >= thresholds.high ||
                     (aesNoRank ?? 0) >= thresholds.high ||
                     (aesSetupOnly ?? 0) >= thresholds.high;

  // If no previous score, allow entry if currently high
  if (!prev && anyHighAes) {
    triggerThreshold = thresholds.high;
    triggerScoreVariant = aesFull >= thresholds.high ? "aesFull" :
                          aesNoRank >= thresholds.high ? "aesNoRank" : "aesSetupOnly";
  } else if (crossed) {
    triggerThreshold = thresholds.high;
    triggerScoreVariant = hasCrossedThreshold(prev?.aesFull, aesFull, thresholds.high) ? "aesFull" :
                          hasCrossedThreshold(prev?.aesNoRank, aesNoRank, thresholds.high) ? "aesNoRank" : "aesSetupOnly";
  } else {
    return null;
  }

  // Max active shadow check
  const active = existingShadowTrades.filter(t => !t.closed);
  if (active.length >= config.maxActiveShadowTrades) return null;

  const side24hRank = candidate.side24hRank ?? null;
  const labels = assignDiscoveryLabels({
    side24hRank,
    outsideTop25:  candidate.outsideTop25,
    outsideTop50:  candidate.outsideTop50,
    outsideTop100: candidate.outsideTop100,
    outsideTop200: candidate.outsideTop200,
    leaderboardSide: candidate.leaderboardSide,
    aesFull,
    aesNoRank,
    aesSetupOnly,
    telemetryCoveragePct: snapshot.telemetryCoveragePct,
    snapshot,
    config,
  });

  const universalGatePass = checkUniversalLongGate(snapshot, aesVariants.aesFullResult);
  const isRawCohort  = labels.includes(GATE_LABELS.HIGH_AES_RAW_SHADOW);
  const isGoldCohort = labels.includes(GATE_LABELS.HIGH_AES_GOLD_CONFIRMED_SHADOW);

  if (!isRawCohort) return null;

  const id = `shadow_${symbol}_${now}`;
  const episodeId = `ep_${symbol}_${Math.floor(now / 60_000)}`;

  const trade = {
    // Safety fields — immutable
    isShadowTrade:    true,
    executionMode:    "LOG_ONLY",
    orderSubmitted:   false,
    orderId:          null,
    entrySource:      "AES_DISCOVERY_SHADOW",
    researchFeature:  "AES_DISCOVERY_V1",

    id,
    symbol,
    side:             snapshot.side ?? (candidate.leaderboardSide === "GAINERS" ? "GAINER" : "LOSER"),
    leaderboardSide:  candidate.leaderboardSide,

    // Entry time / price
    entryTime:        now,
    entryPrice:       parseFloat(candidate.lastPrice),
    researchLeverage: config.defaultResearchLeverage,
    closed:           false,
    closedAt:         null,

    // Rank at entry (frozen)
    change24hAtEntry:               parseFloat(candidate.priceChangePercent),
    side24hRankAtEntry:             side24hRank,
    globalAbsChangeRankAtEntry:     candidate.globalAbsChangeRank ?? null,
    rankBandAtEntry:                candidate.rankBand ?? null,
    outsideTop25AtEntry:            candidate.outsideTop25,
    outsideTop50AtEntry:            candidate.outsideTop50,
    outsideTop100AtEntry:           candidate.outsideTop100,
    outsideTop200AtEntry:           candidate.outsideTop200,
    eligibleUniverseSizeAtEntry:    candidate.eligibleUniverseSize ?? null,

    // AES at entry (frozen)
    aesFullAtEntry:              aesFull,
    aesNoRankAtEntry:            aesNoRank,
    aesSetupOnlyAtEntry:         aesSetupOnly,
    aesTriggerVariant:           triggerScoreVariant,
    aesTriggerThreshold:         triggerThreshold,
    aesContributionBreakdownAtEntry: aesVariants.aesFullResult?.absoluteEntryPositiveContributions ?? [],
    aesScoreVersion:             aesVariants.scoreVersion,

    // Telemetry at entry (frozen)
    prefilterScoreAtEntry:        candidate.prefilterScore ?? null,
    telemetryCoveragePctAtEntry:  snapshot.telemetryCoveragePct,
    telemetryMissingFieldsAtEntry: snapshot.telemetryMissingFields ?? [],
    telemetryWarningsAtEntry:      snapshot.telemetryWarnings ?? [],
    telemetrySnapshotId:           snapshot.telemetrySnapshotId,

    // All frozen telemetry
    ..._freezeTelemetry(snapshot),

    // Labels
    labels,
    isRawCohort,
    isGoldCohort,
    universalGatePass,

    // Episode
    aesEpisodeId:              episodeId,
    episodeStartedAt:          now,
    triggerThreshold,
    triggerScoreVariant,
    scoreResetObserved:        episodeState.scoreResetSeen[symbol] ?? false,
    previousClosedShadowTradeId: null,
    reentryCooldownSatisfied:  !isInCooldown(episodeState, symbol, now),

    // Evolution fields (mutable)
    currentPrice:           parseFloat(candidate.lastPrice),
    currentSide24hRank:     side24hRank,
    bestSide24hRankReached: side24hRank,
    worstSide24hRankReached:side24hRank,
    bestRankReachedAt:      null,
    enteredTop100:          side24hRank != null && side24hRank <= 100,
    enteredTop100At:        side24hRank != null && side24hRank <= 100 ? now : null,
    enteredTop50:           side24hRank != null && side24hRank <= 50,
    enteredTop50At:         side24hRank != null && side24hRank <= 50  ? now : null,
    enteredTop25:           side24hRank != null && side24hRank <= 25,
    enteredTop25At:         side24hRank != null && side24hRank <= 25  ? now : null,
    timeToTop100Ms:         null,
    timeToTop50Ms:          null,
    timeToTop25Ms:          null,
    change24hCurrent:       parseFloat(candidate.priceChangePercent),
    maxChange24hDuringTrade:parseFloat(candidate.priceChangePercent),
    minChange24hDuringTrade:parseFloat(candidate.priceChangePercent),

    // Score evolution (mutable)
    aesFullCurrent:           aesFull,
    aesNoRankCurrent:         aesNoRank,
    aesSetupOnlyCurrent:      aesSetupOnly,
    aesFullMaxAfterEntry:     aesFull,
    aesNoRankMaxAfterEntry:   aesNoRank,
    aesSetupOnlyMaxAfterEntry:aesSetupOnly,
    aesFullMinAfterEntry:     aesFull,
    scorePeakAt:              null,
    scoreDecayFromEntry:      null,

    // PnL fields (populated at close)
    finalPnlPct:            null,
    normPnlPct:             null,
    feeDragPct:             null,
    feeAdjustedFinalPnlPct: null,
    normFeeAdjustedPnlPct:  null,
    mae:                    0,
    mfe:                    0,
    timeToMfeMs:            null,
    mfeCaptureRatio:        null,
    closeReason:            null,
    holdMsActual:           null,
    outcomeLabels:          [],

    // Dataset marker
    datasetSource: "AES_DISCOVERY_SHADOWS",
  };

  assertShadowSafe(trade);

  console.info("[AES_DISCOVERY_SHADOW_ENTRY]", {
    symbol,
    side: trade.side,
    side24hRank,
    rankBand: candidate.rankBand,
    aesFull,
    aesNoRank,
    aesSetupOnly,
    telemetryCoveragePct: snapshot.telemetryCoveragePct,
    labels: labels.slice(0, 5),
    executionMode: "LOG_ONLY",
  });

  return trade;
}

// ── Shadow trade broad-scan update ────────────────────────────────────────────

export function updateShadowTradeBroadScan(trade, currentTickerEntry, now = Date.now()) {
  if (!trade || trade.closed) return trade;
  assertShadowSafe(trade);

  if (!currentTickerEntry) return trade;

  const cp         = parseFloat(currentTickerEntry.lastPrice);
  const currRank   = currentTickerEntry.side24hRank ?? trade.currentSide24hRank;
  const change24h  = parseFloat(currentTickerEntry.priceChangePercent);

  if (!Number.isFinite(cp)) return trade;

  const priceUp = (cp - trade.entryPrice) / trade.entryPrice * 100;
  const priceDn = (trade.entryPrice - cp) / trade.entryPrice * 100;
  // LONG: price up = favorable (MFE), price down = adverse (MAE)
  const mfe     = Math.max(trade.mfe ?? 0, priceUp);
  const mae     = Math.max(trade.mae ?? 0, priceDn);

  // Rank milestones
  const updates = { currentPrice: cp, mae, mfe, currentSide24hRank: currRank, change24hCurrent: change24h };

  if (currRank != null) {
    if (!trade.bestSide24hRankReached || currRank < trade.bestSide24hRankReached) {
      updates.bestSide24hRankReached = currRank;
      updates.bestRankReachedAt = now;
    }
    if (!trade.worstSide24hRankReached || currRank > trade.worstSide24hRankReached) {
      updates.worstSide24hRankReached = currRank;
    }
    if (!trade.enteredTop100 && currRank <= 100) {
      updates.enteredTop100 = true;
      updates.enteredTop100At = now;
      updates.timeToTop100Ms = now - trade.entryTime;
    }
    if (!trade.enteredTop50 && currRank <= 50) {
      updates.enteredTop50 = true;
      updates.enteredTop50At = now;
      updates.timeToTop50Ms = now - trade.entryTime;
    }
    if (!trade.enteredTop25 && currRank <= 25) {
      updates.enteredTop25 = true;
      updates.enteredTop25At = now;
      updates.timeToTop25Ms = now - trade.entryTime;
    }
  }

  if (Number.isFinite(change24h)) {
    updates.maxChange24hDuringTrade = Math.max(trade.maxChange24hDuringTrade ?? change24h, change24h);
    updates.minChange24hDuringTrade = Math.min(trade.minChange24hDuringTrade ?? change24h, change24h);
  }

  return { ...trade, ...updates };
}

// ── Shadow exit ───────────────────────────────────────────────────────────────

export function evaluateShadowExit(trade, config = AES_DISCOVERY_CONFIG, now = Date.now()) {
  if (!trade || trade.closed) return trade;
  assertShadowSafe(trade);

  const cp         = trade.currentPrice ?? trade.entryPrice;
  const leverage   = trade.researchLeverage ?? config.defaultResearchLeverage;
  const holdMs     = now - trade.entryTime;

  const priceUp = (cp - trade.entryPrice) / trade.entryPrice * 100;
  const priceDn = (trade.entryPrice - cp) / trade.entryPrice * 100;

  const SL_PRICE_PCT  = 1.0;
  const TP_PRICE_PCT  = 5.0;
  const HOLD_MS_MAX   = 3 * 60 * 60_000; // 3h

  let closeReason = null;
  let finalPricePct = null;

  // LONG: SL when price falls, TP when price rises
  if (priceDn >= SL_PRICE_PCT) {
    closeReason = "SL";
    finalPricePct = -SL_PRICE_PCT;
  } else if (priceUp >= TP_PRICE_PCT) {
    closeReason = "TP";
    finalPricePct = TP_PRICE_PCT;
  } else if (holdMs >= HOLD_MS_MAX) {
    closeReason = "TIMEOUT";
    finalPricePct = (cp - trade.entryPrice) / trade.entryPrice * 100;
  }

  if (!closeReason) return trade;

  const finalPnlPct             = parseFloat((finalPricePct * leverage).toFixed(4));
  const normPnlPct              = parseFloat((finalPricePct).toFixed(4));
  const feeDragPct              = 2 * config.takerFeeRatePctPerSide * leverage;
  const feeAdjustedFinalPnlPct  = parseFloat((finalPnlPct - feeDragPct).toFixed(4));
  const normFeeAdjustedPnlPct   = parseFloat((normPnlPct - config.normalizedRoundTripFeePct).toFixed(4));
  const holdMsActual             = holdMs;

  let mfeCaptureRatio = null;
  if ((trade.mfe ?? 0) > 0) {
    // LONG: mfe = max price up; capture = how much of that up-move is at exit
    mfeCaptureRatio = Math.min(1, Math.max(0, priceUp / trade.mfe));
  }

  const closedTrade = {
    ...trade,
    closed: true,
    closedAt: now,
    closeReason,
    finalPnlPct,
    normPnlPct,
    feeDragPct,
    feeAdjustedFinalPnlPct,
    normFeeAdjustedPnlPct,
    holdMsActual,
    mfeCaptureRatio,
    timeToMfeMs: trade.mfe > 0 ? holdMs : null,
  };

  const outcomeLabels = assignOutcomeLabels(closedTrade, config);
  closedTrade.outcomeLabels = outcomeLabels;

  assertShadowSafe(closedTrade);

  console.info("[AES_DISCOVERY_SHADOW_EXIT]", {
    symbol: trade.symbol,
    closeReason,
    finalPnlPct,
    normFeeAdjustedPnlPct,
    mfe: trade.mfe,
    mae: trade.mae,
    holdMsActual,
    executionMode: "LOG_ONLY",
  });

  return closedTrade;
}

// ── Episode state update ──────────────────────────────────────────────────────

export function updateEpisodeState(episodeState, symbol, aesVariants, trade, config = AES_DISCOVERY_CONFIG, now = Date.now()) {
  const { aesFull, aesNoRank, aesSetupOnly } = aesVariants;
  const thresholds = config.aesThresholds;

  const prev = episodeState.lastScores[symbol];
  const prevMax = prev ? Math.max(prev.aesFull ?? 0, prev.aesNoRank ?? 0, prev.aesSetupOnly ?? 0) : null;
  const currMax = Math.max(aesFull ?? 0, aesNoRank ?? 0, aesSetupOnly ?? 0);

  // Detect score reset (dropped below reset threshold after being high)
  if (prevMax != null && prevMax >= thresholds.high && currMax < thresholds.reset) {
    episodeState.scoreResetSeen[symbol] = true;
  }
  if (currMax >= thresholds.high) {
    episodeState.scoreResetSeen[symbol] = false;
  }

  episodeState.lastScores[symbol] = { aesFull, aesNoRank, aesSetupOnly, ts: now };

  if (trade && !trade.closed) {
    episodeState.activeTradeId[symbol] = trade.id;
  } else if (!trade || trade.closed) {
    if (episodeState.activeTradeId[symbol]) {
      delete episodeState.activeTradeId[symbol];
      // Set cooldown
      episodeState.cooldownUntil[symbol] = now + config.reentryCooldownMs;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _freezeTelemetry(snapshot) {
  // Whitelist of fields from the full telemetry to freeze at entry
  return {
    atrPct:                  snapshot.atrPct ?? null,
    spreadPct:               snapshot.spreadPct ?? null,
    cvdLabel:                snapshot.cvdLabel ?? null,
    candleColorAtEntry:      snapshot.candleColorAtEntry ?? null,
    immediateRedImpulse:     snapshot.immediateRedImpulse ?? null,
    redImpulseDetected:      snapshot.redImpulseDetected ?? null,
    immediateGreenImpulse:   snapshot.immediateGreenImpulse ?? null,
    greenImpulseDetected:    snapshot.greenImpulseDetected ?? null,
    hasRedConfirmation:      snapshot.hasRedConfirmation ?? null,
    last3TicksDirection:     snapshot.last3TicksDirection ?? null,
    last5TicksDirection:     snapshot.last5TicksDirection ?? null,
    last3BroadTicksDirection:snapshot.last3BroadTicksDirection ?? null,
    microBouncePct:          snapshot.microBouncePct ?? null,
    priceVsVwapLabel:        snapshot.priceVsVwapLabel ?? null,
    vwapContextLabel:        snapshot.vwapContextLabel ?? null,
    macdHistogramState1m:    snapshot.macdHistogramState1m ?? null,
    hasRsiRollover:          snapshot.hasRsiRollover ?? null,
    hasGainerFailedBreakout: snapshot.hasGainerFailedBreakout ?? null,
    hasGainerRedRejection:   snapshot.hasGainerRedRejection ?? null,
    btcRunDirection:         snapshot.btcRunDirection ?? null,
    btcLongContextLabel:     snapshot.btcLongContextLabel ?? snapshot.btcShortContextLabel ?? null,
    btcRegime:               snapshot.btcRegime ?? null,
    sessionQuality:          snapshot.sessionQuality ?? null,
    telemetrySnapshotId:     snapshot.telemetrySnapshotId ?? null,
  };
}
