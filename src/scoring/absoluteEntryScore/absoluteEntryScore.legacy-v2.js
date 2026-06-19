// ─── ABSOLUTE ENTRY SCORE ────────────────────────────────────────────────────
// Universal, predictive entry score for TOP_LOSER_SHORTS and TOP_GAINER_SHORTS.
// Observer mode: scores every entry but does not block unless toggle enabled.
// Never uses hindsight exit diagnostics as inputs.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Side helpers ─────────────────────────────────────────────────────────────

function isGainerSide(s) {
  return s.shortParentBucket === "TOP_GAINER_SHORTS" || s.leaderboardSide === "GAINERS";
}

function isLoserSide(s) {
  return s.shortParentBucket === "TOP_LOSER_SHORTS" || s.leaderboardSide === "LOSERS";
}

// Derive btcRunDirection from btcRegime when not directly stored on sample.
function deriveBtcRunDirection(s) {
  if (typeof s.btcRunDirection === "string" && s.btcRunDirection.length > 0) {
    return s.btcRunDirection;
  }
  switch (s.btcRegime) {
    case "BTC_STRONG_DOWN":
    case "BTC_WEAK_DOWN": return "DOWN";
    case "BTC_CHOP":      return "FLAT";
    case "BTC_MIXED":     return "MIXED";
    case "BTC_STRONG_UP": return "UP";
    default:              return null;
  }
}

function hasStrongRedOrExhaustionConfirmation(s) {
  return (
    s.hasRedConfirmation === true ||
    s.immediateRedImpulse === true ||
    s.redImpulseDetected === true ||
    s.hasGainerExhaustionConfirmation === true ||
    s.topGainerWouldPassExhaustionAudit === true
  );
}

// ── Hard block detection ─────────────────────────────────────────────────────

function computeHardBlocks(s) {
  const blocks = [];
  const btcDir = deriveBtcRunDirection(s);

  if (s.isInvalidMarket === true)                        blocks.push("INVALID_MARKET");
  if (s.isStale === true)                                blocks.push("STALE");
  if (s.candleColorAtEntry === "GREEN")                  blocks.push("GREEN_CANDLE");
  if (s.immediateGreenImpulse === true)                  blocks.push("IMMEDIATE_GREEN_IMPULSE");
  if (s.greenImpulseDetected === true)                   blocks.push("GREEN_IMPULSE_DETECTED");
  if (s.cvdLabel === "BULL")                             blocks.push("CVD_BULL");
  if ((s.spreadPct ?? 0) > 0.08)                         blocks.push("SPREAD_GT_0_08");
  if (s.entryTimingGrade === "F")                        blocks.push("ENTRY_GRADE_F");
  if (s.greenPressureLabel === "IMMEDIATE_GREEN_ACTIVE") blocks.push("IMMEDIATE_GREEN_ACTIVE");
  if (s.greenPressureLabel === "GREEN_IMPULSE_ACTIVE")   blocks.push("GREEN_IMPULSE_ACTIVE");
  if (btcDir === "UP" && !hasStrongRedOrExhaustionConfirmation(s)) blocks.push("BTC_UP_NO_CONFIRMATION");
  if (s.vwapContextLabel === "VWAP_RECLAIM")             blocks.push("VWAP_RECLAIM");

  if (isGainerSide(s)) {
    if (s.hasGainerContinuationDanger === true)
      blocks.push("GAINER_CONTINUATION_DANGER");
    if (s.topGainerPumpPhaseLabel === "GAINER_PUMP_STILL_HOT")
      blocks.push("GAINER_PUMP_STILL_HOT");
    if (s.topGainerContinuationPressureLabel === "GAINER_CONTINUATION_EXTREME")
      blocks.push("GAINER_CONTINUATION_EXTREME");
  }

  if (s.shortThesisLaneLabel === "TOP_LOSER_BLIND_WEAKNESS_SHORT") blocks.push("BLIND_WEAKNESS_SHORT");
  if (s.isBlindWeaknessShort === true)                   blocks.push("BLIND_WEAKNESS_SHORT");
  if (s.isBtcBounceTrapRisk === true)                    blocks.push("BTC_BOUNCE_TRAP_RISK");
  if (s.isCorpseChaseRisk === true)                      blocks.push("CORPSE_CHASE_RISK");

  return [...new Set(blocks)];
}

// ── Universal core score (range -100 to 45) ──────────────────────────────────

function computeUniversalCoreScore(s) {
  let score = 0;

  if (s.hasRedConfirmation === true) score += 12;
  if (s.immediateRedImpulse === true || s.redImpulseDetected === true) score += 15;
  if (s.candleColorAtEntry === "RED") score += 10;
  if (s.immediateGreenImpulse !== true && s.greenImpulseDetected !== true) score += 15;

  const atr = s.atrPct ?? 0;
  if (atr >= 0.6) score += 10;
  if (atr >= 1.0) score += 5;

  if (s.cvdLabel === "BEAR")      score += 12;
  else if (s.cvdLabel === "NEUT") score += 7;
  else if (s.cvdLabel === "BULL") score -= 25;

  if (s.immediateGreenImpulse === true || s.greenImpulseDetected === true) score -= 25;
  if (s.candleColorAtEntry === "GREEN") score -= 20;

  return clamp(score, -100, 45);
}

