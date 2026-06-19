// Adaptive AES — base Long AES + native long market-bias adjustment
// Session PnL never modifies AES. It only changes the required threshold.
import { ADAPTIVE_AES_VERSION, ADAPTIVE_AES_CONFIG } from "./adaptiveAes.config.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function computeAdaptiveAes({
  baseAes,
  side,
  marketContext,
  sessionHealth,
  config = ADAPTIVE_AES_CONFIG,
}) {
  if (config.mode === "SHADOW_ONLY" && config.allowExecutionImpact === true) {
    throw new Error("Adaptive AES: execution impact is forbidden in SHADOW_ONLY mode");
  }

  const contributions = [];
  const penalties     = [];

  const cross   = marketContext?.crossMarket;
  const breadth = marketContext?.breadth;
  const rawLongBias = cross?.crossMarketLongBiasLabel ?? marketContext?.longMarketContextLabel ?? "LONG_CONTEXT_STALE";
  const longBiasAliases = {
    LONG_CONTEXT_STRONG_TAILWIND: "STRONG_LONG_TAILWIND",
    LONG_CONTEXT_TAILWIND: "LONG_TAILWIND",
    LONG_CONTEXT_NEUTRAL: "LONG_NEUTRAL",
    LONG_CONTEXT_HEADWIND: "LONG_HEADWIND",
    LONG_CONTEXT_STRONG_HEADWIND: "STRONG_LONG_HEADWIND",
  };
  const longBias = longBiasAliases[rawLongBias] ?? rawLongBias;
  const alignment = cross?.btcEthAlignmentLabel ?? marketContext?.btcEthAlignmentLabel ?? "BTC_ETH_STALE";
  const breadthLabel = breadth?.breadthLabel ?? marketContext?.longMarketBreadthLabel ?? marketContext?.breadthLabel ?? "BREADTH_STALE";
  const isHardStale = marketContext?.stale === true || marketContext?.marketContextStale === true || longBias === "LONG_CONTEXT_STALE";

  let rawAdj = 0;

  // Hard stale overrides everything
  if (isHardStale) {
    return buildResult({
      baseAes, rawAdj: -15, side,
      contributions: [], penalties: [{ code: "HARD_STALE", points: -15 }],
      isHardStale: true, config, sessionHealth,
    });
  }

  // 1. Long bias adjustment (native — not inverted short)
  const biasAdj = config.longBiasAdjustments[longBias] ?? 0;
  if (biasAdj > 0) contributions.push({ code: `LONG_BIAS_${longBias}`, points: biasAdj });
  else if (biasAdj < 0) penalties.push({ code: `LONG_BIAS_${longBias}`, points: biasAdj });
  rawAdj += biasAdj;

  // 2. BTC/ETH alignment modifier (bullish alignment = long tailwind)
  const alignAdj = config.alignmentAdjustments[alignment] ?? 0;
  if (alignAdj > 0) contributions.push({ code: `ALIGN_${alignment}`, points: alignAdj });
  else if (alignAdj < 0) penalties.push({ code: `ALIGN_${alignment}`, points: alignAdj });
  rawAdj += alignAdj;

  // 3. Breadth modifier (bullish breadth = long tailwind)
  const breadthAdj = config.breadthAdjustments[breadthLabel] ?? 0;
  if (breadthAdj > 0) contributions.push({ code: `BREADTH_${breadthLabel}`, points: breadthAdj });
  else if (breadthAdj < 0) penalties.push({ code: `BREADTH_${breadthLabel}`, points: breadthAdj });
  rawAdj += breadthAdj;

  // 4. Side-specific adjustments (long-native)
  const btcRegime = marketContext?.btc?.regime ?? marketContext?.btcRegime ?? marketContext?.btcTacticalDirectionLabel ?? "UNKNOWN";

  if (side === "LOSER") {
    // Top-loser reversal longs: benefit from stabilizing conditions
    if (btcRegime === "TRENDING_UP" || btcRegime === "BREAKOUT_UP") {
      contributions.push({ code: "LOSER_BTC_TRENDING_UP_BONUS", points: 2 });
      rawAdj += 2;
    }
    if (btcRegime === "TRENDING_DOWN" || btcRegime === "BREAKDOWN_DOWN") {
      penalties.push({ code: "LOSER_BTC_TRENDING_DOWN_PENALTY", points: -5 });
      rawAdj -= 5;
    }
    if (btcRegime === "BOUNCE_IN_DOWNTREND") {
      penalties.push({ code: "LOSER_BTC_BOUNCE_IN_DOWNTREND_PENALTY", points: -2 });
      rawAdj -= 2;
    }
  }

  if (side === "GAINER") {
    // Top-gainer continuation longs: strong BTC uptrend is supportive
    if (btcRegime === "TRENDING_UP" || btcRegime === "BREAKOUT_UP") {
      contributions.push({ code: "GAINER_BTC_TRENDING_UP_BONUS", points: 3 });
      rawAdj += 3;
    }
    if (longBias === "STRONG_LONG_HEADWIND") {
      penalties.push({ code: "GAINER_STRONG_LONG_HEADWIND_PENALTY", points: -5 });
      rawAdj -= 5;
    }
  }

  return buildResult({ baseAes, rawAdj, side, contributions, penalties, isHardStale: false, config, sessionHealth });
}

