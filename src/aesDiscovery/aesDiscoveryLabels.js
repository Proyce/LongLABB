// ─── AES DISCOVERY LABELS ─────────────────────────────────────────────────────
// Deterministic label assignment.  All thresholds are boundary-exact.

import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";

// ── Rank labels ───────────────────────────────────────────────────────────────
export const RANK_LABELS = {
  AES_TOP_1_25:      "AES_TOP_1_25",
  AES_RANK_26_50:    "AES_RANK_26_50",
  AES_RANK_51_100:   "AES_RANK_51_100",
  AES_RANK_101_200:  "AES_RANK_101_200",
  AES_RANK_201_PLUS: "AES_RANK_201_PLUS",
  AES_OUTSIDE_TOP25: "AES_OUTSIDE_TOP25",
  AES_OUTSIDE_TOP50: "AES_OUTSIDE_TOP50",
  AES_OUTSIDE_TOP100:"AES_OUTSIDE_TOP100",
  AES_OUTSIDE_TOP200:"AES_OUTSIDE_TOP200",
};

// ── Score labels ──────────────────────────────────────────────────────────────
export const SCORE_LABELS = {
  AES_WATCH_60_PLUS:  "AES_WATCH_60_PLUS",
  HIGH_AES_70_PLUS:   "HIGH_AES_70_PLUS",
  SNIPER_AES_80_PLUS: "SNIPER_AES_80_PLUS",
  ELITE_AES_90_PLUS:  "ELITE_AES_90_PLUS",
  HIGH_AES_NO_RANK:   "HIGH_AES_NO_RANK",
  HIGH_AES_SETUP_ONLY:"HIGH_AES_SETUP_ONLY",
};

// ── Disagreement labels ───────────────────────────────────────────────────────
export const DISAGREEMENT_LABELS = {
  AES_FULL_HIGH_NO_RANK_LOW:    "AES_FULL_HIGH_NO_RANK_LOW",
  AES_NO_RANK_HIGH_FULL_LOW:    "AES_NO_RANK_HIGH_FULL_LOW",
  AES_SETUP_ONLY_HIGH_FULL_LOW: "AES_SETUP_ONLY_HIGH_FULL_LOW",
  AES_RANK_DEPENDENT_SCORE:     "AES_RANK_DEPENDENT_SCORE",
  AES_SETUP_DOMINANT_SCORE:     "AES_SETUP_DOMINANT_SCORE",
};

// ── Side labels ───────────────────────────────────────────────────────────────
export const SIDE_LABELS = {
  HIGH_AES_EMERGING_GAINER: "HIGH_AES_EMERGING_GAINER",
  HIGH_AES_EMERGING_LOSER:  "HIGH_AES_EMERGING_LOSER",
};

// ── Gate labels ───────────────────────────────────────────────────────────────
export const GATE_LABELS = {
  HIGH_AES_RAW_SHADOW:           "HIGH_AES_RAW_SHADOW",
  HIGH_AES_UNIVERSAL_GATE_PASS:  "HIGH_AES_UNIVERSAL_GATE_PASS",
  HIGH_AES_UNIVERSAL_GATE_FAIL:  "HIGH_AES_UNIVERSAL_GATE_FAIL",
  HIGH_AES_GOLD_CONFIRMED_SHADOW:"HIGH_AES_GOLD_CONFIRMED_SHADOW",
  HIGH_AES_GREEN_DANGER:         "HIGH_AES_GREEN_DANGER",
  HIGH_AES_CVD_BULL_DANGER:      "HIGH_AES_CVD_BULL_DANGER",
  HIGH_AES_SPREAD_DANGER:        "HIGH_AES_SPREAD_DANGER",
  HIGH_AES_TELEMETRY_INCOMPLETE: "HIGH_AES_TELEMETRY_INCOMPLETE",
  HIGH_AES_TELEMETRY_STALE:      "HIGH_AES_TELEMETRY_STALE",
};

