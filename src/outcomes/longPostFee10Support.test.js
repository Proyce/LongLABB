import { describe, it, expect } from 'vitest';
import {
  calculateLongMarginPnlPct,
  calculateLongAdverseMovePct,
  calculatePostFee10OutcomeAssessment,
  flattenPostFee10OutcomeAssessment,
  evaluatePostFee10LiveConfirmation,
  assignAllPostFee10WinnerRanks,
  buildPostFee10AnalyticsReport,
  POST_FEE_10_CSV_HEADERS,
  POST_FEE_10_DEFAULT_FIELDS,
  postFee10CSVRow,
} from './longPostFee10Support.js';

// ─── LONG POLARITY TESTS ──────────────────────────────────────────────────────

describe('calculateLongMarginPnlPct', () => {
  it('treats upward price movement as favorable for LONG', () => {
    expect(
      calculateLongMarginPnlPct({ entryPrice: 100, currentPrice: 102, leverage: 5 })
    ).toBeCloseTo(10);
  });

  it('treats downward movement as adverse for LONG', () => {
    expect(
      calculateLongMarginPnlPct({ entryPrice: 100, currentPrice: 98, leverage: 5 })
    ).toBeCloseTo(-10);
  });

  it('returns null for missing entry price', () => {
    expect(calculateLongMarginPnlPct({ entryPrice: null, currentPrice: 100, leverage: 5 })).toBeNull();
  });

  it('returns null for zero entry price', () => {
    expect(calculateLongMarginPnlPct({ entryPrice: 0, currentPrice: 100, leverage: 5 })).toBeNull();
  });

  it('returns null for non-finite values', () => {
    expect(calculateLongMarginPnlPct({ entryPrice: NaN, currentPrice: 100, leverage: 5 })).toBeNull();
  });

  it('handles leverage=1 correctly', () => {
    expect(
      calculateLongMarginPnlPct({ entryPrice: 100, currentPrice: 110, leverage: 1 })
    ).toBeCloseTo(10);
  });
});

describe('calculateLongAdverseMovePct', () => {
  it('treats downward movement as adverse for LONG', () => {
    expect(
      calculateLongAdverseMovePct({ entryPrice: 100, currentPrice: 98 })
    ).toBeCloseTo(2);
  });

  it('treats upward movement as non-adverse for LONG (negative adverse)', () => {
    expect(
      calculateLongAdverseMovePct({ entryPrice: 100, currentPrice: 105 })
    ).toBeCloseTo(-5);
  });

  it('returns null for missing entry price', () => {
    expect(calculateLongAdverseMovePct({ entryPrice: null, currentPrice: 100 })).toBeNull();
  });
});

// ─── LIVE CONFIRMATION POLARITY TESTS ────────────────────────────────────────

const greenTrade = {
  entryTime: Date.now() - 60_000,
  entryPrice: 100,
  leverage: 5,
  priceHistory: [
    { t: Date.now() - 50_000, p: 101 },
    { t: Date.now() - 30_000, p: 102 },
    { t: Date.now() - 10_000, p: 103 },
  ],
  immediateGreenImpulse: true,
  greenImpulseDetected: true,
  immediateRedImpulse: false,
  longVwapContextLabel: 'VWAP_RECLAIM_CONFIRMED',
  btcTacticalDirectionLabel: 'UP',
};

const redTrade = {
  entryTime: Date.now() - 60_000,
  entryPrice: 100,
  leverage: 5,
  priceHistory: [
    { t: Date.now() - 50_000, p: 99 },
    { t: Date.now() - 30_000, p: 98 },
    { t: Date.now() - 10_000, p: 97 },
  ],
  immediateRedImpulse: true,
  redImpulseDetected: true,
  immediateGreenImpulse: false,
  longVwapContextLabel: 'VWAP_RECLAIM_FAILED',
  btcTacticalDirectionLabel: 'DOWN',
};

describe('evaluatePostFee10LiveConfirmation - LONG polarity', () => {
  it('rewards green confirmation more than red danger', () => {
    const green = evaluatePostFee10LiveConfirmation(greenTrade);
    const red   = evaluatePostFee10LiveConfirmation(redTrade);

    expect(green.postFee10LiveConfirmationScore).toBeGreaterThan(
      red.postFee10LiveConfirmationScore
    );
  });

  it('green impulse adds positive score (not negative)', () => {
    const baseScore = 50;
    const result = evaluatePostFee10LiveConfirmation({
      entryTime: Date.now() - 10_000,
      entryPrice: 100,
      leverage: 1,
      priceHistory: [{ t: Date.now() - 5_000, p: 101 }],
      immediateGreenImpulse: true,
    });
    expect(result.postFee10LiveConfirmationScore).toBeGreaterThan(baseScore);
  });

  it('red impulse reduces score', () => {
    const baseScore = 50;
    const result = evaluatePostFee10LiveConfirmation({
      entryTime: Date.now() - 10_000,
      entryPrice: 100,
      leverage: 1,
      priceHistory: [{ t: Date.now() - 5_000, p: 99 }],
      immediateRedImpulse: true,
    });
    expect(result.postFee10LiveConfirmationScore).toBeLessThan(baseScore);
  });

  it('VWAP reclaim is positive for LONG', () => {
    const withVwap    = evaluatePostFee10LiveConfirmation({ ...greenTrade, longVwapContextLabel: 'VWAP_RECLAIM_CONFIRMED' });
    const withoutVwap = evaluatePostFee10LiveConfirmation({ ...greenTrade, longVwapContextLabel: null });
    expect(withVwap.postFee10LiveConfirmationScore).toBeGreaterThanOrEqual(withoutVwap.postFee10LiveConfirmationScore);
  });

  it('BTC UP is supportive for LONG', () => {
    const withUp   = evaluatePostFee10LiveConfirmation({ ...greenTrade, btcTacticalDirectionLabel: 'UP' });
    const withDown = evaluatePostFee10LiveConfirmation({ ...greenTrade, btcTacticalDirectionLabel: 'DOWN' });
    expect(withUp.postFee10LiveConfirmationScore).toBeGreaterThan(withDown.postFee10LiveConfirmationScore);
  });

  it('returns null score when no price history', () => {
    const result = evaluatePostFee10LiveConfirmation({ entryTime: Date.now(), entryPrice: 100, priceHistory: [] });
    expect(result.postFee10LiveConfirmationScore).toBeNull();
  });

  it('canAffectExecution is always false', () => {
    const result = evaluatePostFee10LiveConfirmation(greenTrade);
    expect(result.canAffectExecution).toBe(false);
  });
});

