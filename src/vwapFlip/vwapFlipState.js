// ─── VWAP FLIP STATE MACHINE ─────────────────────────────────────────────────
// Tracks VWAP reclaim / loss transitions per-symbol with history.
// A single ABOVE_VWAP / BELOW_VWAP snapshot is insufficient for LongLAB.

export const VWAP_STATES = {
  BELOW:                 "VWAP_BELOW",
  RECLAIM_ATTEMPT:       "VWAP_RECLAIM_ATTEMPT",
  RECLAIM_CONFIRMED:     "VWAP_RECLAIM_CONFIRMED",
  RETEST_IN_PROGRESS:    "VWAP_RETEST_IN_PROGRESS",
  RETEST_HOLD:           "VWAP_RETEST_HOLD",
  ABOVE_SUPPORT:         "VWAP_ABOVE_SUPPORT",
  RECLAIM_FAILED:        "VWAP_RECLAIM_FAILED",
  LOSS_AFTER_RECLAIM:    "VWAP_LOSS_AFTER_RECLAIM",
  UNKNOWN:               "VWAP_STATE_UNKNOWN",
};

// Minimum bars above VWAP before reclaim is "confirmed"
const DEFAULT_RECLAIM_MIN_BARS = 2;
// Retest depth: how far below VWAP price can dip during a retest
const DEFAULT_RETEST_MAX_DEPTH_PCT = 0.15;

// ─── STATE TRANSITIONS ───────────────────────────────────────────────────────

/**
 * Compute the next VWAP state given current price vs VWAP and history.
 * @param {object} params
 * @param {string} params.currentState  - current VWAP_STATES value
 * @param {string} params.priceVsVwapLabel - "ABOVE_VWAP" | "BELOW_VWAP" | "AT_VWAP"
 * @param {string} params.prevPriceVsVwapLabel - previous tick's label
 * @param {number} params.barsAboveAfterReclaim - consecutive bars above VWAP since reclaim
 * @param {string} params.cvdLabel - "BULL" | "NEUT" | "BEAR"
 * @param {boolean} params.greenImpulse - green impulse detected
 * @param {number} params.priceVsVwapPct - price % vs VWAP
 * @param {object} params.config
 */
export function transitionVwapState({
  currentState = VWAP_STATES.UNKNOWN,
  priceVsVwapLabel,
  prevPriceVsVwapLabel,
  barsAboveAfterReclaim = 0,
  cvdLabel,
  greenImpulse = false,
  priceVsVwapPct = 0,
  config = {},
}) {
  const minBars     = config.reclaimMinBars ?? DEFAULT_RECLAIM_MIN_BARS;
  const retestDepth = config.retestMaxDepthPct ?? DEFAULT_RETEST_MAX_DEPTH_PCT;
  const cvdBear     = cvdLabel === "BEAR";
  const cvdBullOk   = cvdLabel === "BULL" || cvdLabel === "NEUT";
  const isAbove     = priceVsVwapLabel === "ABOVE_VWAP" || priceVsVwapLabel === "AT_VWAP";
  const isBelow     = priceVsVwapLabel === "BELOW_VWAP";
  const crossedUp   = isAbove && (prevPriceVsVwapLabel === "BELOW_VWAP");
  const crossedDown = isBelow && (prevPriceVsVwapLabel === "ABOVE_VWAP" || prevPriceVsVwapLabel === "AT_VWAP");

  switch (currentState) {
    case VWAP_STATES.UNKNOWN:
    case VWAP_STATES.BELOW:
      if (crossedUp) return VWAP_STATES.RECLAIM_ATTEMPT;
      if (isBelow)   return VWAP_STATES.BELOW;
      if (isAbove)   return VWAP_STATES.RECLAIM_ATTEMPT;
      return currentState;

    case VWAP_STATES.RECLAIM_ATTEMPT:
      if (isBelow && cvdBear) return VWAP_STATES.RECLAIM_FAILED;
      if (isBelow)            return VWAP_STATES.RECLAIM_FAILED;
      if (isAbove && barsAboveAfterReclaim >= minBars && cvdBullOk) {
        return VWAP_STATES.RECLAIM_CONFIRMED;
      }
      if (isAbove) return VWAP_STATES.RECLAIM_ATTEMPT;
      return currentState;

    case VWAP_STATES.RECLAIM_CONFIRMED:
    case VWAP_STATES.ABOVE_SUPPORT:
      if (isBelow && Math.abs(priceVsVwapPct) <= retestDepth) return VWAP_STATES.RETEST_IN_PROGRESS;
      if (isBelow) return VWAP_STATES.LOSS_AFTER_RECLAIM;
      return VWAP_STATES.ABOVE_SUPPORT;

    case VWAP_STATES.RETEST_IN_PROGRESS:
      if (isBelow && cvdBear) return VWAP_STATES.RECLAIM_FAILED;
      if (isBelow)            return VWAP_STATES.RETEST_IN_PROGRESS;
      if (isAbove && greenImpulse) return VWAP_STATES.RETEST_HOLD;
      if (isAbove) return VWAP_STATES.RECLAIM_CONFIRMED;
      return currentState;

    case VWAP_STATES.RETEST_HOLD:
      if (isBelow) return VWAP_STATES.LOSS_AFTER_RECLAIM;
      return VWAP_STATES.ABOVE_SUPPORT;

    case VWAP_STATES.RECLAIM_FAILED:
      if (crossedUp) return VWAP_STATES.RECLAIM_ATTEMPT;
      return VWAP_STATES.BELOW;

    case VWAP_STATES.LOSS_AFTER_RECLAIM:
      if (crossedUp) return VWAP_STATES.RECLAIM_ATTEMPT;
      return VWAP_STATES.BELOW;

    default:
      return VWAP_STATES.UNKNOWN;
  }
}

