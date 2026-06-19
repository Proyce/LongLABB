// ─── AES V3 FEATURE NORMALIZER ───────────────────────────────────────────────
// Whitelist-based normalizer. Only fields on this list are used as inputs.
// Missing booleans stay null (not false). Missing strings stay "UNKNOWN".
// This contract prevents missing telemetry from being interpreted as safety.

function finiteOrNull(v) {
  return typeof v === "number" && isFinite(v) ? v : null;
}

function booleanOrNull(v) {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function stringOrUnknown(v) {
  return typeof v === "string" && v.length > 0 ? v : "UNKNOWN";
}

function deriveBtcRunDirection(s) {
  if (typeof s.btcRunDirection === "string" && s.btcRunDirection.length > 0) {
    return s.btcRunDirection;
  }
  switch (s.btcRegime) {
    case "BTC_STRONG_DOWN":
    case "BTC_WEAK_DOWN": return "DOWN";
    case "BTC_CHOP":      return "FLAT";
    case "BTC_MIXED":     return "MIXED";
    case "BTC_STRONG_UP": return "UP";
    default:              return null;
  }
}

function deriveSide(s) {
  if (s.shortParentBucket === "TOP_GAINER_SHORTS" || s.leaderboardSide === "GAINERS") return "GAINER";
  if (s.shortParentBucket === "TOP_LOSER_SHORTS"  || s.leaderboardSide === "LOSERS")  return "LOSER";
  return "UNKNOWN";
}

// Ordered whitelist. Each entry drives featureCoveragePct and missingFields.
const CORE_FEATURE_KEYS = [
  "side",
  "cvdLabel",
  "atrPct",
  "spreadPct",
  "candleColorAtEntry",
  "immediateRedImpulse",
  "redImpulseDetected",
  "immediateGreenImpulse",
  "greenImpulseDetected",
  "hasRedConfirmation",
  "last3TicksDirection",
  "last5TicksDirection",
  "microBouncePct",
  "priceVsVwapLabel",
  "priceVsVwapPct",
  "vwapContextLabel",
  "entryTimingGrade",
  "shortGateWouldPass",
  "microMomentumLabel",
  "hasRsiRollover",
  "macdHistogramState1m",
  "entryRankInBucket",
  "volAccel",
  "btcRunDirection",
  "btcShortContextLabel",
  "sessionQuality",
  "change24h",
];

const GAINER_FEATURE_KEYS = [
  "topGainerExhaustionQualityScore",
  "hasGainerExhaustionConfirmation",
  "topGainerWouldPassExhaustionAudit",
  "hasGainerRedRejection",
  "hasGainerFailedBreakout",
  "hasGainerContinuationDanger",
  "topGainerContinuationPressureLabel",
  "topGainerPumpPhaseLabel",
  "topGainerThesisLaneLabel",
  "topGainerContinuationDangerScore",
  "hasGainerRsiRollover",
  "topGainerVwapContextLabel",
];

const LOSER_FEATURE_KEYS = [
  "topLoserThesisLaneLabel",
  "isBlindWeaknessShort",
  "isBtcBounceTrapRisk",
  "isCorpseChaseRisk",
  "shortThesisLaneLabel",
];

const CONTEXT_FEATURE_KEYS = [
  "btc30mDirection",
  "btc2hDirection",
  "isInvalidMarket",
  "isStale",
  "entryQualityWarningLabels",
  "topGainerQualityWarningLabels",
];

const ALL_FEATURE_KEYS = [
  ...CORE_FEATURE_KEYS,
  ...GAINER_FEATURE_KEYS,
  ...LOSER_FEATURE_KEYS,
  ...CONTEXT_FEATURE_KEYS,
];

export function normalizeAesFeatures(s) {
  const side = deriveSide(s);

  const features = {
    // Side
    side,
    shortParentBucket: s.shortParentBucket ?? null,
    leaderboardSide:   s.leaderboardSide ?? null,

    // Core signals
    cvdLabel:          stringOrUnknown(s.cvdLabel),
    atrPct:            finiteOrNull(s.atrPct),
    spreadPct:         finiteOrNull(s.spreadPct),
    candleColorAtEntry: stringOrUnknown(s.candleColorAtEntry),
    immediateRedImpulse:   booleanOrNull(s.immediateRedImpulse),
    redImpulseDetected:    booleanOrNull(s.redImpulseDetected),
    immediateGreenImpulse: booleanOrNull(s.immediateGreenImpulse),
    greenImpulseDetected:  booleanOrNull(s.greenImpulseDetected),
    hasRedConfirmation:    booleanOrNull(s.hasRedConfirmation),

    // Tick direction
    last3TicksDirection: stringOrUnknown(s.last3TicksDirection ?? s.entryTiming?.last3TicksDirection),
    last5TicksDirection: stringOrUnknown(s.last5TicksDirection ?? s.entryTiming?.last5TicksDirection),

    // Micro bounce
    microBouncePct: finiteOrNull(s.microBouncePct ?? s.entryTiming?.microBouncePct),

    // VWAP / price
    priceVsVwapLabel:  stringOrUnknown(s.priceVsVwapLabel),
    priceVsVwapPct:    finiteOrNull(s.priceVsVwapPct ?? s.entryTiming?.priceVsVwapPct),
    vwapContextLabel:  stringOrUnknown(s.vwapContextLabel),

    // Entry timing / execution
    entryTimingGrade:  s.entryTimingGrade ?? null,
    shortGateWouldPass: booleanOrNull(s.shortGateWouldPass),
    microMomentumLabel: s.microMomentumLabel ?? null,
    hasRsiRollover:    booleanOrNull(s.hasRsiRollover),
    macdHistogramState1m: s.macdHistogramState1m ?? null,
    entryRankInBucket: finiteOrNull(s.entryRankInBucket ?? s.entryRank),
    volAccel:          finiteOrNull(s.volAccel),

    // BTC context
    btcRunDirection:      deriveBtcRunDirection(s),
    btcShortContextLabel: s.btcShortContextLabel ?? null,
    btc30mDirection:      s.btc30mDirection ?? null,
    btc2hDirection:       s.btc2hDirection ?? null,
    sessionQuality:       s.sessionQuality ?? null,

    // Change
    change24h: finiteOrNull(s.change24h ?? (s.priceChangePercent != null ? parseFloat(s.priceChangePercent) : null)),

    // Gainer fields
    topGainerExhaustionQualityScore:  finiteOrNull(s.topGainerExhaustionQualityScore),
    hasGainerExhaustionConfirmation:  booleanOrNull(s.hasGainerExhaustionConfirmation),
    topGainerWouldPassExhaustionAudit: booleanOrNull(s.topGainerWouldPassExhaustionAudit),
    hasGainerRedRejection:   booleanOrNull(s.hasGainerRedRejection),
    hasGainerFailedBreakout: booleanOrNull(s.hasGainerFailedBreakout),
    hasGainerContinuationDanger: booleanOrNull(s.hasGainerContinuationDanger),
    topGainerContinuationPressureLabel: s.topGainerContinuationPressureLabel ?? null,
    topGainerPumpPhaseLabel:   s.topGainerPumpPhaseLabel ?? null,
    topGainerThesisLaneLabel:  s.topGainerThesisLaneLabel ?? null,
    topGainerContinuationDangerScore: finiteOrNull(s.topGainerContinuationDangerScore),
    hasGainerRsiRollover:  booleanOrNull(s.hasGainerRsiRollover),
    topGainerVwapContextLabel: s.topGainerVwapContextLabel ?? null,
    topGainerQualityWarningLabels: Array.isArray(s.topGainerQualityWarningLabels) ? s.topGainerQualityWarningLabels : [],

    // Loser fields
    topLoserThesisLaneLabel: s.topLoserThesisLaneLabel ?? null,
    shortThesisLaneLabel:    s.shortThesisLaneLabel ?? null,
    isBlindWeaknessShort:    booleanOrNull(s.isBlindWeaknessShort ?? (s.shortThesisLaneLabel === "TOP_LOSER_BLIND_WEAKNESS_SHORT" ? true : null)),
    isBtcBounceTrapRisk:     booleanOrNull(s.isBtcBounceTrapRisk),
    isCorpseChaseRisk:       booleanOrNull(s.isCorpseChaseRisk),

    // Validity
    isInvalidMarket: booleanOrNull(s.isInvalidMarket),
    isStale:         booleanOrNull(s.isStale),

    // Warnings arrays
    entryQualityWarningLabels: Array.isArray(s.entryQualityWarningLabels) ? s.entryQualityWarningLabels : [],

    // Preview flag
    previewMode: s.previewMode === true,
  };

  // Compute coverage
  const missingFields = [];
  let present = 0;

  const coreKeys = CORE_FEATURE_KEYS.filter(k => k !== "side" && k !== "change24h");
  for (const k of coreKeys) {
    const v = features[k];
    const missing = v === null || v === "UNKNOWN";
    if (missing) missingFields.push(k);
    else present++;
  }
  const featureCoveragePct = Math.round((present / coreKeys.length) * 100);

  return { features, missingFields, featureCoveragePct, side };
}

// ── Preview snapshot builder ──────────────────────────────────────────────────
// Always returns a valid partial snapshot. Never returns null.
// Missing kline booleans remain null — missing red ≠ confirmed no red.
export function buildAbsoluteEntryPreviewSnapshot({ kl = {}, ticker = {}, rankIndex = 0, side = "LOSERS" }) {
  const parentBucket = side === "GAINERS" ? "TOP_GAINER_SHORTS" : "TOP_LOSER_SHORTS";

  return {
    shortParentBucket: parentBucket,
    leaderboardSide:   side,

    cvdLabel:          kl.cvdLabel  ?? "UNKNOWN",
    atrPct:            finiteOrNull(kl.atrPct),
    volAccel:          finiteOrNull(kl.volAccel),

    candleColorAtEntry:    kl.candleColorAtEntry  ?? "UNKNOWN",
    immediateRedImpulse:   booleanOrNull(kl.immediateRedImpulse),
    immediateGreenImpulse: booleanOrNull(kl.immediateGreenImpulse),
    redImpulseDetected:    booleanOrNull(kl.redImpulseDetected),
    greenImpulseDetected:  booleanOrNull(kl.greenImpulseDetected),

    last3TicksDirection: kl.last3TicksDirection ?? "UNKNOWN",
    last5TicksDirection: kl.last5TicksDirection ?? "UNKNOWN",
    microBouncePct:      finiteOrNull(kl.microBouncePct),

    hasRedConfirmation: booleanOrNull(
      kl.immediateRedImpulse === true || kl.redImpulseDetected === true || kl.last3TicksDirection === "DOWN"
        ? true
        : kl.immediateRedImpulse === false && kl.redImpulseDetected === false
          ? false
          : null
    ),

    microMomentumLabel:   kl.microMomentumLabel ?? null,
    macdHistogramState1m: kl.macdHistogramState1m ?? null,

    change24h:          ticker.priceChangePercent != null ? parseFloat(ticker.priceChangePercent) : null,
    entryRankInBucket:  rankIndex + 1,
    entryRank:          rankIndex + 1,

    // Forward validity flags from kline if present
    isInvalidMarket: kl.isInvalidMarket === true ? true : null,
    isStale:         kl.isStale === true ? true : null,

    previewMode: true,
  };
}