// ── Sniper labels ─────────────────────────────────────────────────────────────
export const SNIPER_LABELS = {
  HIDDEN_AES_SNIPER_LONG:       "HIDDEN_AES_SNIPER_LONG",
  HIDDEN_AES_SUPER_SNIPER_LONG: "HIDDEN_AES_SUPER_SNIPER_LONG",
};

// ── Outcome labels ────────────────────────────────────────────────────────────
export const OUTCOME_LABELS = {
  POST_FEE_WINNER:          "POST_FEE_WINNER",
  POST_FEE_LOSER:           "POST_FEE_LOSER",
  POST_FEE_3_PLUS:          "POST_FEE_3_PLUS",
  POST_FEE_5_PLUS:          "POST_FEE_5_PLUS",
  POST_FEE_10_PLUS:         "POST_FEE_10_PLUS",
  INSTANT_SL_UNDER_1M:      "INSTANT_SL_UNDER_1M",
  EARLY_SL_UNDER_3M:        "EARLY_SL_UNDER_3M",
  ENTERED_TOP50_AFTER_ENTRY:"ENTERED_TOP50_AFTER_ENTRY",
  ENTERED_TOP25_AFTER_ENTRY:"ENTERED_TOP25_AFTER_ENTRY",
  NEVER_ENTERED_TOP50:      "NEVER_ENTERED_TOP50",
};

// ── Confidence labels ─────────────────────────────────────────────────────────
export const CONFIDENCE_LABELS = {
  INSUFFICIENT_N_LT_20:    "INSUFFICIENT_N_LT_20",
  EARLY_N_20_TO_49:        "EARLY_N_20_TO_49",
  DEVELOPING_N_50_TO_99:   "DEVELOPING_N_50_TO_99",
  USABLE_N_100_TO_299:     "USABLE_N_100_TO_299",
  STRONG_N_300_PLUS:       "STRONG_N_300_PLUS",
};

export function classifyNConfidence(n) {
  if (n < 20)  return CONFIDENCE_LABELS.INSUFFICIENT_N_LT_20;
  if (n < 50)  return CONFIDENCE_LABELS.EARLY_N_20_TO_49;
  if (n < 100) return CONFIDENCE_LABELS.DEVELOPING_N_50_TO_99;
  if (n < 300) return CONFIDENCE_LABELS.USABLE_N_100_TO_299;
  return CONFIDENCE_LABELS.STRONG_N_300_PLUS;
}

// ── Main label assignment ─────────────────────────────────────────────────────

