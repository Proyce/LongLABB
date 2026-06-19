// Cross-market engine: independent SHORT and LONG tailwind scores
import { MARKET_REGIME_CONFIG } from "./marketRegime.config.js";
import {
  classifyDirectionScore,
  classifyBtcEthAlignment,
  classifyShortBias,
  classifyLongBias,
  classifyBreadthLabel,
  clamp,
} from "./marketRegime.labels.js";

const REGIME_SHORT_SCORES = {
  TRENDING_DOWN:        80,
  BREAKDOWN_DOWN:       75,
  BOUNCE_IN_DOWNTREND:  30,
  TRANSITION_DOWN:      40,
  RANGING:               5,
  CHOPPY:              -10,
  VOLATILE_TWO_WAY:    -20,
  UNKNOWN:             -30,
  STALE:               -40,
  PULLBACK_IN_UPTREND: -50,
  TRANSITION_UP:       -40,
  TRENDING_UP:         -80,
  BREAKOUT_UP:         -70,
};

const REGIME_LONG_SCORES = {
  TRENDING_UP:          80,
  BREAKOUT_UP:          75,
  PULLBACK_IN_UPTREND:  30,
  TRANSITION_UP:        40,
  RANGING:               5,
  CHOPPY:              -10,
  VOLATILE_TWO_WAY:    -20,
  UNKNOWN:             -30,
  STALE:               -40,
  BOUNCE_IN_DOWNTREND: -50,
  TRANSITION_DOWN:     -40,
  TRENDING_DOWN:       -80,
  BREAKDOWN_DOWN:      -70,
};

function regimeShortScore(regime) {
  return REGIME_SHORT_SCORES[regime] ?? -20;
}
function regimeLongScore(regime) {
  return REGIME_LONG_SCORES[regime] ?? -20;
}

function structuralDirectionToScore(score) {
  if (score == null) return 0;
  // Negative structural direction = short tailwind
  return clamp(-score * 0.6, -60, 60);
}

function breadthToShortScore(breadthLabel) {
  const map = {
    BREADTH_STRONGLY_BEARISH: 60,
    BREADTH_BEARISH:          35,
    BREADTH_MIXED:             0,
    BREADTH_BULLISH:          -35,
    BREADTH_STRONGLY_BULLISH: -60,
    BREADTH_INSUFFICIENT:      0,
    BREADTH_STALE:            -20,
  };
  return map[breadthLabel] ?? 0;
}

function breadthToLongScore(breadthLabel) {
  return -breadthToShortScore(breadthLabel);
}

function alignmentToShortScore(alignment) {
  const map = {
    BTC_ETH_STRONG_BEARISH_ALIGNMENT:  40,
    BTC_ETH_BEARISH_ALIGNMENT:         20,
    BTC_ETH_STRONG_BULLISH_ALIGNMENT: -40,
    BTC_ETH_BULLISH_ALIGNMENT:        -20,
    BTC_BEAR_ETH_BULL_DIVERGENCE:     -10,
    BTC_BULL_ETH_BEAR_DIVERGENCE:     -10,
    BTC_ETH_MIXED:                      0,
    BTC_ETH_RANGE:                     -5,
    BTC_ETH_STALE:                    -20,
  };
  return map[alignment] ?? 0;
}

function alignmentToLongScore(alignment) {
  return -alignmentToShortScore(alignment);
}

function freshnessToScoreModifier(btcFreshness, ethFreshness) {
  if (btcFreshness === "HARD_STALE") return -40;
  if (ethFreshness === "HARD_STALE") return -20;
  if (btcFreshness === "STALE")      return -20;
  if (ethFreshness === "STALE")      return -10;
  return 0;
}

