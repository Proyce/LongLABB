// ─── LONG MARKET CONTEXT NORMALIZER ──────────────────────────────────────────
// Converts raw market regime data into LONG-native context scores and labels.
// All BTC/ETH context uses direction labels only. No Short-side context fallbacks.

export const LONG_MARKET_CONTEXT_VERSION = 'long-market-context-v2';

const REQUIRED_FIELDS = [
  'btcMicroDirectionLabel',
  'btcTacticalDirectionLabel',
  'btcStructuralDirectionLabel',
  'ethMicroDirectionLabel',
  'ethTacticalDirectionLabel',
  'btcEthAlignmentLabel',
  'breadthBullishPct',
  'breadthBearishPct',
];

function directionScore(label) {
  if (label === 'STRONG_UP')   return 100;
  if (label === 'UP')          return 60;
  if (label === 'FLAT')        return 0;
  if (label === 'DOWN')        return -60;
  if (label === 'STRONG_DOWN') return -100;
  return null;
}

function classifyLongContextLabel(score) {
  if (score == null)   return null;
  if (score >= 70)     return 'LONG_CONTEXT_STRONG_TAILWIND';
  if (score >= 35)     return 'LONG_CONTEXT_TAILWIND';
  if (score >= 0)      return 'LONG_CONTEXT_NEUTRAL';
  if (score >= -35)    return 'LONG_CONTEXT_HEADWIND';
  return 'LONG_CONTEXT_STRONG_HEADWIND';
}

function classifyDirectionAsLongContext(label, horizon) {
  const score = directionScore(label);
  if (score == null) return `LONG_${horizon}_CONTEXT_UNKNOWN`;
  if (score >= 60) return `LONG_${horizon}_TAILWIND`;
  if (score <= -60) return `LONG_${horizon}_HEADWIND`;
  return `LONG_${horizon}_NEUTRAL`;
}

function scoreBtcLongContext(micro, tactical, structural) {
  const scores  = [];
  const reasons = [];

  const mScore = directionScore(micro);
  const tScore = directionScore(tactical);
  const sScore = directionScore(structural);

  if (mScore != null) { scores.push(mScore * 0.35); reasons.push(`BTC_MICRO_${micro}`); }
  if (tScore != null) { scores.push(tScore * 0.45); reasons.push(`BTC_TACTICAL_${tactical}`); }
  if (sScore != null) { scores.push(sScore * 0.20); reasons.push(`BTC_STRUCTURAL_${structural}`); }

  if (scores.length === 0) return { score: null, label: null, reasons };

  const raw = scores.reduce((a, b) => a + b, 0);
  const score = Math.round(Math.max(-100, Math.min(100, raw)));
  return { score, label: classifyLongContextLabel(score), reasons };
}

function scoreEthLongContext(micro, tactical, structural) {
  const scores  = [];
  const reasons = [];

  const mScore = directionScore(micro);
  const tScore = directionScore(tactical);
  const sScore = directionScore(structural);

  if (mScore != null) { scores.push(mScore * 0.35); reasons.push(`ETH_MICRO_${micro}`); }
  if (tScore != null) { scores.push(tScore * 0.45); reasons.push(`ETH_TACTICAL_${tactical}`); }
  if (sScore != null) { scores.push(sScore * 0.20); reasons.push(`ETH_STRUCTURAL_${structural}`); }

  if (scores.length === 0) return { score: null, label: null, reasons };

  const raw = scores.reduce((a, b) => a + b, 0);
  const score = Math.round(Math.max(-100, Math.min(100, raw)));
  return { score, label: classifyLongContextLabel(score), reasons };
}

/**
 * @param {object} params - Raw market regime / snapshot fields
 * @returns {LongMarketContext}
 */
