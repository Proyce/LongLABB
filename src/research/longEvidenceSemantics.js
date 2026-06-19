// ─── LONG EVIDENCE / CONTRADICTION SEMANTICS V1 ─────────────────────────────
// Research-only calibration helpers. They never block execution.

export const LONG_EVIDENCE_SEMANTICS_VERSION = 'LONG_EVIDENCE_V1_2026_06';

export const LONG_EVIDENCE_FAMILY = Object.freeze({
  ENTRY_QUALITY: 'ENTRY_QUALITY',
  MICRO_MOMENTUM: 'MICRO_MOMENTUM',
  FLOW_CVD: 'FLOW_CVD',
  VWAP_STRUCTURE: 'VWAP_STRUCTURE',
  REVERSAL_EXHAUSTION: 'REVERSAL_EXHAUSTION',
  VOLATILITY: 'VOLATILITY',
  FUNDING: 'FUNDING',
  MARKET_CONTEXT: 'MARKET_CONTEXT',
});

export const LONG_ANTI_SEVERITY = Object.freeze({
  NONE: 'NONE',
  INFO: 'INFO',
  SOFT: 'SOFT',
  STRONG: 'STRONG',
  HARD: 'HARD',
});

export const LONG_COMBO_EVIDENCE_FAMILIES = Object.freeze({
  LONG_UNIVERSAL_CORE_V1: [LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM, LONG_EVIDENCE_FAMILY.FLOW_CVD],
  FIRST_GREEN_DUMP_EXHAUSTION_LONG_V1: [LONG_EVIDENCE_FAMILY.REVERSAL_EXHAUSTION, LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM, LONG_EVIDENCE_FAMILY.FLOW_CVD],
  FAILED_BREAKDOWN_VWAP_RECLAIM_LONG_V1: [LONG_EVIDENCE_FAMILY.VWAP_STRUCTURE, LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM],
  NEGATIVE_FUNDING_SQUEEZE_LONG_V1: [LONG_EVIDENCE_FAMILY.FUNDING, LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM],
  TOP_GAINER_HIGHER_LOW_CONTINUATION_LONG_V1: [LONG_EVIDENCE_FAMILY.VWAP_STRUCTURE, LONG_EVIDENCE_FAMILY.FLOW_CVD],
  BREAKOUT_RETEST_CONTINUATION_LONG_V1: [LONG_EVIDENCE_FAMILY.VWAP_STRUCTURE, LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM, LONG_EVIDENCE_FAMILY.FLOW_CVD],
  LONG_UNIVERSAL_CORE_MICRO_UP_V1: [LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM, LONG_EVIDENCE_FAMILY.FLOW_CVD],
  LONG_GATE_RSI_MACD_EXPANSION_V1: [LONG_EVIDENCE_FAMILY.ENTRY_QUALITY, LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM],
  LONG_PREMIUM_PF10_RUNNER_V1: [LONG_EVIDENCE_FAMILY.ENTRY_QUALITY],
  LONG_GATE_STRONG_MICRO_UP_CLEAN_V1: [LONG_EVIDENCE_FAMILY.ENTRY_QUALITY, LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM],
  LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1: [LONG_EVIDENCE_FAMILY.VWAP_STRUCTURE, LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM, LONG_EVIDENCE_FAMILY.FLOW_CVD],
  LONG_GAINER_GREEN_REACCELERATION_V1: [LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM, LONG_EVIDENCE_FAMILY.VWAP_STRUCTURE],
  LONG_LOSER_SCALP_REVERSAL_CONFIRMED_V1: [LONG_EVIDENCE_FAMILY.REVERSAL_EXHAUSTION, LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM, LONG_EVIDENCE_FAMILY.FLOW_CVD],
});

export const LONG_ANTI_COMBO_SEVERITY = Object.freeze({
  LONG_FALLING_KNIFE_ANTI_V1: LONG_ANTI_SEVERITY.HARD,
  LONG_RED_CVD_BEAR_ANTI_V1: LONG_ANTI_SEVERITY.HARD,
});

const finite = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

const severityOrder = [
  LONG_ANTI_SEVERITY.NONE,
  LONG_ANTI_SEVERITY.INFO,
  LONG_ANTI_SEVERITY.SOFT,
  LONG_ANTI_SEVERITY.STRONG,
  LONG_ANTI_SEVERITY.HARD,
];

function normalizeCvd(sample) {
  const raw = String(sample?.entryCvdLabel ?? sample?.cvdLabel ?? sample?.cvdStateAtEntry ?? '').toUpperCase();
  if (raw.includes('BULL')) return 'BULL';
  if (raw.includes('BEAR')) return 'BEAR';
  if (raw.includes('NEUT')) return 'NEUT';
  return 'UNKNOWN';
}

