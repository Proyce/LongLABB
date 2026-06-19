import { describe, expect, it } from 'vitest';
import { finiteNumberOrNull, safeFixed, safeRound, safeSignedPercent, hasFiniteClosedPnl } from './safeFormat.js';

describe('null-safe render formatting', () => {
  it('never calls toFixed on nullish or non-finite values', () => {
    expect(safeFixed(null)).toBe('—');
    expect(safeFixed(undefined, 2, '?')).toBe('?');
    expect(safeFixed(Number.NaN)).toBe('—');
    expect(safeFixed(Infinity)).toBe('—');
    expect(safeSignedPercent(null)).toBe('—');
  });

  it('formats finite values and rounds safely', () => {
    expect(finiteNumberOrNull('1.25')).toBe(1.25);
    expect(safeFixed('1.25', 2)).toBe('1.25');
    expect(safeSignedPercent(-1.25, 1)).toBe('-1.3%');
    expect(safeRound(1.005, 2)).toBe(1.01);
  });

  it('excludes closed records whose PnL is not finite', () => {
    expect(hasFiniteClosedPnl({ closed: true, finalPnlPct: null })).toBe(false);
    expect(hasFiniteClosedPnl({ closed: true, finalPnlPct: 1.2 })).toBe(true);
  });
});
