import { describe, it, expect } from "vitest";
import { createQueue, QUEUE_STATUS } from "./aesDiscoveryQueue.js";
import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";

const CFG = { ...AES_DISCOVERY_CONFIG, deepScanConcurrency: 2, telemetryCacheTtlMs: 60_000, candidateQueueTtlMs: 120_000 };

describe("createQueue", () => {
  it("enqueues a record and returns an id", () => {
    const q = createQueue(CFG);
    const id = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70 });
    expect(typeof id).toBe("string");
  });

  it("returns SKIPPED_CACHE_FRESH when cache is fresh", () => {
    const q   = createQueue(CFG);
    const now = Date.now();
    // Enqueue, mark fetching, complete → seeds the cache
    const id1 = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70, now });
    q.markFetching(id1, now);
    q.markComplete(id1, { atrPct: 0.5 }, now);
    // Second enqueue for same symbol should skip (cache is fresh)
    const id2 = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70, now: now + 1000 });
    expect(id2).not.toBeNull(); // returns a SKIPPED_CACHE_FRESH record
    const rec = q.getRecord(id2);
    expect(rec.status).toBe("SKIPPED_CACHE_FRESH");
  });

  it("deduplicates: second enqueue for same active symbol returns null", () => {
    const q = createQueue(CFG);
    const id1 = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70 });
    q.markFetching(id1);
    const id2 = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70 });
    expect(id2).toBeNull();
  });

  it("concurrency never exceeds configured value", () => {
    const q = createQueue({ ...CFG, deepScanConcurrency: 2 });
    const id1 = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70 });
    const id2 = q.enqueue({ symbol: "BBUSDT", side: "LOSER", side24hRank: 31, rankBand: "RANK_26_50", prefilterScore: 65 });
    q.enqueue({ symbol: "CCUSDT", side: "LOSER", side24hRank: 32, rankBand: "RANK_26_50", prefilterScore: 60 });
    const batch = q.getNextBatch();
    expect(batch.length).toBeLessThanOrEqual(2);
  });

  it("markFailed stops retrying after 1 attempt flag", () => {
    const q = createQueue(CFG);
    const id = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70 });
    q.markFetching(id);
    q.markFailed(id, "NETWORK_ERROR");
    const rec = q.getRecord(id);
    expect(rec.status).toBe(QUEUE_STATUS.FAILED);
    expect(rec.attempts).toBe(1);
  });

  it("retryEligible does not retry immediately", () => {
    const q   = createQueue(CFG);
    const now = Date.now();
    const id  = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70, now });
    q.markFetching(id);
    q.markFailed(id, "TIMEOUT", now);
    q.retryEligible(now + 10_000); // too soon — < 60s
    expect(q.getRecord(id).status).toBe(QUEUE_STATUS.FAILED);
  });

  it("retryEligible re-queues after 60s", () => {
    const q   = createQueue(CFG);
    const now = Date.now();
    const id  = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70, now });
    q.markFetching(id, now);
    q.markFailed(id, "TIMEOUT", now);
    q.retryEligible(now + 65_000); // after 60s
    expect(q.getRecord(id).status).toBe(QUEUE_STATUS.QUEUED);
  });

  it("rate limit pause blocks batch selection", () => {
    const q = createQueue(CFG);
    q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70 });
    q.pauseForRateLimit();
    expect(q.getNextBatch().length).toBe(0);
    q.resumeFromRateLimit();
    expect(q.getNextBatch().length).toBe(1);
  });

  it("getCachedTelemetry returns null for stale cache", () => {
    const q = createQueue(CFG);
    const id = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70 });
    q.markFetching(id);
    const staleTime = Date.now() - CFG.telemetryCacheTtlMs - 1000;
    q.markComplete(id, { fake: true }, staleTime);
    expect(q.getCachedTelemetry("AAUSDT")).toBeNull();
  });

  it("markComplete caches telemetry", () => {
    const q   = createQueue(CFG);
    const now = Date.now();
    const id  = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70, now });
    q.markFetching(id, now);
    q.markComplete(id, { atrPct: 0.5 }, now);
    const cached = q.getCachedTelemetry("AAUSDT", now);
    expect(cached).not.toBeNull();
    expect(cached.atrPct).toBe(0.5);
  });

  it("expired records are cleaned up", () => {
    const q   = createQueue(CFG);
    const now = Date.now();
    const id  = q.enqueue({ symbol: "AAUSDT", side: "LOSER", side24hRank: 30, rankBand: "RANK_26_50", prefilterScore: 70, now });
    q.markFetching(id, now);
    q.markComplete(id, null, now);
    q.clearExpiredAndOld(now + 20 * 60_000, 10 * 60_000);
    expect(q.getRecord(id)).toBeNull();
  });
});