export function computeCrossMarketContext({ btc, eth, breadth }) {
  if (!btc || !eth) {
    return {
      btcEthAlignmentLabel:         "BTC_ETH_STALE",
      crossMarketShortTailwindScore: null,
      crossMarketShortBiasLabel:     "SHORT_CONTEXT_STALE",
      crossMarketLongTailwindScore:  null,
      crossMarketLongBiasLabel:      "LONG_CONTEXT_STALE",
      marketConflictFlags:           ["BTC_OR_ETH_MISSING"],
      directionConflictLabels:       [],
    };
  }

  const btcFreshness = btc.freshnessLabel ?? "HARD_STALE";
  const ethFreshness = eth.freshnessLabel ?? "HARD_STALE";

  // BTC/ETH structural alignment
  const alignment = classifyBtcEthAlignment({
    btcStructural: btc.structuralDirectionScore,
    ethStructural: eth.structuralDirectionScore,
    btcTactical:   btc.tacticalDirectionScore,
    ethTactical:   eth.tacticalDirectionScore,
  });

  // BTC contribution (40%): regime + structural direction
  const btcRegimeShort = regimeShortScore(btc.regime ?? "UNKNOWN");
  const btcStructShort = structuralDirectionToScore(btc.structuralDirectionScore);
  const btcTacShort    = structuralDirectionToScore(btc.tacticalDirectionScore) * 0.5;
  const btcShortRaw    = (btcRegimeShort * 0.55 + btcStructShort * 0.30 + btcTacShort * 0.15);

  const btcRegimeLong  = regimeLongScore(btc.regime ?? "UNKNOWN");
  const btcStructLong  = -structuralDirectionToScore(btc.structuralDirectionScore);
  const btcTacLong     = -structuralDirectionToScore(btc.tacticalDirectionScore) * 0.5;
  const btcLongRaw     = (btcRegimeLong * 0.55 + btcStructLong * 0.30 + btcTacLong * 0.15);

  // ETH contribution (25%): regime + structural direction
  const ethRegimeShort = regimeShortScore(eth.regime ?? "UNKNOWN");
  const ethStructShort = structuralDirectionToScore(eth.structuralDirectionScore);
  const ethShortRaw    = (ethRegimeShort * 0.6 + ethStructShort * 0.4);

  const ethRegimeLong  = regimeLongScore(eth.regime ?? "UNKNOWN");
  const ethStructLong  = -structuralDirectionToScore(eth.structuralDirectionScore);
  const ethLongRaw     = (ethRegimeLong * 0.6 + ethStructLong * 0.4);

  // Breadth (20%)
  const breadthLabel = breadth?.breadthLabel ?? "BREADTH_STALE";
  const breadthShort = breadthToShortScore(breadthLabel);
  const breadthLong  = breadthToLongScore(breadthLabel);

  // Alignment (10%)
  const alignShort = alignmentToShortScore(alignment);
  const alignLong  = alignmentToLongScore(alignment);

  // Freshness (5%)
  const freshMod = freshnessToScoreModifier(btcFreshness, ethFreshness);

  // Combine
  const rawShort =
    btcShortRaw  * 0.40 +
    ethShortRaw  * 0.25 +
    breadthShort * 0.20 +
    alignShort   * 0.10 +
    freshMod     * 0.05;

  const rawLong =
    btcLongRaw  * 0.40 +
    ethLongRaw  * 0.25 +
    breadthLong * 0.20 +
    alignLong   * 0.10 +
    freshMod    * 0.05;

  // Hard stale override
  const hardStale = btcFreshness === "HARD_STALE";
  const crossMarketShortTailwindScore = hardStale ? null : clamp(Math.round(rawShort), -100, 100);
  const crossMarketLongTailwindScore  = hardStale ? null : clamp(Math.round(rawLong),  -100, 100);

  const crossMarketShortBiasLabel = hardStale
    ? "SHORT_CONTEXT_STALE"
    : classifyShortBias(crossMarketShortTailwindScore);
  const crossMarketLongBiasLabel = hardStale
    ? "LONG_CONTEXT_STALE"
    : classifyLongBias(crossMarketLongTailwindScore);

  // Conflict flags
  const conflictFlags = [];
  const btcMicro      = classifyDirectionScore(btc.microDirectionScore ?? 0);
  const btcStructural = classifyDirectionScore(btc.structuralDirectionScore ?? 0);
  const ethMicro      = classifyDirectionScore(eth.microDirectionScore ?? 0);
  const ethStructural = classifyDirectionScore(eth.structuralDirectionScore ?? 0);

  const isBullish  = d => d === "UP" || d === "STRONG_UP";
  const isBearish  = d => d === "DOWN" || d === "STRONG_DOWN";

  if (isBullish(btcMicro) && isBearish(btcStructural)) conflictFlags.push("BTC_MICRO_UP_STRUCTURAL_DOWN");
  if (isBearish(btcMicro) && isBullish(btcStructural)) conflictFlags.push("BTC_MICRO_DOWN_STRUCTURAL_UP");
  if (isBullish(ethMicro) && isBearish(ethStructural)) conflictFlags.push("ETH_MICRO_UP_STRUCTURAL_DOWN");
  if (isBearish(ethMicro) && isBullish(ethStructural)) conflictFlags.push("ETH_MICRO_DOWN_STRUCTURAL_UP");
  if (isBearish(btcStructural) && isBullish(ethStructural)) conflictFlags.push("BTC_ETH_STRUCTURAL_DIVERGENCE");
  if (isBullish(btcStructural) && isBearish(ethStructural)) conflictFlags.push("BTC_ETH_STRUCTURAL_DIVERGENCE");
  if (isBearish(btcMicro) !== isBearish(ethMicro) && btcMicro !== "FLAT" && ethMicro !== "FLAT") {
    conflictFlags.push("BTC_ETH_MICRO_DIVERGENCE");
  }

  // Trend-vs-momentum
  if ((btc.trendState ?? "").includes("BEAR") && isBullish(btcMicro)) {
    conflictFlags.push("BEAR_TREND_BUT_BUYER_MOMENTUM_RETURNING");
  }
  if ((btc.trendState ?? "").includes("BULL") && isBearish(btcMicro)) {
    conflictFlags.push("BULL_TREND_BUT_SELLER_MOMENTUM_RETURNING");
  }

  return {
    btcEthAlignmentLabel:          alignment,
    crossMarketShortTailwindScore,
    crossMarketShortBiasLabel,
    crossMarketLongTailwindScore,
    crossMarketLongBiasLabel,
    marketConflictFlags:           conflictFlags,
    directionConflictLabels:       conflictFlags,

    // Sub-contributions for logging
    _contributions: {
      btcShortRaw:    Math.round(btcShortRaw),
      ethShortRaw:    Math.round(ethShortRaw),
      breadthShort:   Math.round(breadthShort),
      alignShort:     Math.round(alignShort),
      freshMod:       Math.round(freshMod),
    },
  };
}
