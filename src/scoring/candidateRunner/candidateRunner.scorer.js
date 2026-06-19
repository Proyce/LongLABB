export const CANDIDATE_RUNNER_VERSION = "CANDIDATE_RUNNER_V1";

export const CANDIDATE_RUNNER_ELITE_MIN = 90;
export const CANDIDATE_RUNNER_HIGH_MIN = 75;
export const CANDIDATE_RUNNER_STRONG_MIN = 60;
export const CANDIDATE_RUNNER_CANDIDATE_MIN = 45;
export const CANDIDATE_RUNNER_WATCH_MIN = 25;

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const uniq = arr => [...new Set((arr ?? []).filter(Boolean))];

function finiteNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  return v === true;
}

function upper(v) {
  return typeof v === "string" ? v.toUpperCase() : "";
}

function addGene(bucket, points, code) {
  bucket.push(`${code}(${points > 0 ? "+" : ""}${points}): ${code}`);
  return points;
}

export function classifyCandidateRunnerTier(score) {
  if (score >= CANDIDATE_RUNNER_ELITE_MIN)     return "CANDIDATE_RUNNER_ELITE";
  if (score >= CANDIDATE_RUNNER_HIGH_MIN)      return "CANDIDATE_RUNNER_HIGH";
  if (score >= CANDIDATE_RUNNER_STRONG_MIN)    return "CANDIDATE_RUNNER_STRONG";
  if (score >= CANDIDATE_RUNNER_CANDIDATE_MIN) return "CANDIDATE_RUNNER_CANDIDATE";
  if (score >= CANDIDATE_RUNNER_WATCH_MIN)     return "CANDIDATE_RUNNER_WATCH";
  return "CANDIDATE_RUNNER_LOW";
}

function classifyEntryMode(score) {
  if (score >= 90) return "ELITE_SNIPER";
  if (score >= 75) return "SNIPER";
  if (score >= 60) return "PRIORITY";
  if (score >= 45) return "NORMAL";
  if (score >= 25) return "WATCH_ONLY";
  return "BLOCK_SHADOW";
}

function isLoser(sample) {
  return upper(sample?.shortParentBucket).includes("LOSER");
}

function isGainer(sample) {
  return upper(sample?.shortParentBucket).includes("GAINER");
}

function hasPumpContinuationDanger(sample) {
  const label = upper(sample?.microMomentumLabel ?? "");
  return (
    bool(sample?.hasGainerContinuationDanger) ||
    label.includes("PUMP_CONTINUATION") ||
    label.includes("PUMP_STILL_HOT") ||
    label.includes("CONTINUATION_HIGH") ||
    label.includes("CONTINUATION_EXTREME") ||
    bool(sample?.pumpStillHot) ||
    sample?.topGainerPumpPhaseLabel === "GAINER_PUMP_STILL_HOT"
  );
}

function hasLongAuditDanger(sample) {
  const label = upper(sample?.longAuditDangerLabel ?? "");
  const flags = Array.isArray(sample?.longAuditDangerFlags) ? sample.longAuditDangerFlags : [];
  return label.includes("DANGER") || flags.some(f => upper(f).includes("DANGER"));
}

function hasVwapReclaimDanger(sample) {
  const label = upper(
    sample?.priceVsVwapLabel ??
    sample?.vwapContextLabel ??
    sample?.topGainerVwapContextLabel ?? ""
  );
  return label.includes("RECLAIM");
}

function isBtcBounceAgainstShort(sample) {
  const micro = upper(sample?.btcMicroRegime ?? "");
  return (
    micro.includes("BOUNCE") ||
    micro.includes("UP") ||
    micro.includes("PUMP") ||
    micro.includes("BULL")
  );
}

function isBtcControlledDown(sample) {
  const micro = upper(sample?.btcMicroRegime ?? "");
  const tact = upper(sample?.btcTacticalRegime ?? "");
  return (
    micro.includes("DOWN") || micro.includes("FLAT") ||
    tact.includes("DOWN") || tact.includes("FLAT")
  );
}

