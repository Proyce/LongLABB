import { TICK_DIRECTION_CONFIG, TICK_DIRECTION_SAFETY, TICK_DIRECTION_VERSION } from "./tickDirection.config.js";
import { TICK_DATA_QUALITY, TICK_DIRECTION, TICK_PATTERN } from "./tickDirection.types.js";
import {
  computeAggressorFlowFeatures,
  computeBookPressureFeatures,
  computeDirectionalFeatures,
  directionAgreement,
  tickEventTime,
} from "./tickDirectionFeatures.js";
import { classifyTickPattern, getAtrTier, getHighAtrContextLabel } from "./tickDirectionLabels.js";
import { scoreTickDirection } from "./tickDirectionScore.js";
import { flattenTickDirectionFeatures } from "./tickDirection.flatten.js";
import { evaluateTickSourceAdequacy } from "./tickSourceAdequacy.js";

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const round = value => Number.isFinite(value) ? Number(value.toFixed(6)) : null;

function emptySnapshot({ symbol, entryTime, entryPrice, atrPct, missingReasons, streamHealthy }) {
  return Object.freeze({
    entryTickSnapshotVersion: TICK_DIRECTION_VERSION,
    entryTickSnapshotCapturedAt: Date.now(),
    entryTickWindowEndAt: entryTime,
    entryTickOldestEventAt: null,
    entryTickNewestEventAt: null,
    entryTickWarmupMs: 0,
    entryTickFreshnessMs: null,
    entryTickCanonicalSource: "INSUFFICIENT",
    entryTickTimestampBasis: "UNAVAILABLE",
    entryTickDataQuality: TICK_DATA_QUALITY.INSUFFICIENT,
    entryTickMissingReasons: missingReasons,
    entryTickStreamHealthyAtEntry: streamHealthy === true,
    entryTickReferencePrice: null,
    entryTickReferencePriceSource: null,
    entryTickReferenceVsTradeEntryBps: null,
    entryTickRequiredFieldCount: 12,
    entryTickKnownFieldCount: 0,
    entryTickCoveragePct: 0,
    marketTickPrimaryPattern: TICK_PATTERN.INSUFFICIENT,
    marketTickSupportingLabels: [],
    marketTickAtrTier: getAtrTier(atrPct),
    highAtrTickContextLabel: "TICK_DIRECTION_UNKNOWN",
    marketTickDirectionalBiasScore: 0,
    marketTickDirectionConfidenceScore: 0,
    marketTickDirectionVerdict: "INSUFFICIENT",
    highAtrDirectionalOpportunityScore: 0,
    highAtrDirectionalOpportunityTier: "INSUFFICIENT",
    highAtrDirectionalOpportunityReasons: ["ENTRY_TICK_DATA_UNAVAILABLE"],
    marketTickDirection3: TICK_DIRECTION.INSUFFICIENT,
    marketTickDirection5: TICK_DIRECTION.INSUFFICIENT,
    marketTickDirection10: TICK_DIRECTION.INSUFFICIENT,
    marketTickDirection1s: TICK_DIRECTION.INSUFFICIENT,
    marketTickDirection3s: TICK_DIRECTION.INSUFFICIENT,
    marketTickDirection5s: TICK_DIRECTION.INSUFFICIENT,
    marketTickDirection10s: TICK_DIRECTION.INSUFFICIENT,
    marketTickDirection30s: TICK_DIRECTION.INSUFFICIENT,
    symbol,
    entryTickAtrPctObserved: finite(atrPct),
    // High-ATR V2 score fields (R-14)
    marketTickSignalStrengthScore:         0,
    highAtrLongOpportunityScore:           0,
    highAtrLongOpportunityTier:            'INSUFFICIENT',
    highAtrLongRiskScore:                  0,
    highAtrLongRiskTier:                   'INSUFFICIENT',
    marketTickScoreCalibrationStatus:      'UNCALIBRATED_RULE_MODEL',
    marketTickConfidenceInterpretation:    'INSUFFICIENT_DATA',
    highAtrOpportunityCalibrationStatus:   'UNCALIBRATED_RULE_MODEL',
    highAtrRiskCalibrationStatus:          'UNCALIBRATED_RULE_MODEL',
    // Tick source adequacy (R-14)
    tickSourceQuality:                     'INSUFFICIENT',
    tickSourceQualityReasons:              ['EMPTY_SNAPSHOT'],
    tickSourceCalibrationStatus:           'UNCALIBRATED_RULE_MODEL',
    // Tick evidence availability
    tickEvidenceRequired:                  false,
    tickEvidenceAvailable:                 false,
    tickEvidenceQualified:                 false,
    ...TICK_DIRECTION_SAFETY,
  });
}

