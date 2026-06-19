// ─── LONG GATE REGIME CONFIG (LOG ONLY) ──────────────────────────────────────
// Regime-awareness for the observer-mode long gate. These values adjust the
// EMITTED gate score/tier label so the observation reflects the macro regime.
// They do NOT block, skip, or alter candidate creation. Tuned from the
// 2026-06-17 batch, where every hostile-regime PREMIUM/STRONG tier faded.

import { LONG_BREADTH_LABEL } from '../marketRegime/longMarketBreadthLogOnly.js';

export const LONG_GATE_REGIME_VERSION = 'LONG_GATE_REGIME_V1_2026_06_17';

// Additive penalty/credit applied to the raw micro-structure gate score
// before the final clamp. Missing/unknown labels contribute 0.
export const LONG_GATE_REGIME_PENALTY = Object.freeze({
  breadth: {
    [LONG_BREADTH_LABEL.HARD_DANGER]: -30,
    [LONG_BREADTH_LABEL.HOSTILE]:     -15,
    [LONG_BREADTH_LABEL.MIXED]:        -6,
    [LONG_BREADTH_LABEL.SUPPORTIVE]:   +4,
    [LONG_BREADTH_LABEL.STRONG]:       +8,
  },
  context: {
    LONG_CONTEXT_STRONG_HEADWIND: -20,
    LONG_CONTEXT_HEADWIND:        -10,
    LONG_CONTEXT_NEUTRAL:          0,
    LONG_CONTEXT_TAILWIND:        +6,
    LONG_CONTEXT_STRONG_TAILWIND: +10,
  },
});

// Observational ceiling on the EMITTED tier label by breadth regime. This caps
// what tier the log reports; it does not withhold a candidate.
export const LONG_GATE_TIER_CEILING = Object.freeze({
  [LONG_BREADTH_LABEL.HARD_DANGER]: 'WATCH',
  [LONG_BREADTH_LABEL.HOSTILE]:     'STRONG',
});

export const LONG_GATE_TIER_ORDER = Object.freeze([
  'RESEARCH_REJECT', 'WATCH', 'STRONG', 'PREMIUM',
]);

export function longGateRegimePenalty(breadthLabel, contextLabel) {
  const b = LONG_GATE_REGIME_PENALTY.breadth[breadthLabel] ?? 0;
  const c = LONG_GATE_REGIME_PENALTY.context[contextLabel] ?? 0;
  return b + c;
}

export function applyLongGateTierCeiling(rawTier, breadthLabel) {
  if (rawTier === 'INSUFFICIENT_DATA') return rawTier;
  const ceiling = LONG_GATE_TIER_CEILING[breadthLabel];
  if (!ceiling) return rawTier;
  return LONG_GATE_TIER_ORDER.indexOf(rawTier) > LONG_GATE_TIER_ORDER.indexOf(ceiling)
    ? ceiling
    : rawTier;
}
