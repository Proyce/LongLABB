// ─── LONG AES V1 FEATURE NORMALIZER ──────────────────────────────────────────
// Whitelist-based normalizer. Uses longParentBucket instead of shortParentBucket.
// Missing booleans stay null (not false). Missing strings stay "UNKNOWN".

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
  // Canonical BTC direction labels take precedence over the legacy field.
  const canonical = s.btcMicroDirectionLabel ?? s.btcTacticalDirectionLabel;
  if (typeof canonical === "string" && canonical.length > 0) {
    return canonical;
  }
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

function deriveLongSide(s) {
  if (s.longParentBucket === "TOP_GAINER_LONGS" || s.leaderboardSide === "GAINERS") return "GAINER";
  if (s.longParentBucket === "TOP_LOSER_LONGS"  || s.leaderboardSide === "LOSERS")  return "LOSER";
  return "UNKNOWN";
}

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
  "hasGreenConfirmation",
  "last3TicksDirection",
  "last5TicksDirection",
  "microPullbackPct",
  "priceVsVwapLabel",
  "priceVsVwapPct",
  "vwapContextLabel",
  "entryTimingGrade",
  "longGateWouldPass",
  "microMomentumLabel",
  "hasRsiRolloverUp",
  "macdHistogramState1m",
  "entryRankInBucket",
  "volAccel",
  "btcRunDirection",
  "btcLongContextLabel",
  "sessionQuality",
  "change24h",
];

const GAINER_FEATURE_KEYS = [
  "topGainerContinuationQualityScore",
  "hasGainerContinuationConfirmation",
  "topGainerWouldPassContinuationAudit",
  "hasGainerGreenConfirmation",
  "hasGainerHigherLow",
  "hasGainerBlowoffDanger",
  "topGainerBlowoffRiskLabel",
  "topGainerPumpPhaseLabel",
  "topGainerThesisLaneLabel",
  "topGainerBlowoffRiskScore",
  "hasGainerRsiRolloverUp",
  "topGainerVwapContextLabel",
];

const LOSER_FEATURE_KEYS = [
  "topLoserThesisLaneLabel",
  "isFallingKnife",
  "isBtcBounceFadeRisk",
  "isCvdBearChaseRisk",
  "longThesisLaneLabel",
];

const CONTEXT_FEATURE_KEYS = [
  "btc30mDirection",
  "btc2hDirection",
  "isInvalidMarket",
  "isStale",
  "entryQualityWarningLabels",
  "topGainerQualityWarningLabels",
];

