// ─── LONG AES V1 SCORER ───────────────────────────────────────────────────────
// Direction-correct LONG entry quality instrument. All signal polarities are
// INVERTED vs absoluteEntryScore.scorer.js (the short AES).
// LOG ONLY — must never affect execution paths.

import {
  DEFAULT_LONG_AES_CONFIG,
  LONG_AES_VERSION,
  LONG_FAMILY_BOUNDS,
  LONG_DIRECTION_WEIGHTS,
  LONG_MOVEMENT_MATURITY_WEIGHTS,
  LONG_VOLATILITY_WEIGHTS,
  LONG_LOCATION_WEIGHTS,
  LONG_FLOW_MOMENTUM_WEIGHTS,
  LONG_EXECUTION_WEIGHTS,
  LONG_MARKET_CONTEXT_WEIGHTS,
  LONG_GAINER_WEIGHTS,
  LONG_LOSER_WEIGHTS,
  LONG_INTERACTION_WEIGHTS,
  LONG_RISK_PENALTY_WEIGHTS,
  mergeLongAesConfig,
} from "./longAbsoluteEntryScore.config.js";
import { normalizeLongAesFeatures } from "./longAbsoluteEntryScore.features.js";
import {
  classifyLongAesTier,
  classifyLongAesEligibility,
  classifyLongAesConfidenceLabel,
  computeLongAesConfidenceScore,
} from "./longAbsoluteEntryScore.labels.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function assertLogOnly(cfg) {
  if (cfg.logOnly !== true) throw new Error("LONG AES V1: logOnly must be true");
  if (cfg.allowExecutionImpact === true) throw new Error("LONG AES V1: allowExecutionImpact must be false");
}

function addContribution(list, code, family, points, value = null) {
  if (points === 0) return;
  list.push({ code, family, points, ...(value !== null ? { value } : {}) });
}

// ── 1. Direction score [-18, +16] — GREEN is signal for longs ────────────────
function scoreDirection(f, w, pos, neg) {
  let score = 0;

  const immediateGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;
  if (immediateGreen) {
    addContribution(pos, "IMMEDIATE_GREEN_OR_DETECTED", "DIRECTION", w.immediateGreenOrDetected);
    score += w.immediateGreenOrDetected;
  } else if (f.hasGreenConfirmation === true) {
    addContribution(pos, "GREEN_CONFIRMATION", "DIRECTION", w.hasGreenConfirmation);
    score += w.hasGreenConfirmation;
  } else if (f.candleColorAtEntry === "GREEN") {
    addContribution(pos, "GREEN_CANDLE", "DIRECTION", w.greenCandle);
    score += w.greenCandle;
  }

  const confirmedNoRed = f.immediateRedImpulse === false && f.redImpulseDetected === false;
  if (confirmedNoRed) {
    addContribution(pos, "NO_ACTIVE_RED_IMPULSE", "DIRECTION", w.noActiveRedImpulse);
    score += w.noActiveRedImpulse;
  }

  const activeRed = f.immediateRedImpulse === true || f.redImpulseDetected === true;
  if (f.candleColorAtEntry === "RED" && !activeRed) {
    addContribution(neg, "RED_CANDLE_NO_ACTIVE_IMPULSE", "DIRECTION", w.redCandleNoActiveGreen);
    score += w.redCandleNoActiveGreen;
  }

  return clamp(score, LONG_FAMILY_BOUNDS.direction.min, LONG_FAMILY_BOUNDS.direction.max);
}

// ── 2. Movement maturity score [-8, +18] — UP ticks matter for longs ─────────
function scoreMovementMaturity(f, w, pos, neg, warnings) {
  let score = 0;
  const activeRed = f.immediateRedImpulse === true || f.redImpulseDetected === true;
  const hasGreenResumption = (f.hasGreenConfirmation === true || f.immediateGreenImpulse === true || f.greenImpulseDetected === true) && !activeRed;

  if (f.microPullbackPct !== null) {
    const pct = f.microPullbackPct;
    if (hasGreenResumption) {
      const tiers = w.pullbackTiers;
      let pullbackPoints = 0;
      for (const tier of tiers) {
        if (pct < tier.max) { pullbackPoints = tier.points; break; }
      }
      if (pct > w.highPullbackThreshold) warnings.push("HIGH_MICRO_PULLBACK_VARIANCE");
      if (pullbackPoints > 0) {
        addContribution(pos, `MICRO_PULLBACK_${Math.round(pct * 100)}`, "MOVEMENT_MATURITY", pullbackPoints, pct);
        score += pullbackPoints;
      } else if (pullbackPoints < 0) {
        addContribution(neg, `MICRO_PULLBACK_LOW_${Math.round(pct * 100)}`, "MOVEMENT_MATURITY", pullbackPoints, pct);
        score += pullbackPoints;
      }
    } else if (f.microPullbackPct > 0.5) {
      warnings.push("PULLBACK_NOT_YET_RECLAIMED");
    }
  }

  const last3Up = f.last3TicksDirection === "UP";
  if (last3Up) {
    const greenAndNoRed = (f.hasGreenConfirmation === true || f.immediateGreenImpulse === true) && !activeRed;
    if (greenAndNoRed) {
      addContribution(pos, "LAST3_UP_GREEN_NO_RED", "MOVEMENT_MATURITY", w.last3UpWithGreenNoRed);
      score += w.last3UpWithGreenNoRed;
    } else {
      addContribution(pos, "LAST3_UP", "MOVEMENT_MATURITY", w.last3UpOther);
      score += w.last3UpOther;
    }
  }

  if (f.microMomentumLabel === "MICRO_GREEN_MULTI_CONFIRM") {        // B-01: was "MICRO_MULTI_CONFIRM"
    addContribution(pos, "MICRO_GREEN_MULTI_CONFIRM", "MOVEMENT_MATURITY", w.microMultiConfirm);
    score += w.microMultiConfirm;
  } else if (f.microMomentumLabel === "MICRO_GREEN_IMPULSE") {
    addContribution(pos, "MICRO_GREEN_IMPULSE", "MOVEMENT_MATURITY", w.microGreenImpulse);
    score += w.microGreenImpulse;
  } else if (f.microMomentumLabel === "MICRO_TICKS_UP") {            // B-03
    addContribution(pos, "MICRO_TICKS_UP_ONLY", "MOVEMENT_MATURITY", w.microTicksUpOnly);
    score += w.microTicksUpOnly;
  } else if (f.microMomentumLabel === "MICRO_RSI_ROLLOVER_UP") {     // B-03
    addContribution(pos, "MICRO_RSI_ROLLOVER_UP", "MOVEMENT_MATURITY", w.microRsiRolloverUp);
    score += w.microRsiRolloverUp;
  }

  if (f.microMomentumLabel === "MICRO_RED_PRESSURE" && f.side === "LOSER") {  // B-02: was "MICRO_TICKS_DOWN"
    const hasConfirmation = f.hasGreenConfirmation === true || f.hasRsiRolloverUp === true;
    if (!hasConfirmation) {
      addContribution(neg, "LOSER_MICRO_RED_PRESSURE_UNCONFIRMED", "MOVEMENT_MATURITY", w.loserMicroRedPressurePenalty);
      score += w.loserMicroRedPressurePenalty;
    }
  }

  return clamp(score, LONG_FAMILY_BOUNDS.movementMaturity.min, LONG_FAMILY_BOUNDS.movementMaturity.max);
}

