import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RUNTIME_RECOVERY_LOCAL_KEY,
  buildRuntimeRecoverySnapshot,
  clearRuntimeRecoveryThrough,
  normalizeAutoRunForResume,
  readRuntimeRecovery,
  startRuntimeCheckpointLoop,
  writeRuntimeRecovery,
} from "./runtimeRecovery.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

const baseAutoRun = {
  id: "auto-1",
  targetBucket: "TOP_LOSER_LONGS",
  completedRuns: 0,
  maxRuns: 20,
  phase: "starting",
  phaseStart: 10_000,
  baseRun: 7,
  currentRun: 7,
  currentCycle: 1,
  currentEntryIds: [],
  runDurationMs: 900_000,
  cooldownMs: 60_000,
};

describe("runtime reload recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns an interrupted starting phase into running when its positions survived", () => {
    const resumed = normalizeAutoRunForResume(baseAutoRun, [
      { id: "t1", autoRunId: "auto-1", autoRunCycle: 1, setId: "set-1", closed: false },
      { id: "old", autoRunId: "auto-1", autoRunCycle: 0, closed: false },
    ], 20_000);

    expect(resumed.phase).toBe("running");
    expect(resumed.currentEntryIds).toEqual(["t1"]);
    expect(resumed.currentSetId).toBe("set-1");
    expect(resumed.phaseStart).toBe(10_000);
    expect(resumed.recoveryReason).toBe("STARTING_PHASE_POSITIONS_RESTORED");
  });

  it("retries the same cycle immediately when starting was interrupted before positions persisted", () => {
    const now = 50_000;
    const resumed = normalizeAutoRunForResume(baseAutoRun, [], now);

    expect(resumed.phase).toBe("cooldown");
    expect(resumed.currentCycle).toBe(1);
    expect(resumed.completedRuns).toBe(0);
    expect(now - resumed.phaseStart).toBe(resumed.cooldownMs);
    expect(resumed.recoveryReason).toBe("STARTING_PHASE_RETRY_SAME_CYCLE");
  });

  it("preserves absolute running deadlines across reload", () => {
    const resumed = normalizeAutoRunForResume(
      { ...baseAutoRun, phase: "running", phaseStart: 12_345 },
      [],
      99_999,
    );

    expect(resumed.phase).toBe("running");
    expect(resumed.phaseStart).toBe(12_345);
    expect(resumed.recoveredAfterReload).toBe(true);
  });

  it("round-trips the synchronous pagehide recovery journal", () => {
    const storage = memoryStorage();
    const snapshot = buildRuntimeRecoverySnapshot({
      samples: [{ id: "t1", closed: false }],
      run: 7,
      autoRun: baseAutoRun,
      revision: 4,
      savedAt: 123,
    });

    expect(writeRuntimeRecovery(storage, snapshot)).toBe(true);
    expect(readRuntimeRecovery(storage)).toEqual(snapshot);
    expect(storage.getItem(RUNTIME_RECOVERY_LOCAL_KEY)).not.toBeNull();
  });

  it("does not let an older async checkpoint clear a newer recovery journal", () => {
    const storage = memoryStorage();
    writeRuntimeRecovery(storage, buildRuntimeRecoverySnapshot({
      samples: [],
      run: 1,
      autoRun: null,
      revision: 8,
    }));

    expect(clearRuntimeRecoveryThrough(storage, 7)).toBe(false);
    expect(readRuntimeRecovery(storage)?.revision).toBe(8);
    expect(clearRuntimeRecoveryThrough(storage, 8)).toBe(true);
    expect(readRuntimeRecovery(storage)).toBeNull();
  });

  it("checkpoints on a fixed cadence even while lifecycle updates keep arriving", () => {
    vi.useFakeTimers();
    const checkpoint = vi.fn();
    const stop = startRuntimeCheckpointLoop(checkpoint, 3_000);

    const lifecycleUpdates = setInterval(() => {}, 100);
    vi.advanceTimersByTime(9_100);

    expect(checkpoint).toHaveBeenCalledTimes(4);
    clearInterval(lifecycleUpdates);
    stop();
  });
});