// ── Momentum quality score (range 0 to 20) ───────────────────────────────────

function computeMomentumQualityScore(s) {
  let score = 0;

  if (s.shortGateWouldPass === true) score += 8;
  if (s.microMomentumLabel === "MICRO_MULTI_CONFIRM")      score += 6;
  else if (s.microMomentumLabel === "MICRO_RED_IMPULSE")   score += 5;
  if (s.hasRsiRollover === true) score += 5;
  if (s.rsi1mSlope === "FALLING" || s.rsi3mSlope === "FALLING") score += 5;

  const macd = s.macdHistogramState1m ?? "";
  if (macd.includes("NEGATIVE_EXPANDING")) score += 5;
  else if (macd.includes("SHRINKING") && isGainerSide(s)) score += 4;

  if (s.last3TicksDirection === "DOWN") score += 4;
  if (s.last5TicksDirection === "DOWN") score += 3;

  return clamp(score, 0, 20);
}

// ── Execution quality score (range -30 to 15) ────────────────────────────────

function computeExecutionQualityScore(s) {
  let score = 0;
  const spread = s.spreadPct ?? null;

  if (spread != null) {
    if (spread <= 0.03)      score += 8;
    else if (spread <= 0.05) score += 5;
    else                     score -= 10;
    if (spread > 0.08)       score -= 25;
  }

  const rank = s.entryRankInBucket ?? s.entryRank ?? null;
  if (rank != null) {
    if (rank <= 15) score += 4;
    else if (rank <= 25) score += 2;
  }

  if (s.priceVsVwapLabel === "BELOW_VWAP") {
    score += 3;
  } else if (s.priceVsVwapLabel === "ABOVE_VWAP") {
    if (s.hasGainerRedRejection === true) {
      score += 3;
    } else if ((s.volAccel ?? 0) > 0 && s.hasRedConfirmation !== true) {
      score -= 8;
    }
  }

  return clamp(score, -30, 15);
}

// ── BTC context score (range -15 to +15) ─────────────────────────────────────

function computeBtcContextScore(s) {
  const btcDir = deriveBtcRunDirection(s);
  let score = 0;

  if (btcDir === "DOWN")               score += 12;
  else if (btcDir === "FLAT" || btcDir === "MIXED") score += 6;
  else if (btcDir === "UP")            score -= 15;

  const btcCtx = s.btcShortContextLabel ?? "";
  if (btcCtx === "BTC_CHOP_OK")                    score += 5;
  else if (btcCtx === "BTC_STRONG_UP_SHORT_DANGER") score -= 10;
  else if (
    btcCtx === "BTC_STRONG_DOWN_BOUNCE_TRAP" ||
    btcCtx === "BTC_WEAK_DOWN_CAUTION"
  ) score -= 8;

  return clamp(score, -15, 15);
}

// ── Loser quality score (range -100 to 25) ───────────────────────────────────

function computeLoserQualityScore(s) {
  if (!isLoserSide(s)) return 0;

  const btcDir = deriveBtcRunDirection(s);
  const spread = s.spreadPct ?? null;
  const rank   = s.entryRankInBucket ?? s.entryRank ?? null;
  const macd   = s.macdHistogramState1m ?? "";

  let score = 0;

  if (s.shortGateWouldPass === true) score += 10;
  if (s.immediateRedImpulse === true || s.redImpulseDetected === true) score += 10;
  if (s.cvdLabel === "BEAR")          score += 8;
  else if (s.cvdLabel === "NEUT")     score += 4;

  const atr = s.atrPct ?? 0;
  if (atr >= 0.6) score += 6;
  if (atr >= 1.0) score += 4;

  if (spread != null && spread <= 0.05) score += 5;
  if (rank != null && rank <= 15)       score += 5;
  if (s.priceVsVwapLabel === "BELOW_VWAP") score += 5;
  if (macd.includes("NEGATIVE_EXPANDING")) score += 5;
  if (s.hasRsiRollover === true)           score += 4;
  if (btcDir === "DOWN")                   score += 4;

  // Penalties
  if (s.isBlindWeaknessShort === true)  score -= 20;
  if (s.topLoserThesisLaneLabel === "TOP_LOSER_BLIND_WEAKNESS_SHORT") score -= 15;
  if (s.isBtcBounceTrapRisk === true)   score -= 15;
  if (s.isCorpseChaseRisk === true)     score -= 15;
  if (
    s.priceVsVwapLabel === "BELOW_VWAP" &&
    s.hasRedConfirmation !== true &&
    s.hasRsiRollover !== true
  ) score -= 12;
  if (spread != null && spread > 0.05)  score -= 10;
  if (s.cvdLabel === "BULL")            score -= 15;
  if (s.immediateGreenImpulse === true || s.greenImpulseDetected === true) score -= 20;

  return clamp(score, -100, 25);
}

// ── Gainer quality score (range -100 to 25) ──────────────────────────────────

