import { TICK_DIRECTION_CONFIG, TICK_DIRECTION_VERSION } from "./tickDirection.config.js";
import { TICK_OUTCOME_RESULT } from "./tickDirection.types.js";

export const TICK_DIRECTION_OUTCOME_AUDIT_VERSION =
  `${TICK_DIRECTION_VERSION}_OUTCOME_AUDIT_V1`;

const suffix = horizonMs => `${horizonMs / 1_000}s`;
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

export function buildTickDirectionOutcomeDefaults({
  entrySpreadPct = null,
  config = TICK_DIRECTION_CONFIG,
} = {}) {
  const threshold = Math.max(0.5, Number(entrySpreadPct ?? 0) * 10_000 * 0.5);
  const result = {
    marketTickNeutralThresholdBps: Number(threshold.toFixed(6)),
    marketTickOutcomeCoveragePct: 0,
    marketTickOutcomeAuditVersion: TICK_DIRECTION_OUTCOME_AUDIT_VERSION,
  };
  return result;
}

function predictedDirection(verdict) {
  if (verdict === "STRONG_UP" || verdict === "UP") return "UP";
  if (verdict === "STRONG_DOWN" || verdict === "DOWN") return "DOWN";
  if (verdict === "NEUTRAL") return "NEUTRAL";
  return "INSUFFICIENT";
}

function classifyForward(moveBps, threshold) {
  if (Math.abs(moveBps) <= threshold) return "NEUTRAL";
  return moveBps > 0 ? "UP" : "DOWN";
}

function resultFor(prediction, actual) {
  if (prediction === "INSUFFICIENT") return TICK_OUTCOME_RESULT.INSUFFICIENT_ENTRY_PREDICTION;
  if (prediction === "NEUTRAL") return TICK_OUTCOME_RESULT.NEUTRAL_PREDICTION;
  if (actual === "NEUTRAL") return TICK_OUTCOME_RESULT.NEUTRAL_TARGET;
  return prediction === actual ? TICK_OUTCOME_RESULT.CORRECT : TICK_OUTCOME_RESULT.WRONG;
}

export function updateTickDirectionOutcomeAudit({
  trade,
  currentPrice,
  observedAt,
  source,
  config = TICK_DIRECTION_CONFIG,
} = {}) {
  if (!trade) return {};
  const entryTime = finite(trade.entryTime);
  const entryPrice = finite(trade.entryPrice);
  const price = finite(currentPrice);
  const at = finite(observedAt);
  if (entryTime == null || entryPrice == null || entryPrice <= 0 || price == null || at == null) return {};
  const threshold = finite(trade.marketTickNeutralThresholdBps) ?? 0.5;
  const prediction = predictedDirection(trade.marketTickDirectionVerdict);
  const update = {};
  for (const horizonMs of config.outcomeHorizonsMs) {
    const key = suffix(horizonMs);
    const resultKey = `marketTickPredictionResult${key}`;
    if (trade[resultKey] != null) continue;
    const target = entryTime + horizonMs;
    if (at < target) continue;
    const moveBps = ((price - entryPrice) / entryPrice) * 10_000;
    const actual = classifyForward(moveBps, threshold);
    const outcome = resultFor(prediction, actual);
    update[`marketTickForwardPrice${key}`] = price;
    update[`marketTickForwardMoveBps${key}`] = Number(moveBps.toFixed(6));
    update[`marketTickForwardDirection${key}`] = actual;
    update[`marketTickPredictionCorrect${key}`] = outcome === TICK_OUTCOME_RESULT.CORRECT
      ? true : outcome === TICK_OUTCOME_RESULT.WRONG ? false : null;
    update[resultKey] = outcome;
    update[`marketTickPredictionLatencyMs${key}`] = Math.max(0, at - target);
    update[`marketTickOutcomeSource${key}`] = source ?? null;
  }
  const merged = { ...trade, ...update };
  const filled = config.outcomeHorizonsMs.filter(horizonMs => merged[`marketTickForwardPrice${suffix(horizonMs)}`] != null).length;
  update.marketTickOutcomeCoveragePct = Math.round((filled / config.outcomeHorizonsMs.length) * 100);
  update.marketTickOutcomeAuditVersion = TICK_DIRECTION_OUTCOME_AUDIT_VERSION;
  return update;
}

export function censorUnfilledTickDirectionOutcomes(trade, config = TICK_DIRECTION_CONFIG) {
  const update = {};
  for (const horizonMs of config.outcomeHorizonsMs) {
    const key = suffix(horizonMs);
    const resultKey = `marketTickPredictionResult${key}`;
    if (trade?.[resultKey] == null) update[resultKey] = TICK_OUTCOME_RESULT.CENSORED;
  }
  const merged = { ...trade, ...update };
  const filled = config.outcomeHorizonsMs.filter(horizonMs => merged[`marketTickForwardPrice${suffix(horizonMs)}`] != null).length;
  update.marketTickOutcomeCoveragePct = Math.round((filled / config.outcomeHorizonsMs.length) * 100);
  update.marketTickOutcomeAuditVersion = TICK_DIRECTION_OUTCOME_AUDIT_VERSION;
  return update;
}
