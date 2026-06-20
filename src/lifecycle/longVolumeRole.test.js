import { describe, expect, it } from 'vitest';
import { deriveLongVolumeRole, LONG_VOLUME_ROLE } from './longVolumeRole.js';

describe('deriveLongVolumeRole', () => {
  it('returns UNAVAILABLE when no volume signals are present', () => {
    expect(deriveLongVolumeRole({})).toBe(LONG_VOLUME_ROLE.UNAVAILABLE);
    expect(deriveLongVolumeRole(null)).toBe(LONG_VOLUME_ROLE.UNAVAILABLE);
  });

  it('returns POSITIVE_STRUCTURE_AMPLIFIER for CVD=BULL alone', () => {
    expect(deriveLongVolumeRole({ cvdLabel: 'BULL' })).toBe(LONG_VOLUME_ROLE.POSITIVE_STRUCTURE_AMPLIFIER);
  });

  it('returns NEGATIVE_STRUCTURE_AMPLIFIER for CVD=BEAR alone', () => {
    expect(deriveLongVolumeRole({ cvdLabel: 'BEAR' })).toBe(LONG_VOLUME_ROLE.NEGATIVE_STRUCTURE_AMPLIFIER);
  });

  it('returns POSITIVE_STRUCTURE_AMPLIFIER for CVD=BULL + high volAccel', () => {
    expect(deriveLongVolumeRole({ cvdLabel: 'BULL', volAccel: 0.25 })).toBe(LONG_VOLUME_ROLE.POSITIVE_STRUCTURE_AMPLIFIER);
  });

  it('returns NEGATIVE_STRUCTURE_AMPLIFIER for CVD=BEAR + low buy ratio', () => {
    expect(deriveLongVolumeRole({ cvdLabel: 'BEAR', buyRatio: 0.35 })).toBe(LONG_VOLUME_ROLE.NEGATIVE_STRUCTURE_AMPLIFIER);
  });

  it('returns NEUTRAL when positive and negative signals cancel', () => {
    // One positive (CVD BULL) + one negative (low buyRatio) → 1 vs 1 → NEUTRAL
    expect(deriveLongVolumeRole({ cvdLabel: 'BULL', buyRatio: 0.35 })).toBe(LONG_VOLUME_ROLE.NEUTRAL);
  });

  it('uses entryCvdLabel as fallback', () => {
    expect(deriveLongVolumeRole({ entryCvdLabel: 'BULL' })).toBe(LONG_VOLUME_ROLE.POSITIVE_STRUCTURE_AMPLIFIER);
  });

  it('LONG_VOLUME_ROLE enum is frozen', () => {
    expect(Object.isFrozen(LONG_VOLUME_ROLE)).toBe(true);
  });
});
