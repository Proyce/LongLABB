// ─── LONG VOLUME ROLE ────────────────────────────────────────────────────────
// Classifies the role that observed volume structure plays in a long candidate.
// LOG_ONLY: informational, never an execution gate.

export const LONG_VOLUME_ROLE = Object.freeze({
  // Volume pattern actively supports the long structure (e.g. buy-side CVD expansion,
  // increasing volume on green candles, aggressive bid absorption).
  POSITIVE_STRUCTURE_AMPLIFIER: 'POSITIVE_STRUCTURE_AMPLIFIER',

  // Volume pattern actively works against the long structure (e.g. sell-side CVD,
  // high volume on red impulse, ask-side pressure dominating).
  NEGATIVE_STRUCTURE_AMPLIFIER: 'NEGATIVE_STRUCTURE_AMPLIFIER',

  // Volume present but neither confirms nor contradicts the directional thesis.
  NEUTRAL: 'NEUTRAL',

  // Volume evidence is present but does not meet the minimum quality bar to classify.
  UNQUALIFIED: 'UNQUALIFIED',

  // Volume data is absent or too stale to classify.
  UNAVAILABLE: 'UNAVAILABLE',
});

/**
 * Derive a `LONG_VOLUME_ROLE` value from a candidate's volume-related fields.
 * Returns `UNAVAILABLE` when no usable volume signals exist.
 *
 * @param {object} candidate
 * @returns {string} LONG_VOLUME_ROLE member
 */
export function deriveLongVolumeRole(candidate) {
  if (candidate == null) return LONG_VOLUME_ROLE.UNAVAILABLE;

  const cvd = candidate.cvdLabel ?? candidate.entryCvdLabel ?? null;
  const volAccel = candidate.volAccel ?? null;
  const buyRatio = candidate.buyRatio ?? candidate.takerBuyRatio ?? null;

  const hasCvd      = cvd != null;
  const hasVolAccel = volAccel != null && Number.isFinite(Number(volAccel));
  const hasBuyRatio = buyRatio != null && Number.isFinite(Number(buyRatio));

  if (!hasCvd && !hasVolAccel && !hasBuyRatio) return LONG_VOLUME_ROLE.UNAVAILABLE;

  const cvdBull = cvd === 'BULL' || cvd === 'BULLISH';
  const cvdBear = cvd === 'BEAR' || cvd === 'BEARISH';

  // qualifiedStructure = confirmed by trade-flow signals (not CVD alone).
  // CVD is a positiveFlow signal but requires corroboration to count toward
  // POSITIVE_STRUCTURE_AMPLIFIER — CVD BULL alone → NEUTRAL (R-15).
  let positiveFlow = 0;    // CVD-based directional flow signal
  let qualifiedStructure = 0; // Trade-flow structure signals (volAccel, buyRatio)
  let negativeSignals = 0;

  if (cvdBull) positiveFlow++;
  if (cvdBear) negativeSignals++;

  if (hasVolAccel) {
    const va = Number(volAccel);
    if (va > 0.15) { positiveFlow++; qualifiedStructure++; }
    else if (va < -0.15) negativeSignals++;
  }

  if (hasBuyRatio) {
    const br = Number(buyRatio);
    if (br > 0.55) { positiveFlow++; qualifiedStructure++; }
    else if (br < 0.45) negativeSignals++;
  }

  if (negativeSignals >= 2) return LONG_VOLUME_ROLE.NEGATIVE_STRUCTURE_AMPLIFIER;

  // POSITIVE_STRUCTURE_AMPLIFIER: positiveFlow signals present AND at least one
  // qualifiedStructure (trade-flow) signal confirms. CVD BULL alone does not qualify.
  if (positiveFlow >= 1 && qualifiedStructure >= 1) return LONG_VOLUME_ROLE.POSITIVE_STRUCTURE_AMPLIFIER;

  if (negativeSignals === 1 && positiveFlow === 0) return LONG_VOLUME_ROLE.NEGATIVE_STRUCTURE_AMPLIFIER;
  if (positiveFlow > 0 || negativeSignals > 0) return LONG_VOLUME_ROLE.NEUTRAL;
  return LONG_VOLUME_ROLE.UNQUALIFIED;
}
