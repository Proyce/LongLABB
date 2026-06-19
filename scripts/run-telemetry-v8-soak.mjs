#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { getLongProfitLockUpdate } from '../src/lifecycle/profitLockStrategy.js';
import { synchronizeSimulatedProfitLockProtection } from '../src/lifecycle/profitLockProtection.js';
import { evaluateLongImmediateExit } from '../src/lifecycle/openPositionLifecycle.js';
import { compactLongTradeForRuntime, HEAVY_DUPLICATE_TELEMETRY_FIELDS } from '../src/telemetry/telemetryCompaction.js';
import { buildLongTradeCsvString, buildLongTradeJsonString } from '../src/export/longTradeExport.js';
import { buildLongBatchAnalysisFiles } from '../src/export/longBatchExport.js';
import { safeFixed, hasFiniteClosedPnl } from '../src/ui/safeFormat.js';

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=')[1];
const durationSeconds = Math.max(5, Number(arg('seconds') ?? 300));
const realtime = String(arg('realtime') ?? 'true') !== 'false';
const outputDir = path.resolve(arg('out') ?? 'validation/telemetry-v8-soak');
const tradeCount = Math.max(10, Number(arg('trades') ?? 50));
const leverage = 5;
const startWall = Date.now();
const startPerf = performance.now();

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeRun(runId, profile, seed) {
  const random = mulberry32(seed);
  const trades = Array.from({ length: tradeCount }, (_, index) => {
    const entryPrice = Number((0.05 + index * 0.007 + random() * 0.02).toFixed(6));
    return compactLongTradeForRuntime({
      id: `${runId}-${index + 1}`,
      tradeId: `${runId}-${index + 1}`,
      run: runId,
      runId,
      setId: startWall,
      batchId: 'telemetry-v8-offline-soak',
      autoRunId: 'telemetry-v8-offline-soak',
      autoRunCycle: runId,
      entrySource: 'OFFLINE_SOAK_VALIDATION',
      symbol: `SOAK${runId}_${String(index + 1).padStart(2, '0')}USDT`,
      leaderboardSide: index % 2 ? 'GAINERS' : 'LOSERS',
      longParentBucket: index % 2 ? 'TOP_GAINER_LONGS' : 'TOP_LOSER_LONGS',
      leverage,
      entryPrice,
      currentPrice: entryPrice,
      entryTime: startWall,
      holdMs: durationSeconds * 1000,
      closed: false,
      closeReason: null,
      finalPnlPct: null,
      mfe: 0,
      mae: 0,
      trailActive: false,
      trailPeak: null,
      priceHistory: [],
      feeSnapshot: { entryFeeRatePct: 0.05, exitFeeRatePct: 0.05 },
      tradeSchemaVersion: 'LONG_TRADE_EXPORT_V9',
      entrySnapshotSchemaVersion: 'LONG_ENTRY_RESEARCH_V9',
      telemetryStorageProfile: 'LONG_TELEMETRY_V9_COMPACT',
      strategyResearchEligible: true,
      finalizationDataQuality: 'COMPLETE',
      priceIntegrityStatus: 'VALID',
      profile,
      simulatedIndex: index,
    });
  });
  return {
    runId,
    profile,
    trades,
    fastScanDurationsMs: [],
    deepScanDurationsMs: [],
    maxEventLoopLagMs: 0,
    lifecycleTicks: 0,
    fallbackTicks: 0,
    invalidTicks: 0,
    renderGuardChecks: 0,
    memorySamples: [],
  };
}

const runs = [
  makeRun(901, 'TREND_AND_TRAIL', 101),
  makeRun(902, 'CHOP_AND_TIMEOUT', 202),
  makeRun(903, 'STRESS_SL_AND_FALLBACK', 303),
];

