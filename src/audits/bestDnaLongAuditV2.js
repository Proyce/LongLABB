// ─── BEST DNA LONG V2 SHADOW ─────────────────────────────────────────────────
// Outcome-informed recalibration of the Long DNA research score.
// V1 is preserved untouched for historical comparability.
// LOG ONLY: this score cannot affect execution, sizing, leverage or exits.

import {
  deriveLongMicroUpConfirmation,
  deriveRsiLongMomentumExpansion,
  deriveMacdBullishExpansion,
  normalizeLongCvdLabel,
} from "../research/longWinningSignals.js";
import { classifyBestDnaLongTier } from "./bestDnaLongAudit.js";

export const BEST_DNA_LONG_V2_VERSION = "BEST_DNA_LONG_V2_SHADOW_2026_06";

export const BEST_DNA_LONG_V2_CONFIG = Object.freeze({
  baseScore: 35,
  weights: Object.freeze({
    gate90: 18,
    gatePremium: 8,
    last3Up: 14,
    immediateGreen: 14,
    greenDetected: 8,
    microUp: 10,
    macdExpansion: 12,
    rsiExpansion: 12,
    cvdBull: 8,
    cvdNeut: 4,
    noImmediateRed: 6,
    cleanSpread: 4,
    atrConfirmedHigh: 4,
    atrConfirmedActive: 3,
    immediateRed: -28,
    cvdBear: -18,
    noGreenOrMicro: -10,
    fallingKnife: -20,
    sellerAccelerationBelowVwap: -18,
    wideSpread: -10,
    highAtrUnconfirmed: -8,
  }),
});

const clamp = value => Math.max(0, Math.min(100, Math.round(value)));
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const uniq = values => [...new Set(values.filter(Boolean))];

function add(bucket, code, points, detail = null) {
  bucket.push({ code, points, detail });
  return points;
}

function hasFallingKnifeDanger(sample) {
  return sample.longCombosAntiMatched?.includes?.("LONG_FALLING_KNIFE_ANTI_V1") ||
    sample.longSubBucket === "TOP_LOSER_FALLING_KNIFE_DANGER" ||
    sample.topLoserLongSubBucket === "TOP_LOSER_FALLING_KNIFE_DANGER" ||
    sample.longAuditDangerLabel === "LONG_AUDIT_HARD_DANGER";
}

function isBelowVwap(sample) {
  const label = sample.entryPriceVsVwapLabel ?? sample.priceVsVwapLabel ?? sample.longVwapContextLabel;
  const pct = finite(sample.entryPriceVsVwapPct ?? sample.priceVsVwapPct);
  return label === "BELOW_VWAP" || (pct != null && pct < -0.05);
}