export function assignDiscoveryLabels({
  side24hRank,
  outsideTop25,
  outsideTop50,
  outsideTop100,
  outsideTop200,
  leaderboardSide,
  aesFull,
  aesNoRank,
  aesSetupOnly,
  telemetryCoveragePct,
  snapshot,
  config = AES_DISCOVERY_CONFIG,
}) {
  const labels = [];
  const thresholds = config.aesThresholds;
  const minCoverage = config.minimumTelemetryCoveragePct;

  // Rank labels
  if (side24hRank != null) {
    if (side24hRank >= 1  && side24hRank <= 25)  labels.push(RANK_LABELS.AES_TOP_1_25);
    if (side24hRank >= 26 && side24hRank <= 50)  labels.push(RANK_LABELS.AES_RANK_26_50);
    if (side24hRank >= 51 && side24hRank <= 100) labels.push(RANK_LABELS.AES_RANK_51_100);
    if (side24hRank >= 101 && side24hRank <= 200) labels.push(RANK_LABELS.AES_RANK_101_200);
    if (side24hRank >= 201) labels.push(RANK_LABELS.AES_RANK_201_PLUS);

    if (outsideTop25)  labels.push(RANK_LABELS.AES_OUTSIDE_TOP25);
    if (outsideTop50)  labels.push(RANK_LABELS.AES_OUTSIDE_TOP50);
    if (outsideTop100) labels.push(RANK_LABELS.AES_OUTSIDE_TOP100);
    if (outsideTop200) labels.push(RANK_LABELS.AES_OUTSIDE_TOP200);
  }

  // Score labels (boundary-exact)
  if (aesFull != null) {
    if (aesFull >= thresholds.watch)  labels.push(SCORE_LABELS.AES_WATCH_60_PLUS);
    if (aesFull >= thresholds.high)   labels.push(SCORE_LABELS.HIGH_AES_70_PLUS);
    if (aesFull >= thresholds.sniper) labels.push(SCORE_LABELS.SNIPER_AES_80_PLUS);
    if (aesFull >= thresholds.elite)  labels.push(SCORE_LABELS.ELITE_AES_90_PLUS);
  }
  if (aesNoRank != null && aesNoRank >= thresholds.high)    labels.push(SCORE_LABELS.HIGH_AES_NO_RANK);
  if (aesSetupOnly != null && aesSetupOnly >= thresholds.high) labels.push(SCORE_LABELS.HIGH_AES_SETUP_ONLY);

  // Disagreement labels
  if (aesFull != null && aesNoRank != null) {
    if (aesFull >= thresholds.high && aesNoRank < thresholds.watch)
      labels.push(DISAGREEMENT_LABELS.AES_FULL_HIGH_NO_RANK_LOW);
    if (aesNoRank >= thresholds.high && aesFull < thresholds.high)
      labels.push(DISAGREEMENT_LABELS.AES_NO_RANK_HIGH_FULL_LOW);
    // AES_RANK_DEPENDENT_SCORE: aesFull >= 70 AND aesNoRank < 60
    if (aesFull >= thresholds.high && aesNoRank < thresholds.watch)
      labels.push(DISAGREEMENT_LABELS.AES_RANK_DEPENDENT_SCORE);
  }
  if (aesFull != null && aesSetupOnly != null) {
    if (aesSetupOnly >= thresholds.high && aesFull < thresholds.high)
      labels.push(DISAGREEMENT_LABELS.AES_SETUP_ONLY_HIGH_FULL_LOW);
    // AES_SETUP_DOMINANT_SCORE: aesSetupOnly >= 70 AND aesFull < 70
    if (aesSetupOnly >= thresholds.high && aesFull < thresholds.high)
      labels.push(DISAGREEMENT_LABELS.AES_SETUP_DOMINANT_SCORE);
  }

  // Side labels
  if (leaderboardSide === "GAINERS" && (aesFull ?? aesNoRank ?? 0) >= thresholds.high)
    labels.push(SIDE_LABELS.HIGH_AES_EMERGING_GAINER);
  if (leaderboardSide === "LOSERS"  && (aesFull ?? aesNoRank ?? 0) >= thresholds.high)
    labels.push(SIDE_LABELS.HIGH_AES_EMERGING_LOSER);

  // Gate labels — long-native: green continuation, no red, CVD BULL
  const activeGreen  = snapshot?.immediateGreenImpulse === true || snapshot?.greenImpulseDetected === true;
  const immediateRed = snapshot?.immediateRedImpulse === true;
  const hasRed       = snapshot?.hasRedConfirmation === true || immediateRed || snapshot?.redImpulseDetected === true;
  const atrActive    = (snapshot?.atrPct ?? 0) >= 0.2;
  const cvdBull      = snapshot?.cvdLabel === "BULL";
  const spreadSafe   = (snapshot?.spreadPct ?? 1) <= 0.08;

  const rawHighAes = outsideTop25 === true &&
    (aesFull >= thresholds.high || aesNoRank >= thresholds.high || aesSetupOnly >= thresholds.high) &&
    (telemetryCoveragePct ?? 0) >= minCoverage;

  if (rawHighAes) labels.push(GATE_LABELS.HIGH_AES_RAW_SHADOW);

  // Long universal gate: green present + no immediate red + ATR active + CVD BULL
  const universalGatePass = activeGreen && !immediateRed && atrActive && cvdBull;
  if (rawHighAes) {
    if (universalGatePass) labels.push(GATE_LABELS.HIGH_AES_UNIVERSAL_GATE_PASS);
    else                   labels.push(GATE_LABELS.HIGH_AES_UNIVERSAL_GATE_FAIL);
  }

  if (rawHighAes && universalGatePass) labels.push(GATE_LABELS.HIGH_AES_GOLD_CONFIRMED_SHADOW);

  // For long: danger = no green continuation; CVD not BULL = lacking bull confirmation
  if (!activeGreen)                    labels.push(GATE_LABELS.HIGH_AES_GREEN_DANGER);
  if (!cvdBull)                        labels.push(GATE_LABELS.HIGH_AES_CVD_BULL_DANGER);
  if (!spreadSafe)                     labels.push(GATE_LABELS.HIGH_AES_SPREAD_DANGER);
  if ((telemetryCoveragePct ?? 0) < minCoverage) labels.push(GATE_LABELS.HIGH_AES_TELEMETRY_INCOMPLETE);

  // Long sniper: green continuation + CVD BULL + no immediate red
  const longSniperBase =
    outsideTop50 === true &&
    Math.max(aesNoRank ?? 0, aesSetupOnly ?? 0) >= thresholds.sniper &&
    (telemetryCoveragePct ?? 0) >= minCoverage &&
    activeGreen &&
    !immediateRed &&
    cvdBull;

  if (longSniperBase) labels.push(SNIPER_LABELS.HIDDEN_AES_SNIPER_LONG);

  const longSuperSniper =
    longSniperBase &&
    (snapshot?.atrPct ?? 0) >= 0.6 &&
    (snapshot?.spreadPct ?? 1) <= 0.05 &&
    snapshot?.last3TicksDirection === "UP" &&
    (snapshot?.macdHistogramState1m ?? "").includes("POSITIVE");

  if (longSuperSniper) labels.push(SNIPER_LABELS.HIDDEN_AES_SUPER_SNIPER_LONG);

  return [...new Set(labels)];
}