function buildResult({ baseAes, rawAdj, side, contributions, penalties, isHardStale, config, sessionHealth }) {
  const base = typeof baseAes === "number" && Number.isFinite(baseAes) ? baseAes : null;
  if (base == null) {
    return {
      absoluteEntryBaseScore: null,
      absoluteEntryMarketAdjustment: null,
      absoluteEntryAdaptiveScore: null,
      absoluteEntryRequiredScore: null,
      absoluteEntryAesGap: null,
      absoluteEntryWouldPassAdaptive: null,
      absoluteEntryAdaptiveStatus: "INCOMPLETE",
      absoluteEntryMarketAdjustmentContributions: contributions ?? [],
      absoluteEntryMarketAdjustmentPenalties: penalties ?? [],
      absoluteEntryMarketAdjustmentVersion: ADAPTIVE_AES_VERSION,
      logOnly: true,
      canAffectExecution: false,
      executionApplied: false,
    };
  }
  const marketAdjustment = clamp(rawAdj, config.adjustmentCap.min, config.adjustmentCap.max);
  const adaptiveScore    = clamp(Math.round(base + marketAdjustment), config.adaptiveScoreCap.min, config.adaptiveScoreCap.max);

  const baseSideRequired = config.baseRequiredScore[side] ?? config.baseRequiredScore.UNKNOWN;
  const sessionDelta     = sessionHealth?.recommendedThresholdDelta ?? 0;

  let marketPolicyDelta = 0;
  if (isHardStale) marketPolicyDelta = config.marketPolicyThresholdConditions.LONG_CONTEXT_STALE ?? 10;

  const requiredScore = clamp(
    baseSideRequired + sessionDelta + marketPolicyDelta,
    0,
    100,
  );

  const aesGap    = Number((adaptiveScore - requiredScore).toFixed(2));
  const wouldPass = adaptiveScore >= requiredScore;

  return {
    absoluteEntryBaseScore:               base,
    absoluteEntryMarketAdjustment:        marketAdjustment,
    absoluteEntryAdaptiveScore:           adaptiveScore,
    absoluteEntryRequiredScore:           requiredScore,
    absoluteEntryAesGap:                  aesGap,
    absoluteEntryWouldPassAdaptive:       wouldPass,
    absoluteEntryAdaptiveStatus:          wouldPass ? "PASS" : "FAIL",
    absoluteEntryMarketAdjustmentContributions: contributions,
    absoluteEntryMarketAdjustmentPenalties:     penalties,
    absoluteEntryMarketAdjustmentVersion:       ADAPTIVE_AES_VERSION,
    _isHardStale:       isHardStale,
    _sessionDelta:      sessionDelta,
    _marketPolicyDelta: marketPolicyDelta,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  };
}