function priceFor(run, trade, second) {
  const base = trade.entryPrice;
  const i = trade.simulatedIndex;
  if (run.profile === 'TREND_AND_TRAIL') {
    const drift = 0.00018 * second;
    const wave = 0.0032 * Math.sin(second / 9 + i * 0.7);
    const lateGiveback = second > 235 ? -0.00032 * (second - 235) : 0;
    return base * (1 + drift + wave + lateGiveback);
  }
  if (run.profile === 'CHOP_AND_TIMEOUT') {
    return base * (1 + 0.0022 * Math.sin(second / 11 + i) + 0.0011 * Math.sin(second / 3.7 + i * 0.2));
  }
  const lane = i % 4;
  if (lane === 0) {
    const shock = second >= 32 ? -0.014 - Math.min(0.012, (second - 32) * 0.00008) : 0.00006 * second;
    return base * (1 + shock);
  }
  if (lane === 1) {
    const up = Math.min(0.012, second * 0.00022);
    const reverse = second > 80 ? (second - 80) * 0.00015 : 0;
    return base * (1 + up - reverse);
  }
  if (lane === 2) {
    return base * (1 - Math.min(0.013, second * 0.000065) + 0.001 * Math.sin(second / 6 + i));
  }
  return base * (1 + 0.000035 * second + 0.0014 * Math.sin(second / 13 + i));
}

function finalizeTrade(trade, decision, price, now, source) {
  const margin = Number(decision.marginPnlPct ?? 0);
  const norm = margin / Number(trade.leverage || 1);
  const feeAdjustedNorm = norm - 0.10;
  const feeAdjustedMargin = margin - 0.10 * Number(trade.leverage || 1);
  return compactLongTradeForRuntime({
    ...trade,
    closed: true,
    isFinalOutcome: true,
    closeReason: decision.reason,
    canonicalCloseReason: decision.reason,
    closeReasonDetail: decision.reason,
    closedAt: now,
    closeTime: new Date(now).toISOString(),
    exitPrice: price,
    finalPrice: price,
    currentPrice: price,
    finalPnlPct: margin,
    priceMovePct: norm,
    grossNormPnlPct: norm,
    grossLeveragedPnlPct: margin,
    feeAdjustedNormPnlPct: feeAdjustedNorm,
    feeAdjustedLeveragedPnlPct: feeAdjustedMargin,
    finalPriceSource: source,
    finalPriceTimestamp: now,
    finalPriceFresh: true,
    finalPriceValidationPassed: true,
    closeTriggerSource: decision.reason,
    closeExecutionMechanism: source === 'REST_CRITICAL_FALLBACK_V2' ? 'REST_CRITICAL_FALLBACK' : 'LOCAL_WEBSOCKET_WATCH',
    positionLifecycleRestFallbackStatus: source === 'REST_CRITICAL_FALLBACK_V2' ? 'USED_PER_SYMBOL_STALE' : 'NOT_NEEDED',
    positionLifecycleFallbackReason: source === 'REST_CRITICAL_FALLBACK_V2' ? 'SYMBOL_TICK_STALE' : null,
    marketPriceStreamHealthy: source !== 'REST_CRITICAL_FALLBACK_V2',
    profitLockFloorBreachedWhilePositionOpen: decision.lockBreach?.breached ?? false,
    profitLockFloorBreachedInLoss: decision.lockBreach?.profitLockFloorBreachedInLoss ?? false,
    profitLockPnlAtFloorBreach: decision.lockBreach?.profitLockPnlAtFloorBreach ?? null,
    profitLockCrossToLocalDetectionLatencyMs: decision.lockBreach?.profitLockCrossToLocalDetectionLatencyMs ?? null,
    profitLockProtectionState: decision.reason === 'PROFIT_LOCK' ? 'FILLED' : trade.profitLockProtectionState,
    profitLockFloorPreserved: decision.reason === 'PROFIT_LOCK' ? margin >= Number(trade.profitLockProtectedFloorMarginPct ?? -Infinity) : null,
    profitLockEnforcementFailed: false,
  });
}

async function simulatedFastScan(run, second) {
  const started = performance.now();
  // Fast scan is deliberately tiny; deep research work is not awaited here.
  await Promise.resolve({ second, symbols: run.trades.length });
  run.fastScanDurationsMs.push(performance.now() - started);
}

async function simulatedDeepScan(run) {
  const started = performance.now();
  // Exercise asynchronous separation without stalling the lifecycle loop.
  await new Promise(resolve => setTimeout(resolve, 80 + (run.runId % 3) * 30));
  run.deepScanDurationsMs.push(performance.now() - started);
}