// ── 3. Volatility score [-6, +8] — direction-neutral ─────────────────────────
function scoreVolatility(f, w, pos, neg, warnings, missingFields) {
  if (f.atrPct === null) { missingFields.push("atrPct"); return 0; }
  const atr = f.atrPct;
  let points = 0;
  for (const band of w.bands) {
    if (atr < band.max) { points = band.points; break; }
  }
  if (atr > w.highAtrThreshold) warnings.push("HIGH_ATR_VARIANCE");
  if (points > 0) addContribution(pos, `ATR_BAND_${Math.round(atr * 100)}`, "VOLATILITY", points, atr);
  else if (points < 0) addContribution(neg, `ATR_BAND_LOW_${Math.round(atr * 100)}`, "VOLATILITY", points, atr);
  return clamp(points, LONG_FAMILY_BOUNDS.volatility.min, LONG_FAMILY_BOUNDS.volatility.max);
}

// ── 4. Location/VWAP score [-10, +10] — ABOVE VWAP + green is positive ───────
function scoreLocation(f, w, pos, neg) {
  let score = 0;
  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;
  const hasRed = f.immediateRedImpulse === true || f.redImpulseDetected === true;

  if (f.priceVsVwapLabel === "ABOVE_VWAP" || f.priceVsVwapLabel === "AT_VWAP") {
    if (activeGreen) {
      addContribution(pos, "ABOVE_VWAP_GREEN_CONFIRMATION", "LOCATION", w.aboveVwapGreenConfirmation);
      score += w.aboveVwapGreenConfirmation;
      if (f.last3TicksDirection === "UP") {
        addContribution(pos, "ABOVE_VWAP_GREEN_LAST3_UP", "LOCATION", w.aboveVwapGreenLast3Up);
        score += w.aboveVwapGreenLast3Up;
      }
      if (f.priceVsVwapPct !== null) {
        const magnitude = Math.min(Math.abs(f.priceVsVwapPct), w.magnitudeCapPct) / w.magnitudeCapPct * w.magnitudeMaxBonus;
        if (magnitude > 0) {
          addContribution(pos, "ABOVE_VWAP_MAGNITUDE", "LOCATION", Math.round(magnitude), f.priceVsVwapPct);
          score += Math.round(magnitude);
        }
      }
    }
  } else if (f.priceVsVwapLabel === "BELOW_VWAP") {
    const hasGainerBlowoff = f.hasGainerBlowoffDanger === true || f.hasGainerFailedBreakout === true;
    if (hasGainerBlowoff && f.side === "GAINER") {
      addContribution(pos, "BELOW_VWAP_GAINER_FAILED_BREAKOUT_RED", "LOCATION", w.belowVwapLoserRedRejectionNoReclaim);
      score += w.belowVwapLoserRedRejectionNoReclaim;
    } else if (activeGreen) {
      // Green below VWAP is a caution signal for longs (not confirmed above VWAP)
      addContribution(neg, "BELOW_VWAP_GREEN_NOT_ABOVE", "LOCATION", w.belowVwapGreenDangerForLong);
      score += w.belowVwapGreenDangerForLong;
    }
  }

  if (f.vwapContextLabel === "VWAP_RECLAIM" && activeGreen) {
    addContribution(pos, "VWAP_RECLAIM_WITH_GREEN", "LOCATION", w.vwapReclaimWithGreen);
    score += w.vwapReclaimWithGreen;
  }

  return clamp(score, LONG_FAMILY_BOUNDS.location.min, LONG_FAMILY_BOUNDS.location.max);
}

