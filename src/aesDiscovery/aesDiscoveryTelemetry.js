// ─── AES DISCOVERY TELEMETRY ──────────────────────────────────────────────────
// Reuses normal ShortLab telemetry functions.  No simplified versions.

import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";

// Required AES fields for coverage calculation
export const AES_REQUIRED_FIELDS = [
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
  "microBouncePct",
  "priceVsVwapLabel",
  "priceVsVwapPct",
  "vwapContextLabel",
  "entryTimingGrade",
  "microMomentumLabel",
  "hasRsiRollover",
  "macdHistogramState1m",
  "btcRunDirection",
  "btcLongContextLabel",
];

export function computeTelemetryCoverage(snapshot) {
  if (!snapshot) return 0;
  const present = AES_REQUIRED_FIELDS.filter(f => {
    const v = snapshot[f];
    return v !== null && v !== undefined && v !== "UNKNOWN";
  });
  return Math.round((present.length / AES_REQUIRED_FIELDS.length) * 100);
}

export function getMissingFields(snapshot) {
  if (!snapshot) return AES_REQUIRED_FIELDS.slice();
  return AES_REQUIRED_FIELDS.filter(f => {
    const v = snapshot[f];
    return v === null || v === undefined || v === "UNKNOWN";
  });
}

// ── Build discovery telemetry snapshot ───────────────────────────────────────