function timestampBasis(events) {
  if (!events.length) return "UNAVAILABLE";
  return events.some(event => event.timestampBasis === "RECEIVED_AT_FALLBACK")
    ? "MIXED_WITH_RECEIVED_AT_FALLBACK"
    : "EXCHANGE_EVENT_TIME";
}

function sourceQualifies(features, config) {
  const w3 = features?.window3000 ?? {};
  const w10 = features?.window10000 ?? {};
  const best = w3.eventCount >= config.minimumCanonicalEvents ? w3 : w10;
  return (
    best.eventCount >= config.minimumCanonicalEvents &&
    best.distinctPriceCount >= config.minimumDistinctPriceChanges &&
    best.durationMs >= config.minimumWindowDurationMs &&
    best.freshnessMs <= config.staleAfterMs
  );
}

function buildFeatureFacade(flat, canonicalFeatures) {
  return {
    window3s: canonicalFeatures.window3000,
    window5s: canonicalFeatures.window5000,
    window10s: canonicalFeatures.window10000,
    currentUpStreak: canonicalFeatures.currentUpStreak,
    currentDownStreak: canonicalFeatures.currentDownStreak,
    reversalCount10: canonicalFeatures.reversalCount10,
    aggressorFlowLabel3s: flat.marketTickAggressorFlowLabel3s,
    aggressorVolumeImbalance3s: flat.marketTickAggressorVolumeImbalance3s,
    bookImbalanceMean3s: flat.marketTickBookImbalanceMean3s,
    spreadChangeBps3s: flat.marketTickSpreadChangeBps3s,
    tradeBookAgreement3s: flat.marketTickTradeBookAgreement3s,
  };
}