export function normalizeLongMarketContext(params) {
  const p = params ?? {};

  // Support nested and flat field shapes
  const btcMicro      = p.btcMicroDirectionLabel      ?? p.btc?.microDirectionLabel      ?? null;
  const btcTactical   = p.btcTacticalDirectionLabel   ?? p.btc?.tacticalDirectionLabel   ?? null;
  const btcStructural = p.btcStructuralDirectionLabel ?? p.btc?.structuralDirectionLabel ?? null;

  const ethMicro      = p.ethMicroDirectionLabel      ?? p.eth?.microDirectionLabel      ?? null;
  const ethTactical   = p.ethTacticalDirectionLabel   ?? p.eth?.tacticalDirectionLabel   ?? null;
  const ethStructural = p.ethStructuralDirectionLabel ?? p.eth?.structuralDirectionLabel ?? null;

  const btcEthAlignmentLabel = p.btcEthAlignmentLabel ?? p.crossMarket?.btcEthAlignmentLabel ?? null;
  const breadthBullishPct    = p.breadthBullishPct    ?? p.breadth?.breadthBullishPct        ?? null;
  const breadthBearishPct    = p.breadthBearishPct    ?? p.breadth?.breadthBearishPct        ?? null;

  const marketContextStale =
    p.marketContextStale === true ||
    p.stale === true ||
    p.contextStale === true;

  // ── Coverage ───────────────────────────────────────────────────────────────
  const rawValues = [
    btcMicro, btcTactical, btcStructural,
    ethMicro, ethTactical,
    btcEthAlignmentLabel, breadthBullishPct, breadthBearishPct,
  ];
  const knownCount             = rawValues.filter(v => v !== null && v !== undefined).length;
  const marketContextCoveragePct = Math.round((knownCount / REQUIRED_FIELDS.length) * 100);
  const marketContextComplete  = marketContextCoveragePct >= 70;

  // ── BTC long context ───────────────────────────────────────────────────────
  const btcCtx = scoreBtcLongContext(btcMicro, btcTactical, btcStructural);

  // ── ETH long context ───────────────────────────────────────────────────────
  const ethCtx = scoreEthLongContext(ethMicro, ethTactical, ethStructural);

  // ── Combined long market context ───────────────────────────────────────────
  const contextReasons = [];
  let combinedScore = null;

  const scoreParts = [];
  if (btcCtx.score != null) {
    scoreParts.push(btcCtx.score * 0.55);
    contextReasons.push(...btcCtx.reasons);
  }
  if (ethCtx.score != null) {
    scoreParts.push(ethCtx.score * 0.25);
    contextReasons.push(...ethCtx.reasons);
  }

  // Alignment bonus/penalty
  if (btcEthAlignmentLabel != null) {
    if (btcEthAlignmentLabel.includes('STRONG_BULLISH')) {
      scoreParts.push(15);
      contextReasons.push('BTC_ETH_STRONG_BULLISH_ALIGNMENT');
    } else if (btcEthAlignmentLabel.includes('BULLISH')) {
      scoreParts.push(8);
      contextReasons.push('BTC_ETH_BULLISH_ALIGNMENT');
    } else if (btcEthAlignmentLabel.includes('STRONG_BEARISH')) {
      scoreParts.push(-15);
      contextReasons.push('BTC_ETH_STRONG_BEARISH_ALIGNMENT');
    } else if (btcEthAlignmentLabel.includes('BEARISH')) {
      scoreParts.push(-8);
      contextReasons.push('BTC_ETH_BEARISH_ALIGNMENT');
    }
  }

  // Breadth context
  if (breadthBullishPct != null) {
    if (breadthBullishPct >= 65) {
      scoreParts.push(10);
      contextReasons.push('BREADTH_BULLISH_MAJORITY');
    } else if (breadthBullishPct < 30) {
      scoreParts.push(-10);
      contextReasons.push('BREADTH_BEARISH_MAJORITY');
    }
  }

  if (scoreParts.length > 0) {
    const raw = scoreParts.reduce((a, b) => a + b, 0);
    combinedScore = Math.round(Math.max(-100, Math.min(100, raw)));
  }

  const computedLongMarketContextLabel = classifyLongContextLabel(combinedScore);
  const longMarketContextLabel = marketContextStale ? 'LONG_CONTEXT_STALE' : computedLongMarketContextLabel;
  const btcLongContextLabel = marketContextStale ? 'LONG_CONTEXT_STALE' : btcCtx.label;
  const ethLongContextLabel = marketContextStale ? 'LONG_CONTEXT_STALE' : ethCtx.label;

  const explicitFreshnessMs = p.marketContextFreshnessMs ?? p.contextAgeMs ?? p.snapshotAgeMs ?? null;
  const evaluatedAt = Number(p.entryResearchComputedAt ?? p.evaluatedAt ?? p.normalizedAt ?? Date.now());
  const sourceAt = Number(
    p.marketContextComputedAt
      ?? p.sourceTimestamp
      ?? p.marketDataTimestamp
      ?? p.timestamp
      ?? p.computedAt
      ?? NaN,
  );
  const derivedFreshnessMs = Number.isFinite(evaluatedAt) && Number.isFinite(sourceAt)
    ? Math.max(0, evaluatedAt - sourceAt)
    : null;
  const marketContextFreshnessMs = Number.isFinite(Number(explicitFreshnessMs))
    ? Math.max(0, Number(explicitFreshnessMs))
    : derivedFreshnessMs;

  return {
    btcMicroDirectionLabel: btcMicro,
    btcTacticalDirectionLabel: btcTactical,
    btcStructuralDirectionLabel: btcStructural,
    ethMicroDirectionLabel: ethMicro,
    ethTacticalDirectionLabel: ethTactical,
    ethStructuralDirectionLabel: ethStructural,
    longMicroContextLabel: marketContextStale ? 'LONG_MICRO_CONTEXT_STALE' : classifyDirectionAsLongContext(btcMicro, 'MICRO'),
    longTacticalContextLabel: marketContextStale ? 'LONG_TACTICAL_CONTEXT_STALE' : classifyDirectionAsLongContext(btcTactical, 'TACTICAL'),
    longStrategicContextLabel: marketContextStale ? 'LONG_STRATEGIC_CONTEXT_STALE' : classifyDirectionAsLongContext(btcStructural, 'STRATEGIC'),

    btcLongContextLabel,
    btcLongContextScore:  btcCtx.score,
    btcLongContextReasons: btcCtx.reasons,

    ethLongContextLabel,
    ethLongContextScore:  ethCtx.score,
    ethLongContextReasons: ethCtx.reasons,

    btcEthAlignmentLabel,

    longMarketContextLabel,
    longMarketContextComputedLabel: computedLongMarketContextLabel,
    longMarketContextScore:   combinedScore,
    longMarketContextReasons: contextReasons,

    marketContextComplete,
    marketContextCoveragePct,
    marketContextStale,
    marketContextFreshnessMs,
    marketContextExpectedLongEffect: marketContextStale
      ? 'UNKNOWN_STALE'
      : combinedScore == null
        ? 'UNKNOWN_INCOMPLETE'
        : combinedScore > 0 ? 'SUPPORTIVE' : combinedScore < 0 ? 'CONTRADICTORY' : 'NEUTRAL',
    longMarketContextExpectedLongEffect: marketContextStale
      ? 'UNKNOWN_STALE'
      : combinedScore == null
        ? 'UNKNOWN_INCOMPLETE'
        : combinedScore > 0 ? 'SUPPORTIVE' : combinedScore < 0 ? 'CONTRADICTORY' : 'NEUTRAL',

    schemaVersion: LONG_MARKET_CONTEXT_VERSION,
    logOnly:       true,
    canAffectExecution: false,
  };
}
