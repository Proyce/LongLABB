// ─── SHADOW LONG FILTERS ─────────────────────────────────────────────────────
// Separate filter state from SHORT samples. No shared state.

export const DEFAULT_SHADOW_LONG_FILTER_STATE = {
  hypothesisEligibleOnly: false,

  sourceBucketScope: "ALL",
  selectedDurationLabels: [],
  selectedAtrClasses: [],
  selectedOutcomeLabels: [],
  selectedDiagnosticLabels: [],
  selectedCloseReasons: [],

  selectedBtcDirections: [],
  selectedBtcRegimes: [],
  selectedEthDirections: [],
  selectedEthRegimes: [],

  selectedCvdLabels: [],
  selectedLast3TickDirections: [],
  selectedVwapContexts: [],

  minAtrPct: undefined,
  maxAtrPct: undefined,

  minAes: undefined,
  maxAes: undefined,

  minSourceDurationMs: undefined,
  maxSourceDurationMs: undefined,

  minShadowLongFeeNetNormPct: undefined,
  maxShadowLongFeeNetNormPct: undefined,

  minCombinedFlipMarginPct: undefined,
  maxCombinedFlipMarginPct: undefined,

  minRecoveryRatio: undefined,

  showOnlyFullRescue: false,
  showOnlyPartialRecovery: false,
  showOnlyWhipsaw: false,
  showOnlyLongWinners: false,
  showOnlyLongLosers: false,
  showOnlyCombinedWinners: false,
  showOnlyDataWarnings: false,

  selectedSamplingPrecision: [],
};

function matchesArray(arr, value) {
  return !arr || arr.length === 0 || arr.includes(value);
}

function matchesMin(min, value) {
  return min == null || (value != null && value >= min);
}

function matchesMax(max, value) {
  return max == null || (value != null && value <= max);
}

function isWhipsaw(audit) {
  return (
    (audit.sourceShortDurationMs ?? Infinity) <= 60_000 &&
    audit.mirrorCloseReason === "SL" &&
    (audit.durationMs ?? Infinity) <= 60_000
  );
}

export function applyShadowLongFilters(audits, filters) {
  const f = { ...DEFAULT_SHADOW_LONG_FILTER_STATE, ...filters };

  return audits.filter(a => {
    if (f.hypothesisEligibleOnly && !a.shadowLongHypothesisEligible) return false;

    if (f.sourceBucketScope !== "ALL") {
      if (a.sourceShortParentBucket !== f.sourceBucketScope) return false;
    }

    if (!matchesArray(f.selectedDurationLabels, a.sourceShortDurationLabel)) return false;
    if (!matchesArray(f.selectedAtrClasses,     a.shadowLongAtrClass))        return false;
    if (!matchesArray(f.selectedOutcomeLabels,  a.outcomeLabel))               return false;
    if (!matchesArray(f.selectedCloseReasons,   a.mirrorCloseReason))          return false;

    if (f.selectedDiagnosticLabels?.length > 0) {
      const diags = a.diagnosticLabels ?? [];
      if (!f.selectedDiagnosticLabels.some(d => diags.includes(d))) return false;
    }

    if (!matchesArray(f.selectedBtcDirections,     a.btcDirection))        return false;
    if (!matchesArray(f.selectedBtcRegimes,         a.btcRegime))           return false;
    if (!matchesArray(f.selectedEthDirections,      a.ethDirection))        return false;
    if (!matchesArray(f.selectedEthRegimes,         a.ethRegime))           return false;
    if (!matchesArray(f.selectedCvdLabels,          a.cvdLabel))            return false;
    if (!matchesArray(f.selectedLast3TickDirections, a.last3TicksDirection)) return false;

    if (!matchesMin(f.minAtrPct, a.atrPct))   return false;
    if (!matchesMax(f.maxAtrPct, a.atrPct))   return false;
    if (!matchesMin(f.minAes,    a.aes))       return false;
    if (!matchesMax(f.maxAes,    a.aes))       return false;

    if (!matchesMin(f.minSourceDurationMs, a.sourceShortDurationMs)) return false;
    if (!matchesMax(f.maxSourceDurationMs, a.sourceShortDurationMs)) return false;

    if (!matchesMin(f.minShadowLongFeeNetNormPct, a.shadowLongFeeNetNormPnlPct)) return false;
    if (!matchesMax(f.maxShadowLongFeeNetNormPct, a.shadowLongFeeNetNormPnlPct)) return false;

    if (!matchesMin(f.minCombinedFlipMarginPct, a.combinedCompoundedMarginPnlPct)) return false;
    if (!matchesMax(f.maxCombinedFlipMarginPct, a.combinedCompoundedMarginPnlPct)) return false;

    if (f.minRecoveryRatio != null && (a.shortLossRecoveryRatio ?? -1) < f.minRecoveryRatio) return false;

    if (f.showOnlyFullRescue    && !a.fullyRecoveredShortLoss) return false;
    if (f.showOnlyPartialRecovery && !a.partialRecovery)       return false;
    if (f.showOnlyWhipsaw       && !isWhipsaw(a))              return false;
    if (f.showOnlyLongWinners   && (a.shadowLongFeeNetNormPnlPct ?? 0) <= 0)  return false;
    if (f.showOnlyLongLosers    && (a.shadowLongFeeNetNormPnlPct ?? 0) >= 0)  return false;
    if (f.showOnlyCombinedWinners && (a.combinedCompoundedMarginPnlPct ?? -1) <= 0) return false;

    if (f.showOnlyDataWarnings) {
      const hasWarning = (a.dataWarnings ?? []).length > 0 || a.samplingPrecision === "COARSE";
      if (!hasWarning) return false;
    }

    if (f.selectedSamplingPrecision?.length > 0) {
      if (!f.selectedSamplingPrecision.includes(a.samplingPrecision)) return false;
    }

    return true;
  });
}

export function buildShadowLongFilterOptions(audits) {
  const uniq = (fn) => [...new Set(audits.map(fn).filter(Boolean))].sort();
  return {
    durationLabels:   uniq(a => a.sourceShortDurationLabel),
    atrClasses:       uniq(a => a.shadowLongAtrClass),
    outcomeLabels:    uniq(a => a.outcomeLabel),
    closeReasons:     uniq(a => a.mirrorCloseReason),
    diagnosticLabels: [...new Set(audits.flatMap(a => a.diagnosticLabels ?? []))].sort(),
    btcDirections:    uniq(a => a.btcDirection),
    btcRegimes:       uniq(a => a.btcRegime),
    ethDirections:    uniq(a => a.ethDirection),
    ethRegimes:       uniq(a => a.ethRegime),
    cvdLabels:        uniq(a => a.cvdLabel),
    last3TickDirections: uniq(a => a.last3TicksDirection),
    samplingPrecisions:  uniq(a => a.samplingPrecision),
  };
}