export function captureTickDirectionSnapshot({
  symbol,
  entryTime,
  entryPrice,
  atrPct = null,
  spreadPct = null,
  bufferStore,
  config = TICK_DIRECTION_CONFIG,
  streamHealthy = false,
} = {}) {
  const resolved = { ...TICK_DIRECTION_CONFIG, ...config };
  const capturedAt = Date.now();
  if (!bufferStore || !symbol || !Number.isFinite(Number(entryTime))) {
    return emptySnapshot({
      symbol,
      entryTime,
      entryPrice,
      atrPct,
      streamHealthy,
      missingReasons: ["BUFFER_OR_ENTRY_CONTEXT_UNAVAILABLE"],
    });
  }

  const startAt = entryTime - resolved.entryLookbackMs;
  const { trades, books } = bufferStore.getSymbolEvents(symbol, { startAt, endAt: entryTime });
  const allEvents = [...trades, ...books].sort((a, b) => tickEventTime(a) - tickEventTime(b));
  if (!allEvents.length) {
    return emptySnapshot({
      symbol,
      entryTime,
      entryPrice,
      atrPct,
      streamHealthy,
      missingReasons: ["NO_PRE_ENTRY_MARKET_TICKS"],
    });
  }

  const tradeFeatures = computeDirectionalFeatures(trades, { entryTime, priceField: "price", config: resolved });
  const bookFeatures = computeDirectionalFeatures(books, { entryTime, priceField: "mid", config: resolved });
  const tradeAdequate = sourceQualifies(tradeFeatures, resolved);
  const bookAdequate = sourceQualifies(bookFeatures, resolved);
  const canonicalSource = tradeAdequate ? "AGG_TRADE" : bookAdequate ? "BOOK_TICKER_MID" : "INSUFFICIENT";
  const canonicalFeatures = canonicalSource === "AGG_TRADE" ? tradeFeatures : bookFeatures;

  // Compute source adequacy (R-12/§C2) — wires evaluateTickSourceAdequacy into the snapshot
  const tradeFreshnessMs = trades.length ? Math.max(0, entryTime - tickEventTime(trades.at(-1))) : Infinity;
  const bookFreshnessMs  = books.length  ? Math.max(0, entryTime - tickEventTime(books.at(-1)))  : Infinity;
  const sourceAdequacy = evaluateTickSourceAdequacy(
    {
      eventCount3s:       tradeFeatures.window3000?.eventCount  ?? 0,
      eventCount10s:      tradeFeatures.window10000?.eventCount ?? 0,
      windowDurationMs:   tradeFeatures.window10000?.durationMs ?? 0,
      freshnessMs:        tradeFreshnessMs,
      distinctPriceCount: tradeFeatures.window3000?.distinctPriceCount ?? 0,
    },
    {
      eventCount3s:     bookFeatures.window3000?.eventCount  ?? 0,
      eventCount10s:    bookFeatures.window10000?.eventCount ?? 0,
      windowDurationMs: bookFeatures.window10000?.durationMs ?? 0,
      freshnessMs:      bookFreshnessMs,
      distinctMidCount: bookFeatures.window3000?.distinctPriceCount ?? 0,
    },
  );
  const aggressor = computeAggressorFlowFeatures(trades, entryTime, resolved);
  const bookPressure = computeBookPressureFeatures(books, entryTime);
  const agreements = {
    agreement3s: directionAgreement(tradeFeatures.window3000?.direction, bookFeatures.window3000?.direction),
    agreement10s: directionAgreement(tradeFeatures.window10000?.direction, bookFeatures.window10000?.direction),
  };
  const flat = flattenTickDirectionFeatures({
    canonicalFeatures,
    tradeFeatures,
    bookFeatures,
    aggressor,
    bookPressure,
    agreements,
  });
  const newest = allEvents.at(-1);
  const oldest = allEvents[0];
  const freshnessMs = Math.max(0, entryTime - tickEventTime(newest));
  const missingReasons = [];
  if (!tradeAdequate) missingReasons.push("AGG_TRADE_COVERAGE_INSUFFICIENT");
  if (!bookAdequate) missingReasons.push("BOOK_TICKER_COVERAGE_INSUFFICIENT");
  if (freshnessMs > resolved.staleAfterMs) missingReasons.push("LATEST_TICK_STALE");
  let dataQuality = TICK_DATA_QUALITY.INSUFFICIENT;
  if (freshnessMs > resolved.staleAfterMs) dataQuality = TICK_DATA_QUALITY.STALE;
  else if (canonicalSource !== "INSUFFICIENT") dataQuality = tradeAdequate && bookAdequate
    ? TICK_DATA_QUALITY.COMPLETE
    : TICK_DATA_QUALITY.PARTIAL;
  const facade = buildFeatureFacade(flat, canonicalFeatures);
  const pattern = classifyTickPattern(facade, { atrPct, config: resolved });
  const score = scoreTickDirection(facade, { dataQuality, atrPct, config: resolved });
  const referenceEvent = canonicalSource === "AGG_TRADE" ? trades.at(-1) : books.at(-1);
  const referencePrice = finite(referenceEvent?.price ?? referenceEvent?.mid);
  const referenceVsEntryBps = referencePrice != null && finite(entryPrice) > 0
    ? ((referencePrice - Number(entryPrice)) / Number(entryPrice)) * 10_000
    : null;
  const requiredValues = [
    canonicalSource, flat.marketTickDirection3s, flat.marketTickDirection10s,
    flat.marketTickNetMoveBps3s, flat.marketTickEfficiency3s,
    flat.marketTickVelocityBpsPerSec3s, flat.marketTickAggressorFlowLabel3s,
    flat.marketTickTradeBookAgreement3s, pattern.primaryPattern,
    score.marketTickDirectionVerdict, score.marketTickDirectionalBiasScore,
    score.marketTickDirectionConfidenceScore,
  ];
  const known = requiredValues.filter(value => value != null && value !== "INSUFFICIENT").length;

  return Object.freeze({
    entryTickSnapshotVersion: TICK_DIRECTION_VERSION,
    entryTickSnapshotCapturedAt: capturedAt,
    entryTickWindowEndAt: entryTime,
    entryTickOldestEventAt: tickEventTime(oldest),
    entryTickNewestEventAt: tickEventTime(newest),
    entryTickWarmupMs: Math.max(0, tickEventTime(newest) - tickEventTime(oldest)),
    entryTickFreshnessMs: freshnessMs,
    entryTickCanonicalSource: canonicalSource,
    entryTickTimestampBasis: timestampBasis(allEvents),
    entryTickDataQuality: dataQuality,
    entryTickMissingReasons: missingReasons,
    entryTickStreamHealthyAtEntry: streamHealthy === true,
    entryTickReferencePrice: referencePrice,
    entryTickReferencePriceSource: canonicalSource,
    entryTickReferenceVsTradeEntryBps: round(referenceVsEntryBps),
    entryTickRequiredFieldCount: requiredValues.length,
    entryTickKnownFieldCount: known,
    entryTickCoveragePct: Math.round((known / requiredValues.length) * 100),
    entryTickTradeEventCount: trades.length,
    entryTickBookEventCount: books.length,
    entryTickAtrPctObserved: finite(atrPct),
    entryTickSpreadPctObserved: finite(spreadPct ?? bookPressure.latestSpreadPct),
    ...flat,
    marketTickPrimaryPattern: pattern.primaryPattern,
    marketTickSupportingLabels: pattern.supportingLabels,
    marketTickAtrTier: getAtrTier(atrPct, resolved),
    highAtrTickContextLabel: getHighAtrContextLabel(atrPct, pattern.primaryPattern, resolved),
    ...score,
    // Tick source adequacy result (R-12/§C2)
    tickSourceQuality:          sourceAdequacy.tickSourceQuality,
    tickSourceQualityReasons:   sourceAdequacy.tickSourceQualityReasons,
    tickSourceCalibrationStatus: sourceAdequacy.tickSourceCalibrationStatus,
    tickEvidenceRequired:  false,
    tickEvidenceAvailable: sourceAdequacy.tickSourceQuality !== 'INSUFFICIENT' && sourceAdequacy.tickSourceQuality !== 'WARMING',
    tickEvidenceQualified: sourceAdequacy.tickSourceQuality === 'COMPLETE',
    ...TICK_DIRECTION_SAFETY,
  });
}

