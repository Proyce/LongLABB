import { describe, expect, it } from 'vitest';
import { evaluateTickSourceAdequacy, TICK_SOURCE_QUALITY } from './tickSourceAdequacy.js';

function goodTrade(overrides = {}) {
  return {
    eventCount1s: 5,
    eventCount3s: 12,
    eventCount10s: 30,
    windowDurationMs: 10_000,
    freshnessMs: 400,
    distinctPriceCount: 5,
    outOfOrderRate: 0,
    maximumGapMs: 500,
    ...overrides,
  };
}

function goodBook(overrides = {}) {
  return {
    eventCount1s: 6,
    eventCount3s: 14,
    eventCount10s: 32,
    windowDurationMs: 10_000,
    freshnessMs: 300,
    distinctMidCount: 6,
    maximumGapMs: 400,
    spreadObservationCount: 10,
    ...overrides,
  };
}

describe('evaluateTickSourceAdequacy', () => {
  it('returns COMPLETE when both sources are dense, fresh, and aligned', () => {
    const r = evaluateTickSourceAdequacy(goodTrade(), goodBook());
    expect(r.tickSourceQuality).toBe(TICK_SOURCE_QUALITY.COMPLETE);
    expect(r.tradeBookSourceCoverage).toBe('BOTH');
    expect(r.tickSourceCalibrationStatus).toBe('UNCALIBRATED_RULE_MODEL');
  });

  it('returns INSUFFICIENT when neither source is present', () => {
    const r = evaluateTickSourceAdequacy({}, {});
    expect(r.tickSourceQuality).toBe(TICK_SOURCE_QUALITY.INSUFFICIENT);
    expect(r.tickSourceQualityReasons).toContain('NO_SOURCES');
  });

  it('returns WARMING when window duration is too short', () => {
    const r = evaluateTickSourceAdequacy(
      goodTrade({ windowDurationMs: 2_000 }),
      goodBook({ windowDurationMs: 2_000 }),
    );
    expect(r.tickSourceQuality).toBe(TICK_SOURCE_QUALITY.WARMING);
  });

  it('returns PARTIAL_TRADE_ONLY when only trade source is present', () => {
    const r = evaluateTickSourceAdequacy(goodTrade(), {});
    expect(r.tickSourceQuality).toBe(TICK_SOURCE_QUALITY.PARTIAL_TRADE_ONLY);
    expect(r.tradeBookSourceCoverage).toBe('TRADE_ONLY');
  });

  it('returns PARTIAL_BOOK_ONLY when only book source is present', () => {
    const r = evaluateTickSourceAdequacy({}, goodBook());
    expect(r.tickSourceQuality).toBe(TICK_SOURCE_QUALITY.PARTIAL_BOOK_ONLY);
    expect(r.tradeBookSourceCoverage).toBe('BOOK_ONLY');
  });

  it('returns CONFLICTED when trade/book clock skew exceeds threshold', () => {
    const r = evaluateTickSourceAdequacy(goodTrade(), goodBook(), { tradeBookTimestampSkewMs: 500 });
    expect(r.tickSourceQuality).toBe(TICK_SOURCE_QUALITY.CONFLICTED);
    expect(r.tickSourceQualityReasons).toContain('TRADE_BOOK_CLOCK_SKEW');
  });

  it('returns STALE when a source freshness exceeds threshold', () => {
    const r = evaluateTickSourceAdequacy(
      goodTrade({ freshnessMs: 2_000 }),
      goodBook(),
    );
    expect(r.tickSourceQuality).toBe(TICK_SOURCE_QUALITY.STALE);
  });

  it('returns PARTIAL_BOTH_SPARSE when event counts are low', () => {
    const r = evaluateTickSourceAdequacy(
      goodTrade({ eventCount3s: 2, eventCount10s: 5 }),
      goodBook({ eventCount3s: 2 }),
    );
    expect(r.tickSourceQuality).toBe(TICK_SOURCE_QUALITY.PARTIAL_BOTH_SPARSE);
  });

  it('exposes per-source fields on every result', () => {
    const r = evaluateTickSourceAdequacy(goodTrade(), goodBook());
    expect(r).toHaveProperty('aggTradePresent');
    expect(r).toHaveProperty('bookTickerPresent');
    expect(r).toHaveProperty('aggTradeEventCount3s');
    expect(r).toHaveProperty('bookEventCount3s');
  });
});