// ─── LONG VWAP LABELS ────────────────────────────────────────────────────────

export function classifyVwapLongLabel(state, greenImpulse, cvdLabel) {
  const cvdBull = cvdLabel === "BULL";
  switch (state) {
    case VWAP_STATES.RECLAIM_ATTEMPT:
      return "LONG_VWAP_RECLAIM_ATTEMPT";
    case VWAP_STATES.RECLAIM_CONFIRMED:
      if (cvdBull)        return "LONG_VWAP_RECLAIM_WITH_CVD_BULL";
      if (greenImpulse)   return "LONG_VWAP_RECLAIM_WITH_GREEN_IMPULSE";
      return "LONG_VWAP_RECLAIM_CONFIRMED";
    case VWAP_STATES.RETEST_HOLD:
      return "LONG_VWAP_RETEST_HOLD";
    case VWAP_STATES.ABOVE_SUPPORT:
      return "LONG_ABOVE_VWAP_SUPPORT";
    case VWAP_STATES.RECLAIM_FAILED:
      return "LONG_VWAP_RECLAIM_FAILURE";
    case VWAP_STATES.LOSS_AFTER_RECLAIM:
      return "LONG_VWAP_LOSS_AFTER_RECLAIM";
    case VWAP_STATES.BELOW:
      return "BELOW_VWAP_SELL_PRESSURE_DANGER";
    default:
      return "VWAP_STATE_UNKNOWN";
  }
}

// ─── QUALITY SCORE ───────────────────────────────────────────────────────────

export function computeVwapReclaimQualityScore(state, barsAboveAfterReclaim, cvdLabel) {
  let score = 0;
  const cvdBull = cvdLabel === "BULL";

  switch (state) {
    case VWAP_STATES.RETEST_HOLD:          score = 90; break;
    case VWAP_STATES.ABOVE_SUPPORT:        score = 75; break;
    case VWAP_STATES.RECLAIM_CONFIRMED:    score = 65; break;
    case VWAP_STATES.RECLAIM_ATTEMPT:      score = 40; break;
    case VWAP_STATES.RETEST_IN_PROGRESS:   score = 30; break;
    case VWAP_STATES.RECLAIM_FAILED:       score = 10; break;
    case VWAP_STATES.LOSS_AFTER_RECLAIM:   score = 5;  break;
    default:                               score = 0;
  }

  if (cvdBull && score > 0) score = Math.min(100, score + 10);
  if (barsAboveAfterReclaim >= 3) score = Math.min(100, score + 5);

  return score;
}