// ── Outcome label assignment ──────────────────────────────────────────────────

export function assignOutcomeLabels(trade, config = AES_DISCOVERY_CONFIG) {
  const labels = [];
  const { normalizedRoundTripFeePct } = config;
  const normFeeAdj = trade.normFeeAdjustedPnlPct ?? null;
  const holdMs = trade.holdMsActual ?? trade.closedAt - trade.entryTime ?? null;

  if (normFeeAdj != null) {
    if (normFeeAdj > 0)   labels.push(OUTCOME_LABELS.POST_FEE_WINNER);
    else                   labels.push(OUTCOME_LABELS.POST_FEE_LOSER);
    if (normFeeAdj >= 3)   labels.push(OUTCOME_LABELS.POST_FEE_3_PLUS);
    if (normFeeAdj >= 5)   labels.push(OUTCOME_LABELS.POST_FEE_5_PLUS);
    if (normFeeAdj >= 10)  labels.push(OUTCOME_LABELS.POST_FEE_10_PLUS);
  }

  if (normalizeLongCloseReason(trade.closeReason) === CLOSE_REASON.STOP_LOSS) {
    if (holdMs != null && holdMs < 60_000)    labels.push(OUTCOME_LABELS.INSTANT_SL_UNDER_1M);
    if (holdMs != null && holdMs < 3 * 60_000) labels.push(OUTCOME_LABELS.EARLY_SL_UNDER_3M);
  }

  if (trade.enteredTop50)  labels.push(OUTCOME_LABELS.ENTERED_TOP50_AFTER_ENTRY);
  if (trade.enteredTop25)  labels.push(OUTCOME_LABELS.ENTERED_TOP25_AFTER_ENTRY);
  if (!trade.enteredTop50) labels.push(OUTCOME_LABELS.NEVER_ENTERED_TOP50);

  return [...new Set(labels)];
}