export async function buildDiscoveryTelemetrySnapshot({
  candidate,
  marketContext,
  oiSnapshots,
  getKlines,
  getOI,
  computeEntryTelemetry,
  computeRsiTelemetry,
  computeTrendTelemetry,
  computeAdvancedMarketTelemetry,
  buildShortAuditFields,
  classifyShortBucket,
  entryTelemetryConfig,
  config = AES_DISCOVERY_CONFIG,
  scannerVersion = AES_DISCOVERY_CONFIG.scannerVersion,
  scoreVersion,
}) {
  const symbol      = candidate.symbol;
  const side        = candidate.leaderboardSide === "GAINERS" ? "GAINER" : "LOSER";
  const now         = Date.now();
  const snapshotId  = `disc_snap_${symbol}_${now}`;
  const warnings    = [];
  const missingFields = [];

  let klines1m   = null;
  let klinesVwap = null;
  let oiValue    = null;
  let spreadPct  = null;

  try {
    const [k1m, kVwap, oiRes] = await Promise.allSettled([
      getKlines(symbol, "1m", 20),
      getKlines(symbol, entryTelemetryConfig?.vwapTimeframe ?? "5m", entryTelemetryConfig?.vwapLookback ?? 20),
      getOI(symbol),
    ]);

    if (k1m.status === "fulfilled") {
      klines1m = k1m.value;
    } else {
      warnings.push("KLINES_1M_FAILED");
    }

    if (kVwap.status === "fulfilled") {
      klinesVwap = kVwap.value;
    } else {
      warnings.push("KLINES_VWAP_FAILED");
    }

    if (oiRes.status === "fulfilled") {
      oiValue = parseFloat(oiRes.value?.openInterest);
    } else {
      warnings.push("OI_FAILED");
    }
  } catch (err) {
    warnings.push("FETCH_ERROR:" + (err?.message ?? "unknown"));
  }

  // Build base snapshot object to pass to telemetry functions
  const baseTicker = {
    symbol,
    lastPrice: parseFloat(candidate.lastPrice),
    priceChangePercent: parseFloat(candidate.priceChangePercent),
    quoteVolume: parseFloat(candidate.quoteVolume),
    highPrice: parseFloat(candidate.highPrice),
    lowPrice: parseFloat(candidate.lowPrice),
    shortParentBucket: side === "GAINER" ? "TOP_GAINER_SHORTS" : "TOP_LOSER_SHORTS",
    leaderboardSide: candidate.leaderboardSide,
  };

  // Entry telemetry
  let entryTelemetry = {};
  if (klines1m && klinesVwap) {
    try {
      entryTelemetry = computeEntryTelemetry({
        klines1m,
        klinesVwap,
        entryPrice: baseTicker.lastPrice,
        spreadPct: null,
        side,
        now,
      }, entryTelemetryConfig) ?? {};
    } catch (err) {
      warnings.push("ENTRY_TELEMETRY_FAILED:" + (err?.message ?? "unknown"));
    }
  } else {
    warnings.push("INSUFFICIENT_KLINES_FOR_ENTRY_TELEMETRY");
  }

  // RSI telemetry
  let rsiTelemetry = {};
  if (klines1m) {
    try {
      rsiTelemetry = computeRsiTelemetry({ klines1m, side, symbol }) ?? {};
    } catch (err) {
      warnings.push("RSI_TELEMETRY_FAILED");
    }
  }

  // Trend telemetry
  let trendTelemetry = {};
  if (klines1m) {
    try {
      trendTelemetry = computeTrendTelemetry({ klines1m, side, symbol }) ?? {};
    } catch (err) {
      warnings.push("TREND_TELEMETRY_FAILED");
    }
  }

  // Advanced market telemetry
  let advancedTelemetry = {};
  if (klines1m) {
    try {
      advancedTelemetry = computeAdvancedMarketTelemetry({ klines1m, side, symbol, oiSnapshots }) ?? {};
    } catch (err) {
      warnings.push("ADVANCED_TELEMETRY_FAILED");
    }
  }

  // Combine all telemetry
  const combined = {
    ...baseTicker,
    ...entryTelemetry,
    ...rsiTelemetry,
    ...trendTelemetry,
    ...advancedTelemetry,
    symbol,
    side,
    shortParentBucket: baseTicker.shortParentBucket,
    leaderboardSide: candidate.leaderboardSide,
    entryRankInBucket: candidate.side24hRank ?? null,
    change24h: parseFloat(candidate.priceChangePercent),
    openInterest: oiValue,
  };

  // Short gate audit
  let auditFields = {};
  try {
    auditFields = buildShortAuditFields(combined, marketContext) ?? {};
  } catch (err) {
    warnings.push("AUDIT_FIELDS_FAILED");
  }

  // Bucket classification
  let bucketFields = {};
  try {
    bucketFields = classifyShortBucket({ ...combined, ...auditFields }) ?? {};
  } catch (err) {
    warnings.push("BUCKET_CLASSIFY_FAILED");
  }

  // Market context fields
  const btcFields = {
    btcRunDirection:       marketContext?.btc?.direction ?? null,
    btcLongContextLabel:   marketContext?.btc?.longContextLabel ?? marketContext?.btc?.shortContextLabel ?? null,
    btc30mDirection:       marketContext?.btc?.direction30m ?? null,
    btc2hDirection:        marketContext?.btc?.direction2h ?? null,
    btcRegime:             marketContext?.btc?.regime ?? null,
    sessionQuality:        marketContext?.sessionQuality ?? null,
  };

  const fullSnapshot = {
    ...combined,
    ...auditFields,
    ...bucketFields,
    ...btcFields,
    // Discovery identity
    telemetrySnapshotId: snapshotId,
    telemetryComputedAt: now,
    telemetrySource: "AES_DISCOVERY_DEEP_SCAN",
    scannerVersion,
    scoreVersion: scoreVersion ?? null,
    telemetryWarnings: warnings,
    // Coverage computed after merge
  };

  const telemetryCoveragePct = computeTelemetryCoverage(fullSnapshot);
  const telemetryMissingFields = getMissingFields(fullSnapshot);

  fullSnapshot.telemetryCoveragePct    = telemetryCoveragePct;
  fullSnapshot.telemetryMissingFields  = telemetryMissingFields;

  if (telemetryCoveragePct < config.minimumTelemetryCoveragePct) {
    fullSnapshot.telemetryWarnings.push("INSUFFICIENT_COVERAGE");
  }

  return fullSnapshot;
}

// Safety guard: assert telemetry source is never used for live orders
export function assertDiscoveryTelemetrySafe(snapshot) {
  if (snapshot?.telemetrySource !== "AES_DISCOVERY_DEEP_SCAN") {
    console.error("[AES_DISCOVERY_ERROR] Unexpected telemetry source", snapshot?.telemetrySource);
  }
}
