import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import {
  ENTRY_TELEMETRY_CONFIG,
  computeEntryTelemetry,
  flattenEntryTelemetry,
  ENTRY_TELEMETRY_DEFAULTS,
  ENTRY_TELEMETRY_CSV_HEADERS,
  entryTelemetryCSVRow,
} from "../telemetry/entryTelemetry.js";
import {
  MARKET_CONTEXT_CONFIG,
  computeMarketContext,
  flattenMarketContext,
  MARKET_CONTEXT_DEFAULTS,
  MARKET_CONTEXT_CSV_HEADERS,
  marketContextCSVRow,
} from "../marketContext.js";
import {
  RSI_TELEMETRY_CONFIG,
  RSI_TELEMETRY_DEFAULTS,
  RSI_TELEMETRY_CSV_HEADERS,
  computeRsiTelemetry,
  flattenRsiTelemetry,
  rsiTelemetryCSVRow,
} from "../telemetry/rsiTelemetry.js";
import {
  TREND_TELEMETRY_CONFIG,
  TREND_TELEMETRY_DEFAULTS,
  TREND_TELEMETRY_CSV_HEADERS,
  computeTrendTelemetry,
  flattenTrendTelemetry,
  trendTelemetryCSVRow,
} from "../telemetry/trendTelemetry.js";
import {
  ADVANCED_MARKET_TELEMETRY_CONFIG,
  ADVANCED_MARKET_TELEMETRY_DEFAULTS,
  ADVANCED_MARKET_TELEMETRY_CSV_HEADERS,
  computeAdvancedMarketTelemetry,
  flattenAdvancedMarketTelemetry,
  advancedMarketTelemetryCSVRow,
} from "../telemetry/advancedMarketTelemetry.js";
import { classifyLongBucket } from "../longBuckets/longBucketClassifier.js";
import { evaluateLongGateAudit, buildLongAuditFields } from "../longGate/longGateAudit.js";
import FiltersTab from "../filters/FiltersTab.jsx";
import { SmartTable } from "../SmartTable.jsx";
import {
  FEE_CONFIG,
  computeFeeDragMarginPct,
  computeFeeTelemetry,
  computeSimProfileFeeTelemetry,
} from "../telemetry/feeTelemetry.js";
import { DEFAULT_FEE_CONFIG, captureFeeSnapshot, POSITION_SIZING_MODE } from "../fees/feeConfig.js";
import {
  detectLongProfitLockFloorCross,
  buildProfitLockFillTelemetry,
  recommendProfitLockActionLogOnly,
} from "../fees/profitLockTelemetry.js";
import { computeFeeAccounting } from "../fees/feeAccounting.js";
import {
  EXIT_PROFILE,
  EXIT_PROFILE_CONFIG,
  PROFIT_LOCK_CONFIG,
  getProfitLockRules,
  getDynamicProfitLockRules,
  getDynamicProfitLockRulesFeeSafe,
  buildLiveExitContext,
  resolveDynamicExitProfile,
  resolveInitialExitProfileBias,
  makeExitProfileDefaults,
} from "../exitProfiles/dynamicExitProfiles.js";
import {
  LONG_AES_V1_CSV_HEADERS,
  longAesV1CSVRow,
} from "../scoring/longAbsoluteEntryScore/index.js";
import {
  POST_FEE_10_DEFAULT_FIELDS,
  POST_FEE_10_CSV_HEADERS,
  calculatePostFee10OutcomeAssessment,
  flattenPostFee10OutcomeAssessment,
  assignAllPostFee10WinnerRanks,
  evaluatePostFee10LiveConfirmation,
  buildPostFee10AnalyticsReport,
  postFee10CSVRow,
} from "../outcomes/longPostFee10Support.js";
import {
  tickerPreviewScore,
  tickerAesPreviewScore,
  tickerBestDnaPreviewAssessment,
  tickerPostFee10PreviewAssessment,
} from "../research/longPreviewScorers.js";
import {
  LONG_BEST_DNA_DEFAULT_FIELDS,
  LONG_BEST_DNA_CSV_HEADERS,
  longBestDnaCSVRow,
  flattenLongOutcomeFields,
} from "../export/longBestDnaExport.js";
import { assignRunBestNormRanksLong } from "../export/runOutcomeRanking.js";
import { computeLongRunnerCaptureAudit } from "../audits/longRunnerCaptureAudit.js";
import {
  fetchMarketRegimeContext,
  getLastValidSnapshot,
  computeSnapshotAgeMs,
  MARKET_REGIME_CONFIG,
} from "../marketRegime/index.js";
import {
  flattenMarketRegimeSnapshot,
  MARKET_REGIME_DEFAULTS,
  MARKET_REGIME_CSV_HEADERS,
  marketRegimeCSVRow,
} from "../marketRegime/marketRegime.flatten.js";
import { computeSessionHealth } from "../sessionHealth/sessionHealth.governor.js";
import {
  flattenSessionHealth,
  SESSION_HEALTH_DEFAULTS,
  SESSION_HEALTH_CSV_HEADERS,
  sessionHealthCSVRow,
} from "../sessionHealth/sessionHealth.flatten.js";
// Spec §5: batch-only adaptive AES and entry policy retired. The canonical
// research builder is the single source of entry research for both paths.
import { evaluateLiveExitAudit } from "../liveExitAudit/liveExitAudit.evaluate.js";
import {
  LIVE_EXIT_AUDIT_CSV_HEADERS,
  flattenLiveExitAuditCsvRow,
  flattenLiveExitAuditDefaults,
} from "../liveExitAudit/liveExitAudit.flatten.js";
import MarketRegimeHeader from "../components/MarketRegimeHeader.jsx";
import AesDiscoveryTab from "../aesDiscovery/AesDiscoveryTab.jsx";
import { STORAGE_KEYS } from "../storage/storageKeys.js";
import { AES_DISCOVERY_CONFIG, mergeDiscoveryConfig } from "../aesDiscovery/aesDiscoveryConfig.js";
import { buildFullLongUniverse, updateTickHistory, computeTickHistoryFields } from "../aesDiscovery/aesDiscoveryUniverse.js";
import { selectDeepScanCandidates } from "../aesDiscovery/aesDiscoveryPrefilter.js";
import { createQueue } from "../aesDiscovery/aesDiscoveryQueue.js";
import { buildDiscoveryTelemetrySnapshot } from "../aesDiscovery/aesDiscoveryTelemetry.js";
import { computeDiscoveryAesVariants } from "../aesDiscovery/aesDiscoveryScore.js";
import { assignDiscoveryLabels } from "../aesDiscovery/aesDiscoveryLabels.js";
import {
  createEpisodeState, maybeShadowEntry,
  updateShadowTradeBroadScan, evaluateShadowExit, updateEpisodeState,
} from "../aesDiscovery/aesDiscoveryShadowEngine.js";
import {
  apiFetch,
  onRateLimitChange,
  snapshot as rlSnapshot,
  RL,
  RATE_LIMIT_PRIORITY,
} from "../rateLimiter/index.js";
import ShadowLongAuditTab from "../shadowLong/ShadowLongAuditTab.jsx";
import { FeesTab } from "../fees/FeesTab.jsx";
import { CSS } from "../ui/globalCss.js";
import { color as _tk, font as _tkFont } from "../ui/tokens.js";
import { ToastProvider, useToast } from "../ui/Toast.jsx";
import { CommandPalette } from "../ui/CommandPalette.jsx";
import { buildResearchEnrichedTrade } from "../research/buildResearchEnrichedTrade.js";
import { finalizeLongTrade } from "../lifecycle/longTradeLifecycle.js";
import { CLOSE_REASON, CLOSE_EXECUTION_MECHANISM, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";
import { getLongProfitLockUpdate } from "../lifecycle/profitLockStrategy.js";
import {
  makeProfitLockProtectionDefaults,
  synchronizeSimulatedProfitLockProtection,
  evaluateLongProfitLockBreach,
  PROFIT_LOCK_PROTECTION_STATE,
} from "../lifecycle/profitLockProtection.js";
import { evaluateLongImmediateExit, validateLongLifecyclePriceTick } from "../lifecycle/openPositionLifecycle.js";
import { prepareLongTradeFinalization, resolveFreshFinalPrice } from "../lifecycle/tradeFinalization.js";
import { collectStaleLifecycleSymbols, buildCriticalRestFallbackTick } from "../lifecycle/positionPriceWatchdog.js";
import { getSharedPriceStream, parsePriceSourcePrecision } from "../shadowLong/binancePriceStream.js";
import { buildManualResearchTrade } from "../research/buildManualResearchTrade.js";
import { buildBatchResearchTrade } from "../research/buildBatchResearchTrade.js";
import { makeLongResearchVersionStamp } from "../research/longResearchSchemaVersions.js";
import { migrateLongTradeRecord } from "../migrations/migrateLongTradeRecord.js";
import { assertLongResearchOnly, LONG_RESEARCH_ONLY_CONFIG } from "../safety/assertLongResearchOnly.js";
import { buildLongTradeCsvBlob, buildLongTradeJsonBlob } from "../export/longTradeExport.js";
import { buildLongBatchDescriptors, selectLongBatchTrades } from "../export/longBatchExport.js";
import { downloadBlob, exportLongBatchAnalysisZip } from "../export/longBatchExporter.js";
import { finiteNumberOrNull, safeFixed, safeSignedPercent, safeRound, hasFiniteClosedPnl, safeSymbol } from "../ui/safeFormat.js";
import { compactLongTradeForRuntime, compactLongTradesForPersistence } from "../telemetry/telemetryCompaction.js";
import { createTickDirectionCollector } from "../tickDirection/candidateTickStream.js";
import { TICK_DIRECTION_CONFIG } from "../tickDirection/tickDirection.config.js";
import { captureTickDirectionSnapshot } from "../tickDirection/tickDirectionSnapshot.js";
import {
  buildTickDirectionOutcomeDefaults,
  censorUnfilledTickDirectionOutcomes,
  updateTickDirectionOutcomeAudit,
} from "../tickDirection/tickDirectionOutcomeAudit.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const FAPI       = "https://fapi.binance.com/fapi/v1";
const MIXED_BUCKET_TARGET = 25;
const MAX_SAMPLES = MIXED_BUCKET_TARGET * 2;
const RL_LIMIT   = RL.FREEZE_CEILING;
const HOLD_MS    = 10_800_000; // 3 hours
const AUTO_COOLDOWN_DEFAULT_MS = 300_000;
const AUTO_COOLDOWN_FAST_MS    = 60_000;
const POLL_MS    = 15_000;
const SCAN_REQUEST_TIMEOUT_MS = 12_000;
const DEEP_TELEMETRY_SCAN_MS = 60_000;
const BATCH_EXPORT_BUSY_PHASES = Object.freeze(['SNAPSHOTTING', 'QUEUED', 'PREPARING', 'COMPRESSING']);
const LIFECYCLE_TICK_FLUSH_MS = 100;
const LIFECYCLE_SYMBOL_STALE_MS = 3_000;
const LIFECYCLE_STALE_WATCH_INTERVAL_MS = 1_000;
const LIFECYCLE_PRICE_SOURCE_PRIORITY = Object.freeze({
  BOOK_TICKER: 5,
  AGG_TRADE: 4,
  REST_CRITICAL_FALLBACK_V2: 3,
  MARK_PRICE_1S: 2,
  REST_CRITICAL_FALLBACK: 1,
});
const TRAIL_PCT  = 1.5;
const SL_PCT     = 1;
const TP_PCT     = 3;
const LEV_OPTS   = [1, 3, 5, 10, 20];

const LONG_BUCKET_POSITION_LIMITS = {
  maxOpenLongsTotal: MIXED_BUCKET_TARGET * 2,
  maxOpenLongsPerSymbol: 1,
  parentBucketCaps: {
    TOP_LOSER_LONGS:  MIXED_BUCKET_TARGET,
    TOP_GAINER_LONGS: MIXED_BUCKET_TARGET,
  },
};

const LONG_RISK_CONFIG = {
  basis: "PRICE_PERCENT",
  stopLossPricePct: SL_PCT,
  trailingDistancePricePct: TRAIL_PCT,
  takeProfitPricePct: TP_PCT,
};

function marginPctToPricePct(marginPct, leverage) {
  if (!leverage) return null;
  return marginPct / leverage;
}
function pricePctToMarginPct(pricePct, leverage) {
  return pricePct * leverage;
}

const IC_SIGNALS = [
  { key: "change24h",          label: "24h Change %" },
  { key: "funding",            label: "Funding Rate %" },
  { key: "cvdRatio",           label: "CVD Buy Ratio" },
  { key: "atrPct",             label: "ATR %" },
  { key: "volAccel",           label: "Volume Accel %" },
  { key: "bounceFromLow",      label: "Bounce from 24h Low %" },
  { key: "distFromHigh",       label: "Dist from 24h High %" },
  { key: "spreadPct",          label: "Bid-Ask Spread %" },
  { key: "entryRank",          label: "Entry Rank in Losers" },
  { key: "utcHour",            label: "UTC Entry Hour" },
  { key: "bounceContextNum",   label: "Bounce Context (0=FRESH→3=CONTINUING)" },
  { key: "entryTimingGradeNum",label: "Entry Timing Grade (0=A→4=F)" },
];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const f2   = n => safeFixed(n, 2);
const f3   = n => safeFixed(n, 3);
const fPct = n => safeSignedPercent(n, 2);
const fDd  = n => finiteNumberOrNull(n) ? `-${safeFixed(Math.abs(Number(n)), 2)}%` : "0.00%";
const numberOrNull = finiteNumberOrNull;
const fPrice = p => {
  const n = finiteNumberOrNull(p);
  if (n == null || n <= 0) return "—";
  if (n < 0.001) return n.toFixed(7);
  if (n < 0.01)  return n.toFixed(5);
  if (n < 1)     return n.toFixed(4);
  if (n < 10)    return n.toFixed(3);
  return n.toFixed(2);
};
const fVol = v => {
  const n = finiteNumberOrNull(v);
  if (n == null) return "—";
  return n >= 1e9 ? `${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : `${(n/1e3).toFixed(0)}K`;
};
const fTime = ms => {
  if (ms <= 0) return "DONE";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
};
const pearson = (xs, ys) => {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
  const num = xs.reduce((s,x,i) => s+(x-mx)*(ys[i]-my), 0);
  const den = Math.sqrt(xs.reduce((s,x)=>s+(x-mx)**2,0) * ys.reduce((s,y)=>s+(y-my)**2,0));
  return den > 0 ? num/den : null;
};
const icColor = r => {
  if (r === null) return "#8899cc";
  if (Math.abs(r) > 0.3) return r > 0 ? "#00ff88" : "#ff4455";
  if (Math.abs(r) > 0.1) return r > 0 ? "#55cc88" : "#cc5566";
  return "#a8a8c8";
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getLossProfile(finalPnlPct, mfe, closeReason) {
  const normalizedReason = normalizeLongCloseReason(closeReason);
  if (finalPnlPct >= 0) return "WIN";
  if ([CLOSE_REASON.RUN_STOP, CLOSE_REASON.APP_SHUTDOWN].includes(normalizedReason) && (mfe ?? 0) < 0.25) return "SLOW_BLEED";
  if (normalizedReason === CLOSE_REASON.TIMEOUT && (mfe ?? 0) < 0.25) return "SLOW_BLEED";
  if ((mfe ?? 0) < 0.25)  return "INSTANT_BAD_ENTRY";
  if ((mfe ?? 0) < 1.0)   return "CHOPPY_STOP";
  return "PROFIT_THEN_REVERSED";
}

function getBounceContext(bounceFromLow) {
  const b = bounceFromLow ?? 50;
  if (b < 15)  return "FRESH_BREAKDOWN";
  if (b < 40)  return "NEAR_LOW_POSSIBLE_BOUNCE";
  if (b >= 65) return "BOUNCE_CONTINUING";
  return "BOUNCED_AND_REJECTING";
}

function getSpreadBucket(s) {
  if (s == null)  return null;
  if (s <= 0.02)  return "SPREAD_LE_0_02";
  if (s <= 0.05)  return "SPREAD_0_02_TO_0_05";
  if (s <= 0.10)  return "SPREAD_0_05_TO_0_10";
  return "SPREAD_GT_0_10";
}

function getAtrBucket(a) {
  if (a == null)  return null;
  if (a <= 0.2)   return "ATR_LE_0_2";
  if (a <= 0.4)   return "ATR_0_2_TO_0_4";
  if (a <= 0.6)   return "ATR_0_4_TO_0_6";
  if (a <= 1.0)   return "ATR_0_6_TO_1_0";
  if (a <= 2.0)   return "ATR_1_0_TO_2_0";
  return "ATR_GT_2_0";
}

function getEntryRankBucket(r) {
  if (r <= 5)  return "RANK_1_TO_5";
  if (r <= 10) return "RANK_6_TO_10";
  if (r <= 15) return "RANK_11_TO_15";
  if (r <= 20) return "RANK_16_TO_20";
  return "RANK_21_TO_25";
}

function getLeverageProfile(lev) {
  if (lev === 1)  return "ONE_X_ULTRA_SAFE_RESEARCH";
  if (lev === 5)  return "FIVE_X_DEFAULT_RESEARCH";
  if (lev === 10) return "TEN_X_HIGH_RISK_RESEARCH";
  return "LOWER_LEVERAGE_RESEARCH";
}

function computeWarningFlags(spreadPct, atrPct, entryRank, leverage) {
  const flags = [];
  if (spreadPct != null && spreadPct > 0.05)  flags.push("SPREAD_ABOVE_0_05");
  if (spreadPct != null && spreadPct > 0.10)  flags.push("SPREAD_ABOVE_0_10");
  if (leverage === 1  && spreadPct != null && spreadPct > 0.02) flags.push("SPREAD_WIDE_FOR_1X");
  if (leverage === 10 && spreadPct != null && spreadPct > 0.05) flags.push("SPREAD_WIDE_FOR_10X");
  if (atrPct != null && atrPct > 1.0)  flags.push("ATR_ABOVE_1");
  if (atrPct != null && atrPct > 2.0)  flags.push("ATR_ABOVE_2");
  if (entryRank > 10) flags.push("LOWER_PRIORITY_RANK_RESEARCH_ONLY");
  return flags;
}

function extractEntryTiming(klines, entryPrice, spreadPct) {
  if (!klines?.length || klines.length < 5) return null;
  const last10 = klines.slice(-10);
  const last5  = klines.slice(-5);
  const last3  = klines.slice(-3);
  const dirOf  = k => parseFloat(k[4]) < parseFloat(k[1]) ? 1 : -1;
  const sum3   = last3.reduce((a,k)  => a + dirOf(k), 0);
  const sum5   = last5.reduce((a,k)  => a + dirOf(k), 0);
  const sum10  = last10.reduce((a,k) => a + dirOf(k), 0);
  const last3ClosedCandlesDirection  = sum3  >= 3  ? "DOWN" : sum3  <= -3  ? "UP" : "MIXED";
  const last5ClosedCandlesDirection  = sum5  >= 4  ? "DOWN" : sum5  <= -4  ? "UP" : "MIXED";
  const last10ClosedCandlesDirection = sum10 >= 8  ? "DOWN" : sum10 <= -8  ? "UP" : "MIXED";
  const last3TicksDirection = last3ClosedCandlesDirection;
  const last5TicksDirection = last5ClosedCandlesDirection;
  const last10TicksDirection = last10ClosedCandlesDirection;
  const highs5  = last5.map(k => parseFloat(k[2]));
  const lows5   = last5.map(k => parseFloat(k[3]));
  const closes5 = last5.map(k => parseFloat(k[4]));
  const lows3   = last3.map(k => parseFloat(k[3]));
  const recentLow5  = Math.min(...lows5);
  const recentHigh5 = Math.max(...highs5);
  const microLow3   = Math.min(...lows3);
  const maxHigh5    = Math.max(...highs5);
  const minClose5   = Math.min(...closes5);
  const preEntryAdverseMovePct   = minClose5 > 0 ? parseFloat(((maxHigh5 - minClose5) / minClose5 * 100).toFixed(4)) : null;
  const preEntryFavorableMovePct = recentHigh5 > 0 ? parseFloat(((recentHigh5 - recentLow5) / recentHigh5 * 100).toFixed(4)) : null;
  const priceVsRecentLowPct      = recentLow5  > 0 ? parseFloat(((entryPrice - recentLow5)  / recentLow5  * 100).toFixed(4)) : null;
  const priceVsRecentHighPct     = recentHigh5 > 0 ? parseFloat(((entryPrice - recentHigh5) / recentHigh5 * 100).toFixed(4)) : null;
  const microBouncePct           = microLow3   > 0 ? parseFloat(((entryPrice - microLow3)   / microLow3   * 100).toFixed(4)) : null;
  let vwapNum = 0, vwapDen = 0;
  klines.forEach(k => {
    const tp = (parseFloat(k[2]) + parseFloat(k[3]) + parseFloat(k[4])) / 3;
    vwapNum += tp * parseFloat(k[5]); vwapDen += parseFloat(k[5]);
  });
  const vwap = vwapDen > 0 ? vwapNum / vwapDen : null;
  const priceVsVwapPct = vwap ? parseFloat(((entryPrice - vwap) / vwap * 100).toFixed(4)) : null;
  const lastK  = klines[klines.length - 1];
  const prev2K = klines[klines.length - 2];
  const lastGreen  = parseFloat(lastK[4])  > parseFloat(lastK[1]);
  const lastRed    = parseFloat(lastK[4])  < parseFloat(lastK[1]);
  const immediateGreenImpulse = lastGreen  && parseFloat(prev2K[4]) > parseFloat(prev2K[1]);
  const immediateRedImpulse   = lastRed    && parseFloat(prev2K[4]) < parseFloat(prev2K[1]);
  const spreadStableBeforeEntry = spreadPct != null && spreadPct <= 0.05;
  const reasons = [];
  let grade;
  // LONG timing: green impulse and upward structure are favorable; falling-knife is danger
  if (immediateRedImpulse && last3TicksDirection === "DOWN" && (preEntryFavorableMovePct ?? 0) < 0.1) {
    grade = "F"; reasons.push("FALLING_KNIFE_RED_IMPULSE");
  } else if (immediateRedImpulse && last3TicksDirection === "DOWN") {
    grade = "F"; reasons.push("IMMEDIATE_RED_IMPULSE_DOWNTREND");
  } else if (immediateGreenImpulse && last3TicksDirection === "UP" && spreadStableBeforeEntry) {
    grade = "A"; reasons.push("GREEN_IMPULSE_UPTREND_CLEAN_SPREAD");
  } else if (immediateGreenImpulse && !immediateRedImpulse) {
    grade = "B"; reasons.push("GREEN_IMPULSE");
  } else if (last3TicksDirection === "UP" && !immediateRedImpulse) {
    grade = "B"; reasons.push("UPWARD_MICRO_STRUCTURE");
  } else if (last3TicksDirection === "DOWN" && !immediateGreenImpulse) {
    grade = "D"; reasons.push("DOWNWARD_MICRO_STRUCTURE_NO_REVERSAL");
  } else {
    grade = "C"; reasons.push("UNCERTAIN");
  }
  return {
    last3ClosedCandlesDirection, last5ClosedCandlesDirection, last10ClosedCandlesDirection,
    closedCandleDirectionTimeframe: "1m",
    legacyTickDirectionSemantic: "ONE_MINUTE_CANDLE_DIRECTION_ALIAS",
    last3TicksDirection, last5TicksDirection, last10TicksDirection,
    preEntryAdverseMovePct, preEntryFavorableMovePct,
    priceVsRecentLowPct, priceVsRecentHighPct, priceVsVwapPct,
    microBouncePct, immediateGreenImpulse, immediateRedImpulse,
    spreadPctAtEntry: spreadPct ?? null, spreadStableBeforeEntry,
    entryTimingGrade: grade, entryTimingReasons: reasons,
  };
}

function getSessionQuality(btc1h, eth1h, avgAtr) {
  // LONG session quality: BTC/ETH strength = long-friendly, weakness = headwind
  if (btc1h > 1.5 && eth1h > 1.5)    return "LONG_TREND_FRIENDLY";
  if (btc1h < -0.5 && eth1h < -0.5)  return "BROAD_MARKET_HEADWIND";
  if (avgAtr > 2.5)                   return "HIGH_CHOP_CAUTION";
  return "LONG_SELECTIVE";
}

function normalizeRunValue(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function sameRunValue(left, right) {
  const l = normalizeRunValue(left, null);
  const r = normalizeRunValue(right, null);
  return l != null && r != null && l === r;
}

function sanitizeSampleRun(sample, fallbackRun = 1) {
  return {
    ...sample,
    run: normalizeRunValue(sample?.run, fallbackRun),
  };
}

function createAutoRunId() {
  return `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStartSetOptions(input) {
  if (input && typeof input === "object" && !input.nativeEvent && !input._reactName) {
    return {
      runOverride: input.runOverride,
      source: input.source ?? "MANUAL_SET",
      autoRunId: input.autoRunId ?? null,
      autoRunCycle: input.autoRunCycle ?? null,
    };
  }

  return {
    runOverride: input,
    source: "MANUAL_SET",
    autoRunId: null,
    autoRunCycle: null,
  };
}

function autoRunIsActive(autoRun) {
  return Boolean(autoRun && autoRun.phase !== "done");
}

function normalizeAutoRunTargetBucket(bucket) {
  if (bucket === "MIXED_25_25") return "MIXED_25_25";
  return bucket === "TOP_GAINER_LONGS" ? "TOP_GAINER_LONGS" : "TOP_LOSER_LONGS";
}

function autoRunTargetLabel(bucket) {
  const target = normalizeAutoRunTargetBucket(bucket);
  if (target === "MIXED_25_25") return `MIXED ${MIXED_BUCKET_TARGET}/${MIXED_BUCKET_TARGET}`;
  return target === "TOP_GAINER_LONGS" ? "GAINERS" : "LOSERS";
}

function buildShortUniverses(tickData, minVol) {
  const usdt = tickData.filter(t =>
    t.symbol.endsWith("USDT") &&
    parseFloat(t.quoteVolume) >= minVol &&
    Number.isFinite(parseFloat(t.priceChangePercent))
  );
  const losers = usdt
    .filter(t => parseFloat(t.priceChangePercent) < 0)
    .sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent))
    .slice(0, 30);
  const gainers = usdt
    .filter(t => parseFloat(t.priceChangePercent) > 0)
    .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
    .slice(0, 30);
  return { losers, gainers };
}

function countActiveByParentBucket(samples, bucket) {
  return samples.filter(s => !s.closed && s.longParentBucket === bucket).length;
}

function getAvailableBucketSlots(samples, bucket) {
  const totalActive    = samples.filter(s => !s.closed).length;
  const bucketActive   = countActiveByParentBucket(samples, bucket);
  const totalRemaining = LONG_BUCKET_POSITION_LIMITS.maxOpenLongsTotal - totalActive;
  const bucketCap      = LONG_BUCKET_POSITION_LIMITS.parentBucketCaps[bucket] ?? 0;
  const bucketRemaining = bucketCap - bucketActive;
  return Math.max(0, Math.min(totalRemaining, bucketRemaining));
}

function makeBucketRiskFields(lev) {
  const profitLockRules = getProfitLockRules(lev);
  const firstLockRule   = profitLockRules[0] ?? {};
  return {
    riskBasis:                    LONG_RISK_CONFIG.basis,
    slMarginPct:                  pricePctToMarginPct(LONG_RISK_CONFIG.stopLossPricePct, lev),
    slPricePct:                   LONG_RISK_CONFIG.stopLossPricePct,
    profitLockTriggerMarginPct:   firstLockRule.triggerPricePct != null ? pricePctToMarginPct(firstLockRule.triggerPricePct, lev) : null,
    profitLockTriggerPricePct:    firstLockRule.triggerPricePct ?? null,
    profitLockFloorMarginPct:     firstLockRule.lockMarginPct ?? null,
    profitLockFloorPricePct:      firstLockRule.lockMarginPct != null ? marginPctToPricePct(firstLockRule.lockMarginPct, lev) : null,
    trailingDistanceMarginPct:    pricePctToMarginPct(LONG_RISK_CONFIG.trailingDistancePricePct, lev),
    trailingDistancePricePct:     LONG_RISK_CONFIG.trailingDistancePricePct,
    profitLockRules,
  };
}

// Backward-compatible alias.
// This returns margin-level fee drag because finalPnlPct is margin-level.
function computeFeeDragPct(leverage, takerFeeRatePct = FEE_CONFIG.takerFeeRatePct) {
  return computeFeeDragMarginPct(leverage, takerFeeRatePct);
}

function computeExitProfileLabel(bucket, closeReason, finalPnlPct) {
  const side = bucket === "TOP_GAINER_LONGS" ? "GAINER" : "LOSER";
  const normalizedReason = normalizeLongCloseReason(closeReason);
  if (normalizedReason === CLOSE_REASON.PROFIT_LOCK) return `${side}_PROFIT_LOCK_EXIT`;
  if (normalizedReason === CLOSE_REASON.TRAILING_EXIT) return `${side}_TRAIL_EXIT`;
  if (normalizedReason === CLOSE_REASON.STOP_LOSS) return finalPnlPct < 0 ? `${side}_SL_LOSS` : `${side}_SL_SCRATCH`;
  if (normalizedReason === CLOSE_REASON.TAKE_PROFIT) return `${side}_TP_WIN`;
  if (normalizedReason === CLOSE_REASON.TIMEOUT) return finalPnlPct > 0 ? `${side}_TIMEOUT_WIN` : `${side}_TIMEOUT_LOSS`;
  return `${side}_MANUAL_CLOSE`;
}

function simulateExitProfile(trade, profile) {
  const mfe = trade.highestMarginPnlPct ?? trade.mfe ?? null;
  if (mfe == null) return { pnl: null, reason: null };
  if (mfe >= profile.tp) return { pnl: profile.tp, reason: "TP_HIT" };
  if (mfe >= profile.lockTrigger) return { pnl: profile.lockFloor, reason: "LOCK_TRIGGERED" };
  return { pnl: trade.finalPnlPct ?? null, reason: "SAME" };
}

function computeCloseDiagnostics(s, closeReason, finalPnlPct) {
  const mfe         = s.highestMarginPnlPct ?? s.mfe ?? null;
  const leverage    = s.leverage ?? 1;
  const diagnostics = [];

  if (closeReason === "PROFIT_LOCK" && finalPnlPct < 0)
    diagnostics.push("PROFIT_LOCK_EXIT_NEGATIVE_WARNING");
  if (s.profitLockActive && finalPnlPct < (s.profitLockLevelMarginPct ?? 0))
    diagnostics.push("LOCK_TRIGGERED_BUT_EXITED_BELOW_FLOOR");
  if (["RUN_STOP", "APP_SHUTDOWN"].includes(closeReason) && s.profitLockActive)
    diagnostics.push("SESSION_END_AFTER_LOCK_TRIGGER");
  if (mfe != null && mfe >= 20 && finalPnlPct < 5)
    diagnostics.push("MFE20_GIVEN_BACK");
  else if (mfe != null && mfe >= 20)
    diagnostics.push("MFE20_CAPTURED");
  if (mfe != null && (mfe - finalPnlPct) > 10)
    diagnostics.push("MFE_GIVEBACK_AFTER_LOCK_TRIGGER");
  if (mfe != null && mfe >= 10 && finalPnlPct < 0)
    diagnostics.push("EXIT_ENGINE_NOT_HARVESTING");

  const simSafe   = simulateExitProfile(s, { tp: 12, lockTrigger: 2.0, lockFloor: 1.2 });
  const simRunner = simulateExitProfile(s, { tp: 15, lockTrigger: 3.0, lockFloor: 2.0 });
  const simFast   = simulateExitProfile(s, { tp: 12, lockTrigger: 1.0, lockFloor: 0.8 });

  if (simFast.pnl   != null && simFast.pnl   > finalPnlPct + 3) diagnostics.push("FAST_LOCK_WOULD_HELP");
  if (simRunner.pnl != null && simRunner.pnl  > finalPnlPct + 5) diagnostics.push("RUNNER_PROFILE_WOULD_HELP");

  // Fee telemetry
  const actualFee = computeFeeTelemetry({ marginPnlPct: finalPnlPct, leverage });
  const safeFee   = computeSimProfileFeeTelemetry(simSafe.pnl,   leverage);
  const runnerFee = computeSimProfileFeeTelemetry(simRunner.pnl, leverage);
  const fastFee   = computeSimProfileFeeTelemetry(simFast.pnl,   leverage);

  // Fee-aware best-profile selection
  const simsWithFee = [
    { name: "SAFE",   pnl: simSafe.pnl,   feeAdjusted: safeFee.feeAdjustedMarginPnlPct },
    { name: "RUNNER", pnl: simRunner.pnl, feeAdjusted: runnerFee.feeAdjustedMarginPnlPct },
    { name: "FAST",   pnl: simFast.pnl,   feeAdjusted: fastFee.feeAdjustedMarginPnlPct },
  ].filter(x => x.feeAdjusted != null);

  const best = simsWithFee.length
    ? simsWithFee.reduce((a, b) => b.feeAdjusted > a.feeAdjusted ? b : a)
    : null;

  // Backward-compat: raw-pnl best (original)
  const simsRaw = [
    { name: "SAFE",   pnl: simSafe.pnl },
    { name: "RUNNER", pnl: simRunner.pnl },
    { name: "FAST",   pnl: simFast.pnl },
  ].filter(x => x.pnl != null);
  const bestRaw = simsRaw.length ? simsRaw.reduce((a, b) => b.pnl > a.pnl ? b : a) : null;

  const feeDragPct = actualFee.feeDragMarginPct;

  return {
    exitDiagnosticLabels:   diagnostics,

    // ── Backward-compatible sim fields ───────────────────────────────────
    simSafeProfilePnl:        simSafe.pnl,
    simSafeProfileReason:     simSafe.reason,
    simRunnerProfilePnl:      simRunner.pnl,
    simRunnerProfileReason:   simRunner.reason,
    simFastLockProfilePnl:    simFast.pnl,
    simFastLockProfileReason: simFast.reason,
    bestSimExitProfile:       bestRaw?.name ?? null,
    actualVsBestSimDelta:     bestRaw?.pnl != null ? parseFloat((finalPnlPct - bestRaw.pnl).toFixed(2)) : null,
    feeDragPct,
    feeAdjustedFinalPnlPct:   actualFee.feeAdjustedMarginPnlPct,

    // ── Explicit fee-aware fields ─────────────────────────────────────────
    feeMode:                  actualFee.feeMode,
    takerFeeRatePct:          actualFee.takerFeeRatePct,
    roundTripFeeNotionalPct:  actualFee.roundTripFeeNotionalPct,
    feeDragMarginPct:         actualFee.feeDragMarginPct,
    rawMarginPnlPct:          actualFee.rawMarginPnlPct,
    rawNormPnlPct:            actualFee.rawNormPnlPct,
    feeAdjustedMarginPnlPct:  actualFee.feeAdjustedMarginPnlPct,
    feeAdjustedNormPnlPct:    actualFee.feeAdjustedNormPnlPct,
    feeAdjustedWin:           actualFee.feeAdjustedWin,
    feeAdjustedLoss:          actualFee.feeAdjustedLoss,
    feeStatusLabel:           actualFee.feeStatusLabel,
    feeDisplayLabel:          actualFee.feeDisplayLabel,

    // ── Explicit sim profile fee fields ───────────────────────────────────
    simSafeProfileMarginPnlPct:              safeFee.marginPnlPct,
    simSafeProfileNormPnlPct:               safeFee.normPnlPct,
    simSafeProfileFeeAdjustedMarginPnlPct:  safeFee.feeAdjustedMarginPnlPct,
    simSafeProfileFeeAdjustedNormPnlPct:    safeFee.feeAdjustedNormPnlPct,

    simRunnerProfileMarginPnlPct:            runnerFee.marginPnlPct,
    simRunnerProfileNormPnlPct:             runnerFee.normPnlPct,
    simRunnerProfileFeeAdjustedMarginPnlPct: runnerFee.feeAdjustedMarginPnlPct,
    simRunnerProfileFeeAdjustedNormPnlPct:  runnerFee.feeAdjustedNormPnlPct,

    simFastLockProfileMarginPnlPct:          fastFee.marginPnlPct,
    simFastLockProfileNormPnlPct:           fastFee.normPnlPct,
    simFastLockProfileFeeAdjustedMarginPnlPct: fastFee.feeAdjustedMarginPnlPct,
    simFastLockProfileFeeAdjustedNormPnlPct:   fastFee.feeAdjustedNormPnlPct,

    // ── Fee-aware best sim ────────────────────────────────────────────────
    bestSimExitProfileByFeeAdjustedPnl: best?.name ?? null,
    actualVsBestSimFeeAdjustedDelta:
      best?.feeAdjusted != null
        ? parseFloat((actualFee.feeAdjustedMarginPnlPct - best.feeAdjusted).toFixed(4))
        : null,

    negativeProfitLockExit:   closeReason === "PROFIT_LOCK" && finalPnlPct < 0,
    profitLockExitBelowFloor: closeReason === "PROFIT_LOCK" && finalPnlPct < (s.profitLockLevelMarginPct ?? 0),
    exitProfileLabel:         computeExitProfileLabel(s.longParentBucket, closeReason, finalPnlPct),
  };
}

function finalizeClosedSample(mergedSample, closeReason, finalPnlPct, extra = {}) {
  const closedAt = extra.closedAt ?? mergedSample.closedAt ?? Date.now();
  const finalPrice = extra.exitPrice ?? extra.finalPrice ?? mergedSample.currentPrice ?? null;
  const rawFinalPriceTimestamp =
    extra.finalPriceTimestamp ?? mergedSample.lastPriceTimestamp ?? mergedSample.lastPriceUpdateAt ?? null;
  const rawFinalPriceSource =
    extra.finalPriceSource ?? mergedSample.lastPriceSource ?? extra.closeTriggerSource ?? 'UNKNOWN';

  // Pre-finalize freshness guard: the price that triggered this close is current
  // as of closedAt. If the bookkeeping timestamp is stale, re-stamp it so a fresh
  // close is not lost to STALE_FINAL_PRICE. Log-only; recorded in telemetry.
  const fresh = resolveFreshFinalPrice({
    finalPrice,
    finalPriceTimestamp: rawFinalPriceTimestamp,
    finalPriceSource: rawFinalPriceSource,
    now: closedAt,
    closeTriggeredAtNow: true,
  });
  const finalPriceTimestamp = fresh.finalPriceTimestamp;
  const finalPriceSource = fresh.finalPriceSource ?? rawFinalPriceSource;
  const refreshTelemetry = {
    finalPriceRefreshAttempted: fresh.finalPriceRefreshAttempted,
    finalPriceRefreshSucceeded: fresh.finalPriceRefreshSucceeded,
    finalPricePreRefreshAgeMs: fresh.finalPricePreRefreshAgeMs,
  };
  const finalization = prepareLongTradeFinalization({
    trade: mergedSample,
    finalPrice,
    finalPriceTimestamp,
    finalPriceSource,
    now: closedAt,
    allowUnchangedPrice: true,
    roundTripFeePct: 0.10,
    slippagePct: 0,
  });

  if (!finalization.ok) {
    return finalizeLongTrade(mergedSample, CLOSE_REASON.FINALIZATION_FAILED, null, {
      ...extra,
      ...refreshTelemetry,
      closedAt,
      currentPrice: finalPrice,
      finalPrice,
      finalPriceSource,
      finalPriceTimestamp,
      ...finalization.validation,
      finalizationFailureCode: finalization.finalizationFailureCode,
      strategyResearchEligible: false,
      strategyResearchExclusionReason: finalization.finalizationFailureCode,
      closeTriggerSource: extra.closeTriggerSource ?? 'FINALIZER',
      closeExecutionMechanism: extra.closeExecutionMechanism ?? CLOSE_EXECUTION_MECHANISM.FINALIZER,
    });
  }

  const canonicalFinalPnlPct = Number.isFinite(Number(finalPnlPct))
    ? Number(finalPnlPct)
    : finalization.pnl.grossMarginPct;
  const feeResult = computeFeeAccounting({
    grossMarginPnlPct: canonicalFinalPnlPct,
    leverage: mergedSample.leverage,
    feeSnapshot: mergedSample.feeSnapshot ?? null,
    isActive: false,
    config: DEFAULT_FEE_CONFIG,
  });
  const diagnostics = computeCloseDiagnostics(
    { ...mergedSample, ...extra, ...feeResult },
    closeReason,
    canonicalFinalPnlPct,
  );

  const base = finalizeLongTrade(mergedSample, closeReason, canonicalFinalPnlPct, {
    ...extra,
    ...refreshTelemetry,
    closedAt,
    currentPrice: finalPrice,
    exitPrice: finalPrice,
    finalPrice,
    finalPriceSource,
    finalPriceTimestamp,
    ...finalization.validation,
    finalizationFailureCode: null,
    strategyResearchEligible: true,
    strategyResearchExclusionReason: null,
  });

  const closedSample = {
    ...base,
    priceMovePct: finalization.pnl.priceMovePct,
    normPnlPct: feeResult.grossNormPnlPct,
    grossNormPnlPct: feeResult.grossNormPnlPct,
    grossMarginPnlPct: feeResult.grossMarginPnlPct,
    feeAdjustedLeveragedPnlPct: feeResult.feeAdjustedMarginPnlPct,
    ...feeResult,
    feeAdjustedFinalPnlPct: feeResult.feeAdjustedMarginPnlPct,
    lossProfile: getLossProfile(canonicalFinalPnlPct, mergedSample.mfe, closeReason),
    exitVsRegimeAttribution: {
      regime: mergedSample.longMarketBreadthLabel ?? null,
      context: mergedSample.longMarketContextLabel ?? null,
      closeReason: base.canonicalCloseReason ?? base.closeReason ?? null,
      lane: mergedSample.topLoserLongThesisLane ?? null,
    },
    ...diagnostics,
  };
  const outcome = calculatePostFee10OutcomeAssessment(closedSample);
  const longOutcomeFields = flattenLongOutcomeFields(closedSample);
  return {
    ...closedSample,
    ...longOutcomeFields,
    ...flattenPostFee10OutcomeAssessment(outcome),
  };
}

function makeBucketClassificationFields() {
  return {
    leaderboardSide:                 null,
    longParentBucket:               null,
    longSubBucket:                  "UNCLASSIFIED",
    longSetupScore:                 null,
    longSetupReasons:               [],
    longSetupWarnings:              [],
    topLoserSetupScore:              null,
    topLoserSubBucket:               null,
    topLoserWarningFlags:            [],
    topGainerExhaustionScore:        null,
    topGainerContinuationRiskScore:  null,
    topGainerSubBucket:              null,
    topGainerExhaustionReasons:      [],
    topGainerContinuationWarnings:   [],
    entryRankInBucket:               null,
    bucketCapAtEntry:                null,
    bucketActiveCountAtEntry:        null,
    // Gainer exhaustion audit defaults
    topGainerThesisLaneLabel:                null,
    topGainerContinuationAuditLabel:         null,
    topGainerWouldPassExhaustionAudit:       null,
    topGainerAuditFailReasons:               [],
    topGainerExhaustionQualityScore:         null,
    topGainerContinuationDangerScore:        null,
    topGainerNetExhaustionScore:             null,
    topGainerExhaustionAuditScore:           null,
    topGainerPumpStrengthLabel:              null,
    topGainerEntryBatchLabel:                null,
    topGainerPumpPhaseLabel:                 null,
    topGainerMicroExhaustionLabel:           null,
    topGainerContinuationPressureLabel:      null,
    topGainerVwapContextLabel:               null,
    topGainerRsiContextLabel:                null,
    topGainerTrendContextLabel:              null,
    topGainerVolumeFlowContextLabel:         null,
    topGainerStructureContextLabel:          null,
    topGainerBtcContextLabel:                null,
    topGainerQualityWarningLabels:           [],
    hasGainerExhaustionConfirmation:         null,
    hasGainerContinuationDanger:             null,
    hasGainerRedRejection:                   null,
    hasGainerRsiRollover:                    null,
    hasGainerTrendRollover:                  null,
    hasGainerVolumeFade:                     null,
    hasGainerFailedBreakout:                 null,
    hasGainerLowerHigh:                      null,
    hasGainerVwapLoss:                       null,
    // Universal audit defaults
    longThesisLaneLabel:                    null,
    exitProfileLabel:                        null,
    exitDiagnosticLabels:                    [],
    negativeProfitLockExit:                  false,
    profitLockExitBelowFloor:                false,
    simSafeProfilePnl:                       null,
    simSafeProfileReason:                    null,
    simRunnerProfilePnl:                     null,
    simRunnerProfileReason:                  null,
    simFastLockProfilePnl:                   null,
    simFastLockProfileReason:                null,
    bestSimExitProfile:                      null,
    actualVsBestSimDelta:                    null,
    feeDragPct:                              null,
    feeAdjustedFinalPnlPct:                  null,

    // ── Fee telemetry defaults ─────────────────────────────────────────────
    feeMode:                                 null,
    takerFeeRatePct:                         null,
    roundTripFeeNotionalPct:                 null,
    feeDragMarginPct:                        null,
    rawMarginPnlPct:                         null,
    rawNormPnlPct:                           null,
    normPnlPct:                              null,
    feeAdjustedMarginPnlPct:                 null,
    feeAdjustedNormPnlPct:                   null,
    feeAdjustedWin:                          null,
    feeAdjustedLoss:                         null,
    feeStatusLabel:                          null,
    feeDisplayLabel:                         null,
    simSafeProfileMarginPnlPct:              null,
    simSafeProfileNormPnlPct:               null,
    simSafeProfileFeeAdjustedMarginPnlPct:  null,
    simSafeProfileFeeAdjustedNormPnlPct:    null,
    simRunnerProfileMarginPnlPct:            null,
    simRunnerProfileNormPnlPct:             null,
    simRunnerProfileFeeAdjustedMarginPnlPct: null,
    simRunnerProfileFeeAdjustedNormPnlPct:  null,
    simFastLockProfileMarginPnlPct:          null,
    simFastLockProfileNormPnlPct:           null,
    simFastLockProfileFeeAdjustedMarginPnlPct: null,
    simFastLockProfileFeeAdjustedNormPnlPct:   null,
    bestSimExitProfileByFeeAdjustedPnl:      null,
    actualVsBestSimFeeAdjustedDelta:         null,

    // ── Exit profile defaults ─────────────────────────────────────────────
    ...makeExitProfileDefaults(),
    ...LONG_BEST_DNA_DEFAULT_FIELDS,
    ...POST_FEE_10_DEFAULT_FIELDS,

    // ── Lifecycle fields ──────────────────────────────────────────────────
    isFinalOutcome:      false,
    closeReasonCategory: null,
    closeReasonDetail:   null,

    // ── Research snapshot ─────────────────────────────────────────────────
    entryResearchSnapshot: null,
    entryResearchStatus:   null,
  };
}

function getAutoRunCooldownMs(runDurationMs) {
  return [300_000, 900_000].includes(runDurationMs)
    ? AUTO_COOLDOWN_FAST_MS
    : AUTO_COOLDOWN_DEFAULT_MS;
}

// ─── API ──────────────────────────────────────────────────────────────────────
// Checks res.ok and Binance error shapes before parsing, so non-418/429 HTTP
// errors (5xx, 451, HTML pages) and Binance {code,msg} errors show up as
// rejections in allSettled rather than being fulfilled with garbage data.
async function _apiGetWithPriority(url, { priority = RATE_LIMIT_PRIORITY.NORMAL, ...rateLimitOptions } = {}) {
  const res = await apiFetch(url, { priority, ...rateLimitOptions });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${url} ${body.slice(0, 120)}`);
    err.code = 'HTTP_ERROR'; err.status = res.status;
    throw err;
  }
  const json = await res.json();
  if (json && typeof json === 'object' && 'code' in json && 'msg' in json && !Array.isArray(json)) {
    const err = new Error(`BINANCE_ERR ${json.code}: ${json.msg}`);
    err.code = 'BINANCE_ERROR';
    throw err;
  }
  return json;
}
async function apiGetScan(url, timeoutMs = SCAN_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('SCAN_DEADLINE_EXCEEDED'), timeoutMs);
  try {
    return await _apiGetWithPriority(url, {
      priority: RATE_LIMIT_PRIORITY.NORMAL,
      signal: controller.signal,
      purpose: 'FAST_SCAN',
    });
  } finally {
    clearTimeout(timer);
  }
}
const apiGet     = url => _apiGetWithPriority(url, { priority: RATE_LIMIT_PRIORITY.NORMAL });
const apiGetLow  = url => _apiGetWithPriority(url, { priority: RATE_LIMIT_PRIORITY.LOW });
const apiGetHigh = url => _apiGetWithPriority(url, { priority: RATE_LIMIT_PRIORITY.HIGH });
const apiGetCritical = (url, options = {}) => _apiGetWithPriority(url, {
  priority: RATE_LIMIT_PRIORITY.CRITICAL,
  maxWaitMs: 750,
  ...options,
});

// Pooled fan-out: runs fn over items with at most `pool` concurrent in-flight.
// Prevents bursts of 150+ simultaneous waiting++ spikes while still letting
// the rate limiter gate serialise launches normally.
async function mapPooled(items, fn, pool = RL.MAX_CONCURRENT) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (e) {
        results[i] = { status: 'rejected', reason: e };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(pool, items.length) }, () => worker()));
  return results;
}
const getTickers  = ()          => apiGetScan(`${FAPI}/ticker/24hr`);
const getFunding  = ()          => apiGetScan(`${FAPI}/premiumIndex`);
const getKlines   = (sym,i,lim) => apiGet(`${FAPI}/klines?symbol=${sym}&interval=${i}&limit=${lim}`);
const getKlinesWindow = (sym,i,start,end,lim = 5) =>
  apiGet(`${FAPI}/klines?symbol=${sym}&interval=${i}&startTime=${Math.max(0, Math.floor(start))}&endTime=${Math.floor(end)}&limit=${lim}`);
const getDepth    = sym         => apiGet(`${FAPI}/depth?symbol=${sym}&limit=5`);
const getOI       = sym         => apiGet(`${FAPI}/openInterest?symbol=${sym}`);

// HIGH-priority variants — used for reads tied to an open shadow trade lifecycle
// (entry telemetry enrichment). Draws from the 1260→2200 reserved band so live
// trade reads are never crowded out by main-poll or discovery scan traffic.
const getKlinesHigh = (sym,i,lim) => apiGetHigh(`${FAPI}/klines?symbol=${sym}&interval=${i}&limit=${lim}`);
const getDepthHigh  = sym          => apiGetHigh(`${FAPI}/depth?symbol=${sym}&limit=5`);
const getOIHigh     = sym          => apiGetHigh(`${FAPI}/openInterest?symbol=${sym}`);
const getAllPricesCritical = () => apiGetCritical(`${FAPI}/ticker/price`, {
  purpose: 'OPEN_POSITION_PRICE_FALLBACK',
  maxWaitMs: 500,
});

const RSI_ENTRY_INTERVALS = RSI_TELEMETRY_CONFIG.timeframes;
const TREND_ENTRY_INTERVALS = TREND_TELEMETRY_CONFIG.timeframes;
const ADVANCED_MARKET_ENTRY_INTERVALS = ADVANCED_MARKET_TELEMETRY_CONFIG.timeframes;
const ENTRY_SIGNAL_INTERVALS = [...new Set([
  ...RSI_ENTRY_INTERVALS,
  ...TREND_ENTRY_INTERVALS,
  ...ADVANCED_MARKET_ENTRY_INTERVALS,
])];
const getEntrySignalKlineRequests = sym => ENTRY_SIGNAL_INTERVALS.map(interval =>
  getKlines(
    sym,
    interval,
    Math.max(
      RSI_TELEMETRY_CONFIG.candleLimits[interval] ?? 0,
      TREND_TELEMETRY_CONFIG.candleLimits[interval] ?? 0,
      ADVANCED_MARKET_TELEMETRY_CONFIG.candleLimits[interval] ?? 0,
    ),
  )
);
// HIGH-priority version — for entry telemetry enrichment of shadow trades
const getEntrySignalKlineRequestsHigh = sym => ENTRY_SIGNAL_INTERVALS.map(interval =>
  getKlinesHigh(
    sym,
    interval,
    Math.max(
      RSI_TELEMETRY_CONFIG.candleLimits[interval] ?? 0,
      TREND_TELEMETRY_CONFIG.candleLimits[interval] ?? 0,
      ADVANCED_MARKET_TELEMETRY_CONFIG.candleLimits[interval] ?? 0,
    ),
  )
);
const mapSettledKlinesByInterval = (intervals, results) => {
  const out = {};
  intervals.forEach((interval, i) => {
    out[interval] = results[i]?.status === "fulfilled" ? results[i].value : null;
  });
  return out;
};

const extractKlineSignals = klines => {
  if (!klines?.length) return {};
  const buyQ = klines.reduce((s,k) => s + parseFloat(k[10]), 0);
  const totQ = klines.reduce((s,k) => s + parseFloat(k[7]),  0);
  const cvdRatio = totQ > 0 ? parseFloat((buyQ/totQ).toFixed(4)) : 0.5;
  const cvdLabel = cvdRatio > 0.54 ? "BULL" : cvdRatio < 0.46 ? "BEAR" : "NEUT";
  const trs = klines.slice(1).map((k,i) => {
    const h = parseFloat(k[2]), l = parseFloat(k[3]), pc = parseFloat(klines[i][4]);
    return Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
  });
  const atr = trs.length ? trs.reduce((s,t)=>s+t,0)/trs.length : 0;
  const lc  = parseFloat(klines[klines.length-1][4]);
  const atrPct = lc > 0 ? parseFloat((atr/lc*100).toFixed(4)) : null;
  const vLast = klines.slice(-5).reduce((s,k)  => s+parseFloat(k[5]), 0);
  const vPrev = klines.slice(-10,-5).reduce((s,k) => s+parseFloat(k[5]), 0);
  const volAccel = vPrev > 0 ? parseFloat(((vLast/vPrev-1)*100).toFixed(2)) : null;

  // Candle direction signals for live preview scoring
  // klines[-1] = open candle (excluded); klines[-2] = last closed; klines[-3] = prev closed
  const c1 = klines.length >= 2 ? klines[klines.length - 2] : null; // last closed
  const c2 = klines.length >= 3 ? klines[klines.length - 3] : null; // prev closed
  const c1o = c1 ? parseFloat(c1[1]) : null, c1c = c1 ? parseFloat(c1[4]) : null;
  const c1h = c1 ? parseFloat(c1[2]) : null, c1l = c1 ? parseFloat(c1[3]) : null;
  const c2o = c2 ? parseFloat(c2[1]) : null, c2c = c2 ? parseFloat(c2[4]) : null;
  const candleColorAtEntry = c1c == null ? "UNKNOWN"
    : c1c > c1o ? "GREEN" : c1c < c1o ? "RED" : "DOJI";
  const bodyPct = (c1h != null && c1l != null && c1h > c1l)
    ? Math.abs(c1c - c1o) / (c1h - c1l) * 100 : 0;
  const c1Red   = candleColorAtEntry === "RED"   && bodyPct >= 55;
  const c1Green = candleColorAtEntry === "GREEN" && bodyPct >= 55;
  const c2Red   = c2c != null && c2c < c2o;
  const c2Green = c2c != null && c2c > c2o;
  const immediateRedImpulse   = c1Red   && c2Red;
  const immediateGreenImpulse = c1Green && c2Green;
  const redImpulseDetected    = c1Red;
  const greenImpulseDetected  = c1Green;

  // Last-N ticks direction from closed candles (excluding open candle)
  const closed = klines.slice(0, -1);
  const dirOf  = k => parseFloat(k[4]) < parseFloat(k[1]) ? 1 : -1;
  const sum3   = closed.slice(-3).reduce((a,k) => a + dirOf(k), 0);
  const sum5   = closed.slice(-5).reduce((a,k) => a + dirOf(k), 0);
  const sum10  = closed.slice(-10).reduce((a,k) => a + dirOf(k), 0);
  const last3ClosedCandlesDirection = sum3 >= 3 ? "DOWN" : sum3 <= -3 ? "UP" : "MIXED";
  const last5ClosedCandlesDirection = sum5 >= 4 ? "DOWN" : sum5 <= -4 ? "UP" : "MIXED";
  const last10ClosedCandlesDirection = sum10 >= 8 ? "DOWN" : sum10 <= -8 ? "UP" : "MIXED";

  return {
    cvdRatio, cvdLabel, atrPct, volAccel,
    candleColorAtEntry, immediateRedImpulse, immediateGreenImpulse,
    redImpulseDetected, greenImpulseDetected,
    last3ClosedCandlesDirection,
    last5ClosedCandlesDirection,
    last10ClosedCandlesDirection,
    closedCandleDirectionTimeframe: "1m",
    legacyTickDirectionSemantic: "ONE_MINUTE_CANDLE_DIRECTION_ALIAS",
    last3TicksDirection: last3ClosedCandlesDirection,
    last5TicksDirection: last5ClosedCandlesDirection,
    last10TicksDirection: last10ClosedCandlesDirection,
  };
};

// ─── RUN SUMMARY HELPERS ─────────────────────────────────────────────────────
const RUN_SUMMARY_GRID = "64px 104px 102px 58px 58px 64px 82px 74px 74px 74px 70px 70px 72px 72px 74px 74px 72px 64px 126px 94px";
const RUN_SIDE_FILTERS = [
  { id: "all",     label: "ALL",     color: "#888" },
  { id: "losers",  label: "LOSERS",  color: "#ff4455" },
  { id: "gainers", label: "GAINERS", color: "#00cc66" },
];

function sampleLivePnlPct(s) {
  const entry    = numberOrNull(s?.entryPrice);
  const current  = numberOrNull(s?.currentPrice);
  const leverage = numberOrNull(s?.leverage);
  if (!entry || current == null || !leverage) return 0;
  // LONG: price UP = favorable PnL
  return (current - entry) / entry * 100 * leverage;
}

function samplePnlPct(s) {
  const realized = numberOrNull(s?.finalPnlPct);
  return realized ?? sampleLivePnlPct(s);
}

function sampleNormPnlPct(s) {
  const leverage = numberOrNull(s?.leverage);
  if (!leverage) return 0;
  return samplePnlPct(s) / leverage;
}

function sampleBtcEntryPrice(s) {
  return numberOrNull(s?.btcEntryPrice) ?? numberOrNull(s?.btcPrice);
}

function sampleBtcEndPrice(s, fallbackBtcPrice = null) {
  const explicitEnd = numberOrNull(s?.btcExitPrice) ?? numberOrNull(s?.btcCurrentPrice);
  if (explicitEnd != null) return explicitEnd;
  if (!s?.closed) return numberOrNull(fallbackBtcPrice);
  return null;
}

function btcMoveFromPrices(startPrice, endPrice) {
  if (!startPrice || !endPrice) return { known: false, pct: null, direction: "UNKNOWN" };
  const pct = (endPrice - startPrice) / startPrice * 100;
  return {
    known: true,
    pct,
    direction: pct > 0 ? "UP" : pct < 0 ? "DOWN" : "FLAT",
  };
}

function sampleBtcMove(s, fallbackBtcPrice = null) {
  return btcMoveFromPrices(sampleBtcEntryPrice(s), sampleBtcEndPrice(s, fallbackBtcPrice));
}

function runBtcMove(rs, fallbackBtcPrice = null) {
  if (!rs.length) return { known: false, pct: null, direction: "UNKNOWN" };
  const byEntry = [...rs].sort((a,b) => (a.entryTime ?? 0) - (b.entryTime ?? 0));
  const startPrice = byEntry.map(sampleBtcEntryPrice).find(v => v != null);
  const endCandidate = [...rs]
    .map(s => ({
      t: s.closed ? (s.closedAt ?? s.entryTime ?? 0) : Number.MAX_SAFE_INTEGER,
      price: sampleBtcEndPrice(s, fallbackBtcPrice),
    }))
    .filter(x => x.price != null)
    .sort((a,b) => b.t - a.t)[0];
  return btcMoveFromPrices(startPrice, endCandidate?.price ?? null);
}

function pickClosedSampleByPnl(closed, dir = "best") {
  if (!closed.length) return null;
  return closed.reduce((winner, s) => {
    const pnl = samplePnlPct(s);
    const winnerPnl = samplePnlPct(winner);
    return dir === "worst"
      ? (pnl < winnerPnl ? s : winner)
      : (pnl > winnerPnl ? s : winner);
  }, closed[0]);
}

function runOutcomeSymbolLabel(s) {
  if (!s) return "-";
  const sym = String(s.symbol ?? "-").replace("USDT", "");
  const aes = numberOrNull(s.absoluteEntryScore);
  return `${sym} (${aes != null ? Math.round(aes) : "-"})`;
}

function sampleNetPnlPct(s) {
  if (typeof s?.feeAdjustedMarginPnlPct === "number") return s.feeAdjustedMarginPnlPct;
  const gross = samplePnlPct(s);
  const drag  = numberOrNull(s?.tradingFeeMarginPct ?? s?.feeDragPct) ?? 0;
  return gross - drag;
}

function sampleTradingFeePct(s) {
  return numberOrNull(s?.tradingFeeMarginPct ?? s?.feeDragPct) ?? 0;
}

function isRunMetricEligibleSample(sample) {
  if (!sample) return false;
  if (sample.strategyResearchEligible === false) return false;
  if (["INVALID", "FINALIZATION_FAILED"].includes(sample.finalizationDataQuality)) return false;
  if (sample.priceIntegrityStatus === "INVALID") return false;
  return true;
}

function runSummaryMetrics(rs, fallbackBtcPrice = null) {
  const eligible = rs.filter(isRunMetricEligibleSample);
  const excluded = rs.filter(sample => !isRunMetricEligibleSample(sample));
  const closed = eligible.filter(s => s.closed);
  const active = eligible.filter(s => !s.closed);
  const wins = closed.filter(s => samplePnlPct(s) > 0);
  const netWins = closed.filter(s => sampleNetPnlPct(s) > 0);
  const feeFlips = closed.filter(s => samplePnlPct(s) > 0 && sampleNetPnlPct(s) <= 0);
  const realizedPnl = closed.reduce((a,s) => a + samplePnlPct(s), 0);
  const livePnl = active.reduce((a,s) => a + sampleLivePnlPct(s), 0);
  const totalPnl = realizedPnl + livePnl;
  const totalFees = closed.reduce((a,s) => a + sampleTradingFeePct(s), 0);
  const realizedNetPnl = closed.reduce((a,s) => a + sampleNetPnlPct(s), 0);
  const totalNetPnl = realizedNetPnl + livePnl;
  const totalMae = eligible.reduce((a,s) => a + (numberOrNull(s.mae) ?? 0), 0);
  const totalMfe = eligible.reduce((a,s) => a + (numberOrNull(s.mfe) ?? 0), 0);
  const bestSample = pickClosedSampleByPnl(closed, "best");
  const worstSample = pickClosedSampleByPnl(closed, "worst");
  return {
    total: rs.length,
    eligibleTotal: eligible.length,
    excluded: excluded.length,
    closed: closed.length,
    active: active.length,
    wins: wins.length,
    netWins: netWins.length,
    losses: closed.length - wins.length,
    winRate: closed.length ? wins.length / closed.length * 100 : null,
    netWinRate: closed.length ? netWins.length / closed.length * 100 : null,
    feeFlipCount: feeFlips.length,
    realizedPnl,
    livePnl,
    totalPnl,
    totalFees,
    realizedNetPnl,
    totalNetPnl,
    pnlPerTrade: eligible.length ? totalPnl / eligible.length : null,
    avgPnl: closed.length ? realizedPnl / closed.length : null,
    avgNetPnl: closed.length ? realizedNetPnl / closed.length : null,
    avgNormPnl: closed.length ? closed.reduce((a,s) => a + sampleNormPnlPct(s), 0) / closed.length : null,
    totalMae: eligible.length ? totalMae : null,
    totalMfe: eligible.length ? totalMfe : null,
    avgMae: eligible.length ? totalMae / eligible.length : null,
    avgMfe: eligible.length ? totalMfe / eligible.length : null,
    best: bestSample ? samplePnlPct(bestSample) : null,
    worst: worstSample ? samplePnlPct(worstSample) : null,
    bestSample,
    worstSample,
    tpCount: closed.filter(s => [CLOSE_REASON.TAKE_PROFIT, CLOSE_REASON.TRAILING_EXIT, CLOSE_REASON.PROFIT_LOCK].includes(normalizeLongCloseReason(s.closeReason))).length,
    slCount: closed.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.STOP_LOSS).length,
    btcMove: runBtcMove(rs, fallbackBtcPrice),
  };
}

function runDateLabel(rs) {
  if (!rs.length) return "-";
  const firstT = new Date(Math.min(...rs.map(s => s.entryTime ?? Date.now())));
  return firstT.toUTCString().slice(5,16);
}

function sampleRunSide(s) {
  if (s?.longParentBucket === "TOP_GAINER_LONGS" || s?.leaderboardSide === "GAINERS") return "gainers";
  if (s?.longParentBucket === "TOP_LOSER_LONGS"  || s?.leaderboardSide === "LOSERS")  return "losers";
  return "other";
}

function filterSamplesByRunSide(rs, side) {
  if (side === "losers" || side === "gainers") return rs.filter(s => sampleRunSide(s) === side);
  return rs;
}

function runSideCounts(rs) {
  return rs.reduce((acc, s) => {
    const side = sampleRunSide(s);
    acc[side] = (acc[side] ?? 0) + 1;
    acc.total += 1;
    return acc;
  }, { losers: 0, gainers: 0, other: 0, total: 0 });
}

function runCompositionLabel(rs) {
  const c = runSideCounts(rs);
  if (c.losers && c.gainers) return `MIX ${c.losers}L/${c.gainers}G`;
  if (c.losers) return `LOSERS ${c.losers}`;
  if (c.gainers) return `GAINERS ${c.gainers}`;
  return c.total ? `OTHER ${c.other}` : "-";
}

function runCompositionColor(rs) {
  const c = runSideCounts(rs);
  if (c.losers && c.gainers) return "#4488ff";
  if (c.gainers) return "#00cc66";
  if (c.losers) return "#ff4455";
  return "#8899cc";
}

function runSideFilterLabel(side) {
  return RUN_SIDE_FILTERS.find(f => f.id === side)?.label ?? "ALL";
}

function btcMoveLabel(move) {
  if (!move?.known || move.pct == null) return "BTC n/a";
  return `BTC ${move.direction} ${fPct(move.pct)}`;
}

function btcMoveColor(move) {
  if (!move?.known || move.pct == null) return "#8899cc";
  if (move.pct > 0) return "#00ff88";
  if (move.pct < 0) return "#ff4455";
  return "#a8a8c8";
}

const REMOVED_UI_TABS = new Set(["charts", "stats", "research", "aes-discovery"]);
const visibleStoredTab = id => REMOVED_UI_TABS.has(id) ? "losers" : (id || "losers");

function priceFromKlinesAt(klines, ts) {
  if (!Array.isArray(klines) || !klines.length) return null;
  const candles = klines
    .map(k => ({
      openTime: numberOrNull(k[0]),
      closeTime: numberOrNull(k[6]),
      close: numberOrNull(k[4]),
    }))
    .filter(k => k.openTime != null && k.closeTime != null && k.close != null);
  const exact = candles.find(k => k.openTime <= ts && ts <= k.closeTime);
  if (exact) return exact.close;
  const nearest = candles
    .map(k => ({ ...k, dist: Math.min(Math.abs(k.openTime - ts), Math.abs(k.closeTime - ts)) }))
    .sort((a,b) => a.dist - b.dist)[0];
  return nearest?.close ?? null;
}

async function fetchBtcPriceAt(ts) {
  const windowMs = 2 * 60_000;
  const klines = await getKlinesWindow(
    MARKET_CONTEXT_CONFIG.btcSymbol,
    "1m",
    ts - windowMs,
    ts + windowMs,
    5,
  );
  return priceFromKlinesAt(klines, ts);
}

function runTimeBounds(rs) {
  const starts = rs.map(s => numberOrNull(s.entryTime)).filter(v => v != null);
  const ends = rs.filter(s => s.closed).map(s => numberOrNull(s.closedAt)).filter(v => v != null);
  if (!starts.length || !ends.length) return null;
  return { start: Math.min(...starts), end: Math.max(...ends) };
}

function btcRunCacheKey(label, rs) {
  const bounds = runTimeBounds(rs);
  if (!bounds) return null;
  return `${label}:${Math.floor(bounds.start / 60_000)}:${Math.floor(bounds.end / 60_000)}`;
}

function cachedBtcMove(entry) {
  if (!entry?.known) return null;
  return btcMoveFromPrices(entry.startPrice, entry.endPrice);
}

function withCachedBtcMove(metrics, entry) {
  const cached = cachedBtcMove(entry);
  if (!metrics.btcMove.known && cached?.known) return { ...metrics, btcMove: cached };
  return metrics;
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
function AppCore() {

  const [loserTickers,  setLoserTickers]  = useState([]);
  const [gainerTickers, setGainerTickers] = useState([]);
  const [fundingMap, setFundingMap] = useState({});
  const [klinesMap,  setKlinesMap]  = useState({});
  const breadthKlinesRef = useRef({});
  const [samples,    setSamples]    = useState([]);
  const [watchlist,  setWatchlist]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  // 'LOADING' | 'LOADED' | 'LOAD_FAILED'. Only enables writes after a confirmed
  // successful load so a transient IndexedDB read failure doesn't overwrite good data.
  const [storageState, setStorageState] = useState('LOADING');
  const [storageWarn,  setStorageWarn]  = useState(false);  // T7d: write failure flag
  const storageOk = storageState === 'LOADED';
  const [lev,        setLev]        = useState(5);
  const [minVol,     setMinVol]     = useState(10e6);
  const [trailOn,    setTrailOn]    = useState(true);
  const [soundOn,    setSoundOn]    = useState(false);
  const [now,        setNow]        = useState(Date.now());
  const [tab,        setTab]        = useState(() => {
    try { const v = sessionStorage.getItem("longlab:activeTab"); return visibleStoredTab(v); } catch { return "losers"; }
  });
  const { toast } = useToast();
  const setTabAndPersist = useCallback((id) => {
    const nextTab = visibleStoredTab(id);
    try { sessionStorage.setItem("longlab:activeTab", nextTab); } catch {}
    setTab(nextTab);
  }, []);
  const [run,        setRun]        = useState(1);
  const [holdMs,     setHoldMs]     = useState(HOLD_MS);
  const [filterRun,  setFilterRun]  = useState("all");
  const [noteEdit,   setNoteEdit]   = useState(null);
  const [noteText,   setNoteText]   = useState("");
  const [dismissedKillBanners, setDismissedKillBanners] = useState(() => new Set());
  const [closeModal, setCloseModal] = useState(null);
  const [sessionMap, setSessionMap] = useState({});
  const [marketContext, setMarketContext] = useState(null);
  const [marketRegime, setMarketRegime] = useState(null);
  const [sessionHealthState, setSessionHealthState] = useState(null);
  const [btcRunCache, setBtcRunCache] = useState({});
  const [cleanIcOnly, setCleanIcOnly] = useState(false);
  const [rl,          setRl]          = useState({ mode: 'OK', effectiveWeight: 0, committed: 0, measured: 0, limit: 2400, freezeCeiling: 1560, softCeiling: 1000, headroom: 2400, pctOfLimit: 0, windowResetMs: 0, inflight: 0, inflightByPriority: { CRITICAL: 0, HIGH: 0, NORMAL: 0, LOW: 0 }, waiting: 0, byPriority: { CRITICAL: 0, HIGH: 0, NORMAL: 0, LOW: 0 }, isFrozen: false, isBackoff: false, isBanned: false, backoffUntil: 0, banUntil: 0, criticalLaneAvailable: true, tradeLifecyclePolicy: 'WEBSOCKET_INDEPENDENT_CRITICAL_FAIL_FAST', tradesMayFreeze: false, weight: 0, calls: 0, throttling: false });
  const [autoRun,     setAutoRun]     = useState(null);
  const [runTab,      setRunTab]      = useState("all");
  const [runSideFilter, setRunSideFilter] = useState("all");
  const [exportBatchId, setExportBatchId] = useState("");
  const [batchExportState, setBatchExportState] = useState({ phase: "IDLE", percent: 0, error: null });
  const [tickDirectionHealth, setTickDirectionHealth] = useState({
    tickResearchStreamConnected: false,
    tickResearchBookConnected: false,
    tickResearchTradeConnected: false,
    tickResearchSubscribedSymbolCount: 0,
    tickResearchLastMessageAgeMs: null,
  });
  const activePositionSymbolsKey = useMemo(() => [...new Set(
    samples.filter(sample => sample.closed !== true && sample.symbol).map(sample => sample.symbol),
  )].sort().join(","), [samples]);
  // autoRun shape: { id, targetBucket, completedRuns, maxRuns, phase: "starting"|"running"|"cooldown"|"done", phaseStart, baseRun, currentRun, currentCycle, currentEntryIds, runDurationMs, cooldownMs }

  // ── AES Discovery state ──────────────────────────────────────────────────────
  const [aesDiscoveryEvents, setAesDiscoveryEvents] = useState([]);
  const [aesShadowTrades,    setAesShadowTrades]    = useState([]);
  const [discoveryUniverseMeta, setDiscoveryUniverseMeta] = useState({});
  const [discoveryQueueSnapshot,  setDiscoveryQueueSnapshot] = useState({ metrics: {} });
  const [discoveryScannerHealth,  setDiscoveryScannerHealth]  = useState({ enabled: true });
  const [discoveryPerfCounters,   setDiscoveryPerfCounters]   = useState({});

  // Broad-scan 24h ticker snapshots. This is deliberately separate from the
  // genuine bookTicker/aggTrade buffers in tickDirectionCollectorRef.
  const universeTickerSnapshotHistoryRef = useRef({});
  const discoveryQueueRef      = useRef(createQueue(AES_DISCOVERY_CONFIG));
  const discoveryEpisodeRef    = useRef(createEpisodeState());
  const discoveryFullUniverseRef = useRef([]);
  const discoverySideAlternateRef = useRef("GAINERS");
  const discoveryLastDeepScanRef  = useRef(0);

  const priceMapRef       = useRef({});
  const audioRef          = useRef(null);
  const scanBusyRef       = useRef(false);  // T2: prevents scan cycle overlap
  const deepScanBusyRef   = useRef(false);
  const lastDeepScanAtRef = useRef(0);
  const samplesPersistRef = useRef(null);   // T7c: debounce timer for samples writes
  const autoRunRef        = useRef(null);
  const startSetRef = useRef(null);
  const marketContextRef = useRef(null);
  const marketRegimeRef  = useRef(null);
  const sessionHealthRef = useRef(null);
  const sessionStartRef  = useRef(Date.now());
  const oiSnapshotRef = useRef({});
  const liquidationSnapshotRef = useRef({});
  const lifecycleTickHandlersRef = useRef(new Map());
  const lifecycleFallbackBusyRef = useRef(false);
  const lifecyclePendingTicksRef = useRef(new Map());
  const lifecycleFlushTimerRef = useRef(null);
  const tickDirectionCollectorRef = useRef(null);
  const trailOnRef = useRef(trailOn);

  useEffect(() => {
    trailOnRef.current = trailOn;
  }, [trailOn]);

  const getLatestBtcPrice = useCallback((fallback = null) => (
    numberOrNull(priceMapRef.current[MARKET_CONTEXT_CONFIG.btcSymbol]) ??
    numberOrNull(marketContextRef.current?.btc?.price) ??
    numberOrNull(fallback)
  ), []);

  const recordOiSnapshot = useCallback((symbol, oi, price, ts = Date.now()) => {
    if (!symbol || oi == null || price == null) return;

    const oiNumber = Number(oi);
    const priceNumber = Number(price);
    if (!Number.isFinite(oiNumber) || !Number.isFinite(priceNumber)) return;

    const arr = oiSnapshotRef.current[symbol] ?? [];
    arr.push({ ts, oi: oiNumber, price: priceNumber });

    const cutoff = ts - 30 * 60_000;
    oiSnapshotRef.current[symbol] = arr.filter(x => x.ts >= cutoff);
  }, []);

  // ── Research-only safety assertion — runs once on mount ─────────────────────
  useEffect(() => {
    assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG);
  }, []);

  // Isolated pre-entry research collector. It owns no React tick state and has
  // no dependency on the lifecycle stream used for simulated stop/lock safety.
  useEffect(() => {
    const collector = createTickDirectionCollector(TICK_DIRECTION_CONFIG);
    tickDirectionCollectorRef.current = collector;
    collector.start();
    const healthTimer = setInterval(() => {
      setTickDirectionHealth(collector.getHealthSnapshot());
    }, TICK_DIRECTION_CONFIG.uiRefreshMs);
    return () => {
      clearInterval(healthTimer);
      collector.destroy();
      if (tickDirectionCollectorRef.current === collector) tickDirectionCollectorRef.current = null;
    };
  }, []);

  const tickResearchMembershipKey = useMemo(() => {
    const ranked = [
      ...loserTickers.slice(0, TICK_DIRECTION_CONFIG.topSymbolsPerSide).map((ticker, index) => ({
        symbol: ticker.symbol,
        priority: 3_000 - index,
        source: "TOP_LOSER",
      })),
      ...gainerTickers.slice(0, TICK_DIRECTION_CONFIG.topSymbolsPerSide).map((ticker, index) => ({
        symbol: ticker.symbol,
        priority: 2_000 - index,
        source: "TOP_GAINER",
      })),
      ...activePositionSymbolsKey.split(",").filter(Boolean).map((symbol, index) => ({
        symbol,
        priority: 4_000 - index,
        source: "LIFECYCLE_HANDOVER",
      })),
    ];
    const deduped = new Map();
    ranked.forEach(member => {
      const previous = deduped.get(member.symbol);
      if (!previous || member.priority > previous.priority) deduped.set(member.symbol, member);
    });
    return JSON.stringify([...deduped.values()]
      .sort((left, right) => right.priority - left.priority || left.symbol.localeCompare(right.symbol))
      .slice(0, TICK_DIRECTION_CONFIG.maxSymbols));
  }, [loserTickers, gainerTickers, activePositionSymbolsKey]);

  useEffect(() => {
    const collector = tickDirectionCollectorRef.current;
    if (!collector) return;
    try {
      collector.setMembership(JSON.parse(tickResearchMembershipKey));
    } catch {
      collector.setMembership([]);
    }
  }, [tickResearchMembershipKey]);

  // ── Rate limit watcher ───────────────────────────────────────────────────────
  useEffect(() => {
    onRateLimitChange(setRl);
    // Periodic refresh so the badge decays correctly when idle
    const id = setInterval(() => setRl(rlSnapshot()), 1_000);
    return () => { onRateLimitChange(null); clearInterval(id); };
  }, []);

  // ── Persistence ─────────────────────────────────────────────────────────────
  // Only set storageState → LOADED on success; LOAD_FAILED keeps writes disabled
  // so a transient IndexedDB error doesn't overwrite accumulated research data.
  useEffect(() => {
    (async () => {
      try {
        const s = await window.storage.get(STORAGE_KEYS.samples);
        if (s?.value) setSamples(JSON.parse(s.value).map(migrateLongTradeRecord).map(sample => compactLongTradeForRuntime(sanitizeSampleRun(sample, run))));
        const w = await window.storage.get(STORAGE_KEYS.watchlist);
        if (w?.value) setWatchlist(JSON.parse(w.value));
        const r = await window.storage.get(STORAGE_KEYS.run);
        if (r?.value) setRun(parseInt(r.value) || 1);
        const h = await window.storage.get(STORAGE_KEYS.holdMs);
        if (h?.value) setHoldMs(parseInt(h.value) || HOLD_MS);
        // Re-assert after restoring runtime config — verify nothing crept in.
        assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG);
        setStorageState('LOADED');
      } catch(e) {
        console.error('[storage] Load failed — writes disabled to protect existing data:', e);
        setStorageState('LOAD_FAILED');
      }
    })();
  }, []);

  // Samples: debounced 3s — persists on meaningful change (trade close, new sample),
  // not every poll tick. Failures surfaced as a UI warning (T7d).
  useEffect(() => {
    if (!storageOk) return;
    clearTimeout(samplesPersistRef.current);
    samplesPersistRef.current = setTimeout(() => {
      const safeSamples = compactLongTradesForPersistence(samples.map(sample => sanitizeSampleRun(sample, run)));
      window.storage.set(STORAGE_KEYS.samples, JSON.stringify(safeSamples))
        .catch(e => { console.error('[storage] samples write failed:', e); setStorageWarn(true); });
    }, 3_000);
    return () => clearTimeout(samplesPersistRef.current);
  }, [samples, run, storageOk]);
  useEffect(() => {
    if (storageOk) window.storage.set(STORAGE_KEYS.watchlist, JSON.stringify(watchlist))
      .catch(e => { console.error('[storage] watchlist write failed:', e); setStorageWarn(true); });
  }, [watchlist, storageOk]);
  useEffect(() => {
    if (storageOk) window.storage.set(STORAGE_KEYS.run, String(run))
      .catch(e => { console.error('[storage] run write failed:', e); setStorageWarn(true); });
  }, [run, storageOk]);
  useEffect(() => {
    if (storageOk) window.storage.set(STORAGE_KEYS.holdMs, String(holdMs))
      .catch(e => { console.error('[storage] holdMs write failed:', e); setStorageWarn(true); });
  }, [holdMs, storageOk]);

  // ── Sound ────────────────────────────────────────────────────────────────────
  const beep = useCallback((freq = 440) => {
    if (!soundOn) return;
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.18, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(); osc.stop(ctx.currentTime + 0.35);
    } catch(_) {}
  }, [soundOn]);

  // ── Klines helpers (declared before fetchData to avoid TDZ) ─────────────────
  const fetchLosersKlines = useCallback(async losers => {
    const top = losers.slice(0, 15);
    const klineResults      = await mapPooled(top, t => getKlines(t.symbol, "1m", 20));
    const oiResults         = await mapPooled(top, t => getOI(t.symbol));
    const kline5mResults    = await mapPooled(top, t => getKlines(t.symbol, "5m", 2));
    const breadth5mResults  = await mapPooled(top, t => getKlines(t.symbol, "5m", 25));
    const breadth15mResults = await mapPooled(top, t => getKlines(t.symbol, "15m", 25));
    const km  = {};
    const ts = Date.now();

    top.forEach((t,i) => {
      if (klineResults[i].status === "fulfilled") {
        const kl = klineResults[i].value;
        const signals = extractKlineSignals(kl);
        if (kl.length >= 2) {
          const c = kl[kl.length - 2];
          const o = parseFloat(c[1]), cls = parseFloat(c[4]);
          signals.change1m = o > 0 ? parseFloat(((cls - o) / o * 100).toFixed(2)) : null;
        }
        km[t.symbol] = signals;
      }

      if (kline5mResults[i].status === "fulfilled") {
        const kl5 = kline5mResults[i].value;
        if (kl5.length >= 2) {
          const c = kl5[kl5.length - 2];
          const o = parseFloat(c[1]), cls = parseFloat(c[4]);
          (km[t.symbol] = km[t.symbol] || {}).change5m = o > 0 ? parseFloat(((cls - o) / o * 100).toFixed(2)) : null;
        }
      }

      if (oiResults[i].status === "fulfilled") {
        const oiVal = parseFloat(oiResults[i].value.openInterest);
        const price = Number(t.lastPrice ?? priceMapRef.current[t.symbol]);
        recordOiSnapshot(t.symbol, oiVal, price, ts);
      }

      // Collect raw klines for breadth engine
      if (!breadthKlinesRef.current[t.symbol]) breadthKlinesRef.current[t.symbol] = {};
      if (breadth5mResults[i].status === "fulfilled")
        breadthKlinesRef.current[t.symbol]["5m"] = breadth5mResults[i].value;
      if (breadth15mResults[i].status === "fulfilled")
        breadthKlinesRef.current[t.symbol]["15m"] = breadth15mResults[i].value;
    });

    setKlinesMap(prev => ({ ...prev, ...km }));
  }, [recordOiSnapshot]);

  const fetchGainersKlines = useCallback(async gainers => {
    const top = gainers.slice(0, 30);
    const klineResults      = await mapPooled(top, t => getKlines(t.symbol, "1m", 20));
    const oiResults         = await mapPooled(top, t => getOI(t.symbol));
    const kline5mResults    = await mapPooled(top, t => getKlines(t.symbol, "5m", 2));
    const breadth5mResults  = await mapPooled(top, t => getKlines(t.symbol, "5m", 25));
    const breadth15mResults = await mapPooled(top, t => getKlines(t.symbol, "15m", 25));
    const km = {};
    const ts = Date.now();

    top.forEach((t, i) => {
      if (klineResults[i].status === "fulfilled") {
        const kl = klineResults[i].value;
        const signals = extractKlineSignals(kl);
        if (kl.length >= 2) {
          const c = kl[kl.length - 2];
          const o = parseFloat(c[1]), cls = parseFloat(c[4]);
          signals.change1m = o > 0 ? parseFloat(((cls - o) / o * 100).toFixed(2)) : null;
        }
        km[t.symbol] = signals;
      }

      if (kline5mResults[i].status === "fulfilled") {
        const kl5 = kline5mResults[i].value;
        if (kl5.length >= 2) {
          const c = kl5[kl5.length - 2];
          const o = parseFloat(c[1]), cls = parseFloat(c[4]);
          (km[t.symbol] = km[t.symbol] || {}).change5m = o > 0 ? parseFloat(((cls - o) / o * 100).toFixed(2)) : null;
        }
      }

      if (oiResults[i].status === "fulfilled") {
        const oiVal = parseFloat(oiResults[i].value.openInterest);
        const price = Number(t.lastPrice ?? priceMapRef.current[t.symbol]);
        recordOiSnapshot(t.symbol, oiVal, price, ts);
      }

      // Collect raw klines for breadth engine
      if (!breadthKlinesRef.current[t.symbol]) breadthKlinesRef.current[t.symbol] = {};
      if (breadth5mResults[i].status === "fulfilled")
        breadthKlinesRef.current[t.symbol]["5m"] = breadth5mResults[i].value;
      if (breadth15mResults[i].status === "fulfilled")
        breadthKlinesRef.current[t.symbol]["15m"] = breadth15mResults[i].value;
    });

    setKlinesMap(prev => ({ ...prev, ...km }));
  }, [recordOiSnapshot]);

  // Deep kline/OI enrichment is intentionally decoupled from the 15s universe
  // refresh. It can take tens of seconds under rate limiting, but it must never
  // delay ticker refresh, lifecycle state, or render responsiveness.
  const scheduleDeepTelemetryScan = useCallback((fullUniverse) => {
    const startedAt = Date.now();
    if (deepScanBusyRef.current) return false;
    if (startedAt - lastDeepScanAtRef.current < DEEP_TELEMETRY_SCAN_MS) return false;
    deepScanBusyRef.current = true;
    lastDeepScanAtRef.current = startedAt;
    const perfStart = performance.now();

    Promise.allSettled([
      fetchLosersKlines(fullUniverse?.losersTop30 ?? []),
      fetchGainersKlines(fullUniverse?.gainersTop30 ?? []),
    ]).finally(() => {
      deepScanBusyRef.current = false;
      const elapsed = performance.now() - perfStart;
      if (elapsed > DEEP_TELEMETRY_SCAN_MS) {
        console.warn(`[deep-telemetry] slow cycle ${Math.round(elapsed)}ms; fast scan remained independent`);
      }
    });
    return true;
  }, [fetchLosersKlines, fetchGainersKlines]);

  // ── Main data fetch ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [tickData, fundData] = await Promise.all([getTickers(), getFunding()]);
      if (!Array.isArray(tickData)) throw new Error(tickData?.msg || "ticker API returned non-array");
      if (!Array.isArray(fundData)) throw new Error(fundData?.msg || "funding API returned non-array");
      const fm = {}, pm = {};
      fundData.forEach(f => { if (f.symbol) fm[f.symbol] = parseFloat(f.lastFundingRate) * 100; });
      tickData.forEach(t => { pm[t.symbol] = parseFloat(t.lastPrice); });
      setFundingMap(fm);
      priceMapRef.current = pm;
      const btcCurrentPrice = getLatestBtcPrice(pm[MARKET_CONTEXT_CONFIG.btcSymbol]);

      const fullUniverse = buildFullLongUniverse({ tickers: tickData, minQuoteVolume: minVol });
      setLoserTickers(fullUniverse.losersTop30);
      setGainerTickers(fullUniverse.gainersTop30);
      // Discovery: update rolling tick history and full universe ref
      discoveryFullUniverseRef.current = fullUniverse.allEligible;
      updateTickHistory(universeTickerSnapshotHistoryRef.current, fullUniverse.allEligible, AES_DISCOVERY_CONFIG, Date.now());
      setDiscoveryUniverseMeta(fullUniverse.universeMeta);
      // Update active shadow trades with current price/rank (broad scan)
      setAesShadowTrades(prev => {
        const symbolMap = {};
        for (const t of fullUniverse.allEligible) symbolMap[t.symbol] = t;
        return prev.map(t => {
          if (t.closed) return t;
          const ticker = symbolMap[t.symbol];
          const updated = updateShadowTradeBroadScan(t, ticker ?? null, Date.now());
          return evaluateShadowExit(updated, AES_DISCOVERY_CONFIG, Date.now());
        });
      });

      setSamples(prev => prev.map(s => {
        if (s.closed) return s;
        const cp      = pm[s.symbol] ?? s.currentPrice;
        // LONG math: price UP = favorable
        const priceUp = (cp - s.entryPrice) / s.entryPrice * 100;
        const priceDn = (s.entryPrice - cp) / s.entryPrice * 100;
        const mfe     = Math.max(s.mfe || 0, priceUp); // MFE: upside for long
        const mae     = Math.max(s.mae || 0, priceDn); // MAE: downside against long
        const ts      = Date.now();

        // LONG trail: activates when price rises; follows highest price (trailPeak = trailHigh)
        let trailPeak = s.trailPeak, trailActive = s.trailActive;
        if (trailOn && priceUp >= TP_PCT) {
          trailActive = true;
          if (trailPeak === null || cp > trailPeak) trailPeak = cp;
        }
        const hist = [...(s.priceHistory || []), { t: ts, p: cp }].slice(-120);

        // Stale detection
        const heldMs          = ts - s.entryTime;
        const pricesUniq      = new Set((s.priceHistory || []).map(p => p.p)).size;
        const isStale         = heldMs > 300_000 && mfe === 0 && mae === 0;
        const isInvalidMarket = s.atrPct === 0 || (s.atrPct != null && s.spreadPct == null && heldMs > 60_000);
        const staleReason     = isStale ? (pricesUniq <= 2 ? "LOW_UNIQUE_PRICE_COUNT" : "NO_PRICE_MOVEMENT") : null;

        // ── 1. Build live context (using previous lock/profile state) ──────
        const liveCtx = buildLiveExitContext(s, cp, ts);

        // ── 2. Resolve dynamic exit profile ───────────────────────────────
        const profileUpdate = resolveDynamicExitProfile(s, liveCtx);
        const profileChanged = profileUpdate.exitProfileSelected !== s.exitProfileSelected;
        const profileHistoryUpdate = profileChanged
          ? {
              exitProfileChangedAt: ts,
              exitProfileHistory: [
                ...(s.exitProfileHistory ?? []),
                { ts, from: s.exitProfileSelected, to: profileUpdate.exitProfileSelected, reason: profileUpdate.exitProfileReason },
              ],
            }
          : {};

        // ── 3. Apply profile to create updated sample for lock rules ───────
        const sampleWithProfile = { ...s, ...profileUpdate, ...profileHistoryUpdate, mae, mfe };

        // ── 4. Compute profit lock with dynamic profile rules ──────────────
        const lockUpdate = getLongProfitLockUpdate(sampleWithProfile, cp, ts, sampleWithProfile.feeSnapshot ?? DEFAULT_FEE_CONFIG);
        const protectionUpdate = synchronizeSimulatedProfitLockProtection(sampleWithProfile, lockUpdate, ts);
        const sampleWithProtection = { ...sampleWithProfile, ...lockUpdate, ...protectionUpdate };
        const protectionBreach = evaluateLongProfitLockBreach({
          trade: sampleWithProtection,
          currentPrice: cp,
          observedAt: ts,
          source: "REST_POLL",
        });
        const profitLockCrossTelemetry = detectLongProfitLockFloorCross({
          previousPrice: s.currentPrice ?? s.profitLockLastObservedPrice ?? null,
          currentPrice: cp,
          floorPrice: protectionUpdate.profitLockProtectedFloorPrice ?? lockUpdate.profitLockLevelPrice,
          lockActive: sampleWithProtection.profitLockStrategyActive === true,
          observedAt: ts,
          floorCrossedAt: protectionBreach.profitLockFloorCrossedAt,
        });
        const profitLockRecommendation = recommendProfitLockActionLogOnly({
          ...sampleWithProtection,
          currentMarginPnlPct: priceUp * s.leverage,
        });

        const sampleBtcPrice = btcCurrentPrice ?? s.btcCurrentPrice ?? s.btcPrice ?? null;
        const closeBaseRaw = {
          currentPrice: cp, mae, mfe, priceHistory: hist,
          lastPriceTimestamp: ts,
          lastPriceUpdateAt: ts,
          lastPriceSource: "REST_POLL",
          btcCurrentPrice: sampleBtcPrice,
          isStale, isInvalidMarket, staleReason,
          ...lockUpdate,
          ...protectionUpdate,
          ...protectionBreach,
          ...profitLockCrossTelemetry,
          ...profitLockRecommendation,
          profitLockLastObservedPrice: cp,
          ...profileUpdate,
          ...profileHistoryUpdate,
        };
        const liveConfirmation = evaluatePostFee10LiveConfirmation(
          { ...sampleWithProfile, ...closeBaseRaw },
          ts,
        );
        const runnerCapture = computeLongRunnerCaptureAudit({
          ...sampleWithProfile,
          ...closeBaseRaw,
          evaluatedAtMs: ts,
          timeSinceEntryMs: heldMs,
          currentNormPnlPct: priceUp, // LONG: PnL favorable = price up
          normalizedMfePct: mfe,
          normalizedMaePct: mae,
          profitLockActive: sampleWithProtection.profitLockStrategyActive,
          currentLockFloorNormPct:
            (protectionUpdate.profitLockProtectedFloorMarginPct ?? lockUpdate.profitLockLevelMarginPct) != null && s.leverage
              ? (protectionUpdate.profitLockProtectedFloorMarginPct ?? lockUpdate.profitLockLevelMarginPct) / s.leverage
              : null,
          trailingActive: trailActive,
        });
        const priorRunnerPeak = numberOrNull(s.runnerScorePeak) ?? -Infinity;
        const currentRunnerScore =
          numberOrNull(runnerCapture.longRunnerCaptureScore) ??
          numberOrNull(runnerCapture.runnerCapturePotentialScore);
        const runnerPeak =
          currentRunnerScore != null && currentRunnerScore > priorRunnerPeak
            ? currentRunnerScore
            : (Number.isFinite(priorRunnerPeak) ? priorRunnerPeak : null);
        const runnerPeakAt =
          currentRunnerScore != null && currentRunnerScore > priorRunnerPeak
            ? ts
            : (s.runnerScorePeakAt ?? null);
        const closeBase = {
          ...closeBaseRaw,
          ...liveConfirmation,
          ...runnerCapture,
          runnerScorePeak: runnerPeak,
          runnerScorePeakAt: runnerPeakAt,
        };

        // ── 5. Exit checks (priority: TP > PROFIT_LOCK/FLOOR > TRAIL > SL > TIMEOUT) ──

        // ─── TP (first — best outcome) ────────────────────────────────────
        // LONG TP: price rises >= TP_PCT; use observed fill price, not theoretical max
        if (!trailOn && priceUp >= TP_PCT) {
          beep(880);
          const finalPnlPct = parseFloat(((cp - s.entryPrice) / s.entryPrice * 100 * s.leverage).toFixed(2));
          const merged = { ...sampleWithProfile, ...closeBase, trailPeak, trailActive };
          return finalizeClosedSample(merged, "TP", finalPnlPct, { closedAt: ts, btcExitPrice: sampleBtcPrice, finalPriceTimestamp: ts, finalPriceSource: "REST_POLL", closeTriggerSource: "TAKE_PROFIT", closeExecutionMechanism: CLOSE_EXECUTION_MECHANISM.REST_POLL });
        }

        // ─── PROFIT LOCK (before TRAIL/SL — floor protects locked profit) ─
        // LONG lock: lock price is ABOVE entry; exit when price falls back to lockPrice
        const lockPrice = protectionUpdate.profitLockProtectedFloorPrice ?? lockUpdate.profitLockLevelPrice;
        if (protectionBreach.shouldCloseImmediately) {
          beep(440);
          // LONG: actual fill PnL from observed price — do NOT clamp to floor (floor ≠ fill)
          const computedFinalPnlPct = parseFloat(((cp - s.entryPrice) / s.entryPrice * 100 * s.leverage).toFixed(2));
          const lockFloor = protectionUpdate.profitLockProtectedFloorMarginPct ?? lockUpdate.profitLockLevelMarginPct ?? s.profitLockLevelMarginPct ?? null;
          const finalPnlPct = computedFinalPnlPct;
          const lockFloorMissed = lockFloor != null && computedFinalPnlPct < lockFloor;
          const lockFloorMissMarginPct = lockFloorMissed
            ? parseFloat((lockFloor - computedFinalPnlPct).toFixed(4))
            : null;
          const lockFloorTriggerPrice = lockPrice;
          const observedExitPrice     = cp;
          const fillTelemetry = buildProfitLockFillTelemetry({
            entryPrice: s.entryPrice,
            leverage: s.leverage,
            floorPrice: lockPrice,
            floorMarginPct: lockFloor,
            observedFillPrice: cp,
            enforcementAttempted: true,
          });
          const exitEvent = {
            ts, symbol: s.symbol, leverage: s.leverage,
            stage: lockUpdate.profitLockStage, price: cp,
            priceFavorPct: parseFloat(((cp - s.entryPrice) / s.entryPrice * 100).toFixed(4)),
            marginPnlPct: finalPnlPct, lockMarginPct: lockUpdate.profitLockLevelMarginPct,
            lockPrice, reason: "PROFIT_LOCK_EXIT",
          };
          const merged = {
            ...sampleWithProfile, ...closeBase, ...lockUpdate,
            profitLockEvents: [...(lockUpdate.profitLockEvents ?? []), exitEvent],
            ...profitLockCrossTelemetry,
            ...profitLockRecommendation,
            ...fillTelemetry,
            ...protectionBreach,
            profitLockProtectionState: PROFIT_LOCK_PROTECTION_STATE.FILLED,
            profitLockFloorPreserved: fillTelemetry.profitLockFloorEnforcementSucceeded === true,
            profitLockEmergencyFallbackUsed: protectionBreach.profitLockFloorBreachedInLoss === true,
            profitLockEnforcementFailed: fillTelemetry.profitLockFloorEnforcementSucceeded !== true,
            lockFloorMissed: fillTelemetry.profitLockFloorMissed ?? lockFloorMissed,
            lockFloorMissMarginPct,
            lockFloorTriggerPrice,
            observedExitPrice,
            wouldHaveExitedBelowFloor: fillTelemetry.profitLockFloorMissed ?? lockFloorMissed,
            activeLockFloorMarginPct: lockFloor,
            activeLockFloorPrice: lockPrice,
          };
          return finalizeClosedSample(merged, "PROFIT_LOCK", finalPnlPct, {
            closedAt: ts,
            btcExitPrice: sampleBtcPrice,
            finalPriceTimestamp: ts,
            finalPriceSource: "REST_POLL",
            closeTriggerSource: "PROFIT_LOCK_FLOOR_BREACH",
            closeExecutionMechanism: CLOSE_EXECUTION_MECHANISM.REST_POLL,
          });
        }

        // ─── TRAIL ────────────────────────────────────────────────────────
        // LONG trail: trailPeak = highest price; exit when price drops below trailPeak * (1 - TRAIL_PCT%)
        if (trailActive && trailPeak !== null && cp < trailPeak * (1 - TRAIL_PCT / 100)) {
          beep(660);
          const finalPnlPct = parseFloat(((cp - s.entryPrice) / s.entryPrice * 100 * s.leverage).toFixed(2));
          const merged = { ...sampleWithProfile, ...closeBase, trailPeak, trailActive };
          return finalizeClosedSample(merged, "TRAIL", finalPnlPct, { closedAt: ts, btcExitPrice: sampleBtcPrice, finalPriceTimestamp: ts, finalPriceSource: "REST_POLL", closeTriggerSource: "TRAILING_STOP", closeExecutionMechanism: CLOSE_EXECUTION_MECHANISM.REST_POLL });
        }

        // ─── SL ───────────────────────────────────────────────────────────
        // LONG SL: price drops priceDn >= SL_PCT (price fell below entry); use observed fill
        if (priceDn >= SL_PCT) {
          beep(200);
          const finalPnlPct = parseFloat(((cp - s.entryPrice) / s.entryPrice * 100 * s.leverage).toFixed(2));
          const merged = { ...sampleWithProfile, ...closeBase, trailPeak, trailActive };
          return finalizeClosedSample(merged, "SL", finalPnlPct, { closedAt: ts, btcExitPrice: sampleBtcPrice, finalPriceTimestamp: ts, finalPriceSource: "REST_POLL", closeTriggerSource: "STOP_LOSS", closeExecutionMechanism: CLOSE_EXECUTION_MECHANISM.REST_POLL });
        }

        // ─── TIMEOUT ──────────────────────────────────────────────────────
        if (heldMs >= (s.holdMs ?? HOLD_MS)) {
          const finalPnlPct = parseFloat(((cp - s.entryPrice) / s.entryPrice * 100 * s.leverage).toFixed(2));
          const merged = { ...sampleWithProfile, ...closeBase, trailPeak, trailActive };
          return finalizeClosedSample(merged, "TIMEOUT", finalPnlPct, { closedAt: ts, btcExitPrice: sampleBtcPrice, finalPriceTimestamp: ts, finalPriceSource: "REST_POLL", closeTriggerSource: "HOLD_TIMEOUT", closeExecutionMechanism: CLOSE_EXECUTION_MECHANISM.REST_POLL });
        }

        const liveExitAudit = evaluateLiveExitAudit({ ...sampleWithProfile, ...closeBase });
        return { ...sampleWithProfile, ...closeBase, trailPeak, trailActive, ...liveExitAudit };
      }));

      setWatchlist(prev => prev.map(w => ({
        ...w,
        currentPrice: pm[w.symbol] ?? w.currentPrice,
        funding:      fm[w.symbol] ?? w.funding,
      })));

      // Kline/OI enrichment is background work. The fast scanner only owns the
      // ticker/funding refresh and never waits for hundreds of deep telemetry calls.
      scheduleDeepTelemetryScan(fullUniverse);

      setError(null);
    } catch(e) {
      const aborted = e?.name === 'AbortError' || String(e?.message ?? '').includes('SCAN_DEADLINE_EXCEEDED');
      if (aborted) {
        console.warn(`[scan-fast] request deadline ${SCAN_REQUEST_TIMEOUT_MS}ms reached; retaining the last complete universe snapshot`);
      } else {
        setError("Binance API error — " + (e.message || "check connection"));
      }
    } finally {
      setLoading(false);
    }
  }, [minVol, trailOn, beep, getLatestBtcPrice, scheduleDeepTelemetryScan]);

  const fetchBtcMarketContext = useCallback(async () => {
    try {
      const intervals = ["5m", "15m", "30m", "1h", "2h", "4h"];

      const results = await Promise.allSettled(
        intervals.map(interval =>
          getKlines(
            MARKET_CONTEXT_CONFIG.btcSymbol,
            interval,
            MARKET_CONTEXT_CONFIG.candleLimits[interval],
          )
        )
      );

      const btcKlinesByInterval = {};
      intervals.forEach((interval, i) => {
        btcKlinesByInterval[interval] =
          results[i].status === "fulfilled" ? results[i].value : null;
      });

      const ctx = computeMarketContext({
        btcKlinesByInterval,
        source: "binance-futures",
        computedAt: Date.now(),
      });

      marketContextRef.current = ctx;
      setMarketContext(ctx);

      return ctx;
    } catch (err) {
      console.error("BTC market context fetch failed", err);

      const fallback = {
        version: "market-context-v1",
        computedAt: Date.now(),
        source: "binance-futures",
        stale: true,
        staleReason: "BTC_CONTEXT_FETCH_FAILED",
        btc: null,
      };

      marketContextRef.current = fallback;
      setMarketContext(fallback);

      return fallback;
    }
  }, []);

  const fetchMarketRegime = useCallback(async () => {
    try {
      const regime = await fetchMarketRegimeContext({
        getKlines,
        klinesMap: breadthKlinesRef.current,
      });
      marketRegimeRef.current = regime;
      setMarketRegime(regime);
      return regime;
    } catch (err) {
      console.error("Market regime fetch failed", err);
      const last = getLastValidSnapshot();
      if (last) {
        marketRegimeRef.current = last;
        setMarketRegime(last);
      }
      return last;
    }
  }, []);

  const refreshSessionHealth = useCallback((currentSamples) => {
    try {
      const sh = computeSessionHealth(
        currentSamples ?? [],
        Date.now(),
        sessionHealthRef.current,
        sessionStartRef.current,
      );
      sessionHealthRef.current = sh;
      setSessionHealthState(sh);
      return sh;
    } catch (_) {
      return sessionHealthRef.current;
    }
  }, []);

  // Single self-scheduling scan loop — replaces 3 independent interval/effect fetchers.
  // scanBusyRef prevents overlap: the next tick only schedules AFTER the cycle completes,
  // so a slow cycle (>POLL_MS) cannot fire the next while still running.
  // Klines are now embedded in fetchData (called above) so everything is one coordinated cycle.
  useEffect(() => {
    let stop = false, timer, firstRun = true;
    const loop = async () => {
      if (stop) return;
      if (!scanBusyRef.current) {
        scanBusyRef.current = true;
        const t0 = performance.now();
        try { await fetchData(!firstRun); }
        catch (e) { setError("Binance API error — " + (e.message || "check connection")); }
        finally {
          firstRun = false;
          scanBusyRef.current = false;
          const elapsed = performance.now() - t0;
          if (elapsed > POLL_MS) console.warn(`[scan-fast] overrun ${Math.round(elapsed)}ms > ${POLL_MS}ms`);
        }
      }
      timer = setTimeout(loop, POLL_MS);
    };
    loop();
    return () => { stop = true; clearTimeout(timer); };
  }, [fetchData]);

  // Open-position lifecycle ticks are buffered and applied in one state update.
  // Routed bookTicker + aggTrade streams can be very active; without batching,
  // every market event maps the full trade array and can starve the browser UI.
  const flushLifecycleTicks = useCallback(() => {
    lifecycleFlushTimerRef.current = null;
    if (!lifecyclePendingTicksRef.current.size) return;
    const pending = new Map(lifecyclePendingTicksRef.current);
    lifecyclePendingTicksRef.current.clear();

    setSamples(prev => prev.map(sample => {
      if (sample.closed === true) return sample;
      const tick = pending.get(sample.symbol);
      if (!tick) return sample;

      const tickValidation = validateLongLifecyclePriceTick(tick);
      if (!tickValidation.valid) return sample;
      const price = tickValidation.price;
      const observedAt = Number.isFinite(Number(tick?.receivedAt)) ? Number(tick.receivedAt) : Date.now();
      const priceTimestamp = Number.isFinite(Number(tick?.t)) ? Number(tick.t) : observedAt;
      const priceMeta = parsePriceSourcePrecision(tick);
      const isRestFallback = String(priceMeta.source).startsWith("REST_CRITICAL_FALLBACK");
      const entryPrice = Number(sample.entryPrice);
      if (!Number.isFinite(entryPrice) || entryPrice <= 0) return sample;

      const priceUp = ((price - entryPrice) / entryPrice) * 100;
      const priceDn = ((entryPrice - price) / entryPrice) * 100;
      const mfe = Math.max(Number(sample.mfe ?? 0), priceUp);
      const mae = Math.max(Number(sample.mae ?? 0), priceDn);
      let trailPeak = sample.trailPeak;
      let trailActive = sample.trailActive === true;
      if (trailOnRef.current && priceUp >= TP_PCT) {
        trailActive = true;
        if (trailPeak == null || price > Number(trailPeak)) trailPeak = price;
      }

      const profileUpdate = resolveDynamicExitProfile(
        sample,
        buildLiveExitContext(sample, price, observedAt),
      );
      const profileChanged = profileUpdate.exitProfileSelected !== sample.exitProfileSelected;
      const profileHistoryUpdate = profileChanged ? {
        exitProfileChangedAt: observedAt,
        exitProfileHistory: [
          ...(sample.exitProfileHistory ?? []),
          { ts: observedAt, from: sample.exitProfileSelected, to: profileUpdate.exitProfileSelected, reason: profileUpdate.exitProfileReason },
        ],
      } : {};
      const withProfile = { ...sample, ...profileUpdate, ...profileHistoryUpdate, mfe, mae, trailPeak, trailActive };
      const lockUpdate = getLongProfitLockUpdate(withProfile, price, observedAt, withProfile.feeSnapshot ?? DEFAULT_FEE_CONFIG);
      const protectionUpdate = synchronizeSimulatedProfitLockProtection(withProfile, lockUpdate, observedAt);
      const updated = {
        ...withProfile,
        ...lockUpdate,
        ...protectionUpdate,
        currentPrice: price,
        priceHistory: [...(sample.priceHistory ?? []), { t: priceTimestamp, p: price, source: priceMeta.source }].slice(-120),
        lastPriceTimestamp: priceTimestamp,
        lastPriceUpdateAt: observedAt,
        lastPriceSource: priceMeta.source,
        lastPricePrecision: priceMeta.precision,
        priceStreamSchemaVersion: tick?.priceStreamSchemaVersion ?? (isRestFallback ? "REST_ALL_PRICES_V2_PER_SYMBOL_STALE" : null),
        priceTickSchemaValidated: tick?.schemaValidated === true || isRestFallback,
        priceIntegrityStatus: "VALID",
        positionLifecycleEngine: "INDEPENDENT_ROUTED_WEBSOCKET_V2",
        positionLifecycleLastHeartbeatAt: observedAt,
        positionLifecycleRateLimiterIndependent: true,
        marketPriceStreamHealthy: !isRestFallback,
        positionLifecycleRestFallbackStatus: isRestFallback ? "USED_PER_SYMBOL_STALE" : "NOT_NEEDED",
        positionLifecycleSymbolTickAgeMs: Number.isFinite(Number(tick?.staleAgeMs)) ? Number(tick.staleAgeMs) : 0,
        positionLifecycleLastWebsocketAt: isRestFallback ? (sample.positionLifecycleLastWebsocketAt ?? null) : observedAt,
        positionLifecycleLastRestFallbackAt: isRestFallback ? observedAt : (sample.positionLifecycleLastRestFallbackAt ?? null),
        positionLifecycleFallbackReason: isRestFallback ? (tick?.fallbackReason ?? "PER_SYMBOL_STALE") : null,
      };
      const tickOutcomeUpdate = updateTickDirectionOutcomeAudit({
        trade: updated,
        currentPrice: price,
        observedAt,
        source: priceMeta.source,
      });
      const audited = { ...updated, ...tickOutcomeUpdate };
      const decision = evaluateLongImmediateExit({
        trade: audited,
        currentPrice: price,
        now: observedAt,
        source: priceMeta.source,
        trailingEnabled: trailOnRef.current,
        takeProfitPricePct: TP_PCT,
        stopLossPricePct: SL_PCT,
        trailingDistancePricePct: TRAIL_PCT,
        defaultHoldMs: HOLD_MS,
      });
      if (!decision.shouldClose) return { ...audited, ...decision.lockBreach };

      const finalPnlPct = Number(decision.marginPnlPct.toFixed(4));
      let exitFields = { ...decision.lockBreach };
      if (decision.reason === CLOSE_REASON.PROFIT_LOCK) {
        const floorPrice = updated.profitLockProtectedFloorPrice ?? updated.profitLockLevelPrice;
        const floorMargin = updated.profitLockProtectedFloorMarginPct ?? updated.profitLockLevelMarginPct;
        const fillTelemetry = buildProfitLockFillTelemetry({
          entryPrice,
          leverage: updated.leverage,
          floorPrice,
          floorMarginPct: floorMargin,
          observedFillPrice: price,
          enforcementAttempted: true,
        });
        exitFields = {
          ...exitFields,
          ...fillTelemetry,
          profitLockProtectionState: PROFIT_LOCK_PROTECTION_STATE.FILLED,
          profitLockFillReceived: true,
          profitLockFullyFilledAt: observedAt,
          profitLockFloorPreserved: fillTelemetry.profitLockFloorEnforcementSucceeded === true,
          profitLockFloorMissed: fillTelemetry.profitLockFloorMissed === true,
          profitLockEmergencyFallbackUsed: decision.emergencyBecauseAlreadyBelowFloor === true,
          profitLockEnforcementFailed: fillTelemetry.profitLockFloorEnforcementSucceeded !== true,
          profitLockPnlAtEmergencyCloseRequest: finalPnlPct,
          closeTriggerSource: "PROFIT_LOCK_FLOOR_BREACH",
        };
      }

      const triggerSource = decision.reason === CLOSE_REASON.TAKE_PROFIT ? "TAKE_PROFIT"
        : decision.reason === CLOSE_REASON.TRAILING_EXIT ? "TRAILING_STOP"
          : decision.reason === CLOSE_REASON.STOP_LOSS ? "STOP_LOSS"
            : decision.reason === CLOSE_REASON.TIMEOUT ? "HOLD_TIMEOUT"
              : "PROFIT_LOCK_FLOOR_BREACH";
      return finalizeClosedSample(
        {
          ...audited,
          ...exitFields,
          ...censorUnfilledTickDirectionOutcomes({ ...audited, ...exitFields }),
        },
        decision.reason,
        finalPnlPct,
        {
          closedAt: observedAt,
          exitPrice: price,
          finalPriceTimestamp: priceTimestamp,
          finalPriceSource: priceMeta.source,
          closeTriggerSource: triggerSource,
          closeExecutionMechanism: isRestFallback
            ? CLOSE_EXECUTION_MECHANISM.LOCAL_REST_FALLBACK
            : CLOSE_EXECUTION_MECHANISM.LOCAL_WEBSOCKET_WATCH,
        },
      );
    }));
  }, []);

  const queueLifecycleTick = useCallback((tick) => {
    const validation = validateLongLifecyclePriceTick(tick);
    const symbol = String(tick?.symbol ?? '').toUpperCase();
    if (!symbol || !validation.valid) return false;
    const receivedAt = Number.isFinite(Number(tick?.receivedAt)) ? Number(tick.receivedAt) : Date.now();
    const next = { ...tick, symbol, receivedAt };
    const previous = lifecyclePendingTicksRef.current.get(symbol);
    const previousAt = Number(previous?.receivedAt ?? previous?.t ?? 0);
    const nextAt = Number(next.receivedAt ?? next.t ?? 0);
    const previousPriority = LIFECYCLE_PRICE_SOURCE_PRIORITY[String(previous?.source ?? '')] ?? 0;
    const nextPriority = LIFECYCLE_PRICE_SOURCE_PRIORITY[String(next?.source ?? '')] ?? 0;
    if (!previous || nextAt > previousAt || (nextAt === previousAt && nextPriority >= previousPriority)) {
      lifecyclePendingTicksRef.current.set(symbol, next);
    }
    if (lifecycleFlushTimerRef.current == null) {
      lifecycleFlushTimerRef.current = setTimeout(flushLifecycleTicks, LIFECYCLE_TICK_FLUSH_MS);
    }
    return true;
  }, [flushLifecycleTicks]);

  // Incremental subscription management. A trade closing no longer tears down
  // and rebuilds every active symbol stream. The underlying stream also retains
  // inactive membership until the final position closes, preventing reconnect
  // storms during clustered exits.
  useEffect(() => {
    const desired = new Set(activePositionSymbolsKey ? activePositionSymbolsKey.split(",").filter(Boolean) : []);
    const stream = getSharedPriceStream();

    for (const [symbol, callback] of lifecycleTickHandlersRef.current.entries()) {
      if (!desired.has(symbol)) {
        stream.unsubscribe(symbol, callback);
        lifecycleTickHandlersRef.current.delete(symbol);
      }
    }
    for (const symbol of desired) {
      if (lifecycleTickHandlersRef.current.has(symbol)) continue;
      const callback = tick => queueLifecycleTick({ ...tick, symbol: tick?.symbol ?? symbol });
      lifecycleTickHandlersRef.current.set(symbol, callback);
      stream.subscribe(symbol, callback);
    }
  }, [activePositionSymbolsKey, queueLifecycleTick]);

  useEffect(() => () => {
    const stream = getSharedPriceStream();
    for (const [symbol, callback] of lifecycleTickHandlersRef.current.entries()) {
      stream.unsubscribe(symbol, callback);
    }
    lifecycleTickHandlersRef.current.clear();
    lifecyclePendingTicksRef.current.clear();
    if (lifecycleFlushTimerRef.current != null) clearTimeout(lifecycleFlushTimerRef.current);
    lifecycleFlushTimerRef.current = null;
  }, []);

  // Per-symbol stale watchdog. Global socket activity is not enough: one busy
  // symbol can keep the connection "healthy" while another position receives no
  // ticks. When an individual symbol is stale, one CRITICAL all-price REST call
  // refreshes only the stale positions. The call fails fast and never parks the
  // lifecycle behind discovery traffic.
  useEffect(() => {
    const symbols = activePositionSymbolsKey ? activePositionSymbolsKey.split(",").filter(Boolean) : [];
    if (!symbols.length) return undefined;
    let stopped = false;

    const refreshStaleSymbols = async () => {
      if (stopped || lifecycleFallbackBusyRef.current) return;
      const stream = getSharedPriceStream();
      const checkedAt = Date.now();
      const staleSymbols = collectStaleLifecycleSymbols(
        symbols,
        symbol => stream.getSymbolHealthSnapshot(symbol, checkedAt),
        LIFECYCLE_SYMBOL_STALE_MS,
      );
      if (!staleSymbols.length) return;

      lifecycleFallbackBusyRef.current = true;
      try {
        const rows = await getAllPricesCritical();
        if (stopped || !Array.isArray(rows)) return;
        const bySymbol = new Map(rows.map(row => [String(row?.symbol ?? '').toUpperCase(), Number(row?.price)]));
        for (const item of staleSymbols) {
          const price = bySymbol.get(item.symbol);
          if (!Number.isFinite(price) || price <= 0) continue;
          const fallbackTick = buildCriticalRestFallbackTick({
            symbol: item.symbol,
            price,
            checkedAt: Date.now(),
            stale: item,
          });
          if (fallbackTick) queueLifecycleTick(fallbackTick);
        }
      } catch (fallbackError) {
        const code = fallbackError?.code ?? 'UNKNOWN';
        const staleSet = new Set(staleSymbols.map(item => item.symbol));
        setSamples(prev => prev.map(sample => (
          sample.closed === true || !staleSet.has(sample.symbol)
            ? sample
            : {
              ...sample,
              positionLifecycleRateLimiterIndependent: true,
              marketPriceStreamHealthy: false,
              positionLifecycleRestFallbackStatus: `DEGRADED:${code}`,
              positionLifecycleRestFallbackFailedAt: Date.now(),
              positionLifecycleRestFallbackRetryAt: fallbackError?.retryAt ?? null,
              positionLifecycleSymbolTickAgeMs: stream.getSymbolHealthSnapshot(sample.symbol).latestTickAgeMs,
            }
        )));
      } finally {
        lifecycleFallbackBusyRef.current = false;
      }
    };

    refreshStaleSymbols();
    const id = setInterval(refreshStaleSymbols, LIFECYCLE_STALE_WATCH_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [activePositionSymbolsKey, queueLifecycleTick]);

  useEffect(() => {
    const tickMs = autoRunIsActive(autoRun) ? 250 : 1000;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [autoRun?.phase]);
  useEffect(() => {
    fetchBtcMarketContext();

    const id = setInterval(() => {
      fetchBtcMarketContext();
    }, MARKET_CONTEXT_CONFIG.refreshMs);

    return () => clearInterval(id);
  }, [fetchBtcMarketContext]);

  useEffect(() => {
    fetchMarketRegime();
    const id = setInterval(() => fetchMarketRegime(), MARKET_REGIME_CONFIG.refreshMs);
    return () => clearInterval(id);
  }, [fetchMarketRegime]);

  useEffect(() => {
    refreshSessionHealth(samples);
    const id = setInterval(() => refreshSessionHealth(samples), 5_000);
    return () => clearInterval(id);
  }, [samples, refreshSessionHealth]);

  // Keep autoRun ref in sync so the timer callback always has fresh state
  useEffect(() => { autoRunRef.current = autoRun; }, [autoRun]);

  // ── AES Discovery persistence ────────────────────────────────────────────────
  useEffect(() => {
    if (!storageOk) return;
    window.storage.set(AES_DISCOVERY_CONFIG.storageKeys.discoveryEvents, JSON.stringify(aesDiscoveryEvents.slice(-AES_DISCOVERY_CONFIG.maxStoredDiscoveryEvents))).catch(() => {});
  }, [aesDiscoveryEvents, storageOk]);

  useEffect(() => {
    if (!storageOk) return;
    window.storage.set(AES_DISCOVERY_CONFIG.storageKeys.shadowTrades, JSON.stringify(aesShadowTrades.slice(-AES_DISCOVERY_CONFIG.maxStoredShadowTrades))).catch(() => {});
  }, [aesShadowTrades, storageOk]);

  useEffect(() => {
    if (!storageOk) return;
    (async () => {
      try {
        const evts = await window.storage.get(AES_DISCOVERY_CONFIG.storageKeys.discoveryEvents);
        if (evts?.value) setAesDiscoveryEvents(JSON.parse(evts.value));
        const shad = await window.storage.get(AES_DISCOVERY_CONFIG.storageKeys.shadowTrades);
        if (shad?.value) setAesShadowTrades(JSON.parse(shad.value));
      } catch (_) {}
    })();
  }, [storageOk]);

  useEffect(() => {
    if (!AES_DISCOVERY_CONFIG.enabled) return;

    const id = setInterval(async () => {
      const now = Date.now();
      const allEligible = discoveryFullUniverseRef.current;
      if (!allEligible.length) return;

      const queue = discoveryQueueRef.current;
      const { effectiveWeight: rlEff, isBanned, isBackoff } = rlSnapshot();
      const rateLimitUsagePct = (rlEff / RL.WEIGHT_PER_MIN) * 100;

      if (isBanned || isBackoff || rateLimitUsagePct > AES_DISCOVERY_CONFIG.maxRateLimitWeightPct) {
        queue.pauseForRateLimit();
        setDiscoveryScannerHealth(h => ({ ...h, rateLimitPaused: true, rateLimitUsagePct }));
        return;
      }
      queue.resumeFromRateLimit();

      // Select candidates for deep scan
      const outside = allEligible.filter(t => t.outsideTop25 === true && t.side24hRank <= AES_DISCOVERY_CONFIG.maxSideRankToResearch);
      const activeSyms   = new Set(aesShadowTrades.filter(t => !t.closed).map(t => t.symbol));
      const queuedSyms   = new Set([...queue.getQueueSnapshot().records.filter(r => r.status === "QUEUED" || r.status === "FETCHING").map(r => r.symbol)]);
      const cachedTelem  = {};
      for (const sym of Object.keys(universeTickerSnapshotHistoryRef.current)) {
        const ct = queue.getCachedTelemetry(sym, now);
        if (ct) cachedTelem[sym] = ct;
      }

      const candidates = selectDeepScanCandidates({
        candidates: outside,
        config: AES_DISCOVERY_CONFIG,
        tickHistoryStore: universeTickerSnapshotHistoryRef.current,
        activeSymbols:    activeSyms,
        queuedSymbols:    queuedSyms,
        cachedTelemetry:  cachedTelem,
        sideAlternatePriority: discoverySideAlternateRef.current,
        now,
      });

      // Alternate side priority
      discoverySideAlternateRef.current = discoverySideAlternateRef.current === "GAINERS" ? "LOSERS" : "GAINERS";

      // Enqueue candidates
      for (const c of candidates) {
        queue.enqueue({
          symbol: c.symbol, side: c.leaderboardSide === "GAINERS" ? "GAINER" : "LOSER",
          side24hRank: c.side24hRank, rankBand: c.rankBand,
          prefilterScore: c.prefilterScore ?? 50, now,
        });
      }
      queue.retryEligible(now);
      queue.clearExpiredAndOld(now);

      // Process batch — budget = headroom below the FROZEN ceiling this minute
      const budget = Math.max(0, RL.FREEZE_CEILING - rlSnapshot().effectiveWeight);
      const batch = queue.getNextBatch({ rateLimitWeightBudget: budget, livePrioritySymbols: activeSyms, now });
      const deepStart = Date.now();

      await Promise.allSettled(batch.map(async rec => {
        queue.markFetching(rec.id, now);
        try {
          const candidate = allEligible.find(t => t.symbol === rec.symbol);
          if (!candidate) { queue.markFailed(rec.id, "CANDIDATE_MISSING", Date.now()); return; }

          const tickHistFields = computeTickHistoryFields(rec.symbol, universeTickerSnapshotHistoryRef.current, now);
          const candidateEnriched = { ...candidate, ...tickHistFields };

          const snapshot = await buildDiscoveryTelemetrySnapshot({
            candidate: candidateEnriched,
            marketContext: marketContextRef.current,
            oiSnapshots:  oiSnapshotRef.current,
            getKlines: (sym, i, lim) => apiGetLow(`${FAPI}/klines?symbol=${sym}&interval=${i}&limit=${lim}`),
            getOI: sym => apiGetLow(`${FAPI}/openInterest?symbol=${sym}`),
            computeEntryTelemetry, computeRsiTelemetry, computeTrendTelemetry,
            computeAdvancedMarketTelemetry, buildLongAuditFields, classifyLongBucket,
            entryTelemetryConfig: ENTRY_TELEMETRY_CONFIG,
            config: AES_DISCOVERY_CONFIG,
            scannerVersion: AES_DISCOVERY_CONFIG.scannerVersion,
          });

          queue.markComplete(rec.id, snapshot, Date.now());

          // Compute AES variants
          const aesVariants = computeDiscoveryAesVariants({ ...snapshot, ...tickHistFields });

          // Assign labels
          const labels = assignDiscoveryLabels({
            side24hRank:  candidate.side24hRank, outsideTop25: candidate.outsideTop25,
            outsideTop50: candidate.outsideTop50, outsideTop100: candidate.outsideTop100,
            outsideTop200: candidate.outsideTop200, leaderboardSide: candidate.leaderboardSide,
            aesFull: aesVariants.aesFull, aesNoRank: aesVariants.aesNoRank,
            aesSetupOnly: aesVariants.aesSetupOnly,
            telemetryCoveragePct: snapshot.telemetryCoveragePct,
            snapshot, config: AES_DISCOVERY_CONFIG,
          });

          // Create discovery event
          const evtId = `evt_${candidate.symbol}_${now}`;
          const discoveryEvent = {
            discoveryEventId: evtId,
            scannerVersion: AES_DISCOVERY_CONFIG.scannerVersion,
            scoreVersion: aesVariants.scoreVersion,
            symbol: candidate.symbol, side: snapshot.side,
            leaderboardSide: candidate.leaderboardSide,
            detectedAt: now,
            side24hRankAtDetection: candidate.side24hRank,
            rankBandAtDetection: candidate.rankBand,
            outsideTop25: candidate.outsideTop25, outsideTop50: candidate.outsideTop50,
            outsideTop100: candidate.outsideTop100, outsideTop200: candidate.outsideTop200,
            change24hAtDetection: parseFloat(candidate.priceChangePercent),
            globalAbsChangeRankAtDetection: candidate.globalAbsChangeRank,
            prefilterScore: candidate.prefilterScore,
            prefilterReasons: candidate.prefilterReasons ?? [],
            aesFull: aesVariants.aesFull, aesNoRank: aesVariants.aesNoRank,
            aesSetupOnly: aesVariants.aesSetupOnly,
            aesFullMinusNoRank: aesVariants.aesFullMinusNoRank,
            aesFullMinusSetupOnly: aesVariants.aesFullMinusSetupOnly,
            rankContributionNet: aesVariants.rankContributionNet,
            change24hContributionNet: null,
            telemetryCoveragePct: snapshot.telemetryCoveragePct,
            telemetryMissingFields: snapshot.telemetryMissingFields,
            telemetryWarnings: snapshot.telemetryWarnings,
            labels,
            btcContext: marketContextRef.current?.btc ?? null,
            ethContext: null,
            // Broad tick fields
            last3BroadTicksDirection: tickHistFields.last3BroadTicksDirection ?? null,
            ...tickHistFields,
          };

          setAesDiscoveryEvents(prev => {
            const pruned = prev.length >= AES_DISCOVERY_CONFIG.maxStoredDiscoveryEvents
              ? prev.slice(prev.length - AES_DISCOVERY_CONFIG.maxStoredDiscoveryEvents + 1)
              : prev;
            return [...pruned, discoveryEvent];
          });

          // Maybe create shadow trade
          const newTrade = maybeShadowEntry({
            snapshot: { ...snapshot, ...tickHistFields },
            candidate: { ...candidateEnriched, ...discoveryEvent },
            aesVariants, episodeState: discoveryEpisodeRef.current,
            existingShadowTrades: aesShadowTrades,
            config: AES_DISCOVERY_CONFIG, now,
          });

          if (newTrade) {
            updateEpisodeState(discoveryEpisodeRef.current, candidate.symbol, aesVariants, newTrade, AES_DISCOVERY_CONFIG, now);
            setAesShadowTrades(prev => {
              if (prev.length >= AES_DISCOVERY_CONFIG.maxStoredShadowTrades)
                return [...prev.slice(1), newTrade];
              return [...prev, newTrade];
            });
          } else {
            updateEpisodeState(discoveryEpisodeRef.current, candidate.symbol, aesVariants, null, AES_DISCOVERY_CONFIG, now);
          }

        } catch (err) {
          queue.markFailed(rec.id, err?.message ?? "UNKNOWN", Date.now());
          console.warn("[AES_DISCOVERY_ERROR]", rec.symbol, err?.message);
        }
      }));

      const deepDuration = Date.now() - deepStart;
      discoveryLastDeepScanRef.current = now;

      setDiscoveryScannerHealth({
        enabled: true, lastBroadScan: now, lastDeepScan: now,
        rateLimitUsagePct, rateLimitPaused: false,
        telemetryFailRate: queue.getQueueSnapshot().metrics.totalFailed /
          Math.max(1, queue.getQueueSnapshot().metrics.totalEnqueued),
      });
      setDiscoveryQueueSnapshot(queue.getQueueSnapshot());
      setDiscoveryPerfCounters(p => ({ ...p, deepScanDurationMs: deepDuration }));
    }, AES_DISCOVERY_CONFIG.deepScanIntervalMs);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageOk]);



  // ── Add sample ───────────────────────────────────────────────────────────────
  const addSample = useCallback(async (ticker, bucket = "TOP_LOSER_LONGS") => {
    assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG);
    if (autoRunIsActive(autoRunRef.current)) return;
    if (samples.filter(s => !s.closed).length >= MAX_SAMPLES) return;
    if (getAvailableBucketSlots(samples, bucket) <= 0) return;
    if (samples.find(s => s.symbol === ticker.symbol && !s.closed)) return;

    const recentSess = Object.values(sessionMap)
      .filter(s => Date.now() - s.timestamp < 30 * 60_000)
      .sort((a,b) => b.timestamp - a.timestamp)[0];
    const sessionQuality = recentSess?.quality ?? "MIXED_SESSION";

    const ep    = parseFloat(ticker.lastPrice);
    const h24   = parseFloat(ticker.highPrice);
    const l24   = parseFloat(ticker.lowPrice);
    const rng24 = h24 - l24;
    const sourceList = bucket === "TOP_GAINER_LONGS" ? gainerTickers : loserTickers;
    const rank  = sourceList.findIndex(t => t.symbol === ticker.symbol) + 1;

    const bounceFromLowVal = rng24 > 0 ? parseFloat(((ep-l24)/rng24*100).toFixed(1)) : 50;

    let entryMarketContext = marketContextRef.current;
    const contextAge = entryMarketContext?.computedAt
      ? Date.now() - entryMarketContext.computedAt
      : Infinity;

    if (!entryMarketContext || contextAge > MARKET_CONTEXT_CONFIG.maxContextAgeMs) {
      entryMarketContext = await fetchBtcMarketContext();
    }

    const flatMarketContext = flattenMarketContext(entryMarketContext);
    const btcEntryPrice = numberOrNull(flatMarketContext.btcPrice) ?? numberOrNull(entryMarketContext?.btc?.price);
    const entryTime = Date.now();
    const tickCollector = tickDirectionCollectorRef.current;
    const tickStreamHealth = tickCollector?.getHealthSnapshot(entryTime) ?? {};
    const frozenTickSnapshot = captureTickDirectionSnapshot({
      symbol: ticker.symbol,
      entryTime,
      entryPrice: ep,
      atrPct: ticker.atrPct ?? klinesMap[ticker.symbol]?.atrPct ?? null,
      spreadPct: null,
      bufferStore: tickCollector?.getBufferStore(),
      config: TICK_DIRECTION_CONFIG,
      streamHealthy: tickStreamHealth.tickResearchStreamConnected === true,
    });
    const tickOutcomeDefaults = buildTickDirectionOutcomeDefaults({
      entrySpreadPct: frozenTickSnapshot.entryTickSpreadPctObserved,
    });

    const entry = {
      id:           entryTime,
      symbol:       ticker.symbol,
      leverage:     lev,
      slPct:        SL_PCT,
      tpPct:        TP_PCT,
      change24h:    parseFloat(parseFloat(ticker.priceChangePercent).toFixed(2)),
      entryPrice:   ep,
      currentPrice: ep,
      lastPriceTimestamp: entryTime,
      lastPriceUpdateAt: entryTime,
      lastPriceSource: "ENTRY_TICKER",
      slPrice:      parseFloat((ep * (1 - SL_PCT/100)).toFixed(8)),
      tpPrice:      parseFloat((ep * (1 + TP_PCT/100)).toFixed(8)),
      entryTime,
      closed:       false, closeReason: null, closedAt: null, finalPnlPct: null,
      mae: 0, mfe: 0, trailPeak: null, trailActive: false,
      priceHistory: [{ t: entryTime, p: ep }],
      funding:       fundingMap[ticker.symbol] ?? null,
      cvdRatio:      null, cvdLabel: null, atrPct: null, volAccel: null,
      spreadPct:     null, oiVal: null,
      bounceFromLow: bounceFromLowVal,
      distFromHigh:  h24 > 0  ? parseFloat(((ep-h24)/h24*100).toFixed(2)) : 0,
      utcHour:       new Date().getUTCHours(),
      entryRank:     rank,
      entryRankBucket:  getEntryRankBucket(rank),
      entryRankWarning: rank > 10 ? "LOWER_PRIORITY_RANK_RESEARCH_ONLY" : null,
      quoteVol:      parseFloat(ticker.quoteVolume),
      notes:         "",
      run,
      holdMs,
      profitLockEnabled:        true,
      profitLockActive:         false,
      profitLockActivatedAt:    null,
      profitLockLevelMarginPct: null,
      profitLockLevelPrice:     null,
      profitLockStage:          null,
      profitLockEvents:         [],
      ...makeProfitLockProtectionDefaults(),
      highestProfitPricePct:    0,
      highestMarginPnlPct:      0,
      leverageProfile:   getLeverageProfile(lev),
      spreadBucket:      null,
      atrBucket:         null,
      cvdInterpretation: null,
      bounceContext:     getBounceContext(bounceFromLowVal),
      sessionQuality,
      warningFlags:      [],
      entryTiming:       null,
      isStale:           false,
      isInvalidMarket:   false,
      staleReason:       null,
      uniquePriceCount:  1,
      lossProfile:       null,
      entrySource:       "MANUAL_SINGLE",
      autoRunId:         null,
      autoRunCycle:      null,
      ...makeBucketRiskFields(lev),
      ...makeBucketClassificationFields(),
      leaderboardSide:     bucket === "TOP_GAINER_LONGS" ? "GAINERS" : "LOSERS",
      longParentBucket:   bucket,
      entryRankInBucket:   rank,
      bucketCapAtEntry:    LONG_BUCKET_POSITION_LIMITS.parentBucketCaps[bucket],
      bucketActiveCountAtEntry: samples.filter(s => !s.closed && s.longParentBucket === bucket).length,
      ...ENTRY_TELEMETRY_DEFAULTS,
      ...RSI_TELEMETRY_DEFAULTS,
      ...TREND_TELEMETRY_DEFAULTS,
      ...ADVANCED_MARKET_TELEMETRY_DEFAULTS,
      ...MARKET_CONTEXT_DEFAULTS,
      ...flatMarketContext,
      btcEntryPrice,
      btcCurrentPrice: btcEntryPrice,
      btcExitPrice: null,
      // LONG identity — hardcoded, never changes
      lab:                       "LONG_LAB",
      tradeSide:                 "LONG",
      executionMode:             "LOG_ONLY",
      realOrderPlacementEnabled: false,
      ...makeLongResearchVersionStamp(),
      ...frozenTickSnapshot,
      ...tickOutcomeDefaults,
      // Canonical fee snapshot — frozen at entry time
      feeSnapshot:               captureFeeSnapshot(DEFAULT_FEE_CONFIG),
      positionSizingMode:        POSITION_SIZING_MODE.PERCENT_ONLY,
      marginUsedUsd:             null,
      entryNotionalUsd:          null,
      quantity:                  null,
    };

    // Set initial exit profile bias from entry classification
    const exitProfileInitialBias = resolveInitialExitProfileBias(entry);
    Object.assign(entry, {
      exitProfileSelected: EXIT_PROFILE.NORMAL,
      exitProfileInitialBias,
      exitProfileReason: `INITIAL_BIAS_${exitProfileInitialBias}`,
    });

    setSamples(prev => [...prev, entry]);
    toast(`Added ${entry.symbol} to Samples.`, { tone: "long" });
    setTab("samples");

    Promise.allSettled([
      getKlinesHigh(ticker.symbol, "1m", 20),
      getDepthHigh(ticker.symbol),
      getOIHigh(ticker.symbol),
      getKlinesHigh(ticker.symbol, ENTRY_TELEMETRY_CONFIG.vwapTimeframe, ENTRY_TELEMETRY_CONFIG.vwapLookback),
      ...getEntrySignalKlineRequestsHigh(ticker.symbol),
    ]).then(([kl, dep, oi, kl5m, ...entryKlineResults]) => {
      const klSig = kl.status === "fulfilled" ? extractKlineSignals(kl.value) : {};
      let spreadPct = null;
      if (dep.status === "fulfilled" && dep.value.bids?.length && dep.value.asks?.length) {
        const bid = parseFloat(dep.value.bids[0][0]), ask = parseFloat(dep.value.asks[0][0]);
        spreadPct = bid > 0 ? parseFloat(((ask-bid)/bid*100).toFixed(5)) : null;
      }
      const oiVal            = oi.status === "fulfilled" ? parseFloat(oi.value.openInterest) : null;
      const telemetryComputedAt = Date.now();
      recordOiSnapshot(entry.symbol, oiVal, entry.entryPrice, telemetryComputedAt);
      const spreadBucket     = getSpreadBucket(spreadPct);
      const atrBucket        = getAtrBucket(klSig.atrPct ?? null);
      const cvdInterpretation = klSig.cvdLabel ? `${klSig.cvdLabel}_CVD_TELEMETRY_ONLY` : null;
      const klines1m         = kl.status   === "fulfilled" ? kl.value   : null;
      const klines5m         = kl5m.status === "fulfilled" ? kl5m.value : null;
      const entryTiming      = extractEntryTiming(klines1m, entry.entryPrice, spreadPct);
      const warningFlags     = computeWarningFlags(spreadPct, klSig.atrPct ?? null, rank, lev);
      const klinesByInterval = mapSettledKlinesByInterval(ENTRY_SIGNAL_INTERVALS, entryKlineResults);
      const rsiSnapshot      = computeRsiTelemetry({
        symbol:            entry.symbol,
        side: "LONG",
        klinesByInterval,
      });
      const trendSnapshot    = computeTrendTelemetry({
        symbol:            entry.symbol,
        side: "LONG",
        klinesByInterval,
        entryPrice:        entry.entryPrice,
        computedAt:        telemetryComputedAt,
      });
      const advancedSnapshot = computeAdvancedMarketTelemetry({
        symbol:            entry.symbol,
        side: "LONG",
        entryPrice:        entry.entryPrice,
        klinesByInterval,
        oiSnapshotsBySymbol: oiSnapshotRef.current,
        liquidationSnapshotsBySymbol: liquidationSnapshotRef.current,
        oiCurrent:         oiVal,
        computedAt:        telemetryComputedAt,
      });
      const etSnapshot       = computeEntryTelemetry({
        klines1m, klines5m,
        entryPrice:   entry.entryPrice,
        side: "LONG",
        symbol:       entry.symbol,
        entryRank:    rank,
        bounceFromLow: bounceFromLowVal,
        cvdRatio:     klSig.cvdRatio ?? null,
        cvdLabel:     klSig.cvdLabel ?? null,
        atrPct:       klSig.atrPct  ?? null,
        volAccel:     klSig.volAccel ?? null,
        spreadPct,
        oiVal,
        distFromHigh: entry.distFromHigh,
        change24h:    entry.change24h,
        quoteVol:     entry.quoteVol,
      });
      const flatET  = flattenEntryTelemetry(etSnapshot);
      const flatRSI = flattenRsiTelemetry(rsiSnapshot);
      const longThesisFields = buildLongAuditFields({
        longParentBucket:       bucket,
        entryTimingGrade:        entryTiming?.entryTimingGrade ?? null,
        immediateRedImpulse:     entryTiming?.immediateRedImpulse   ?? false,
        immediateGreenImpulse:   entryTiming?.immediateGreenImpulse ?? false,
        greenImpulseDetected:    flatET.greenImpulseDetected ?? false,
        redImpulseDetected:      flatET.redImpulseDetected   ?? false,
        last3TicksDirection:     entryTiming?.last3TicksDirection ?? "MIXED",
        rsiSpread1m3m:           flatRSI.rsiSpread1m3m ?? null,
        rsi1mDelta:              flatRSI.rsi1mDelta    ?? null,
        rsi15m:                  flatRSI.rsi15m        ?? null,
        rsi30m:                  flatRSI.rsi30m        ?? null,
        rsi1h:                   flatRSI.rsi1h         ?? null,
        btcRegime:               entry.btcRegime       ?? null,
        btcLongTailwindScore:   entry.btcLongTailwindScore ?? null,
        atrPct:                  klSig.atrPct          ?? null,
        priceVsVwapLabel:        flatET.priceVsVwapLabel ?? "UNKNOWN",
        spreadPct:               spreadPct ?? null,
        spreadStableBeforeEntry: entryTiming?.spreadStableBeforeEntry ?? false,
        entryRank:               entry.entryRank,
        entryBounceContext:      etSnapshot.bounceContext ?? null,
        bounceContext:           entry.bounceContext ?? null,
        volAccel:                klSig.volAccel ?? null,
      });
      setSamples(prev => prev.map(s => {
        if (s.id !== entry.id) return s;
        const entryTelemetry = {
          ...s, ...klSig, spreadPct, oiVal, spreadBucket, atrBucket,
          cvdInterpretation, entryTiming, warningFlags,
          ...flatRSI,
          ...flattenTrendTelemetry(trendSnapshot),
          ...flattenAdvancedMarketTelemetry(advancedSnapshot),
          ...flatET,
          ...longThesisFields,
        };
        return compactLongTradeForRuntime(buildManualResearchTrade({
          baseTrade:     entry,
          entryTelemetry,
          marketContext: entryMarketContext,
          computedAt:    Date.now(),
        }));
      }));
    });
  }, [samples, lev, holdMs, fundingMap, loserTickers, gainerTickers, klinesMap, run, sessionMap, fetchBtcMarketContext, recordOiSnapshot]);

  // ── Auto-run engine ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoRun || autoRun.phase === "done") return;
    const id = setInterval(() => {
      const ar = autoRunRef.current;
      if (!ar || ar.phase === "done") { clearInterval(id); return; }
      if (ar.phase === "starting") return;
      const elapsed = Date.now() - ar.phaseStart;

      if (ar.phase === "running" && elapsed >= ar.runDurationMs) {
        // A scanner run ending is not a position-close event. Positions opened by
        // this cycle remain owned by the independent lifecycle engine until an
        // actual exit condition (TP/SL/trail/lock/timeout/manual) closes them.
        const ts = Date.now();
        const ownedEntryIds = new Set(ar.currentEntryIds ?? []);
        const btcCurrentPrice = getLatestBtcPrice();
        setSamples(prev => prev.map(s => {
          if (s.closed) return s;
          if (s.autoRunId !== ar.id) return s;
          if (s.autoRunCycle !== ar.currentCycle) return s;
          if (ownedEntryIds.size && !ownedEntryIds.has(s.id)) return s;
          const sampleBtcPrice = btcCurrentPrice ?? s.btcCurrentPrice ?? s.btcPrice ?? null;
          return {
            ...s,
            btcCurrentPrice: sampleBtcPrice,
            sourceRunCompleted: true,
            sourceRunCompletedAt: ts,
            sourceRunCompletionReason: "RUN_WINDOW_COMPLETE",
            positionLifecycleContinuesAfterRun: true,
          };
        }));
        const done = ar.completedRuns + 1;
        if (done >= ar.maxRuns) {
          const next = { ...ar, phase: "done", completedRuns: done, currentEntryIds: [] };
          autoRunRef.current = next;
          setAutoRun(next);
        } else {
          const next = { ...ar, phase: "cooldown", phaseStart: Date.now(), completedRuns: done, currentEntryIds: [] };
          autoRunRef.current = next;
          setAutoRun(next);
        }
        return;
      }

      if (ar.phase === "cooldown" && elapsed >= ar.cooldownMs) {
        const nextRun = ar.baseRun + ar.completedRuns;
        const nextCycle = ar.completedRuns + 1;
        const starting = {
          ...ar,
          phase: "starting",
          phaseStart: Date.now(),
          currentRun: nextRun,
          currentCycle: nextCycle,
          currentEntryIds: [],
          currentSetId: null,
          stoppedReason: null,
        };
        autoRunRef.current = starting;
        setAutoRun(starting);
        setRun(nextRun);
        Promise.resolve(startSetRef.current?.({
          targetBucket: ar.targetBucket ?? "TOP_LOSER_LONGS",
          runOverride: nextRun,
          source: "AUTO_RUN",
          autoRunId: ar.id,
          autoRunCycle: nextCycle,
        })).then(result => {
          const current = autoRunRef.current;
          if (!current || current.id !== ar.id || current.currentCycle !== nextCycle || current.phase !== "starting") return;

          if (!result?.createdCount) {
            const doneState = {
              ...current,
              phase: "done",
              stoppedReason: result?.reason ?? "AUTO_RUN_NO_ENTRIES",
            };
            autoRunRef.current = doneState;
            setAutoRun(doneState);
            return;
          }

          const running = {
            ...current,
            phase: "running",
            phaseStart: Date.now(),
            currentEntryIds: result.entryIds ?? [],
            currentSetId: result.setId ?? null,
            stoppedReason: null,
          };
          autoRunRef.current = running;
          setAutoRun(running);
        }).catch(() => {
          const current = autoRunRef.current;
          if (!current || current.id !== ar.id || current.currentCycle !== nextCycle || current.phase !== "starting") return;
          const doneState = {
            ...current,
            phase: "done",
            stoppedReason: "START_SET_FAILED",
          };
          autoRunRef.current = doneState;
          setAutoRun(doneState);
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [autoRun, getLatestBtcPrice]);



  // ── Bucket-aware start ───────────────────────────────────────────────────────
  const startBucketSet = useCallback(async (bucket, startOptions = {}) => {
    assertLongResearchOnly(LONG_RESEARCH_ONLY_CONFIG);
    const nowTs   = Date.now();
    const options = normalizeStartSetOptions(startOptions);
    const sourceList = bucket === "TOP_LOSER_LONGS"  ? loserTickers
                     : bucket === "TOP_GAINER_LONGS" ? gainerTickers
                     : [];
    if (!sourceList.length) return { createdCount: 0, entryIds: [], setId: null, reason: "NO_TICKERS" };

    const available = getAvailableBucketSlots(samples, bucket);
    if (available <= 0) return { createdCount: 0, entryIds: [], setId: null, reason: "NO_CAPACITY" };

    const active     = samples.filter(s => !s.closed);
    const candidates = sourceList.filter(t => !active.some(s => s.symbol === t.symbol));
    const toAdd      = candidates.slice(0, available);
    if (!toAdd.length) return { createdCount: 0, entryIds: [], setId: null, reason: "NO_CANDIDATES" };

    const setId        = nowTs;
    const effectiveRun = normalizeRunValue(options.runOverride, run);
    const leaderboardSide = bucket === "TOP_LOSER_LONGS" ? "LOSERS" : "GAINERS";

    let entryMarketContext = marketContextRef.current;
    const contextAge = entryMarketContext?.computedAt ? nowTs - entryMarketContext.computedAt : Infinity;
    if (!entryMarketContext || contextAge > MARKET_CONTEXT_CONFIG.maxContextAgeMs) {
      entryMarketContext = await fetchBtcMarketContext();
    }
    const flatMarketContext = flattenMarketContext(entryMarketContext);

    // Market regime snapshot (shared for all entries in this set)
    let entryRegimeSnapshot = marketRegimeRef.current;
    const regimeAge = entryRegimeSnapshot?.computedAt ? nowTs - entryRegimeSnapshot.computedAt : Infinity;
    if (!entryRegimeSnapshot || regimeAge > MARKET_REGIME_CONFIG.maxContextAgeMs) {
      entryRegimeSnapshot = await fetchMarketRegime();
    }
    const flatRegime = flattenMarketRegimeSnapshot(entryRegimeSnapshot);
    const regimeSnapshotId = entryRegimeSnapshot?.snapshotId ?? null;

    // Session health snapshot (shared for all entries in this set)
    const entrySessionHealth = refreshSessionHealth(samples);
    const flatSession = flattenSessionHealth(entrySessionHealth);
    const sessionSnapshotId = entrySessionHealth?.evaluatedAt ?? null;

    let sessionQuality = "MIXED_SESSION";
    try {
      const [btcK15, ethK15] = await Promise.allSettled([
        getKlines("BTCUSDT", "15m", 5),
        getKlines("ETHUSDT", "15m", 5),
      ]);
      const btcK15v = btcK15.status === "fulfilled" ? btcK15.value : null;
      const ethK15v = ethK15.status === "fulfilled" ? ethK15.value : null;
      const candle1hChange = k => k?.length >= 4
        ? (parseFloat(k[k.length-1][4]) - parseFloat(k[0][1])) / parseFloat(k[0][1]) * 100 : 0;
      const btc1h = candle1hChange(btcK15v);
      const eth1h = candle1hChange(ethK15v);
      const basketKl = Object.values(klinesMap);
      const avgAtr = basketKl.length ? basketKl.reduce((s,k) => s + (k.atrPct ?? 0), 0) / basketKl.length : 0;
      sessionQuality = getSessionQuality(btc1h, eth1h, avgAtr);
      const candle15mChange = k => k?.length >= 1
        ? (parseFloat(k[k.length-1][4]) - parseFloat(k[k.length-1][1])) / parseFloat(k[k.length-1][1]) * 100 : 0;
      setSessionMap(prev => ({ ...prev, [setId]: {
        btc1h: entryMarketContext?.btc?.change1hPct ?? null,
        eth1h,
        btc15m: entryMarketContext?.btc?.change15mPct ?? null,
        eth15m: candle15mChange(ethK15v),
        btc2h: entryMarketContext?.btc?.change2hPct ?? null,
        btcRegime: entryMarketContext?.btc?.regime ?? "UNKNOWN",
        btcShortBias: entryMarketContext?.btc?.shortBias ?? "UNKNOWN",
        btcLongTailwindScore: entryMarketContext?.crossMarket?.crossMarketLongTailwindScore ?? entryMarketContext?.btc?.longTailwindScore ?? 0,
        avgAtr, quality: sessionQuality, timestamp: nowTs,
        utcHour: new Date().getUTCHours(),
      }}));
    } catch(_) {}

    const bucketActiveCount = countActiveByParentBucket(samples, bucket);
    const tickCollector = tickDirectionCollectorRef.current;
    const tickStreamHealth = tickCollector?.getHealthSnapshot(nowTs) ?? {};
    const newEntries = toAdd.map((ticker, idx) => {
      const ep    = parseFloat(ticker.lastPrice);
      const h24   = parseFloat(ticker.highPrice), l24 = parseFloat(ticker.lowPrice);
      const rng24 = h24 - l24;
      const rank  = sourceList.findIndex(t => t.symbol === ticker.symbol) + 1;
      const bounceFromLowVal = rng24 > 0 ? parseFloat(((ep - l24) / rng24 * 100).toFixed(1)) : 50;
      const frozenTickSnapshot = captureTickDirectionSnapshot({
        symbol: ticker.symbol,
        entryTime: nowTs,
        entryPrice: ep,
        atrPct: ticker.atrPct ?? klinesMap[ticker.symbol]?.atrPct ?? null,
        spreadPct: null,
        bufferStore: tickCollector?.getBufferStore(),
        config: TICK_DIRECTION_CONFIG,
        streamHealthy: tickStreamHealth.tickResearchStreamConnected === true,
      });
      const tickOutcomeDefaults = buildTickDirectionOutcomeDefaults({
        entrySpreadPct: frozenTickSnapshot.entryTickSpreadPctObserved,
      });
      return {
        id:           nowTs + idx,
        symbol:       ticker.symbol,
        leverage:     lev,
        slPct:        SL_PCT,
        tpPct:        TP_PCT,
        change24h:    parseFloat(parseFloat(ticker.priceChangePercent).toFixed(2)),
        entryPrice:   ep,
        currentPrice: ep,
        lastPriceTimestamp: nowTs,
        lastPriceUpdateAt: nowTs,
        lastPriceSource: "ENTRY_TICKER",
        slPrice:      parseFloat((ep * (1 - SL_PCT/100)).toFixed(8)),
        tpPrice:      parseFloat((ep * (1 + TP_PCT/100)).toFixed(8)),
        entryTime:    nowTs,
        closed:       false, closeReason: null, closedAt: null, finalPnlPct: null,
        mae: 0, mfe: 0, trailPeak: null, trailActive: false,
        priceHistory: [{ t: nowTs, p: ep }],
        funding:      fundingMap[ticker.symbol] ?? null,
        cvdRatio: null, cvdLabel: null, atrPct: null, volAccel: null, spreadPct: null, oiVal: null,
        bounceFromLow: bounceFromLowVal,
        distFromHigh:  h24 > 0 ? parseFloat(((ep - h24) / h24 * 100).toFixed(2)) : 0,
        utcHour:       new Date().getUTCHours(),
        entryRank:     rank,
        entryRankBucket:  getEntryRankBucket(rank),
        entryRankWarning: rank > 10 ? "LOWER_PRIORITY_RANK_RESEARCH_ONLY" : null,
        quoteVol:      parseFloat(ticker.quoteVolume),
        notes:         "",
        run:           effectiveRun,
        holdMs,
        setId,
        profitLockEnabled:        true,
        profitLockActive:         false,
        profitLockActivatedAt:    null,
        profitLockLevelMarginPct: null,
        profitLockLevelPrice:     null,
        profitLockStage:          null,
        profitLockEvents:         [],
        ...makeProfitLockProtectionDefaults(),
        highestProfitPricePct:    0,
        highestMarginPnlPct:      0,
        leverageProfile:   getLeverageProfile(lev),
        spreadBucket:      null,
        atrBucket:         null,
        cvdInterpretation: null,
        bounceContext:     getBounceContext(bounceFromLowVal),
        sessionQuality,
        warningFlags:      [],
        entryTiming:       null,
        isStale:           false,
        isInvalidMarket:   false,
        staleReason:       null,
        uniquePriceCount:  1,
        lossProfile:       null,
        entrySource:       options.source ?? "MANUAL_SET",
        autoRunId:         options.autoRunId,
        autoRunCycle:      options.autoRunCycle,
        ...makeBucketRiskFields(lev),
        ...makeBucketClassificationFields(),
        leaderboardSide,
        longParentBucket:       bucket,
        entryRankInBucket:       rank,
        bucketCapAtEntry:        LONG_BUCKET_POSITION_LIMITS.parentBucketCaps[bucket],
        bucketActiveCountAtEntry: bucketActiveCount,
        ...ENTRY_TELEMETRY_DEFAULTS,
        ...RSI_TELEMETRY_DEFAULTS,
        ...TREND_TELEMETRY_DEFAULTS,
        ...ADVANCED_MARKET_TELEMETRY_DEFAULTS,
        ...MARKET_CONTEXT_DEFAULTS,
        ...flatMarketContext,
        // Market regime V2 fields
        ...MARKET_REGIME_DEFAULTS,
        ...flatRegime,
        marketSnapshotId: regimeSnapshotId,
        // Session health fields
        ...SESSION_HEALTH_DEFAULTS,
        ...flatSession,
        sessionHealthSnapshotId: sessionSnapshotId,
        _bounceFromLowVal: bounceFromLowVal,
        // LONG identity ? hardcoded, never changes
        lab:                       "LONG_LAB",
        tradeSide:                 "LONG",
        executionMode:             "LOG_ONLY",
        realOrderPlacementEnabled: false,
        ...makeLongResearchVersionStamp(),
        ...frozenTickSnapshot,
        ...tickOutcomeDefaults,
      };
    });

    // Set initial exit profile bias from entry classification
    newEntries.forEach(entry => {
      const exitProfileInitialBias = resolveInitialExitProfileBias(entry);
      Object.assign(entry, {
        exitProfileSelected: EXIT_PROFILE.NORMAL,
        exitProfileInitialBias,
        exitProfileReason: `INITIAL_BIAS_${exitProfileInitialBias}`,
      });
    });

    setSamples(prev => [...prev, ...newEntries]);
    setTab("samples");

    newEntries.forEach(entry => {
      Promise.allSettled([
        getKlinesHigh(entry.symbol, "1m", 20),
        getDepthHigh(entry.symbol),
        getOIHigh(entry.symbol),
        getKlinesHigh(entry.symbol, ENTRY_TELEMETRY_CONFIG.vwapTimeframe, ENTRY_TELEMETRY_CONFIG.vwapLookback),
        ...getEntrySignalKlineRequestsHigh(entry.symbol),
      ]).then(([kl, dep, oi, kl5m, ...entryKlineResults]) => {
        const klSig = kl.status === "fulfilled" ? extractKlineSignals(kl.value) : {};
        let spreadPct = null;
        if (dep.status === "fulfilled" && dep.value.bids?.length && dep.value.asks?.length) {
          const bid = parseFloat(dep.value.bids[0][0]), ask = parseFloat(dep.value.asks[0][0]);
          spreadPct = bid > 0 ? parseFloat(((ask - bid) / bid * 100).toFixed(5)) : null;
        }
        const oiVal              = oi.status === "fulfilled" ? parseFloat(oi.value.openInterest) : null;
        const telemetryComputedAt = Date.now();
        recordOiSnapshot(entry.symbol, oiVal, entry.entryPrice, telemetryComputedAt);
        const spreadBucket       = getSpreadBucket(spreadPct);
        const atrBucket          = getAtrBucket(klSig.atrPct ?? null);
        const cvdInterpretation  = klSig.cvdLabel ? `${klSig.cvdLabel}_CVD_TELEMETRY_ONLY` : null;
        const klines1m           = kl.status   === "fulfilled" ? kl.value   : null;
        const klines5m           = kl5m.status === "fulfilled" ? kl5m.value : null;
        const entryTiming        = extractEntryTiming(klines1m, entry.entryPrice, spreadPct);
        const warningFlags       = computeWarningFlags(spreadPct, klSig.atrPct ?? null, entry.entryRank, lev);
        const klinesByInterval   = mapSettledKlinesByInterval(ENTRY_SIGNAL_INTERVALS, entryKlineResults);
        const rsiSnapshot = computeRsiTelemetry({ symbol: entry.symbol, side: "LONG", klinesByInterval });
        const trendSnapshot = computeTrendTelemetry({
          symbol: entry.symbol, side: "LONG", klinesByInterval,
          entryPrice: entry.entryPrice, computedAt: telemetryComputedAt,
        });
        const advancedSnapshot = computeAdvancedMarketTelemetry({
          symbol: entry.symbol, side: "LONG", entryPrice: entry.entryPrice,
          klinesByInterval, oiSnapshotsBySymbol: oiSnapshotRef.current,
          liquidationSnapshotsBySymbol: liquidationSnapshotRef.current,
          oiCurrent: oiVal, computedAt: telemetryComputedAt,
        });
        const etSnapshot = computeEntryTelemetry({
          klines1m, klines5m, entryPrice: entry.entryPrice, side: "LONG",
          symbol: entry.symbol, entryRank: entry.entryRank,
          bounceFromLow: entry._bounceFromLowVal,
          cvdRatio: klSig.cvdRatio ?? null, cvdLabel: klSig.cvdLabel ?? null,
          atrPct: klSig.atrPct ?? null, volAccel: klSig.volAccel ?? null,
          spreadPct, oiVal, distFromHigh: entry.distFromHigh,
          change24h: entry.change24h, quoteVol: entry.quoteVol,
        });
        setSamples(prev => prev.map(s => {
          if (s.id !== entry.id) return s;
          const entryTelemetry = {
            ...s, ...klSig, spreadPct, oiVal, spreadBucket, atrBucket,
            cvdInterpretation, entryTiming, warningFlags,
            ...flattenRsiTelemetry(rsiSnapshot),
            ...flattenTrendTelemetry(trendSnapshot),
            ...flattenAdvancedMarketTelemetry(advancedSnapshot),
            ...flattenEntryTelemetry(etSnapshot),
            _bounceFromLowVal: undefined,
          };
          const enrichedTrade = buildBatchResearchTrade({
            baseTrade:     entry,
            entryTelemetry,
            marketContext: entryMarketContext,
            marketRegime:  entryRegimeSnapshot,
            computedAt:    Date.now(),
          });

          // Spec §5/§23: builder is the sole research authority. Runtime storage
          // keeps the flattened truth and drops nested duplicate forensic payloads.
          return compactLongTradeForRuntime(enrichedTrade);
        }));
      });
    });

    return {
      createdCount: newEntries.length,
      entryIds: newEntries.map(e => e.id),
      setId,
      run: effectiveRun,
      reason: null,
    };
  }, [loserTickers, gainerTickers, samples, lev, holdMs, fundingMap, run, klinesMap, setSessionMap, fetchBtcMarketContext, fetchMarketRegime, refreshSessionHealth, recordOiSnapshot]);

  const startBalancedSet = useCallback(async (startOptions = {}) => {
    const options = normalizeStartSetOptions(startOptions);
    const mixedOptions = {
      ...options,
      targetBucket: "MIXED_25_25",
      source: options.source === "MANUAL_SET" ? "MIXED_25_25" : options.source,
    };
    const loserResult  = await startBucketSet("TOP_LOSER_LONGS",  mixedOptions);
    const gainerResult = await startBucketSet("TOP_GAINER_LONGS", mixedOptions);
    const createdCount = (loserResult.createdCount ?? 0) + (gainerResult.createdCount ?? 0);
    return {
      createdCount,
      entryIds: [...(loserResult.entryIds ?? []), ...(gainerResult.entryIds ?? [])],
      setId: loserResult.setId ?? gainerResult.setId ?? null,
      run: loserResult.run ?? gainerResult.run ?? null,
      reason: createdCount ? null : `${loserResult.reason ?? "NO_LOSERS"}/${gainerResult.reason ?? "NO_GAINERS"}`,
      loserResult,
      gainerResult,
    };
  }, [startBucketSet]);

  // Keep the autorun cycle starter synced after all start paths exist.
  useEffect(() => {
    startSetRef.current = (options = {}) => {
      const targetBucket = normalizeAutoRunTargetBucket(options?.targetBucket);
      if (targetBucket === "MIXED_25_25") return startBalancedSet(options);
      return targetBucket === "TOP_GAINER_LONGS"
        ? startBucketSet("TOP_GAINER_LONGS", options)
        : startBucketSet("TOP_LOSER_LONGS", options);
    };
  }, [startBalancedSet, startBucketSet]);

  // ── Auto-run controls ────────────────────────────────────────────────────────
  const startAutoRun = useCallback(async (targetBucket = "TOP_LOSER_LONGS") => {
    if (autoRunIsActive(autoRunRef.current)) return;
    const bucket = normalizeAutoRunTargetBucket(targetBucket);
    const autoRunId = createAutoRunId();
    const baseRun = normalizeRunValue(run, 1);
    const currentCycle = 1;
    const ar = {
      id:             autoRunId,
      targetBucket:   bucket,
      completedRuns: 0,
      maxRuns:       20,
      phase:         "starting",
      phaseStart:    Date.now(),
      baseRun,
      currentRun:    baseRun,
      currentCycle,
      currentEntryIds: [],
      currentSetId:  null,
      runDurationMs: holdMs,
      cooldownMs:    getAutoRunCooldownMs(holdMs),
      stoppedReason: null,
    };
    autoRunRef.current = ar;
    setAutoRun(ar);
    setRun(baseRun);

    let result;
    try {
      const startOptions = {
        targetBucket: bucket,
        runOverride: baseRun,
        source: "AUTO_RUN",
        autoRunId,
        autoRunCycle: currentCycle,
      };
      result = bucket === "MIXED_25_25"
        ? await startBalancedSet(startOptions)
        : bucket === "TOP_GAINER_LONGS"
          ? await startBucketSet("TOP_GAINER_LONGS", startOptions)
          : await startBucketSet("TOP_LOSER_LONGS", startOptions);
    } catch (err) {
      result = { createdCount: 0, entryIds: [], setId: null, reason: "START_SET_FAILED" };
    }

    const current = autoRunRef.current;
    if (!current || current.id !== autoRunId || current.phase !== "starting") return;

    if (!result?.createdCount) {
      const doneState = {
        ...current,
        phase: "done",
        stoppedReason: result?.reason ?? "AUTO_RUN_NO_ENTRIES",
      };
      autoRunRef.current = doneState;
      setAutoRun(doneState);
      return;
    }

    const running = {
      ...current,
      phase: "running",
      phaseStart: Date.now(),
      currentEntryIds: result.entryIds ?? [],
      currentSetId: result.setId ?? null,
    };
    autoRunRef.current = running;
    setAutoRun(running);
  }, [startBalancedSet, startBucketSet, run, holdMs]);

  const stopAutoRun = useCallback(() => {
    autoRunRef.current = null;
    setAutoRun(null);
    toast("Auto-run stopped.", { tone: "warn" });
  }, [toast]);

  // ── Watchlist ────────────────────────────────────────────────────────────────
  const addWatch = ticker => {
    if (watchlist.find(w => w.symbol === ticker.symbol)) return;
    setWatchlist(prev => [...prev, {
      symbol:       ticker.symbol,
      addedAt:      Date.now(),
      currentPrice: parseFloat(ticker.lastPrice),
      change24h:    parseFloat(ticker.priceChangePercent),
      funding:      fundingMap[ticker.symbol] ?? null,
    }]);
  };
  const removeWatch = sym => setWatchlist(prev => prev.filter(w => w.symbol !== sym));

  // ── Manual close ─────────────────────────────────────────────────────────────
  const manualClose = (id, reason) => {
    setSamples(prev => prev.map(s => {
      if (s.id !== id) return s;
      const finalPnlPct = parseFloat(((s.currentPrice - s.entryPrice) / s.entryPrice * 100 * s.leverage).toFixed(2));
      const btcPrice = getLatestBtcPrice(s.btcCurrentPrice ?? s.btcPrice ?? null);
      const closedAt = Date.now();
      return finalizeClosedSample(
        { ...s, btcCurrentPrice: btcPrice },
        CLOSE_REASON.MANUAL_CLOSE,
        finalPnlPct,
        {
          closedAt,
          btcExitPrice: btcPrice,
          finalPriceTimestamp: s.lastPriceTimestamp ?? closedAt,
          finalPriceSource: s.lastPriceSource ?? "MANUAL_CURRENT_PRICE",
          closeTriggerSource: "MANUAL_CLOSE",
          closeExecutionMechanism: CLOSE_EXECUTION_MECHANISM.MANUAL,
          manualCloseReason: reason ?? null,
        },
      );
    }));
    setCloseModal(null);
  };

  // ── Notes ────────────────────────────────────────────────────────────────────
  const saveNote = id => {
    setSamples(prev => prev.map(s => s.id === id ? { ...s, notes: noteText } : s));
    setNoteEdit(null);
  };

  // ── Export helpers (canonical schema — no manual CSV_COLS) ──────────────────
  const dlCSV = (src, name) => {
    try {
      downloadBlob(buildLongTradeCsvBlob(src), name);
      return true;
    } catch (err) {
      toast(`CSV export failed: ${err?.message ?? String(err)}`, { tone: "warn" });
      return false;
    }
  };
  const dlJSON = (src, name) => {
    try {
      downloadBlob(buildLongTradeJsonBlob(src), name);
      return true;
    } catch (err) {
      toast(`JSON export failed: ${err?.message ?? String(err)}`, { tone: "warn" });
      return false;
    }
  };

  const exportCSV  = () => { if (dlCSV(rankedSamples,  `longlab_all_${Date.now()}.csv`))  toast("Compact CSV exported.", { tone: "info" }); };
  const exportJSON = () => { if (dlJSON(rankedSamples, `longlab_all_${Date.now()}.json`)) toast("Compact JSON exported.", { tone: "info" }); };

  // ── Derived state ────────────────────────────────────────────────────────────
  const rankedSamples = useMemo(() => {
    const outcomeEnriched = samples.map(s => {
      if (s.closed !== true) return s;
      return {
        ...s,
        ...flattenPostFee10OutcomeAssessment(calculatePostFee10OutcomeAssessment(s)),
      };
    });
    return assignRunBestNormRanksLong(assignAllPostFee10WinnerRanks(outcomeEnriched));
  }, [samples]);

  const allRuns = useMemo(() => [...new Set(
    rankedSamples
      .map(s => normalizeRunValue(s.run, null))
      .filter(v => v != null),
  )].sort((a,b)=>a-b), [rankedSamples]);
  const exportBatches = useMemo(() => buildLongBatchDescriptors(rankedSamples), [rankedSamples]);
  const selectedExportBatch = useMemo(() =>
    exportBatches.find(batch => batch.id === exportBatchId) ?? exportBatches[0] ?? null,
  [exportBatches, exportBatchId]);
  const selectedExportBatchTrades = useMemo(() =>
    selectedExportBatch ? selectLongBatchTrades(rankedSamples, selectedExportBatch) : [],
  [rankedSamples, selectedExportBatch]);
  const selectedExportBatchTradeCount = selectedExportBatchTrades.length;

  useEffect(() => {
    if (!exportBatches.length) {
      if (exportBatchId) setExportBatchId("");
      return;
    }
    if (!exportBatches.some(batch => batch.id === exportBatchId)) {
      setExportBatchId(exportBatches[0].id);
    }
  }, [exportBatches, exportBatchId]);

  const exportSelectedBatchAnalysis = useCallback(async event => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!selectedExportBatch || BATCH_EXPORT_BUSY_PHASES.includes(batchExportState.phase)) return;
    setBatchExportState({ phase: "SNAPSHOTTING", percent: 2, error: null });
    try {
      // Export an immutable snapshot of the selected 20-run batch only. Passing
      // the full historical store to a Worker can clone hundreds of megabytes,
      // exhaust the renderer, reload the tab, and terminate the live run.
      const result = await exportLongBatchAnalysisZip({
        trades: selectedExportBatchTrades,
        descriptor: selectedExportBatch,
        sideFilter: runSideFilter,
        onProgress: progress => setBatchExportState({ ...progress, error: null }),
      });
      toast(`Analysis ZIP exported: ${selectedExportBatch.runCount} runs · ${result.batchSummary.tradeCount} trades.`, { tone: "info" });
      setTimeout(() => setBatchExportState({ phase: "IDLE", percent: 0, error: null }), 2_500);
    } catch (error) {
      setBatchExportState({ phase: "ERROR", percent: 0, error: error?.message ?? String(error) });
      toast(`Batch export failed: ${error?.message ?? error}`, { tone: "warn" });
    }
  }, [selectedExportBatch, selectedExportBatchTrades, batchExportState.phase, runSideFilter, toast]);
  const filtered = useMemo(() =>
    filterRun === "all" ? rankedSamples : rankedSamples.filter(s => sameRunValue(s.run, filterRun)),
  [rankedSamples, filterRun]);

  useEffect(() => {
    if (!rankedSamples.length) return;
    const runJobs = allRuns.flatMap(r => {
      const rs = rankedSamples.filter(s => sameRunValue(s.run, r));
      return RUN_SIDE_FILTERS.map(side => ({
        label: `run:${r}:${side.id}`,
        rs: filterSamplesByRunSide(rs, side.id),
      }));
    });
    const aggregateJobs = RUN_SIDE_FILTERS.map(side => ({
      label: `all:${side.id}`,
      rs: filterSamplesByRunSide(rankedSamples, side.id),
    }));
    const jobs = [
      ...runJobs,
      ...aggregateJobs,
    ]
      .map(job => ({ ...job, key: btcRunCacheKey(job.label, job.rs), bounds: runTimeBounds(job.rs) }))
      .filter(job => {
        if (!job.key || !job.bounds) return false;
        if (job.rs.some(s => !s.closed)) return false;
        if (runBtcMove(job.rs).known) return false;
        return !btcRunCache[job.key];
      })
      .slice(0, 8);

    if (!jobs.length) return;

    setBtcRunCache(prev => {
      const next = { ...prev };
      jobs.forEach(job => {
        next[job.key] = { loading: true };
      });
      return next;
    });

    jobs.forEach(job => {
      Promise.all([fetchBtcPriceAt(job.bounds.start), fetchBtcPriceAt(job.bounds.end)])
        .then(([startPrice, endPrice]) => {
          setBtcRunCache(prev => ({
            ...prev,
            [job.key]: startPrice && endPrice
              ? { known: true, startPrice, endPrice }
              : { known: false, error: "BTC_PRICE_NOT_FOUND" },
          }));
        })
        .catch(() => {
          setBtcRunCache(prev => ({
            ...prev,
            [job.key]: { known: false, error: "BTC_BACKFILL_FAILED" },
          }));
        });
    });
  }, [allRuns, rankedSamples, btcRunCache]);

  const activeSamples = filtered.filter(s => !s.closed);
  const closedSamples = filtered.filter(s => s.closed);
  // Closed records can legitimately be FINALIZATION_FAILED / incomplete. They remain
  // visible, but analytics must only consume finite PnL values.
  const closedPnlSamples = useMemo(() => closedSamples.filter(hasFiniteClosedPnl), [closedSamples]);

  const wins    = closedPnlSamples.filter(s => Number(s.finalPnlPct) > 0);
  const losses  = closedPnlSamples.filter(s => Number(s.finalPnlPct) <= 0);
  const winRate = closedPnlSamples.length ? wins.length/closedPnlSamples.length*100 : 0;
  const avgPnlLev  = closedPnlSamples.length ? closedPnlSamples.reduce((sum,x)=>sum+Number(x.finalPnlPct),0)/closedPnlSamples.length : 0;
  const normEligible = closedPnlSamples.filter(s => finiteNumberOrNull(s.leverage) > 0);
  const avgPnlNorm = normEligible.length ? normEligible.reduce((sum,x)=>sum+Number(x.finalPnlPct)/Number(x.leverage),0)/normEligible.length : 0;

  const cleanSamples = useMemo(() =>
    closedPnlSamples.filter(s => s.strategyResearchEligible !== false && !s.isStale && !s.isInvalidMarket),
  [closedPnlSamples]);

  const icResults = useMemo(() => {
    const BOUNCE_ENC = { FRESH_BREAKDOWN:0, NEAR_LOW_POSSIBLE_BOUNCE:1, BOUNCED_AND_REJECTING:2, BOUNCE_CONTINUING:3 };
    const GRADE_ENC  = { A:0, B:1, C:2, D:3, F:4 };
    const base = cleanIcOnly ? cleanSamples : closedPnlSamples;
    const closedEnriched = base.map(s => ({
      ...s,
      bounceContextNum:    s.bounceContext ? (BOUNCE_ENC[s.bounceContext] ?? null) : null,
      entryTimingGradeNum: s.entryTiming?.entryTimingGrade ? (GRADE_ENC[s.entryTiming.entryTimingGrade] ?? null) : null,
    }));
    return IC_SIGNALS.map(sig => {
      const pairs = closedEnriched
        .map(s => [finiteNumberOrNull(s[sig.key]), finiteNumberOrNull(s.finalPnlPct)])
        .filter(([x, y]) => x != null && y != null);
      const ic = pairs.length >= 3 ? pearson(pairs.map(p=>p[0]), pairs.map(p=>p[1])) : null;
      return { ...sig, ic, n: pairs.length };
    }).sort((a,b) => {
      if (a.ic===null && b.ic===null) return 0;
      if (a.ic===null) return 1; if (b.ic===null) return -1;
      return Math.abs(b.ic) - Math.abs(a.ic);
    });
  }, [closedPnlSamples, cleanSamples, cleanIcOnly]);

  const equityCurve = useMemo(() => {
    let cum = 0;
    return [...closedPnlSamples].sort((a,b)=>(a.closedAt ?? 0)-(b.closedAt ?? 0)).map((sample,i) => {
      const pnl = Number(sample.finalPnlPct);
      cum += pnl;
      return { n:i+1, equity:safeRound(cum, 2), pnl:safeRound(pnl, 2), sym:safeSymbol(sample.symbol) };
    });
  }, [closedPnlSamples]);

  const scatterData = useMemo(() =>
    closedPnlSamples
      .map(s => ({ x: finiteNumberOrNull(s.change24h), y: Number(s.finalPnlPct), sym: safeSymbol(s.symbol) }))
      .filter(point => point.x != null),
  [closedPnlSamples]);

  const rankBuckets = useMemo(() =>
    [{label:"Top 1–5",min:1,max:5},{label:"Rank 6–15",min:6,max:15},{label:"Rank 16–30",min:16,max:30}]
    .map(b => {
      const g   = closedPnlSamples.filter(s => s.entryRank>=b.min && s.entryRank<=b.max);
      const wr  = g.length ? g.filter(s=>s.finalPnlPct>0).length/g.length*100 : null;
      const avg = g.length ? g.reduce((s,x)=>s+x.finalPnlPct,0)/g.length : null;
      return { ...b, n:g.length, wr, avg };
    }),
  [closedPnlSamples]);

  const hourData = useMemo(() => {
    const m = {};
    closedPnlSamples.forEach(s => {
      const h = s.utcHour;
      if (!m[h]) m[h] = {w:0,n:0};
      m[h].n++; if (s.finalPnlPct > 0) m[h].w++;
    });
    return Object.entries(m).map(([h,v])=>({h:+h,wr:v.n?v.w/v.n*100:0,n:v.n})).sort((a,b)=>a.h-b.h);
  }, [closedPnlSamples]);

  const squeezeCandidates = useMemo(() =>
    loserTickers.filter(t => (fundingMap[t.symbol]??0) < -0.05)
           .sort((a,b) => (fundingMap[a.symbol]??0)-(fundingMap[b.symbol]??0))
           .slice(0,10),
  [loserTickers, fundingMap]);

  const earlyKillBanners = useMemo(() => {
    const setIds = [...new Set(samples.filter(s=>s.setId).map(s=>s.setId))];
    return setIds.map(sid => ({
      setId: sid,
      count: samples.filter(s =>
        s.setId === sid && normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.STOP_LOSS &&
        (s.closedAt ?? 0) - s.entryTime <= 900_000
      ).length,
    })).filter(b => b.count >= 5);
  }, [samples]);

  const profitLockStats = useMemo(() => {
    const activated    = closedPnlSamples.filter(s => s.profitLockStrategyActive === true || s.profitLockActive === true);
    const exits        = closedPnlSamples.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.PROFIT_LOCK);
    const savedFromSL  = exits.filter(s => s.finalPnlPct > -(SL_PCT * s.leverage));
    const totalSaved   = savedFromSL.reduce((sum,s) => sum + (s.finalPnlPct - (-(SL_PCT * s.leverage))), 0);
    const missedOpportunities = closedPnlSamples.filter(s =>
      s.finalPnlPct < 0 && (s.mfe ?? 0) >= 1.0 && normalizeLongCloseReason(s.closeReason) !== CLOSE_REASON.PROFIT_LOCK
    );
    return { activated: activated.length, exits: exits.length,
      savedFromSL: savedFromSL.length, totalSaved: safeRound(totalSaved, 2),
      missedOpportunities: missedOpportunities.length };
  }, [closedPnlSamples]);

  const alreadyIn   = sym => samples.some(s => s.symbol===sym && !s.closed);
  const inWatchlist = sym => watchlist.some(w => w.symbol===sym);

  const allActive   = rankedSamples.filter(s => !s.closed);
  const allClosed   = rankedSamples.filter(s => s.closed);
  const postFee10BySymbol = useMemo(() => {
    const out = {};
    [...rankedSamples]
      .filter(s => s.longPostFee10EntryScore != null)
      .sort((a, b) => (b.entryTime ?? 0) - (a.entryTime ?? 0))
      .forEach(s => {
        const side = sampleRunSide(s).toUpperCase();
        const sideKey = `${side}:${s.symbol}`;
        if (!out[sideKey]) out[sideKey] = s;
        if (!out[s.symbol]) out[s.symbol] = s;
      });
    return out;
  }, [rankedSamples]);
  const postFee10Analytics = useMemo(
    () => buildPostFee10AnalyticsReport(closedPnlSamples),
    [closedPnlSamples],
  );
  const isAutoRunActive = autoRunIsActive(autoRun);
  const availableStartSlots = Math.max(0, MAX_SAMPLES - allActive.length);
  const loserActiveCount  = countActiveByParentBucket(allActive, "TOP_LOSER_LONGS");
  const gainerActiveCount = countActiveByParentBucket(allActive, "TOP_GAINER_LONGS");
  const loserBucketSlots  = getAvailableBucketSlots(samples, "TOP_LOSER_LONGS");
  const gainerBucketSlots = getAvailableBucketSlots(samples, "TOP_GAINER_LONGS");
  const canStartManualLoserEntry = !isAutoRunActive && loserBucketSlots > 0;
const canStartLoserAutoRun = Boolean(loserTickers.length) && !isAutoRunActive && loserBucketSlots > 0;
const canStartLoserSet  = Boolean(loserTickers.length)  && !isAutoRunActive && loserBucketSlots  > 0;
  const canStartGainerSet = Boolean(gainerTickers.length) && !isAutoRunActive && gainerBucketSlots > 0;
  const canStartGainerAutoRun = canStartGainerSet;
  const canStartBalanced =
    !isAutoRunActive &&
    availableStartSlots >= MIXED_BUCKET_TARGET * 2 &&
    loserBucketSlots >= MIXED_BUCKET_TARGET &&
    gainerBucketSlots >= MIXED_BUCKET_TARGET &&
    loserTickers.length >= MIXED_BUCKET_TARGET &&
    gainerTickers.length >= MIXED_BUCKET_TARGET;
  const portUnrealized = allActive.reduce((sum, s) => {
    const priceUp = (s.currentPrice - s.entryPrice) / s.entryPrice * 100;
    return sum + priceUp * s.leverage;
  }, 0);
  const portRealized   = allClosed.reduce((sum, s) => sum + (s.finalPnlPct ?? 0), 0);
  const portNet        = portUnrealized + portRealized;

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={S.header}>
        {/* Left: Branding + status pips */}
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={S.logo} className="logo-glow">
            <span style={{fontSize:14,lineHeight:1}}>▲</span>
          </div>
          <div>
            <div style={S.title}>
              LONG LAB{" "}
              <span className="shimmer-text" style={{fontSize:11,fontWeight:700,letterSpacing:1}}>v3</span>
            </div>
            <div style={S.subtt}>Binance USDM · 24h Losers · Signal Research</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:4}}>
            <Pip color={storageState==='LOAD_FAILED'?"#ff4444":storageWarn?"#ffaa00":storageOk?"#4488ff":"#7888c0"} label={storageState==='LOAD_FAILED'?"STOR ERR":storageWarn?"STOR WRN":storageOk?"SAVED":"..."} />
            <Pip color="#00ff88" pulse label="LIVE" />
          </div>
        </div>

        {/* Right: Stats, portfolio summary, actions */}
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
          <Chip>L:{loserActiveCount}/{MIXED_BUCKET_TARGET} · G:{gainerActiveCount}/{MIXED_BUCKET_TARGET}</Chip>
          <Chip>Run #{run}</Chip>

          {samples.length > 0 && (
            <div className="header-net-glow" style={{display:"flex",gap:6,alignItems:"center",background:"#0a0a17",border:"1px solid #181832",borderRadius:4,padding:"3px 10px",fontFamily:"Space Mono",fontSize:8}}>
              {allActive.length > 0 && <span style={{color:portUnrealized>=0?"#00ff88":"#ff4455",fontWeight:700}}>LIVE {fPct(portUnrealized)}</span>}
              {allActive.length > 0 && allClosed.length > 0 && <span style={{color:"#2a2a44"}}>│</span>}
              {allClosed.length > 0 && <span style={{color:portRealized>=0?"#55cc88":"#cc4455"}}>REAL {fPct(portRealized)}</span>}
              {(allActive.length > 0 || allClosed.length > 0) && <span style={{color:"#2a2a44"}}>│</span>}
              <span style={{color:portNet>=0?"#00ff88":"#ff4455",fontWeight:800,letterSpacing:0.5}}>NET {fPct(portNet)}</span>
              {sessionHealthState?.effectiveState && sessionHealthState.effectiveState !== "SESSION_WARMUP" && (
                <>
                  <span style={{color:"#2a2a44"}}>│</span>
                  <span style={{
                    color: sessionHealthState.effectiveState === "SESSION_FULL_PASS" ? "#00ff88"
                         : sessionHealthState.effectiveState === "SESSION_CHECK_STRICT" ? "#ffaa44"
                         : sessionHealthState.effectiveState === "SESSION_RECOVERY_STRICT" ? "#ff8833"
                         : sessionHealthState.effectiveState === "SESSION_FULL_BLOCK_CANDIDATE" ? "#ff4455"
                         : "#8899cc",
                    fontSize: 8, fontFamily: "'Space Mono', monospace",
                  }}>
                    {sessionHealthState.effectiveState.replace("SESSION_", "").replace(/_/g, " ")}
                  </span>
                </>
              )}
            </div>
          )}


          <span style={{color:"#16162a",fontSize:12,userSelect:"none"}}>│</span>

          {isAutoRunActive && (
            <Btn onClick={stopAutoRun} c="#aa88ff">
              AUTO {autoRunTargetLabel(autoRun.targetBucket)} {autoRun.phase.toUpperCase()} {autoRun.completedRuns}/{autoRun.maxRuns}
            </Btn>
          )}
          <Btn onClick={()=>setRun(r=>r+1)} disabled={isAutoRunActive}>+ RUN</Btn>
          <Btn onClick={exportCSV}  c="#00ff88" disabled={!samples.length}>↓ CSV</Btn>
          <Btn onClick={exportJSON} c="#4488ff" disabled={!samples.length}>↓ JSON</Btn>
          <Btn onClick={()=>fetchData()} disabled={loading}>⟳</Btn>
          <RateLimitBadge rl={rl} />
        </div>
      </div>

      {/* Controls */}
      <div style={S.controls}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <Lbl>LEV</Lbl>
          {LEV_OPTS.map(l => {
            const c = l === 1 ? "#00e5ff" : l >= 10 ? "#ff6655" : "#ffa500";
            return <TBtn key={l} on={lev===l} c={c} disabled={isAutoRunActive} onClick={()=>setLev(l)}>{l}×</TBtn>;
          })}
        </div>
        <span style={{color:"#252545",fontSize:12,userSelect:"none",margin:"0 2px"}}>│</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <Lbl>VOL</Lbl>
          {[{l:"5M",v:5e6},{l:"10M",v:10e6},{l:"50M",v:50e6}].map(o =>
            <TBtn key={o.v} on={minVol===o.v} c="#4488ff" disabled={isAutoRunActive} onClick={()=>setMinVol(o.v)}>${o.l}</TBtn>)}
        </div>
        <span style={{color:"#252545",fontSize:12,userSelect:"none",margin:"0 2px"}}>│</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <Lbl>HOLD</Lbl>
          {[
            {l:"5m",  v:300_000},
            {l:"15m", v:900_000},
            {l:"30m", v:1_800_000},
            {l:"1h",  v:3_600_000},
            {l:"2h",  v:7_200_000},
            {l:"3h",  v:10_800_000},
          ].map(o => <TBtn key={o.v} on={holdMs===o.v} c="#4488ff" disabled={isAutoRunActive} onClick={()=>setHoldMs(o.v)}>{o.l}</TBtn>)}
        </div>
        <span style={{color:"#252545",fontSize:12,userSelect:"none",margin:"0 2px"}}>│</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <TBtn on={trailOn} c="#00ff88" disabled={isAutoRunActive} onClick={()=>setTrailOn(t=>!t)}>TRAIL {TRAIL_PCT}%</TBtn>
          <TBtn on={soundOn} c="#888"    onClick={()=>setSoundOn(t=>!t)}>SND</TBtn>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,fontFamily:"Space Mono",fontSize:9,letterSpacing:0.5}}>
          <span style={{color:"#6878a0"}}>SL +{SL_PCT}% · TP −{TP_PCT}% · TRAIL {TRAIL_PCT}%</span>
          <span style={{color:"#303050"}}>│</span>
          <span style={{color:"#ff6655",fontWeight:700}}>RISK {(SL_PCT*lev).toFixed(lev===1?1:0)}%</span>
          <span style={{color:"#303050"}}>│</span>
          <span style={{color:"#00ff88",fontWeight:700}}>RWD {(TP_PCT*lev).toFixed(lev===1?1:0)}%</span>
          {lev === 1 && <span style={{color:"#00e5ff",fontSize:8,background:"#001a22",padding:"1px 5px",borderRadius:3,border:"1px solid #00e5ff33"}}>SAFE</span>}
          {lev >= 10 && <span style={{color:"#ff6655",fontSize:8,background:"#1a0000",padding:"1px 5px",borderRadius:3,border:"1px solid #ff665533"}}>HIGH RISK</span>}
        </div>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav role="tablist" aria-label="Main navigation" style={S.tabs}>
        {[
          { group: "DISCOVER", tabs: [
            { id:"losers",  label:`LOSERS (${loserTickers.length})` },
            { id:"gainers", label:`GAINERS (${gainerTickers.length})` },
          ]},
          { group: "TRADE", tabs: [
            { id:"samples", label:`SAMPLES (${activeSamples.length}A·${closedSamples.length}C)` },
            { id:"runs",    label:`RUNS (${allRuns.length})` },
          ]},
          { group: "ANALYZE", tabs: [
            { id:"filters",  label:"FILTERS" },
          ]},
          { group: "SHADOW", tabs: [
            { id:"shadow-long",   label:"SHADOW" },
          ]},
          { group: "COST", tabs: [
            { id:"fees", label:"FEES" },
          ]},
        ].map((grp, gi) => (
          <span key={grp.group} style={{display:"flex",alignItems:"stretch",gap:0}}>
            {gi > 0 && <span aria-hidden="true" style={{color:"#1e2038",fontSize:12,userSelect:"none",alignSelf:"center",margin:"0 4px"}}>│</span>}
            <span style={S.navGroup}>{grp.group}</span>
            {grp.tabs.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab===t.id}
                id={`tab-${t.id}`}
                aria-controls={`panel-${t.id}`}
                onClick={()=>setTabAndPersist(t.id)}
                className={`tab-btn${tab===t.id?" tab-active":""}`}
                style={{
                  ...S.tab,
                  borderBottom: tab===t.id ? "2px solid #00ff88" : "2px solid transparent",
                  color:         tab===t.id ? "#00ff88"           : "#8094bc",
                }}
              >{t.label}</button>
            ))}
          </span>
        ))}
      </nav>

      {/* Content */}
      <div style={S.content} role="tabpanel" aria-labelledby={`tab-${tab}`} id={`panel-${tab}`}>
        {error && <div style={{color:"#ff4455",fontFamily:"Space Mono",fontSize:11,padding:"6px 0",marginBottom:8}}>{error}</div>}

        {/* â•â•â• LOSERS â•â•â• */}
        {tab === "losers" && (
          <div>
            {(() => {
              const sess = Object.values(sessionMap).sort((a,b)=>b.timestamp-a.timestamp)[0];
              if (!sess || Date.now() - sess.timestamp > 30*60_000) return null;
              const c = sess.quality==="LONG_TREND_FRIENDLY"?"#00ff88":sess.quality==="BROAD_MARKET_HEADWIND"?"#ff4455":sess.quality==="HIGH_CHOP_CAUTION"?"#ffa500":"#a8a8c8";
              return (
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",
                  background:"#09090f",border:`1px solid ${c}44`,borderRadius:3,marginBottom:8}}>
                  <span style={{fontSize:8,letterSpacing:2,fontWeight:700,color:c}}>{sess.quality}</span>
                  <span style={{fontSize:8,color:"#8899cc",fontFamily:"Space Mono"}}>BTC 1h {fPct(sess.btc1h ?? 0)} · ETH 1h {fPct(sess.eth1h ?? 0)}</span>
                </div>
              );
            })()}
            {earlyKillBanners.filter(b => !dismissedKillBanners.has(b.setId)).map(b => (
              <div key={b.setId} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",
                background:"#0d0003",border:"1px solid #ff445533",borderRadius:3,marginBottom:6}}>
                <span style={{color:"#ff6655",fontSize:8,fontWeight:700}}>
                  ⚠ {b.count} early SL hits in first 15m — session may be hostile
                </span>
                <button
                  onClick={() => setDismissedKillBanners(prev => new Set([...prev, b.setId]))}
                  style={{marginLeft:"auto",background:"none",border:"none",color:"#ff4455",cursor:"pointer",fontSize:11,lineHeight:1,padding:"0 2px",opacity:0.7}}
                >×</button>
              </div>
            ))}
            {squeezeCandidates.length > 0 && (
              <div style={S.squeezeBanner}>
                <span style={{color:"#ff4455",fontSize:8,letterSpacing:2,fontWeight:700,marginRight:8,flexShrink:0}}>⚡ SQUEEZE FLAGS</span>
                {squeezeCandidates.map(t => (
                  <div key={t.symbol} style={S.squeezeChip}>
                    <span style={{color:"#fff",fontWeight:700,fontSize:11}}>{t.symbol.replace("USDT","")}</span>
                    <span style={{color:"#ff7788",fontSize:9}}>{fPct(fundingMap[t.symbol]??0)}</span>
                  </div>
                ))}
              </div>
            )}

            {watchlist.length > 0 && (
              <div style={{marginBottom:10}}>
                <div style={S.secLbl}>WATCHLIST</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {watchlist.map(w => (
                    <div key={w.symbol} style={S.watchChip}>
                      <span style={{color:"#fff",fontWeight:700}}>{w.symbol.replace("USDT","")}</span>
                      <span style={{color:w.change24h<0?"#ff4455":"#00ff88",fontSize:10}}>{fPct(w.change24h)}</span>
                      {w.funding!=null && <span style={{color:"#9aabcc",fontSize:9}}>f:{fPct(w.funding)}</span>}
                      <button
                        style={{...S.actBtn,color:"#00ff88",borderColor:"#0a1a0a",fontSize:8,opacity:canStartManualLoserEntry?1:0.35}}
                        disabled={!canStartManualLoserEntry}
                        onClick={()=>{const t=loserTickers.find(x=>x.symbol===w.symbol);if(t)addSample(t);}}>→LONG</button>
                      <button style={S.rmBtn} onClick={()=>removeWatch(w.symbol)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loading && !loserTickers.length && (
              <div style={{color:"#00ff88",fontFamily:"Space Mono",fontSize:12,padding:"30px 0"}}>
                Fetching Binance data<span className="blink">_</span>
              </div>
            )}

            {/* ── Auto-run status banner ─────────────────────────────────── */}
            {autoRun && autoRun.phase !== "done" && (() => {
              const elapsed    = now - autoRun.phaseStart;
              const isStarting = autoRun.phase === "starting";
              const isRunning  = autoRun.phase === "running";
              const phaseDur   = isStarting ? 0 : isRunning ? autoRun.runDurationMs : autoRun.cooldownMs;
              const remaining = Math.max(0, phaseDur - elapsed);
              const remainingSeconds = Math.max(0, Math.ceil(remaining / 1000));
              const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
              const ss = String(remainingSeconds % 60).padStart(2, "0");
              const c  = isStarting ? "#aa88ff" : isRunning ? "#00ff88" : "#ffa500";
              const displayRun = Math.min(autoRun.maxRuns, autoRun.completedRuns + (autoRun.phase === "cooldown" ? 0 : 1));
              return (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 12px",
                  background: isRunning ? "#020e07" : isStarting ? "#080412" : "#0e0800",
                  border:`1px solid ${c}44`,borderRadius:3,marginBottom:8,fontFamily:"Space Mono"}}>
                  <span style={{color:c,fontWeight:900,fontSize:11,letterSpacing:1.5}}>
                    AUTO RUN {autoRunTargetLabel(autoRun.targetBucket)} [{displayRun}/{autoRun.maxRuns}]
                  </span>
                  <span style={{color:c,fontSize:9}}>·</span>
                  <span style={{color:c,fontSize:9,letterSpacing:1}}>{autoRun.phase.toUpperCase()}</span>
                  <span style={{color:"#8899cc",fontSize:9}}>· {isStarting ? "creating entries" : `${mm}:${ss} remaining`}</span>
                  <button onClick={stopAutoRun} style={{
                    marginLeft:"auto",background:"transparent",border:"1px solid #ff445566",
                    color:"#ff4455",padding:"2px 8px",borderRadius:3,cursor:"pointer",
                    fontFamily:"'Syne',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1}}>
                    ■ STOP
                  </button>
                </div>
              );
            })()}
            {autoRun?.phase === "done" && (() => {
              const completed = autoRun.completedRuns ?? 0;
              const stoppedReason = autoRun.stoppedReason;
              const complete = completed >= autoRun.maxRuns && !stoppedReason;
              const c = complete ? "#00ff88" : "#ffa500";
              return (
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",
                background:complete ? "#020e07" : "#0e0800",border:`1px solid ${c}44`,borderRadius:3,marginBottom:8,
                fontFamily:"Space Mono",fontSize:10,color:c}}>
                {complete ? "AUTO RUN COMPLETE" : "AUTO RUN STOPPED"} {autoRunTargetLabel(autoRun.targetBucket)} · {completed}/{autoRun.maxRuns} runs done
                {stoppedReason && <span style={{color:"#c09a50"}}>· {stoppedReason}</span>}
                <button onClick={stopAutoRun} style={{
                  marginLeft:"auto",background:"transparent",border:`1px solid ${c}44`,
                  color:"#8899cc",padding:"2px 8px",borderRadius:3,cursor:"pointer",
                  fontFamily:"'Syne',sans-serif",fontSize:9}}>
                  DISMISS
                </button>
                </div>
              );
            })()}

            {loserTickers.length > 0 && (
              <>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:8,color:"#7aacdc",letterSpacing:2,fontWeight:700}}>TOP {loserTickers.length} LOSERS</span>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    {(!autoRun || autoRun.phase === "done") ? (
                      <button
                        disabled={!canStartLoserAutoRun}
                        onClick={() => startAutoRun("TOP_LOSER_LONGS")}
                        style={{
                          background: "transparent",
                          border:     "1px solid #aa88ff",
                          color:      "#aa88ff",
                          padding:    "6px 14px",
                          borderRadius: 4,
                          cursor:     canStartLoserAutoRun ? "pointer" : "not-allowed",
                          fontFamily: "'Syne',sans-serif",
                          fontSize:   11,
                          fontWeight: 800,
                          letterSpacing: 1,
                          opacity:    canStartLoserAutoRun ? 1 : 0.35,
                          transition: "all 0.15s",
                        }}>
                        ⚙ AUTO RUN {lev}× · 20
                      </button>
                    ) : (
                      <button
                        onClick={stopAutoRun}
                        style={{
                          background: "transparent",
                          border:     "1px solid #ff445566",
                          color:      "#ff4455",
                          padding:    "6px 14px",
                          borderRadius: 4,
                          cursor:     "pointer",
                          fontFamily: "'Syne',sans-serif",
                          fontSize:   11,
                          fontWeight: 800,
                          letterSpacing: 1,
                          transition: "all 0.15s",
                        }}>
                        ■ STOP AUTO
                      </button>
                    )}
                  <button
                    disabled={!canStartLoserSet}
                    onClick={() => startBucketSet("TOP_LOSER_LONGS")}
                    style={{
                      background: canStartLoserSet ? "#ff4455" : "transparent",
                      border:     "1px solid #ff4455",
                      color:      "#fff",
                      padding:    "6px 14px",
                      borderRadius: 4,
                      cursor:     canStartLoserSet ? "pointer" : "not-allowed",
                      fontFamily: "'Syne',sans-serif",
                      fontSize:   10,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      opacity:    canStartLoserSet ? 1 : 0.35,
                      transition: "all 0.15s",
                    }}>
                    ▼ LOSER SET ({loserBucketSlots})
                  </button>
                  <button
                    disabled={!canStartGainerSet}
                    onClick={() => startBucketSet("TOP_GAINER_LONGS")}
                    style={{
                      background: canStartGainerSet ? "#00cc66" : "transparent",
                      border:     "1px solid #00cc66",
                      color:      "#fff",
                      padding:    "6px 14px",
                      borderRadius: 4,
                      cursor:     canStartGainerSet ? "pointer" : "not-allowed",
                      fontFamily: "'Syne',sans-serif",
                      fontSize:   10,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      opacity:    canStartGainerSet ? 1 : 0.35,
                      transition: "all 0.15s",
                    }}>
                    ▲ GAINER SET ({gainerBucketSlots})
                  </button>
                  <button
                    disabled={!canStartBalanced}
                    onClick={() => startAutoRun("MIXED_25_25")}
                    style={{
                      background: canStartBalanced ? "#4488ff" : "transparent",
                      border:     "1px solid #4488ff",
                      color:      "#fff",
                      padding:    "6px 14px",
                      borderRadius: 4,
                      cursor:     canStartBalanced ? "pointer" : "not-allowed",
                      fontFamily: "'Syne',sans-serif",
                      fontSize:   10,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      opacity:    canStartBalanced ? 1 : 0.35,
                      transition: "all 0.15s",
                    }}>
                    ⚙ MIXED {MIXED_BUCKET_TARGET}+{MIXED_BUCKET_TARGET} · {lev}× · 20
                  </button>
                  </div>
                </div>
                <div style={{ margin: "0 -20px" }}>
                  <LiveTickerTable
                    cols={LOSER_TICKER_COLS}
                    tickers={loserTickers}
                    ctx={{
                      klinesMap, fundingMap,
                      postFee10BySymbol,
                      alreadyIn, inWatchlist, addWatch, addSample,
                      canStart: canStartManualLoserEntry,
                      bucket: 'TOP_LOSER_LONGS',
                      btnColor: '#00ff88', btnLabel: '↑ LONG',
                      actBtn: S.actBtn,
                      rowBg: i => i < 3 ? `rgba(255,68,85,${0.025-i*0.007})` : 'transparent',
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* â•â•â• GAINERS â•â•â• */}
        {tab === "gainers" && (
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:8,color:"#00cc66",letterSpacing:2,fontWeight:700}}>TOP {gainerTickers.length} GAINERS</span>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                {(!autoRun || autoRun.phase === "done") ? (
                  <button
                    disabled={!canStartGainerAutoRun}
                    onClick={() => startAutoRun("TOP_GAINER_LONGS")}
                    style={{
                      background: "transparent",
                      border:     "1px solid #aa88ff",
                      color:      "#aa88ff",
                      padding:    "6px 14px",
                      borderRadius: 4,
                      cursor:     canStartGainerAutoRun ? "pointer" : "not-allowed",
                      fontFamily: "'Syne',sans-serif",
                      fontSize:   11,
                      fontWeight: 800,
                      letterSpacing: 1,
                      opacity:    canStartGainerAutoRun ? 1 : 0.35,
                      transition: "all 0.15s",
                    }}>
                    ⚙ AUTO RUN {lev}× · 20
                  </button>
                ) : (
                  <button
                    onClick={stopAutoRun}
                    style={{
                      background: "transparent",
                      border:     "1px solid #ff445566",
                      color:      "#ff4455",
                      padding:    "6px 14px",
                      borderRadius: 4,
                      cursor:     "pointer",
                      fontFamily: "'Syne',sans-serif",
                      fontSize:   11,
                      fontWeight: 800,
                      letterSpacing: 1,
                      transition: "all 0.15s",
                    }}>
                    ■ STOP AUTO
                  </button>
                )}
                <button
                  disabled={!canStartLoserSet}
                  onClick={() => startBucketSet("TOP_LOSER_LONGS")}
                  style={{
                    background: canStartLoserSet ? "#ff4455" : "transparent",
                    border:     "1px solid #ff4455",
                    color:      "#fff",
                    padding:    "6px 14px",
                    borderRadius: 4,
                    cursor:     canStartLoserSet ? "pointer" : "not-allowed",
                    fontFamily: "'Syne',sans-serif",
                    fontSize:   10,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    opacity:    canStartLoserSet ? 1 : 0.35,
                    transition: "all 0.15s",
                  }}>
                  ▼ LOSER SET ({loserBucketSlots})
                </button>
                <button
                  disabled={!canStartGainerSet}
                  onClick={() => startBucketSet("TOP_GAINER_LONGS")}
                  style={{
                    background: canStartGainerSet ? "#00cc66" : "transparent",
                    border:     "1px solid #00cc66",
                    color:      "#fff",
                    padding:    "6px 14px",
                    borderRadius: 4,
                    cursor:     canStartGainerSet ? "pointer" : "not-allowed",
                    fontFamily: "'Syne',sans-serif",
                    fontSize:   10,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    opacity:    canStartGainerSet ? 1 : 0.35,
                    transition: "all 0.15s",
                  }}>
                  ▲ GAINER SET ({gainerBucketSlots})
                </button>
                <button
                  disabled={!canStartBalanced}
                  onClick={() => startAutoRun("MIXED_25_25")}
                  style={{
                    background: canStartBalanced ? "#4488ff" : "transparent",
                    border:     "1px solid #4488ff",
                    color:      "#fff",
                    padding:    "6px 14px",
                    borderRadius: 4,
                    cursor:     canStartBalanced ? "pointer" : "not-allowed",
                    fontFamily: "'Syne',sans-serif",
                    fontSize:   10,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    opacity:    canStartBalanced ? 1 : 0.35,
                    transition: "all 0.15s",
                  }}>
                  ⚙ MIXED {MIXED_BUCKET_TARGET}+{MIXED_BUCKET_TARGET} · {lev}× · 20
                </button>
              </div>
            </div>
            <div style={{ margin: "0 -20px" }}>
              <LiveTickerTable
                cols={GAINER_TICKER_COLS}
                tickers={gainerTickers}
                ctx={{
                  klinesMap, fundingMap,
                  postFee10BySymbol,
                  alreadyIn, inWatchlist, addWatch, addSample,
                  canStart: canStartGainerSet,
                  bucket: 'TOP_GAINER_LONGS',
                  btnColor: '#00cc66', btnLabel: '↑ LONG',
                  actBtn: S.actBtn,
                  rowBg: i => i < 3 ? `rgba(0,204,102,${0.025-i*0.007})` : 'transparent',
                }}
              />
            </div>
          </div>
        )}

        {/* â•â•â• SAMPLES â•â•â• */}
        {tab === "samples" && (
          <div>
            {allRuns.length > 1 && (
              <div style={{display:"flex",gap:5,marginBottom:12,alignItems:"center"}}>
                <Lbl>RUN FILTER</Lbl>
                <TBtn on={filterRun==="all"} c="#888" onClick={()=>setFilterRun("all")}>ALL</TBtn>
                {allRuns.map(r => <TBtn key={r} on={filterRun===r} c="#ffa500" onClick={()=>setFilterRun(r)}>#{r}</TBtn>)}
              </div>
            )}
            {filtered.length === 0 && (
              <div style={{color:"#9090c8",fontFamily:"Space Mono",fontSize:11,textAlign:"center",padding:"50px 0"}}>
                No samples yet — go to LOSERS and click ↑ LONG
              </div>
            )}
            {filtered.length > 0 && (
              <div style={{display:"flex",gap:6,marginBottom:10}}>
                {closedSamples.length > 0 &&
                  <Btn onClick={()=>setSamples(prev=>prev.filter(s=>!s.closed))}>Clear closed ({closedSamples.length})</Btn>}
                <Btn c="#ff4455" onClick={()=>{if(confirm("Clear ALL samples?")) setSamples([]);}}>Clear all</Btn>
              </div>
            )}

            {activeSamples.length > 0 && (
              <>
                <div style={S.secLbl}>ACTIVE — {activeSamples.length}</div>
                {activeSamples.map(s => (
                  <ActiveCard key={s.id} s={s} now={now} trailOn={trailOn}
                    onClose={()=>setCloseModal(s)}
                    onRemove={()=>setSamples(prev=>prev.filter(x=>x.id!==s.id))}
                    noteEditing={noteEdit===s.id}
                    noteText={noteEdit===s.id?noteText:""}
                    onEditNote={()=>{setNoteEdit(s.id);setNoteText(s.notes||"");}}
                    setNoteText={setNoteText}
                    saveNote={()=>saveNote(s.id)}
                  />
                ))}
              </>
            )}

            {closedSamples.length > 0 && (
              <>
                <div style={{...S.secLbl,marginTop:20}}>CLOSED — {closedSamples.length}</div>
                {[...closedSamples].reverse().map(s => (
                  <ClosedCard key={s.id} s={s}
                    onRemove={()=>setSamples(prev=>prev.filter(x=>x.id!==s.id))}
                    noteEditing={noteEdit===s.id}
                    noteText={noteEdit===s.id?noteText:""}
                    onEditNote={()=>{setNoteEdit(s.id);setNoteText(s.notes||"");}}
                    setNoteText={setNoteText}
                    saveNote={()=>saveNote(s.id)}
                    onOpenAudit={() => setTab("long-audit")}
                  />
                ))}
              </>
            )}

            {closeModal && (
              <div style={S.overlay} onClick={()=>setCloseModal(null)}>
                <div style={S.modal} onClick={e=>e.stopPropagation()}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:14,marginBottom:10}}>
                    Close {closeModal.symbol.replace("USDT","")}
                    <span style={{color:"#c0c4d8",fontSize:11,fontWeight:400,marginLeft:8}}>
                      {fPct((closeModal.currentPrice-closeModal.entryPrice)/closeModal.entryPrice*100*closeModal.leverage)} live
                    </span>
                  </div>
                  {["Manual - Took Profit","Manual - Invalidated","Manual - Reversed","Manual - Other"].map(r => (
                    <button key={r} className="mBtn" style={S.mBtn} onClick={()=>manualClose(closeModal.id,r)}>{r}</button>
                  ))}
                  <button style={{...S.mBtn,color:"#a0b0d0",marginTop:4}} onClick={()=>setCloseModal(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* â•â•â• RUNS â•â•â• */}
        {tab === "runs" && (() => {
          // Mini metadata for run pills (win-rate dot + trade count)
          const runPillMeta = Object.fromEntries(
            allRuns.map(r => {
              const rrc = rankedSamples.filter(s => sameRunValue(s.run, r) && s.closed && isRunMetricEligibleSample(s));
              const rrw = rrc.filter(s => (s.finalPnlPct ?? 0) > 0);
              const rwr = rrc.length ? rrw.length / rrc.length * 100 : null;
              const cnt = rankedSamples.filter(s => sameRunValue(s.run, r)).length;
              return [r, { wr: rwr, cnt }];
            })
          );
          return (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* ── Sub-nav ── */}
            <div style={{
              display:"flex",alignItems:"stretch",
              background:"linear-gradient(180deg,#0c0c1c 0%,#090910 100%)",
              border:"1px solid #16163a",borderRadius:10,overflow:"hidden",
              boxShadow:"0 4px 20px rgba(0,0,0,0.45)",
            }}>
              {/* RUN selector */}
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",flexWrap:"wrap",flex:1,minWidth:0}}>
                <span style={{fontSize:7,color:"#334477",letterSpacing:3,fontWeight:700,textTransform:"uppercase",marginRight:4,flexShrink:0}}>RUN</span>
                <button onClick={()=>setRunTab("all")} style={{
                  display:"inline-flex",alignItems:"center",gap:5,
                  background:runTab==="all"?"linear-gradient(135deg,#1a2040,#111830)":"transparent",
                  border:`1px solid ${runTab==="all"?"#2244aa":"#1c1c30"}`,
                  borderRadius:6,padding:"4px 12px",cursor:"pointer",
                  fontFamily:"Space Mono,monospace",fontSize:9,fontWeight:700,
                  color:runTab==="all"?"#5599ff":"#556688",
                  boxShadow:runTab==="all"?"0 0 10px #4488ff1a":"none",transition:"all 0.18s",
                }}>
                  ALL
                  {allRuns.length > 0 && <span style={{color:runTab==="all"?"#4488ff55":"#33445566",fontWeight:400,fontSize:8}}>{allRuns.length}</span>}
                </button>
                {allRuns.map(r => {
                  const meta = runPillMeta[r] ?? {};
                  const dot  = meta.wr == null ? "#2a3a55" : meta.wr >= 50 ? "#00ff88" : "#ff4455";
                  const active = runTab === r;
                  return (
                    <button key={r} onClick={()=>setRunTab(r)} style={{
                      display:"inline-flex",alignItems:"center",gap:5,
                      background:active?"linear-gradient(135deg,#1c1a2e,#110f22)":"transparent",
                      border:`1px solid ${active?"#ffa50033":"#1c1c30"}`,
                      borderRadius:6,padding:"4px 11px",cursor:"pointer",
                      fontFamily:"Space Mono,monospace",fontSize:9,fontWeight:700,
                      color:active?"#ffa500":"#554433",
                      boxShadow:active?"0 0 10px #ffa50014":"none",transition:"all 0.18s",
                    }}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:dot,flexShrink:0,boxShadow:active?`0 0 5px ${dot}88`:"none",transition:"all 0.18s"}} />
                      <span style={{color:active?"#ffa500":"#554433",fontWeight:900}}>#{r}</span>
                      {meta.cnt != null && <span style={{fontSize:7,color:active?"#ffa50055":"#332211",fontWeight:400}}>{meta.cnt}</span>}
                    </button>
                  );
                })}
              </div>
              {/* Separator */}
              <div style={{width:1,background:"linear-gradient(180deg,transparent 5%,#1c1c32 30%,#1c1c32 70%,transparent 95%)",flexShrink:0}} />
              {/* VIEW filter */}
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",flexShrink:0}}>
                <span style={{fontSize:7,color:"#334477",letterSpacing:3,fontWeight:700,textTransform:"uppercase",marginRight:4}}>VIEW</span>
                {RUN_SIDE_FILTERS.map(side => (
                  <TBtn key={side.id} on={runSideFilter===side.id} c={side.color} onClick={()=>setRunSideFilter(side.id)}>{side.label}</TBtn>
                ))}
              </div>
              {/* Separator */}
              <div style={{width:1,background:"linear-gradient(180deg,transparent 5%,#1c1c32 30%,#1c1c32 70%,transparent 95%)",flexShrink:0}} />
              {/* Danger zone */}
              <div style={{display:"flex",alignItems:"center",padding:"10px 14px",flexShrink:0}}>
                <Btn c="#ff4455" onClick={()=>{if(window.confirm("Clear all run data?")) setSamples([]);}}>CLEAR</Btn>
              </div>
            </div>

            {/* ── ALL: SmartTable overview ── */}
            {runTab === "all" && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {allRuns.length === 0 ? (
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:"80px 0",opacity:0.7}}>
                    <div style={{fontSize:32,lineHeight:1}}>▼</div>
                    <div style={{color:"#7080b0",fontFamily:"Space Mono",fontSize:11,letterSpacing:1}}>No runs yet</div>
                    <div style={{color:"#4a5880",fontFamily:"Space Mono",fontSize:9}}>Go to LOSERS or GAINERS and start a set</div>
                  </div>
                ) : (() => {
                  const btcFallback = getLatestBtcPrice(marketContext?.btc?.price);
                  const runsTableRows = allRuns.map(r => {
                    const allRunSamples = rankedSamples.filter(s => sameRunValue(s.run, r));
                    const rs = filterSamplesByRunSide(allRunSamples, runSideFilter);
                    const cacheKey = btcRunCacheKey(`run:${r}:${runSideFilter}`, rs);
                    const m = withCachedBtcMove(runSummaryMetrics(rs, btcFallback), btcRunCache[cacheKey]);
                    return { r, rs, allRunSamples, m };
                  });
                  const aggregateSource = filterSamplesByRunSide(rankedSamples, runSideFilter);
                  const aggregateKey = btcRunCacheKey(`all:${runSideFilter}`, aggregateSource);
                  const aggregate = withCachedBtcMove(
                    runSummaryMetrics(aggregateSource, btcFallback),
                    btcRunCache[aggregateKey],
                  );
                  const runsOverviewCols = [
                    { key:"run",        label:"RUN",       width:58,  firstClickDir:"asc",  sortValue:row=>row.r??0,
                      render:row=><span style={{color:"#ffa500",fontWeight:900,fontSize:12}}>#{row.r}</span> },
                    { key:"comp",       label:"COMP",      width:90,  sortValue:row=>runCompositionLabel(row.allRunSamples),
                      render:row=><span style={{color:runCompositionColor(row.allRunSamples),fontWeight:800,fontSize:9}}>{runCompositionLabel(row.allRunSamples)}</span> },
                    { key:"closed",     label:"CLOSED",    width:62,  firstClickDir:"desc", sortValue:row=>row.m.closed,
                      render:row=><span style={{color:"#8899cc"}}>{row.m.closed}</span> },
                    { key:"winRate",    label:"GROSS WIN%", width:80,  firstClickDir:"desc", sortValue:row=>row.m.winRate??-1,
                      render:row=><span style={{color:row.m.winRate!=null&&row.m.winRate>=50?"#00ff88":"#ff4455",fontWeight:700}}>{row.m.winRate!=null?`${f2(row.m.winRate)}%`:"-"}</span> },
                    { key:"netWinRate", label:"NET WIN%",   width:76,  firstClickDir:"desc", sortValue:row=>row.m.netWinRate??-1,
                      render:row=><span style={{color:row.m.netWinRate!=null&&row.m.netWinRate>=50?"#00ee77":"#ee3344",fontWeight:700}}>{row.m.netWinRate!=null?`${f2(row.m.netWinRate)}%`:"-"}</span> },
                    { key:"grossPnl",   label:"GROSS PnL",  width:88,  firstClickDir:"desc", sortValue:row=>row.m.totalPnl??0,
                      render:row=><span style={{color:row.m.totalPnl>=0?"#6699cc":"#aa6677",fontWeight:600,fontSize:10}}>{fPct(row.m.totalPnl)}</span> },
                    { key:"totalFees",  label:"FEES",        width:72,  firstClickDir:"asc",  sortValue:row=>row.m.totalFees??0,
                      render:row=><span style={{color:"#aa88cc",fontWeight:600}}>{row.m.closed>0?fPct(-row.m.totalFees):"-"}</span> },
                    { key:"totalNetPnl",label:"NET AFTER FEES",width:100,firstClickDir:"desc",sortValue:row=>row.m.totalNetPnl??0,
                      render:row=><span style={{color:row.m.totalNetPnl>=0?"#00ff88":"#ff4455",fontWeight:800}}>{fPct(row.m.totalNetPnl)}</span> },
                    { key:"avgNetPnl",  label:"AVG NET",    width:74,  firstClickDir:"desc", sortValue:row=>row.m.avgNetPnl??-Infinity,
                      render:row=><span style={{color:row.m.avgNetPnl!=null&&row.m.avgNetPnl>=0?"#00ff88":"#ff4455"}}>{row.m.avgNetPnl!=null?fPct(row.m.avgNetPnl):"-"}</span> },
                    { key:"best",       label:"BEST",      width:112, firstClickDir:"desc", sortValue:row=>row.m.best??-Infinity,
                      render:row=>row.m.bestSample ? (
                        <div title={`Best trade: ${row.m.bestSample.symbol ?? "-"}\nPnL: ${fPct(row.m.best)}`}
                          style={{display:"flex",flexDirection:"column",gap:1,lineHeight:1.1}}>
                          <span style={{color:"#d8ffe8",fontWeight:800,fontSize:10}}>{runOutcomeSymbolLabel(row.m.bestSample)}</span>
                          <span style={{color:"#00ff88",fontSize:9}}>{fPct(row.m.best)}</span>
                        </div>
                      ) : <span style={{color:"#00ff88"}}>-</span> },
                    { key:"worst",      label:"WORST",     width:112, firstClickDir:"asc",  sortValue:row=>row.m.worst??Infinity,
                      render:row=>row.m.worstSample ? (
                        <div title={`Worst trade: ${row.m.worstSample.symbol ?? "-"}\nPnL: ${fPct(row.m.worst)}`}
                          style={{display:"flex",flexDirection:"column",gap:1,lineHeight:1.1}}>
                          <span style={{color:"#ffe0e4",fontWeight:800,fontSize:10}}>{runOutcomeSymbolLabel(row.m.worstSample)}</span>
                          <span style={{color:"#ff4455",fontSize:9}}>{fPct(row.m.worst)}</span>
                        </div>
                      ) : <span style={{color:"#ff4455"}}>-</span> },
                    { key:"tpCount",    label:"TP/LOCK",   width:66,  firstClickDir:"desc", sortValue:row=>row.m.tpCount??0,
                      render:row=><span style={{color:"#00ff88"}}>{row.m.tpCount}</span> },
                    { key:"slCount",    label:"SL HITS",   width:66,  firstClickDir:"desc", sortValue:row=>row.m.slCount??0,
                      render:row=><span style={{color:"#ff4455"}}>{row.m.slCount}</span> },
                    { key:"btcRun",     label:"BTC RUN",   width:104, firstClickDir:"desc", sortValue:row=>row.m.btcMove?.pct??-Infinity,
                      render:row=><span style={{color:btcMoveColor(row.m.btcMove),fontWeight:700}}>{btcMoveLabel(row.m.btcMove)}</span> },
                    { key:"export",     label:"EXPORT",    width:180, minWidth:180,
                      render:row=>(
                        <div style={{display:"flex",gap:8,width:"100%",justifyContent:"flex-start",paddingRight:8,boxSizing:"border-box"}} onClick={e=>e.stopPropagation()}>
                          <Btn onClick={()=>dlCSV(row.rs,`longlab_run${row.r}_${runSideFilter}_${Date.now()}.csv`)} c="#00ff88" disabled={!row.rs.length}>CSV</Btn>
                          <Btn onClick={()=>dlJSON(row.rs,`longlab_run${row.r}_${runSideFilter}_${Date.now()}.json`)} c="#4488ff" disabled={!row.rs.length}>JSON</Btn>
                        </div>
                      )},
                  ];
                  // Aggregate hero strip — 5 key metrics
                  const aggItems = [
                    { label:"TOTAL TRADES", value:String(aggregate.total),    sub:`${aggregate.active} active`, c:"#4488ff" },
                    { label:"GROSS WIN%",   value:aggregate.winRate!=null?`${f2(aggregate.winRate)}%`:"—",
                      sub:`NET ${aggregate.netWinRate!=null?f2(aggregate.netWinRate)+"%":"—"} · ${aggregate.feeFlipCount??0} flips`,
                      c:aggregate.winRate!=null&&aggregate.winRate>=50?"#00ff88":"#ff4455" },
                    { label:"GROSS PnL",    value:fPct(aggregate.totalPnl),   sub:"before fees",  c:aggregate.totalPnl>=0?"#6699cc":"#aa6677" },
                    { label:"TRADING FEES", value:aggregate.closed>0?fPct(-aggregate.totalFees):"—", sub:"margin pts", c:"#aa88cc" },
                    { label:"NET AFTER FEES", value:fPct(aggregate.totalNetPnl), sub:"realized + live",  c:aggregate.totalNetPnl>=0?"#00ff88":"#ff4455" },
                    { label:"AVG NET/TRADE", value:aggregate.avgNetPnl!=null?fPct(aggregate.avgNetPnl):"—", sub:"per closed trade",
                      c:aggregate.avgNetPnl!=null&&aggregate.avgNetPnl>=0?"#55ff99":"#ff8877" },
                    { label:"BTC BACKDROP", value:btcMoveLabel(aggregate.btcMove), sub:"start → end", c:btcMoveColor(aggregate.btcMove) },
                  ];
                  return (
                    <>
                      {/* Aggregate hero strip */}
                      <div style={{
                        display:"grid",gridTemplateColumns:`repeat(${aggItems.length},1fr)`,
                        background:"linear-gradient(135deg,#0c0c1c 0%,#090910 100%)",
                        border:"1px solid #181836",borderRadius:10,
                        overflow:"hidden",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",
                      }}>
                        {aggItems.map((item, i) => (
                          <div key={i} style={{
                            padding:"14px 18px",
                            background:`linear-gradient(135deg,${item.c}09 0%,transparent 55%)`,
                            borderRight:i<aggItems.length-1?"1px solid #14142a":"none",
                          }}>
                            <div style={{fontSize:7,color:"#334466",letterSpacing:2.5,fontWeight:700,textTransform:"uppercase",marginBottom:5}}>{item.label}</div>
                            <div style={{fontSize:20,fontWeight:800,fontFamily:"Space Mono",color:item.c,letterSpacing:-0.5,lineHeight:1,textShadow:`0 0 14px ${item.c}28`}}>{item.value}</div>
                            <div style={{fontSize:8,color:"#445566",marginTop:4}}>{item.sub}</div>
                          </div>
                        ))}
                      </div>
                      {/* Runs table */}
                      <SmartTable
                        columns={runsOverviewCols}
                        rows={runsTableRows}
                        rowKey={row=>row.r}
                        pageSize={50}
                        emptyMsg="No runs yet."
                        onRowClick={row=>setRunTab(row.r)}
                      />
                      {/* Analysis-first 20-run batch export */}
                      <div style={{
                        display:"flex",justifyContent:"flex-end",alignItems:"center",gap:8,flexWrap:"wrap",
                        padding:"10px 12px",background:"#080812",border:"1px solid #15152c",borderRadius:8,
                      }}>
                        <div style={{marginRight:"auto",minWidth:180}}>
                          <div style={{fontSize:7,color:"#6677aa",letterSpacing:2.5,fontWeight:800,textTransform:"uppercase"}}>ALL EXPORT · ANALYSIS ZIP</div>
                          <div style={{fontSize:8,color:"#3f506f",marginTop:3}}>
                            Master CSV + JSONL + run summaries + per-run CSVs
                          </div>
                        </div>
                        <select
                          value={selectedExportBatch?.id ?? ""}
                          onChange={event=>setExportBatchId(event.target.value)}
                          disabled={!exportBatches.length || BATCH_EXPORT_BUSY_PHASES.includes(batchExportState.phase)}
                          style={{
                            maxWidth:340,minWidth:230,background:"#0d0d1d",color:"#aabbdd",border:"1px solid #252548",
                            borderRadius:6,padding:"7px 9px",fontFamily:"Space Mono,monospace",fontSize:9,outline:"none",
                          }}
                        >
                          {exportBatches.map(batch => (
                            <option key={batch.id} value={batch.id}>
                              {batch.label} · {batch.runCount}/20 runs · {batch.tradeCount} trades
                            </option>
                          ))}
                        </select>
                        <span style={{fontFamily:"Space Mono",fontSize:8,color:selectedExportBatch?.completeTwentyRuns?"#00cc77":"#ffaa44",minWidth:86,textAlign:"right"}}>
                          {selectedExportBatch ? `${selectedExportBatch.runCount}/20 RUNS` : "NO BATCH"}
                        </span>
                        <Btn
                          onClick={exportSelectedBatchAnalysis}
                          c="#aa88ff"
                          disabled={!selectedExportBatch || !selectedExportBatchTradeCount || BATCH_EXPORT_BUSY_PHASES.includes(batchExportState.phase)}
                        >
                          {BATCH_EXPORT_BUSY_PHASES.includes(batchExportState.phase)
                            ? `EXPORT ${batchExportState.percent ?? 0}%`
                            : "↓ ANALYSIS ZIP"}
                        </Btn>
                        <Btn onClick={()=>dlCSV(aggregateSource,`longlab_current_view_${runSideFilter}_${Date.now()}.csv`)} c="#00ff88" disabled={!aggregateSource.length}>VIEW CSV</Btn>
                        <Btn onClick={()=>dlJSON(aggregateSource,`longlab_current_view_${runSideFilter}_${Date.now()}.json`)} c="#4488ff" disabled={!aggregateSource.length}>VIEW JSON</Btn>
                        {batchExportState.phase === "ERROR" && (
                          <span style={{width:"100%",textAlign:"right",fontSize:8,color:"#ff6677"}}>{batchExportState.error}</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── Individual run view ── */}
            {runTab !== "all" && (() => {
              const allRunSamples = rankedSamples.filter(s => sameRunValue(s.run, runTab));
              const rs  = filterSamplesByRunSide(allRunSamples, runSideFilter);
              const excludedIntegritySamples = rs.filter(sample => !isRunMetricEligibleSample(sample));
              const metricSamples = rs.filter(isRunMetricEligibleSample);
              const rc  = metricSamples.filter(s => s.closed);
              const ra  = metricSamples.filter(s => !s.closed);
              const rw  = rc.filter(s => s.finalPnlPct > 0);
              const rl  = rc.filter(s => s.finalPnlPct <= 0);
              const wr  = rc.length ? rw.length/rc.length*100 : 0;
              const realizedPnl = rc.reduce((a,s)=>a+(s.finalPnlPct ?? 0),0);
              const livePnl = ra.reduce((a,s)=>{
                const priceUp = (s.currentPrice - s.entryPrice) / s.entryPrice * 100;
                return a + priceUp * s.leverage;
              },0);
              const netPnl = realizedPnl + livePnl;
              const netPnlPct = metricSamples.length ? netPnl/metricSamples.length : 0;
              const avg = rc.length ? realizedPnl/rc.length : 0;
              const avgN= rc.length ? rc.reduce((a,s)=>a+s.finalPnlPct/s.leverage,0)/rc.length : 0;
              const avgMae = metricSamples.length ? metricSamples.reduce((a,s)=>a+(s.mae||0),0)/metricSamples.length : null;
              const avgMfe = metricSamples.length ? metricSamples.reduce((a,s)=>a+(s.mfe||0),0)/metricSamples.length : null;
              const totalMae = metricSamples.length ? metricSamples.reduce((a,s)=>a+(s.mae||0),0) : null;
              const totalMfe = metricSamples.length ? metricSamples.reduce((a,s)=>a+(s.mfe||0),0) : null;
              const bestSample = pickClosedSampleByPnl(rc, "best");
              const worstSample = pickClosedSampleByPnl(rc, "worst");
              const best  = bestSample ? samplePnlPct(bestSample) : null;
              const worst = worstSample ? samplePnlPct(worstSample) : null;
              const tpCount = rc.filter(s => [CLOSE_REASON.TAKE_PROFIT, CLOSE_REASON.TRAILING_EXIT, CLOSE_REASON.PROFIT_LOCK].includes(normalizeLongCloseReason(s.closeReason))).length;
              const slCount = rc.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.STOP_LOSS).length;
              const runStopCount = rc.filter(s => [CLOSE_REASON.RUN_STOP, CLOSE_REASON.APP_SHUTDOWN].includes(normalizeLongCloseReason(s.canonicalCloseReason ?? s.closeReason))).length;
              const toCount = rc.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.TIMEOUT).length;
              const tag     = `longlab_run${runTab}_${runSideFilter}_${Date.now()}`;
              const directBtcMove = runBtcMove(rs, getLatestBtcPrice(marketContext?.btc?.price));
              const btcMove = directBtcMove.known
                ? directBtcMove
                : (cachedBtcMove(btcRunCache[btcRunCacheKey(`run:${runTab}:${runSideFilter}`, rs)]) ?? directBtcMove);

              // Colored section header with left bar + fading rule
              const SecHead = ({label, accent="#4466aa"}) => (
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:24,marginBottom:10}}>
                  <div style={{width:3,height:13,background:`linear-gradient(180deg,${accent},${accent}44)`,borderRadius:2,flexShrink:0}} />
                  <span style={{fontSize:7,color:accent,letterSpacing:3,fontWeight:700,textTransform:"uppercase"}}>{label}</span>
                  <div style={{flex:1,height:1,background:`linear-gradient(90deg,${accent}30,transparent)`}} />
                </div>
              );

              return (
                <div>
                  {excludedIntegritySamples.length > 0 && (
                    <div style={{
                      marginBottom:12,padding:"10px 12px",borderRadius:8,
                      background:"#2a120d",border:"1px solid #ff663355",
                      color:"#ff9a72",fontFamily:"Space Mono",fontSize:9,lineHeight:1.5,
                    }}>
                      PRICE-INTEGRITY QUARANTINE · {excludedIntegritySamples.length} trade{excludedIntegritySamples.length===1?"":"s"} excluded from PnL, win-rate, MAE and MFE metrics. Operational rows remain visible/exportable for audit.
                    </div>
                  )}
                  {/* ── Hero card ── */}
                  <div style={{
                    background:"linear-gradient(135deg,#0d0d1f 0%,#090910 100%)",
                    border:"1px solid #1a1a38",borderRadius:12,
                    overflow:"hidden",boxShadow:"0 6px 28px rgba(0,0,0,0.5)",
                    marginBottom:20,
                  }}>
                    <div style={{height:2,background:"linear-gradient(90deg,transparent,#ffa50033 25%,#ffa500 50%,#ffa50033 75%,transparent)"}} />
                    <div style={{padding:"18px 22px"}}>
                      {/* Primary row: run # + three key metrics + BTC + export */}
                      <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
                        {/* Run number */}
                        <div style={{flexShrink:0}}>
                          <div style={{fontSize:9,color:"#334466",letterSpacing:3,fontWeight:700,textTransform:"uppercase",lineHeight:1,marginBottom:5}}>RUN</div>
                          <div style={{fontSize:42,fontWeight:900,color:"#ffa500",fontFamily:"Space Mono",letterSpacing:-3,lineHeight:0.88,textShadow:"0 0 32px #ffa50044"}}>#{runTab}</div>
                          <div style={{fontSize:8,color:"#334466",fontFamily:"Space Mono",marginTop:6,letterSpacing:0.3}}>
                            {allRunSamples.length ? new Date(Math.min(...allRunSamples.map(s=>s.entryTime))).toUTCString().slice(0,25) : "—"}
                          </div>
                        </div>
                        <div style={{width:1,height:60,background:"linear-gradient(180deg,transparent,#1c1c32 25%,#1c1c32 75%,transparent)",flexShrink:0}} />
                        {/* Net PnL */}
                        <div style={{flexShrink:0}}>
                          <div style={{fontSize:7,color:"#334466",letterSpacing:2.5,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>NET PnL</div>
                          <div style={{fontSize:30,fontWeight:800,fontFamily:"Space Mono",letterSpacing:-1,lineHeight:1,color:netPnl>=0?"#00ff88":"#ff4455",textShadow:netPnl>=0?"0 0 22px #00ff8830":"0 0 22px #ff445530"}}>
                            {rs.length ? fPct(netPnl) : "—"}
                          </div>
                          <div style={{fontSize:8,color:"#445566",marginTop:3}}>{ra.length ? "realized + live" : "realized"}</div>
                        </div>
                        <div style={{width:1,height:48,background:"linear-gradient(180deg,transparent,#1c1c32 25%,#1c1c32 75%,transparent)",flexShrink:0}} />
                        {/* Win rate */}
                        <div style={{flexShrink:0}}>
                          <div style={{fontSize:7,color:"#334466",letterSpacing:2.5,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>WIN RATE</div>
                          <div style={{fontSize:30,fontWeight:800,fontFamily:"Space Mono",letterSpacing:-1,lineHeight:1,color:rc.length?(wr>=50?"#00ff88":"#ff4455"):"#3a4a6a",textShadow:rc.length?(wr>=50?"0 0 22px #00ff8830":"0 0 22px #ff445530"):"none"}}>
                            {rc.length ? `${f2(wr)}%` : "—"}
                          </div>
                          <div style={{fontSize:8,color:"#445566",marginTop:3}}>{rw.length}W · {rl.length}L</div>
                        </div>
                        <div style={{width:1,height:48,background:"linear-gradient(180deg,transparent,#1c1c32 25%,#1c1c32 75%,transparent)",flexShrink:0}} />
                        {/* Avg PnL */}
                        <div style={{flexShrink:0}}>
                          <div style={{fontSize:7,color:"#334466",letterSpacing:2.5,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>AVG PnL</div>
                          <div style={{fontSize:30,fontWeight:800,fontFamily:"Space Mono",letterSpacing:-1,lineHeight:1,color:avg>=0?"#55ff99":"#ff8877",textShadow:avg>=0?"0 0 22px #55ff9930":"0 0 22px #ff887730"}}>
                            {rc.length ? fPct(avg) : "—"}
                          </div>
                          <div style={{fontSize:8,color:"#445566",marginTop:3}}>per trade</div>
                        </div>
                        <div style={{width:1,height:48,background:"linear-gradient(180deg,transparent,#1c1c32 25%,#1c1c32 75%,transparent)",flexShrink:0}} />
                        {/* BTC */}
                        <div style={{flexShrink:0}}>
                          <div style={{fontSize:7,color:"#334466",letterSpacing:2.5,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>BTC RUN</div>
                          <div style={{fontSize:20,fontWeight:700,fontFamily:"Space Mono",letterSpacing:-0.5,lineHeight:1,color:btcMoveColor(btcMove)}}>
                            {btcMove.known ? fPct(btcMove.pct) : "—"}
                          </div>
                          <div style={{fontSize:8,color:"#445566",marginTop:3}}>{btcMove.known ? btcMove.direction : "market backdrop"}</div>
                        </div>
                        {/* Export — pushed right */}
                        <div style={{marginLeft:"auto",display:"flex",gap:6,flexShrink:0}}>
                          <Btn onClick={()=>dlCSV(rs,`${tag}.csv`)}  c="#00ff88" disabled={!rs.length}>↓ CSV</Btn>
                          <Btn onClick={()=>dlJSON(rs,`${tag}.json`)} c="#4488ff" disabled={!rs.length}>↓ JSON</Btn>
                        </div>
                      </div>
                      {/* Badge row */}
                      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:14,paddingTop:12,borderTop:"1px solid #12122a",flexWrap:"wrap"}}>
                        <span style={{fontFamily:"Space Mono",fontSize:9,fontWeight:800,color:runCompositionColor(allRunSamples),background:`${runCompositionColor(allRunSamples)}14`,border:`1px solid ${runCompositionColor(allRunSamples)}28`,borderRadius:4,padding:"3px 10px"}}>
                          {runCompositionLabel(allRunSamples)}
                        </span>
                        <span style={{fontFamily:"Space Mono",fontSize:9,fontWeight:700,color:RUN_SIDE_FILTERS.find(f=>f.id===runSideFilter)?.color ?? "#888",background:"#0f0f1e",border:"1px solid #1e1e38",borderRadius:4,padding:"3px 10px"}}>
                          {runSideFilterLabel(runSideFilter)}
                        </span>
                        <span style={{fontFamily:"Space Mono",fontSize:9,fontWeight:700,color:"#4488ff",background:"#0a1020",border:"1px solid #1a2a44",borderRadius:4,padding:"3px 10px"}}>
                          {rs.length} trade{rs.length!==1?"s":""}
                        </span>
                        {ra.length > 0 && (
                          <span style={{fontFamily:"Space Mono",fontSize:9,fontWeight:700,color:"#00cc66",background:"#051209",border:"1px solid #0a2518",borderRadius:4,padding:"3px 10px"}}>
                            {ra.length} LIVE
                          </span>
                        )}
                        <span style={{fontFamily:"Space Mono",fontSize:9,color:"#2a3a55",marginLeft:"auto"}}>
                          {rc.length} closed · {tpCount} TP · {slCount} SL
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Stats: 4 themed sections ── */}
                  <SecHead label="PERFORMANCE" accent="#4488ff" />
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:9}}>
                    <StatCard label="NET PnL"  value={rs.length?fPct(netPnl):"—"}    sub={ra.length?"real + live":"realized"} c={netPnl>=0?"#00ff88":"#ff4455"} />
                    <StatCard label="PnL %"    value={rs.length?fPct(netPnlPct):"—"} sub="per sample"                        c={netPnlPct>=0?"#00ff88":"#ff4455"} />
                    <StatCard label="WIN RATE" value={rc.length?`${f2(wr)}%`:"—"}    sub={`${rw.length}W · ${rl.length}L`}  c={wr>=50?"#00ff88":"#ff4455"} />
                    <StatCard label="AVG PnL"  value={rc.length?fPct(avg):"—"}       sub="leveraged"                         c={avg>=0?"#00ff88":"#ff4455"} />
                    <StatCard label="NORM PnL" value={rc.length?fPct(avgN):"—"}      sub="÷ leverage"                        c={avgN>=0?"#55ff88":"#ff8866"} />
                  </div>

                  <SecHead label="POPULATION" accent="#8877ff" />
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:9}}>
                    <StatCard label="TOTAL"  value={rs.length} sub={`${ra.length} active · ${excludedIntegritySamples.length} excluded`} c="#4488ff" />
                    <StatCard label="CLOSED" value={rc.length} sub={`${rw.length}W · ${rl.length}L`}                              c="#8899cc" />
                    <StatCard label="BEST"   value={best!=null?fPct(best):"—"}   sub={bestSample?runOutcomeSymbolLabel(bestSample):"max gain"}   c="#00ff88" />
                    <StatCard label="WORST"  value={worst!=null?fPct(worst):"—"} sub={worstSample?runOutcomeSymbolLabel(worstSample):"max loss"} c="#ff4455" />
                  </div>

                  <SecHead label="RISK METRICS" accent="#ff8855" />
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:9}}>
                    <StatCard label="AVG MAE"  value={avgMae!=null?fPct(avgMae):"—"}     sub="avg adverse excursion"    c="#ff8855" />
                    <StatCard label="AVG MFE"  value={avgMfe!=null?fPct(avgMfe):"—"}     sub="avg favorable excursion"  c="#55ff88" />
                    <StatCard label="CUM DD"   value={totalMae!=null?fDd(totalMae):"—"}  sub="total adverse excursion"  c="#ff6644" />
                    <StatCard label="CUM MFE"  value={totalMfe!=null?fPct(totalMfe):"—"} sub="total favorable excursion" c="#00ff88" />
                  </div>

                  <SecHead label="EXIT DISTRIBUTION" accent="#ffa500" />
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:9}}>
                    <StatCard label="TP / TRAIL" value={tpCount} sub={`${rc.length?f2(tpCount/rc.length*100):0}%`} c="#00ff88" />
                    <StatCard label="SL HITS"    value={slCount} sub={`${rc.length?f2(slCount/rc.length*100):0}%`} c="#ff4455" />
                    <StatCard label="RUN / APP STOP" value={runStopCount} sub="session lifecycle" c="#aa88ff" />
                    <StatCard label="TIMEOUTS"   value={toCount} sub="hold expiry"                                 c="#ffa500" />
                  </div>

                  {/* ── Sample cards ── */}
                  {rs.length === 0 && (
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:"50px 0",opacity:0.65}}>
                      <div style={{fontSize:24}}>◌</div>
                      <div style={{color:"#6070a0",fontFamily:"Space Mono",fontSize:10}}>No {runSideFilterLabel(runSideFilter).toLowerCase()} samples in this run</div>
                    </div>
                  )}
                  {ra.length > 0 && (
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:28,marginBottom:10}}>
                        <div style={{width:3,height:13,background:"linear-gradient(180deg,#00ff88,#00ff8844)",borderRadius:2,flexShrink:0}} />
                        <span style={{fontSize:7,color:"#00ff88",letterSpacing:3,fontWeight:700,textTransform:"uppercase"}}>ACTIVE</span>
                        <span style={{fontSize:9,color:"#00ff8855",fontFamily:"Space Mono",fontWeight:700}}>— {ra.length}</span>
                        <div style={{flex:1,height:1,background:"linear-gradient(90deg,#00ff8820,transparent)"}} />
                      </div>
                      {ra.map(s => (
                        <ActiveCard key={s.id} s={s} now={now} trailOn={trailOn}
                          onClose={()=>setCloseModal(s)}
                          onRemove={()=>setSamples(prev=>prev.filter(x=>x.id!==s.id))}
                          noteEditing={noteEdit===s.id}
                          noteText={noteEdit===s.id?noteText:""}
                          onEditNote={()=>{setNoteEdit(s.id);setNoteText(s.notes||"");}}
                          setNoteText={setNoteText}
                          saveNote={()=>saveNote(s.id)}
                        />
                      ))}
                    </>
                  )}
                  {rc.length > 0 && (
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:ra.length>0?28:0,marginBottom:10}}>
                        <div style={{width:3,height:13,background:"linear-gradient(180deg,#6677cc,#6677cc44)",borderRadius:2,flexShrink:0}} />
                        <span style={{fontSize:7,color:"#6677cc",letterSpacing:3,fontWeight:700,textTransform:"uppercase"}}>CLOSED</span>
                        <span style={{fontSize:9,color:"#6677cc55",fontFamily:"Space Mono",fontWeight:700}}>— {rc.length}</span>
                        <div style={{flex:1,height:1,background:"linear-gradient(90deg,#6677cc20,transparent)"}} />
                      </div>
                      {[...rc].reverse().map(s => (
                        <ClosedCard key={s.id} s={s}
                          onRemove={()=>setSamples(prev=>prev.filter(x=>x.id!==s.id))}
                          noteEditing={noteEdit===s.id}
                          noteText={noteEdit===s.id?noteText:""}
                          onEditNote={()=>{setNoteEdit(s.id);setNoteText(s.notes||"");}}
                          setNoteText={setNoteText}
                          saveNote={()=>saveNote(s.id)}
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
          );
        })()}

        {/* â•â•â• CHARTS â•â•â• */}
        {tab === "charts" && (
          <div style={{display:"flex",flexDirection:"column",gap:28}}>
            {closedSamples.length < 2 && (
              <div style={{color:"#9090c8",fontFamily:"Space Mono",fontSize:11,textAlign:"center",padding:"50px 0"}}>
                Need 2+ closed samples.
              </div>
            )}
            {closedSamples.length >= 2 && (<>

              <ChartWrap title="EQUITY CURVE — cumulative leveraged PnL %">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={equityCurve} margin={{top:5,right:10,bottom:5,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                    <XAxis dataKey="n" tick={{fill:"#333",fontSize:9}} />
                    <YAxis tick={{fill:"#333",fontSize:9}} tickFormatter={v=>`${v}%`} />
                    <ReferenceLine y={0} stroke="#222" strokeDasharray="4 3" />
                    <Tooltip contentStyle={{background:"#0d0d18",border:"1px solid #1a1a2a",color:"#dde4f4",fontSize:11}}
                      formatter={(v,_,p)=>[`${fPct(v)}`, p.payload.sym]} />
                    <Line type="monotone" dataKey="equity" stroke="#00ff88" strokeWidth={2}
                      dot={{fill:"#00ff88",r:3,strokeWidth:0}} activeDot={{r:5}} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartWrap>

              <ChartWrap title="PER-TRADE PnL — individual outcomes">
                <ResponsiveContainer width="100%" height={155}>
                  <LineChart data={equityCurve} margin={{top:5,right:10,bottom:5,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                    <XAxis dataKey="sym" tick={{fill:"#222",fontSize:8}} />
                    <YAxis tick={{fill:"#333",fontSize:9}} tickFormatter={v=>`${v}%`} />
                    <ReferenceLine y={0} stroke="#222" />
                    <Tooltip contentStyle={{background:"#0d0d18",border:"1px solid #1a1a2a",color:"#dde4f4",fontSize:11}} />
                    <Line type="monotone" dataKey="pnl" strokeWidth={1} stroke="#222"
                      dot={p=><circle key={p.key} cx={p.cx} cy={p.cy} r={4}
                        fill={p.payload.pnl>=0?"#00ff88":"#ff4455"} opacity={0.85}/>} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartWrap>

              <ChartWrap title="SCATTER — 24h change % vs final PnL%">
                <ResponsiveContainer width="100%" height={230}>
                  <ScatterChart margin={{top:10,right:10,bottom:25,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                    <XAxis dataKey="x" type="number" name="24h%" tick={{fill:"#333",fontSize:9}}
                      tickFormatter={v=>`${v}%`}
                      label={{value:"24h change %",fill:"#333",fontSize:9,position:"insideBottom",offset:-12}} />
                    <YAxis dataKey="y" type="number" name="PnL%" tick={{fill:"#333",fontSize:9}} tickFormatter={v=>`${v}%`} />
                    <ReferenceLine y={0} stroke="#222" strokeDasharray="4 3" />
                    <ReferenceLine x={0} stroke="#1a1a2a" strokeDasharray="4 3" />
                    <Tooltip cursor={false}
                      content={({payload})=>payload?.length
                        ? <div style={{padding:"6px 8px",background:"#0d0d18",border:"1px solid #1a1a2a",fontSize:11}}>
                            <b style={{color:"#fff"}}>{payload[0]?.payload?.sym}</b>
                            <div>24h: {fPct(payload[0]?.payload?.x)}</div>
                            <div>PnL: {fPct(payload[0]?.payload?.y)}</div>
                          </div>
                        : null} />
                    <Scatter data={scatterData}
                      shape={p=><circle cx={p.cx} cy={p.cy} r={5}
                        fill={p.y>=0?"#00ff88":"#ff4455"} opacity={0.75}/>} />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartWrap>

            </>)}
          </div>
        )}

        {/* â•â•â• STATS â•â•â• */}
        {tab === "stats" && (
          <div>
            {allRuns.length > 1 && (
              <div style={{display:"flex",gap:5,marginBottom:14,alignItems:"center"}}>
                <Lbl>RUN</Lbl>
                <TBtn on={filterRun==="all"} c="#888" onClick={()=>setFilterRun("all")}>ALL</TBtn>
                {allRuns.map(r => <TBtn key={r} on={filterRun===r} c="#ffa500" onClick={()=>setFilterRun(r)}>#{r}</TBtn>)}
              </div>
            )}
            <div style={S.grid}>
              <StatCard label="TOTAL"      value={filtered.length}                                              sub={`${activeSamples.length} active`}            c="#4488ff" />
              <StatCard label="WIN RATE"   value={closedSamples.length?`${f2(winRate)}%`:"—"}                  sub={`${wins.length}W · ${losses.length}L`}        c={winRate>=50?"#00ff88":"#ff4455"} />
              <StatCard label="AVG PnL"    value={closedSamples.length?fPct(avgPnlLev):"—"}                    sub="leveraged"                                    c={avgPnlLev>=0?"#00ff88":"#ff4455"} />
              <StatCard label="NORM PnL"   value={closedSamples.length?fPct(avgPnlNorm):"—"}                   sub="÷ leverage"                                   c={avgPnlNorm>=0?"#55ff88":"#ff8866"} />
              <StatCard label="TP / TRAIL" value={closedSamples.filter(s => [CLOSE_REASON.TAKE_PROFIT, CLOSE_REASON.TRAILING_EXIT, CLOSE_REASON.PROFIT_LOCK].includes(normalizeLongCloseReason(s.closeReason))).length}
                sub={`${closedSamples.length?f2(closedSamples.filter(s => [CLOSE_REASON.TAKE_PROFIT, CLOSE_REASON.TRAILING_EXIT, CLOSE_REASON.PROFIT_LOCK].includes(normalizeLongCloseReason(s.closeReason))).length/closedSamples.length*100):0}%`} c="#00ff88" />
              <StatCard label="SL HITS"    value={closedSamples.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.STOP_LOSS).length}
                sub={`${closedSamples.length?f2(closedSamples.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.STOP_LOSS).length/closedSamples.length*100):0}%`} c="#ff4455" />
              <StatCard label="TIMEOUTS"   value={closedSamples.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.TIMEOUT).length}   sub="3h expiry"                                    c="#ffa500" />
              <StatCard label="MANUAL"     value={closedSamples.filter(s=>s.closeReason?.startsWith("Manual")).length} sub="user closed"                          c="#888" />
              <StatCard label="BEST"       value={closedSamples.length?fPct(Math.max(...closedSamples.map(s=>s.finalPnlPct))):"—"} sub="max gain"                 c="#00ff88" />
              <StatCard label="WORST"      value={closedSamples.length?fPct(Math.min(...closedSamples.map(s=>s.finalPnlPct))):"—"} sub="max loss"                 c="#ff4455" />
              <StatCard label="AVG MAE"    value={closedSamples.length?fPct(closedSamples.reduce((s,x)=>s+(x.mae||0),0)/closedSamples.length):"—"} sub="avg adverse excursion"   c="#ff8855" />
              <StatCard label="AVG MFE"    value={closedSamples.length?fPct(closedSamples.reduce((s,x)=>s+(x.mfe||0),0)/closedSamples.length):"—"} sub="avg favorable excursion" c="#55ff88" />
            </div>

            {postFee10Analytics.baseline?.tradeCount > 0 && (() => {
              const pct = v => v == null ? "-" : `${f2(v)}%`;
              const num = v => v == null ? "-" : Number.isFinite(v) ? f2(v) : "INF";
              const ms = v => v == null ? "-" : fTime(v);
              const cols = [
                { key:"scope", label:"SCOPE", width:66, sortValue:r=>r.scope,
                  render:r=><span style={{color:"#8899cc",fontWeight:800}}>{String(r.scope).toUpperCase()}</span> },
                { key:"key", label:"KEY", width:118, sortValue:r=>String(r.key),
                  render:r=><span style={{color:r.scope==="tier"?"#66ddaa":"#e0e4f8",fontWeight:800}}>{String(r.key).slice(0, 18)}</span> },
                { key:"trades", label:"TRADES", width:66, firstClickDir:"desc", sortValue:r=>r.tradeCount,
                  render:r=><span style={{color:"#4488ff"}}>{r.tradeCount}</span> },
                { key:"hit", label:"+10 HIT", width:78, firstClickDir:"desc", sortValue:r=>r.postFee10HitRate ?? -1,
                  render:r=><span style={{color:(r.postFee10HitRate??0)>=(postFee10Analytics.baseline.postFee10HitRate??0)?"#00ff88":"#ff4455",fontWeight:800}}>{pct(r.postFee10HitRate)}</span> },
                { key:"winners", label:"+10 W", width:64, firstClickDir:"desc", sortValue:r=>r.postFee10WinnerCount,
                  render:r=><span style={{color:"#66ddaa"}}>{r.postFee10WinnerCount}</span> },
                { key:"avg", label:"AVG NET", width:78, firstClickDir:"desc", sortValue:r=>r.averageFeeAdjustedPnl ?? -Infinity,
                  render:r=><span style={{color:(r.averageFeeAdjustedPnl??0)>=0?"#00ff88":"#ff4455"}}>{r.averageFeeAdjustedPnl!=null?fPct(r.averageFeeAdjustedPnl):"-"}</span> },
                { key:"med", label:"MED NET", width:78, firstClickDir:"desc", sortValue:r=>r.medianFeeAdjustedPnl ?? -Infinity,
                  render:r=><span style={{color:(r.medianFeeAdjustedPnl??0)>=0?"#00ff88":"#ff4455"}}>{r.medianFeeAdjustedPnl!=null?fPct(r.medianFeeAdjustedPnl):"-"}</span> },
                { key:"total", label:"TOTAL NET", width:86, firstClickDir:"desc", sortValue:r=>r.totalFeeAdjustedPnl ?? -Infinity,
                  render:r=><span style={{color:(r.totalFeeAdjustedPnl??0)>=0?"#00ff88":"#ff4455",fontWeight:800}}>{r.totalFeeAdjustedPnl!=null?fPct(r.totalFeeAdjustedPnl):"-"}</span> },
                { key:"wr", label:"WR", width:62, firstClickDir:"desc", sortValue:r=>r.winRate ?? -1,
                  render:r=><span style={{color:(r.winRate??0)>=50?"#00ff88":"#ff4455"}}>{pct(r.winRate)}</span> },
                { key:"sl", label:"SL", width:62, firstClickDir:"asc", sortValue:r=>r.slRate ?? 101,
                  render:r=><span style={{color:"#ff8855"}}>{pct(r.slRate)}</span> },
                { key:"mfe", label:"MFE", width:62, firstClickDir:"desc", sortValue:r=>r.averageMfe ?? -Infinity,
                  render:r=><span style={{color:"#55ff88"}}>{r.averageMfe!=null?fPct(r.averageMfe):"-"}</span> },
                { key:"mae", label:"MAE", width:62, firstClickDir:"asc", sortValue:r=>r.averageMae ?? Infinity,
                  render:r=><span style={{color:"#ff8855"}}>{r.averageMae!=null?fPct(r.averageMae):"-"}</span> },
                { key:"time10", label:"MED T+10", width:82, firstClickDir:"asc", sortValue:r=>r.medianTimeToPostFee10Ms ?? Infinity,
                  render:r=><span style={{color:"#a8c0d4"}}>{ms(r.medianTimeToPostFee10Ms)}</span> },
                { key:"top3", label:"TOP3 CAP", width:78, firstClickDir:"desc", sortValue:r=>r.topThreeCaptureRate ?? -1,
                  render:r=><span style={{color:"#66ddaa"}}>{pct(r.topThreeCaptureRate)}</span> },
                { key:"precision", label:"PREC", width:64, firstClickDir:"desc", sortValue:r=>r.precision ?? -1,
                  render:r=><span style={{color:"#66ddaa"}}>{r.precision!=null?num(r.precision):"-"}</span> },
                { key:"recall", label:"RECALL", width:70, firstClickDir:"desc", sortValue:r=>r.recall ?? -1,
                  render:r=><span style={{color:"#66ddaa"}}>{r.recall!=null?num(r.recall):"-"}</span> },
                { key:"lift", label:"LIFT", width:64, firstClickDir:"desc", sortValue:r=>r.lift ?? -1,
                  render:r=><span style={{color:(r.lift??0)>=1?"#00ff88":"#ff4455",fontWeight:800}}>{r.lift!=null?num(r.lift):"-"}</span> },
                { key:"pf", label:"PF", width:62, firstClickDir:"desc", sortValue:r=>r.profitFactor ?? -1,
                  render:r=><span style={{color:(r.profitFactor??0)>=1?"#00ff88":"#ff4455"}}>{r.profitFactor!=null?num(r.profitFactor):"-"}</span> },
                { key:"consistency", label:"POS RUN", width:78, firstClickDir:"desc", sortValue:r=>r.positiveRunConsistency ?? -1,
                  render:r=><span style={{color:"#a8c0d4"}}>{pct(r.positiveRunConsistency)}</span> },
              ];
              return (
                <Sect title="POST-FEE 10 DETECTOR">
                  <div style={S.grid}>
                    <StatCard label="+10 BASE" value={pct(postFee10Analytics.baseline.postFee10HitRate)} sub={`${postFee10Analytics.baseline.postFee10WinnerCount} winners`} c="#66ddaa" />
                    <StatCard label="TOP3 >=75" value={pct(postFee10Analytics.topThreeScore75Pct)} sub="top-three capture" c="#00ff88" />
                    <StatCard label="TOP3 >=85" value={pct(postFee10Analytics.topThreeScore85Pct)} sub="sniper capture" c="#66ddaa" />
                    <StatCard label="GREEN MISS" value={pct(postFee10Analytics.postFee10WinnersMissedByGreenPenaltyPct)} sub="+10 winners missed" c="#ffa500" />
                    <StatCard label="FALSE POS" value={pct(postFee10Analytics.highScoreFalsePositivePct)} sub="score >=75 below +10" c="#ff8855" />
                  </div>
                  <div style={{marginTop:10}}>
                    <SmartTable
                      columns={cols}
                      rows={postFee10Analytics.groups}
                      rowKey={r=>`${r.scope}:${r.key}`}
                      pageSize={25}
                      emptyMsg="No post-fee 10 analytics yet."
                    />
                  </div>
                </Sect>
              );
            })()}

            {closedSamples.length > 0 && (<>

              <Sect title="BY LEVERAGE">
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                  {LEV_OPTS.map(l => {
                    const g   = closedSamples.filter(s=>s.leverage===l);
                    if (!g.length) return null;
                    const wr  = g.filter(s=>s.finalPnlPct>0).length/g.length*100;
                    const avg = g.reduce((s,x)=>s+x.finalPnlPct,0)/g.length;
                    const lc  = l === 1 ? "#00e5ff" : l >= 10 ? "#ff6655" : "#ffa500";
                    return (
                      <div key={l} style={S.card}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{color:lc,fontFamily:"Space Mono",fontSize:18,fontWeight:700}}>{l}×</span>
                          {l === 1 && <span style={{fontSize:7,color:"#00e5ff",background:"#001a22",padding:"1px 4px",borderRadius:2,border:"1px solid #00e5ff33",letterSpacing:0.5}}>SAFE</span>}
                          {l >= 10 && <span style={{fontSize:7,color:"#ff6655",background:"#1a0000",padding:"1px 4px",borderRadius:2,border:"1px solid #ff665533",letterSpacing:0.5}}>RISK</span>}
                        </div>
                        <div style={{color:"#8899cc",fontSize:9,marginTop:2}}>{g.length} trades</div>
                        <div style={{color:wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:6}}>{f2(wr)}% WR</div>
                        <div style={{color:avg>=0?"#00ff88":"#ff4455",fontSize:11}}>{fPct(avg)} avg</div>
                      </div>
                    );
                  })}
                </div>
              </Sect>

              <Sect title="BY ENTRY RANK">
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                  {rankBuckets.map(b => (
                    <div key={b.label} style={S.card}>
                      <div style={{color:"#4488ff",fontSize:12,fontWeight:700}}>{b.label}</div>
                      <div style={{color:"#8899cc",fontSize:9,marginTop:2}}>{b.n} trades</div>
                      {b.wr!=null  && <div style={{color:b.wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:6}}>{f2(b.wr)}% WR</div>}
                      {b.avg!=null && <div style={{color:b.avg>=0?"#00ff88":"#ff4455",fontSize:11}}>{fPct(b.avg)} avg</div>}
                      {!b.n        && <div style={{color:"#8899cc",fontSize:11,marginTop:6}}>no data</div>}
                    </div>
                  ))}
                </div>
              </Sect>

              {hourData.length > 0 && (
                <Sect title="WIN RATE BY UTC ENTRY HOUR">
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8}}>
                    {hourData.map(h => (
                      <div key={h.h} style={{background:"#0c0c14",border:"1px solid #181826",borderRadius:3,padding:"5px 8px",textAlign:"center",minWidth:44}}>
                        <div style={{color:"#8899cc",fontSize:8}}>{String(h.h).padStart(2,"0")}:xx</div>
                        <div style={{color:h.wr>=50?"#00ff88":"#ff4455",fontWeight:700,fontSize:13}}>{f2(h.wr)}%</div>
                        <div style={{color:"#8899cc",fontSize:8}}>n={h.n}</div>
                      </div>
                    ))}
                  </div>
                </Sect>
              )}

              <Sect title="PROFIT LOCK ANALYTICS">
                <div style={S.grid}>
                  <StatCard label="ACTIVATIONS"  value={profitLockStats.activated}        sub="lock triggered"       c="#55ff88" />
                  <StatCard label="LOCK EXITS"   value={profitLockStats.exits}            sub="closed via lock"      c="#00ff88" />
                  <StatCard label="SL AVOIDED"   value={profitLockStats.savedFromSL}      sub="would have been SL"   c="#4488ff" />
                  <StatCard label="PNL SAVED"    value={fPct(profitLockStats.totalSaved)} sub="estimated margin pts" c="#00ff88" />
                  <StatCard label="MISSED LOCK"  value={profitLockStats.missedOpportunities} sub="MFE≥1% but lost"  c="#ffa500" />
                  <StatCard label="STALE OUT"    value={closedSamples.length - cleanSamples.length} sub="stale/invalid excluded" c="#a8a8c8" />
                </div>
              </Sect>

              {(() => {
                const profiles = ["WIN","INSTANT_BAD_ENTRY","CHOPPY_STOP","PROFIT_THEN_REVERSED","SLOW_BLEED"];
                const rows = profiles.map(p => ({ p, g: closedSamples.filter(s=>s.lossProfile===p) })).filter(r=>r.g.length>0);
                if (!rows.length) return null;
                return (
                  <Sect title="LOSS PROFILE">
                    <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                      {rows.map(({p,g}) => {
                        const avgPnl = g.reduce((s,x)=>s+x.finalPnlPct,0)/g.length;
                        const avgMfe = g.reduce((s,x)=>s+(x.mfe??0),0)/g.length;
                        return (
                          <div key={p} style={{...S.card,minWidth:140}}>
                            <div style={{fontSize:8,color:p==="WIN"?"#00ff88":p==="PROFIT_THEN_REVERSED"?"#ff4455":p==="INSTANT_BAD_ENTRY"?"#cc4444":"#888",fontWeight:700,letterSpacing:1,marginBottom:4}}>{p.replace(/_/g," ")}</div>
                            <div style={{color:"#8899cc",fontSize:9}}>{g.length} trades</div>
                            <div style={{color:avgPnl>=0?"#00ff88":"#ff4455",fontSize:13,marginTop:5}}>{fPct(avgPnl)} avg</div>
                            <div style={{color:"#55cc88",fontSize:10}}>MFE {fPct(avgMfe)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </Sect>
                );
              })()}

              {(() => {
                const grades = ["A","B","C","D","F"];
                const rows = grades.map(g => ({ g, arr: closedSamples.filter(s=>s.entryTiming?.entryTimingGrade===g) })).filter(r=>r.arr.length>0);
                if (!rows.length) return null;
                return (
                  <Sect title="ENTRY TIMING GRADE">
                    <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                      {rows.map(({g,arr}) => {
                        const wr  = arr.filter(s=>s.finalPnlPct>0).length/arr.length*100;
                        const avg = arr.reduce((s,x)=>s+x.finalPnlPct,0)/arr.length;
                        const avgMfe = arr.reduce((s,x)=>s+(x.mfe??0),0)/arr.length;
                        const c = g==="A"?"#00ff88":g==="B"?"#00ccff":g==="C"?"#ffa500":g==="D"?"#ff8844":"#ff2233";
                        return (
                          <div key={g} style={S.card}>
                            <div style={{color:c,fontFamily:"Space Mono",fontSize:19,fontWeight:700}}>{g}</div>
                            <div style={{color:"#8899cc",fontSize:9}}>{arr.length} trades</div>
                            <div style={{color:wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:5}}>{f2(wr)}% WR</div>
                            <div style={{color:avg>=0?"#00ff88":"#ff4455",fontSize:10}}>{fPct(avg)} avg</div>
                            <div style={{color:"#55cc88",fontSize:9}}>MFE {fPct(avgMfe)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </Sect>
                );
              })()}

              {(() => {
                const buckets = ["SPREAD_LE_0_02","SPREAD_0_02_TO_0_05","SPREAD_0_05_TO_0_10","SPREAD_GT_0_10"];
                const rows = buckets.map(b => ({ b, arr: closedSamples.filter(s=>s.spreadBucket===b) })).filter(r=>r.arr.length>0);
                if (!rows.length) return null;
                return (
                  <Sect title="SPREAD BUCKET">
                    <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                      {rows.map(({b,arr}) => {
                        const wr  = arr.filter(s=>s.finalPnlPct>0).length/arr.length*100;
                        const avg = arr.reduce((s,x)=>s+x.finalPnlPct,0)/arr.length;
                        const slRate = arr.filter(s => normalizeLongCloseReason(s.closeReason) === CLOSE_REASON.STOP_LOSS).length/arr.length*100;
                        return (
                          <div key={b} style={{...S.card,minWidth:155}}>
                            <div style={{fontSize:8,color:"#9aabcc",fontWeight:700,marginBottom:4}}>{b.replace(/_/g," ")}</div>
                            <div style={{color:"#8899cc",fontSize:9}}>{arr.length} trades</div>
                            <div style={{color:wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:5}}>{f2(wr)}% WR</div>
                            <div style={{color:avg>=0?"#00ff88":"#ff4455",fontSize:10}}>{fPct(avg)} avg</div>
                            <div style={{color:"#664433",fontSize:9}}>SL {f2(slRate)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </Sect>
                );
              })()}

              {(() => {
                const buckets = ["ATR_LE_0_2","ATR_0_2_TO_0_4","ATR_0_4_TO_0_6","ATR_0_6_TO_1_0","ATR_1_0_TO_2_0","ATR_GT_2_0"];
                const rows = buckets.map(b => ({ b, arr: closedSamples.filter(s=>s.atrBucket===b) })).filter(r=>r.arr.length>0);
                if (!rows.length) return null;
                return (
                  <Sect title="ATR BUCKET">
                    <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                      {rows.map(({b,arr}) => {
                        const wr  = arr.filter(s=>s.finalPnlPct>0).length/arr.length*100;
                        const avg = arr.reduce((s,x)=>s+x.finalPnlPct,0)/arr.length;
                        return (
                          <div key={b} style={{...S.card,minWidth:130}}>
                            <div style={{fontSize:8,color:"#9aabcc",fontWeight:700,marginBottom:4}}>{b.replace(/_/g," ")}</div>
                            <div style={{color:"#8899cc",fontSize:9}}>{arr.length} trades</div>
                            <div style={{color:wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:5}}>{f2(wr)}% WR</div>
                            <div style={{color:avg>=0?"#00ff88":"#ff4455",fontSize:10}}>{fPct(avg)} avg</div>
                          </div>
                        );
                      })}
                    </div>
                  </Sect>
                );
              })()}

              {(() => {
                const bounceCtxs = ["FRESH_BREAKDOWN","NEAR_LOW_POSSIBLE_BOUNCE","BOUNCED_AND_REJECTING","BOUNCE_CONTINUING"];
                const rows = bounceCtxs.map(b => ({ b, arr: closedSamples.filter(s=>s.bounceContext===b) })).filter(r=>r.arr.length>0);
                if (!rows.length) return null;
                return (
                  <Sect title="BOUNCE CONTEXT">
                    <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                      {rows.map(({b,arr}) => {
                        const wr  = arr.filter(s=>s.finalPnlPct>0).length/arr.length*100;
                        const avg = arr.reduce((s,x)=>s+x.finalPnlPct,0)/arr.length;
                        const avgMfe = arr.reduce((s,x)=>s+(x.mfe??0),0)/arr.length;
                        return (
                          <div key={b} style={{...S.card,minWidth:145}}>
                            <div style={{fontSize:8,color:"#9aabcc",fontWeight:700,marginBottom:4}}>{b.replace(/_/g," ")}</div>
                            <div style={{color:"#8899cc",fontSize:9}}>{arr.length} trades</div>
                            <div style={{color:wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:5}}>{f2(wr)}% WR</div>
                            <div style={{color:avg>=0?"#00ff88":"#ff4455",fontSize:10}}>{fPct(avg)} avg</div>
                            <div style={{color:"#55cc88",fontSize:9}}>MFE {fPct(avgMfe)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </Sect>
                );
              })()}

              {(() => {
                const sessions = Object.values(sessionMap).sort((a,b)=>b.timestamp-a.timestamp).slice(0,10);
                if (!sessions.length) return null;
                return (
                  <Sect title="SESSION QUALITY HISTORY">
                    <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                      {sessions.map((sess,i) => {
                        const trades = closedSamples.filter(s=>s.sessionQuality===sess.quality && Math.abs((s.entryTime-(sess.timestamp??0))/1000)<1800);
                        const wr = trades.length ? trades.filter(s=>s.finalPnlPct>0).length/trades.length*100 : null;
                        const c = sess.quality==="LONG_TREND_FRIENDLY"?"#00ff88":sess.quality==="BROAD_MARKET_HEADWIND"?"#ff4455":sess.quality==="HIGH_CHOP_CAUTION"?"#ffa500":"#a8a8c8";
                        return (
                          <div key={i} style={{...S.card,minWidth:155}}>
                            <div style={{fontSize:7,color:c,fontWeight:700,letterSpacing:1,marginBottom:3}}>{sess.quality.replace(/_/g," ")}</div>
                            <div style={{color:"#8899cc",fontSize:8,fontFamily:"Space Mono"}}>BTC {fPct(sess.btc1h??0)} · ETH {fPct(sess.eth1h??0)}</div>
                            {wr!=null && <div style={{color:wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:5}}>{f2(wr)}% WR <span style={{fontSize:9,color:"#8899cc"}}>{trades.length}t</span></div>}
                            <div style={{color:"#8899cc",fontSize:8}}>{new Date(sess.timestamp).toUTCString().slice(17,22)} UTC</div>
                          </div>
                        );
                      })}
                    </div>
                  </Sect>
                );
              })()}

              <Sect title="STALE DATA COMPARISON">
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>
                  {[{label:"ALL TRADES",arr:closedSamples},{label:"CLEAN ONLY",arr:cleanSamples}].map(({label,arr}) => {
                    const wr  = arr.length ? arr.filter(s=>s.finalPnlPct>0).length/arr.length*100 : null;
                    const avg = arr.length ? arr.reduce((s,x)=>s+x.finalPnlPct,0)/arr.length : null;
                    return (
                      <div key={label} style={S.card}>
                        <div style={{color:"#9aabcc",fontSize:9,fontWeight:700,marginBottom:4}}>{label}</div>
                        <div style={{color:"#8899cc",fontSize:9}}>{arr.length} trades</div>
                        {wr!=null  && <div style={{color:wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:5}}>{f2(wr)}% WR</div>}
                        {avg!=null && <div style={{color:avg>=0?"#00ff88":"#ff4455",fontSize:10}}>{fPct(avg)} avg</div>}
                        {!arr.length && <div style={{color:"#8899cc",fontSize:11,marginTop:5}}>no data</div>}
                      </div>
                    );
                  })}
                </div>
              </Sect>

              {/* ── Bucket comparison ─────────────────────────────────────────── */}
              <Sect title="PARENT BUCKET COMPARISON">
                {(() => {
                  const buckets = ["TOP_LOSER_LONGS", "TOP_GAINER_LONGS"];
                  const med = arr => {
                    if (!arr.length) return null;
                    const s = [...arr].sort((a,b)=>a-b);
                    const m = Math.floor(s.length/2);
                    return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
                  };
                  return (
                    <div style={{overflowX:"auto",marginTop:8}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"Space Mono",fontSize:9,color:"#9898b8"}}>
                        <thead>
                          <tr style={{borderBottom:"1px solid #2a2a4a"}}>
                            {["BUCKET","ACTIVE","CLOSED","NET PnL","AVG PnL","MED PnL","WIN%","SL%","LOCK%","TRAIL%","TIME%","AVG MFE","AVG MAE","BEST","WORST"].map(h =>
                              <th key={h} style={{padding:"4px 8px",textAlign:"right",color:"#5888c0",fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {buckets.map(b => {
                            const bc = b === "TOP_LOSER_LONGS" ? "#ff4455" : "#00cc66";
                            const actv = rankedSamples.filter(s => !s.closed && s.longParentBucket === b);
                            const clsd = rankedSamples.filter(s => s.closed  && s.longParentBucket === b);
                            const n    = clsd.length;
                            const net  = clsd.reduce((s,x)=>s+(x.finalPnlPct??0),0);
                            const avg  = n ? net/n : null;
                            const med_ = med(clsd.map(x=>x.finalPnlPct??0));
                            const wr   = n ? clsd.filter(x=>(x.finalPnlPct??0)>0).length/n*100 : null;
                            const slr  = n ? clsd.filter(x => normalizeLongCloseReason(x.closeReason) === CLOSE_REASON.STOP_LOSS).length/n*100 : null;
                            const lkr  = n ? clsd.filter(x => normalizeLongCloseReason(x.closeReason) === CLOSE_REASON.PROFIT_LOCK).length/n*100 : null;
                            const trr  = n ? clsd.filter(x => normalizeLongCloseReason(x.closeReason) === CLOSE_REASON.TRAILING_EXIT).length/n*100 : null;
                            const tir  = n ? clsd.filter(x => normalizeLongCloseReason(x.closeReason) === CLOSE_REASON.TIMEOUT).length/n*100 : null;
                            const mfe  = n ? clsd.reduce((s,x)=>s+(x.mfe??0),0)/n : null;
                            const mae  = n ? clsd.reduce((s,x)=>s+(x.mae??0),0)/n : null;
                            const best = n ? Math.max(...clsd.map(x=>x.finalPnlPct??0)) : null;
                            const wrst = n ? Math.min(...clsd.map(x=>x.finalPnlPct??0)) : null;
                            const fmt  = v => v==null?"—":f2(v);
                            const fmtP = v => v==null?"—":`${f2(v)}%`;
                            return (
                              <tr key={b} style={{borderBottom:"1px solid #1a1a30"}}>
                                <td style={{padding:"5px 8px",color:bc,fontWeight:700,whiteSpace:"nowrap"}}>{b.replace("_SHORTS","").replace(/_/g," ")}</td>
                                <td style={{padding:"5px 8px",textAlign:"right"}}>{actv.length}</td>
                                <td style={{padding:"5px 8px",textAlign:"right"}}>{n}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:net>=0?"#00ff88":"#ff4455"}}>{fmtP(net)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:avg!=null&&avg>=0?"#00ff88":"#ff4455"}}>{fmtP(avg)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:med_!=null&&med_>=0?"#55ff88":"#ff8866"}}>{fmtP(med_)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:wr!=null&&wr>=50?"#00ff88":"#ff4455"}}>{fmtP(wr)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:slr!=null&&slr>40?"#ff4455":"#9898b8"}}>{fmtP(slr)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right"}}>{fmtP(lkr)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right"}}>{fmtP(trr)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right"}}>{fmtP(tir)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:"#55ff88"}}>{fmtP(mfe)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:"#ff8855"}}>{fmtP(mae)}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:"#00ff88"}}>{best!=null?fPct(best):"—"}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:"#ff4455"}}>{wrst!=null?fPct(wrst):"—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </Sect>

              {/* ── Sub-bucket stats ──────────────────────────────────────────── */}
              <Sect title="SUB-BUCKET STATS (analysis only — need 50+ closed trades)">
                {(() => {
                  const subMap = {};
                  rankedSamples.filter(s => s.closed && s.longSubBucket && s.longSubBucket !== "UNCLASSIFIED").forEach(s => {
                    if (!subMap[s.longSubBucket]) subMap[s.longSubBucket] = { parent: s.longParentBucket ?? "", trades: [] };
                    subMap[s.longSubBucket].trades.push(s);
                  });
                  const entries = Object.entries(subMap).sort((a,b) => b[1].trades.length - a[1].trades.length);
                  if (!entries.length) return <div style={{color:"#5060a0",fontSize:10,padding:"10px 0"}}>No classified sub-buckets yet — trades show UNCLASSIFIED until telemetry completes.</div>;
                  return (
                    <div style={{overflowX:"auto",marginTop:8}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"Space Mono",fontSize:9,color:"#9898b8"}}>
                        <thead>
                          <tr style={{borderBottom:"1px solid #2a2a4a"}}>
                            {["SUB-BUCKET","PARENT","N","NET PnL","AVG PnL","WIN%","SL%","AVG MFE","AVG MAE"].map(h =>
                              <th key={h} style={{padding:"4px 8px",textAlign:"right",color:"#5888c0",fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(([sub, {parent, trades}]) => {
                            const n   = trades.length;
                            const net = trades.reduce((s,x)=>s+(x.finalPnlPct??0),0);
                            const avg = n ? net/n : null;
                            const wr  = n ? trades.filter(x=>(x.finalPnlPct??0)>0).length/n*100 : null;
                            const slr = n ? trades.filter(x => normalizeLongCloseReason(x.closeReason) === CLOSE_REASON.STOP_LOSS).length/n*100 : null;
                            const mfe = n ? trades.reduce((s,x)=>s+(x.mfe??0),0)/n : null;
                            const mae = n ? trades.reduce((s,x)=>s+(x.mae??0),0)/n : null;
                            const warn = n < 20;
                            return (
                              <tr key={sub} style={{borderBottom:"1px solid #1a1a30",opacity:warn?0.55:1}}>
                                <td style={{padding:"5px 8px",color:warn?"#ffa500":"#d0d0e0",whiteSpace:"nowrap"}}>
                                  {sub.replace(/_/g," ")}{warn?" ⚠":""}
                                </td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:"#7888b0",fontSize:8}}>{parent.replace("_SHORTS","").replace(/_/g," ")}</td>
                                <td style={{padding:"5px 8px",textAlign:"right"}}>{n}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:net>=0?"#00ff88":"#ff4455"}}>{f2(net)}%</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:avg!=null&&avg>=0?"#00ff88":"#ff4455"}}>{avg!=null?f2(avg)+"%" : "—"}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:wr!=null&&wr>=50?"#00ff88":"#ff4455"}}>{wr!=null?f2(wr)+"%" : "—"}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:slr!=null&&slr>40?"#ff4455":"#9898b8"}}>{slr!=null?f2(slr)+"%" : "—"}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:"#55ff88"}}>{mfe!=null?f2(mfe)+"%" : "—"}</td>
                                <td style={{padding:"5px 8px",textAlign:"right",color:"#ff8855"}}>{mae!=null?f2(mae)+"%" : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div style={{fontSize:8,color:"#5060a0",marginTop:6}}>⚠ = fewer than 20 closed trades — do not trust. Prefer 50+ before conclusions.</div>
                    </div>
                  );
                })()}
              </Sect>

            </>)}
          </div>
        )}

        {/* â•â•â• IC RESEARCH â•â•â• */}
        {tab === "research" && (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={S.secLbl}>INFORMATION COEFFICIENT — Pearson r (signal vs final PnL%)</div>
              <TBtn on={cleanIcOnly} c="#4488ff" onClick={()=>setCleanIcOnly(t=>!t)}>CLEAN ONLY</TBtn>
              {cleanIcOnly && <span style={{fontSize:8,color:"#9aabcc",fontFamily:"Space Mono"}}>STALE: {closedSamples.length - cleanSamples.length} excluded</span>}
            </div>
            <div style={{color:"#8899cc",fontSize:9,marginBottom:16,fontFamily:"Space Mono",lineHeight:1.6}}>
              Positive IC = signal predicts profitable short · Negative = anti-predictive · |r| &gt; 0.3 = meaningful
            </div>

            {closedSamples.length < 3 && (
              <div style={{color:"#9090c8",fontFamily:"Space Mono",fontSize:11,padding:"30px 0",textAlign:"center"}}>
                Need 3+ closed samples to compute IC.
              </div>
            )}

            {closedSamples.length >= 3 && (
              <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:24}}>
                {icResults.map(sig => (
                  <div key={sig.key} style={S.icRow}>
                    <span style={{flex:2,color:"#c8ccdc",fontSize:11}}>{sig.label}</span>
                    <span style={{flex:0.55,textAlign:"center",color:"#8899cc",fontSize:9,fontFamily:"Space Mono"}}>n={sig.n}</span>
                    <span style={{flex:3.5,display:"flex",alignItems:"center",gap:8}}>
                      {sig.ic != null ? (<>
                        <div style={{flex:1,height:5,background:"#0c0c14",borderRadius:2,position:"relative"}}>
                          <div style={{
                            position:"absolute", height:"100%", borderRadius:2,
                            width:`${Math.abs(sig.ic)*50}%`,
                            background:icColor(sig.ic),
                            left: sig.ic >= 0 ? "50%" : `${50-Math.abs(sig.ic)*50}%`,
                          }}/>
                          <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:"#1a1a2a"}}/>
                        </div>
                        <span style={{color:icColor(sig.ic),fontFamily:"Space Mono",fontSize:11,minWidth:50,textAlign:"right"}}>
                          {sig.ic>0?"+":""}{f3(sig.ic)}
                        </span>
                        <span style={{color:"#8899cc",fontSize:9,minWidth:62}}>
                          {Math.abs(sig.ic)>0.3?"★ STRONG":Math.abs(sig.ic)>0.15?"◆ MOD":"· WEAK"}
                        </span>
                      </>) : (
                        <span style={{color:"#8899cc",fontSize:10,fontFamily:"Space Mono"}}>need more data</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {closedSamples.length >= 1 && (
              <Sect title="SIGNAL CAPTURE RATE">
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                  {IC_SIGNALS.map(sig => {
                    const n    = closedSamples.filter(s=>s[sig.key]!=null).length;
                    const rate = closedSamples.length ? n/closedSamples.length*100 : 0;
                    return (
                      <div key={sig.key} style={{...S.card,minWidth:115}}>
                        <div style={{color:"#9aabcc",fontSize:9,lineHeight:1.4,marginBottom:4}}>{sig.label}</div>
                        <div style={{color:rate>80?"#00ff88":rate>40?"#ffa500":"#ff4455",fontFamily:"Space Mono",fontWeight:700,fontSize:18}}>{f2(rate)}%</div>
                        <div style={{color:"#8899cc",fontSize:9}}>{n}/{closedSamples.length}</div>
                      </div>
                    );
                  })}
                </div>
              </Sect>
            )}

            {closedSamples.filter(s=>s.funding!=null).length >= 2 && (
              <Sect title="FUNDING RATE BUCKETS vs OUTCOME">
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                  {[
                    {label:"Very Neg\n< −0.1%",   fn:s=>s.funding<-0.1},
                    {label:"Neg\n−0.1 to 0%",     fn:s=>s.funding>=-0.1&&s.funding<-0.01},
                    {label:"Neutral\n≈ 0",         fn:s=>Math.abs(s.funding)<0.01},
                    {label:"Positive\n> 0.01%",    fn:s=>s.funding>0.01},
                  ].map(b => {
                    const g   = closedSamples.filter(s=>s.funding!=null&&b.fn(s));
                    const wr  = g.length ? g.filter(s=>s.finalPnlPct>0).length/g.length*100 : null;
                    const avg = g.length ? g.reduce((s,x)=>s+x.finalPnlPct,0)/g.length : null;
                    return (
                      <div key={b.label} style={{...S.card,minWidth:140}}>
                        <div style={{color:"#9aabcc",fontSize:9,whiteSpace:"pre-line",lineHeight:1.5,marginBottom:4}}>{b.label}</div>
                        <div style={{color:"#8899cc",fontSize:9}}>{g.length} trades</div>
                        {wr!=null  && <div style={{color:wr>=50?"#00ff88":"#ff4455",fontSize:13,marginTop:5}}>{f2(wr)}% WR</div>}
                        {avg!=null && <div style={{color:avg>=0?"#00ff88":"#ff4455",fontSize:11}}>{fPct(avg)} avg</div>}
                        {!g.length && <div style={{color:"#8899cc",fontSize:11,marginTop:5}}>no data</div>}
                      </div>
                    );
                  })}
                </div>
              </Sect>
            )}
          </div>
        )}

        {/* â•â•â• FILTERS â•â•â• */}
        {tab === "filters" && (
          <FiltersTab samples={samples} tickDirectionHealth={tickDirectionHealth} />
        )}


        {/* AES DISCOVERY */}
        {tab === "aes-discovery" && (
          <AesDiscoveryTab
            discoveryEvents={aesDiscoveryEvents}
            shadowTrades={aesShadowTrades}
            scannerHealth={discoveryScannerHealth}
            universeMeta={discoveryUniverseMeta}
            queueSnapshot={discoveryQueueSnapshot}
            performanceCounters={discoveryPerfCounters}
          />
        )}

        {/* ─── SHADOW LONG ─── */}
        {tab === "shadow-long" && (
          <ShadowLongAuditTab shadowLongAudits={[]} />
        )}

        {/* ─── FEES ─── */}
        {tab === "fees" && (
          <FeesTab trades={samples} />
        )}

        {/* ─── LONG AUDIT redirect ─── */}
        {tab === "long-audit" && (
          <ShadowLongAuditTab shadowLongAudits={[]} />
        )}

      </div>

      {/* ─── CommandPalette (Cmd+K) ─────────────────────────────────── */}
      <CommandPalette
        setTab={setTabAndPersist}
        symbols={loserTickers.slice(0,50).map(t=>t.symbol)}
        onRun={() => setRun(r => r + 1)}
        onExportCsv={exportCSV}
        onExportJson={exportJSON}
        onRefresh={() => fetchData()}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppCore />
    </ToastProvider>
  );
}

// ─── ACTIVE CARD ─────────────────────────────────────────────────────────────
function RsiTelemetryRow({ s }) {
  if (!s.rsiTelemetry) return null;
  const rsi = v => v == null || Number.isNaN(Number(v)) ? "?" : Number(v).toFixed(1);
  return (
    <div style={{
      fontSize: 8,
      color: "#a8bcd0",
      fontFamily: "Space Mono",
      marginTop: 3,
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      borderTop: "1px solid #101020",
      paddingTop: 3,
    }}>
      <span>RSI 1m:{rsi(s.rsi1m)} {s.rsi1mSlope ?? ""}</span>
      <span>3m:{rsi(s.rsi3m)} {s.rsi3mSlope ?? ""}</span>
      <span>5m:{rsi(s.rsi5m)} {s.rsi5mSlope ?? ""}</span>
      <span>15m:{rsi(s.rsi15m)} {s.rsi15mSlope ?? ""}</span>
      <span style={{
        color:
          s.rsiCompositeLabel === "RSI_SHORT_BIAS" ? "#ff9955" :
          s.rsiCompositeLabel === "RSI_LONG_BIAS" ? "#55ff88" :
          "#a8bcd0",
      }}>
        {s.rsiCompositeLabel ?? "RSI_UNKNOWN"}
      </span>
      <span>SHORT_SCORE:{s.rsiShortScore ?? 0}</span>
    </div>
  );
}

function ActiveCard({ s, now, trailOn, onClose, onRemove, noteEditing, noteText, onEditNote, setNoteText, saveNote }) {
  const timeLeft    = (s.holdMs ?? HOLD_MS) - (now - s.entryTime);
  const liveNormPct = (s.currentPrice - s.entryPrice) / s.entryPrice * 100;
  const livePnl     = liveNormPct * s.leverage;
  const feeDrag     = computeFeeDragMarginPct(s.leverage);
  const liveNetPnl  = livePnl - feeDrag;
  const liveFeeFlipped = livePnl > 0 && liveNetPnl < 0;
  const hist     = s.priceHistory || [];
  const hMin     = hist.length ? Math.min(...hist.map(p=>p.p)) : s.entryPrice;
  const hMax     = hist.length ? Math.max(...hist.map(p=>p.p)) : s.entryPrice;
  const hRange   = hMax - hMin;

  return (
    <div className="slide-in sample-card-hover" style={{...S.sampleCard, borderLeft:`3px solid ${livePnl>=0?"#00ff8844":"#ff445544"}`}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>

        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6,flexWrap:"wrap"}}>
            <a href={`https://www.binance.com/en/futures/${s.symbol}`} target="_blank" rel="noreferrer"
               style={{color:"#f0f0ff",fontWeight:800,fontSize:14,textDecoration:"none",letterSpacing:0.5}}>{s.symbol.replace("USDT","")}</a>
            <span style={{color:"#ffa500",fontFamily:"Space Mono",fontWeight:700,fontSize:11}}>{s.leverage}×</span>
            <span style={{display:"inline-flex",flexDirection:"column",gap:1}}>
              <span style={{color:livePnl>=0?"#00ff88":"#ff4455",fontFamily:"Space Mono",fontWeight:700,fontSize:14}}>{fPct(livePnl)}</span>
              <span style={{color:liveNetPnl>=0?"#00cc66":"#cc3344",fontFamily:"Space Mono",fontSize:9,opacity:0.85}}>
                net {Number(liveNetPnl)>=0?"+":""}{safeFixed(liveNetPnl,2,"?")}%{liveFeeFlipped?" ⚠":""}
              </span>
            </span>
            {s.trailActive && <span style={{color:"#00ff88",fontSize:8,background:"#001408",padding:"2px 5px",borderRadius:2,letterSpacing:1}}>⬆ TRAILING</span>}
            {(s.profitLockStrategyActive || s.profitLockActive) && (() => {
              const verified = s.profitLockProtectionVerified === true;
              const breached = s.profitLockProtectionState === PROFIT_LOCK_PROTECTION_STATE.FLOOR_BREACHED_UNCLOSED;
              const label = breached
                ? "FLOOR BREACHED"
                : verified
                  ? `FLOOR PROTECTED · ${s.profitLockProtectionVenue ?? "LOCAL"}`
                  : `LOCK CALCULATED · ${s.profitLockProtectionState ?? "PENDING"}`;
              const color = breached ? "#ff3344" : verified ? "#55ff88" : "#ffa500";
              return (
                <span title={`Stage ${s.profitLockStage ?? "?"} · floor ${fPct(s.profitLockLevelMarginPct ?? 0)}`} style={{color,fontSize:8,background:breached?"#240006":verified?"#001408":"#1b1000",padding:"2px 6px",borderRadius:2,letterSpacing:0.6}}>
                  {label}
                </span>
              );
            })()}
            {s.exitProfileSelected && s.exitProfileSelected !== "NORMAL" && (
              <span style={{
                color: s.exitProfileSelected==="RUNNER"?"#00ff88":s.exitProfileSelected==="FAST"?"#ffa500":"#55ccff",
                fontSize:8, background:"#001010", padding:"2px 6px", borderRadius:2, letterSpacing:1,
              }}>
                {s.exitProfileSelected}
              </span>
            )}
            <span style={{color:"#99aac8",fontSize:9}}>#{s.entryRank} · Run#{normalizeRunValue(s.run, "?")}</span>
            {s.sessionQuality && s.sessionQuality !== "MIXED_SESSION" && (
              <span style={{fontSize:7,color:s.sessionQuality==="LONG_TREND_FRIENDLY"?"#00ff88":s.sessionQuality==="BROAD_MARKET_HEADWIND"?"#ff4455":"#ffa500",letterSpacing:1}}>{s.sessionQuality.slice(0,8)}</span>
            )}
          </div>

          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:5}}>
            <SF label="ENTRY"  v={fPrice(s.entryPrice)}   c="#a0aaba" />
            <SF label="NOW"    v={fPrice(s.currentPrice)} c={s.currentPrice>=s.entryPrice?"#00ff88":"#ff4455"} />
            <SF label="SL"     v={fPrice(s.slPrice)}      c="#ff4455" />
            <SF label="TP"     v={fPrice(s.tpPrice)}      c="#00ff88" />
            <SF label="MAE"    v={fPct(s.mae||0)}         c="#ff8855" />
            <SF label="MFE"    v={fPct(s.mfe||0)}         c="#55ff88" />
          </div>

          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {s.funding!=null   && <SF label="FUND"   v={fPct(s.funding)}    c={s.funding<-0.05?"#ff7788":s.funding>0.05?"#00ff88":"#99b4c8"} />}
            {(s.cvdStateAtEntry || s.cvdLabel) && <SF
              label="CVD ENTRY"
              v={s.cvdLongInterpretation ?? s.cvdStateAtEntry ?? s.cvdLabel}
              c={s.cvdContradictsLongAtEntry===true?"#ff4455":s.cvdSupportsLongAtEntry===true?"#00ff88":"#aaa"}
            />}
            {s.cvdStateCurrent && s.cvdStateCurrent !== s.cvdStateAtEntry && <SF label="CVD NOW" v={s.cvdStateCurrent} c={s.cvdStateCurrent==="BEAR"?"#ff4455":s.cvdStateCurrent==="BULL"?"#00ff88":"#aaa"} />}
            {s.atrPct!=null    && <SF label="ATR" v={`${f3(s.atrPct)} · ${s.longAtrContext ?? "UNCLASSIFIED"}`} c={s.longAtrContext==="QUALIFIED_VOLATILITY_BOOST"?"#00ff88":s.longAtrContext?.includes("DANGER")||s.longAtrContext?.includes("EXTREME")?"#ff8855":"#99b4c8"} />}
            {s.spreadPct!=null && <SF label="SPREAD" v={`${s.spreadPct}%`}   c={s.spreadPct>0.10?"#ffa500":s.spreadPct>0.05?"#cc8844":"#99b4c8"} />}
            {s.volAccel!=null  && <SF label="VOL↑"   v={`${s.volAccel}%`}    c={s.volAccel>20?"#ffa500":s.volAccel<-20?"#4488ff":"#99b4c8"} />}
            <SF label="BOUNCE" v={`${f2(s.bounceFromLow)}%`} c="#b0bec8" />
            <SF label="↓HIGH"  v={`${f2(s.distFromHigh)}%`}  c="#b0bec8" />
            <SF label="UTC"    v={`${String(s.utcHour).padStart(2,"0")}:00`} c="#b0bec8" />
            {s.bounceContext && <SF label="BCTX" v={s.bounceContext.replace(/_/g," ").slice(0,14)} c="#b0bec8" />}
          </div>

          {s.warningFlags?.length > 0 && (
            <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>
              {s.warningFlags.map(f => (
                <span key={f} style={{fontSize:7,color:"#cc9966",background:"#100a00",padding:"1px 4px",borderRadius:2}}>{f}</span>
              ))}
            </div>
          )}

          {s.entryTiming && (
            <div style={{fontSize:8,color:"#99b4c8",fontFamily:"Space Mono",marginTop:4,display:"flex",gap:8,flexWrap:"wrap"}}>
              <span style={{color:s.entryTiming.entryTimingGrade==="A"?"#00ff88":s.entryTiming.entryTimingGrade==="B"?"#00ccff":s.entryTiming.entryTimingGrade==="C"?"#ffa500":s.entryTiming.entryTimingGrade==="F"?"#ff2233":"#ff4455"}}>
                TIMING:{s.entryTiming.entryTimingGrade}
              </span>
              <span>3T:{s.entryTiming.last3TicksDirection}</span>
              <span>μB:{f2(s.entryTiming.microBouncePct??0)}%</span>
              <span>ADV:{f2(s.entryTiming.preEntryAdverseMovePct??0)}%</span>
              <span>VWAP:{fPct(s.entryTiming.priceVsVwapPct??0)}</span>
            </div>
          )}

          {s.entryTelemetry && (
            <div style={{fontSize:8,color:"#99b4c8",fontFamily:"Space Mono",marginTop:3,display:"flex",gap:8,flexWrap:"wrap",borderTop:"1px solid #0e0e18",paddingTop:3}}>
              <span style={{
                color: s.priceVsVwapLabel==="ABOVE_VWAP"?"#ffa055":s.priceVsVwapLabel==="BELOW_VWAP"?"#55aaff":"#66aa77",
              }}>
                ET·VWAP:{s.priceVsVwapPct!=null?fPct(s.priceVsVwapPct):"?"}({s.priceVsVwapLabel??"-"})
              </span>
              {s.candleColorAtEntry && s.candleColorAtEntry !== "UNKNOWN" && (
                <span style={{color:s.candleColorAtEntry==="GREEN"?"#00cc55":s.candleColorAtEntry==="RED"?"#cc4455":"#8899aa"}}>
                  {s.candleColorAtEntry} B:{f2(s.candleBodyPct??0)}% U:{f2(s.upperWickPct??0)}% L:{f2(s.lowerWickPct??0)}%
                </span>
              )}
              {s.impulseDirection && s.impulseDirection !== "UNKNOWN" && s.impulseDirection !== "NONE" && (
                <span style={{color:s.impulseDirection==="RED"?"#ff4455":"#00ff88",fontWeight:700}}>
                  {s.impulseDirection}·{s.impulseStrength}
                </span>
              )}
              {s.entryTimingReason && s.entryTimingReason !== "UNKNOWN" && (
                <span style={{color:"#b0bec8"}}>{s.entryTimingReason.replace(/_/g,"·")}</span>
              )}
              {s.entryBounceContext && s.entryBounceContext !== "UNKNOWN" && (
                <span style={{color:"#b0bec8"}}>{s.entryBounceContext.replace(/_/g," ")}</span>
              )}
              {!s.telemetryComplete && (
                <span style={{color:"#cc7733",fontSize:7}}>⚠ TELEM INCOMPLETE</span>
              )}
            </div>
          )}

          <RsiTelemetryRow s={s} />

          {s.trendTelemetry && (
            <div style={{
              fontSize: 8,
              color: "#a8bcd0",
              fontFamily: "Space Mono",
              marginTop: 3,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              borderTop: "1px solid #101020",
              paddingTop: 3,
            }}>
              <span>EMA1m:{s.emaPricePosition1m ?? "?"}/{s.emaSlopeBias1m ?? "?"}</span>
              <span>EMA3m:{s.emaPricePosition3m ?? "?"}/{s.emaSlopeBias3m ?? "?"}</span>
              <span>ADX5m:{s.adx14_5m ?? "?"} {s.dmiBias5m ?? ""}</span>
              <span>MACD3m:{s.macdHistogramState3m ?? "?"}</span>
              <span>{s.trendCompositeLabel ?? "TREND_UNKNOWN"}</span>
              <span>SHORT_SCORE:{s.trendShortScore ?? 0}</span>
            </div>
          )}

          {s.advancedMarketTelemetry && (
            <div style={{
              fontSize: 8,
              color: "#a8bcd0",
              fontFamily: "Space Mono",
              marginTop: 3,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              borderTop: "1px solid #101020",
              paddingTop: 3,
            }}>
              <span>BB:{s.bbExtension3m ?? "?"}</span>
              <span>KC:{s.kcExtension3m ?? "?"}</span>
              <span>STRUCT:{s.structure3m ?? "?"}</span>
              <span>OI:{s.oiPriceDivergence5m ?? "?"}</span>
              <span>MFI:{s.mfi14_3m ?? "?"}/{s.mfiSlope3m ?? "?"}</span>
              <span>CMF:{s.cmfBias3m ?? "?"}</span>
              <span>{s.advancedCompositeLabel ?? "ADVANCED_UNKNOWN"}</span>
            </div>
          )}

          {s.marketContext && (
            <div style={{
              fontSize:8,
              color:"#99b4c8",
              fontFamily:"Space Mono",
              marginTop:3,
              display:"flex",
              gap:8,
              flexWrap:"wrap",
              borderTop:"1px solid #101020",
              paddingTop:3,
            }}>
              <span style={{
                color:
                  s.btcShortBias === "STRONG_TAILWIND" ? "#00ff88" :
                  s.btcShortBias === "WEAK_TAILWIND" ? "#66cc88" :
                  s.btcShortBias === "STRONG_HEADWIND" ? "#ff4455" :
                  s.btcShortBias === "WEAK_HEADWIND" ? "#ff9955" :
                  "#8899aa",
              }}>
                BTC.{s.btcRegime ?? "UNKNOWN"} SHORT:{s.btcShortBias ?? "?"}
              </span>

              <span>
                15m:{s.btcDirection15m ?? "?"} {s.btcChange15mPct != null ? fPct(s.btcChange15mPct) : ""}
              </span>

              <span>
                1h:{s.btcDirection1h ?? "?"} {s.btcChange1hPct != null ? fPct(s.btcChange1hPct) : ""}
              </span>

              <span>
                2h:{s.btcDirection2h ?? "?"} {s.btcChange2hPct != null ? fPct(s.btcChange2hPct) : ""}
              </span>

              <span>SCORE:{s.btcLongTailwindScore ?? 0}</span>

              {s.btcContextStale && (
                <span style={{color:"#cc7733"}}>BTC STALE</span>
              )}
            </div>
          )}

          {s.liveExitAuditVersion && (() => {
            const labelColor = {
              WOULD_HOLD:            "#8899aa",
              WOULD_WAIT_FOR_MIN_TIME: "#606880",
              WOULD_ALLOW_RUNNER:    "#00ff88",
              WOULD_PROTECT_PROFIT:  "#55aaff",
              WOULD_TIGHTEN:         "#ffcc44",
              WOULD_FAST_EXIT:       "#ff8833",
              WOULD_EMERGENCY_EXIT:  "#ff3344",
            }[s.liveExitLabel] ?? "#8899aa";
            return (
              <div style={{
                fontSize: 8,
                color: "#99b4c8",
                fontFamily: "Space Mono",
                marginTop: 3,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                borderTop: "1px solid #101020",
                paddingTop: 3,
              }}>
                <span style={{color:"#6677aa",fontWeight:700}}>LIVE·EXIT·AUDIT</span>
                <span style={{color:labelColor,fontWeight:700}}>{s.liveExitLabel?.replace(/_/g,"·")}</span>
                <span style={{color:"#4a5060",fontSize:7,padding:"1px 4px",background:"#0a0a14",borderRadius:2,letterSpacing:1}}>LOG ONLY · NO EXIT IMPACT</span>
                <span>SCORE:{s.liveExitScore ?? "?"}</span>
                {s.liveExitBuyerDanger && <span style={{color:"#ff5544"}}>⚠ BUYER</span>}
                <span>RC:{s.liveExitRunnerCapturePotentialScore ?? "?"}</span>
                <span>LC:{s.liveExitPostFee10LiveConfirmationScore ?? "?"}</span>
                {s.liveExitPrimaryReason && s.liveExitPrimaryReason !== "NO_MAJOR_EXIT_SIGNAL" && (
                  <span style={{color:"#7788aa"}}>{s.liveExitPrimaryReason.replace(/_/g,"·")}</span>
                )}
                {s.liveExitRecommendedProfileLogOnly && s.liveExitRecommendedProfileLogOnly !== "NORMAL" && (
                  <span style={{color:"#6688bb"}}>→{s.liveExitRecommendedProfileLogOnly}</span>
                )}
              </div>
            );
          })()}

          {s.notes && (
            <div style={{marginTop:5,fontSize:9,color:"#9aabcc",padding:"3px 6px",background:"#0a0a14",borderRadius:2}}>ðŸ“ {s.notes}</div>
          )}
        </div>

        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
          <svg width={110} height={40} style={{display:"block"}}>
            {hist.length > 2 && hRange > 0 && hist.slice(1).map((pt,i) => {
              const prev = hist[i];
              const x1   = i/(hist.length-1)*110;
              const x2   = (i+1)/(hist.length-1)*110;
              const y1   = 3 + (hMax - prev.p)/hRange * 34;
              const y2   = 3 + (hMax - pt.p)  /hRange * 34;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={livePnl>=0?"#00ff88":"#ff4455"} strokeWidth={1.5} opacity={0.65}/>;
            })}
            {hRange > 0 && (() => {
              const ey = 3 + (hMax - s.entryPrice)/hRange * 34;
              return <line x1={0} x2={110} y1={ey} y2={ey} stroke="#ffffff15" strokeWidth={1} strokeDasharray="3 2"/>;
            })()}
            {s.trailPeak && hRange > 0 && (() => {
              const ty = 3 + (hMax - s.trailPeak)/hRange * 34;
              return <line x1={0} x2={110} y1={ty} y2={ty} stroke="#00ff8825" strokeWidth={1} strokeDasharray="2 2"/>;
            })()}
          </svg>
          <div style={{fontFamily:"Space Mono",fontSize:10,color:timeLeft<600_000?"#ffa500":"#6890a0"}}>{fTime(timeLeft)}</div>
          <div style={{display:"flex",gap:3}}>
            <button onClick={onEditNote} style={{...S.actBtn,color:"#9aabcc",borderColor:"#0e0e18",fontSize:8}}>ðŸ“</button>
            <button onClick={onClose}    style={{...S.actBtn,color:"#ffa500",borderColor:"#1a0a00",fontSize:8}}>✕ CLOSE</button>
            <button onClick={onRemove}   style={S.rmBtn}>×</button>
          </div>
        </div>
      </div>

      {noteEditing && (
        <div style={{marginTop:8,display:"flex",gap:6}}>
          <input value={noteText} onChange={e=>setNoteText(e.target.value)}
            placeholder="Entry context notes…"
            style={{flex:1,background:"#0a0a14",border:"1px solid #1a1a2a",borderRadius:3,color:"#dde4f4",padding:"4px 8px",fontSize:10,fontFamily:"Space Mono"}}
            onKeyDown={e=>e.key==="Enter"&&saveNote()} autoFocus />
          <Btn c="#00ff88" onClick={saveNote}>SAVE</Btn>
        </div>
      )}
    </div>
  );
}

// ─── CLOSED CARD ─────────────────────────────────────────────────────────────
function ClosedCard({ s, onRemove, noteEditing, noteText, onEditNote, setNoteText, saveNote, linkedAudit, onOpenAudit }) {
  const pnl    = s.finalPnlPct;
  const netPnl = s.feeAdjustedMarginPnlPct ?? null;
  const normalizedReason = normalizeLongCloseReason(s.canonicalCloseReason ?? s.closeReason);
  const rc     = [CLOSE_REASON.TAKE_PROFIT, CLOSE_REASON.TRAILING_EXIT, CLOSE_REASON.PROFIT_LOCK].includes(normalizedReason) ? "#00ff88"
               : normalizedReason === CLOSE_REASON.STOP_LOSS ? "#ff4455"
               : [CLOSE_REASON.RUN_STOP, CLOSE_REASON.APP_SHUTDOWN].includes(normalizedReason) ? "#aa88ff"
               : "#ffa500";
  const feeFlipped = s.feeStatusLabel === "FEE_FLIPPED_WIN_TO_LOSS";

  // L↗ badge state for linked Shadow LONG audit
  const auditBadge = linkedAudit ? (() => {
    const outcome = linkedAudit.outcomeLabel ?? "";
    const status  = linkedAudit.status;
    if (status === "ACTIVE" || status === "PENDING_ENTRY") return { label: "L↗ ACTIVE", color: "#5599ff" };
    if (outcome.includes("FULL_RESCUE_AND_PROFIT")) return { label: "L↗ RESCUED", color: "#00ff88" };
    if (outcome.includes("FULL_RESCUE"))  return { label: "L↗ RESCUED", color: "#55ff99" };
    if (outcome.includes("PARTIAL"))      return { label: "L↗ PARTIAL", color: "#ffaa44" };
    if (outcome.includes("WHIPSAW"))      return { label: "L↗ WHIPSAW", color: "#ff2222" };
    if (outcome.includes("ADDED_TO"))     return { label: "L↗ FAILED",  color: "#ff4455" };
    return { label: "L↗ FAILED", color: "#ff4455" };
  })() : null;

  return (
    <div className="sample-card-hover" style={{...S.sampleCard,opacity:0.72,borderLeft:`3px solid ${pnl>=0?"#00ff8833":"#ff445533"}`}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{color:"#e0e4f8",fontWeight:800,fontSize:13,letterSpacing:0.5}}>{s.symbol.replace("USDT","")}</span>
        <span style={{color:"#ffa500",fontFamily:"Space Mono",fontSize:10}}>{s.leverage}×
          {s.entryTiming?.entryTimingGrade && <span style={{color:"#9aabcc",fontSize:8,marginLeft:4}}>T:{s.entryTiming.entryTimingGrade}</span>}
        </span>
        <span style={{display:"inline-flex",flexDirection:"column",gap:1}}>
          <span style={{color:pnl>=0?"#00ff88":"#ff4455",fontFamily:"Space Mono",fontWeight:700,fontSize:14}}>{fPct(pnl)}</span>
          {netPnl != null && (
            <span style={{color:netPnl>=0?"#00cc66":"#cc3344",fontFamily:"Space Mono",fontSize:9,opacity:0.85}}>
              net {Number(netPnl)>=0?"+":""}{safeFixed(netPnl,2,"?")}%{feeFlipped?" ⚠ FEE_FLIPPED":""}
            </span>
          )}
        </span>
        <span style={{fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:2,background:`${rc}18`,color:rc}}>{s.closeReason}</span>
        {s.closeReason === "PROFIT_LOCK" && (
          <span style={{fontSize:7,fontWeight:700,padding:"2px 5px",borderRadius:2,background:"#00ff8818",color:"#00ff88"}}>LOCK EXIT</span>
        )}
        {s.lossProfile && s.lossProfile !== "WIN" && (
          <span style={{fontSize:7,padding:"2px 5px",borderRadius:2,
            background:s.lossProfile==="PROFIT_THEN_REVERSED"?"#ff445518":s.lossProfile==="INSTANT_BAD_ENTRY"?"#aa222218":"#55555518",
            color:s.lossProfile==="PROFIT_THEN_REVERSED"?"#ff7766":s.lossProfile==="INSTANT_BAD_ENTRY"?"#cc5544":"#a8a8c8"}}>
            {s.lossProfile.replace(/_/g," ")}
          </span>
        )}
        {s.isStale && <span style={{fontSize:7,padding:"2px 5px",borderRadius:2,background:"#22222218",color:"#a8a8c8"}}>STALE</span>}
        {auditBadge && (
          <button onClick={onOpenAudit} style={{
            fontSize:7, fontWeight:700, padding:"2px 6px", borderRadius:2,
            background:`${auditBadge.color}18`, color: auditBadge.color,
            border:`1px solid ${auditBadge.color}44`, cursor:"pointer",
            fontFamily:"'Space Mono',monospace",
          }}>{auditBadge.label}</button>
        )}
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginLeft:4}}>
          <SF label="ENTRY"  v={fPrice(s.entryPrice)}  c="#b0bec8" />
          <SF label="EXIT"   v={fPrice(s.currentPrice)} c="#b0bec8" />
          <SF label="MAE"    v={fPct(s.mae||0)}         c="#cc7755" />
          <SF label="MFE"    v={fPct(s.mfe||0)}         c="#55aa77" />
          {s.funding!=null && <SF label="FUND@E" v={fPct(s.funding)} c="#99b4c8" />}
          {s.cvdLabel      && <SF label="CVD@E"  v={s.cvdLabel}      c="#99b4c8" />}
          <SF label="RK"     v={`#${s.entryRank}`} c="#99b4c8" />
          {s.closedAt      && <SF label="HELD"   v={fTime(s.closedAt-s.entryTime)} c="#99b4c8" />}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          <button onClick={onEditNote} style={{...S.actBtn,color:"#8899cc",borderColor:"#0e0e18",fontSize:8}}>ðŸ“</button>
          <button onClick={onRemove}   style={S.rmBtn}>×</button>
        </div>
      </div>
      <RsiTelemetryRow s={s} />
      {s.notes && <div style={{marginTop:4,fontSize:9,color:"#9aabcc"}}>ðŸ“ {s.notes}</div>}
      {noteEditing && (
        <div style={{marginTop:6,display:"flex",gap:6}}>
          <input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Notes…"
            style={{flex:1,background:"#0a0a14",border:"1px solid #1a1a2a",borderRadius:3,color:"#dde4f4",padding:"4px 8px",fontSize:10,fontFamily:"Space Mono"}}
            onKeyDown={e=>e.key==="Enter"&&saveNote()} autoFocus />
          <Btn c="#00ff88" onClick={saveNote}>SAVE</Btn>
        </div>
      )}
    </div>
  );
}

// ─── RATE LIMIT BADGE ────────────────────────────────────────────────────────
const RL_MODE_STYLE = {
  OK:       { label: 'OK',      color: '#00ff88', bg: '#020e07', glow: '#00ff8822' },
  THROTTLE: { label: 'THR',     color: '#ffd000', bg: '#0e0b00', glow: '#ffd00033' },
  // FROZEN reads as intentional seatbelt (calm cyan), not an error
  FROZEN:   { label: 'SCAN HOLD', color: '#00ccff', bg: '#001518', glow: '#00ccff44' },
  BACKOFF:  { label: 'BACKOFF', color: '#ff8800', bg: '#130a00', glow: '#ff880055' },
  BANNED:   { label: 'BANNED',  color: '#ff2233', bg: '#140003', glow: '#ff223355' },
};

function _rlCountdown(resetMs) {
  const sec = Math.max(0, Math.ceil((resetMs - Date.now()) / 1000));
  return `0:${String(sec % 60).padStart(2, '0')}`;
}

const RateLimitBadge = ({ rl }) => {
  const {
    mode = 'OK', effectiveWeight = 0, committed = 0, measured = 0,
    limit = 2400, freezeCeiling = 1560, softCeiling = 1000,
    pctOfLimit = 0, windowResetMs = 0,
    inflight = 0, waiting = 0, byPriority = { CRITICAL: 0, HIGH: 0, NORMAL: 0, LOW: 0 },
    isFrozen = false, backoffUntil = 0, banUntil = 0,
    criticalLaneAvailable = true, tradesMayFreeze = false,
  } = rl;
  const ms = RL_MODE_STYLE[mode] ?? RL_MODE_STYLE.OK;
  const { label, color: c, bg, glow } = ms;

  const isBannedMode  = mode === 'BANNED';
  const isActive      = inflight > 0 || waiting > 0;
  const isIdle        = effectiveWeight === 0 && !isActive && mode === 'OK';
  const showCountdown = mode === 'THROTTLE' || mode === 'FROZEN';
  const isCrit        = isBannedMode || mode === 'BACKOFF';

  // Bar geometry (% of full 2400 limit)
  const measPct  = Math.min(100, (measured       / limit) * 100);
  const commPct  = Math.min(100, (committed      / limit) * 100);
  const softPct  = Math.min(100, (softCeiling    / limit) * 100);
  const freePct  = Math.min(100, (freezeCeiling  / limit) * 100);
  const toFreeze = Math.max(0, freezeCeiling - effectiveWeight);

  return (
    <div className={isIdle ? 'rl-idle' : ''} style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      background: bg,
      border: `1.5px solid ${isIdle ? '#1a2035' : c + '88'}`,
      borderRadius: 5, padding: '5px 10px',
      fontFamily: 'Space Mono',
      minWidth: 320, maxWidth: 480, width: 'clamp(320px, 420px, 480px)',
      boxSizing: 'border-box', flexShrink: 0,
      boxShadow: isIdle ? 'none' : `0 0 ${isActive ? 12 : 5}px ${glow}`,
      transition: 'box-shadow 0.25s, border-color 0.3s',
    }}>

      {/* ── Row 1: mode pill + weight summary + priority chips + activity ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{
          color: isIdle ? '#2a3a55' : c, fontWeight: 900, fontSize: 11,
          letterSpacing: 1.5, fontFamily: "'Syne',sans-serif",
          textShadow: isIdle ? 'none' : `0 0 7px ${c}`,
          animation: isCrit ? 'blink 0.6s step-end infinite' : 'none',
          minWidth: 52, flexShrink: 0, whiteSpace: 'nowrap',
        }}>{isIdle ? '· · ·' : label}</span>

        {/* effectiveWeight / limit */}
        <span style={{ color: isIdle ? '#2a3a55' : c, fontWeight: 700, fontSize: 10, textShadow: isIdle ? 'none' : `0 0 4px ${c}55`, flexShrink: 0 }}>
          {effectiveWeight.toLocaleString()}
          <span style={{ color: '#4466aa', fontSize: 9 }}>/{limit.toLocaleString()}</span>
        </span>

        {/* distance-to-freeze chip */}
        {!isIdle && mode !== 'FROZEN' && mode !== 'BANNED' && mode !== 'BACKOFF' && (
          <span style={{ color: '#5577aa', fontSize: 8, flexShrink: 0 }}>
            −{toFreeze.toLocaleString()}w↑frz
          </span>
        )}

        {/* reset countdown (THROTTLE / FROZEN) */}
        {showCountdown && (
          <span style={{ color: '#00ccff', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
            resets {_rlCountdown(windowResetMs)}
          </span>
        )}

        {/* BACKOFF countdown */}
        {mode === 'BACKOFF' && (
          <span style={{ color: '#ff8800', fontSize: 9, fontWeight: 700 }}>
            WAIT {Math.ceil((backoffUntil - Date.now()) / 1000)}s
          </span>
        )}

        {/* BANNED time */}
        {isBannedMode && (
          <span style={{ color: '#ff2233', fontSize: 9, fontWeight: 700, animation: 'blink 0.6s step-end infinite' }}>
            BAN {new Date(banUntil).toLocaleTimeString()}
          </span>
        )}

        {/* Priority lane chips: C H N L */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 'auto' }}>
          {['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].map(p => {
            const n  = byPriority?.[p] ?? 0;
            const pc = p === 'CRITICAL' ? '#ff3355' : p === 'HIGH' ? '#ff8800' : p === 'NORMAL' ? '#00ccff' : '#7766aa';
            return (
              <span key={p} style={{
                fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                color: n > 0 ? pc : '#2a3a55',
                textShadow: n > 0 && (p === 'CRITICAL' || (p === 'HIGH' && isFrozen)) ? `0 0 6px ${pc}` : 'none',
              }}>
                {p[0]}{n > 0 ? n : ''}
              </span>
            );
          })}
        </div>

        {/* inflight / waiting */}
        <div style={{
          display: 'flex', gap: 3, alignItems: 'center',
          borderLeft: '1px solid #ffffff14', paddingLeft: 6,
          visibility: isActive ? 'visible' : 'hidden', flexShrink: 0, minWidth: 40,
        }}>
          {inflight > 0 && (
            <span style={{ color: '#00ccff', fontSize: 9, fontWeight: 700, animation: 'blink 0.9s step-end infinite' }}>
              ↑{inflight}
            </span>
          )}
          {waiting > 0 && (
            <span style={{ color: '#aa88ff', fontSize: 9, fontWeight: 700 }}>⋯{waiting}</span>
          )}
        </div>
      </div>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,fontSize:7,letterSpacing:1.2,textTransform:'uppercase'}}>
        <span style={{color: tradesMayFreeze ? '#ff3355' : '#00cc88',fontWeight:800}}>
          {tradesMayFreeze ? 'TRADE LIFECYCLE AT RISK' : 'TRADES LIVE · WS INDEPENDENT'}
        </span>
        <span style={{color: criticalLaneAvailable ? '#6677aa' : '#ff9955'}}>
          CRITICAL REST {criticalLaneAvailable ? 'READY' : 'FAIL-FAST / WS FALLBACK'}
        </span>
      </div>

      {/* ── Row 2: headroom bar ── */}
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: '#0a0a1a', overflow: 'visible' }}>
        {/* Idle scan overlay */}
        {isIdle && (
          <div className="rl-idle-scan" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 3,
            background: 'linear-gradient(90deg, transparent 0%, #00ff8818 50%, transparent 100%)',
            backgroundSize: '55% 100%', backgroundRepeat: 'no-repeat',
          }} />
        )}
        {/* Measured fill — solid, Binance-confirmed */}
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${measPct}%`,
          background: isBannedMode ? '#ff2233' : isIdle ? '#1a2035' : c,
          borderRadius: 3, opacity: 0.85,
          transition: 'width 0.4s, background 0.3s',
        }} />
        {/* Committed overhang — lighter, locally predicted in-flight lag */}
        {commPct > measPct && (
          <div style={{
            position: 'absolute', left: `${measPct}%`, top: 0, height: '100%',
            width: `${Math.max(0, commPct - measPct)}%`,
            background: c + '55', borderRadius: '0 3px 3px 0',
            transition: 'width 0.4s',
          }} />
        )}
        {/* SOFT gridline (42%) */}
        <div style={{ position: 'absolute', left: `${softPct}%`, top: -1, bottom: -1, width: 1, background: '#ffd00066' }} />
        {/* FREEZE gridline (65%) */}
        <div style={{ position: 'absolute', left: `${freePct}%`, top: -1, bottom: -1, width: 1, background: '#00ccff66' }} />
        {/* Danger zone hatching past FREEZE */}
        <div style={{
          position: 'absolute', left: `${freePct}%`, right: 0, top: 0, bottom: 0,
          backgroundImage: 'repeating-linear-gradient(45deg,#ff223318 0px,#ff223318 3px,transparent 3px,transparent 6px)',
          borderRadius: '0 3px 3px 0',
        }} />
      </div>

      {/* ── Row 3: reason line (only when not OK / idle) ── */}
      {!isIdle && mode !== 'OK' && (
        <div style={{ fontSize: 8, color: '#7788aa', letterSpacing: 0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {mode === 'FROZEN'  && `SCAN HOLD · discovery paused at ${committed.toLocaleString()}/${limit.toLocaleString()} · position websocket remains live · resets ${_rlCountdown(windowResetMs)}`}
          {mode === 'THROTTLE' && `THROTTLE · ${effectiveWeight.toLocaleString()}/${limit.toLocaleString()} (${Math.round(pctOfLimit)}%) · LOW deferred · resets ${_rlCountdown(windowResetMs)}`}
          {mode === 'BACKOFF' && `BACKOFF · 429 received · discovery waits ${Math.ceil((backoffUntil - Date.now()) / 1000)}s · trade lifecycle uses websocket`}
          {mode === 'BANNED'  && `BANNED · REST unavailable until ${new Date(banUntil).toLocaleTimeString()} · local/websocket trade lifecycle remains active`}
        </div>
      )}
    </div>
  );
};

// ─── MICRO COMPONENTS ────────────────────────────────────────────────────────
const Pip  = ({color,pulse,label}) => (
  <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,letterSpacing:1.4,fontWeight:700,color}}>
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:7,height:7,flexShrink:0}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:color,display:"block"}} className={pulse?"pulse":""}/>
      {pulse && <span className="pulse-ring" style={{position:"absolute",inset:0,borderRadius:"50%",border:`1px solid ${color}`,opacity:0}}/>}
    </span>
    {label}
  </div>
);
const Chip = ({children}) => <span style={{fontSize:11,color:"#aebdde",background:"#0e0e1c",padding:"2px 9px",borderRadius:4,fontFamily:"Space Mono",border:"1px solid #1c1c34",letterSpacing:0.5}}>{children}</span>;
const Btn  = ({children,onClick,c,disabled,type="button"}) => (
  <button type={type} onClick={onClick} disabled={disabled} style={{background:"transparent",border:`1px solid ${c||"#1c1c30"}`,color:c||"#aebdde",padding:"4px 11px",borderRadius:4,cursor:"pointer",fontFamily:"'Syne',sans-serif",fontSize:11,letterSpacing:0.5,fontWeight:700,opacity:disabled?0.25:1,transition:"all 0.18s",boxShadow:c&&!disabled?`0 0 10px ${c}16`:"none"}}>
    {children}
  </button>
);
const TBtn = ({children,on,c,onClick,disabled,type="button"}) => (
  <button type={type} onClick={onClick} disabled={disabled} className="btn-lev" style={{background:on?`linear-gradient(135deg,${c}ee,${c}99)`:"transparent",color:on?"#05050c":c,border:`1px solid ${on?c:"#1c1c30"}`,padding:"4px 11px",borderRadius:4,cursor:disabled?"not-allowed":"pointer",fontFamily:"Space Mono,monospace",fontSize:11,fontWeight:700,transition:"all 0.18s",opacity:disabled?0.32:1,boxShadow:on?`0 2px 14px ${c}44`:"none"}}>
    {children}
  </button>
);
const Lbl  = ({children}) => <span style={{fontSize:11,color:"#8094bc",letterSpacing:2,fontWeight:700,textTransform:"uppercase",fontFamily:"'Syne',sans-serif"}}>{children}</span>;
const StatCard = ({label,value,sub,c}) => (
  <div style={{...S.stat,borderTop:`2px solid ${c}44`}} className="slide-in stat-hover">
    <div style={{position:"absolute",top:0,left:0,right:0,height:36,background:`linear-gradient(180deg,${c}08 0%,transparent 100%)`,pointerEvents:"none",borderRadius:"5px 5px 0 0"}} />
    <div style={{fontSize:11,color:"#8094bc",letterSpacing:2,marginBottom:7,textTransform:"uppercase",position:"relative",fontFamily:"'Syne',sans-serif",fontWeight:700}}>{label}</div>
    <div style={{fontSize:22,fontWeight:800,fontFamily:"Space Mono",color:c,letterSpacing:-1,lineHeight:1,textShadow:`0 0 20px ${c}33`,position:"relative"}}>{value}</div>
    <div style={{fontSize:11,color:"#8094bc",marginTop:5,position:"relative",fontFamily:"Space Mono"}}>{sub}</div>
  </div>
);
const Sect     = ({title,children}) => <div style={{marginTop:24}}><div style={S.secLbl} className="sec-divider">{title}</div>{children}</div>;
const ChartWrap = ({title,children}) => <div><div style={S.secLbl} className="sec-divider">{title}</div>{children}</div>;
const SF = ({label,v,c}) => (
  <span style={{display:"inline-flex",flexDirection:"column",gap:1}}>
    <span style={{fontSize:11,color:"#8094bc",letterSpacing:1.2,textTransform:"uppercase",fontFamily:"'Syne',sans-serif",fontWeight:700}}>{label}</span>
    <span style={{color:c||"#e6ecfb",fontFamily:"Space Mono",fontSize:11,fontWeight:700}}>{v}</span>
  </span>
);
// ─── LIVE TICKER TABLE ───────────────────────────────────────────────────────

function LiveTickerTable({ cols, tickers, ctx }) {
  const [sortCol,  setSortCol]  = useState(null);
  const [sortDir,  setSortDir]  = useState("desc");
  const [colOrder, setColOrder] = useState(null);
  const [widths,   setWidths]   = useState(() => Object.fromEntries(cols.map(c => [c.key, c.width ?? 100])));
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const order = colOrder ?? cols.map(c => c.key);
  const orderedCols = order.map(k => cols.find(c => c.key === k)).filter(Boolean);

  const sorted = (() => {
    if (!sortCol) return tickers;
    const def = cols.find(c => c.key === sortCol);
    if (!def?.sortValue) return tickers;
    const scored = tickers.map((t, i) => ({ t, v: def.sortValue(t, i, ctx) }));
    scored.sort((a, b) => {
      const av = a.v, bv = b.v;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortDir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return scored.map(x => x.t);
  })();

  function toggleSort(key) {
    if (sortCol !== key) { setSortCol(key); setSortDir("desc"); }
    else if (sortDir === "desc") setSortDir("asc");
    else { setSortCol(null); setSortDir("desc"); }
  }

  function startResize(e, key) {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = widths[key] ?? 100;
    const mv = me => setWidths(p => ({ ...p, [key]: Math.max(40, w0 + me.clientX - x0) }));
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  }

  function onDrop(e, toKey) {
    e.preventDefault();
    if (!dragFrom || dragFrom === toKey) { setDragFrom(null); setDragOver(null); return; }
    setColOrder(prev => {
      const base = [...(prev ?? cols.map(c => c.key))];
      const fi = base.indexOf(dragFrom), ti = base.indexOf(toKey);
      if (fi < 0 || ti < 0) return prev;
      base.splice(fi, 1); base.splice(ti, 0, dragFrom);
      return base;
    });
    setDragFrom(null); setDragOver(null);
  }

  if (!tickers?.length) return null;

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <div style={{ fontFamily: "Space Mono", fontSize: 11, color: "#3a4060", letterSpacing: 0.5, marginBottom: 3, textAlign: "right", padding: "0 8px" }}>
        ⠿ DRAG COLS · DRAG EDGE TO RESIZE
      </div>
      {/* Header */}
      <div style={{ display: "flex", minWidth: "100%", background: "linear-gradient(90deg,#080810,#09090f)", borderBottom: "1px solid #131326", borderRadius: "4px 4px 0 0" }}>
        {orderedCols.map(col => {
          const active = sortCol === col.key;
          const icon   = col.sortValue ? (active ? (sortDir === "desc" ? "↓" : "↑") : "⇅") : "";
          return (
            <div key={col.key}
              onDragOver={e => { e.preventDefault(); setDragOver(col.key); }}
              onDrop={e => onDrop(e, col.key)}
              onClick={() => col.sortValue && toggleSort(col.key)}
              style={{
                position: "relative", flexShrink: 0,
                width: widths[col.key] ?? col.width ?? 100,
                padding: "5px 8px",
                color: active ? "#aaccff" : (col.headerColor ?? "#7aacdc"),
                fontSize: 8, fontWeight: 700, letterSpacing: 2,
                cursor: col.sortValue ? "pointer" : "default",
                userSelect: "none",
                borderLeft: dragOver === col.key && dragFrom !== col.key ? "2px solid #4488ff" : undefined,
                opacity: dragFrom === col.key ? 0.35 : 1,
                whiteSpace: "nowrap", overflow: "hidden",
                textAlign: col.align ?? "left",
                boxSizing: "border-box",
                transition: "opacity 0.1s",
              }}
            >
              <span draggable
                onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; setDragFrom(col.key); }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                onClick={e => e.stopPropagation()}
                style={{ cursor: "grab", marginRight: 4, opacity: 0.22, fontSize: 9, display: "inline-block" }}
              >⠿</span>
              {col.label}
              {icon && <span style={{ marginLeft: 3, opacity: active ? 1 : 0.25, fontSize: 7 }}>{icon}</span>}
              <div onMouseDown={e => startResize(e, col.key)} onClick={e => e.stopPropagation()}
                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", borderRight: "1px solid #1a1a30" }}
              />
            </div>
          );
        })}
      </div>
      {/* Rows */}
      {sorted.map((t, i) => (
        <div key={t.symbol} className="row-hover" style={{
          display: "flex", alignItems: "center", minWidth: "100%",
          borderBottom: "1px solid #0e0e1e", transition: "background 0.15s",
          background: ctx.rowBg?.(i) ?? "transparent",
        }}>
          {orderedCols.map(col => (
            <div key={col.key} style={{
              width: widths[col.key] ?? col.width ?? 100,
              flexShrink: 0, padding: "8px 8px",
              overflow: "hidden", textAlign: col.align ?? "left",
              boxSizing: "border-box", display: "flex", alignItems: "center",
              justifyContent: col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start",
            }}>
              {col.render(t, i, ctx)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const LOSER_TICKER_COLS = [
  { key: "rk",        label: "RK",      width: 50,  align: "left",
    sortValue: (t, i) => i,
    render: (t, i) => (
      <span style={{ fontFamily:"Space Mono", fontSize:9, fontWeight:i<3?700:400,
        color:i===0?"#ff4455":i===1?"#ff7755":i===2?"#ff9966":"#8899cc" }}>#{i+1}</span>
    )},
  { key: "symbol",    label: "SYMBOL",  width: 110, align: "left",
    sortValue: t => t.symbol,
    render: (t, i) => (
      <a href={`https://www.binance.com/en/futures/${t.symbol}`} target="_blank" rel="noreferrer"
         style={{ color:i<3?"#f0f0ff":"#e0e4f4", fontWeight:700, textDecoration:"none", fontSize:12, letterSpacing:i<3?0.5:0 }}>
        {t.symbol.replace("USDT","")}
      </a>
    )},
  { key: "abs",       label: "AES",     width: 84,  align: "center", headerColor: "#9988cc",
    sortValue: (t, i, ctx) => tickerPreviewScore(ctx.klinesMap[t.symbol]||{}, t, i, "LOSERS")?.absoluteEntryScore ?? -1,
    render: (t, i, ctx) => <AbsPreviewBadge kl={ctx.klinesMap[t.symbol]||{}} ticker={t} rankIndex={i} side="LOSERS" /> },
  { key: "bestDnaScore", label: "BEST DNA", width: 98, align: "center", headerColor: "#aaccff",
    sortValue: (t, i, ctx) => bestDnaTickerDisplay(ctx, t, i, "LOSERS")?.score ?? -1,
    render: (t, i, ctx) => <BestDnaTickerScore ctx={ctx} ticker={t} rankIndex={i} side="LOSERS" /> },
  { key: "postFee10Score", label: "10+ SCORE", width: 98, align: "center", headerColor: "#66ddaa",
    sortValue: (t, i, ctx) => postFee10TickerDisplay(ctx, t, i, "LOSERS")?.score ?? -1,
    render: (t, i, ctx) => <PostFee10TickerScore ctx={ctx} ticker={t} rankIndex={i} side="LOSERS" /> },
  { key: "runnerScore", label: "RUNNER ENTRY", width: 106, align: "center", headerColor: "#55ccff",
    sortValue: (t, i, ctx) => runnerTickerDisplay(ctx, t, i, "LOSERS")?.score ?? -1,
    render: (t, i, ctx) => <RunnerTickerScore ctx={ctx} ticker={t} rankIndex={i} side="LOSERS" /> },
  { key: "change24h", label: "24H%",    width: 88,  align: "right",
    sortValue: t => parseFloat(t.priceChangePercent),
    render: (t, i) => (
      <span style={{ color:i<5?"#ff4455":"#cc3344", fontWeight:700, fontFamily:"Space Mono", fontSize:11 }}>
        {fPct(parseFloat(t.priceChangePercent))}
      </span>
    )},
  { key: "change1m",  label: "1M%",     width: 72,  align: "right",
    sortValue: (t, i, ctx) => ctx.klinesMap[t.symbol]?.change1m ?? -999,
    render: (t, i, ctx) => {
      const v = ctx.klinesMap[t.symbol]?.change1m;
      if (v == null) return <span style={{ color:"#8899cc", fontFamily:"Space Mono", fontSize:10 }}>—</span>;
      const c = v < -0.5 ? "#ff4455" : v < 0 ? "#ff8899" : v > 0.5 ? "#00ff88" : "#00cc66";
      return <span style={{ color:c, fontFamily:"Space Mono", fontSize:10 }}>{fPct(v)}</span>;
    }},
  { key: "change5m",  label: "5M%",     width: 72,  align: "right",
    sortValue: (t, i, ctx) => ctx.klinesMap[t.symbol]?.change5m ?? -999,
    render: (t, i, ctx) => {
      const v = ctx.klinesMap[t.symbol]?.change5m;
      if (v == null) return <span style={{ color:"#8899cc", fontFamily:"Space Mono", fontSize:10 }}>—</span>;
      const c = v < -1 ? "#ff4455" : v < 0 ? "#ff8899" : v > 1 ? "#00ff88" : "#00cc66";
      return <span style={{ color:c, fontFamily:"Space Mono", fontSize:10 }}>{fPct(v)}</span>;
    }},
  { key: "price",     label: "PRICE",   width: 96,  align: "right",
    sortValue: t => parseFloat(t.lastPrice),
    render: t => <span style={{ color:"#c0c4d8", fontFamily:"Space Mono", fontSize:11 }}>{fPrice(parseFloat(t.lastPrice))}</span> },
  { key: "funding",   label: "FUNDING", width: 90,  align: "right",
    sortValue: (t, i, ctx) => ctx.fundingMap[t.symbol] ?? 0,
    render: (t, i, ctx) => {
      const fund = ctx.fundingMap[t.symbol];
      return (
        <span style={{ fontFamily:"Space Mono", fontSize:10,
          color:fund==null?"#8899cc":fund<-0.1?"#ff3344":fund<0?"#ff8899":fund>0.05?"#00ff88":"#9aabcc" }}>
          {fund!=null ? fPct(fund) : "—"}
        </span>
      );
    }},
  { key: "cvd",       label: "CVD",     width: 66,  align: "center",
    render: (t, i, ctx) => <CvdBadge label={ctx.klinesMap[t.symbol]?.cvdLabel} /> },
  { key: "atr",       label: "ATR%",    width: 70,  align: "right",
    sortValue: (t, i, ctx) => ctx.klinesMap[t.symbol]?.atrPct ?? 0,
    render: (t, i, ctx) => (
      <span style={{ color:"#8899cc", fontFamily:"Space Mono", fontSize:10 }}>
        {ctx.klinesMap[t.symbol]?.atrPct != null ? f3(ctx.klinesMap[t.symbol].atrPct) : "—"}
      </span>
    )},
  { key: "vol",       label: "VOL",     width: 96,  align: "right",
    sortValue: t => parseFloat(t.quoteVolume),
    render: t => <span style={{ color:"#8899cc", fontSize:10 }}>${fVol(parseFloat(t.quoteVolume))}</span> },
  { key: "bounce",    label: "BOUNCE",  width: 90,  align: "right",
    sortValue: t => { const h=parseFloat(t.highPrice),l=parseFloat(t.lowPrice),p=parseFloat(t.lastPrice); return h-l>0?(p-l)/(h-l)*100:50; },
    render: t => {
      const h=parseFloat(t.highPrice),l=parseFloat(t.lowPrice),p=parseFloat(t.lastPrice);
      return <BounceBar pct={h-l>0?(p-l)/(h-l)*100:50} />;
    }},
  { key: "actions",   label: "ACTIONS", width: 148, align: "right",
    render: (t, i, ctx) => {
      const inList = ctx.alreadyIn(t.symbol), watched = ctx.inWatchlist(t.symbol);
      const dis = inList || !ctx.canStart;
      return (
        <div style={{ display:"flex", gap:4, justifyContent:"flex-end", width:"100%" }}>
          <button className="btn-act" onClick={()=>ctx.addWatch(t)} disabled={watched||inList}
            style={{...ctx.actBtn,color:"#4488ff",borderColor:"#0d1830",opacity:watched||inList?0.28:1}}>
            {watched?"👁 WD":"👁"}
          </button>
          <button className="btn-act" onClick={()=>ctx.addSample(t, ctx.bucket)} disabled={dis}
            style={{...ctx.actBtn,color:inList?`${ctx.btnColor}55`:ctx.btnColor,borderColor:inList?"#0a1a10":`${ctx.btnColor}66`,
              boxShadow:!dis&&!inList?`0 0 8px ${ctx.btnColor}22`:"none",opacity:dis?0.4:1}}>
            {inList?"✓ IN":ctx.btnLabel}
          </button>
        </div>
      );
    }},
];

const GAINER_TICKER_COLS = LOSER_TICKER_COLS.map(c => {
  if (c.key === "change24h") return {
    ...c,
    render: (t, i) => (
      <span style={{ color:i<5?"#00ff88":"#00cc66", fontWeight:700, fontFamily:"Space Mono", fontSize:11 }}>
        {fPct(parseFloat(t.priceChangePercent))}
      </span>
    ),
  };
  if (c.key === "bestDnaScore") return {
    ...c,
    sortValue: (t, i, ctx) => bestDnaTickerDisplay(ctx, t, i, "GAINERS")?.score ?? -1,
    render: (t, i, ctx) => <BestDnaTickerScore ctx={ctx} ticker={t} rankIndex={i} side="GAINERS" />,
  };
  if (c.key === "postFee10Score") return {
    ...c,
    sortValue: (t, i, ctx) => postFee10TickerDisplay(ctx, t, i, "GAINERS")?.score ?? -1,
    render: (t, i, ctx) => <PostFee10TickerScore ctx={ctx} ticker={t} rankIndex={i} side="GAINERS" />,
  };
  if (c.key === "runnerScore") return {
    ...c,
    sortValue: (t, i, ctx) => runnerTickerDisplay(ctx, t, i, "GAINERS")?.score ?? -1,
    render: (t, i, ctx) => <RunnerTickerScore ctx={ctx} ticker={t} rankIndex={i} side="GAINERS" />,
  };
  if (c.key !== "abs" && c.key !== "bounce") return c;
  if (c.key === "abs") return {
    ...c,
    sortValue: (t, i, ctx) => tickerPreviewScore(ctx.klinesMap[t.symbol]||{}, t, i, "GAINERS")?.absoluteEntryScore ?? -1,
    render: (t, i, ctx) => <AbsPreviewBadge kl={ctx.klinesMap[t.symbol]||{}} ticker={t} rankIndex={i} side="GAINERS" />,
  };
  // replace BOUNCE with DIST↑ for gainers
  return {
    key: "dist", label: "DIST↑", width: 90, align: "right",
    sortValue: t => { const h=parseFloat(t.highPrice),p=parseFloat(t.lastPrice); return h>0?(p-h)/h*100:0; },
    render: t => {
      const h=parseFloat(t.highPrice),p=parseFloat(t.lastPrice);
      return <DistFromHighBar pct={h>0?(p-h)/h*100:0} />;
    },
  };
});

// ─── AES V3 PREVIEW ──────────────────────────────────────────────────────────
// Preview scorers now live in ../research/longPreviewScorers.js (imported above)
// so the app never imports scorer functions directly (spec §26).

function postFee10TickerDisplay(ctx, ticker, rankIndex, side) {
  const exact =
    ctx.postFee10BySymbol?.[`${side}:${ticker.symbol}`] ??
    ctx.postFee10BySymbol?.[ticker.symbol] ??
    null;
  if (exact?.longPostFee10EntryScore != null) {
    return {
      source: "ENTRY",
      title: "POST-FEE 10+",
      score: exact.longPostFee10EntryScore,
      tier: exact.longPostFee10EntryTier,
      labels: exact.longPostFee10Labels ?? [],
      positives: exact.longPostFee10PositiveGenes ?? [],
      penalties: exact.longPostFee10PenaltyGenes ?? [],
    };
  }

  const preview = tickerPostFee10PreviewAssessment(ctx.klinesMap[ticker.symbol] || {}, ticker, rankIndex, side);
  if (!preview || preview.longPostFee10EntryScore == null) return null;
  return {
    source: "PREVIEW",
    title: "POST-FEE 10+",
    score: preview.longPostFee10EntryScore,
    tier: preview.longPostFee10EntryTier,
    labels: preview.longPostFee10Labels ?? [],
    positives: preview.longPostFee10PositiveGenes ?? [],
    penalties: preview.longPostFee10PenaltyGenes ?? [],
  };
}

function bestDnaTickerDisplay(ctx, ticker, rankIndex, side) {
  const exact =
    ctx.postFee10BySymbol?.[`${side}:${ticker.symbol}`] ??
    ctx.postFee10BySymbol?.[ticker.symbol] ??
    null;
  if (exact?.bestDnaLongScore != null) {
    return {
      source: "ENTRY",
      title: "BEST DNA",
      score: exact.bestDnaLongScore,
      tier: exact.bestDnaLongTier,
      labels: exact.bestDnaLongLabels ?? [],
      positives: exact.bestDnaLongPositiveGenes ?? [],
      penalties: exact.bestDnaLongPenaltyGenes ?? [],
    };
  }

  const preview = tickerBestDnaPreviewAssessment(ctx.klinesMap[ticker.symbol] || {}, ticker, rankIndex, side);
  if (!preview) return null;
  return {
    source: "PREVIEW",
    title: "BEST DNA",
    score: preview.bestDnaLongScore,
    tier: preview.bestDnaLongTier,
    labels: preview.bestDnaLongLabels ?? [],
    positives: preview.bestDnaLongPositiveGenes ?? [],
    penalties: preview.bestDnaLongPenaltyGenes ?? [],
  };
}

function runnerTickerDisplay(ctx, ticker, rankIndex, side) {
  const exact =
    ctx.postFee10BySymbol?.[`${side}:${ticker.symbol}`] ??
    ctx.postFee10BySymbol?.[ticker.symbol] ??
    null;
  const score = exact?.longCandidateRunnerScoreAtEntry ?? null;
  if (score == null) return null;
  return {
    source: exact.closed ? "ENTRY" : "SCAN",
    title: "RUNNER ENTRY",
    score,
    tier: exact.longCandidateRunnerTierAtEntry ?? null,
    labels: exact.longCandidateRunnerReasons ?? [],
    positives: exact.longCandidateRunnerReasons ?? [],
    penalties: exact.longCandidateRunnerPenalties ?? [],
    note: "Entry-safe scan-time score. Does not use MFE, MAE, PnL, or post-entry data.",
  };
}

function compactAuditTier(tier) {
  if (!tier) return "-";
  if (String(tier).includes("ELITE")) return "E";
  if (String(tier).includes("SNIPER")) return "S";
  if (String(tier).includes("HIGH")) return "H";
  if (String(tier).includes("CANDIDATE")) return "C";
  if (String(tier).includes("WATCH")) return "W";
  return "L";
}

function auditTickerTip(display) {
  if (!display) return "";
  return [
    `${display.source} ${display.title} ${display.score} | ${display.tier}`,
    display.labels?.length ? `Labels: ${display.labels.join(", ")}` : null,
    display.positives?.length ? `Positive: ${display.positives.join(", ")}` : null,
    display.penalties?.length ? `Penalties: ${display.penalties.join(", ")}` : null,
    display.note ?? null,
  ].filter(Boolean).join("\n");
}

function absScoreColor(score) {
  if (score == null) return "#445566";
  const s = Math.max(0, Math.min(100, score));
  let hue;
  if (s <= 35)       hue = (s / 35) * 6;                  // 0→6  deep red
  else if (s <= 60)  hue = 6 + ((s - 35) / 25) * 26;     // 6→32 red→orange
  else if (s <= 80)  hue = 32 + ((s - 60) / 20) * 58;    // 32→90 orange→yellow-green
  else               hue = 90 + ((s - 80) / 20) * 50;    // 90→140 yellow-green→green
  const lightness = s === 0 ? 58 : 52;
  return `hsl(${Math.round(hue)}, 100%, ${lightness}%)`;
}

// Compatibility alias
const aesScoreColor = absScoreColor;

const AbsPreviewBadge = ({ kl, ticker, rankIndex, side }) => {
  const res   = tickerPreviewScore(kl, ticker, rankIndex, side);
  const score = res.absoluteEntryScore;
  const color = absScoreColor(score);

  const isResearchBlock = (res.absoluteEntryResearchBlockReasons?.length ?? 0) > 0;
  const isCaution       = !isResearchBlock && (res.absoluteEntryCautionReasons?.length ?? 0) > 0;
  const suffix = isResearchBlock ? " R" : isCaution ? " C" : "";

  const missing  = (res.absoluteEntryMissingFields ?? []).slice(0, 3).join(", ");
  const warnings = (res.absoluteEntryWarnings ?? []).slice(0, 2).join(", ");
  const tip = [
    `AES V3: ${score}`,
    `Tier: ${res.absoluteEntryTier ?? "—"}`,
    `Confidence: ${res.absoluteEntryConfidence ?? 0}/100`,
    `Eligibility: ${res.absoluteEntryEligibility ?? "—"}`,
    `Side model: ${res.absoluteEntrySide ?? "—"}`,
    `Source: ${res.absoluteEntryScoreSource ?? "—"}`,
    missing  ? `Missing: ${missing}` : null,
    warnings ? `Warnings: ${warnings}` : null,
    "LOG ONLY — DOES NOT AFFECT ENTRY",
  ].filter(Boolean).join("\n");

  return (
    <div title={tip} style={{ display:"flex", alignItems:"center", justifyContent:"center", cursor:"default" }}>
      <span style={{
        fontFamily: "Space Mono", fontSize: 13, fontWeight: 800,
        color, lineHeight: 1, letterSpacing: -0.5,
        textShadow: `0 0 8px ${color}44`,
        opacity: isResearchBlock ? 0.7 : 1,
      }}>
        {score}<span style={{ fontSize: 9, opacity: 0.85, marginLeft: 1 }}>{suffix}</span>
      </span>
    </div>
  );
};

// Compatibility alias
const AesPreviewBadge = AbsPreviewBadge;

const AuditTickerScore = ({ display }) => {
  if (!display) return <span style={{ fontFamily:"Space Mono", fontSize:11, color:"#334455" }}>-</span>;
  const color = absScoreColor(display.score);
  return (
    <span title={auditTickerTip(display)} style={{
      fontFamily:"Space Mono",
      fontSize:12,
      fontWeight:900,
      color,
      border:`1px solid ${color}55`,
      background:`${color}16`,
      padding:"2px 6px",
      borderRadius:3,
      cursor:"default",
      textShadow:`0 0 8px ${color}33`,
      whiteSpace:"nowrap",
    }}>
      {display.score} {compactAuditTier(display.tier)}
    </span>
  );
};

const BestDnaTickerScore = ({ ctx, ticker, rankIndex, side }) => (
  <AuditTickerScore display={bestDnaTickerDisplay(ctx, ticker, rankIndex, side)} />
);

const PostFee10TickerScore = ({ ctx, ticker, rankIndex, side }) => (
  <AuditTickerScore display={postFee10TickerDisplay(ctx, ticker, rankIndex, side)} />
);

const RunnerTickerScore = ({ ctx, ticker, rankIndex, side }) => (
  <AuditTickerScore display={runnerTickerDisplay(ctx, ticker, rankIndex, side)} />
);

const CvdBadge = ({label}) => {
  if (!label) return <span style={{color:"#99aac8",fontSize:9}}>—</span>;
  const c = label==="BULL"?"#00ff88":label==="BEAR"?"#ff4455":"#a8a8c8";
  return <span style={{color:c,fontSize:8,fontWeight:700,background:`${c}15`,padding:"2px 6px",borderRadius:3,border:`1px solid ${c}33`,letterSpacing:0.5}}>{label}</span>;
};
const DistFromHighBar = ({pct}) => {
  const abs  = Math.abs(pct ?? 0);
  const fill = Math.min(100, abs / 8 * 100);
  const grad = abs < 1
    ? "linear-gradient(90deg,#cc2233,#ff4455)"
    : abs < 3
    ? "linear-gradient(90deg,#cc7700,#ffa500)"
    : "linear-gradient(90deg,#00cc66,#00ff88)";
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:5}}>
      <div style={{width:36,height:4,background:"#111120",borderRadius:3,overflow:"hidden",boxShadow:"inset 0 1px 3px rgba(0,0,0,0.5)"}}>
        <div style={{width:`${fill}%`,height:"100%",background:grad,borderRadius:3,transition:"width 0.4s ease"}}/>
      </div>
      <span style={{color:"#a8c0d4",fontSize:8,fontFamily:"Space Mono"}}>{safeFixed(pct, 1)}%</span>
    </div>
  );
};
const BounceBar = ({pct}) => (
  <div style={{display:"inline-flex",alignItems:"center",gap:5}}>
    <div style={{width:36,height:4,background:"#111120",borderRadius:3,overflow:"hidden",boxShadow:"inset 0 1px 3px rgba(0,0,0,0.5)"}}>
      <div style={{width:`${Math.min(100,Math.max(0,pct))}%`,height:"100%",
        background:pct<25?"linear-gradient(90deg,#00cc66,#00ff88)":pct>75?"linear-gradient(90deg,#cc2233,#ff4455)":"linear-gradient(90deg,#cc7700,#ffa500)",
        borderRadius:3,transition:"width 0.4s ease"}}/>
    </div>
    <span style={{color:"#a8c0d4",fontSize:11,fontFamily:"Space Mono"}}>{safeFixed(pct, 0)}%</span>
  </div>
);

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  root:         { background:"#06060c", minHeight:"100vh", color:"#e6ecfb", fontFamily:"'Syne',sans-serif", fontSize:13 },
  header:       { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px", borderBottom:"1px solid #14142a", background:"linear-gradient(180deg,#0d0d1c 0%,#08080f 100%)", boxShadow:"0 1px 0 #0a0a1a, 0 4px 20px rgba(0,0,0,0.4)", flexWrap:"wrap", gap:6 },
  logo:         { width:32, height:32, background:"linear-gradient(135deg,#00ff88 0%,#00cc66 60%,#00ff88 100%)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", color:"#05050c", fontSize:14, fontWeight:800, flexShrink:0 },
  title:        { fontSize:15, fontWeight:800, color:"#f0f4ff", letterSpacing:2.5 },
  subtt:        { fontSize:11, color:"#8094bc", letterSpacing:1.5, marginTop:2 },
  controls:     { display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", padding:"7px 20px", background:"#07071000", borderBottom:"1px solid #111120", backdropFilter:"blur(2px)" },
  tabs:         { display:"flex", alignItems:"stretch", borderBottom:"1px solid #111120", background:"linear-gradient(180deg,#0c0c1a 0%,#08080e 100%)", padding:"0 12px", overflowX:"auto", gap:0 },
  tab:          { background:"transparent", border:"none", padding:"10px 13px", cursor:"pointer", fontFamily:"'Syne',sans-serif", fontSize:11, letterSpacing:1.2, fontWeight:700, whiteSpace:"nowrap" },
  navGroup:     { fontSize:9, color:"#5a6890", letterSpacing:1.8, fontWeight:700, textTransform:"uppercase", fontFamily:"'Syne',sans-serif", padding:"0 6px", alignSelf:"center", userSelect:"none", flexShrink:0 },
  content:      { padding:"14px 20px", maxHeight:"calc(100vh - 150px)", overflowY:"auto" },
  squeezeBanner:{ display:"flex", alignItems:"center", gap:5, padding:"7px 11px", background:"linear-gradient(90deg,#0e0005,#0b0003)", border:"1px solid #220008", borderRadius:4, marginBottom:10, flexWrap:"wrap" },
  squeezeChip:  { display:"flex", flexDirection:"column", padding:"3px 8px", borderRadius:3, border:"1px solid #300012", gap:1 },
  watchChip:    { display:"flex", alignItems:"center", gap:6, padding:"4px 9px", background:"#0a0a17", border:"1px solid #1e1e38", borderRadius:4, fontSize:11 },
  thdr:         { display:"flex", padding:"5px 8px", marginBottom:2, color:"#8094bc", fontSize:11, letterSpacing:1.4, fontWeight:700, borderBottom:"1px solid #111120", background:"#090910" },
  trow:         { display:"flex", padding:"8px 8px", borderBottom:"1px solid #0d0d1a", alignItems:"center", transition:"background 0.15s" },
  actBtn:       { padding:"3px 9px", borderRadius:3, cursor:"pointer", fontFamily:"Space Mono,monospace", fontSize:11, fontWeight:700, background:"transparent", transition:"all 0.15s", border:"1px solid" },
  rmBtn:        { background:"transparent", border:"none", color:"#7878c0", cursor:"pointer", fontSize:13, padding:"0 3px", transition:"color 0.15s" },
  sampleCard:   { background:"linear-gradient(180deg,#0c0c19 0%,#09090e 100%)", border:"1px solid #181830", borderRadius:7, padding:"12px 14px", marginBottom:7 },
  secLbl:       { fontSize:11, color:"#8094bc", letterSpacing:2.5, fontWeight:700, marginBottom:9, textTransform:"uppercase", display:"flex", alignItems:"center", gap:8 },
  grid:         { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))", gap:9 },
  stat:         { background:"linear-gradient(145deg,#0c0c1a 0%,#090910 100%)", border:"1px solid #191930", borderRadius:7, padding:"12px 14px", position:"relative", overflow:"hidden" },
  card:         { background:"#0d0d1a", border:"1px solid #1a1a34", borderRadius:6, padding:"9px 12px" },
  icRow:        { display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:"#09090f", border:"1px solid #171730", borderRadius:4 },
  overlay:      { position:"fixed", inset:0, background:"rgba(0,0,0,0.94)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 },
  modal:        { background:"linear-gradient(160deg,#10101f 0%,#0c0c18 100%)", border:"1px solid #22223a", borderRadius:10, padding:22, display:"flex", flexDirection:"column", gap:8, minWidth:260, maxWidth:320, boxShadow:"0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px #0a0a1a" },
  mBtn:         { background:"#0b0b18", border:"1px solid #1e1e38", color:"#d4daf0", padding:"9px 13px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"'Syne',sans-serif", textAlign:"left", transition:"all 0.15s" },
};

// CSS is imported from ../ui/globalCss.js at the top of this file.



