export const RUNTIME_RECOVERY_LOCAL_KEY = "longlab:v1:runtimeRecovery";
export const RUNTIME_RECOVERY_VERSION = 1;

const finiteNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function activeTradesForCycle(samples, autoRun) {
  return (Array.isArray(samples) ? samples : []).filter(sample => (
    sample?.closed !== true
    && sample?.autoRunId === autoRun.id
    && finiteNumber(sample?.autoRunCycle) === finiteNumber(autoRun.currentCycle)
  ));
}

export function normalizeAutoRunForResume(value, samples = [], now = Date.now()) {
  if (!value || typeof value !== "object" || !value.id) return null;

  const validPhases = new Set(["starting", "running", "cooldown", "done"]);
  if (!validPhases.has(value.phase)) return null;

  const runDurationMs = Math.max(1, finiteNumber(value.runDurationMs, 10_800_000));
  const cooldownMs = Math.max(0, finiteNumber(value.cooldownMs, 300_000));
  const completedRuns = Math.max(0, finiteNumber(value.completedRuns, 0));
  const maxRuns = Math.max(1, finiteNumber(value.maxRuns, 20));
  const baseRun = finiteNumber(value.baseRun, 1);
  const currentCycle = Math.max(1, finiteNumber(value.currentCycle, completedRuns + 1));
  const currentRun = finiteNumber(value.currentRun, baseRun + completedRuns);
  const phaseStart = finiteNumber(value.phaseStart, now);
  const normalized = {
    ...value,
    completedRuns,
    maxRuns,
    baseRun,
    currentRun,
    currentCycle,
    runDurationMs,
    cooldownMs,
    phaseStart,
    currentEntryIds: Array.isArray(value.currentEntryIds) ? value.currentEntryIds : [],
  };

  if (normalized.phase !== "starting") {
    return {
      ...normalized,
      recoveredAfterReload: normalized.phase !== "done",
      recoveredAt: normalized.phase !== "done" ? now : (normalized.recoveredAt ?? null),
    };
  }

  const activeTrades = activeTradesForCycle(samples, normalized);
  if (activeTrades.length) {
    return {
      ...normalized,
      phase: "running",
      currentEntryIds: activeTrades.map(trade => trade.id).filter(Boolean),
      currentSetId: normalized.currentSetId ?? activeTrades[0]?.setId ?? null,
      recoveredAfterReload: true,
      recoveredAt: now,
      recoveryReason: "STARTING_PHASE_POSITIONS_RESTORED",
    };
  }

  return {
    ...normalized,
    phase: "cooldown",
    phaseStart: now - cooldownMs,
    currentEntryIds: [],
    currentSetId: null,
    recoveredAfterReload: true,
    recoveredAt: now,
    recoveryReason: "STARTING_PHASE_RETRY_SAME_CYCLE",
  };
}

export function buildRuntimeRecoverySnapshot({
  samples,
  run,
  autoRun,
  revision,
  savedAt = Date.now(),
}) {
  return {
    version: RUNTIME_RECOVERY_VERSION,
    revision: Math.max(0, finiteNumber(revision, 0)),
    savedAt,
    run: finiteNumber(run, 1),
    autoRun: autoRun && typeof autoRun === "object" ? autoRun : null,
    samples: Array.isArray(samples) ? samples : [],
  };
}

export function parseRuntimeRecoverySnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      !parsed
      || parsed.version !== RUNTIME_RECOVERY_VERSION
      || !Array.isArray(parsed.samples)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readRuntimeRecovery(storage) {
  if (!storage?.getItem) return null;
  try {
    return parseRuntimeRecoverySnapshot(storage.getItem(RUNTIME_RECOVERY_LOCAL_KEY));
  } catch {
    return null;
  }
}

export function writeRuntimeRecovery(storage, snapshot) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(RUNTIME_RECOVERY_LOCAL_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearRuntimeRecoveryThrough(storage, revision) {
  if (!storage?.getItem || !storage?.removeItem) return false;
  try {
    const current = parseRuntimeRecoverySnapshot(storage.getItem(RUNTIME_RECOVERY_LOCAL_KEY));
    if (!current || finiteNumber(current.revision, 0) <= finiteNumber(revision, 0)) {
      storage.removeItem(RUNTIME_RECOVERY_LOCAL_KEY);
      return true;
    }
  } catch {}
  return false;
}

export function startRuntimeCheckpointLoop(
  checkpoint,
  intervalMs = 3_000,
  {
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = {},
) {
  if (typeof checkpoint !== "function") return () => {};
  checkpoint();
  const intervalId = setIntervalFn(checkpoint, intervalMs);
  return () => clearIntervalFn(intervalId);
}
