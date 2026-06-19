// ─── LONG ENTRY FACTS NORMALIZER ─────────────────────────────────────────────
// Converts raw/legacy app fields into one canonical LongEntryFacts shape.
// All filters, scores, audits, exports, and UI panels must read from this.

import { LONG_TELEMETRY_TTL_V1 } from './longTelemetryFreshness.config.js';
import { deriveRsiLongMomentumExpansion, deriveMacdBullishExpansion } from './longWinningSignals.js';

export const LONG_ENTRY_FACTS_SCHEMA_VERSION = '1.1.0';

function booleanOrNull(v) {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

// Detects conflicting values between two sources. Returns true when a conflict exists.
// - Numeric fields: absoluteTolerance (percentage points) or relativeTolerance (fraction)
// - Enum/bool fields: exact equality
// - If either side is null/undefined → no conflict (missing is not conflicting)
function valuesConflict({ left, right, absoluteTolerance, relativeTolerance }) {
  if (left == null || right == null) return false;
  if (absoluteTolerance != null) return Math.abs(left - right) > absoluteTolerance;
  if (relativeTolerance != null) {
    const base = Math.abs(right) || 1;
    return Math.abs(left - right) / base > relativeTolerance;
  }
  return left !== right;
}

// Returns true if any value is true, false if all observed values are false,
// null if no value was observed (all were null/undefined).
function anyTrueOrNull(values) {
  let observedFalse = false;
  for (const v of values) {
    const b = booleanOrNull(v);
    if (b === true) return true;
    if (b === false) observedFalse = true;
  }
  return observedFalse ? false : null;
}

// Returns explicit value if it is a boolean; otherwise returns derived.
// Never collapses null/undefined source values to false.
function deriveBooleanOrNull(explicit, derivedFn) {
  const e = booleanOrNull(explicit);
  return e !== null ? e : derivedFn();
}

/**
 * @param {object} trade       - Raw trade record from the app
 * @param {number} [computedAt] - Pipeline reference timestamp (ms). 0 = skip staleness check.
 * @returns {LongEntryFacts} Canonical normalized facts
 */
export function normalizeLongEntryFacts(trade, computedAt = 0) {
  const t = trade ?? {};

  // ── Conflict detection ────────────────────────────────────────────────────
  const longFilterConflictingFields = [];

  if (valuesConflict({ left: t.entryPriceVsVwapPct, right: t.priceVsVwapPct, absoluteTolerance: 0.5 }))
    longFilterConflictingFields.push('priceVsVwapPct');
  if (valuesConflict({ left: t.entryPriceVsVwapPct, right: t.entryTelemetryPriceVsVwapPct, absoluteTolerance: 0.5 }))
    longFilterConflictingFields.push('entryTelemetryPriceVsVwapPct');
  if (valuesConflict({ left: t.entryCvdLabel, right: t.cvdLabel }))
    longFilterConflictingFields.push('cvdLabel');
  if (valuesConflict({ left: t.longMicroMomentumLabel, right: t.microMomentumLabel }))
    longFilterConflictingFields.push('microMomentumLabel');
  if (valuesConflict({ left: t.longVwapContextLabel, right: t.vwapContextLabel }))
    longFilterConflictingFields.push('vwapContextLabel');
  if (valuesConflict({ left: t.marketContextStale, right: t.contextStale }))
    longFilterConflictingFields.push('contextStale');

  const rsiMomentum = deriveRsiLongMomentumExpansion(t);
  const macdBullishExpansion = deriveMacdBullishExpansion(t);

  // ── Staleness detection (per-source TTL) ──────────────────────────────────
  const longFilterStaleFields = [];

  if (computedAt > 0) {
    for (const [tsKey, ttl] of Object.entries(LONG_TELEMETRY_TTL_V1)) {
      const ts = t[tsKey];
      if (typeof ts === 'number' && ts > 0) {
        const age = computedAt - ts;
        if (age > ttl) longFilterStaleFields.push(tsKey);
      }
    }
  }

  return Object.freeze({
    schemaVersion: LONG_ENTRY_FACTS_SCHEMA_VERSION,

    identity: {
      tradeId:    t.id ?? t.tradeId ?? null,
      runId:      t.runId ?? t.run ?? null,
      sessionId:  t.sessionId ?? null,
      symbol:     t.symbol ?? null,
      entryTime:  t.entryTime ?? t.entryTimestamp ?? null,
      entryPrice: t.entryPrice ?? null,
      leverage:   t.leverage ?? null,
    },

    bucket: {
      parentBucket: t.longParentBucket ?? null,
      longSubBucket:
        t.longSubBucket ??
        t.topGainerLongSubBucket ??
        t.topLoserLongSubBucket ??
        t.topGainerThesisLaneLabel ??
        t.topLoserThesisLaneLabel ??
        null,
    },

    momentum: {
      hasLongMicroMomentum:   t.hasLongMicroMomentum ?? t.hasMicroMomentum ?? null,
      longMicroMomentumLabel: t.longMicroMomentumLabel ?? t.microMomentumLabel ?? null,
      greenImpulseDetected:   t.greenImpulseDetected ?? null,
      immediateGreenImpulse:  t.immediateGreenImpulse ?? null,
      redImpulseDetected:     t.redImpulseDetected ?? null,
      immediateRedImpulse:    t.immediateRedImpulse ?? null,
      hasGreenConfirmation:   deriveBooleanOrNull(
        t.hasGreenConfirmation,
        () => anyTrueOrNull([
          t.immediateGreenImpulse,
          t.greenImpulseDetected,
          t.candleColorAtEntry != null ? t.candleColorAtEntry === 'GREEN' : null,
        ]),
      ),
      hasRedDanger:           deriveBooleanOrNull(
        t.hasRedDanger,
        () => anyTrueOrNull([
          t.immediateRedImpulse,
          t.redImpulseDetected,
        ]),
      ),
      last3TicksDirection:    t.last3TicksDirection ?? null,
    },

    rsi: {
      hasRsiRolloverUp: t.hasRsiRolloverUp ?? t.rsiRolloverUp ?? null,
      rsi1m:            t.rsi1m ?? null,
      rsi3m:            t.rsi3m ?? null,
      rsi5m:            t.rsi5m ?? null,
      rsi1mDelta:       t.rsi1mDelta ?? null,
      rsiSpread1m3m:    t.rsiSpread1m3m ?? (t.rsi1m != null && t.rsi3m != null ? t.rsi1m - t.rsi3m : null),
      rsiLongSetupLabel: t.rsiLongSetupLabel ?? t.rsiSetupLabel ?? null,
      rsiLongMomentumExpansion: rsiMomentum.rsiLongMomentumExpansion,
      rsiLongMomentumExpansionSource: rsiMomentum.rsiLongMomentumExpansionSource,
    },

    macd: {
      histogram:        t.macdHistogram ?? t.macd?.histogram ?? null,
      histogramDelta:   t.macdHistogramDelta ?? t.macd?.histogramDelta ?? t.macdHistogramDelta1m ?? t.macdHistogramSlope1m ?? t.macdHistogramSlope ?? null,
      bullishExpansion: macdBullishExpansion,
      histogramState1m: t.macdHistogramState1m ?? null,
      histogramState3m: t.macdHistogramState3m ?? null,
      bullishCross:     t.macdBullishCross ?? null,
    },

    cvd: {
      entryCvdLabel:
        t.entryCvdLabel ??
        (t.cvdLabel === 'BULL' || t.cvdLabel === 'BULLISH' ? 'BULL'
         : t.cvdLabel === 'BEAR' || t.cvdLabel === 'BEARISH' ? 'BEAR'
         : t.cvdLabel === 'NEUT' || t.cvdLabel === 'NEUTRAL' ? 'NEUT'
         : t.cvdLabel ?? null),
      cvdSlope:    t.cvdSlope ?? null,
      improving:   t.cvdImproving ?? t.cvdBullImproving ?? null,
    },

    vwap: {
      entryVwapValue:          t.entryVwapValue ?? t.vwapAtEntry ?? null,
      entryPriceVsVwapPct:     t.entryPriceVsVwapPct ?? t.priceVsVwapPct ?? null,
      entryPriceVsVwapLabel:
        t.entryPriceVsVwapLabel ??
        (t.priceVsVwapLabel === 'ABOVE_VWAP' ? 'ABOVE_VWAP'
         : t.priceVsVwapLabel === 'BELOW_VWAP' ? 'BELOW_VWAP'
         : t.priceVsVwapLabel ?? null),
      longVwapContextLabel:
        t.longVwapContextLabel ??
        t.vwapLongContextLabel ??
        t.vwapContextLabel ??
        null,
    },

    volatility: {
      atrPct:         t.atrPct ?? null,
      volatilityTier: t.volatilityTier ?? null,
    },

    liquidity: {
      spreadPct:     t.spreadPct ?? null,
      thinBookDanger: t.thinBookDanger ?? null,
      liquidityTier:  t.liquidityTier ?? null,
    },

    market: {
      btcMicroDirectionLabel:      t.btcMicroDirectionLabel ?? null,
      btcTacticalDirectionLabel:   t.btcTacticalDirectionLabel ?? null,
      btcStructuralDirectionLabel: t.btcStructuralDirectionLabel ?? null,
      ethMicroDirectionLabel:      t.ethMicroDirectionLabel ?? null,
      ethTacticalDirectionLabel:   t.ethTacticalDirectionLabel ?? null,
      ethStructuralDirectionLabel: t.ethStructuralDirectionLabel ?? null,
      btcEthAlignmentLabel:        t.btcEthAlignmentLabel ?? t.crossMarket?.btcEthAlignmentLabel ?? null,
      breadthBullishPct:           t.breadthBullishPct ?? null,
      breadthBearishPct:           t.breadthBearishPct ?? null,
    },

    longFilterConflictingFields,
    longFilterStaleFields,
  });
}

/**
 * Returns a flat object suitable for filter predicates and CSV export.
 * All fields come from normalizeLongEntryFacts, so no raw-field fallback here.
 */
export function flattenLongEntryFacts(facts) {
  if (!facts) return {};
  const f = facts;
  return {
    // Identity
    tradeId:    f.identity.tradeId,
    runId:      f.identity.runId,
    symbol:     f.identity.symbol,
    entryTime:  f.identity.entryTime,
    entryPrice: f.identity.entryPrice,
    leverage:   f.identity.leverage,
    // Bucket
    longParentBucket: f.bucket.parentBucket,
    longSubBucket:    f.bucket.longSubBucket,
    // Momentum
    hasLongMicroMomentum:   f.momentum.hasLongMicroMomentum,
    longMicroMomentumLabel: f.momentum.longMicroMomentumLabel,
    greenImpulseDetected:   f.momentum.greenImpulseDetected,
    immediateGreenImpulse:  f.momentum.immediateGreenImpulse,
    redImpulseDetected:     f.momentum.redImpulseDetected,
    immediateRedImpulse:    f.momentum.immediateRedImpulse,
    hasGreenConfirmation:   f.momentum.hasGreenConfirmation,
    hasRedDanger:           f.momentum.hasRedDanger,
    last3TicksDirection:    f.momentum.last3TicksDirection,
    // RSI
    hasRsiRolloverUp: f.rsi.hasRsiRolloverUp,
    rsi1m:            f.rsi.rsi1m,
    rsi3m:            f.rsi.rsi3m,
    rsi1mDelta:       f.rsi.rsi1mDelta,
    rsiLongSetupLabel: f.rsi.rsiLongSetupLabel,
    rsiLongMomentumExpansion: f.rsi.rsiLongMomentumExpansion,
    rsiLongMomentumExpansionSource: f.rsi.rsiLongMomentumExpansionSource,
    // MACD
    macdBullishExpansion: f.macd.bullishExpansion,
    macdHistogramState1m: f.macd.histogramState1m,
    macdHistogramState3m: f.macd.histogramState3m,
    // CVD
    entryCvdLabel: f.cvd.entryCvdLabel,
    cvdSlope:      f.cvd.cvdSlope,
    // VWAP
    entryPriceVsVwapPct:  f.vwap.entryPriceVsVwapPct,
    entryPriceVsVwapLabel: f.vwap.entryPriceVsVwapLabel,
    longVwapContextLabel:  f.vwap.longVwapContextLabel,
    // Volatility
    atrPct:         f.volatility.atrPct,
    // Liquidity
    spreadPct:      f.liquidity.spreadPct,
    thinBookDanger: f.liquidity.thinBookDanger,
    // Market
    btcMicroDirectionLabel:      f.market.btcMicroDirectionLabel,
    btcTacticalDirectionLabel:   f.market.btcTacticalDirectionLabel,
    btcEthAlignmentLabel:        f.market.btcEthAlignmentLabel,
    breadthBullishPct:           f.market.breadthBullishPct,
  };
}