// ── 5. Flow + momentum score [-12, +10] — CVD BULL is positive ───────────────
function scoreFlowMomentum(f, w, pos, neg) {
  let score = 0;
  const activeRed = f.immediateRedImpulse === true || f.redImpulseDetected === true;
  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;

  if (f.cvdLabel === "BULL") {
    addContribution(pos, "CVD_BULL", "FLOW_MOMENTUM", w.cvdBull);
    score += w.cvdBull;
  } else if (f.cvdLabel === "NEUT") {
    addContribution(pos, "CVD_NEUT", "FLOW_MOMENTUM", w.cvdNeut);
    score += w.cvdNeut;
  } else if (f.cvdLabel === "BEAR") {
    if (f.side === "LOSER" && !activeGreen) {
      addContribution(neg, "CVD_BEAR_LOSER_NO_GREEN", "FLOW_MOMENTUM", w.cvdBearLoserNoGreen);
      score += w.cvdBearLoserNoGreen;
    } else if (f.side === "GAINER" && !activeGreen) {  // B-04
      addContribution(neg, "CVD_BEAR_GAINER_NO_GREEN", "FLOW_MOMENTUM", w.cvdBearGainerNoGreen);
      score += w.cvdBearGainerNoGreen;
    }
  }

  const macd = f.macdHistogramState1m ?? "";
  if (macd.includes("POSITIVE_EXPANDING") || macd.includes("BULLISH_EXPANDING")) {
    addContribution(pos, "MACD_POSITIVE_EXPANDING", "FLOW_MOMENTUM", w.macdPositiveExpanding);
    score += w.macdPositiveExpanding;
  } else if ((macd.includes("BULLISH") || macd.includes("SHRINKING")) && f.side === "GAINER") {
    addContribution(pos, "MACD_BULLISH_GAINER_CONTINUATION", "FLOW_MOMENTUM", w.macdBullishGainerContinuation);
    score += w.macdBullishGainerContinuation;
  } else if (macd.includes("NEGATIVE_EXPANDING") || macd.includes("BEARISH_EXPANDING")) {
    addContribution(neg, "MACD_BEARISH_EXPANSION", "FLOW_MOMENTUM", w.macdBearishExpansion);
    score += w.macdBearishExpansion;
  }

  if (f.hasRsiRolloverUp === true && !activeRed) {
    addContribution(pos, "RSI_ROLLOVER_UP_NO_RED", "FLOW_MOMENTUM", w.rsiRolloverUp);
    score += w.rsiRolloverUp;
  }

  return clamp(score, LONG_FAMILY_BOUNDS.flowMomentum.min, LONG_FAMILY_BOUNDS.flowMomentum.max);
}

// ── 6. Execution score [-8, +6] — direction-neutral ──────────────────────────
function scoreExecution(f, w, pos, neg, warnings) {
  let score = 0;
  if (f.spreadPct !== null) {
    const spread = f.spreadPct;
    let spreadPoints = 0;
    for (const tier of w.spreadTiers) {
      if (spread <= tier.max) { spreadPoints = tier.points; break; }
    }
    if (spread > w.wideSpreadsThreshold) warnings.push("WIDE_SPREAD");
    if (spreadPoints > 0) addContribution(pos, `TIGHT_SPREAD_${Math.round(spread * 1000)}`, "EXECUTION", spreadPoints, spread);
    else if (spreadPoints < 0) addContribution(neg, `WIDE_SPREAD_${Math.round(spread * 1000)}`, "EXECUTION", spreadPoints, spread);
    score += spreadPoints;
  }
  const rank = f.entryRankInBucket;
  if (rank !== null) {
    let rankPoints = 0;
    for (const tier of w.rankTiers) {
      if (rank <= tier.max) { rankPoints = tier.points; break; }
    }
    if (rankPoints > 0) addContribution(pos, `RANK_${rank}`, "EXECUTION", rankPoints, rank);
    else if (rankPoints < 0) addContribution(neg, `RANK_LOW_${rank}`, "EXECUTION", rankPoints, rank);
    score += rankPoints;
  }
  return clamp(score, LONG_FAMILY_BOUNDS.execution.min, LONG_FAMILY_BOUNDS.execution.max);
}

// ── 7. Market context score [-8, +8] — BTC UP is positive for longs ──────────
function scoreMarketContext(f, w, pos, neg, regimeSpecificUsed) {
  let score = 0;
  const btcDir = f.btcRunDirection;

  if (btcDir === "UP") {
    addContribution(pos, "BTC_UP", "MARKET_CONTEXT", w.btcUp);
    score += w.btcUp;
  } else if (btcDir === "FLAT" || btcDir === "MIXED") {
    addContribution(pos, "BTC_FLAT_MIXED", "MARKET_CONTEXT", w.btcFlatMixed);
    score += w.btcFlatMixed;
  } else if (btcDir === "DOWN") {
    addContribution(neg, "BTC_DOWN", "MARKET_CONTEXT", w.btcDown);
    score += w.btcDown;
  }

  const ctx = f.btcLongContextLabel ?? "";
  if (ctx === "LONG_FRIENDLY_CANDIDATE" || ctx.includes("LONG_TAILWIND")) {
    addContribution(pos, "LONG_FRIENDLY_CANDIDATE", "MARKET_CONTEXT", w.longFriendlyCandidate);
    score += w.longFriendlyCandidate;
  } else if (ctx.includes("UNFRIENDLY") || ctx.includes("BEARISH") || ctx.includes("HEADWIND")) {
    addContribution(neg, "UNFRIENDLY_BEARISH_SESSION", "MARKET_CONTEXT", w.unfriendlyBearishSession);
    score += w.unfriendlyBearishSession;
  }

  // Gainer regime interaction: BTC 30m FLAT + BTC 2h UP
  if (f.side === "GAINER" && f.btc30mDirection === "FLAT" && f.btc2hDirection === "UP") {
    addContribution(pos, "REGIME_BTC30_FLAT_BTC2H_UP", "MARKET_CONTEXT", w.gainerRegimeInteraction);
    score += w.gainerRegimeInteraction;
    regimeSpecificUsed.value = true;
  }

  return clamp(score, LONG_FAMILY_BOUNDS.marketContext.min, LONG_FAMILY_BOUNDS.marketContext.max);
}

