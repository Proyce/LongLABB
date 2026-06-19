// ─── AES DISCOVERY QUEUE ─────────────────────────────────────────────────────
// Rate-limited deep telemetry queue.  Independent of React rendering.
// Existing live sample enrichment has priority; discovery scans are secondary.

import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";

export const QUEUE_STATUS = {
  QUEUED:                "QUEUED",
  FETCHING:              "FETCHING",
  COMPLETE:              "COMPLETE",
  PARTIAL:               "PARTIAL",
  FAILED:                "FAILED",
  SKIPPED_CACHE_FRESH:   "SKIPPED_CACHE_FRESH",
  SKIPPED_RATE_BUDGET:   "SKIPPED_RATE_BUDGET",
  EXPIRED:               "EXPIRED",
};

let _nextId = 1;

export function createQueue(config = AES_DISCOVERY_CONFIG) {
  const records   = new Map();    // id → record
  const bySymbol  = new Map();    // symbol → Set<id>
  const cache     = new Map();    // symbol → { telemetry, computedAt }
  const metrics   = {
    totalEnqueued:   0,
    totalCompleted:  0,
    totalFailed:     0,
    totalSkipped:    0,
    cacheHits:       0,
    rateLimitSkips:  0,
    activeCount:     0,
    queuedCount:     0,
  };

  let _activeFetches = 0;
  let _rateLimitPaused = false;

  function enqueue({ symbol, side, side24hRank, rankBand, prefilterScore, requestWeightEstimate = 5, now = Date.now() }) {
    // Deduplicate — skip if already queued or fetching for this symbol
    const existingIds = bySymbol.get(symbol) ?? new Set();
    for (const id of existingIds) {
      const rec = records.get(id);
      if (rec && (rec.status === QUEUE_STATUS.QUEUED || rec.status === QUEUE_STATUS.FETCHING)) {
        return null;
      }
    }

    // Check cache
    const cached = cache.get(symbol);
    if (cached && (now - cached.computedAt) < config.telemetryCacheTtlMs) {
      metrics.cacheHits++;
      metrics.totalSkipped++;
      const id = `qr_${_nextId++}`;
      const rec = {
        id, symbol, side, side24hRank, rankBand,
        enqueuedAt: now, startedAt: null, completedAt: null,
        status: QUEUE_STATUS.SKIPPED_CACHE_FRESH,
        attempts: 0, errorCodes: [],
        requestWeightEstimate, sourcePrefilterScore: prefilterScore,
      };
      records.set(id, rec);
      _addToBySymbol(symbol, id);
      metrics.totalEnqueued++;
      return id;
    }

    const id = `qr_${_nextId++}`;
    const rec = {
      id, symbol, side, side24hRank, rankBand,
      enqueuedAt: now, startedAt: null, completedAt: null,
      status: QUEUE_STATUS.QUEUED,
      attempts: 0, errorCodes: [],
      requestWeightEstimate, sourcePrefilterScore: prefilterScore,
    };
    records.set(id, rec);
    _addToBySymbol(symbol, id);
    metrics.totalEnqueued++;
    metrics.queuedCount++;
    return id;
  }

  function _addToBySymbol(symbol, id) {
    const s = bySymbol.get(symbol) ?? new Set();
    s.add(id);
    bySymbol.set(symbol, s);
  }

  function getNextBatch({ rateLimitWeightBudget, livePrioritySymbols = new Set(), now = Date.now() } = {}) {
    if (_rateLimitPaused) return [];

    const queued = [...records.values()].filter(r => r.status === QUEUE_STATUS.QUEUED);
    const available = config.deepScanConcurrency - _activeFetches;
    if (available <= 0) return [];

    // Expire old records
    for (const rec of queued) {
      if (now - rec.enqueuedAt > config.candidateQueueTtlMs) {
        rec.status = QUEUE_STATUS.EXPIRED;
        metrics.queuedCount = Math.max(0, metrics.queuedCount - 1);
        metrics.totalSkipped++;
      }
    }

    // Sort: live priority symbols first, then by prefilterScore desc
    const eligible = queued
      .filter(r => r.status === QUEUE_STATUS.QUEUED)
      .sort((a, b) => {
        const aLive = livePrioritySymbols.has(a.symbol) ? 1 : 0;
        const bLive = livePrioritySymbols.has(b.symbol) ? 1 : 0;
        if (bLive !== aLive) return bLive - aLive;
        return (b.sourcePrefilterScore ?? 0) - (a.sourcePrefilterScore ?? 0);
      });

    const batch = [];
    for (const rec of eligible) {
      if (batch.length >= available) break;
      if (rateLimitWeightBudget != null) {
        const estimatedTotal = batch.reduce((s, r) => s + r.requestWeightEstimate, 0) + rec.requestWeightEstimate;
        if (estimatedTotal > rateLimitWeightBudget) {
          rec.status = QUEUE_STATUS.SKIPPED_RATE_BUDGET;
          metrics.rateLimitSkips++;
          metrics.queuedCount = Math.max(0, metrics.queuedCount - 1);
          continue;
        }
      }
      batch.push(rec);
    }

    return batch;
  }

  function markFetching(id, now = Date.now()) {
    const rec = records.get(id);
    if (!rec) return;
    rec.status     = QUEUE_STATUS.FETCHING;
    rec.startedAt  = now;
    rec.attempts++;
    _activeFetches = Math.min(_activeFetches + 1, config.deepScanConcurrency);
    metrics.queuedCount  = Math.max(0, metrics.queuedCount - 1);
    metrics.activeCount++;
  }

  function markComplete(id, telemetry, now = Date.now()) {
    const rec = records.get(id);
    if (!rec) return;
    rec.status      = QUEUE_STATUS.COMPLETE;
    rec.completedAt = now;
    _activeFetches  = Math.max(0, _activeFetches - 1);
    metrics.activeCount = Math.max(0, metrics.activeCount - 1);
    metrics.totalCompleted++;

    if (telemetry) {
      cache.set(rec.symbol, { telemetry, computedAt: now });
    }
  }

  function markPartial(id, telemetry, errorCodes = [], now = Date.now()) {
    const rec = records.get(id);
    if (!rec) return;
    rec.status      = QUEUE_STATUS.PARTIAL;
    rec.completedAt = now;
    rec.errorCodes  = [...(rec.errorCodes ?? []), ...errorCodes];
    _activeFetches  = Math.max(0, _activeFetches - 1);
    metrics.activeCount = Math.max(0, metrics.activeCount - 1);

    if (telemetry) {
      cache.set(rec.symbol, { telemetry, computedAt: now });
    }
  }

  function markFailed(id, errorCode, now = Date.now()) {
    const rec = records.get(id);
    if (!rec) return;
    rec.status      = QUEUE_STATUS.FAILED;
    rec.completedAt = now;
    if (errorCode) rec.errorCodes.push(errorCode);
    _activeFetches  = Math.max(0, _activeFetches - 1);
    metrics.activeCount = Math.max(0, metrics.activeCount - 1);
    metrics.totalFailed++;

    // Brief cache entry to prevent request storm
    cache.set(rec.symbol, { telemetry: null, computedAt: now - config.telemetryCacheTtlMs + 15_000 });
  }

  function retryEligible(now = Date.now()) {
    // One retry per failed record per cycle (not immediate, only after a new cycle begins)
    const failed = [...records.values()].filter(r =>
      r.status === QUEUE_STATUS.FAILED && r.attempts === 1 && (now - r.completedAt > 60_000)
    );
    for (const rec of failed) {
      rec.status = QUEUE_STATUS.QUEUED;
      metrics.queuedCount++;
    }
  }

  function pauseForRateLimit() {
    _rateLimitPaused = true;
  }

  function resumeFromRateLimit() {
    _rateLimitPaused = false;
  }

  function getCachedTelemetry(symbol, now = Date.now()) {
    const entry = cache.get(symbol);
    if (!entry) return null;
    if ((now - entry.computedAt) > config.telemetryCacheTtlMs) {
      cache.delete(symbol);
      return null;
    }
    return entry.telemetry;
  }

  function getRecord(id) {
    return records.get(id) ?? null;
  }

  function getQueueSnapshot() {
    return {
      records: [...records.values()],
      metrics: { ...metrics, rateLimitPaused: _rateLimitPaused, activeFetches: _activeFetches },
    };
  }

  function getQueuedCount() {
    return [...records.values()].filter(r => r.status === QUEUE_STATUS.QUEUED).length;
  }

  function clearExpiredAndOld(now = Date.now(), maxAge = 10 * 60_000) {
    for (const [id, rec] of records.entries()) {
      const terminal = [QUEUE_STATUS.COMPLETE, QUEUE_STATUS.FAILED, QUEUE_STATUS.EXPIRED,
                        QUEUE_STATUS.SKIPPED_CACHE_FRESH, QUEUE_STATUS.SKIPPED_RATE_BUDGET, QUEUE_STATUS.PARTIAL];
      if (terminal.includes(rec.status) && (now - (rec.completedAt ?? rec.enqueuedAt)) > maxAge) {
        records.delete(id);
        const s = bySymbol.get(rec.symbol);
        if (s) { s.delete(id); if (s.size === 0) bySymbol.delete(rec.symbol); }
      }
    }
  }

  return {
    enqueue,
    getNextBatch,
    markFetching,
    markComplete,
    markPartial,
    markFailed,
    retryEligible,
    pauseForRateLimit,
    resumeFromRateLimit,
    getCachedTelemetry,
    getRecord,
    getQueueSnapshot,
    getQueuedCount,
    clearExpiredAndOld,
    get isRateLimitPaused() { return _rateLimitPaused; },
    get activeFetches() { return _activeFetches; },
    get cacheSize() { return cache.size; },
  };
}
