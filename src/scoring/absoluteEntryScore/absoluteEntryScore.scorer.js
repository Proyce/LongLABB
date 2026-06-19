// ─── AES V3 SCORER ───────────────────────────────────────────────────────────
// Deterministic, neutral-centered, side-aware entry quality instrument.
// LOG ONLY — must never affect execution paths.

import {
  DEFAULT_AES_CONFIG,
  ABSOLUTE_ENTRY_SCORE_VERSION,
  FAMILY_BOUNDS,
  DIRECTION_WEIGHTS,
  MOVEMENT_MATURITY_WEIGHTS,
  VOLATILITY_WEIGHTS,
  LOCATION_WEIGHTS,
  FLOW_MOMENTUM_WEIGHTS,
  EXECUTION_WEIGHTS,
  MARKET_CONTEXT_WEIGHTS,
  GAINER_WEIGHTS,
  LOSER_WEIGHTS,
  INTERACTION_WEIGHTS,
  RISK_PENALTY_WEIGHTS,
  mergeAesConfig,
} from "./absoluteEntryScore.config.js";
import { normalizeAesFeatures } from "./absoluteEntryScore.features.js";
import {
  classifyAesTier,
  classifyAesEligibility,
  classifyAesConfidenceLabel,
  computeAesConfidenceScore,
} from "./absoluteEntryScore.labels.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Safety guard ──────────────────────────────────────────────────────────────