// ── 8. Side-specific score [-18, +20] ─────────────────────────────────────────

function scoreGainerLongSide(f, gw, pos, neg) {
  let score = 0;
  const cq = f.topGainerContinuationQualityScore ?? 0;

  if (cq >= 80) {
    addContribution(pos, "CONTINUATION_SCORE_80", "SIDE_SPECIFIC_GAINER", gw.continuationScore80);
    score += gw.continuationScore80;
  }
  if (cq >= 120) {
    addContribution(pos, "CONTINUATION_QUALITY_120", "SIDE_SPECIFIC_GAINER", gw.continuationQuality120);
    score += gw.continuationQuality120;
  }
  if (cq >= 140) {  // B-07: extreme extension risk damper
    addContribution(neg, "GAINER_OVER_EXTENSION", "SIDE_SPECIFIC_GAINER", gw.overExtensionPenalty);
    score += gw.overExtensionPenalty;
  }
  if (f.hasGainerContinuationConfirmation === true) {
    addContribution(pos, "CONTINUATION_CONFIRMATION", "SIDE_SPECIFIC_GAINER", gw.continuationConfirmation);
    score += gw.continuationConfirmation;
  }
  if (f.hasGainerGreenConfirmation === true) {
    addContribution(pos, "GAINER_GREEN_CONFIRMATION", "SIDE_SPECIFIC_GAINER", gw.gainerGreenConfirmation);
    score += gw.gainerGreenConfirmation;
  }
  if (f.hasGainerHigherLow === true) {
    addContribution(pos, "GAINER_HIGHER_LOW", "SIDE_SPECIFIC_GAINER", gw.higherLow);
    score += gw.higherLow;
  }
  const lane = f.topGainerThesisLaneLabel ?? "";
  if (lane === "TOP_GAINER_HIGHER_LOW_LONG" || lane === "TOP_GAINER_BREAKOUT_RETEST_LONG") {
    addContribution(pos, "CLASSIC_CONTINUATION_LANE", "SIDE_SPECIFIC_GAINER", gw.classicContinuationLane);
    score += gw.classicContinuationLane;
  }
  if (f.topGainerVwapContextLabel === "GAINER_ABOVE_VWAP_SUPPORT_LONG") {
    addContribution(pos, "GAINER_ABOVE_VWAP_SUPPORT", "SIDE_SPECIFIC_GAINER", gw.aboveVwapBullish);
    score += gw.aboveVwapBullish;
  }

  // Penalties
  if (f.hasGainerBlowoffDanger === true) {
    addContribution(neg, "BROAD_BLOWOFF_DANGER", "SIDE_SPECIFIC_GAINER", gw.broadBlowoffDangerPenalty);
    score += gw.broadBlowoffDangerPenalty;
  }
  if (lane === "TOP_GAINER_BLOWOFF_DANGER") {
    addContribution(neg, "EXACT_BLOWOFF_DANGER_LANE", "SIDE_SPECIFIC_GAINER", gw.exactBlowoffDangerLane);
    score += gw.exactBlowoffDangerLane;
  }
  if (f.topGainerPumpPhaseLabel === "GAINER_BLOWOFF_EXTREME") {
    addContribution(neg, "BLOWOFF_EXTREME", "SIDE_SPECIFIC_GAINER", gw.pumpBlowoffExtreme);
    score += gw.pumpBlowoffExtreme;
  }
  if (lane === "TOP_GAINER_RANK_MID_BLOWOFF_DANGER") {
    addContribution(neg, "RANK_MID_BLOWOFF_LANE", "SIDE_SPECIFIC_GAINER", gw.rankMidBlowoffLane);
    score += gw.rankMidBlowoffLane;
  }
  if (f.topGainerVwapContextLabel === "GAINER_VWAP_LOSS_STILL_BEARISH") {
    addContribution(neg, "VWAP_LOSS_AFTER_PUMP", "SIDE_SPECIFIC_GAINER", gw.vwapLossAfterPump);
    score += gw.vwapLossAfterPump;
  }
  if (
    f.hasGainerContinuationConfirmation !== true &&
    f.topGainerWouldPassContinuationAudit !== true &&
    cq < 80
  ) {
    addContribution(neg, "NO_CONTINUATION_CONFIRMATION", "SIDE_SPECIFIC_GAINER", gw.noContinuationConfirmation);
    score += gw.noContinuationConfirmation;
  }

  return clamp(score, LONG_FAMILY_BOUNDS.sideSpecific.min, LONG_FAMILY_BOUNDS.sideSpecific.max);
}