function tickRun(run, second, now) {
  run.trades = run.trades.map(trade => {
    if (trade.closed) return trade;
    const rawPrice = priceFor(run, trade, second);
    const price = Number(rawPrice.toFixed(8));
    if (!Number.isFinite(price) || price <= 0) {
      run.invalidTicks += 1;
      return trade;
    }
    const stressFallback = run.profile === 'STRESS_SL_AND_FALLBACK'
      && trade.simulatedIndex % 10 === 0
      && second >= 30 && second <= 34;
    const source = stressFallback ? 'REST_CRITICAL_FALLBACK_V2' : (second % 2 ? 'AGG_TRADE' : 'BOOK_TICKER');
    if (stressFallback) run.fallbackTicks += 1;
    run.lifecycleTicks += 1;

    const priceUp = ((price - trade.entryPrice) / trade.entryPrice) * 100;
    const priceDn = ((trade.entryPrice - price) / trade.entryPrice) * 100;
    let updated = {
      ...trade,
      currentPrice: price,
      mfe: Math.max(Number(trade.mfe ?? 0), priceUp),
      mae: Math.max(Number(trade.mae ?? 0), priceDn),
      lastPriceTimestamp: now,
      lastPriceUpdateAt: now,
      lastPriceSource: source,
      positionLifecycleLastHeartbeatAt: now,
      positionLifecycleLastWebsocketAt: source === 'REST_CRITICAL_FALLBACK_V2' ? trade.positionLifecycleLastWebsocketAt : now,
      priceHistory: [...(trade.priceHistory ?? []), { t: now, p: price, source }].slice(-12),
    };

    if (priceUp >= 3) {
      updated.trailActive = true;
      updated.trailPeak = Math.max(Number(updated.trailPeak ?? 0), price);
    }
    const lockUpdate = getLongProfitLockUpdate(updated, price, now);
    const protectionUpdate = synchronizeSimulatedProfitLockProtection(updated, lockUpdate, now);
    updated = { ...updated, ...lockUpdate, ...protectionUpdate };

    const decision = evaluateLongImmediateExit({
      trade: updated,
      currentPrice: price,
      now,
      source,
      trailingEnabled: true,
      defaultHoldMs: durationSeconds * 1000,
    });
    if (decision.shouldClose) return finalizeTrade(updated, decision, price, now, source);
    return compactLongTradeForRuntime(updated);
  });

  // Explicitly exercise the null-safe render contract every second.
  const renderProbe = second % 23 === 0 ? null : run.trades.find(t => t.closed)?.finalPnlPct;
  safeFixed(renderProbe, 2, '—');
  hasFiniteClosedPnl({ closed: true, finalPnlPct: renderProbe });
  run.renderGuardChecks += 2;
}

function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