export function deriveLongCvdSemantics(sample = {}) {
  const entry = normalizeCvd(sample);
  const currentRaw = String(sample.cvdStateCurrent ?? sample.currentCvdLabel ?? sample.cvdLabel ?? '').toUpperCase();
  const current = currentRaw.includes('BULL') ? 'BULL' : currentRaw.includes('BEAR') ? 'BEAR' : currentRaw.includes('NEUT') ? 'NEUT' : 'UNKNOWN';
  const green = sample.immediateGreenImpulse === true || sample.greenImpulseDetected === true || sample.longMicroUpConfirmation === true;
  const reversalOverride = entry === 'BEAR' && green && (
    sample.topLoserLongThesisLane === 'TOP_LOSER_SCALP_REVERSAL_CANDIDATE' ||
    Number(sample.longGateScore) >= 90
  );
  const contradicts = entry === 'BEAR' && !reversalOverride;
  return Object.freeze({
    cvdStateAtEntry: entry,
    cvdStateCurrent: current,
    cvdSupportsLongAtEntry: entry === 'BULL',
    cvdContradictsLongAtEntry: contradicts,
    cvdChangedSinceEntry: entry !== 'UNKNOWN' && current !== 'UNKNOWN' && entry !== current,
    cvdOverrideApplied: reversalOverride,
    cvdOverrideReason: reversalOverride ? 'CONFIRMED_REVERSAL_STRUCTURE' : null,
    cvdLongInterpretation: reversalOverride
      ? 'CVD_BEAR_REVERSAL_OVERRIDE'
      : entry === 'BEAR'
        ? 'CVD_BEAR_LONG_CONTRADICTION'
        : entry === 'BULL'
          ? 'CVD_BULL_LONG_SUPPORT'
          : entry === 'NEUT'
            ? 'CVD_NEUTRAL'
            : 'CVD_UNKNOWN',
    longEvidenceSemanticsVersion: LONG_EVIDENCE_SEMANTICS_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}

export function deriveLongAtrContext(sample = {}, activeThreshold = 0.6) {
  const atr = finite(sample.atrPct);
  const qualityElite =
    (finite(sample.bestDnaLongScore) ?? -Infinity) >= 80 ||
    (finite(sample.longPostFee10EntryScore) ?? -Infinity) >= 80 ||
    (finite(sample.longGateScore) ?? -Infinity) >= 80 ||
    (finite(sample.longCandidateRunnerScoreAtEntry) ?? -Infinity) >= 80;
  const microUp = sample.longMicroUpConfirmation === true || sample.last3TicksDirection === 'UP' || sample.immediateGreenImpulse === true;
  const hardAnti = Number(sample.longCombosAntiCount ?? 0) > 0 || sample.hardAntiComboPresent === true;
  const headwind = sample.longMarketContextLabel === 'LONG_CONTEXT_STRONG_HEADWIND'
                || sample.longMarketContextLabel === 'LONG_CONTEXT_HEADWIND';
  const hardDanger = sample.longMarketBreadthLabel === 'LONG_BREADTH_HARD_DANGER'
                  || sample.longMarketBreadthLabel === 'LONG_BREADTH_HOSTILE';
  let context = 'NORMAL';
  if (!Number.isFinite(atr)) context = 'UNKNOWN';
  else if (atr < 0.2) context = 'LOW_ENERGY';
  else if (atr >= 1.5 && !(qualityElite && microUp && !hardAnti)) context = 'EXTREME_VOLATILITY_RESEARCH';
  else if (atr >= activeThreshold && qualityElite && microUp && !hardAnti && !headwind && !hardDanger) context = 'QUALIFIED_VOLATILITY_BOOST';
  else if (atr >= activeThreshold) context = 'UNQUALIFIED_VOLATILITY_DANGER';
  return Object.freeze({
    longAtrContext: context,
    longAtrActiveThreshold: activeThreshold,
    longAtrQualityQualified: qualityElite,
    longAtrMicroUpQualified: microUp,
    longAtrHardAntiPresent: hardAnti,
    longEvidenceSemanticsVersion: LONG_EVIDENCE_SEMANTICS_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}

export function deriveLongEvidenceSummary(sample = {}) {
  const positives = Array.isArray(sample.longCombosPositiveMatched) ? sample.longCombosPositiveMatched : [];
  const antis = Array.isArray(sample.longCombosAntiMatched) ? sample.longCombosAntiMatched : [];
  const positiveFamilies = [...new Set(positives.flatMap(id => LONG_COMBO_EVIDENCE_FAMILIES[id] ?? []))];
  const antiSeverities = antis.map(id => LONG_ANTI_COMBO_SEVERITY[id] ?? LONG_ANTI_SEVERITY.SOFT);
  const highestAntiSeverity = antiSeverities.reduce((highest, current) =>
    severityOrder.indexOf(current) > severityOrder.indexOf(highest) ? current : highest,
  LONG_ANTI_SEVERITY.NONE);
  const independentNegativeFamilies = [...new Set(antis.flatMap(id => {
    if (id === 'LONG_FALLING_KNIFE_ANTI_V1') return [LONG_EVIDENCE_FAMILY.REVERSAL_EXHAUSTION, LONG_EVIDENCE_FAMILY.FLOW_CVD];
    if (id === 'LONG_RED_CVD_BEAR_ANTI_V1') return [LONG_EVIDENCE_FAMILY.MICRO_MOMENTUM, LONG_EVIDENCE_FAMILY.FLOW_CVD];
    return [LONG_EVIDENCE_FAMILY.ENTRY_QUALITY];
  }))];
  const clean = positives.length >= 1 && antis.length === 0 && highestAntiSeverity !== LONG_ANTI_SEVERITY.HARD;
  const stacked = positives.length >= 2 && antis.length === 0 && positiveFamilies.length >= 2;
  const eliteScore = (finite(sample.bestDnaLongScore) ?? -Infinity) >= 90 || (finite(sample.longPostFee10EntryScore) ?? -Infinity) >= 90 || (finite(sample.longGateScore) ?? -Infinity) >= 90;
  const microUp = sample.longMicroUpConfirmation === true || sample.last3TicksDirection === 'UP' || sample.immediateGreenImpulse === true;
  return Object.freeze({
    rawPositiveComboCount: positives.length,
    rawAntiComboCount: antis.length,
    matchedPositiveComboIds: positives,
    matchedAntiComboIds: antis,
    positiveEvidenceFamilies: positiveFamilies,
    negativeEvidenceFamilies: independentNegativeFamilies,
    independentPositiveEvidenceCount: positiveFamilies.length,
    independentNegativeEvidenceCount: independentNegativeFamilies.length,
    evidenceConflictCount: positiveFamilies.filter(f => independentNegativeFamilies.includes(f)).length,
    highestAntiSeverity,
    antiSeverityCounts: antiSeverities.reduce((acc, severity) => ({ ...acc, [severity]: (acc[severity] ?? 0) + 1 }), {}),
    hardAntiComboPresent: highestAntiSeverity === LONG_ANTI_SEVERITY.HARD,
    cleanComboStackWouldAllowLogOnly: clean,
    stackedCleanComboWouldAllowLogOnly: stacked,
    eliteCleanComboStackWouldAllowLogOnly: stacked && eliteScore && microUp,
    longEvidenceSemanticsVersion: LONG_EVIDENCE_SEMANTICS_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}

export function deriveLongQualityBuckets(sample = {}) {
  const gate = finite(sample.longGateScore);
  const dna = finite(sample.bestDnaLongScore);
  const pf10 = finite(sample.longPostFee10EntryScore);
  const runner = finite(sample.longCandidateRunnerScoreAtEntry);
  const scores = [gate, dna, pf10, runner].filter(Number.isFinite);

  let qualityTier;
  if (scores.length === 0) {
    qualityTier = 'UNKNOWN';
  } else {
    // Consensus aggregation: a single inflated scorer must not promote the tier.
    // A high band requires either two scorers in-band OR the median in-band.
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    const inBand90 = scores.filter(v => v >= 90).length;
    const inBand80 = scores.filter(v => v >= 80).length;
    qualityTier =
      (inBand90 >= 2 || median >= 90) ? 'ELITE'     :
      (inBand80 >= 2 || median >= 80) ? 'STRONG'    :
      median >= 70 ? 'QUALIFIED' :
      median >= 50 ? 'WATCH'     : 'REJECT';

    // Observational regime cap: a hostile breadth regime caps the emitted tier.
    const ORDER = ['REJECT', 'WATCH', 'QUALIFIED', 'STRONG', 'ELITE'];
    const cap = sample.longMarketBreadthLabel === 'LONG_BREADTH_HARD_DANGER' ? 'WATCH'
              : sample.longMarketBreadthLabel === 'LONG_BREADTH_HOSTILE' ? 'QUALIFIED' : null;
    if (cap && ORDER.indexOf(qualityTier) > ORDER.indexOf(cap)) qualityTier = cap;
  }

  const dataQualityTier = sample.longFilterDataQuality ?? 'UNKNOWN';
  const eligibilityTier = sample.longShadowDecision?.includes?.('ALLOW') ? 'RESEARCH_ALLOW' : sample.longShadowDecision?.includes?.('BLOCK') ? 'RESEARCH_BLOCK' : 'RESEARCH_REVIEW';
  return Object.freeze({
    longQualityTierV2: qualityTier,
    longQualityTierV2Aggregation: 'CONSENSUS_MEDIAN',
    longEligibilityTierV2: eligibilityTier,
    longDataQualityTierV2: dataQualityTier,
    longQualityBucketVersion: 'LONG_QUALITY_BUCKET_V3_2026_06_17',
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}