export function computeCandidateRunnerScore(sample) {
  const positiveGenes = [];
  const penaltyGenes = [];
  let rawScore = 0;

  // ── Movement potential ────────────────────────────────────────────────────
  const atr = finiteNumberOrNull(sample?.atrPct);
  if (atr != null) {
    if (atr >= 1.5)      rawScore += addGene(positiveGenes, 18, "CR_ATR_GE_1_5");
    else if (atr >= 1.0) rawScore += addGene(positiveGenes, 14, "CR_ATR_GE_1_0");
    else if (atr >= 0.6) rawScore += addGene(positiveGenes, 10, "CR_ATR_GE_0_6");
    else if (atr >= 0.3) rawScore += addGene(positiveGenes, 5,  "CR_ATR_GE_0_3");
  }

  const volAccel = finiteNumberOrNull(sample?.volAccel);
  if (volAccel != null && volAccel <= -3) rawScore += addGene(positiveGenes, 6, "CR_VOL_ACCEL_SUPPORTIVE");

  const change24h = Math.abs(finiteNumberOrNull(sample?.change24h) ?? 0);
  if (change24h >= 8) rawScore += addGene(positiveGenes, 6, "CR_EXTREME_MOVER_24H");
  else if (change24h >= 4) rawScore += addGene(positiveGenes, 4, "CR_HIGH_MOVER_24H");

  // ── Directional short continuation ───────────────────────────────────────
  if (sample?.last3TicksDirection === "DOWN") rawScore += addGene(positiveGenes, 12, "CR_TICKS_DOWN");

  const macd1m  = finiteNumberOrNull(sample?.macdHistogram1m);
  const macdDlt = finiteNumberOrNull(sample?.macdHistogramDelta1m);
  const macdState = upper(sample?.macdHistogramState1m ?? "");
  const macdNegExp = (
    macdState.includes("NEGATIVE_EXPANDING") ||
    macdState.includes("BEARISH_ROLLOVER") ||
    (macd1m != null && macdDlt != null && macd1m < 0 && macdDlt < 0)
  );
  if (macdNegExp) rawScore += addGene(positiveGenes, 8, "CR_1M_RED_WEAK");

  if (bool(sample?.redImpulseDetected))  rawScore += addGene(positiveGenes, 10, "CR_RED_IMPULSE_DETECTED");
  if (bool(sample?.immediateRedImpulse)) rawScore += addGene(positiveGenes, 8,  "CR_IMMEDIATE_RED_IMPULSE");

  const noGreen = sample?.greenImpulseDetected !== true && sample?.immediateGreenImpulse !== true;
  if (noGreen) rawScore += addGene(positiveGenes, 10, "CR_NO_GREEN_IMPULSE");

  if (bool(sample?.greenImpulseDetected) || bool(sample?.immediateGreenImpulse)) {
    rawScore += addGene(penaltyGenes, -25, "CR_GREEN_IMPULSE_PENALTY");
  }

  // ── Rejection / failure structure ─────────────────────────────────────────
  const vwapLabel = upper(
    sample?.priceVsVwapLabel ??
    sample?.vwapContextLabel ??
    sample?.topGainerVwapContextLabel ?? ""
  );
  const aboveVwapRejection = (
    bool(sample?.aboveVwapRejectionSetup) ||
    vwapLabel.includes("ABOVE_VWAP_REJECTION")
  );
  const belowVwapRedConfirm = (
    bool(sample?.belowVwapWithRedConfirmation) ||
    vwapLabel.includes("BELOW_VWAP_WITH_RED") ||
    vwapLabel.includes("GAINER_VWAP_LOSS_WITH_RED")
  );

  if (aboveVwapRejection)  rawScore += addGene(positiveGenes, 12, "CR_ABOVE_VWAP_REJECTION");
  if (belowVwapRedConfirm) rawScore += addGene(positiveGenes, 8,  "CR_BELOW_VWAP_RED_CONFIRM");
  if (bool(sample?.failedBreakout1m)) rawScore += addGene(positiveGenes, 8, "CR_FAILED_BREAKOUT_1M");
  if (bool(sample?.failedBreakout3m)) rawScore += addGene(positiveGenes, 6, "CR_FAILED_BREAKOUT_3M");

  if (hasVwapReclaimDanger(sample)) rawScore += addGene(penaltyGenes, -20, "CR_VWAP_RECLAIM_DANGER");

  const aboveVwap = vwapLabel.includes("ABOVE_VWAP") && !aboveVwapRejection;
  if (aboveVwap && (volAccel == null || volAccel > -1)) {
    rawScore += addGene(penaltyGenes, -12, "CR_ABOVE_VWAP_NO_SUPPORT");
  }

  // ── Flow and momentum ─────────────────────────────────────────────────────
  const cvd = upper(sample?.cvdLabel ?? "");
  if (cvd === "BEAR") rawScore += addGene(positiveGenes, 10, "CR_CVD_BEAR");
  else if (cvd === "NEUT") rawScore += addGene(positiveGenes, 5, "CR_CVD_NEUT");
  else if (cvd === "BULL") rawScore += addGene(penaltyGenes, -25, "CR_CVD_BULL");

  if (macdNegExp) rawScore += addGene(positiveGenes, 12, "CR_MACD_NEG_EXPANDING");
  else if (macdDlt != null && macdDlt < 0) rawScore += addGene(positiveGenes, 8, "CR_MACD_ROLLOVER");

  const rsi1m = finiteNumberOrNull(sample?.rsi1mDelta);
  const rsiSpread = finiteNumberOrNull(sample?.rsiSpread1m3m);
  if (rsi1m != null && rsi1m < -2) rawScore += addGene(positiveGenes, 8, "CR_RSI_1M_FALLING");
  if (rsiSpread != null && rsiSpread < -3) rawScore += addGene(positiveGenes, 5, "CR_RSI_SPREAD_BEARISH");
  if (rsi1m != null && rsi1m > 3) rawScore += addGene(penaltyGenes, -18, "CR_RSI_RISING_STRONG");

  const macdLongBull = (
    macdState.includes("POSITIVE_EXPANDING") ||
    macdState.includes("BULLISH_EXPANSION")
  );
  if (macdLongBull) rawScore += addGene(penaltyGenes, -20, "CR_MACD_LONG_BULL_EXPANSION");

  // ── Gainer exhaustion boost ───────────────────────────────────────────────
  if (isGainer(sample)) {
    const exh = finiteNumberOrNull(sample?.topGainerExhaustionScore ?? sample?.exhaustionScore);
    const exhQ = finiteNumberOrNull(sample?.topGainerExhaustionQualityScore ?? sample?.exhaustionQualityScore);
    if (exh != null && exh >= 80)  rawScore += addGene(positiveGenes, 10, "CR_EXHAUSTION_GE_80");
    if (exhQ != null && exhQ >= 120) rawScore += addGene(positiveGenes, 10, "CR_EXHAUSTION_Q_GE_120");

    const microLabel = upper(sample?.microMomentumLabel ?? "");
    if (microLabel.includes("MULTI_CONFIRM")) rawScore += addGene(positiveGenes, 10, "CR_MICRO_MULTI_CONFIRM");

    if (hasPumpContinuationDanger(sample)) rawScore += addGene(penaltyGenes, -20, "CR_PUMP_CONTINUATION_DANGER");
  }

  // ── Loser continuation boost ──────────────────────────────────────────────
  if (isLoser(sample)) {
    const gatePass = bool(sample?.shortGatePass) || bool(sample?.shortGateWouldPass);
    if (gatePass) rawScore += addGene(positiveGenes, 12, "CR_SHORT_GATE_PASS");

    const rank = finiteNumberOrNull(sample?.entryRank ?? sample?.entryRankInBucket);
    if (rank != null) {
      if (rank <= 5)       rawScore += addGene(positiveGenes, 10, "CR_RANK_TOP_5");
      else if (rank <= 10) rawScore += addGene(positiveGenes, 7,  "CR_RANK_TOP_10");
      else if (rank <= 15) rawScore += addGene(positiveGenes, 5,  "CR_RANK_TOP_15");
    }

    const spread = finiteNumberOrNull(sample?.spreadPct);
    if (spread != null) {
      if (spread <= 0.03) rawScore += addGene(positiveGenes, 6, "CR_SPREAD_TIGHT");
      else if (spread <= 0.05) rawScore += addGene(positiveGenes, 4, "CR_SPREAD_OK");
    }

    const bounceRisk = upper(sample?.bounceRisk ?? "");
    if (bounceRisk === "HIGH") rawScore += addGene(penaltyGenes, -20, "CR_BOUNCE_RISK_HIGH");
  }

  // ── Market breath adjustment ──────────────────────────────────────────────
  if (isBtcControlledDown(sample)) {
    rawScore += addGene(positiveGenes, 4, "CR_BTC_CONTROLLED_DOWN");
    const tact = upper(sample?.btcTacticalRegime ?? "");
    if (tact.includes("DOWN") || tact.includes("FLAT")) {
      rawScore += addGene(positiveGenes, 3, "CR_BTC_TACTICAL_DOWN");
    }
  }
  if (isBtcBounceAgainstShort(sample)) rawScore += addGene(penaltyGenes, -10, "CR_BTC_BOUNCE_AGAINST_SHORT");

  // ── Long audit penalty ────────────────────────────────────────────────────
  const longDangerLabel = upper(sample?.longAuditDangerLabel ?? "");
  const longDangerFlags = Array.isArray(sample?.longAuditDangerFlags) ? sample.longAuditDangerFlags : [];

  if (longDangerLabel === "NONE" || longDangerLabel === "CLEAN" || longDangerLabel === "") {
    rawScore += addGene(positiveGenes, 8, "CR_NO_LONG_AUDIT_DANGER");
  } else if (hasLongAuditDanger(sample)) {
    rawScore += addGene(penaltyGenes, -30, "CR_LONG_AUDIT_DANGER");
  }

  const flagsUpper = longDangerFlags.map(f => upper(f));
  if (flagsUpper.some(f => f.includes("RSI_LONG_MOMENTUM"))) {
    rawScore += addGene(penaltyGenes, -18, "CR_RSI_LONG_MOMENTUM_EXPANSION");
  }
  if (flagsUpper.some(f => f.includes("MACD_LONG_BULLISH"))) {
    rawScore += addGene(penaltyGenes, -20, "CR_MACD_LONG_BULLISH_EXPANSION");
  }
  if (flagsUpper.some(f => f.includes("FLOW_LONG_ACCUMULATION"))) {
    rawScore += addGene(penaltyGenes, -18, "CR_FLOW_LONG_ACCUMULATION");
  }

  // ── Final scoring ─────────────────────────────────────────────────────────
  const score = Math.round(clamp(rawScore));
  const tier = classifyCandidateRunnerTier(score);
  const entryMode = classifyEntryMode(score);

  const labels = uniq([
    score >= CANDIDATE_RUNNER_WATCH_MIN     ? "CANDIDATE_RUNNER_WATCH"     : null,
    score >= CANDIDATE_RUNNER_CANDIDATE_MIN ? "CANDIDATE_RUNNER_CANDIDATE" : null,
    score >= CANDIDATE_RUNNER_STRONG_MIN    ? "CANDIDATE_RUNNER_STRONG"    : null,
    score >= CANDIDATE_RUNNER_HIGH_MIN      ? "CANDIDATE_RUNNER_HIGH"      : null,
    score >= CANDIDATE_RUNNER_ELITE_MIN     ? "CANDIDATE_RUNNER_ELITE"     : null,
    entryMode === "BLOCK_SHADOW"  ? "CR_BLOCK_SHADOW"  : null,
    entryMode === "WATCH_ONLY"    ? "CR_WATCH_ONLY"    : null,
    entryMode === "PRIORITY"      ? "CR_PRIORITY"      : null,
    entryMode === "SNIPER"        ? "CR_SNIPER"        : null,
    entryMode === "ELITE_SNIPER"  ? "CR_ELITE_SNIPER"  : null,
  ]);

  return Object.freeze({
    candidateRunnerScoreRaw: rawScore,
    candidateRunnerScore: score,
    candidateRunnerScoreAtScan: score,
    candidateRunnerScoreAtEntry: score,
    candidateRunnerTier: tier,
    candidateRunnerTierAtScan: tier,
    candidateRunnerTierAtEntry: tier,
    candidateRunnerLabels: labels,
    candidateRunnerLabelsAtScan: labels,
    candidateRunnerLabelsAtEntry: labels,
    candidateRunnerPositiveGenes: uniq(positiveGenes),
    candidateRunnerPenaltyGenes: uniq(penaltyGenes),
    candidateRunnerEntrySafe: true,
    candidateRunnerScoreVersion: CANDIDATE_RUNNER_VERSION,
    candidateRunnerWouldAllow: score >= CANDIDATE_RUNNER_CANDIDATE_MIN,
    candidateRunnerWouldBlock: score < CANDIDATE_RUNNER_WATCH_MIN,
    candidateRunnerEntryMode: entryMode,
  });
}