async function finish() {
  await fs.mkdir(outputDir, { recursive: true });
  const summaries = [];
  for (const run of runs) {
    const now = startWall + durationSeconds * 1000;
    run.trades = run.trades.map(trade => {
      if (trade.closed) return trade;
      const price = Number(trade.currentPrice ?? trade.entryPrice);
      const decision = evaluateLongImmediateExit({
        trade,
        currentPrice: price,
        now,
        source: 'SOAK_TIMEOUT',
        trailingEnabled: true,
        defaultHoldMs: durationSeconds * 1000,
      });
      return finalizeTrade(trade, { ...decision, shouldClose: true, reason: 'TIMEOUT' }, price, now, 'SOAK_TIMEOUT');
    });

    const invalid = run.trades.filter(t => !Number.isFinite(Number(t.finalPnlPct)));
    const heavy = run.trades.flatMap(t => HEAVY_DUPLICATE_TELEMETRY_FIELDS.filter(field => field in t).map(field => `${t.id}:${field}`));
    const reasons = run.trades.reduce((acc, trade) => {
      acc[trade.closeReason] = (acc[trade.closeReason] ?? 0) + 1;
      return acc;
    }, {});
    const pnl = run.trades.map(t => Number(t.feeAdjustedNormPnlPct)).filter(Number.isFinite);
    const summary = {
      run: run.runId,
      profile: run.profile,
      durationSeconds,
      tradeCount: run.trades.length,
      closedCount: run.trades.filter(t => t.closed).length,
      invalidFinalPnlCount: invalid.length,
      heavyDuplicateFieldCount: heavy.length,
      lifecycleTicks: run.lifecycleTicks,
      fallbackTicks: run.fallbackTicks,
      invalidTicks: run.invalidTicks,
      renderGuardChecks: run.renderGuardChecks,
      closeReasons: reasons,
      totalFeeAdjustedNormPnlPct: Number(pnl.reduce((a, b) => a + b, 0).toFixed(6)),
      avgFeeAdjustedNormPnlPct: Number((pnl.reduce((a, b) => a + b, 0) / Math.max(1, pnl.length)).toFixed(6)),
      winRatePct: Number((pnl.filter(v => v > 0).length / Math.max(1, pnl.length) * 100).toFixed(2)),
      fastScanMaxMs: Number(Math.max(...run.fastScanDurationsMs, 0).toFixed(3)),
      fastScanP95Ms: Number((percentile(run.fastScanDurationsMs, 0.95) ?? 0).toFixed(3)),
      deepScanMaxMs: Number(Math.max(...run.deepScanDurationsMs, 0).toFixed(3)),
      maxEventLoopLagMs: Number(run.maxEventLoopLagMs.toFixed(3)),
      memoryPeakHeapMiB: Number(Math.max(...run.memorySamples.map(x => x.heapUsed), 0).toFixed(3)),
      passed: invalid.length === 0 && heavy.length === 0 && run.maxEventLoopLagMs < 500 && Math.max(...run.fastScanDurationsMs, 0) < 12_000,
    };
    summaries.push(summary);
    await fs.writeFile(path.join(outputDir, `run_${run.runId}.json`), JSON.stringify(run.trades, null, 2));
    await fs.writeFile(path.join(outputDir, `run_${run.runId}.csv`), buildLongTradeCsvString(run.trades));
    await fs.writeFile(path.join(outputDir, `run_${run.runId}_summary.json`), JSON.stringify(summary, null, 2));
  }

  const allTrades = runs.flatMap(run => run.trades);
  const descriptor = {
    id: 'telemetry-v8-offline-soak', autoRunId: 'telemetry-v8-offline-soak',
    label: 'Telemetry V8 three-run five-minute offline soak',
    runs: runs.map(run => run.runId), runCount: runs.length, tradeCount: allTrades.length,
    startedAt: new Date(startWall).toISOString(), endedAt: new Date(startWall + durationSeconds * 1000).toISOString(),
  };
  const batch = buildLongBatchAnalysisFiles(allTrades, descriptor, { alreadySelected: true });
  const batchDir = path.join(outputDir, 'analysis_package');
  for (const [relative, contents] of Object.entries(batch.files)) {
    const target = path.join(batchDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
  const compactJson = buildLongTradeJsonString(allTrades);
  await fs.writeFile(path.join(outputDir, 'all_compact_trades.json'), compactJson);
  const result = {
    startedAt: new Date(startWall).toISOString(),
    finishedAt: new Date().toISOString(),
    requestedDurationSeconds: durationSeconds,
    actualWallDurationSeconds: Number(((performance.now() - startPerf) / 1000).toFixed(3)),
    realtime,
    totalTrades: allTrades.length,
    compactJsonBytes: Buffer.byteLength(compactJson),
    avgCompactJsonBytesPerTrade: Math.round(Buffer.byteLength(compactJson) / allTrades.length),
    allRunsPassed: summaries.every(s => s.passed),
    summaries,
  };
  await fs.writeFile(path.join(outputDir, 'SOAK_RESULTS.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.allRunsPassed) process.exitCode = 1;
}

let second = 0;
let lastTickPerf = performance.now();
const deepPromises = [];

async function step() {
  const nowPerf = performance.now();
  const expectedMs = realtime ? 1000 : 0;
  const lag = Math.max(0, nowPerf - lastTickPerf - expectedMs);
  lastTickPerf = nowPerf;
  second += 1;
  const now = startWall + second * 1000;
  for (const run of runs) {
    run.maxEventLoopLagMs = Math.max(run.maxEventLoopLagMs, lag);
    tickRun(run, second, now);
    if (second % 15 === 0) await simulatedFastScan(run, second);
    if (second % 60 === 0) deepPromises.push(simulatedDeepScan(run));
    if (second % 10 === 0) {
      const mem = process.memoryUsage();
      run.memorySamples.push({ second, heapUsed: mem.heapUsed / 1024 / 1024 });
    }
  }
  if (second % 30 === 0) {
    console.log(`[soak] ${second}/${durationSeconds}s open=${runs.map(r => r.trades.filter(t => !t.closed).length).join('/')} heap=${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MiB`);
  }
  if (second >= durationSeconds) {
    await Promise.allSettled(deepPromises);
    await finish();
    return;
  }
  if (realtime) setTimeout(step, Math.max(0, 1000 - (performance.now() - nowPerf)));
  else queueMicrotask(step);
}

step().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
