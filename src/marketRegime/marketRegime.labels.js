import { MARKET_REGIME_CONFIG } from "./marketRegime.config.js";

const { thresholds } = MARKET_REGIME_CONFIG;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Direction ──────────────────────────────────────────────────────────────────

export function classifyDirectionScore(score) {
  if (score == null || !Number.isFinite(score)) return "UNKNOWN";
  if (score >= thresholds.directionStrong)   return "STRONG_UP";
  if (score >= thresholds.directionWeak)     return "UP";
  if (score > -thresholds.directionWeak)     return "FLAT";
  if (score > -thresholds.directionStrong)   return "DOWN";
  return "STRONG_DOWN";
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export function classifyTrendState({
  structuralDirectionScore,
  tacticalDirectionScore,
  adx14,
  emaStack,
  dmiBias,
}) {
  const structDir = classifyDirectionScore(structuralDirectionScore);
  const tactDir   = classifyDirectionScore(tacticalDirectionScore);
  const adx       = adx14 ?? 0;
  const stack     = emaStack ?? "UNKNOWN";
  const dmi       = dmiBias ?? "UNKNOWN";

  const bullishStack = stack === "BULLISH_STACK" || stack === "BULLISH";
  const bearishStack = stack === "BEARISH_STACK" || stack === "BEARISH";
  const bullDmi = dmi === "BULLISH_DMI";
  const bearDmi = dmi === "BEARISH_DMI";

  if (
    (structDir === "STRONG_DOWN" || structDir === "DOWN") &&
    (tactDir === "STRONG_DOWN" || tactDir === "DOWN") &&
    adx >= thresholds.adxVeryStrong && bearishStack && bearDmi
  ) return "STRONG_BEAR_TREND";

  if (
    (structDir === "STRONG_DOWN" || structDir === "DOWN") &&
    (tactDir === "STRONG_DOWN" || tactDir === "DOWN") &&
    adx >= thresholds.adxStrongTrend && bearishStack
  ) return "BEAR_TREND";

  if (
    (structDir === "DOWN" || structDir === "STRONG_DOWN") &&
    adx >= thresholds.adxTrend
  ) return "WEAK_BEAR_TREND";

  if (
    (structDir === "STRONG_UP" || structDir === "UP") &&
    (tactDir === "STRONG_UP" || tactDir === "UP") &&
    adx >= thresholds.adxVeryStrong && bullishStack && bullDmi
  ) return "STRONG_BULL_TREND";

  if (
    (structDir === "STRONG_UP" || structDir === "UP") &&
    (tactDir === "STRONG_UP" || tactDir === "UP") &&
    adx >= thresholds.adxStrongTrend && bullishStack
  ) return "BULL_TREND";

  if (
    (structDir === "UP" || structDir === "STRONG_UP") &&
    adx >= thresholds.adxTrend
  ) return "WEAK_BULL_TREND";

  if (structDir === "UNKNOWN" || tactDir === "UNKNOWN") return "UNKNOWN";
  return "NO_TREND";
}

// ── Momentum ──────────────────────────────────────────────────────────────────

export function classifyMomentumPhase({
  microDirectionScore,
  prevMicroDirectionScore,
  macdHistogramState,
  macdHistogramDelta,
  structuralDirectionScore,
  tacticalDirectionScore,
}) {
  const micro    = microDirectionScore ?? 0;
  const prevMicro = prevMicroDirectionScore ?? micro;
  const structural = structuralDirectionScore ?? 0;
  const tactical   = tacticalDirectionScore ?? 0;
  const macdState  = macdHistogramState ?? "UNKNOWN";
  const macdDelta  = macdHistogramDelta ?? 0;

  const microRising  = micro > prevMicro + 5;
  const microFalling = micro < prevMicro - 5;

  const structuralBear = structural < -thresholds.directionWeak;
  const structuralBull = structural > thresholds.directionWeak;

  if (structuralBear && micro > thresholds.directionWeak) {
    return "BULLISH_REVERSAL_ATTEMPT";
  }
  if (structuralBull && micro < -thresholds.directionWeak) {
    return "BEARISH_REVERSAL_ATTEMPT";
  }

  const macroExpanding = macdState === "NEGATIVE_EXPANDING";
  const macroShrinking = macdState === "NEGATIVE_SHRINKING";
  const macroBullExpand = macdState === "POSITIVE_EXPANDING";
  const macroBullShrink = macdState === "POSITIVE_SHRINKING";

  if ((micro < -thresholds.directionWeak || structural < -thresholds.directionWeak) && microFalling && macroExpanding) {
    return "ACCELERATING_DOWN";
  }
  if (micro < -thresholds.directionWeak && microRising && macroShrinking) {
    return "DECELERATING_DOWN";
  }
  if ((micro > thresholds.directionWeak || structural > thresholds.directionWeak) && microRising && macroBullExpand) {
    return "ACCELERATING_UP";
  }
  if (micro > thresholds.directionWeak && microFalling && macroBullShrink) {
    return "DECELERATING_UP";
  }

  const bullConflict = structural < -thresholds.directionWeak && micro > thresholds.directionWeak;
  const bearConflict = structural > thresholds.directionWeak && micro < -thresholds.directionWeak;
  if (bullConflict || bearConflict) return "MOMENTUM_CONFLICT";

  if (Math.abs(micro) < thresholds.directionWeak && Math.abs(tactical) < thresholds.directionWeak) {
    return "MOMENTUM_FLAT";
  }

  return "UNKNOWN";
}

// ── Volatility ─────────────────────────────────────────────────────────────────

export function classifyVolatilityState({ atrPct, atrRatioToMedian }) {
  if (atrPct == null) return "UNKNOWN";

  const ratio = atrRatioToMedian ?? 1;
  const cfg = MARKET_REGIME_CONFIG.thresholds;

  if (ratio >= cfg.volatilityExpansionRatio * 1.5 || atrPct > 3) return "VOLATILITY_EXTREME";
  if (ratio >= cfg.volatilityExpansionRatio)  return "VOLATILITY_EXPANDING";
  if (ratio <= cfg.volatilityCompressionRatio) return "VOLATILITY_COMPRESSED";
  return "VOLATILITY_NORMAL";
}

// ── Location ──────────────────────────────────────────────────────────────────

export function classifyLocationState({ priceVsVwapPct, ema9, ema20, ema50, price }) {
  if (price == null) return "UNKNOWN";

  const vwapLbl =
    priceVsVwapPct == null                                    ? "UNKNOWN"
    : priceVsVwapPct > MARKET_REGIME_CONFIG.thresholds.vwapFlatPct * 100  ? "ABOVE_VWAP"
    : priceVsVwapPct < -MARKET_REGIME_CONFIG.thresholds.vwapFlatPct * 100 ? "BELOW_VWAP"
    : "AT_VWAP";

  let emaLbl = "UNKNOWN";
  if (ema9 != null && ema20 != null && ema50 != null) {
    if (price > ema9 && price > ema50) {
      emaLbl = price > ema9 * 1.02 ? "EXTENDED_ABOVE" : "ABOVE_EMA_STACK";
    } else if (price < ema9 && price < ema50) {
      emaLbl = price < ema9 * 0.98 ? "EXTENDED_BELOW" : "BELOW_EMA_STACK";
    } else {
      emaLbl = "BETWEEN_EMAS";
    }
  }

  return `${vwapLbl}__${emaLbl}`;
}

// ── Regime ────────────────────────────────────────────────────────────────────

export function classifyRegime({
  structuralDirectionScore,
  tacticalDirectionScore,
  microDirectionScore,
  trendState,
  adx14,
  emaStack,
  rangeEfficiency,
  validTimeframeCount,
}) {
  // Insufficient data — no regime can be determined
  if (
    (validTimeframeCount != null && validTimeframeCount === 0) ||
    (structuralDirectionScore == null && tacticalDirectionScore == null && microDirectionScore == null)
  ) return "UNKNOWN";

  const struct = structuralDirectionScore ?? 0;
  const tactic = tacticalDirectionScore ?? 0;
  const micro  = microDirectionScore ?? 0;
  const adx    = adx14 ?? 0;
  const trend  = trendState ?? "UNKNOWN";
  const eff    = rangeEfficiency ?? 0.5;

  const structDir = classifyDirectionScore(struct);
  const tacDir    = classifyDirectionScore(tactic);
  const microDir  = classifyDirectionScore(micro);

  // Strong trend conditions
  if (trend === "STRONG_BEAR_TREND" || trend === "BEAR_TREND") {
    if (microDir === "UP" || microDir === "STRONG_UP") return "BOUNCE_IN_DOWNTREND";
    return "TRENDING_DOWN";
  }
  if (trend === "STRONG_BULL_TREND" || trend === "BULL_TREND") {
    if (microDir === "DOWN" || microDir === "STRONG_DOWN") return "PULLBACK_IN_UPTREND";
    return "TRENDING_UP";
  }

  // Weak trend
  if (trend === "WEAK_BEAR_TREND") {
    if (microDir === "UP" || microDir === "STRONG_UP") return "BOUNCE_IN_DOWNTREND";
    if (struct < -thresholds.directionStrong && tactic < -thresholds.directionWeak) return "TRENDING_DOWN";
    return "TRANSITION_DOWN";
  }
  if (trend === "WEAK_BULL_TREND") {
    if (microDir === "DOWN" || microDir === "STRONG_DOWN") return "PULLBACK_IN_UPTREND";
    if (struct > thresholds.directionStrong && tactic > thresholds.directionWeak) return "TRENDING_UP";
    return "TRANSITION_UP";
  }

  // Breakout / Breakdown (transition into trend)
  if (adx >= thresholds.adxTrend && micro < -thresholds.directionStrong && struct > thresholds.directionWeak) {
    return "BREAKDOWN_DOWN";
  }
  if (adx >= thresholds.adxTrend && micro > thresholds.directionStrong && struct < -thresholds.directionWeak) {
    return "BREAKOUT_UP";
  }

  // Range / Chop
  if (adx < thresholds.adxTrend) {
    if (eff <= MARKET_REGIME_CONFIG.thresholds.chopEfficiencyMax) return "CHOPPY";
    return "RANGING";
  }

  // Extreme volatility both ways
  if (Math.abs(struct) < thresholds.directionWeak && adx >= thresholds.adxStrongTrend) {
    return "VOLATILE_TWO_WAY";
  }

  // Directional transition
  if (struct < -thresholds.directionWeak) return "TRANSITION_DOWN";
  if (struct > thresholds.directionWeak) return "TRANSITION_UP";

  return "UNKNOWN";
}

// ── Cross-market alignment ─────────────────────────────────────────────────────

export function classifyBtcEthAlignment({ btcStructural, ethStructural, btcTactical, ethTactical }) {
  const btcDir = classifyDirectionScore(btcStructural ?? 0);
  const ethDir = classifyDirectionScore(ethStructural ?? 0);
  const btcTac = classifyDirectionScore(btcTactical ?? 0);
  const ethTac = classifyDirectionScore(ethTactical ?? 0);

  const btcBear = btcDir === "DOWN" || btcDir === "STRONG_DOWN";
  const btcBull = btcDir === "UP" || btcDir === "STRONG_UP";
  const ethBear = ethDir === "DOWN" || ethDir === "STRONG_DOWN";
  const ethBull = ethDir === "UP" || ethDir === "STRONG_UP";

  if (btcDir === "UNKNOWN" || ethDir === "UNKNOWN") return "BTC_ETH_STALE";

  if (btcDir === "STRONG_DOWN" && ethDir === "STRONG_DOWN") return "BTC_ETH_STRONG_BEARISH_ALIGNMENT";
  if (btcBear && ethBear) return "BTC_ETH_BEARISH_ALIGNMENT";

  if (btcDir === "STRONG_UP" && ethDir === "STRONG_UP") return "BTC_ETH_STRONG_BULLISH_ALIGNMENT";
  if (btcBull && ethBull) return "BTC_ETH_BULLISH_ALIGNMENT";

  if (btcBear && ethBull) return "BTC_BEAR_ETH_BULL_DIVERGENCE";
  if (btcBull && ethBear) return "BTC_BULL_ETH_BEAR_DIVERGENCE";

  const bothFlat = btcDir === "FLAT" && ethDir === "FLAT";
  if (bothFlat) return "BTC_ETH_RANGE";

  return "BTC_ETH_MIXED";
}

// ── SHORT tailwind bias ────────────────────────────────────────────────────────

export function classifyShortBias(score) {
  if (score == null || !Number.isFinite(score)) return "SHORT_CONTEXT_STALE";
  if (score >= 65)  return "STRONG_SHORT_TAILWIND";
  if (score >= 35)  return "SHORT_TAILWIND";
  if (score >= 15)  return "SELECTIVE_SHORT";
  if (score > -15)  return "SHORT_NEUTRAL";
  if (score > -45)  return "SHORT_HEADWIND";
  return "STRONG_SHORT_HEADWIND";
}

// ── LONG tailwind bias ────────────────────────────────────────────────────────

export function classifyLongBias(score) {
  if (score == null || !Number.isFinite(score)) return "LONG_CONTEXT_STALE";
  if (score >= 65)  return "STRONG_LONG_TAILWIND";
  if (score >= 35)  return "LONG_TAILWIND";
  if (score >= 15)  return "SELECTIVE_LONG";
  if (score > -15)  return "LONG_NEUTRAL";
  if (score > -45)  return "LONG_HEADWIND";
  return "STRONG_LONG_HEADWIND";
}

// ── Breadth ───────────────────────────────────────────────────────────────────

export function classifyBreadthLabel(breadthDirectionScore) {
  if (breadthDirectionScore == null) return "BREADTH_STALE";
  if (breadthDirectionScore <= -60)  return "BREADTH_STRONGLY_BEARISH";
  if (breadthDirectionScore <= -25)  return "BREADTH_BEARISH";
  if (breadthDirectionScore < 25)    return "BREADTH_MIXED";
  if (breadthDirectionScore < 60)    return "BREADTH_BULLISH";
  return "BREADTH_STRONGLY_BULLISH";
}

// ── Freshness ─────────────────────────────────────────────────────────────────

export function classifyFreshness(ageMs) {
  if (ageMs == null || !Number.isFinite(ageMs)) return "HARD_STALE";
  if (ageMs < MARKET_REGIME_CONFIG.maxContextAgeMs) return "LIVE";
  if (ageMs < MARKET_REGIME_CONFIG.hardStaleAgeMs)  return "STALE";
  return "HARD_STALE";
}

export function computeConfidence({ coveragePct, freshnessLabel, validTimeframeCount }) {
  let score = 100;
  const cov = coveragePct ?? 0;
  if (cov < 0.5)  score -= 40;
  else if (cov < 0.75) score -= 20;
  else if (cov < 1.0)  score -= 5;

  if (freshnessLabel === "HARD_STALE")  score -= 50;
  else if (freshnessLabel === "STALE")  score -= 25;
  else if (freshnessLabel === "DEGRADED") score -= 10;

  const tf = validTimeframeCount ?? 0;
  if (tf < 3) score -= 20;
  else if (tf < 6) score -= 5;

  return clamp(score, 0, 100);
}
