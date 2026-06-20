// ─── TICK SOURCE ADEQUACY ─────────────────────────────────────────────────────
// Replaces permissive minimums with explicit per-source adequacy checks.
// COMPLETE requires both trade and book sources to be present, fresh, dense,
// and temporally aligned.  PARTIAL sources can support labels but not premium
// High-ATR qualification.
//
// All thresholds are configurable and tagged UNCALIBRATED_RULE_MODEL.

export const TICK_SOURCE_QUALITY = Object.freeze({
  COMPLETE:            'COMPLETE',
  PARTIAL_TRADE_ONLY:  'PARTIAL_TRADE_ONLY',
  PARTIAL_BOOK_ONLY:   'PARTIAL_BOOK_ONLY',
  PARTIAL_BOTH_SPARSE: 'PARTIAL_BOTH_SPARSE',
  STALE:               'STALE',
  WARMING:             'WARMING',
  INSUFFICIENT:        'INSUFFICIENT',
  CONFLICTED:          'CONFLICTED',
});

// Initial thresholds — uncalibrated; must be overridden by config before shipping.
const DEFAULT_COMPLETE_THRESHOLDS = Object.freeze({
  // Both sources must be present
  warmupMinMs:              5_000,
  aggTradeMinCount3s:       8,
  aggTradeMinCount10s:      20,
  bookMinCount3s:           10,
  distinctPriceMin:         3,
  freshnessMaxMs:           1_000,
  maxGapMs:                 2_000,
  maxTimestampInversionMs:  50,
  maxTradeBookSkewMs:       200,
  calibrationStatus:       'UNCALIBRATED_RULE_MODEL',
});

/**
 * Evaluate source adequacy from aggregated buffer/snapshot data.
 *
 * @param {object} aggTrade  – aggregate trade source metrics
 * @param {object} book      – book ticker source metrics
 * @param {object} opts      – override thresholds and context
 * @returns {object}         – adequacy verdict + per-source fields
 */