function tickVerdictSign(verdict) {
  if (verdict === "STRONG_UP" || verdict === "UP") return 1;
  if (verdict === "STRONG_DOWN" || verdict === "DOWN") return -1;
  return 0;
}

function agreement(sign, positive) {
  if (positive == null || sign === 0) return "UNKNOWN";
  return sign > 0 ? (positive ? "AGREE" : "CONFLICT") : (positive ? "CONFLICT" : "AGREE");
}

export function enrichFrozenTickDirectionSnapshot(snapshot, entryFacts = {}, config = TICK_DIRECTION_CONFIG) {
  if (!snapshot) return snapshot;
  const atrPct = finite(entryFacts.atrPct ?? snapshot.entryTickAtrPctObserved);
  const sign = tickVerdictSign(snapshot.marketTickDirectionVerdict);
  const cvd = String(entryFacts.entryCvdLabel ?? entryFacts.cvdLabel ?? "").toUpperCase();
  const green = entryFacts.immediateGreenImpulse === true || entryFacts.greenImpulseDetected === true;
  const red = entryFacts.immediateRedImpulse === true || entryFacts.redImpulseDetected === true;
  const vwapPositive = entryFacts.entryPriceVsVwapLabel === "ABOVE_VWAP"
    || String(entryFacts.longVwapContextLabel ?? "").includes("RECLAIM");
  const agreements = {
    marketTickRsiAgreement: agreement(sign, Number(entryFacts.rsi1mDelta) > 0 || entryFacts.rsiLongMomentumExpansion === true),
    marketTickMacdAgreement: agreement(sign, entryFacts.macdBullishExpansion === true),
    marketTickCvdAgreement: agreement(sign, cvd === "BULL" || (sign > 0 && cvd === "NEUT")),
    marketTickGreenRedAgreement: sign > 0
      ? green && !red ? "AGREE" : red ? "CONFLICT" : "UNKNOWN"
      : red && !green ? "AGREE" : green ? "CONFLICT" : "UNKNOWN",
    marketTickVwapAgreement: agreement(sign, vwapPositive),
  };
  const values = Object.values(agreements);
  const agreementCount = values.filter(value => value === "AGREE").length;
  const conflictCount = values.filter(value => value === "CONFLICT").length;
  const score = scoreTickDirection({
    window3s: {
      direction: snapshot.marketTickDirection3s,
      eventCount: snapshot.marketTickEventCount3s,
      distinctPriceCount: snapshot.marketTickDistinctPriceCount3s,
      freshnessMs: snapshot.entryTickFreshnessMs,
      netMoveBps: snapshot.marketTickNetMoveBps3s,
      efficiency: snapshot.marketTickEfficiency3s,
      velocity: snapshot.marketTickVelocityBpsPerSec3s,
      acceleration: snapshot.marketTickAccelerationBpsPerSec2_3s,
    },
    window10s: {
      direction: snapshot.marketTickDirection10s,
      netMoveBps: snapshot.marketTickNetMoveBps10s,
    },
    currentUpStreak: snapshot.marketTickCurrentUpStreak,
    currentDownStreak: snapshot.marketTickCurrentDownStreak,
    reversalCount10: snapshot.marketTickReversalCount10,
    aggressorVolumeImbalance3s: snapshot.marketTickAggressorVolumeImbalance3s,
    bookImbalanceMean3s: snapshot.marketTickBookImbalanceMean3s,
    tradeBookAgreement3s: snapshot.marketTickTradeBookAgreement3s,
    spreadChangeBps3s: snapshot.marketTickSpreadChangeBps3s,
  }, { dataQuality: snapshot.entryTickDataQuality, atrPct, config });
  return Object.freeze({
    ...snapshot,
    marketTickAtrTier: getAtrTier(atrPct, config),
    highAtrTickContextLabel: getHighAtrContextLabel(atrPct, snapshot.marketTickPrimaryPattern, config),
    ...score,
    ...agreements,
    marketTickIndicatorAgreementCount: agreementCount,
    marketTickIndicatorConflictCount: conflictCount,
    marketTickEvidenceAgreementLabel: agreementCount >= 4 && conflictCount === 0
      ? "STRONG_AGREEMENT"
      : agreementCount > conflictCount ? "AGREEMENT"
        : conflictCount > agreementCount ? "CONFLICT"
          : "MIXED",
    ...TICK_DIRECTION_SAFETY,
  });
}