// ─── OUTCOME ASSESSMENT ───────────────────────────────────────────────────────

describe('calculatePostFee10OutcomeAssessment - LONG polarity', () => {
  it('marks winner when feeAdjustedMarginPnlPct >= 10', () => {
    const trade = { feeAdjustedMarginPnlPct: 12.5 };
    const result = calculatePostFee10OutcomeAssessment(trade);
    expect(result.postFee10Winner).toBe(true);
  });

  it('does not mark winner when feeAdjustedMarginPnlPct < 10', () => {
    const trade = { feeAdjustedMarginPnlPct: 8 };
    const result = calculatePostFee10OutcomeAssessment(trade);
    expect(result.postFee10Winner).toBe(false);
  });

  it('upward price in history reaches post-fee-10 for LONG', () => {
    const trade = {
      entryPrice: 100,
      leverage: 5,
      entryTime: 1000,
      feeDragMarginPct: 0.5,
      priceHistory: [{ t: 2000, p: 103 }], // 3% up * 5x = 15% margin - 0.5% fee = 14.5% >= 10
    };
    const result = calculatePostFee10OutcomeAssessment(trade);
    expect(result.reachedPostFee10At).not.toBeNull();
  });

  it('downward price in history does NOT reach post-fee-10 for LONG', () => {
    const trade = {
      entryPrice: 100,
      leverage: 5,
      entryTime: 1000,
      feeDragMarginPct: 0.5,
      priceHistory: [{ t: 2000, p: 95 }], // 5% DOWN = -25% margin, not a winner
    };
    const result = calculatePostFee10OutcomeAssessment(trade);
    expect(result.reachedPostFee10At).toBeNull();
    expect(result.postFee10Winner).toBe(false);
  });

  it('canAffectExecution is always false', () => {
    const result = calculatePostFee10OutcomeAssessment({});
    expect(result.canAffectExecution).toBe(false);
  });
});

// ─── EXPORT SCHEMA TESTS ──────────────────────────────────────────────────────

describe('CSV export', () => {
  it('headers match default fields keys', () => {
    const defaultKeys = Object.keys(POST_FEE_10_DEFAULT_FIELDS);
    expect(POST_FEE_10_CSV_HEADERS).toEqual(defaultKeys);
  });

  it('postFee10CSVRow returns array of same length as headers', () => {
    const row = postFee10CSVRow({ postFee10Winner: true, feeAdjustedFinalPnlPct: 12.5 });
    expect(row).toHaveLength(POST_FEE_10_CSV_HEADERS.length);
  });

  it('no header is null or undefined', () => {
    for (const h of POST_FEE_10_CSV_HEADERS) {
      expect(h).toBeTruthy();
    }
  });
});

// ─── RANKINGS ─────────────────────────────────────────────────────────────────

describe('assignAllPostFee10WinnerRanks', () => {
  it('assigns rank 1 to highest fee-adjusted PnL', () => {
    const trades = [
      { id: 'a', feeAdjustedMarginPnlPct: 5 },
      { id: 'b', feeAdjustedMarginPnlPct: 15 },
      { id: 'c', feeAdjustedMarginPnlPct: 10 },
    ];
    const ranked = assignAllPostFee10WinnerRanks(trades);
    const best = ranked.find(t => t.id === 'b');
    expect(best.runNormRank).toBe(1);
    expect(best.isTop3WinnerInRun).toBe(true);
  });
});

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

describe('buildPostFee10AnalyticsReport', () => {
  it('calculates win rate correctly', () => {
    const trades = [
      { closed: true, feeAdjustedMarginPnlPct: 12 },
      { closed: true, feeAdjustedMarginPnlPct: 5 },
      { closed: true, feeAdjustedMarginPnlPct: 15 },
    ];
    const report = buildPostFee10AnalyticsReport(trades);
    expect(report.postFee10Winners).toBe(2);
    expect(report.postFee10WinRate).toBeCloseTo(66.67, 0);
  });

  it('returns null metrics for empty input', () => {
    const report = buildPostFee10AnalyticsReport([]);
    expect(report.avgFeeAdjustedPnl).toBeNull();
  });
});