export function evaluateTickSourceAdequacy(aggTrade = {}, book = {}, opts = {}) {
  const t = { ...DEFAULT_COMPLETE_THRESHOLDS, ...opts };

  // ── Per-source adequacy ───────────────────────────────────────────────────
  const aggTradePresent          = Boolean(aggTrade.eventCount3s > 0 || aggTrade.windowDurationMs > 0);
  const aggTradeEventCount1s     = Number(aggTrade.eventCount1s  ?? 0);
  const aggTradeEventCount3s     = Number(aggTrade.eventCount3s  ?? 0);
  const aggTradeEventCount10s    = Number(aggTrade.eventCount10s ?? 0);
  const aggTradeWindowDurationMs = Number(aggTrade.windowDurationMs ?? 0);
  const aggTradeFreshnessMs      = Number(aggTrade.freshnessMs   ?? Infinity);
  const aggTradeDistinctPriceCount = Number(aggTrade.distinctPriceCount ?? 0);
  const aggTradeOutOfOrderRate   = Number(aggTrade.outOfOrderRate ?? 0);
  const aggTradeMaximumGapMs     = Number(aggTrade.maximumGapMs  ?? 0);

  const bookTickerPresent     = Boolean(book.eventCount3s > 0 || book.windowDurationMs > 0);
  const bookEventCount1s      = Number(book.eventCount1s  ?? 0);
  const bookEventCount3s      = Number(book.eventCount3s  ?? 0);
  const bookEventCount10s     = Number(book.eventCount10s ?? 0);
  const bookWindowDurationMs  = Number(book.windowDurationMs ?? 0);
  const bookFreshnessMs       = Number(book.freshnessMs   ?? Infinity);
  const bookDistinctMidCount  = Number(book.distinctMidCount ?? 0);
  const bookMaximumGapMs      = Number(book.maximumGapMs  ?? 0);
  const spreadObservationCount = Number(book.spreadObservationCount ?? 0);

  // ── Cross-source fields ───────────────────────────────────────────────────
  const tradeBookTimeOverlapMs    = Number(opts.tradeBookTimeOverlapMs   ?? 0);
  const tradeBookAgreementAvailable = Boolean(opts.tradeBookAgreementAvailable ?? (aggTradePresent && bookTickerPresent));
  const tradeBookTimestampSkewMs  = Number(opts.tradeBookTimestampSkewMs ?? 0);
  const tradeBookSourceCoverage   = aggTradePresent && bookTickerPresent ? 'BOTH'
    : aggTradePresent ? 'TRADE_ONLY'
    : bookTickerPresent ? 'BOOK_ONLY'
    : 'NONE';

  // ── Quality verdict logic ─────────────────────────────────────────────────
  const warmEnough     = aggTradeWindowDurationMs >= t.warmupMinMs || bookWindowDurationMs >= t.warmupMinMs;
  const tradeDense3s   = aggTradeEventCount3s  >= t.aggTradeMinCount3s;
  const tradeDense10s  = aggTradeEventCount10s >= t.aggTradeMinCount10s;
  const bookDense3s    = bookEventCount3s >= t.bookMinCount3s;
  const tradeFresh     = aggTradeFreshnessMs <= t.freshnessMaxMs;
  const bookFresh      = bookFreshnessMs    <= t.freshnessMaxMs;
  const tradeGapOk     = aggTradeMaximumGapMs <= t.maxGapMs;
  const bookGapOk      = bookMaximumGapMs    <= t.maxGapMs;
  const distinctOk     = aggTradeDistinctPriceCount >= t.distinctPriceMin || bookDistinctMidCount >= t.distinctPriceMin;
  const skewOk         = tradeBookTimestampSkewMs <= t.maxTradeBookSkewMs;

  let quality;
  const reasons = [];

  if (!aggTradePresent && !bookTickerPresent) {
    quality = TICK_SOURCE_QUALITY.INSUFFICIENT;
    reasons.push('NO_SOURCES');
  } else if (!warmEnough) {
    quality = TICK_SOURCE_QUALITY.WARMING;
    reasons.push('WARMUP_INCOMPLETE');
  } else if (aggTradePresent && bookTickerPresent) {
    if (!skewOk) {
      quality = TICK_SOURCE_QUALITY.CONFLICTED;
      reasons.push('TRADE_BOOK_CLOCK_SKEW');
    } else if (tradeDense3s && bookDense3s && tradeFresh && bookFresh && tradeGapOk && bookGapOk && distinctOk) {
      quality = TICK_SOURCE_QUALITY.COMPLETE;
    } else if ((!tradeDense3s || !tradeDense10s) && (!bookDense3s)) {
      quality = TICK_SOURCE_QUALITY.PARTIAL_BOTH_SPARSE;
      reasons.push('BOTH_SOURCES_SPARSE');
    } else if (!tradeFresh || !bookFresh) {
      quality = TICK_SOURCE_QUALITY.STALE;
      reasons.push('SOURCE_STALE');
    } else {
      quality = TICK_SOURCE_QUALITY.PARTIAL_BOTH_SPARSE;
      reasons.push('PARTIAL_QUALITY');
    }
  } else if (aggTradePresent) {
    quality = TICK_SOURCE_QUALITY.PARTIAL_TRADE_ONLY;
    reasons.push('BOOK_SOURCE_ABSENT');
  } else {
    quality = TICK_SOURCE_QUALITY.PARTIAL_BOOK_ONLY;
    reasons.push('TRADE_SOURCE_ABSENT');
  }

  return {
    // Per-source fields (spec §7.1)
    aggTradePresent, aggTradeEventCount1s, aggTradeEventCount3s, aggTradeEventCount10s,
    aggTradeWindowDurationMs, aggTradeFreshnessMs, aggTradeDistinctPriceCount,
    aggTradeOutOfOrderRate, aggTradeMaximumGapMs,

    bookTickerPresent, bookEventCount1s, bookEventCount3s, bookEventCount10s,
    bookWindowDurationMs, bookFreshnessMs, bookDistinctMidCount, bookMaximumGapMs,
    spreadObservationCount,

    // Cross-source fields
    tradeBookTimeOverlapMs, tradeBookAgreementAvailable,
    tradeBookTimestampSkewMs, tradeBookSourceCoverage,

    // Verdict
    tickSourceQuality:        quality,
    tickSourceQualityReasons: reasons,
    tickSourceCalibrationStatus: t.calibrationStatus,

    // Capability flags
    supportsResearchLabels:    quality !== TICK_SOURCE_QUALITY.INSUFFICIENT && quality !== TICK_SOURCE_QUALITY.CONFLICTED,
    supportsHighAtrQualification: quality === TICK_SOURCE_QUALITY.COMPLETE,
  };
}
