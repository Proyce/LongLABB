import { describe, expect, it } from 'vitest';
import {
  normalizeLongMicroMomentumLabel,
  canonicalLongMicroLabel,
  CANONICAL_LONG_MICRO,
} from './longMicroMomentumNormalizer.js';

describe('longMicroMomentumNormalizer', () => {
  describe('canonical passthrough', () => {
    it.each(Object.values(CANONICAL_LONG_MICRO))(
      'canonical label %s normalizes to itself',
      (label) => {
        const { canonical, aliasUsed } = normalizeLongMicroMomentumLabel(label);
        expect(canonical).toBe(label);
        expect(aliasUsed).toBe(false);
      },
    );
  });

  describe('historical alias resolution', () => {
    it.each([
      ['MICRO_GREEN_MULTI_CONFIRM',       CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM],
      ['LONG_MICRO_GREEN_MULTI_CONFIRM',  CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM],
      ['MICRO_MULTI_CONFIRM',             CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM],
      ['MICRO_GREEN_IMPULSE',             CANONICAL_LONG_MICRO.GREEN_IMPULSE],
      ['LONG_MICRO_GREEN_IMPULSE',        CANONICAL_LONG_MICRO.GREEN_IMPULSE],
      ['MICRO_CANDLE_SEQUENCE_UP',        CANONICAL_LONG_MICRO.CANDLE_SEQUENCE_UP],
      ['LONG_MICRO_CANDLE_SEQUENCE_UP',   CANONICAL_LONG_MICRO.CANDLE_SEQUENCE_UP],
      ['MICRO_RSI_ROLLOVER_UP',           CANONICAL_LONG_MICRO.RSI_ROLLOVER_UP],
      ['LONG_MICRO_RSI_ROLLOVER_UP',      CANONICAL_LONG_MICRO.RSI_ROLLOVER_UP],
      ['MICRO_RED_PRESSURE',              CANONICAL_LONG_MICRO.RED_PRESSURE],
      ['LONG_MICRO_RED_PRESSURE',         CANONICAL_LONG_MICRO.RED_PRESSURE],
      ['MICRO_RED_IMPULSE',               CANONICAL_LONG_MICRO.RED_PRESSURE],
      ['MICRO_TICKS_DOWN',                CANONICAL_LONG_MICRO.RED_PRESSURE],
      ['MICRO_NO_CONFIRMATION',           CANONICAL_LONG_MICRO.NO_CONFIRMATION],
      ['LONG_MICRO_NO_CONFIRMATION',      CANONICAL_LONG_MICRO.NO_CONFIRMATION],
    ])('alias %s → %s', (alias, expected) => {
      const { canonical, aliasUsed } = normalizeLongMicroMomentumLabel(alias);
      expect(canonical).toBe(expected);
      expect(aliasUsed).toBe(true);
    });
  });

  describe('unknown / null / empty inputs', () => {
    it('returns UNKNOWN for null', () => {
      const { canonical } = normalizeLongMicroMomentumLabel(null);
      expect(canonical).toBe(CANONICAL_LONG_MICRO.UNKNOWN);
    });

    it('returns UNKNOWN for empty string', () => {
      const { canonical } = normalizeLongMicroMomentumLabel('');
      expect(canonical).toBe(CANONICAL_LONG_MICRO.UNKNOWN);
    });

    it('returns UNKNOWN for unrecognized label', () => {
      const { canonical } = normalizeLongMicroMomentumLabel('SOME_FUTURE_LABEL_XYZ');
      expect(canonical).toBe(CANONICAL_LONG_MICRO.UNKNOWN);
    });
  });

  describe('canonicalLongMicroLabel convenience wrapper', () => {
    it('returns canonical string directly', () => {
      expect(canonicalLongMicroLabel('MICRO_GREEN_MULTI_CONFIRM')).toBe(CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM);
      expect(canonicalLongMicroLabel(null)).toBe(CANONICAL_LONG_MICRO.UNKNOWN);
    });
  });
});