function computeGainerQualityScore(s) {
  if (!isGainerSide(s)) return 0;

  const lane     = s.topGainerThesisLaneLabel ?? "";
  const warnings = s.topGainerQualityWarningLabels ?? [];
  const eq       = s.topGainerExhaustionQualityScore ?? 0;

  let score = 0;

  if (eq >= 80)  score += 8;
  if (eq >= 120) score += 8;
  if (s.topGainerWouldPassExhaustionAudit === true) score += 8;
  if (s.hasGainerExhaustionConfirmation === true)   score += 8;
  if (s.hasGainerRedRejection === true)  score += 6;
  if (s.hasGainerFailedBreakout === true) score += 6;
  if (s.hasGainerRsiRollover === true)   score += 5;
  if (s.hasGainerTrendRollover === true) score += 5;
  if (s.hasGainerVolumeFade === true)    score += 5;

  if (lane === "TOP_GAINER_CLASSIC_EXHAUSTION_SHORT")  score += 5;
  else if (lane === "TOP_GAINER_FAILED_BREAKOUT_SHORT") score += 5;
  else if (lane === "TOP_GAINER_LOCKED_RUNNER_SHORT")   score += 5;

  if (s.topGainerVwapContextLabel === "GAINER_VWAP_LOSS_WITH_RED_CONFIRMATION") score += 4;
  if (s.topGainerVolumeFlowContextLabel === "GAINER_FLOW_DISTRIBUTION")          score += 4;

  if (s.cvdLabel === "BEAR")       score += 4;
  else if (s.cvdLabel === "NEUT")  score += 2;

  // Penalties
  if (s.hasGainerContinuationDanger === true)                      score -= 25;
  if ((s.topGainerContinuationDangerScore ?? 0) > 35)              score -= 25;
  if (s.topGainerContinuationPressureLabel === "GAINER_CONTINUATION_EXTREME") score -= 20;
  if (s.topGainerPumpPhaseLabel === "GAINER_PUMP_STILL_HOT")       score -= 18;
  if (lane === "TOP_GAINER_CONTINUATION_DANGER")                    score -= 18;
  if (warnings.includes("TOP_GAINER_CVD_BULLISH_DANGER"))           score -= 15;
  if (warnings.includes("TOP_GAINER_GREEN_CANDLE_DANGER"))          score -= 15;
  if (
    warnings.includes("TOP_GAINER_TREND_LONG_BIAS_DANGER") &&
    s.hasGainerExhaustionConfirmation !== true
  ) score -= 15;
  if (s.cvdLabel === "BULL") score -= 15;
  if (s.immediateGreenImpulse === true || s.greenImpulseDetected === true) score -= 20;

  return clamp(score, -100, 25);
}

// ── Danger penalty score (range 0 to 50) ─────────────────────────────────────

function computeDangerPenaltyScore(s) {
  const btcDir = deriveBtcRunDirection(s);
  let penalty  = 0;

  if (s.immediateGreenImpulse === true)  penalty += 30;
  if (s.greenImpulseDetected === true)   penalty += 25;
  if (s.cvdLabel === "BULL")             penalty += 25;
  if (s.candleColorAtEntry === "GREEN")  penalty += 20;

  const spread = s.spreadPct ?? 0;
  if (spread > 0.08)       penalty += 25;
  else if (spread > 0.05)  penalty += 15;

  if (btcDir === "UP")                          penalty += 15;
  if (s.vwapContextLabel === "VWAP_RECLAIM")    penalty += 15;
  if (s.entryTimingGrade === "F")               penalty += 15;
  if (s.isBlindWeaknessShort === true)          penalty += 15;
  if (s.isBtcBounceTrapRisk === true)           penalty += 15;
  if (s.isCorpseChaseRisk === true)             penalty += 15;

  if (
    isGainerSide(s) && (
      s.hasGainerContinuationDanger === true ||
      (s.topGainerContinuationDangerScore ?? 0) > 20 ||
      s.topGainerContinuationPressureLabel === "GAINER_CONTINUATION_EXTREME"
    )
  ) penalty += 20;

  return clamp(penalty, 0, 50);
}

// ── Score classification ─────────────────────────────────────────────────────

export function classifyAbsoluteEntryTier(score, hardBlocks = []) {
  if (hardBlocks.length > 0) return "BLOCKED";
  if (score >= 95) return "GOD_TIER_SNIPER";
  if (score >= 90) return "SUPER_SNIPER";
  if (score >= 85) return "SNIPER";
  if (score >= 75) return "HIGH_QUALITY";
  if (score >= 65) return "CONDITIONAL";
  if (score >= 50) return "WEAK";
  return "REJECT";
}