export function normalizeLongAesFeatures(s) {
  const side = deriveLongSide(s);

  const features = {
    side,
    longParentBucket: s.longParentBucket ?? null,
    leaderboardSide:  s.leaderboardSide ?? null,

    cvdLabel:          stringOrUnknown(s.entryCvdLabel ?? s.cvdLabel),
    atrPct:            finiteOrNull(s.atrPct),
    spreadPct:         finiteOrNull(s.spreadPct),
    candleColorAtEntry: stringOrUnknown(s.candleColorAtEntry),
    immediateRedImpulse:   booleanOrNull(s.immediateRedImpulse),
    redImpulseDetected:    booleanOrNull(s.redImpulseDetected),
    immediateGreenImpulse: booleanOrNull(s.immediateGreenImpulse),
    greenImpulseDetected:  booleanOrNull(s.greenImpulseDetected),
    hasGreenConfirmation:  booleanOrNull(
      s.hasGreenConfirmation ??
      (s.immediateGreenImpulse === true || s.greenImpulseDetected === true ||
       s.last3TicksDirection === "UP" ? true :
       s.immediateGreenImpulse === false && s.greenImpulseDetected === false ? false : null)
    ),

    last3TicksDirection: stringOrUnknown(s.last3TicksDirection ?? s.entryTiming?.last3TicksDirection),
    last5TicksDirection: stringOrUnknown(s.last5TicksDirection ?? s.entryTiming?.last5TicksDirection),

    microPullbackPct: finiteOrNull(s.microPullbackPct ?? s.microBouncePct ?? s.entryTiming?.microBouncePct),

    priceVsVwapLabel: stringOrUnknown(s.entryPriceVsVwapLabel ?? s.priceVsVwapLabel),
    priceVsVwapPct:   finiteOrNull(s.entryPriceVsVwapPct ?? s.priceVsVwapPct ?? s.entryTiming?.priceVsVwapPct),
    vwapContextLabel: stringOrUnknown(s.longVwapContextLabel ?? s.vwapContextLabel),

    entryTimingGrade:  s.entryTimingGrade ?? null,
    longGateWouldPass: booleanOrNull(s.longGateWouldPass),
    microMomentumLabel: s.longMicroMomentumLabel ?? s.microMomentumLabel ?? null,
    hasRsiRolloverUp:  booleanOrNull(s.hasRsiRolloverUp ?? s.hasRsiRollover),
    macdHistogramState1m: s.macdHistogramState1m ?? null,
    entryRankInBucket: finiteOrNull(s.entryRankInBucket ?? s.entryRank),
    volAccel:          finiteOrNull(s.volAccel),

    btcRunDirection:     deriveBtcRunDirection(s),
    btcLongContextLabel: s.btcLongContextLabel ?? null,
    btc30mDirection:     s.btc30mDirection ?? null,
    btc2hDirection:      s.btc2hDirection ?? null,
    sessionQuality:      s.sessionQuality ?? null,

    change24h: finiteOrNull(s.change24h ?? (s.priceChangePercent != null ? parseFloat(s.priceChangePercent) : null)),

    // Gainer (TOP_GAINER_LONGS) fields
    topGainerContinuationQualityScore: finiteOrNull(s.topGainerContinuationQualityScore),
    hasGainerContinuationConfirmation: booleanOrNull(s.hasGainerContinuationConfirmation),
    topGainerWouldPassContinuationAudit: booleanOrNull(s.topGainerWouldPassContinuationAudit),
    hasGainerGreenConfirmation:  booleanOrNull(s.hasGainerGreenConfirmation ?? s.greenImpulseDetected),
    hasGainerHigherLow:          booleanOrNull(s.hasGainerHigherLow ?? s.higherLow1m),
    hasGainerBlowoffDanger:      booleanOrNull(s.hasGainerBlowoffDanger),
    topGainerBlowoffRiskLabel:   s.topGainerBlowoffRiskLabel ?? null,
    topGainerPumpPhaseLabel:     s.topGainerPumpPhaseLabel ?? null,
    topGainerThesisLaneLabel:    s.topGainerThesisLaneLabel ?? null,
    topGainerBlowoffRiskScore:   finiteOrNull(s.topGainerBlowoffRiskScore ?? s.topGainerContinuationDangerScore),
    hasGainerRsiRolloverUp:      booleanOrNull(s.hasGainerRsiRolloverUp),
    topGainerVwapContextLabel:   s.topGainerVwapContextLabel ?? null,
    topGainerQualityWarningLabels: Array.isArray(s.topGainerQualityWarningLabels) ? s.topGainerQualityWarningLabels : [],

    // Loser (TOP_LOSER_LONGS) fields
    topLoserThesisLaneLabel: s.topLoserThesisLaneLabel ?? null,
    longThesisLaneLabel:     s.longThesisLaneLabel ?? null,
    isFallingKnife:          booleanOrNull(s.isFallingKnife ?? (s.longSubBucket === "TOP_LOSER_FALLING_KNIFE_DANGER" ? true : null)),
    isBtcBounceFadeRisk:     booleanOrNull(s.isBtcBounceFadeRisk),
    isCvdBearChaseRisk:      booleanOrNull(s.isCvdBearChaseRisk),

    isInvalidMarket: booleanOrNull(s.isInvalidMarket),
    isStale:         booleanOrNull(s.isStale),

    // LONG audit hard-block flag — replaces deprecated shortPressureWouldHardBlock
    longAuditWouldHardBlock: booleanOrNull(
      s.longAuditWouldHardBlock ??
      s.longAudit?.longAuditWouldHardBlock ??
      (s.longAuditDangerTier === 'HARD_DANGER' ? true : null)
    ),

    entryQualityWarningLabels: Array.isArray(s.entryQualityWarningLabels) ? s.entryQualityWarningLabels : [],

    previewMode: s.previewMode === true,
  };

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

export function buildLongAesPreviewSnapshot({ kl = {}, ticker = {}, rankIndex = 0, side = "LOSERS" }) {
  const parentBucket = side === "GAINERS" ? "TOP_GAINER_LONGS" : "TOP_LOSER_LONGS";
  return {
    longParentBucket: parentBucket,
    leaderboardSide:  side,
    cvdLabel:          kl.cvdLabel  ?? "UNKNOWN",
    atrPct:            typeof kl.atrPct === "number" && isFinite(kl.atrPct) ? kl.atrPct : null,
    volAccel:          typeof kl.volAccel === "number" && isFinite(kl.volAccel) ? kl.volAccel : null,
    candleColorAtEntry:    kl.candleColorAtEntry  ?? "UNKNOWN",
    immediateRedImpulse:   kl.immediateRedImpulse   === true ? true : kl.immediateRedImpulse   === false ? false : null,
    immediateGreenImpulse: kl.immediateGreenImpulse === true ? true : kl.immediateGreenImpulse === false ? false : null,
    redImpulseDetected:    kl.redImpulseDetected    === true ? true : kl.redImpulseDetected    === false ? false : null,
    greenImpulseDetected:  kl.greenImpulseDetected  === true ? true : kl.greenImpulseDetected  === false ? false : null,
    last3TicksDirection: kl.last3TicksDirection ?? "UNKNOWN",
    last5TicksDirection: kl.last5TicksDirection ?? "UNKNOWN",
    microPullbackPct:    typeof kl.microPullbackPct === "number" && isFinite(kl.microPullbackPct) ? kl.microPullbackPct : null,
    microMomentumLabel:   kl.microMomentumLabel   ?? null,
    macdHistogramState1m: kl.macdHistogramState1m ?? null,
    change24h:          ticker.priceChangePercent != null ? parseFloat(ticker.priceChangePercent) : null,
    entryRankInBucket:  rankIndex + 1,
    entryRank:          rankIndex + 1,
    isInvalidMarket: kl.isInvalidMarket === true ? true : null,
    isStale:         kl.isStale === true ? true : null,
    previewMode: true,
  };
}