function assertLogOnly(cfg) {
  if (cfg.logOnly !== true) {
    throw new Error("AES V3: logOnly must be true — scorer must not be called in execution-impacting mode");
  }
  if (cfg.allowExecutionImpact === true) {
    throw new Error("AES V3: allowExecutionImpact must be false — AES must not affect execution");
  }
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function addContribution(list, code, family, points, value = null) {
  if (points === 0) return;
  list.push({ code, family, points, ...(value !== null ? { value } : {}) });
}

// ── 1. Direction score [-18, +16] ─────────────────────────────────────────────
// Uses strongest red state only — no additive duplication.
function scoreDirection(f, w, pos, neg) {
  let score = 0;
  const { bounds } = { bounds: FAMILY_BOUNDS.direction };

  const immediateRed = f.immediateRedImpulse === true || f.redImpulseDetected === true;
  if (immediateRed) {
    addContribution(pos, "IMMEDIATE_RED_OR_DETECTED", "DIRECTION", w.immediateRedOrDetected);
    score += w.immediateRedOrDetected;
  } else if (f.hasRedConfirmation === true) {
    addContribution(pos, "RED_CONFIRMATION", "DIRECTION", w.hasRedConfirmation);
    score += w.hasRedConfirmation;
  } else if (f.candleColorAtEntry === "RED") {
    addContribution(pos, "RED_CANDLE", "DIRECTION", w.redCandle);
    score += w.redCandle;
  }

  const noActiveGreen = f.immediateGreenImpulse !== true && f.greenImpulseDetected !== true;
  // Only award no-green bonus when we have confirmed absence (both known false)
  const confirmedNoGreen = f.immediateGreenImpulse === false && f.greenImpulseDetected === false;
  if (confirmedNoGreen) {
    addContribution(pos, "NO_ACTIVE_GREEN_IMPULSE", "DIRECTION", w.noActiveGreenImpulse);
    score += w.noActiveGreenImpulse;
  }

  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;
  if (f.candleColorAtEntry === "GREEN" && !activeGreen) {
    addContribution(neg, "GREEN_CANDLE_NO_ACTIVE_IMPULSE", "DIRECTION", w.greenCandleNoActive);
    score += w.greenCandleNoActive;
  }

  return clamp(score, FAMILY_BOUNDS.direction.min, FAMILY_BOUNDS.direction.max);
}

// ── 2. Movement maturity score [-8, +18] ─────────────────────────────────────
function scoreMovementMaturity(f, w, pos, neg, warnings) {
  let score = 0;
  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;
  const hasRedResumption = (f.hasRedConfirmation === true || f.immediateRedImpulse === true || f.redImpulseDetected === true) && !activeGreen;

  // Bounce scoring — only valid after red resumption + no active green
  if (f.microBouncePct !== null) {
    const pct = f.microBouncePct;
    if (hasRedResumption) {
      const tiers = w.bounceTiers;
      let bouncePoints = 0;
      for (const tier of tiers) {
        if (pct < tier.max) { bouncePoints = tier.points; break; }
      }
      if (pct > w.highBounceThreshold) {
        warnings.push("HIGH_MICRO_BOUNCE_VARIANCE");
      }
      if (bouncePoints > 0) {
        addContribution(pos, `MICRO_BOUNCE_${Math.round(pct * 100)}`, "MOVEMENT_MATURITY", bouncePoints, pct);
        score += bouncePoints;
      } else if (bouncePoints < 0) {
        addContribution(neg, `MICRO_BOUNCE_LOW_${Math.round(pct * 100)}`, "MOVEMENT_MATURITY", bouncePoints, pct);
        score += bouncePoints;
      }
    } else if (f.microBouncePct > 0.5) {
      warnings.push("BOUNCE_NOT_YET_REJECTED");
    }
  }

  // Tick direction
  const last3Down = f.last3TicksDirection === "DOWN";
  if (last3Down) {
    const redAndNoGreen = (f.hasRedConfirmation === true || f.immediateRedImpulse === true) && !activeGreen;
    if (redAndNoGreen) {
      addContribution(pos, "LAST3_DOWN_RED_NO_GREEN", "MOVEMENT_MATURITY", w.last3DownWithRedNoGreen);
      score += w.last3DownWithRedNoGreen;
    } else {
      addContribution(pos, "LAST3_DOWN", "MOVEMENT_MATURITY", w.last3DownOther);
      score += w.last3DownOther;
    }
  }

  // Micro momentum labels
  if (f.microMomentumLabel === "MICRO_MULTI_CONFIRM") {
    addContribution(pos, "MICRO_MULTI_CONFIRM", "MOVEMENT_MATURITY", w.microMultiConfirm);
    score += w.microMultiConfirm;
  } else if (f.microMomentumLabel === "MICRO_RED_IMPULSE") {
    addContribution(pos, "MICRO_RED_IMPULSE", "MOVEMENT_MATURITY", w.microRedImpulse);
    score += w.microRedImpulse;
  }

  // MICRO_TICKS_DOWN penalty — gainer only, without red/RSI confirmation
  if (f.microMomentumLabel === "MICRO_TICKS_DOWN" && f.side === "GAINER") {
    const hasConfirmation = f.hasRedConfirmation === true || f.hasRsiRollover === true || f.hasGainerRsiRollover === true;
    if (!hasConfirmation) {
      addContribution(neg, "GAINER_MICRO_TICKS_DOWN_UNCONFIRMED", "MOVEMENT_MATURITY", w.gainerMicroTicksDownPenalty);
      score += w.gainerMicroTicksDownPenalty;
    }
  }

  return clamp(score, FAMILY_BOUNDS.movementMaturity.min, FAMILY_BOUNDS.movementMaturity.max);
}

// ── 3. Volatility score [-6, +8] ──────────────────────────────────────────────
function scoreVolatility(f, w, pos, neg, warnings, missingFields) {
  if (f.atrPct === null) {
    missingFields.push("atrPct");
    return 0;
  }
  const atr = f.atrPct;
  const bands = w.bands;
  let points = 0;
  for (const band of bands) {
    if (atr < band.max) { points = band.points; break; }
  }
  if (atr > w.highAtrThreshold) warnings.push("HIGH_ATR_VARIANCE");

  if (points > 0) addContribution(pos, `ATR_BAND_${Math.round(atr * 100)}`, "VOLATILITY", points, atr);
  else if (points < 0) addContribution(neg, `ATR_BAND_LOW_${Math.round(atr * 100)}`, "VOLATILITY", points, atr);

  return clamp(points, FAMILY_BOUNDS.volatility.min, FAMILY_BOUNDS.volatility.max);
}

// ── 4. Location/VWAP score [-10, +10] ─────────────────────────────────────────
function scoreLocation(f, w, pos, neg) {
  let score = 0;
  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;
  const hasRed = f.hasRedConfirmation === true || f.immediateRedImpulse === true || f.redImpulseDetected === true;

  if (f.priceVsVwapLabel === "BELOW_VWAP") {
    if (hasRed) {
      addContribution(pos, "BELOW_VWAP_RED_CONFIRMATION", "LOCATION", w.belowVwapRedConfirmation);
      score += w.belowVwapRedConfirmation;
      if (f.last3TicksDirection === "DOWN") {
        addContribution(pos, "BELOW_VWAP_RED_LAST3_DOWN", "LOCATION", w.belowVwapRedLast3Down);
        score += w.belowVwapRedLast3Down;
      }
      // Magnitude bonus when below VWAP with red continuation
      if (f.priceVsVwapPct !== null) {
        const magnitude = Math.min(Math.abs(f.priceVsVwapPct), w.magnitudeCapPct) / w.magnitudeCapPct * w.magnitudeMaxBonus;
        if (magnitude > 0) {
          addContribution(pos, "BELOW_VWAP_MAGNITUDE", "LOCATION", Math.round(magnitude), f.priceVsVwapPct);
          score += Math.round(magnitude);
        }
      }
    }
  } else if (f.priceVsVwapLabel === "ABOVE_VWAP") {
    const gainerRejection = f.hasGainerRedRejection === true || f.hasGainerFailedBreakout === true;
    if (gainerRejection) {
      addContribution(pos, "ABOVE_VWAP_GAINER_REJECTION", "LOCATION", w.aboveVwapGainerRedRejectionFailedBreakout);
      score += w.aboveVwapGainerRedRejectionFailedBreakout;
      if (f.priceVsVwapPct !== null) {
        const magnitude = Math.min(Math.abs(f.priceVsVwapPct), w.magnitudeCapPct) / w.magnitudeCapPct * w.magnitudeMaxBonus;
        if (magnitude > 0) {
          addContribution(pos, "ABOVE_VWAP_REJECTION_MAGNITUDE", "LOCATION", Math.round(magnitude), f.priceVsVwapPct);
          score += Math.round(magnitude);
        }
      }
    } else if ((f.volAccel ?? 0) > 0 && !hasRed) {
      addContribution(neg, "ABOVE_VWAP_VOLACCEL_NO_RED", "LOCATION", w.aboveVwapVolAccelNoRedNoRejection);
      score += w.aboveVwapVolAccelNoRedNoRejection;
    }
  }

  if (f.vwapContextLabel === "VWAP_RECLAIM" && !activeGreen) {
    addContribution(neg, "VWAP_RECLAIM_NO_GREEN", "LOCATION", w.vwapReclaimNoActiveGreen);
    score += w.vwapReclaimNoActiveGreen;
  }

  return clamp(score, FAMILY_BOUNDS.location.min, FAMILY_BOUNDS.location.max);
}

// ── 5. Flow + momentum score [-12, +10] ───────────────────────────────────────
function scoreFlowMomentum(f, w, pos, neg) {
  let score = 0;
  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;
  const hasRed = f.hasRedConfirmation === true || f.immediateRedImpulse === true || f.redImpulseDetected === true;

  // CVD
  if (f.cvdLabel === "BEAR") {
    addContribution(pos, "CVD_BEAR", "FLOW_MOMENTUM", w.cvdBear);
    score += w.cvdBear;
  } else if (f.cvdLabel === "NEUT") {
    addContribution(pos, "CVD_NEUT", "FLOW_MOMENTUM", w.cvdNeut);
    score += w.cvdNeut;
  } else if (f.cvdLabel === "BULL") {
    if (f.side === "GAINER" && (f.hasGainerRedRejection === true || f.hasGainerFailedBreakout === true)) {
      addContribution(neg, "CVD_BULL_GAINER_REJECTION", "FLOW_MOMENTUM", w.cvdBullGainerStrongRejection);
      score += w.cvdBullGainerStrongRejection;
    } else if (f.side === "LOSER") {
      addContribution(neg, "CVD_BULL_LOSER", "FLOW_MOMENTUM", w.cvdBullLoser);
      score += w.cvdBullLoser;
    }
    // CVD_BULL alone is NOT a block in V3 — only contributes a modest penalty here
  }

  // MACD
  const macd = f.macdHistogramState1m ?? "";
  if (macd.includes("NEGATIVE_EXPANDING")) {
    addContribution(pos, "MACD_NEGATIVE_EXPANDING", "FLOW_MOMENTUM", w.macdNegativeExpanding);
    score += w.macdNegativeExpanding;
  } else if ((macd.includes("BEARISH") || macd.includes("SHRINKING")) && f.side === "GAINER") {
    addContribution(pos, "MACD_BEARISH_GAINER_ROLLOVER", "FLOW_MOMENTUM", w.macdBearishGainerRollover);
    score += w.macdBearishGainerRollover;
  } else if (macd.includes("POSITIVE_EXPANDING") || macd.includes("BULLISH_EXPANDING")) {
    addContribution(neg, "MACD_BULLISH_EXPANSION", "FLOW_MOMENTUM", w.macdBullishExpansion);
    score += w.macdBullishExpansion;
  }

  // RSI rollover
  if (f.hasRsiRollover === true && !activeGreen) {
    addContribution(pos, "RSI_ROLLOVER_NO_GREEN", "FLOW_MOMENTUM", w.rsiRolloverNoGreen);
    score += w.rsiRolloverNoGreen;
  }

  return clamp(score, FAMILY_BOUNDS.flowMomentum.min, FAMILY_BOUNDS.flowMomentum.max);
}

// ── 6. Execution score [-8, +6] ───────────────────────────────────────────────
function scoreExecution(f, w, pos, neg, warnings) {
  let score = 0;

  if (f.spreadPct !== null) {
    const spread = f.spreadPct;
    const tiers = w.spreadTiers;
    let spreadPoints = 0;
    for (const tier of tiers) {
      if (spread <= tier.max) { spreadPoints = tier.points; break; }
    }
    if (spread > w.wideSpreadsThreshold) warnings.push("WIDE_SPREAD");
    if (spreadPoints > 0) addContribution(pos, `TIGHT_SPREAD_${Math.round(spread * 1000)}`, "EXECUTION", spreadPoints, spread);
    else if (spreadPoints < 0) addContribution(neg, `WIDE_SPREAD_${Math.round(spread * 1000)}`, "EXECUTION", spreadPoints, spread);
    score += spreadPoints;
  }

  const rank = f.entryRankInBucket;
  if (rank !== null) {
    const tiers = w.rankTiers;
    let rankPoints = 0;
    for (const tier of tiers) {
      if (rank <= tier.max) { rankPoints = tier.points; break; }
    }
    if (rankPoints > 0) addContribution(pos, `RANK_${rank}`, "EXECUTION", rankPoints, rank);
    else if (rankPoints < 0) addContribution(neg, `RANK_LOW_${rank}`, "EXECUTION", rankPoints, rank);
    score += rankPoints;
  }

  return clamp(score, FAMILY_BOUNDS.execution.min, FAMILY_BOUNDS.execution.max);
}

// ── 7. Market context score [-8, +8] ──────────────────────────────────────────
function scoreMarketContext(f, w, pos, neg, regimeSpecificUsed) {
  let score = 0;
  const btcDir = f.btcRunDirection;

  if (btcDir === "DOWN") {
    addContribution(pos, "BTC_DOWN", "MARKET_CONTEXT", w.btcDown);
    score += w.btcDown;
  } else if (btcDir === "FLAT" || btcDir === "MIXED") {
    addContribution(pos, "BTC_FLAT_MIXED", "MARKET_CONTEXT", w.btcFlatMixed);
    score += w.btcFlatMixed;
  } else if (btcDir === "UP") {
    addContribution(neg, "BTC_UP", "MARKET_CONTEXT", w.btcUp);
    score += w.btcUp;
  }

  const ctx = f.btcShortContextLabel ?? "";
  if (ctx === "SHORT_FRIENDLY_CANDIDATE" || ctx.includes("SHORT_FRIENDLY")) {
    addContribution(pos, "SHORT_FRIENDLY_CANDIDATE", "MARKET_CONTEXT", w.shortFriendlyCandidate);
    score += w.shortFriendlyCandidate;
  } else if (ctx.includes("UNFRIENDLY") || ctx.includes("BULLISH")) {
    addContribution(neg, "UNFRIENDLY_BULLISH_SESSION", "MARKET_CONTEXT", w.unfriendlyBullishSession);
    score += w.unfriendlyBullishSession;
  }

  // Loser regime interaction: BTC 30m FLAT + BTC 2h DOWN
  if (f.side === "LOSER" && f.btc30mDirection === "FLAT" && f.btc2hDirection === "DOWN") {
    addContribution(pos, "REGIME_BTC30_FLAT_BTC2H_DOWN", "MARKET_CONTEXT", w.loserRegimeInteraction);
    score += w.loserRegimeInteraction;
    regimeSpecificUsed.value = true;
  }

  return clamp(score, FAMILY_BOUNDS.marketContext.min, FAMILY_BOUNDS.marketContext.max);
}

// ── 8. Side-specific score [-18, +20] ─────────────────────────────────────────

function scoreGainerSide(f, gw, pos, neg) {
  let score = 0;
  const eq = f.topGainerExhaustionQualityScore ?? 0;

  if (eq >= 80) {
    addContribution(pos, "EXHAUSTION_SCORE_80", "SIDE_SPECIFIC_GAINER", gw.exhaustionScore80);
    score += gw.exhaustionScore80;
  }
  if (eq >= 120) {
    addContribution(pos, "EXHAUSTION_QUALITY_120", "SIDE_SPECIFIC_GAINER", gw.exhaustionQuality120);
    score += gw.exhaustionQuality120;
  }
  if (f.hasGainerExhaustionConfirmation === true) {
    addContribution(pos, "EXHAUSTION_CONFIRMATION", "SIDE_SPECIFIC_GAINER", gw.exhaustionConfirmation);
    score += gw.exhaustionConfirmation;
  }
  if (f.hasGainerRedRejection === true) {
    addContribution(pos, "GAINER_RED_REJECTION", "SIDE_SPECIFIC_GAINER", gw.gainerRedRejection);
    score += gw.gainerRedRejection;
  }
  if (f.hasGainerFailedBreakout === true) {
    addContribution(pos, "GAINER_FAILED_BREAKOUT", "SIDE_SPECIFIC_GAINER", gw.failedBreakout);
    score += gw.failedBreakout;
  }
  const lane = f.topGainerThesisLaneLabel ?? "";
  if (lane === "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT" || lane === "TOP_GAINER_FAILED_BREAKOUT_SHORT") {
    addContribution(pos, "CLASSIC_EXHAUSTION_LANE", "SIDE_SPECIFIC_GAINER", gw.classicExhaustionLane);
    score += gw.classicExhaustionLane;
  }
  if (f.topGainerVwapContextLabel === "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION") {
    addContribution(pos, "GAINER_VWAP_LOSS_RED", "SIDE_SPECIFIC_GAINER", gw.vwapLossRedConfirmation);
    score += gw.vwapLossRedConfirmation;
  }

  // Penalties
  if (f.hasGainerContinuationDanger === true) {
    // Only the broad penalty, not a hard block
    addContribution(neg, "BROAD_CONTINUATION_DANGER", "SIDE_SPECIFIC_GAINER", gw.broadContinuationDangerPenalty);
    score += gw.broadContinuationDangerPenalty;
  }
  if (lane === "TOP_GAINER_CONTINUATION_DANGER") {
    addContribution(neg, "EXACT_CONTINUATION_DANGER_LANE", "SIDE_SPECIFIC_GAINER", gw.exactContinuationDangerLane);
    score += gw.exactContinuationDangerLane;
  }
  if (f.topGainerPumpPhaseLabel === "GAINER_PUMP_STILL_HOT") {
    addContribution(neg, "PUMP_STILL_HOT", "SIDE_SPECIFIC_GAINER", gw.pumpStillHot);
    score += gw.pumpStillHot;
  }
  if (lane === "TOP_GAINER_RANK_MID_EXHAUSTION_SHORT") {
    addContribution(neg, "RANK_MID_EXHAUSTION_LANE", "SIDE_SPECIFIC_GAINER", gw.rankMidExhaustionLane);
    score += gw.rankMidExhaustionLane;
  }
  if (f.topGainerVwapContextLabel === "GAINER_VWAP_LOSS_STILL_BULLISH") {
    addContribution(neg, "VWAP_LOSS_STILL_BULLISH", "SIDE_SPECIFIC_GAINER", gw.vwapLossStillBullish);
    score += gw.vwapLossStillBullish;
  }
  if (
    f.hasGainerExhaustionConfirmation !== true &&
    f.topGainerWouldPassExhaustionAudit !== true &&
    eq < 80
  ) {
    addContribution(neg, "NO_EXHAUSTION_CONFIRMATION", "SIDE_SPECIFIC_GAINER", gw.noExhaustionConfirmation);
    score += gw.noExhaustionConfirmation;
  }

  return clamp(score, FAMILY_BOUNDS.sideSpecific.min, FAMILY_BOUNDS.sideSpecific.max);
}

function scoreLoserSide(f, lw, pos, neg) {
  let score = 0;
  const hasRed = f.hasRedConfirmation === true || f.immediateRedImpulse === true || f.redImpulseDetected === true;

  if (f.shortGateWouldPass === true) {
    addContribution(pos, "SHORT_GATE_PASS", "SIDE_SPECIFIC_LOSER", lw.shortGateWouldPass);
    score += lw.shortGateWouldPass;
  }
  if (f.priceVsVwapLabel === "BELOW_VWAP" && hasRed) {
    addContribution(pos, "LOSER_BELOW_VWAP_RED", "SIDE_SPECIFIC_LOSER", lw.belowVwapRedConfirmation);
    score += lw.belowVwapRedConfirmation;
  }
  if (f.last3TicksDirection === "DOWN") {
    addContribution(pos, "LOSER_LAST3_DOWN", "SIDE_SPECIFIC_LOSER", lw.last3DownLoserBase);
    score += lw.last3DownLoserBase;
  }
  const lane = f.topLoserThesisLaneLabel ?? f.shortThesisLaneLabel ?? "";
  if (lane === "TOP_LOSER_SCALP_CANDIDATE" || lane.includes("SCALP_CANDIDATE")) {
    addContribution(pos, "TOP_LOSER_SCALP_CANDIDATE", "SIDE_SPECIFIC_LOSER", lw.topLoserScalpCandidate);
    score += lw.topLoserScalpCandidate;
  }

  // Penalties
  if (f.isBlindWeaknessShort === true) {
    addContribution(neg, "BLIND_WEAKNESS", "SIDE_SPECIFIC_LOSER", lw.blindWeakness);
    score += lw.blindWeakness;
  }
  if (f.isCorpseChaseRisk === true) {
    addContribution(neg, "CORPSE_CHASE", "SIDE_SPECIFIC_LOSER", lw.corpseChase);
    score += lw.corpseChase;
  }
  if (f.isBtcBounceTrapRisk === true) {
    addContribution(neg, "BTC_BOUNCE_TRAP", "SIDE_SPECIFIC_LOSER", lw.btcBounceTrap);
    score += lw.btcBounceTrap;
  }
  if (!hasRed) {
    addContribution(neg, "NO_IMMEDIATE_RED_CONFIRMATION", "SIDE_SPECIFIC_LOSER", lw.noImmediateRedConfirmation);
    score += lw.noImmediateRedConfirmation;
  }

  return clamp(score, FAMILY_BOUNDS.sideSpecific.min, FAMILY_BOUNDS.sideSpecific.max);
}

function scoreSideSpecific(f, pos, neg) {
  if (f.side === "GAINER") return scoreGainerSide(f, GAINER_WEIGHTS, pos, neg);
  if (f.side === "LOSER")  return scoreLoserSide(f, LOSER_WEIGHTS, pos, neg);
  return 0;
}

// Variant that excludes leaderboard-specific bonuses for aesSetupOnly
function scoreSideSpecificWithFlags(f, pos, neg, includeLeaderboardBonus = true) {
  if (includeLeaderboardBonus) return scoreSideSpecific(f, pos, neg);

  // aesSetupOnly: only pure price-action anatomy from side-specific families
  if (f.side === "GAINER") {
    return scoreGainerSideSetupOnly(f, GAINER_WEIGHTS, pos, neg);
  }
  if (f.side === "LOSER") {
    return scoreLoserSideSetupOnly(f, LOSER_WEIGHTS, pos, neg);
  }
  return 0;
}

// Gainer setup-only: keeps failed breakout + red rejection; excludes exhaustion quality
function scoreGainerSideSetupOnly(f, gw, pos, neg) {
  let score = 0;
  if (f.hasGainerRedRejection === true) {
    addContribution(pos, "GAINER_RED_REJECTION", "SIDE_SPECIFIC_GAINER", gw.gainerRedRejection);
    score += gw.gainerRedRejection;
  }
  if (f.hasGainerFailedBreakout === true) {
    addContribution(pos, "GAINER_FAILED_BREAKOUT", "SIDE_SPECIFIC_GAINER", gw.failedBreakout);
    score += gw.failedBreakout;
  }
  if (f.topGainerVwapContextLabel === "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION") {
    addContribution(pos, "GAINER_VWAP_LOSS_RED", "SIDE_SPECIFIC_GAINER", gw.vwapLossRedConfirmation);
    score += gw.vwapLossRedConfirmation;
  }
  if (f.topGainerVwapContextLabel === "GAINER_VWAP_LOSS_STILL_BULLISH") {
    addContribution(neg, "VWAP_LOSS_STILL_BULLISH", "SIDE_SPECIFIC_GAINER", gw.vwapLossStillBullish);
    score += gw.vwapLossStillBullish;
  }
  return clamp(score, FAMILY_BOUNDS.sideSpecific.min, FAMILY_BOUNDS.sideSpecific.max);
}

// Loser setup-only: keeps pure price-action signals; excludes shortGateWouldPass + scalp candidate labels
function scoreLoserSideSetupOnly(f, lw, pos, neg) {
  let score = 0;
  const hasRed = f.hasRedConfirmation === true || f.immediateRedImpulse === true || f.redImpulseDetected === true;
  if (f.priceVsVwapLabel === "BELOW_VWAP" && hasRed) {
    addContribution(pos, "LOSER_BELOW_VWAP_RED", "SIDE_SPECIFIC_LOSER", lw.belowVwapRedConfirmation);
    score += lw.belowVwapRedConfirmation;
  }
  if (f.last3TicksDirection === "DOWN") {
    addContribution(pos, "LOSER_LAST3_DOWN", "SIDE_SPECIFIC_LOSER", lw.last3DownLoserBase);
    score += lw.last3DownLoserBase;
  }
  if (f.isBlindWeaknessShort === true) {
    addContribution(neg, "BLIND_WEAKNESS", "SIDE_SPECIFIC_LOSER", lw.blindWeakness);
    score += lw.blindWeakness;
  }
  if (f.isCorpseChaseRisk === true) {
    addContribution(neg, "CORPSE_CHASE", "SIDE_SPECIFIC_LOSER", lw.corpseChase);
    score += lw.corpseChase;
  }
  if (f.isBtcBounceTrapRisk === true) {
    addContribution(neg, "BTC_BOUNCE_TRAP", "SIDE_SPECIFIC_LOSER", lw.btcBounceTrap);
    score += lw.btcBounceTrap;
  }
  if (!hasRed) {
    addContribution(neg, "NO_IMMEDIATE_RED_CONFIRMATION", "SIDE_SPECIFIC_LOSER", lw.noImmediateRedConfirmation);
    score += lw.noImmediateRedConfirmation;
  }
  return clamp(score, FAMILY_BOUNDS.sideSpecific.min, FAMILY_BOUNDS.sideSpecific.max);
}

// ── 9. Interaction score [0, +12] ─────────────────────────────────────────────
// Co-occurrence bonuses for historically validated combinations.
function scoreInteraction(f, w, pos, experimentalComboUsed) {
  let score = 0;
  const iw = w;
  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;
  const hasRed = f.hasRedConfirmation === true || f.immediateRedImpulse === true || f.redImpulseDetected === true;
  const cvdOk = f.cvdLabel === "BEAR" || f.cvdLabel === "NEUT";
  const atr = f.atrPct ?? 0;
  const noGreen = !activeGreen;

  // Universal core interaction: red + no green + ATR >= 0.2 + CVD ok
  if (hasRed && noGreen && atr >= 0.2 && cvdOk) {
    addContribution(pos, "UNIVERSAL_CORE_INTERACTION", "INTERACTION", iw.universalCore);
    score += iw.universalCore;
    if (atr >= 0.6) {
      addContribution(pos, "UNIVERSAL_CORE_HIGH_ATR", "INTERACTION", iw.universalCoreHighAtr);
      score += iw.universalCoreHighAtr;
    }
  }

  // Gainer sniper: exhaustion quality >= 120 + last3 DOWN + ATR >= 0.6
  if (f.side === "GAINER" && (f.topGainerExhaustionQualityScore ?? 0) >= 120 && f.last3TicksDirection === "DOWN" && atr >= 0.6) {
    addContribution(pos, "GAINER_SNIPER_INTERACTION", "INTERACTION", iw.gainerSniper);
    score += iw.gainerSniper;
  }

  // Failed breakout + RSI rollover + red + no green
  if (f.hasGainerFailedBreakout === true && f.hasRsiRollover === true && hasRed && noGreen && cvdOk) {
    addContribution(pos, "FAILED_BREAKOUT_RSI_INTERACTION", "INTERACTION", iw.failedBreakoutRsi);
    score += iw.failedBreakoutRsi;
    experimentalComboUsed.value = true;
  }

  // Loser sniper: red impulse + no green + CVD ok + ATR >= 0.6 + spread <= 0.05
  if (
    f.side === "LOSER" &&
    (f.immediateRedImpulse === true || f.redImpulseDetected === true) &&
    noGreen && cvdOk && atr >= 0.6 &&
    (f.spreadPct ?? 1) <= 0.05
  ) {
    addContribution(pos, "LOSER_SNIPER_INTERACTION", "INTERACTION", iw.loserSniper);
    score += iw.loserSniper;
  }

  // Mature bounce-resumption: microBouncePct > 0.8 + red + last3 DOWN + no green
  if (
    (f.microBouncePct ?? 0) > 0.8 &&
    hasRed && f.last3TicksDirection === "DOWN" && noGreen
  ) {
    addContribution(pos, "BOUNCE_MATURE_RESUMPTION", "INTERACTION", iw.bounceMature);
    score += iw.bounceMature;
  }

  return clamp(score, FAMILY_BOUNDS.interaction.min, iw.familyCap);
}

// ── Risk penalty score [0, 50] ────────────────────────────────────────────────
// NOTE: weights are intentionally modest for signals that already produce
// negative contributions in direction/flow families to avoid double-counting.
function computeRiskPenalty(f, rw, researchBlockReasons, cautionReasons) {
  let penalty = 0;
  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;

  if (f.immediateGreenImpulse === true) {
    penalty += rw.immediateGreenImpulse;
  }
  if (f.greenImpulseDetected === true) {
    penalty += rw.greenImpulseDetected;
  }
  if (f.candleColorAtEntry === "GREEN" && !activeGreen) {
    penalty += rw.greenCandleWithoutActive;
  }

  // CVD BULL only penalizes when combined with active green (larger risk)
  if (f.cvdLabel === "BULL" && activeGreen) {
    penalty += rw.cvdBullActiveGreen;
    researchBlockReasons.push("ACTIVE_GREEN_AND_CVD_BULL");
  }

  if ((f.spreadPct ?? 0) > 0.08) {
    penalty += rw.spreadGt008;
    cautionReasons.push("WIDE_SPREAD_EXECUTION_RISK");
  }

  if (f.vwapContextLabel === "VWAP_RECLAIM") {
    penalty += rw.vwapReclaim;
    if (activeGreen) researchBlockReasons.push("ACTIVE_GREEN_AND_VWAP_RECLAIM");
    else cautionReasons.push("VWAP_RECLAIM_CAUTION");
  }

  if (f.entryTimingGrade === "F") {
    penalty += rw.entryTimingGradeF;
    researchBlockReasons.push("ENTRY_TIMING_GRADE_F");
  }

  if (f.side === "GAINER") {
    if (f.topGainerPumpPhaseLabel === "GAINER_PUMP_STILL_HOT") {
      penalty += rw.gainerPumpStillHot;
    }
    if (f.topGainerContinuationPressureLabel === "GAINER_CONTINUATION_EXTREME") {
      penalty += rw.gainerContinuationExtreme;
    }
    if (f.topGainerPumpPhaseLabel === "GAINER_PUMP_STILL_HOT" && f.topGainerContinuationPressureLabel === "GAINER_CONTINUATION_EXTREME") {
      researchBlockReasons.push("GAINER_PUMP_HOT_CONTINUATION_EXTREME");
    }
  }

  // Below VWAP + active green danger (combination)
  if (f.priceVsVwapLabel === "BELOW_VWAP" && activeGreen) {
    penalty += rw.belowVwapGreenDanger;
    researchBlockReasons.push("BELOW_VWAP_WITH_GREEN_DANGER");
  }

  // RSI rollover + green pressure = research block
  if (f.hasRsiRollover === true && activeGreen) {
    penalty += rw.greenPressureWithRsiRollover;
    researchBlockReasons.push("GREEN_PRESSURE_WITH_RSI_ROLLOVER");
  }

  // TOP_LOSER rejected green fade candidate
  const lane = f.topLoserThesisLaneLabel ?? f.shortThesisLaneLabel ?? "";
  if (lane === "TOP_LOSER_REJECTED_GREEN_FADE_CANDIDATE") {
    penalty += rw.rejectedGreenFadeCandidate;
    researchBlockReasons.push("TOP_LOSER_REJECTED_GREEN_FADE_CANDIDATE");
  }

  // Invalid or stale
  if (f.isInvalidMarket === true) {
    penalty += rw.invalidOrStale;
    researchBlockReasons.push("INVALID_MARKET");
  }
  if (f.isStale === true) {
    penalty += rw.invalidOrStale;
    researchBlockReasons.push("STALE_ENTRY_TELEMETRY");
  }

  const capped = clamp(penalty, 0, 50);
  if (capped >= 50) researchBlockReasons.push("RISK_PENALTY_MAX");

  return capped;
}

// ── Main scorer ───────────────────────────────────────────────────────────────
// componentOptions controls which scoring families contribute.  All flags
// default to true to preserve existing behavior.  Only the discovery score
// module passes false flags.

export function computeAbsoluteEntryScoreV3(s, configOverrides = {}, componentOptions = {}) {
  let cfg;
  try {
    cfg = mergeAesConfig(configOverrides);
    assertLogOnly(cfg);
  } catch (err) {
    throw err; // Config/safety errors must propagate to caller
  }

  try {
    return _computeV3Inner(s, cfg, componentOptions);
  } catch (err) {
    // Scorer errors produce fallback — never null, never throws past this boundary
    return {
      absoluteEntryScoreVersion: ABSOLUTE_ENTRY_SCORE_VERSION,
      absoluteEntryIsLogOnly: true,
      absoluteEntryCanAffectExecution: false,
      absoluteEntryAction: "LOG_ONLY_OBSERVE",
      absoluteEntryScoreSource: "LIVE_PREVIEW_FALLBACK",
      absoluteEntryComputedAt: Date.now(),
      absoluteEntryCalibrationStatus: "UNCALIBRATED_RULE_MODEL",
      absoluteEntryScoreIsCalibrated: false,
      absoluteEntryScore: 50,
      absoluteEntryQualityScoreUncapped: 50,
      absoluteEntryRawUtility: 0,
      absoluteEntryTier: "AES_NEUTRAL",
      absoluteEntryEligibility: "CAUTION",
      absoluteEntryConfidence: 0,
      absoluteEntryConfidenceLabel: "LOW_CONFIDENCE",
      absoluteEntryFeatureCoveragePct: 0,
      absoluteEntryMissingFields: ["PREVIEW_SCORER_UNAVAILABLE"],
      absoluteEntryDirectionScore: 0,
      absoluteEntryMovementMaturityScore: 0,
      absoluteEntryVolatilityScore: 0,
      absoluteEntryLocationScore: 0,
      absoluteEntryFlowMomentumScore: 0,
      absoluteEntryExecutionScore: 0,
      absoluteEntryMarketContextScore: 0,
      absoluteEntrySideSpecificScore: 0,
      absoluteEntryInteractionScore: 0,
      absoluteEntryRiskPenaltyScore: 0,
      absoluteEntryPositiveContributions: [],
      absoluteEntryNegativeContributions: [],
      absoluteEntryWarnings: ["AES_PREVIEW_ERROR", err?.message ?? "UNKNOWN_ERROR"],
      absoluteEntryResearchBlockReasons: [],
      absoluteEntryCautionReasons: [],
      absoluteEntryResearchLabels: [],
      absoluteEntryExperimentalSignals: [],
      absoluteEntrySide: "UNKNOWN",
      absoluteEntryFeatureSnapshot: null,
      absoluteEntryIsHighQualityResearch: false,
      absoluteEntryIsSniperResearch: false,
      absoluteEntryIsEliteResearch: false,
      absoluteEntryExpectedFeeNet: null,
      absoluteEntryEstimatedSlProbability: null,
      absoluteEntryRunnerProbability: null,
      recommendedMaxOpenMode: null,
      recommendedLeverageMode: null,
      recommendedExitBias: null,
      initialExitBias: null,
      absoluteEntryHardBlocks: [],
      absoluteEntryGrade: null,
      absoluteEntryTrustLabel: null,
      sniperLabel: null,
      loserSniperLabel: null,
      gainerSniperLabel: null,
      isSniperCandidate: false,
      isSuperSniperCandidate: false,
      sniperTrustScore: null,
      isUniversalShortGatePass: false,
      isHighQualityEntry: false,
      tenPctCandidateLabel: null,
      legacyAbsoluteEntryScoreV2: null,
      legacyAbsoluteEntryTierV2: null,
      legacyAbsoluteEntryHardBlocksV2: null,
    };
  }
}

function _computeV3Inner(s, cfg, componentOptions = {}) {
  const {
    includeRankInBucket = true,
    includeSideSpecificLeaderboardBonus = true,
  } = componentOptions;

  const { features, missingFields: featureMissingFields, featureCoveragePct, side } = normalizeAesFeatures(s);

  // Apply component exclusions by zeroing out controlled fields in a copy
  const f = includeRankInBucket ? features : { ...features, entryRankInBucket: null };

  const pos = [];
  const neg = [];
  const warnings = [];
  const researchBlockReasons = [];
  const cautionReasons = [];
  const extraMissingFields = [];
  const regimeSpecificUsed = { value: false };
  const experimentalComboUsed = { value: false };

  const directionScore        = scoreDirection(f, DIRECTION_WEIGHTS, pos, neg);
  const movementMaturityScore = scoreMovementMaturity(f, MOVEMENT_MATURITY_WEIGHTS, pos, neg, warnings);
  const volatilityScore       = scoreVolatility(f, VOLATILITY_WEIGHTS, pos, neg, warnings, extraMissingFields);
  const locationScore         = scoreLocation(f, LOCATION_WEIGHTS, pos, neg);
  const flowMomentumScore     = scoreFlowMomentum(f, FLOW_MOMENTUM_WEIGHTS, pos, neg);
  const executionScore        = scoreExecution(f, EXECUTION_WEIGHTS, pos, neg, warnings);
  const marketContextScore    = scoreMarketContext(f, MARKET_CONTEXT_WEIGHTS, pos, neg, regimeSpecificUsed);
  const sideSpecificScore     = scoreSideSpecificWithFlags(f, pos, neg, includeSideSpecificLeaderboardBonus);
  const interactionScore      = scoreInteraction(f, INTERACTION_WEIGHTS, pos, experimentalComboUsed);

  const riskPenaltyScore = computeRiskPenalty(f, RISK_PENALTY_WEIGHTS, researchBlockReasons, cautionReasons);

  const rawUtility =
    directionScore +
    movementMaturityScore +
    volatilityScore +
    locationScore +
    flowMomentumScore +
    executionScore +
    marketContextScore +
    sideSpecificScore +
    interactionScore -
    riskPenaltyScore;

  const qualityScoreUncapped = clamp(Math.round(50 + rawUtility), 0, 100);

  const researchBlock = researchBlockReasons.length > 0;
  const absoluteEntryScore = researchBlock
    ? Math.min(qualityScoreUncapped, 24)
    : qualityScoreUncapped;

  const absoluteEntryTier = classifyAesTier(absoluteEntryScore);

  const allMissingFields = [...featureMissingFields, ...extraMissingFields];

  const absoluteEntryEligibility = classifyAesEligibility(
    riskPenaltyScore,
    researchBlockReasons,
    cautionReasons,
    allMissingFields
  );

  const absoluteEntryConfidence = computeAesConfidenceScore({
    featureCoveragePct,
    missingFields: allMissingFields,
    previewMode: f.previewMode,
    regimeSpecificUsed: regimeSpecificUsed.value,
    experimentalComboUsed: experimentalComboUsed.value,
    stale: f.isStale === true,
  });

  const absoluteEntryConfidenceLabel = classifyAesConfidenceLabel(absoluteEntryConfidence);

  const source = f.previewMode ? "LIVE_PREVIEW" : "ENTRY_TELEMETRY_FINAL";

  // Derived booleans — log only, must not be consumed by entry logic
  const absoluteEntryIsHighQualityResearch = absoluteEntryScore >= 70;
  const absoluteEntryIsSniperResearch      = absoluteEntryScore >= 80;
  const absoluteEntryIsEliteResearch       = absoluteEntryScore >= 90;

  return {
    absoluteEntryScoreVersion: ABSOLUTE_ENTRY_SCORE_VERSION,
    absoluteEntryIsLogOnly: true,
    absoluteEntryCanAffectExecution: false,
    absoluteEntryAction: "LOG_ONLY_OBSERVE",
    absoluteEntryScoreSource: source,
    absoluteEntryComputedAt: Date.now(),
    absoluteEntryCalibrationStatus: "UNCALIBRATED_RULE_MODEL",
    absoluteEntryScoreIsCalibrated: false,

    absoluteEntryScore,
    absoluteEntryQualityScoreUncapped: qualityScoreUncapped,
    absoluteEntryRawUtility: rawUtility,
    absoluteEntryTier,
    absoluteEntryEligibility,
    absoluteEntryConfidence,
    absoluteEntryConfidenceLabel,
    absoluteEntryFeatureCoveragePct: featureCoveragePct,
    absoluteEntryMissingFields: allMissingFields,

    absoluteEntryDirectionScore:        directionScore,
    absoluteEntryMovementMaturityScore: movementMaturityScore,
    absoluteEntryVolatilityScore:       volatilityScore,
    absoluteEntryLocationScore:         locationScore,
    absoluteEntryFlowMomentumScore:     flowMomentumScore,
    absoluteEntryExecutionScore:        executionScore,
    absoluteEntryMarketContextScore:    marketContextScore,
    absoluteEntrySideSpecificScore:     sideSpecificScore,
    absoluteEntryInteractionScore:      interactionScore,
    absoluteEntryRiskPenaltyScore:      riskPenaltyScore,

    absoluteEntryPositiveContributions: pos,
    absoluteEntryNegativeContributions: neg,
    absoluteEntryWarnings:              warnings,
    absoluteEntryResearchBlockReasons:  researchBlockReasons,
    absoluteEntryCautionReasons:        cautionReasons,
    absoluteEntryResearchLabels:        [...researchBlockReasons],
    absoluteEntryExperimentalSignals:   experimentalComboUsed.value ? ["FAILED_BREAKOUT_RSI_COMBO"] : [],

    absoluteEntrySide: side,
    absoluteEntryFeatureSnapshot: { ...f },

    absoluteEntryIsHighQualityResearch,
    absoluteEntryIsSniperResearch,
    absoluteEntryIsEliteResearch,

    absoluteEntryExpectedFeeNet: null,
    absoluteEntryEstimatedSlProbability: null,
    absoluteEntryRunnerProbability: null,

    // Null legacy recommendation fields — AES V3 must not drive execution
    recommendedMaxOpenMode:  null,
    recommendedLeverageMode: null,
    recommendedExitBias:     null,
    initialExitBias:         null,

    // V2 backward-compat fields (empty/null so spread callers don't break)
    absoluteEntryHardBlocks: [],
    absoluteEntryGrade:      null,
    absoluteEntryTrustLabel: null,
    absoluteEntryReasons:    pos.map(c => c.code),
    absoluteEntryBoosts:     [],
    absoluteEntryPenaltyReasons: neg.map(c => c.code),
    sniperLabel:         null,
    sniperTier:          null,
    sniperTrustScore:    null,
    sniperReasons:       [],
    sniperWarnings:      [],
    sniperRejectedReasons: [],
    loserSniperLabel:    null,
    gainerSniperLabel:   null,
    tenPctCandidateLabel: null,
    isSniperCandidate:      false,
    isSuperSniperCandidate: false,
    isUniversalShortGatePass: f.shortGateWouldPass === true,
    isHighQualityEntry:       absoluteEntryIsHighQualityResearch,

    // Legacy comparison (populated after V3 has been running alongside V2)
    legacyAbsoluteEntryScoreV2:      null,
    legacyAbsoluteEntryTierV2:       null,
    legacyAbsoluteEntryHardBlocksV2: null,
  };
}

// ── Flatten for spread onto sample object ────────────────────────────────────

export function flattenAbsoluteEntryScoreV3(result) {
  return {
    absoluteEntryScoreResult: result,

    absoluteEntryScoreVersion:        result.absoluteEntryScoreVersion,
    absoluteEntryIsLogOnly:           result.absoluteEntryIsLogOnly,
    absoluteEntryCanAffectExecution:  result.absoluteEntryCanAffectExecution,
    absoluteEntryAction:              result.absoluteEntryAction,
    absoluteEntryScoreSource:         result.absoluteEntryScoreSource,
    absoluteEntryComputedAt:          result.absoluteEntryComputedAt,
    absoluteEntryCalibrationStatus:   result.absoluteEntryCalibrationStatus,
    absoluteEntryScoreIsCalibrated:   result.absoluteEntryScoreIsCalibrated,

    absoluteEntryScore:               result.absoluteEntryScore,
    absoluteEntryQualityScoreUncapped: result.absoluteEntryQualityScoreUncapped,
    absoluteEntryRawUtility:          result.absoluteEntryRawUtility,
    absoluteEntryTier:                result.absoluteEntryTier,
    absoluteEntryEligibility:         result.absoluteEntryEligibility,
    absoluteEntryConfidence:          result.absoluteEntryConfidence,
    absoluteEntryConfidenceLabel:     result.absoluteEntryConfidenceLabel,
    absoluteEntryFeatureCoveragePct:  result.absoluteEntryFeatureCoveragePct,
    absoluteEntryMissingFields:       result.absoluteEntryMissingFields,

    absoluteEntryDirectionScore:        result.absoluteEntryDirectionScore,
    absoluteEntryMovementMaturityScore: result.absoluteEntryMovementMaturityScore,
    absoluteEntryVolatilityScore:       result.absoluteEntryVolatilityScore,
    absoluteEntryLocationScore:         result.absoluteEntryLocationScore,
    absoluteEntryFlowMomentumScore:     result.absoluteEntryFlowMomentumScore,
    absoluteEntryExecutionScore:        result.absoluteEntryExecutionScore,
    absoluteEntryMarketContextScore:    result.absoluteEntryMarketContextScore,
    absoluteEntrySideSpecificScore:     result.absoluteEntrySideSpecificScore,
    absoluteEntryInteractionScore:      result.absoluteEntryInteractionScore,
    absoluteEntryRiskPenaltyScore:      result.absoluteEntryRiskPenaltyScore,

    absoluteEntryPositiveContributions: result.absoluteEntryPositiveContributions,
    absoluteEntryNegativeContributions: result.absoluteEntryNegativeContributions,
    absoluteEntryWarnings:              result.absoluteEntryWarnings,
    absoluteEntryResearchBlockReasons:  result.absoluteEntryResearchBlockReasons,
    absoluteEntryCautionReasons:        result.absoluteEntryCautionReasons,
    absoluteEntryResearchLabels:        result.absoluteEntryResearchLabels,
    absoluteEntryExperimentalSignals:   result.absoluteEntryExperimentalSignals,

    absoluteEntrySide:            result.absoluteEntrySide,
    absoluteEntryFeatureSnapshot: result.absoluteEntryFeatureSnapshot,

    absoluteEntryIsHighQualityResearch: result.absoluteEntryIsHighQualityResearch,
    absoluteEntryIsSniperResearch:      result.absoluteEntryIsSniperResearch,
    absoluteEntryIsEliteResearch:       result.absoluteEntryIsEliteResearch,

    absoluteEntryExpectedFeeNet:          result.absoluteEntryExpectedFeeNet,
    absoluteEntryEstimatedSlProbability:  result.absoluteEntryEstimatedSlProbability,
    absoluteEntryRunnerProbability:       result.absoluteEntryRunnerProbability,

    // Null execution recommendation fields
    recommendedMaxOpenMode:  null,
    recommendedLeverageMode: null,
    recommendedExitBias:     null,
    initialExitBias:         null,

    // V2 compat fields
    absoluteEntryHardBlocks:     result.absoluteEntryHardBlocks,
    absoluteEntryGrade:          result.absoluteEntryGrade,
    absoluteEntryTrustLabel:     result.absoluteEntryTrustLabel,
    absoluteEntryReasons:        result.absoluteEntryReasons,
    absoluteEntryBoosts:         result.absoluteEntryBoosts,
    absoluteEntryPenaltyReasons: result.absoluteEntryPenaltyReasons,
    sniperLabel:         result.sniperLabel,
    sniperTier:          result.sniperTier,
    sniperTrustScore:    result.sniperTrustScore,
    sniperReasons:       result.sniperReasons,
    sniperWarnings:      result.sniperWarnings,
    sniperRejectedReasons: result.sniperRejectedReasons,
    loserSniperLabel:    result.loserSniperLabel,
    gainerSniperLabel:   result.gainerSniperLabel,
    tenPctCandidateLabel: result.tenPctCandidateLabel,
    isSniperCandidate:      result.isSniperCandidate,
    isSuperSniperCandidate: result.isSuperSniperCandidate,
    isUniversalShortGatePass: result.isUniversalShortGatePass,
    isHighQualityEntry:       result.isHighQualityEntry,

    legacyAbsoluteEntryScoreV2:      result.legacyAbsoluteEntryScoreV2,
    legacyAbsoluteEntryTierV2:       result.legacyAbsoluteEntryTierV2,
    legacyAbsoluteEntryHardBlocksV2: result.legacyAbsoluteEntryHardBlocksV2,
  };
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr.map(x => (typeof x === "object" ? x.code ?? JSON.stringify(x) : String(x)).replace(/[,|]/g, " ")).join("|");
}

export const ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS = [
  "absoluteEntryScoreVersion",
  "absoluteEntryIsLogOnly",
  "absoluteEntryCanAffectExecution",
  "absoluteEntryScoreSource",
  "absoluteEntryComputedAt",
  "absoluteEntryCalibrationStatus",
  "absoluteEntryScore",
  "absoluteEntryQualityScoreUncapped",
  "absoluteEntryRawUtility",
  "absoluteEntryTier",
  "absoluteEntryEligibility",
  "absoluteEntryConfidence",
  "absoluteEntryConfidenceLabel",
  "absoluteEntryFeatureCoveragePct",
  "absoluteEntryMissingFields",
  "absoluteEntryDirectionScore",
  "absoluteEntryMovementMaturityScore",
  "absoluteEntryVolatilityScore",
  "absoluteEntryLocationScore",
  "absoluteEntryFlowMomentumScore",
  "absoluteEntryExecutionScore",
  "absoluteEntryMarketContextScore",
  "absoluteEntrySideSpecificScore",
  "absoluteEntryInteractionScore",
  "absoluteEntryRiskPenaltyScore",
  "absoluteEntryPositiveContributions",
  "absoluteEntryNegativeContributions",
  "absoluteEntryWarnings",
  "absoluteEntryResearchBlockReasons",
  "absoluteEntryCautionReasons",
  "absoluteEntrySide",
  "absoluteEntryAction",
  // Legacy comparison
  "legacyAbsoluteEntryScoreV2",
  "legacyAbsoluteEntryTierV2",
  "legacyAbsoluteEntryHardBlocksV2",
];

export function absoluteEntryScoreV3CSVRow(s) {
  if (s.absoluteEntryScore == null) {
    return ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS.map(() => "");
  }
  return [
    csvCell(s.absoluteEntryScoreVersion ?? ""),
    csvCell(s.absoluteEntryIsLogOnly ?? ""),
    csvCell(s.absoluteEntryCanAffectExecution ?? ""),
    csvCell(s.absoluteEntryScoreSource ?? ""),
    csvCell(s.absoluteEntryComputedAt ?? ""),
    csvCell(s.absoluteEntryCalibrationStatus ?? ""),
    csvCell(s.absoluteEntryScore),
    csvCell(s.absoluteEntryQualityScoreUncapped ?? ""),
    csvCell(s.absoluteEntryRawUtility ?? ""),
    csvCell(s.absoluteEntryTier ?? ""),
    csvCell(s.absoluteEntryEligibility ?? ""),
    csvCell(s.absoluteEntryConfidence ?? ""),
    csvCell(s.absoluteEntryConfidenceLabel ?? ""),
    csvCell(s.absoluteEntryFeatureCoveragePct ?? ""),
    csvCell(csvArr(s.absoluteEntryMissingFields)),
    csvCell(s.absoluteEntryDirectionScore ?? ""),
    csvCell(s.absoluteEntryMovementMaturityScore ?? ""),
    csvCell(s.absoluteEntryVolatilityScore ?? ""),
    csvCell(s.absoluteEntryLocationScore ?? ""),
    csvCell(s.absoluteEntryFlowMomentumScore ?? ""),
    csvCell(s.absoluteEntryExecutionScore ?? ""),
    csvCell(s.absoluteEntryMarketContextScore ?? ""),
    csvCell(s.absoluteEntrySideSpecificScore ?? ""),
    csvCell(s.absoluteEntryInteractionScore ?? ""),
    csvCell(s.absoluteEntryRiskPenaltyScore ?? ""),
    csvCell(csvArr(s.absoluteEntryPositiveContributions)),
    csvCell(csvArr(s.absoluteEntryNegativeContributions)),
    csvCell(csvArr(s.absoluteEntryWarnings)),
    csvCell(csvArr(s.absoluteEntryResearchBlockReasons)),
    csvCell(csvArr(s.absoluteEntryCautionReasons)),
    csvCell(s.absoluteEntrySide ?? ""),
    csvCell(s.absoluteEntryAction ?? ""),
    csvCell(s.legacyAbsoluteEntryScoreV2 ?? ""),
    csvCell(s.legacyAbsoluteEntryTierV2 ?? ""),
    csvCell(csvArr(s.legacyAbsoluteEntryHardBlocksV2)),
  ];
}