function scoreLoserLongSide(f, lw, pos, neg) {
  let score = 0;
  const hasGreen = f.hasGreenConfirmation === true || f.immediateGreenImpulse === true || f.greenImpulseDetected === true;

  if (f.longGateWouldPass === true) {
    addContribution(pos, "LONG_GATE_PASS", "SIDE_SPECIFIC_LOSER", lw.longGateWouldPass);
    score += lw.longGateWouldPass;
  }
  if ((f.priceVsVwapLabel === "ABOVE_VWAP" || f.priceVsVwapLabel === "AT_VWAP") && hasGreen) {
    addContribution(pos, "LOSER_ABOVE_VWAP_GREEN", "SIDE_SPECIFIC_LOSER", lw.aboveVwapGreenConfirmation);
    score += lw.aboveVwapGreenConfirmation;
  }
  if (f.last3TicksDirection === "UP") {
    addContribution(pos, "LOSER_LAST3_UP", "SIDE_SPECIFIC_LOSER", lw.last3UpLoserBase);
    score += lw.last3UpLoserBase;
  }
  const lane = f.topLoserThesisLaneLabel ?? f.longThesisLaneLabel ?? "";
  if (lane === "TOP_LOSER_REVERSAL_CANDIDATE" || lane.includes("REVERSAL_CANDIDATE")) {
    addContribution(pos, "TOP_LOSER_REVERSAL_CANDIDATE", "SIDE_SPECIFIC_LOSER", lw.topLoserReversalCandidate);
    score += lw.topLoserReversalCandidate;
  }

  // Penalties
  if (f.isFallingKnife === true) {
    addContribution(neg, "FALLING_KNIFE", "SIDE_SPECIFIC_LOSER", lw.fallingKnifeDanger);
    score += lw.fallingKnifeDanger;
  }
  if (f.isCvdBearChaseRisk === true) {
    addContribution(neg, "CVD_BEAR_CHASE", "SIDE_SPECIFIC_LOSER", lw.cvdBearChase);
    score += lw.cvdBearChase;
  }
  if (f.isBtcBounceFadeRisk === true) {
    addContribution(neg, "BTC_BOUNCE_FADE_RISK", "SIDE_SPECIFIC_LOSER", lw.btcBounceFadeRisk);
    score += lw.btcBounceFadeRisk;
  }
  if (!hasGreen) {
    addContribution(neg, "NO_GREEN_CONFIRMATION", "SIDE_SPECIFIC_LOSER", lw.noGreenConfirmation);
    score += lw.noGreenConfirmation;
  }

  return clamp(score, LONG_FAMILY_BOUNDS.sideSpecific.min, LONG_FAMILY_BOUNDS.sideSpecific.max);
}

function scoreSideSpecific(f, pos, neg) {
  if (f.side === "GAINER") return scoreGainerLongSide(f, LONG_GAINER_WEIGHTS, pos, neg);
  if (f.side === "LOSER")  return scoreLoserLongSide(f, LONG_LOSER_WEIGHTS, pos, neg);
  return 0;
}

// ── 9. Interaction score [0, +12] ─────────────────────────────────────────────
function scoreInteraction(f, w, pos, experimentalComboUsed) {
  let score = 0;
  const activeGreen = f.immediateGreenImpulse === true || f.greenImpulseDetected === true;
  const activeRed = f.immediateRedImpulse === true || f.redImpulseDetected === true;
  const cvdOk = f.cvdLabel === "BULL" || f.cvdLabel === "NEUT";
  const atr = f.atrPct ?? 0;
  const noRed = !activeRed;

  // Universal core: green + no red + ATR >= 0.2 + CVD BULL/NEUT
  if (activeGreen && noRed && atr >= 0.2 && cvdOk) {
    addContribution(pos, "UNIVERSAL_LONG_CORE_INTERACTION", "INTERACTION", w.universalCore);
    score += w.universalCore;
    if (atr >= 0.6) {
      addContribution(pos, "UNIVERSAL_LONG_CORE_HIGH_ATR", "INTERACTION", w.universalCoreHighAtr);
      score += w.universalCoreHighAtr;
    }
  }

  // Gainer sniper: continuation quality >= 120 + last3 UP + ATR >= 0.6
  if (f.side === "GAINER" && (f.topGainerContinuationQualityScore ?? 0) >= 120 && f.last3TicksDirection === "UP" && atr >= 0.6) {
    addContribution(pos, "GAINER_LONG_SNIPER_INTERACTION", "INTERACTION", w.gainerSniper);
    score += w.gainerSniper;
  }

  // Failed breakdown + green + no red + CVD BULL/NEUT
  const failedBreakdown = f.failedBreakdown1m === true || f.failedBreakdown3m === true || f.failedBreakdown === true;
  if (failedBreakdown && activeGreen && noRed && cvdOk) {
    addContribution(pos, "FAILED_BREAKDOWN_GREEN_INTERACTION", "INTERACTION", w.failedBreakdownGreen);
    score += w.failedBreakdownGreen;
    experimentalComboUsed.value = true;
  }

  // Loser sniper: green impulse + no red + CVD BULL/NEUT + ATR >= 0.6 + spread <= 0.05
  if (
    f.side === "LOSER" &&
    (f.immediateGreenImpulse === true || f.greenImpulseDetected === true) &&
    noRed && cvdOk && atr >= 0.6 &&
    (f.spreadPct ?? 1) <= 0.05
  ) {
    addContribution(pos, "LOSER_LONG_SNIPER_INTERACTION", "INTERACTION", w.loserSniper);
    score += w.loserSniper;
  }

  // Mature pullback resumption: pullback > 0.8% + green + last3 UP + no red
  if (
    (f.microPullbackPct ?? 0) > 0.8 &&
    activeGreen && f.last3TicksDirection === "UP" && noRed
  ) {
    addContribution(pos, "PULLBACK_MATURE_RESUMPTION", "INTERACTION", w.pullbackMature);
    score += w.pullbackMature;
  }

  return clamp(score, LONG_FAMILY_BOUNDS.interaction.min, w.familyCap);
}