export function computeBestDnaLongV2Shadow(sample = {}, config = BEST_DNA_LONG_V2_CONFIG) {
  const w = config.weights;
  const positive = [];
  const penalties = [];
  let score = config.baseScore;

  const gateScore = finite(sample.longGateScore);
  const gatePremium = sample.longGateTier === "PREMIUM";
  const micro = deriveLongMicroUpConfirmation(sample);
  const rsiExpansion = deriveRsiLongMomentumExpansion(sample).rsiLongMomentumExpansion === true;
  const macdExpansion = deriveMacdBullishExpansion(sample) === true;
  const cvd = normalizeLongCvdLabel(sample);
  const atr = finite(sample.atrPct);
  const spread = finite(sample.spreadPct);
  const immediateGreen = sample.immediateGreenImpulse === true;
  const greenDetected = sample.greenImpulseDetected === true;
  const noImmediateRed = sample.immediateRedImpulse !== true;

  if (gateScore != null && gateScore >= 90) score += add(positive, "GATE_SCORE_GE_90", w.gate90, gateScore);
  if (gatePremium) score += add(positive, "GATE_PREMIUM", w.gatePremium);
  if (sample.last3TicksDirection === "UP") score += add(positive, "LAST_3_TICKS_UP", w.last3Up);
  if (immediateGreen) score += add(positive, "IMMEDIATE_GREEN_IMPULSE", w.immediateGreen);
  if (greenDetected) score += add(positive, "GREEN_IMPULSE_DETECTED", w.greenDetected);
  if (micro.longMicroUpConfirmation) score += add(positive, "LONG_MICRO_UP_CONFIRMATION", w.microUp, micro.longMicroUpConfirmationReasons);
  if (macdExpansion) score += add(positive, "MACD_BULLISH_EXPANSION", w.macdExpansion);
  if (rsiExpansion) score += add(positive, "RSI_LONG_MOMENTUM_EXPANSION", w.rsiExpansion);
  if (cvd === "BULL") score += add(positive, "CVD_BULL", w.cvdBull);
  else if (cvd === "NEUT") score += add(positive, "CVD_NEUT", w.cvdNeut);
  if (noImmediateRed) score += add(positive, "NO_IMMEDIATE_RED", w.noImmediateRed);
  if (spread != null && spread <= 0.05) score += add(positive, "CLEAN_SPREAD", w.cleanSpread, spread);

  const directionalConfirmations = [
    gateScore != null && gateScore >= 90,
    micro.longMicroUpConfirmation,
    macdExpansion,
    rsiExpansion,
    cvd === "BULL" || cvd === "NEUT",
  ].filter(Boolean).length;
  const strictDirectionalConfirmation =
    gateScore != null && gateScore >= 90 &&
    directionalConfirmations >= 4 &&
    noImmediateRed;

  if (atr != null && atr >= 1.0) {
    score += strictDirectionalConfirmation
      ? add(positive, "ATR_GE_1_CONFIRMED_AMPLIFIER", w.atrConfirmedHigh, atr)
      : add(penalties, "ATR_GE_1_UNCONFIRMED", w.highAtrUnconfirmed, atr);
  } else if (atr != null && atr >= 0.6 && strictDirectionalConfirmation) {
    score += add(positive, "ATR_GE_0_6_CONFIRMED_AMPLIFIER", w.atrConfirmedActive, atr);
  }

  if (sample.immediateRedImpulse === true) score += add(penalties, "IMMEDIATE_RED_IMPULSE", w.immediateRed);
  if (cvd === "BEAR") score += add(penalties, "CVD_BEAR", w.cvdBear);
  if (!immediateGreen && !greenDetected && !micro.longMicroUpConfirmation) {
    score += add(penalties, "NO_GREEN_OR_MICRO_UP", w.noGreenOrMicro);
  }
  if (hasFallingKnifeDanger(sample)) score += add(penalties, "FALLING_KNIFE_DANGER", w.fallingKnife);
  if (isBelowVwap(sample) && finite(sample.volAccel) > 0 && !micro.longMicroUpConfirmation) {
    score += add(penalties, "SELLER_ACCELERATION_BELOW_VWAP", w.sellerAccelerationBelowVwap);
  }
  if (spread != null && spread > 0.05) score += add(penalties, "WIDE_SPREAD", w.wideSpread, spread);

  const finalScore = clamp(score);
  return Object.freeze({
    bestDnaLongScoreV2ShadowRaw: score,
    bestDnaLongScoreV2Shadow: finalScore,
    bestDnaLongTierV2Shadow: classifyBestDnaLongTier(finalScore).replace("BEST_DNA_LONG_", "BEST_DNA_LONG_V2_"),
    bestDnaLongV2PositiveGenes: uniq(positive.map(item => `${item.code}(${item.points > 0 ? "+" : ""}${item.points})`)),
    bestDnaLongV2PenaltyGenes: uniq(penalties.map(item => `${item.code}(${item.points})`)),
    bestDnaLongV2Contributions: positive,
    bestDnaLongV2Penalties: penalties,
    bestDnaLongV2StrictDirectionalConfirmation: strictDirectionalConfirmation,
    bestDnaLongV2Config: config,
    bestDnaLongV2Version: BEST_DNA_LONG_V2_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}
