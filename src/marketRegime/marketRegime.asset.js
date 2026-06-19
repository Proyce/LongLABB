// Per-asset (BTC or ETH) regime engine
import { MARKET_REGIME_CONFIG, MARKET_REGIME_VERSION } from "./marketRegime.config.js";
import {
  computeTimeframeDirectionScoreSync,
  weightedDirectionScore,
  detectMarketStructure,
} from "./marketRegime.indicators.js";
import {
  classifyDirectionScore,
  classifyTrendState,
  classifyMomentumPhase,
  classifyVolatilityState,
  classifyRegime,
  classifyFreshness,
  computeConfidence,
  clamp,
} from "./marketRegime.labels.js";

const STRUCTURAL_TFS = ["1h", "2h", "4h"];
const TACTICAL_TFS   = ["15m", "30m"];
const MICRO_TFS      = ["1m", "3m", "5m"];
const STRUCTURE_TFS  = ["5m", "15m", "1h", "2h"];

export function computeAssetContext({
  symbol,
  klinesByInterval,
  computedAt = Date.now(),
  config = MARKET_REGIME_CONFIG,
}) {
  const warnings = [];
  const tfScores = {};
  const validTimeframes = [];

  // Compute direction score for each timeframe
  for (const tf of config.timeframes) {
    const klines = klinesByInterval?.[tf];
    if (!klines || klines.length < 10) {
      warnings.push(`${symbol}_${tf.toUpperCase()}_INSUFFICIENT_DATA`);
      tfScores[tf] = { score: null, label: "UNKNOWN" };
      continue;
    }
    tfScores[tf] = computeTimeframeDirectionScoreSync({ klines, config });
    validTimeframes.push(tf);
  }

  const validTimeframeCount = validTimeframes.length;
  const coveragePct = Number((validTimeframeCount / config.timeframes.length).toFixed(2));

  // Group weighted direction scores
  const microDirectionScore      = weightedDirectionScore(tfScores, config.groupWeights.micro);
  const tacticalDirectionScore   = weightedDirectionScore(tfScores, config.groupWeights.tactical);
  const structuralDirectionScore = weightedDirectionScore(tfScores, config.groupWeights.structural);

  const microDirectionLabel      = classifyDirectionScore(microDirectionScore);
  const tacticalDirectionLabel   = classifyDirectionScore(tacticalDirectionScore);
  const structuralDirectionLabel = classifyDirectionScore(structuralDirectionScore);

  // Best available ADX for trend classification (use 1h or 15m)
  const bestAdxTf    = ["1h", "15m", "30m", "5m"].find(tf => tfScores[tf]?.adx14 != null);
  const adx14        = bestAdxTf ? tfScores[bestAdxTf].adx14 : null;
  const bestEmaTf    = ["1h", "15m", "5m"].find(tf => tfScores[tf]?.emaStack != null);
  const emaStack     = bestEmaTf ? tfScores[bestEmaTf].emaStack : "UNKNOWN";
  const bestDmiTf    = ["1h", "15m", "5m"].find(tf => tfScores[tf]?.dmiBias != null);
  const dmiBias      = bestDmiTf ? tfScores[bestDmiTf].dmiBias : "UNKNOWN";

  const trendState = classifyTrendState({
    structuralDirectionScore,
    tacticalDirectionScore,
    adx14,
    emaStack,
    dmiBias,
  });

  const momentumPhase = classifyMomentumPhase({
    microDirectionScore,
    prevMicroDirectionScore: null,
    macdHistogramState: tfScores["5m"]?.macdHistogramState ?? tfScores["15m"]?.macdHistogramState,
    macdHistogramDelta: tfScores["5m"]?.macdHistogramDelta,
    structuralDirectionScore,
    tacticalDirectionScore,
  });

  // Volatility: use 1h timeframe as primary
  const primaryATF    = ["1h", "15m", "5m"].find(tf => tfScores[tf]?.atrPct != null);
  const atrPct        = primaryATF ? tfScores[primaryATF].atrPct : null;
  const atrRatioToMedian = primaryATF ? tfScores[primaryATF].atrRatioToMedian : null;
  const volatilityState = classifyVolatilityState({ atrPct, atrRatioToMedian });

  // Market structure for specific timeframes
  const structureByTf = {};
  for (const tf of STRUCTURE_TFS) {
    const klines = klinesByInterval?.[tf];
    structureByTf[tf] = klines ? detectMarketStructure(klines, 5, config) : "UNKNOWN";
  }

  // Best range efficiency
  const rangeEfficiency = tfScores["15m"]?.rangeEfficiency ?? tfScores["1h"]?.rangeEfficiency ?? 0.5;

  // Regime
  const regime = classifyRegime({
    structuralDirectionScore,
    tacticalDirectionScore,
    microDirectionScore,
    trendState,
    adx14,
    emaStack,
    rangeEfficiency,
    validTimeframeCount,
  });

  // Price and VWAP
  const priceTf     = ["1h", "15m", "5m"].find(tf => tfScores[tf]?.vwap != null);
  const price       = priceTf ? (() => {
    const closed = klinesByInterval?.[priceTf];
    if (!closed || !closed.length) return null;
    const last = closed[closed.length - 1];
    return last ? Number(last[4]) : null;
  })() : null;
  const vwap1h      = tfScores["1h"]?.vwap ?? null;
  const vwap15m     = tfScores["15m"]?.vwap ?? null;

  return {
    symbol,
    version: MARKET_REGIME_VERSION,
    computedAt,

    price,
    vwap1h,
    vwap15m,

    // Per-timeframe scores (full detail)
    timeframeScores: tfScores,

    // Group scores
    microDirectionScore,
    microDirectionLabel,
    tacticalDirectionScore,
    tacticalDirectionLabel,
    structuralDirectionScore,
    structuralDirectionLabel,

    // Trend
    trendState,

    // Momentum
    momentumPhase,

    // Volatility
    volatilityState,
    atrPct,
    atrRatioToMedian,

    // Structure
    structure5m:  structureByTf["5m"]  ?? "UNKNOWN",
    structure15m: structureByTf["15m"] ?? "UNKNOWN",
    structure1h:  structureByTf["1h"]  ?? "UNKNOWN",
    structure2h:  structureByTf["2h"]  ?? "UNKNOWN",

    // Key indicators
    adx14,
    emaStack,
    dmiBias,
    rangeEfficiency,

    // Regime
    regime,

    // Freshness
    validTimeframeCount,
    coveragePct,
    warnings,
  };
}