// ── Risk penalty score [0, 50] — RED signals now carry the penalty ────────────
function computeRiskPenalty(f, rw, researchBlockReasons, cautionReasons) {
  let penalty = 0;
  const activeRed = f.immediateRedImpulse === true || f.redImpulseDetected === true;

  if (f.immediateRedImpulse === true) {
    penalty += rw.immediateRedImpulse;
  }
  if (f.redImpulseDetected === true) {
    penalty += rw.redImpulseDetected;
  }
  if (f.candleColorAtEntry === "RED" && !activeRed) {
    penalty += rw.redCandleWithoutActive;
  }

  // CVD BEAR only penalizes when combined with active red (larger risk for longs)
  if (f.cvdLabel === "BEAR" && activeRed) {
    penalty += rw.cvdBearActiveRed;
    researchBlockReasons.push("ACTIVE_RED_AND_CVD_BEAR");
  }

  if ((f.spreadPct ?? 0) > 0.08) {
    penalty += rw.spreadGt008;
    cautionReasons.push("WIDE_SPREAD_EXECUTION_RISK");
  }

  if (f.priceVsVwapLabel === "BELOW_VWAP" && !f.immediateGreenImpulse && !f.greenImpulseDetected) {
    penalty += rw.belowVwapNoGreen;
    cautionReasons.push("BELOW_VWAP_NO_GREEN_CAUTION");
  }

  if (f.entryTimingGrade === "F") {
    penalty += rw.entryTimingGradeF;
    researchBlockReasons.push("ENTRY_TIMING_GRADE_F");
  }

  if (f.side === "LOSER") {
    if (f.isFallingKnife === true) {
      penalty += rw.loserFallingKnifeExtreme;
    }
  }

  if (f.side === "GAINER") {
    if (f.topGainerPumpPhaseLabel === "GAINER_BLOWOFF_EXTREME") {
      penalty += rw.gainerBlowoffExtreme;
      researchBlockReasons.push("GAINER_BLOWOFF_EXTREME");
    }
  }

  // Above VWAP + active red = dangerous for long
  if ((f.priceVsVwapLabel === "ABOVE_VWAP" || f.priceVsVwapLabel === "AT_VWAP") && activeRed) {
    penalty += rw.aboveVwapRedDanger;
    researchBlockReasons.push("ABOVE_VWAP_WITH_RED_DANGER");
  }

  // LONG audit hard danger — carries max risk penalty
  if (f.longAuditWouldHardBlock === true) {
    penalty += rw.shortPressureDangerHard;
    researchBlockReasons.push("LONG_AUDIT_HARD_DANGER");
  }

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

export function computeLongAbsoluteEntryScoreV1(s, configOverrides = {}, componentOptions = {}) {
  let cfg;
  try {
    cfg = mergeLongAesConfig(configOverrides);
    assertLogOnly(cfg);
  } catch (err) {
    throw err;
  }

  try {
    return _computeLongV1Inner(s, cfg, componentOptions);
  } catch (err) {
    return _longAesFallback(err);
  }
}

function _longAesFallback(err) {
  return {
    longAesVersion: LONG_AES_VERSION,
    longAesIsLogOnly: true,
    longAesCanAffectExecution: false,
    longAesAction: "LOG_ONLY_OBSERVE",
    longAesScoreSource: "LIVE_PREVIEW_FALLBACK",
    longAesComputedAt: Date.now(),
    longAesCalibrationStatus: "UNCALIBRATED_RULE_MODEL",
    longAesScoreIsCalibrated: false,
    longAesScore: 50,
    longAesQualityScoreUncapped: 50,
    longAesRawUtility: 0,
    longAesTier: "LONG_AES_WATCH",
    longAesEligibility: "CAUTION",
    longAesConfidence: 0,
    longAesConfidenceLabel: "LOW_CONFIDENCE",
    longAesConfidenceIsInformative: false,
    longAesConfidenceDistinctValueCountAtRun: null,
    longAesConfidenceCalibrationStatus: "UNCALIBRATED",
    longAesFeatureCoveragePct: 0,
    longAesMissingFields: ["PREVIEW_SCORER_UNAVAILABLE"],
    longAesDirectionScore: 0,
    longAesMovementMaturityScore: 0,
    longAesVolatilityScore: 0,
    longAesLocationScore: 0,
    longAesFlowMomentumScore: 0,
    longAesExecutionScore: 0,
    longAesMarketContextScore: 0,
    longAesSideSpecificScore: 0,
    longAesInteractionScore: 0,
    longAesRiskPenaltyScore: 0,
    longAesPositiveContributions: [],
    longAesNegativeContributions: [],
    longAesWarnings: ["LONG_AES_PREVIEW_ERROR", err?.message ?? "UNKNOWN_ERROR"],
    longAesResearchBlockReasons: [],
    longAesCautionReasons: [],
    longAesSide: "UNKNOWN",
    longAesFeatureSnapshot: null,
    isLongAesHighQualityResearch: false,
    isLongAesSniperResearch: false,
    isLongAesEliteResearch: false,
  };
}

function _computeLongV1Inner(s, cfg, componentOptions = {}) {
  const { includeRankInBucket = true } = componentOptions;
  const { features, missingFields: featureMissingFields, featureCoveragePct, side } = normalizeLongAesFeatures(s);
  const f = includeRankInBucket ? features : { ...features, entryRankInBucket: null };

  const pos = [];
  const neg = [];
  const warnings = [];
  const researchBlockReasons = [];
  const cautionReasons = [];
  const extraMissingFields = [];
  const regimeSpecificUsed = { value: false };
  const experimentalComboUsed = { value: false };

  const directionScore        = scoreDirection(f, LONG_DIRECTION_WEIGHTS, pos, neg);
  const movementMaturityScore = scoreMovementMaturity(f, LONG_MOVEMENT_MATURITY_WEIGHTS, pos, neg, warnings);
  const volatilityScore       = scoreVolatility(f, LONG_VOLATILITY_WEIGHTS, pos, neg, warnings, extraMissingFields);
  const locationScore         = scoreLocation(f, LONG_LOCATION_WEIGHTS, pos, neg);
  const flowMomentumScore     = scoreFlowMomentum(f, LONG_FLOW_MOMENTUM_WEIGHTS, pos, neg);
  const executionScore        = scoreExecution(f, LONG_EXECUTION_WEIGHTS, pos, neg, warnings);
  const marketContextScore    = scoreMarketContext(f, LONG_MARKET_CONTEXT_WEIGHTS, pos, neg, regimeSpecificUsed);
  const sideSpecificScore     = scoreSideSpecific(f, pos, neg);
  const interactionScore      = scoreInteraction(f, LONG_INTERACTION_WEIGHTS, pos, experimentalComboUsed);
  const riskPenaltyScore      = computeRiskPenalty(f, LONG_RISK_PENALTY_WEIGHTS, researchBlockReasons, cautionReasons);

  const rawUtility =
    directionScore + movementMaturityScore + volatilityScore +
    locationScore + flowMomentumScore + executionScore +
    marketContextScore + sideSpecificScore + interactionScore -
    riskPenaltyScore;

  const qualityScoreUncapped = clamp(Math.round(50 + rawUtility), 0, 100);
  const researchBlock = researchBlockReasons.length > 0;
  const longAesScore = researchBlock ? Math.min(qualityScoreUncapped, 24) : qualityScoreUncapped;
  const longAesTier  = classifyLongAesTier(longAesScore);

  const allMissingFields = [...featureMissingFields, ...extraMissingFields];
  const longAesEligibility = classifyLongAesEligibility(riskPenaltyScore, researchBlockReasons, cautionReasons, allMissingFields);
  const longAesConfidence  = computeLongAesConfidenceScore({
    aesScore: longAesScore,
    positiveSignalCount: pos.length,
    negativeSignalCount: neg.length,
    riskPenaltyScore,
    featureCoveragePct,
    missingFields: allMissingFields,
    previewMode: f.previewMode,
    regimeSpecificUsed: regimeSpecificUsed.value,
    experimentalComboUsed: experimentalComboUsed.value,
    stale: f.isStale === true,
  });
  const longAesConfidenceLabel = classifyLongAesConfidenceLabel(longAesConfidence);
  const source = f.previewMode ? "LIVE_PREVIEW" : "ENTRY_TELEMETRY_FINAL";

  const isLongAesHighQualityResearch = longAesScore >= 70;
  const isLongAesSniperResearch      = longAesScore >= 80;
  const isLongAesEliteResearch       = longAesScore >= 90;

  return {
    longAesVersion: LONG_AES_VERSION,
    longAesIsLogOnly: true,
    longAesCanAffectExecution: false,
    longAesAction: "LOG_ONLY_OBSERVE",
    longAesScoreSource: source,
    longAesComputedAt: Date.now(),
    longAesCalibrationStatus: "UNCALIBRATED_RULE_MODEL",
    longAesScoreIsCalibrated: false,

    longAesScore,
    longAesQualityScoreUncapped: qualityScoreUncapped,
    longAesRawUtility: rawUtility,
    longAesTier,
    longAesEligibility,
    longAesConfidence,
    longAesConfidenceLabel,
    longAesConfidenceIsInformative: longAesConfidence > 0 && featureCoveragePct >= 80,  // B-08
    longAesConfidenceDistinctValueCountAtRun: null,
    longAesConfidenceCalibrationStatus: "UNCALIBRATED_RULE_MODEL",  // B-09: was "CALIBRATED"
    longAesFeatureCoveragePct: featureCoveragePct,
    longAesMissingFields: allMissingFields,

    longAesDirectionScore:        directionScore,
    longAesMovementMaturityScore: movementMaturityScore,
    longAesVolatilityScore:       volatilityScore,
    longAesLocationScore:         locationScore,
    longAesFlowMomentumScore:     flowMomentumScore,
    longAesExecutionScore:        executionScore,
    longAesMarketContextScore:    marketContextScore,
    longAesSideSpecificScore:     sideSpecificScore,
    longAesInteractionScore:      interactionScore,
    longAesRiskPenaltyScore:      riskPenaltyScore,

    longAesPositiveContributions: pos,
    longAesNegativeContributions: neg,
    longAesWarnings:              warnings,
    longAesResearchBlockReasons:  researchBlockReasons,
    longAesCautionReasons:        cautionReasons,
    longAesExperimentalSignals:   experimentalComboUsed.value ? ["FAILED_BREAKDOWN_GREEN_COMBO"] : [],

    longAesSide: side,
    longAesFeatureSnapshot: { ...f },

    isLongAesHighQualityResearch,
    isLongAesSniperResearch,
    isLongAesEliteResearch,
  };
}

export function flattenLongAesV1(result) {
  return {
    longAesResult: result,
    longAesVersion:            result.longAesVersion,
    longAesIsLogOnly:          result.longAesIsLogOnly,
    longAesCanAffectExecution: result.longAesCanAffectExecution,
    longAesAction:             result.longAesAction,
    longAesScoreSource:        result.longAesScoreSource,
    longAesComputedAt:         result.longAesComputedAt,
    longAesCalibrationStatus:  result.longAesCalibrationStatus,
    longAesScoreIsCalibrated:  result.longAesScoreIsCalibrated,
    longAesScore:              result.longAesScore,
    longAesQualityScoreUncapped: result.longAesQualityScoreUncapped,
    longAesRawUtility:         result.longAesRawUtility,
    longAesTier:               result.longAesTier,
    longAesEligibility:        result.longAesEligibility,
    longAesConfidence:         result.longAesConfidence,
    longAesConfidenceLabel:    result.longAesConfidenceLabel,
    longAesConfidenceIsInformative: result.longAesConfidenceIsInformative ?? false,
    longAesConfidenceDistinctValueCountAtRun: result.longAesConfidenceDistinctValueCountAtRun ?? null,
    longAesConfidenceCalibrationStatus: result.longAesConfidenceCalibrationStatus ?? "UNCALIBRATED",
    longAesFeatureCoveragePct: result.longAesFeatureCoveragePct,
    longAesMissingFields:      result.longAesMissingFields,
    longAesDirectionScore:        result.longAesDirectionScore,
    longAesMovementMaturityScore: result.longAesMovementMaturityScore,
    longAesVolatilityScore:       result.longAesVolatilityScore,
    longAesLocationScore:         result.longAesLocationScore,
    longAesFlowMomentumScore:     result.longAesFlowMomentumScore,
    longAesExecutionScore:        result.longAesExecutionScore,
    longAesMarketContextScore:    result.longAesMarketContextScore,
    longAesSideSpecificScore:     result.longAesSideSpecificScore,
    longAesInteractionScore:      result.longAesInteractionScore,
    longAesRiskPenaltyScore:      result.longAesRiskPenaltyScore,
    longAesPositiveContributions: result.longAesPositiveContributions,
    longAesNegativeContributions: result.longAesNegativeContributions,
    longAesWarnings:              result.longAesWarnings,
    longAesResearchBlockReasons:  result.longAesResearchBlockReasons,
    longAesCautionReasons:        result.longAesCautionReasons,
    longAesExperimentalSignals:   result.longAesExperimentalSignals,
    longAesSide:                  result.longAesSide,
    longAesFeatureSnapshot:       result.longAesFeatureSnapshot,
    isLongAesHighQualityResearch: result.isLongAesHighQualityResearch,
    isLongAesSniperResearch:      result.isLongAesSniperResearch,
    isLongAesEliteResearch:       result.isLongAesEliteResearch,
  };
}

export const LONG_AES_V1_CSV_HEADERS = [
  "longAesVersion", "longAesIsLogOnly", "longAesCanAffectExecution", "longAesScoreSource",
  "longAesComputedAt", "longAesCalibrationStatus", "longAesScore", "longAesQualityScoreUncapped",
  "longAesRawUtility", "longAesTier", "longAesEligibility", "longAesConfidence",
  "longAesConfidenceLabel", "longAesFeatureCoveragePct", "longAesMissingFields",
  "longAesDirectionScore", "longAesMovementMaturityScore", "longAesVolatilityScore",
  "longAesLocationScore", "longAesFlowMomentumScore", "longAesExecutionScore",
  "longAesMarketContextScore", "longAesSideSpecificScore", "longAesInteractionScore",
  "longAesRiskPenaltyScore", "longAesPositiveContributions", "longAesNegativeContributions",
  "longAesWarnings", "longAesResearchBlockReasons", "longAesCautionReasons",
  "longAesSide", "longAesAction",
];

const csvCell = v => {
  if (v == null) return "";
  if (Array.isArray(v)) return `"${v.map(String).join("|").replace(/"/g, '""')}"`;
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
};

export function longAesV1CSVRow(s) {
  if (s.longAesScore == null) return LONG_AES_V1_CSV_HEADERS.map(() => "");
  return [
    csvCell(s.longAesVersion ?? ""),
    csvCell(s.longAesIsLogOnly ?? ""),
    csvCell(s.longAesCanAffectExecution ?? ""),
    csvCell(s.longAesScoreSource ?? ""),
    csvCell(s.longAesComputedAt ?? ""),
    csvCell(s.longAesCalibrationStatus ?? ""),
    csvCell(s.longAesScore ?? ""),
    csvCell(s.longAesQualityScoreUncapped ?? ""),
    csvCell(s.longAesRawUtility ?? ""),
    csvCell(s.longAesTier ?? ""),
    csvCell(s.longAesEligibility ?? ""),
    csvCell(s.longAesConfidence ?? ""),
    csvCell(s.longAesConfidenceLabel ?? ""),
    csvCell(s.longAesFeatureCoveragePct ?? ""),
    csvCell(s.longAesMissingFields ?? []),
    csvCell(s.longAesDirectionScore ?? ""),
    csvCell(s.longAesMovementMaturityScore ?? ""),
    csvCell(s.longAesVolatilityScore ?? ""),
    csvCell(s.longAesLocationScore ?? ""),
    csvCell(s.longAesFlowMomentumScore ?? ""),
    csvCell(s.longAesExecutionScore ?? ""),
    csvCell(s.longAesMarketContextScore ?? ""),
    csvCell(s.longAesSideSpecificScore ?? ""),
    csvCell(s.longAesInteractionScore ?? ""),
    csvCell(s.longAesRiskPenaltyScore ?? ""),
    csvCell(s.longAesPositiveContributions ?? []),
    csvCell(s.longAesNegativeContributions ?? []),
    csvCell(s.longAesWarnings ?? []),
    csvCell(s.longAesResearchBlockReasons ?? []),
    csvCell(s.longAesCautionReasons ?? []),
    csvCell(s.longAesSide ?? ""),
    csvCell(s.longAesAction ?? ""),
  ];
}
