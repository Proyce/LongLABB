// ─── LONG MARKET BREADTH (LOG ONLY) ──────────────────────────────────────────
// Evaluates broad market conditions for LONG entries.
// Positive evidence: BTC/ETH trending UP, bullish alignment, improving breadth.
// Log-only: none of these fields affect execution.

export const LONG_BREADTH_LABEL = Object.freeze({
  STRONG:       'LONG_BREADTH_STRONG',
  SUPPORTIVE:   'LONG_BREADTH_SUPPORTIVE',
  MIXED:        'LONG_BREADTH_MIXED',
  HOSTILE:      'LONG_BREADTH_HOSTILE',
  HARD_DANGER:  'LONG_BREADTH_HARD_DANGER',
  STALE:        'LONG_BREADTH_STALE',
  DEGRADED:     'LONG_BREADTH_DEGRADED',
  INSUFFICIENT: 'LONG_BREADTH_INSUFFICIENT',
});

export function computeLongMarketBreadthLogOnly(marketRegime) {
  const reasons = [];
  let score = 0;

  if (!marketRegime) {
    return {
      longMarketBreadthScore:        0,
      longMarketBreadthLabel:        LONG_BREADTH_LABEL.INSUFFICIENT,
      longMarketBreadthReasons:      ['NO_MARKET_REGIME_DATA'],
      longMarketBreadthDataComplete:  false,
      longMarketBreadthWouldReduce:   false,
      longMarketBreadthWouldBlock:    false,
      logOnly:                       true,
      canAffectExecution:            false,
    };
  }

  // Handle both nested (actual snapshot) and flat field names
  const btcMicro      = marketRegime?.btc?.microDirectionLabel      ?? marketRegime?.btcMicroDirectionLabel ?? null;
  const btcTactical   = marketRegime?.btc?.tacticalDirectionLabel   ?? marketRegime?.btcTacticalDirectionLabel ?? null;
  const btcStructural = marketRegime?.btc?.structuralDirectionLabel ?? marketRegime?.btcStructuralDirectionLabel ?? null;
  const btcRegime     = marketRegime?.btc?.regime                   ?? marketRegime?.btcRegime ?? null;
  const btcMomentumPhase = marketRegime?.btc?.momentumPhase         ?? marketRegime?.btcMomentumPhase ?? null;

  const ethMicro      = marketRegime?.eth?.microDirectionLabel      ?? marketRegime?.ethMicroDirectionLabel ?? null;
  const ethTactical   = marketRegime?.eth?.tacticalDirectionLabel   ?? marketRegime?.ethTacticalDirectionLabel ?? null;
  const ethStructural = marketRegime?.eth?.structuralDirectionLabel ?? marketRegime?.ethStructuralDirectionLabel ?? null;
  const ethRegime     = marketRegime?.eth?.regime                   ?? marketRegime?.ethRegime ?? null;

  const alignment         = marketRegime?.crossMarket?.btcEthAlignmentLabel ?? marketRegime?.btcEthAlignmentLabel ?? null;
  const breadth           = marketRegime?.breadth?.breadthLabel             ?? marketRegime?.breadthLabel ?? null;
  const breadthBullishPct = marketRegime?.breadth?.breadthBullishPct       ?? marketRegime?.breadthBullishPct ?? null;

  const stale =
    marketRegime?.stale === true ||
    marketRegime?.contextStale === true ||
    marketRegime?.marketContextStale === true;

  // Stale is distinct from missing — must remain separate label.
  if (stale) {
    return {
      longMarketBreadthScore:        0,
      longMarketBreadthLabel:        LONG_BREADTH_LABEL.STALE,
      longMarketBreadthReasons:      ['MARKET_DATA_STALE'],
      longMarketBreadthDataComplete:  false,
      longMarketBreadthWouldReduce:   false,
      longMarketBreadthWouldBlock:    false,
      coveragePct:                   0,
      logOnly:                       true,
      canAffectExecution:            false,
    };
  }

  // ── Required-field coverage check ─────────────────────────────────────────
  // Must have meaningful coverage to produce a real verdict.
  const requiredValues = [btcMicro, btcTactical, ethMicro, alignment, breadthBullishPct];
  const knownCount     = requiredValues.filter(v => v !== null && v !== undefined).length;
  const coveragePct    = (knownCount / requiredValues.length) * 100;

  if (coveragePct < 40) {
    return {
      longMarketBreadthScore:        null,
      longMarketBreadthLabel:        LONG_BREADTH_LABEL.INSUFFICIENT,
      longMarketBreadthReasons:      ['INSUFFICIENT_FIELD_COVERAGE'],
      longMarketBreadthDataComplete:  false,
      longMarketBreadthWouldReduce:   false,
      longMarketBreadthWouldBlock:    false,
      coveragePct,
      logOnly:                       true,
      canAffectExecution:            false,
    };
  }

  if (coveragePct < 70) {
    return {
      longMarketBreadthScore:        null,
      longMarketBreadthLabel:        LONG_BREADTH_LABEL.DEGRADED,
      longMarketBreadthReasons:      ['DEGRADED_FIELD_COVERAGE'],
      longMarketBreadthDataComplete:  false,
      longMarketBreadthWouldReduce:   false,
      longMarketBreadthWouldBlock:    false,
      coveragePct,
      logOnly:                       true,
      canAffectExecution:            false,
    };
  }

  const dataComplete = coveragePct >= 70;

  // ── Positive evidence (LONG-favorable) ───────────────────────────────────
  if (btcMicro === 'UP' || btcMicro === 'STRONG_UP') {
    score += 15;
    reasons.push('BTC_MICRO_UP');
  }

  if (btcTactical === 'UP' || btcTactical === 'STRONG_UP') {
    score += 18;
    reasons.push('BTC_TACTICAL_UP');
  }

  if (btcStructural === 'UP' || btcStructural === 'STRONG_UP') {
    score += 12;
    reasons.push('BTC_STRUCTURAL_UP');
  }

  if (ethMicro === 'UP' || ethMicro === 'STRONG_UP') {
    score += 10;
    reasons.push('ETH_MICRO_UP');
  }

  if (ethTactical === 'UP' || ethTactical === 'STRONG_UP') {
    score += 12;
    reasons.push('ETH_TACTICAL_UP');
  }

  if (alignment === 'BTC_ETH_STRONG_BULLISH_ALIGNMENT') {
    score += 20;
    reasons.push('BTC_ETH_STRONG_BULLISH_ALIGNMENT');
  } else if (alignment === 'BTC_ETH_BULLISH_ALIGNMENT') {
    score += 12;
    reasons.push('BTC_ETH_BULLISH_ALIGNMENT');
  }

  if (breadth === 'BREADTH_STRONGLY_BULLISH') {
    score += 18;
    reasons.push('BREADTH_STRONGLY_BULLISH');
  } else if (breadth === 'BREADTH_BULLISH') {
    score += 10;
    reasons.push('BREADTH_BULLISH');
  }

  if (breadthBullishPct != null && breadthBullishPct > 65) {
    score += 8;
    reasons.push('BREADTH_IMPROVING');
  }

  if (btcRegime === 'TRENDING_UP' || btcRegime === 'BREAKOUT_UP') {
    score += 12;
    reasons.push('BTC_TRENDING_UP');
  }

  if (btcMomentumPhase === 'BULLISH_CONTINUATION') {
    score += 8;
    reasons.push('BTC_BULLISH_CONTINUATION_PHASE');
  }

  // ── Negative evidence (LONG-hostile) ─────────────────────────────────────
  if (btcTactical === 'DOWN' || btcTactical === 'STRONG_DOWN') {
    score -= 20;
    reasons.push('BTC_TACTICAL_DOWN');
  }

  if (btcStructural === 'DOWN' || btcStructural === 'STRONG_DOWN') {
    score -= 15;
    reasons.push('BTC_STRUCTURAL_DOWN');
  }

  if (ethTactical === 'DOWN' || ethTactical === 'STRONG_DOWN') {
    score -= 12;
    reasons.push('ETH_TACTICAL_DOWN');
  }

  if (alignment === 'BTC_ETH_STRONG_BEARISH_ALIGNMENT') {
    score -= 25;
    reasons.push('BTC_ETH_STRONG_BEARISH_ALIGNMENT');
  } else if (alignment === 'BTC_ETH_BEARISH_ALIGNMENT') {
    score -= 15;
    reasons.push('BTC_ETH_BEARISH_ALIGNMENT');
  }

  if (breadth === 'BREADTH_STRONGLY_BEARISH') {
    score -= 20;
    reasons.push('STRONG_BEARISH_BREADTH');
  } else if (breadth === 'BREADTH_BEARISH') {
    score -= 12;
    reasons.push('FALLING_BREADTH');
  }

  if (breadthBullishPct != null && breadthBullishPct < 30) {
    score -= 10;
    reasons.push('BREADTH_PREDOMINANTLY_BEARISH');
  }

  if (btcRegime === 'BOUNCE_IN_DOWNTREND') {
    score -= 30;
    reasons.push('BTC_BOUNCE_IN_DOWNTREND_TRAP');
  }

  if (btcMomentumPhase === 'BEARISH_REVERSAL_ATTEMPT') {
    score -= 15;
    reasons.push('BTC_BEARISH_REVERSAL_ATTEMPT');
  }

  if (ethRegime === 'BOUNCE_IN_DOWNTREND') {
    score -= 15;
    reasons.push('ETH_BOUNCE_IN_DOWNTREND');
  }

  if (breadth === 'BREADTH_INSUFFICIENT') {
    reasons.push('BREADTH_DATA_INSUFFICIENT');
  }

  const clamped = Math.max(-100, Math.min(100, score));

  const label =
    clamped >= 40  ? LONG_BREADTH_LABEL.STRONG
    : clamped >= 15  ? LONG_BREADTH_LABEL.SUPPORTIVE
    : clamped >= -10 ? LONG_BREADTH_LABEL.MIXED
    : clamped >= -35 ? LONG_BREADTH_LABEL.HOSTILE
    : LONG_BREADTH_LABEL.HARD_DANGER;

  return {
    longMarketBreadthScore:        clamped,
    longMarketBreadthLabel:        label,
    longMarketBreadthReasons:      reasons,
    longMarketBreadthDataComplete:  dataComplete,
    longMarketBreadthWouldReduce:   label === LONG_BREADTH_LABEL.HOSTILE,
    longMarketBreadthWouldBlock:    label === LONG_BREADTH_LABEL.HARD_DANGER,
    coveragePct,
    logOnly:                       true,
    canAffectExecution:            false,
  };
}
