// ─── LONG WINNING SIGNAL DERIVATIONS V1 ──────────────────────────────────────
// Pure ENTRY_FINAL helpers shared by the gate, combo registry and filters.
// Research only: no function in this module may alter execution.

export const LONG_WINNING_SIGNALS_VERSION = "LONG_WINNING_SIGNALS_V1";

const MICRO_UP_LABELS = new Set([
  "MICRO_GREEN_MULTI_CONFIRM",
  "MICRO_GREEN_IMPULSE",
  "MICRO_TICKS_UP",
]);

function normalizeEnum(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}


export function deriveLongMicroMomentumLabel(sample = {}) {
  const existing = normalizeEnum(sample.longMicroMomentumLabel ?? sample.microMomentumLabel);
  if (existing) return existing;

  const last3 = normalizeEnum(sample.last3TicksDirection);
  const immediateGreen = sample.immediateGreenImpulse === true;
  const greenDetected = sample.greenImpulseDetected === true;
  const immediateRed = sample.immediateRedImpulse === true;
  const redDetected = sample.redImpulseDetected === true;
  const rsiRolloverUp = sample.hasRsiRolloverUp === true ||
    (Number.isFinite(Number(sample.rsi1mDelta)) && Number(sample.rsi1mDelta) > 0 &&
      Number.isFinite(Number(sample.rsiSpread1m3m)) && Number(sample.rsiSpread1m3m) >= 0);

  if ((immediateGreen || greenDetected) && last3 === 'UP') return 'MICRO_GREEN_MULTI_CONFIRM';
  if (immediateGreen || greenDetected) return 'MICRO_GREEN_IMPULSE';
  if (last3 === 'UP') return 'MICRO_TICKS_UP';
  if (rsiRolloverUp) return 'MICRO_RSI_ROLLOVER_UP';
  if (immediateRed || redDetected || last3 === 'DOWN') return 'MICRO_RED_PRESSURE';
  return 'MICRO_NO_LONG_CONFIRMATION';
}

function splitLabels(value) {
  if (Array.isArray(value)) return value.map(normalizeEnum).filter(Boolean);
  return String(value ?? "")
    .split("|")
    .map(normalizeEnum)
    .filter(Boolean);
}

export function deriveLongMicroUpConfirmation(sample = {}) {
  const reasons = [];
  if (sample.last3TicksDirection === "UP") reasons.push("LAST_3_TICKS_UP");
  if (sample.immediateGreenImpulse === true) reasons.push("IMMEDIATE_GREEN_IMPULSE");
  const microLabel = normalizeEnum(sample.longMicroMomentumLabel ?? sample.microMomentumLabel);
  if (MICRO_UP_LABELS.has(microLabel)) reasons.push(microLabel);

  const uniqueReasons = [...new Set(reasons)];
  return {
    longMicroUpConfirmation: uniqueReasons.length > 0,
    longMicroUpConfirmationReasons: uniqueReasons,
    longMicroUpConfirmationSourceCount: uniqueReasons.length,
  };
}

export function deriveRsiLongMomentumExpansion(sample = {}) {
  const labels = splitLabels(sample.rsiLongSetupLabel ?? sample.rsiSetupLabel);
  const matched = labels.some(label =>
    label === "RSI_LONG_MOMENTUM_EXPANSION" ||
    label.startsWith("RSI_LONG_MOMENTUM_EXPANSION_")
  );
  return {
    rsiLongMomentumExpansion: matched,
    rsiLongMomentumExpansionSource: matched ? "RSI_LONG_SETUP_LABEL" : null,
  };
}

export function deriveMacdBullishExpansion(sample = {}) {
  if (sample.macdBullishExpansion === true) return true;
  if (sample.macdBullishExpansion === false) return false;

  const states = [
    sample.macdHistogramState1m,
    sample.macdHistogramState3m,
    sample.macdState1m,
  ].map(normalizeEnum);
  if (states.some(state => state.includes("POSITIVE_EXPANDING") || state.includes("BULLISH_EXPANDING"))) {
    return true;
  }
  // Symmetric explicit-false branch: a clearly bearish/contracting histogram
  // state is a definite "not expanding", not unknown.
  if (states.some(state => state.includes("CONTRACTING") || state.includes("NEGATIVE") || state.includes("BEARISH"))) {
    return false;
  }

  const histogram = Number(sample.macdHistogram1m ?? sample.macdHistogram ?? sample.macd?.histogram);
  // Prefer an explicit delta; otherwise use the histogram slope (rate of change)
  // the feed actually supplies, or compute it from the previous histogram.
  const prevHistogram = Number(
    sample.macdHistogramPrev1m ?? sample.macdHistogramPrevious1m ?? sample.macdHistogramPrev ?? NaN,
  );
  const delta = Number(
    sample.macdHistogramDelta1m ?? sample.macdHistogramDelta ?? sample.macd?.histogramDelta ??
    sample.macdHistogramSlope1m ?? sample.macdHistogramSlope ?? sample.macd?.histogramSlope ??
    (Number.isFinite(histogram) && Number.isFinite(prevHistogram) ? histogram - prevHistogram : NaN),
  );
  if (Number.isFinite(histogram) && Number.isFinite(delta)) return histogram > 0 && delta > 0;
  return null;
}

export function classifyLongGateResearchBandV2(score) {
  if (score == null || score === "" || !Number.isFinite(Number(score))) return "INSUFFICIENT_DATA";
  const value = Number(score);
  if (value >= 95) return "GATE_ELITE_95";
  if (value >= 90) return "GATE_PREMIUM_90";
  if (value >= 85) return "GATE_PREMIUM_85";
  if (value >= 75) return "GATE_STRONG_75";
  if (value >= 60) return "GATE_WATCH_60";
  return "GATE_RESEARCH_REJECT";
}

export function normalizeLongCvdLabel(sample = {}) {
  const raw = normalizeEnum(sample.entryCvdLabel ?? sample.cvdLabel);
  if (raw === "BULLISH") return "BULL";
  if (raw === "BEARISH") return "BEAR";
  if (raw === "NEUTRAL") return "NEUT";
  return raw || null;
}