function classifyAbsoluteEntryGrade(score, hardBlocks = []) {
  if (hardBlocks.length > 0) return "F";
  if (score >= 95) return "S+";
  if (score >= 90) return "S";
  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function classifyAbsoluteEntryTrustLabel(tier) {
  const map = {
    GOD_TIER_SNIPER: "MAXIMUM_TRUST",
    SUPER_SNIPER:    "HIGH_TRUST",
    SNIPER:          "TRUSTED",
    HIGH_QUALITY:    "CONDITIONAL_TRUST",
    CONDITIONAL:     "LOW_TRUST",
    WEAK:            "VERY_LOW_TRUST",
    BLOCKED:         "BLOCKED",
    REJECT:          "NO_TRUST",
  };
  return map[tier] ?? "NO_TRUST";
}

function classifyAbsoluteEntryAction(score, hardBlocks = []) {
  if (hardBlocks.length > 0 || score < 75) return "OBSERVE_ONLY";
  if (score < 85)  return "SMALL_TEST_ONLY";
  if (score < 90)  return "SNIPER_ELIGIBLE";
  if (score < 95)  return "SUPER_SNIPER_ELIGIBLE";
  return "GOD_TIER_ELIGIBLE";
}

function classifyRecommendedMaxOpenMode(score, hardBlocks = []) {
  if (hardBlocks.length > 0 || score < 85) return "NO_OPEN_RECOMMENDED";
  return "MAX_1_RECOMMENDED";
}

function classifyRecommendedLeverageMode(score, hardBlocks = []) {
  if (hardBlocks.length > 0) return "NO_LEVERAGE";
  if (score >= 95) return "3X_NORMAL_5X_TEST_ONLY";
  if (score >= 90) return "3X_NORMAL";
  if (score >= 85) return "2X_OR_3X";
  return "NO_LEVERAGE_RECOMMENDED";
}

// ── Universal gate pass ───────────────────────────────────────────────────────

function computeIsUniversalShortGatePass(s) {
  const hasRed  = s.hasRedConfirmation === true || s.immediateRedImpulse === true || s.redImpulseDetected === true;
  const noGreen = s.immediateGreenImpulse !== true && s.greenImpulseDetected !== true;
  const atrOk   = (s.atrPct ?? 0) >= 0.6;
  const cvdOk   = s.cvdLabel === "BEAR" || s.cvdLabel === "NEUT";
  const notBad  = s.entryTimingGrade !== "F" && s.isInvalidMarket !== true && s.isStale !== true;
  return hasRed && noGreen && atrOk && cvdOk && notBad;
}

// ── Sniper label classification ───────────────────────────────────────────────

export function classifySniperLabels(s, absoluteScoreResult) {
  const score      = absoluteScoreResult?.absoluteEntryScore ?? 0;
  const hardBlocks = absoluteScoreResult?.absoluteEntryHardBlocks ?? [];
  const blocked    = hardBlocks.length > 0;

  const isUniversalGatePass = computeIsUniversalShortGatePass(s);
  const btcDir  = deriveBtcRunDirection(s);
  const spread  = s.spreadPct ?? null;
  const atr     = s.atrPct ?? 0;
  const macd    = s.macdHistogramState1m ?? "";

  const reasons  = [];
  const warnings = [];
  const rejected = [];

  if (isUniversalGatePass) reasons.push("UNIVERSAL_SHORT_GATE_PASS");

  let loserSniperLabel  = null;
  let gainerSniperLabel = null;

  // ── Loser sniper ────────────────────────────────────────────────────────────
  if (isLoserSide(s)) {
    const hasRed    = s.hasRedConfirmation === true || s.immediateRedImpulse === true || s.redImpulseDetected === true;
    const cvdOk     = s.cvdLabel === "BEAR" || s.cvdLabel === "NEUT";
    const atrOk     = atr >= 0.6;
    const spreadOk  = spread == null || spread <= 0.05;
    const btcNotUp  = btcDir !== "UP";
    const noBlind   = s.isBlindWeaknessShort !== true;
    const noBtcTrap = s.isBtcBounceTrapRisk !== true;
    const noCorpse  = s.isCorpseChaseRisk !== true;
    const gatePass  = s.shortGateWouldPass === true;

    if (!blocked && isUniversalGatePass && gatePass && hasRed && cvdOk && atrOk && spreadOk && btcNotUp && noBlind && noBtcTrap && noCorpse && score >= 85) {
      loserSniperLabel = "LOSER_SNIPER_CLEAN_RED_DUMP";
      reasons.push("LOSER_SNIPER_CLEAN_RED_DUMP");

      // Upgrade to super sniper
      if (
        s.cvdLabel === "BEAR" &&
        (atr >= 1.0 || score >= 90) &&
        spreadOk &&
        (macd.includes("NEGATIVE_EXPANDING") || s.hasRsiRollover === true || btcDir === "DOWN") &&
        score >= 90
      ) {
        loserSniperLabel = "LOSER_SUPER_SNIPER_BEAR_CVD_ATR";
        reasons.push("LOSER_SUPER_SNIPER_BEAR_CVD_ATR");
      }
    } else if (!blocked) {
      if (!isUniversalGatePass) rejected.push("UNIVERSAL_GATE_FAIL");
      if (!gatePass)   rejected.push("SHORT_GATE_FAIL");
      if (!hasRed)     rejected.push("NO_RED_CONFIRMATION");
      if (!cvdOk)      rejected.push("CVD_NOT_OK");
      if (!atrOk)      rejected.push("ATR_TOO_LOW");
      if (!spreadOk)   rejected.push("SPREAD_TOO_WIDE");
      if (!btcNotUp)   rejected.push("BTC_UP");
      if (!noBlind)    rejected.push("BLIND_WEAKNESS_SHORT");
      if (!noBtcTrap)  rejected.push("BTC_BOUNCE_TRAP");
      if (!noCorpse)   rejected.push("CORPSE_CHASE");
      if (score < 85)  rejected.push("SCORE_BELOW_85");
    }
  }

  // ── Gainer sniper ───────────────────────────────────────────────────────────
  if (isGainerSide(s)) {
    const eq            = s.topGainerExhaustionQualityScore ?? 0;
    const eqOk          = eq >= 120;
    const auditPass     = s.topGainerWouldPassExhaustionAudit === true || s.hasGainerExhaustionConfirmation === true;
    const hasRejection  = s.hasGainerRedRejection === true || s.hasGainerFailedBreakout === true;
    const cvdNotBull    = s.cvdLabel !== "BULL";
    const noContinuation = s.hasGainerContinuationDanger !== true;
    const dangerScoreOk  = (s.topGainerContinuationDangerScore ?? 0) <= 35;

    if (!blocked && isUniversalGatePass && eqOk && auditPass && hasRejection && cvdNotBull && noContinuation && dangerScoreOk && score >= 85) {
      gainerSniperLabel = "GAINER_SNIPER_CONFIRMED_EXHAUSTION_BREAKDOWN";
      reasons.push("GAINER_SNIPER_CONFIRMED_EXHAUSTION_BREAKDOWN");

      // Upgrade to super sniper
      const hasFailedBreakout = s.hasGainerFailedBreakout === true || s.topGainerThesisLaneLabel === "TOP_GAINER_FAILED_BREAKOUT_SHORT";
      const notHot = s.topGainerPumpPhaseLabel !== "GAINER_PUMP_STILL_HOT";

      if (hasFailedBreakout && eq >= 120 && notHot && cvdNotBull && score >= 90) {
        gainerSniperLabel = "GAINER_SUPER_SNIPER_FAILED_BREAKOUT_EXHAUSTION";
        reasons.push("GAINER_SUPER_SNIPER_FAILED_BREAKOUT_EXHAUSTION");
      }
    } else if (!blocked) {
      if (!isUniversalGatePass) rejected.push("UNIVERSAL_GATE_FAIL");
      if (!eqOk)           rejected.push("EXHAUSTION_QUALITY_TOO_LOW");
      if (!auditPass)      rejected.push("EXHAUSTION_AUDIT_FAIL");
      if (!hasRejection)   rejected.push("NO_REJECTION");
      if (!cvdNotBull)     rejected.push("CVD_BULL");
      if (!noContinuation) rejected.push("CONTINUATION_DANGER");
      if (!dangerScoreOk)  rejected.push("DANGER_SCORE_TOO_HIGH");
      if (score < 85)      rejected.push("SCORE_BELOW_85");
    }
  }

  // ── 10% candidate (loser only) ──────────────────────────────────────────────
  let tenPctCandidateLabel = null;
  if (
    !blocked &&
    isLoserSide(s) &&
    s.cvdLabel === "BEAR" &&
    (s.immediateRedImpulse === true || s.redImpulseDetected === true) &&
    s.immediateGreenImpulse !== true &&
    s.greenImpulseDetected !== true &&
    (s.atrPct ?? 0) >= 0.6 &&
    (spread == null || spread <= 0.05) &&
    s.shortGateWouldPass === true &&
    score >= 90
  ) {
    tenPctCandidateLabel = "HIGH_QUALITY_10PCT_CANDIDATE";
  }

  // ── Collect warnings from existing telemetry ─────────────────────────────────
  const gainerWarnings = s.topGainerQualityWarningLabels ?? [];
  for (const w of gainerWarnings) {
    if (w.includes("DANGER") || w.includes("RISK")) warnings.push(w);
  }
  const entryWarnings = s.entryQualityWarningLabels ?? [];
  for (const w of entryWarnings.slice(0, 3)) warnings.push(w);

  const sniperLabel = loserSniperLabel ?? gainerSniperLabel ?? null;

  let sniperTier = null;
  if (
    sniperLabel === "LOSER_SUPER_SNIPER_BEAR_CVD_ATR" ||
    sniperLabel === "GAINER_SUPER_SNIPER_FAILED_BREAKOUT_EXHAUSTION"
  ) {
    sniperTier = "SUPER_SNIPER";
  } else if (sniperLabel != null) {
    sniperTier = "SNIPER";
  }

  return {
    isUniversalShortGatePass: isUniversalGatePass,
    sniperLabel,
    sniperTier,
    sniperReasons:         [...new Set(reasons)],
    sniperWarnings:        [...new Set(warnings)],
    sniperRejectedReasons: [...new Set(rejected)],
    loserSniperLabel,
    gainerSniperLabel,
    tenPctCandidateLabel,
    isSniperCandidate:      sniperLabel != null && !blocked,
    isSuperSniperCandidate: sniperTier === "SUPER_SNIPER" && !blocked,
  };
}

// ── Sniper trust score ────────────────────────────────────────────────────────

function computeSniperTrustScore(s, score, sniperResult) {
  let trust = score;

  if (isLoserSide(s) && s.cvdLabel === "BEAR") trust += 5;
  if ((s.spreadPct ?? 1) <= 0.03) trust += 5;
  if (
    (typeof s.exitProfileInitialBias === "string" && s.exitProfileInitialBias.includes("RUNNER")) ||
    s.runnerProfileActivated === true
  ) trust += 5;

  if ((sniperResult.sniperWarnings?.length ?? 0) > 0) trust -= 10;
  if (isGainerSide(s) && (s.topGainerContinuationDangerScore ?? 0) > 20) trust -= 15;

  return clamp(trust, 0, 100);
}

// ── Recommended exit bias ─────────────────────────────────────────────────────

function computeRecommendedExitBias(sniperResult) {
  switch (sniperResult.loserSniperLabel ?? sniperResult.gainerSniperLabel) {
    case "LOSER_SNIPER_CLEAN_RED_DUMP":                    return "RUNNER_CANDIDATE";
    case "LOSER_SUPER_SNIPER_BEAR_CVD_ATR":               return "STRONG_RUNNER_CANDIDATE";
    case "GAINER_SNIPER_CONFIRMED_EXHAUSTION_BREAKDOWN":   return "FAST_OR_NORMAL_WITH_RUNNER_UPGRADE";
    case "GAINER_SUPER_SNIPER_FAILED_BREAKOUT_EXHAUSTION": return "RUNNER_CANDIDATE_TIGHT_DANGER_DOWNGRADE";
    default: return null;
  }
}

function computeInitialExitBias(sniperResult) {
  switch (sniperResult.loserSniperLabel ?? sniperResult.gainerSniperLabel) {
    case "LOSER_SNIPER_CLEAN_RED_DUMP":                    return "LOSER_RUNNER_CANDIDATE";
    case "LOSER_SUPER_SNIPER_BEAR_CVD_ATR":               return "LOSER_STRONG_RUNNER_CANDIDATE";
    case "GAINER_SNIPER_CONFIRMED_EXHAUSTION_BREAKDOWN":   return "GAINER_FAST_PROTECT_THEN_RUNNER_IF_EXPANDS";
    case "GAINER_SUPER_SNIPER_FAILED_BREAKOUT_EXHAUSTION": return "GAINER_RUNNER_CANDIDATE_BUT_TIGHT_DANGER_DOWNGRADE";
    default: return null;
  }
}

// ── Reason/boost/penalty annotation lists ────────────────────────────────────

function buildAnnotations(s, dangerPenaltyScore) {
  const reasons        = [];
  const boosts         = [];
  const penaltyReasons = [];
  const warnings       = [];

  if (s.hasRedConfirmation === true)                              reasons.push("RED_CONFIRMATION");
  if (s.immediateRedImpulse === true)                            boosts.push("IMMEDIATE_RED_IMPULSE");
  if (s.redImpulseDetected === true)                             boosts.push("RED_IMPULSE_DETECTED");
  if (s.candleColorAtEntry === "RED")                            boosts.push("RED_CANDLE");
  if (s.immediateGreenImpulse !== true && s.greenImpulseDetected !== true) boosts.push("NO_GREEN_IMPULSE");

  if (s.cvdLabel === "BEAR")          boosts.push("CVD_BEAR");
  else if (s.cvdLabel === "NEUT")     boosts.push("CVD_NEUT");

  const atr = s.atrPct ?? 0;
  if (atr >= 1.0)     boosts.push("ATR_ABOVE_1");
  else if (atr >= 0.6) boosts.push("ATR_ABOVE_0_6");

  if (s.shortGateWouldPass === true)                             boosts.push("SHORT_GATE_PASS");
  if (s.microMomentumLabel === "MICRO_MULTI_CONFIRM")            boosts.push("MICRO_MULTI_CONFIRM");
  if ((s.spreadPct ?? 1) <= 0.03)                               boosts.push("TIGHT_SPREAD");
  if (s.hasRsiRollover === true)                                 boosts.push("RSI_ROLLOVER");

  if (s.cvdLabel === "BULL")            penaltyReasons.push("CVD_BULL");
  if (s.immediateGreenImpulse === true)  penaltyReasons.push("IMMEDIATE_GREEN_IMPULSE");
  if (s.greenImpulseDetected === true)   penaltyReasons.push("GREEN_IMPULSE_DETECTED");
  if (s.candleColorAtEntry === "GREEN")  penaltyReasons.push("GREEN_CANDLE");
  if (s.isBlindWeaknessShort === true)   penaltyReasons.push("BLIND_WEAKNESS_SHORT");
  if (s.isBtcBounceTrapRisk === true)    penaltyReasons.push("BTC_BOUNCE_TRAP_RISK");
  if (s.isCorpseChaseRisk === true)      penaltyReasons.push("CORPSE_CHASE_RISK");
  if ((s.spreadPct ?? 0) > 0.05)        penaltyReasons.push("WIDE_SPREAD");

  if (dangerPenaltyScore >= 30)
    warnings.push("HIGH_DANGER_PENALTY");
  if (isGainerSide(s) && (s.topGainerContinuationDangerScore ?? 0) > 20)
    warnings.push("GAINER_CONTINUATION_RISK");
  if ((s.spreadPct ?? 0) > 0.05 && (s.spreadPct ?? 0) <= 0.08)
    warnings.push("ELEVATED_SPREAD");

  return { reasons, boosts, penaltyReasons, warnings };
}

// ── Main compute ──────────────────────────────────────────────────────────────

export function computeAbsoluteEntryScore(s) {
  const hardBlocks = computeHardBlocks(s);

  const universalCoreScore    = computeUniversalCoreScore(s);
  const momentumQualityScore  = computeMomentumQualityScore(s);
  const executionQualityScore = computeExecutionQualityScore(s);
  const btcContextScore       = computeBtcContextScore(s);
  const loserQualityScore     = computeLoserQualityScore(s);
  const gainerQualityScore    = computeGainerQualityScore(s);
  const dangerPenaltyScore    = computeDangerPenaltyScore(s);

  const sideScore = isLoserSide(s)
    ? loserQualityScore
    : isGainerSide(s)
      ? gainerQualityScore
      : 0;

  const base     = universalCoreScore + momentumQualityScore + executionQualityScore + btcContextScore;
  const rawScore = base + sideScore - dangerPenaltyScore;

  let absoluteEntryScore = clamp(rawScore, 0, 100);
  if (hardBlocks.length > 0) {
    absoluteEntryScore = Math.min(absoluteEntryScore, 49);
  }

  const absoluteEntryTier        = classifyAbsoluteEntryTier(absoluteEntryScore, hardBlocks);
  const absoluteEntryGrade       = classifyAbsoluteEntryGrade(absoluteEntryScore, hardBlocks);
  const absoluteEntryTrustLabel  = classifyAbsoluteEntryTrustLabel(absoluteEntryTier);
  const absoluteEntryAction      = classifyAbsoluteEntryAction(absoluteEntryScore, hardBlocks);
  const recommendedMaxOpenMode   = classifyRecommendedMaxOpenMode(absoluteEntryScore, hardBlocks);
  const recommendedLeverageMode  = classifyRecommendedLeverageMode(absoluteEntryScore, hardBlocks);

  const isUniversalShortGatePass = computeIsUniversalShortGatePass(s);
  const isHighQualityEntry       = absoluteEntryScore >= 75 && hardBlocks.length === 0;

  // Sniper labels need the score computed first
  const tmpResult    = { absoluteEntryScore, absoluteEntryHardBlocks: hardBlocks };
  const sniperResult = classifySniperLabels(s, tmpResult);

  const isSniperCandidate      = sniperResult.isSniperCandidate;
  const isSuperSniperCandidate = sniperResult.isSuperSniperCandidate;

  const sniperTrustScore    = computeSniperTrustScore(s, absoluteEntryScore, sniperResult);
  const recommendedExitBias = computeRecommendedExitBias(sniperResult);
  const initialExitBias     = computeInitialExitBias(sniperResult);

  const { reasons, boosts, penaltyReasons, warnings } = buildAnnotations(s, dangerPenaltyScore);

  return {
    absoluteEntryScore,
    absoluteEntryGrade,
    absoluteEntryTier,
    absoluteEntryTrustLabel,
    absoluteEntryAction,
    absoluteEntryHardBlocks:    hardBlocks,
    absoluteEntryWarnings:      warnings,
    absoluteEntryReasons:       reasons,
    absoluteEntryBoosts:        boosts,
    absoluteEntryPenaltyReasons: penaltyReasons,

    universalCoreScore,
    loserQualityScore,
    gainerQualityScore,
    momentumQualityScore,
    flowQualityScore: 0,
    btcContextScore,
    executionQualityScore,
    dangerPenaltyScore,

    isUniversalShortGatePass,
    isHighQualityEntry,
    isSniperCandidate,
    isSuperSniperCandidate,

    sniperLabel:           sniperResult.sniperLabel,
    sniperTier:            sniperResult.sniperTier,
    sniperTrustScore,
    sniperReasons:         sniperResult.sniperReasons,
    sniperWarnings:        sniperResult.sniperWarnings,
    sniperRejectedReasons: sniperResult.sniperRejectedReasons,

    loserSniperLabel:    sniperResult.loserSniperLabel,
    gainerSniperLabel:   sniperResult.gainerSniperLabel,
    tenPctCandidateLabel: sniperResult.tenPctCandidateLabel ?? null,

    recommendedMaxOpenMode,
    recommendedLeverageMode,
    recommendedExitBias,
    initialExitBias,
  };
}

// ── Flatten for spread onto sample object ────────────────────────────────────

export function flattenAbsoluteEntryScore(result) {
  return {
    absoluteEntryScoreResult:    result,
    absoluteEntryScore:          result.absoluteEntryScore,
    absoluteEntryGrade:          result.absoluteEntryGrade,
    absoluteEntryTier:           result.absoluteEntryTier,
    absoluteEntryTrustLabel:     result.absoluteEntryTrustLabel,
    absoluteEntryAction:         result.absoluteEntryAction,
    absoluteEntryHardBlocks:     result.absoluteEntryHardBlocks,
    absoluteEntryWarnings:       result.absoluteEntryWarnings,
    absoluteEntryReasons:        result.absoluteEntryReasons,
    absoluteEntryBoosts:         result.absoluteEntryBoosts,
    absoluteEntryPenaltyReasons: result.absoluteEntryPenaltyReasons,
    universalCoreScore:          result.universalCoreScore,
    loserQualityScore:           result.loserQualityScore,
    gainerQualityScore:          result.gainerQualityScore,
    momentumQualityScore:        result.momentumQualityScore,
    flowQualityScore:            result.flowQualityScore,
    btcContextScore:             result.btcContextScore,
    executionQualityScore:       result.executionQualityScore,
    dangerPenaltyScore:          result.dangerPenaltyScore,
    isUniversalShortGatePass:    result.isUniversalShortGatePass,
    isHighQualityEntry:          result.isHighQualityEntry,
    isSniperCandidate:           result.isSniperCandidate,
    isSuperSniperCandidate:      result.isSuperSniperCandidate,
    sniperLabel:                 result.sniperLabel,
    sniperTier:                  result.sniperTier,
    sniperTrustScore:            result.sniperTrustScore,
    sniperReasons:               result.sniperReasons,
    sniperWarnings:              result.sniperWarnings,
    sniperRejectedReasons:       result.sniperRejectedReasons,
    loserSniperLabel:            result.loserSniperLabel,
    gainerSniperLabel:           result.gainerSniperLabel,
    tenPctCandidateLabel:        result.tenPctCandidateLabel,
    recommendedMaxOpenMode:      result.recommendedMaxOpenMode,
    recommendedLeverageMode:     result.recommendedLeverageMode,
    recommendedExitBias:         result.recommendedExitBias,
    initialExitBias:             result.initialExitBias,
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
  return arr.map(x => String(x).replace(/[,|]/g, " ")).join("|");
}

export const ABSOLUTE_ENTRY_SCORE_CSV_HEADERS = [
  "absoluteEntryScore",
  "absoluteEntryGrade",
  "absoluteEntryTier",
  "absoluteEntryTrustLabel",
  "absoluteEntryAction",
  "absoluteEntryHardBlocks",
  "absoluteEntryWarnings",
  "absoluteEntryReasons",
  "absoluteEntryBoosts",
  "absoluteEntryPenaltyReasons",
  "universalCoreScore",
  "loserQualityScore",
  "gainerQualityScore",
  "momentumQualityScore",
  "flowQualityScore",
  "btcContextScore",
  "executionQualityScore",
  "dangerPenaltyScore",
  "isUniversalShortGatePass",
  "isHighQualityEntry",
  "isSniperCandidate",
  "isSuperSniperCandidate",
  "sniperLabel",
  "sniperTier",
  "sniperTrustScore",
  "sniperReasons",
  "sniperWarnings",
  "sniperRejectedReasons",
  "loserSniperLabel",
  "gainerSniperLabel",
  "tenPctCandidateLabel",
  "recommendedMaxOpenMode",
  "recommendedLeverageMode",
  "recommendedExitBias",
  "initialExitBias",
];

export function absoluteEntryScoreCSVRow(s) {
  if (s.absoluteEntryScore == null) {
    return ABSOLUTE_ENTRY_SCORE_CSV_HEADERS.map(() => "");
  }
  return [
    csvCell(s.absoluteEntryScore),
    csvCell(s.absoluteEntryGrade ?? ""),
    csvCell(s.absoluteEntryTier ?? ""),
    csvCell(s.absoluteEntryTrustLabel ?? ""),
    csvCell(s.absoluteEntryAction ?? ""),
    csvCell(csvArr(s.absoluteEntryHardBlocks)),
    csvCell(csvArr(s.absoluteEntryWarnings)),
    csvCell(csvArr(s.absoluteEntryReasons)),
    csvCell(csvArr(s.absoluteEntryBoosts)),
    csvCell(csvArr(s.absoluteEntryPenaltyReasons)),
    csvCell(s.universalCoreScore ?? ""),
    csvCell(s.loserQualityScore ?? ""),
    csvCell(s.gainerQualityScore ?? ""),
    csvCell(s.momentumQualityScore ?? ""),
    csvCell(s.flowQualityScore ?? ""),
    csvCell(s.btcContextScore ?? ""),
    csvCell(s.executionQualityScore ?? ""),
    csvCell(s.dangerPenaltyScore ?? ""),
    csvCell(s.isUniversalShortGatePass ?? ""),
    csvCell(s.isHighQualityEntry ?? ""),
    csvCell(s.isSniperCandidate ?? ""),
    csvCell(s.isSuperSniperCandidate ?? ""),
    csvCell(s.sniperLabel ?? ""),
    csvCell(s.sniperTier ?? ""),
    csvCell(s.sniperTrustScore ?? ""),
    csvCell(csvArr(s.sniperReasons)),
    csvCell(csvArr(s.sniperWarnings)),
    csvCell(csvArr(s.sniperRejectedReasons)),
    csvCell(s.loserSniperLabel ?? ""),
    csvCell(s.gainerSniperLabel ?? ""),
    csvCell(s.tenPctCandidateLabel ?? ""),
    csvCell(s.recommendedMaxOpenMode ?? ""),
    csvCell(s.recommendedLeverageMode ?? ""),
    csvCell(s.recommendedExitBias ?? ""),
    csvCell(s.initialExitBias ?? ""),
  ];
}