export function extractFrozenTickDirectionSnapshot(record = {}) {
  const allowedExact = new Set([
    "entryTickSnapshotVersion",
    "entryTickSnapshotCapturedAt",
    "entryTickWindowEndAt",
    "entryTickOldestEventAt",
    "entryTickNewestEventAt",
    "entryTickWarmupMs",
    "entryTickFreshnessMs",
    "entryTickCanonicalSource",
    "entryTickTimestampBasis",
    "entryTickDataQuality",
    "entryTickMissingReasons",
    "entryTickStreamHealthyAtEntry",
    "entryTickReferencePrice",
    "entryTickReferencePriceSource",
    "entryTickReferenceVsTradeEntryBps",
    "entryTickRequiredFieldCount",
    "entryTickKnownFieldCount",
    "entryTickCoveragePct",
    "entryTickTradeEventCount",
    "entryTickBookEventCount",
    "entryTickAtrPctObserved",
    "entryTickSpreadPctObserved",
    "highAtrTickContextLabel",
    "highAtrDirectionalOpportunityScore",
    "highAtrDirectionalOpportunityTier",
    "highAtrDirectionalOpportunityReasons",
    "logOnly",
    "canAffectExecution",
    "executionApplied",
  ]);
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    if (allowedExact.has(key) || key.startsWith("marketTick")) result[key] = value;
  }
  return result;
}
