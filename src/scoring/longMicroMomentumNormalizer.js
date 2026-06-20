// ─── LONG MICRO-MOMENTUM LABEL NORMALIZER ────────────────────────────────────
// Single source of truth for mapping every historical and current Long
// micro-momentum label to one canonical enum value.
//
// Rules:
//   - Call normalizeLongMicroMomentumLabel(label) from every Long research module.
//   - Unknown labels remain UNKNOWN rather than silently becoming positive.
//   - Alias arrays are not duplicated across files; add new aliases here only.

export const CANONICAL_LONG_MICRO = Object.freeze({
  GREEN_MULTI_CONFIRM: 'GREEN_MULTI_CONFIRM',
  GREEN_IMPULSE:       'GREEN_IMPULSE',
  CANDLE_SEQUENCE_UP:  'CANDLE_SEQUENCE_UP',
  RSI_ROLLOVER_UP:     'RSI_ROLLOVER_UP',
  RED_PRESSURE:        'RED_PRESSURE',
  NO_CONFIRMATION:     'NO_CONFIRMATION',
  UNKNOWN:             'UNKNOWN',
});

// Full alias table — add new historical names here; never in call sites.
const ALIAS_MAP = new Map([
  // GREEN_MULTI_CONFIRM
  ['MICRO_GREEN_MULTI_CONFIRM',       CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM],
  ['LONG_MICRO_GREEN_MULTI_CONFIRM',  CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM],
  ['MICRO_MULTI_CONFIRM',             CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM],

  // GREEN_IMPULSE
  ['MICRO_GREEN_IMPULSE',             CANONICAL_LONG_MICRO.GREEN_IMPULSE],
  ['LONG_MICRO_GREEN_IMPULSE',        CANONICAL_LONG_MICRO.GREEN_IMPULSE],
  ['MICRO_IMMEDIATE_GREEN_IMPULSE',   CANONICAL_LONG_MICRO.GREEN_IMPULSE],

  // CANDLE_SEQUENCE_UP
  ['MICRO_CANDLE_SEQUENCE_UP',        CANONICAL_LONG_MICRO.CANDLE_SEQUENCE_UP],
  ['LONG_MICRO_CANDLE_SEQUENCE_UP',   CANONICAL_LONG_MICRO.CANDLE_SEQUENCE_UP],
  ['CANDLE_SEQUENCE_UP',              CANONICAL_LONG_MICRO.CANDLE_SEQUENCE_UP],

  // RSI_ROLLOVER_UP
  ['MICRO_RSI_ROLLOVER_UP',           CANONICAL_LONG_MICRO.RSI_ROLLOVER_UP],
  ['LONG_MICRO_RSI_ROLLOVER_UP',      CANONICAL_LONG_MICRO.RSI_ROLLOVER_UP],
  ['RSI_ROLLOVER_UP',                 CANONICAL_LONG_MICRO.RSI_ROLLOVER_UP],

  // RED_PRESSURE
  ['MICRO_RED_PRESSURE',              CANONICAL_LONG_MICRO.RED_PRESSURE],
  ['LONG_MICRO_RED_PRESSURE',         CANONICAL_LONG_MICRO.RED_PRESSURE],
  ['MICRO_RED_IMPULSE',               CANONICAL_LONG_MICRO.RED_PRESSURE],
  ['MICRO_TICKS_DOWN',                CANONICAL_LONG_MICRO.RED_PRESSURE],
  ['LONG_MICRO_RED_IMPULSE',          CANONICAL_LONG_MICRO.RED_PRESSURE],

  // NO_CONFIRMATION
  ['MICRO_NO_LONG_CONFIRMATION',      CANONICAL_LONG_MICRO.NO_CONFIRMATION],
  ['MICRO_NO_CONFIRMATION',           CANONICAL_LONG_MICRO.NO_CONFIRMATION],
  ['LONG_MICRO_NO_CONFIRMATION',      CANONICAL_LONG_MICRO.NO_CONFIRMATION],
  ['MICRO_CONFIRMATION_ABSENT',       CANONICAL_LONG_MICRO.NO_CONFIRMATION],
]);

// Set of all canonical values for fast passthrough check.
const CANONICAL_VALUES = new Set(Object.values(CANONICAL_LONG_MICRO));

/**
 * Map any Long micro-momentum label (current or historical) to a canonical value.
 *
 * Returns { canonical, aliasUsed, raw } so callers can export all three for
 * cross-version traceability without re-implementing the lookup.
 *
 * `aliasUsed` is a boolean: true when an alias map lookup resolved the label.
 * null input or empty string yields canonical=UNKNOWN.
 */
export function normalizeLongMicroMomentumLabel(label) {
  if (label == null) {
    return { canonical: CANONICAL_LONG_MICRO.UNKNOWN, aliasUsed: false, raw: null };
  }
  const raw = String(label).trim();
  if (raw === '') {
    return { canonical: CANONICAL_LONG_MICRO.UNKNOWN, aliasUsed: false, raw };
  }
  // Canonical passthrough — label is already canonical.
  if (CANONICAL_VALUES.has(raw)) {
    return { canonical: raw, aliasUsed: false, raw };
  }
  // Alias lookup.
  const canonical = ALIAS_MAP.get(raw) ?? CANONICAL_LONG_MICRO.UNKNOWN;
  const aliasUsed = canonical !== CANONICAL_LONG_MICRO.UNKNOWN;
  return { canonical, aliasUsed, raw };
}

/** Convenience: return only the canonical string. null input → UNKNOWN. */
export function canonicalLongMicroLabel(label) {
  return normalizeLongMicroMomentumLabel(label).canonical;
}
