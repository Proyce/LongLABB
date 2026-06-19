// ─── FEE-SAFE PROFIT LOCK ─────────────────────────────────────────────────────
// Authorized execution: clamp the first profit-lock rule so that its floor
// protects at least the configured minimum positive net-after-fees buffer.
//
// Authority:
//   feeSafeFirstLockExecutionMode: "APPLY_FIRST_LOCK_ONLY"
//   feeSafeFirstLockExecutionApplied: true
//   feeSafeFirstLockCanAffectTrades: true
//
// Constraints:
//   - Only raises the first lock floor/trigger. Never lowers them.
//   - Does not block entries, change stop-loss, or alter hard TP.
//   - Does not reprice later lock stages.
//   - Profile downgrades can tighten or preserve a lock but never loosen it.

import { DEFAULT_FEE_CONFIG } from "./feeConfig.js";
import { computeProjectedExitFeeAtFloor } from "./feeAccounting.js";

const VERSION = "fee-safe-lock-v2.0.0";
const ROUNDING = 4;

function r(n) { return parseFloat(n.toFixed(ROUNDING)); }
function rIncrement(n, inc) {
  if (!inc || inc <= 0) return r(n);
  return r(Math.ceil(n / inc) * inc);
}

/**
 * Compute the minimum gross floor needed so that net-after-fees >= targetNetMarginPct.
 *
 *   projectedNetAtFloor = grossFloor - entryFeeMarginPct - projectedExitFeeAtFloor
 *   grossFloor = targetNetMarginPct + entryFeeMarginPct + projectedExitFeeAtFloor(grossFloor)
 *
 * Since the exit fee at the floor depends on the floor itself (for notional-aware),
 * we iterate (converges in 2–3 steps for normal fee ranges).
 */
function findMinimumGrossFloor({
  targetNetMarginPct,
  entryFeeMarginPct,
  leverage,
  marginUsedUsd,
  entryPrice,
  exitFeeRatePct,
  roundingIncrementMarginPct,
  maxIterations = 6,
}) {
  // Initial estimate using percentage model
  const percentExitFee = r(Number(exitFeeRatePct ?? 0.05) * (Number(leverage) || 1));
  let candidate = r(Number(targetNetMarginPct) + Number(entryFeeMarginPct) + percentExitFee);

  for (let i = 0; i < maxIterations; i++) {
    const exitFeeAtCandidate = computeProjectedExitFeeAtFloor({
      candidateGrossFloorMarginPct: candidate,
      leverage,
      marginUsedUsd,
      entryPrice,
      exitFeeRatePct,
    });
    const required = r(Number(targetNetMarginPct) + Number(entryFeeMarginPct) + exitFeeAtCandidate);
    if (Math.abs(required - candidate) < 0.001) {
      candidate = required;
      break;
    }
    candidate = required;
  }

  return rIncrement(candidate, roundingIncrementMarginPct);
}

/**
 * Apply fee-safe clamping to the first profit-lock rule.
 *
 * @param {object} params
 * @param {object} params.sample         - Trade sample with leverage, entryPrice, feeSnapshot, etc.
 * @param {Array}  params.rawRules       - Raw rules from getDynamicProfitLockRules(sample).
 * @param {object} [params.feeSnapshot]  - Frozen fee snapshot from sample.feeSnapshot.
 * @param {object} [params.config]       - Fee config (uses DEFAULT_FEE_CONFIG if omitted).
 * @param {number} [params.existingActiveLockFloorMarginPct] - Active floor from a prior lock stage.
 * @returns {{ effectiveRules, diagnostics }}
 */
export function applyFeeSafeFirstProfitLockRule({
  sample,
  rawRules,
  feeSnapshot,
  config = DEFAULT_FEE_CONFIG,
  existingActiveLockFloorMarginPct = null,
}) {
  if (!Array.isArray(rawRules) || rawRules.length === 0) {
    return { effectiveRules: rawRules ?? [], diagnostics: { firstLockFeeSafetyApplied: false } };
  }

  const safety = config.profitLockFeeSafety ?? {};
  if (!safety.enabled) {
    return { effectiveRules: rawRules, diagnostics: { firstLockFeeSafetyApplied: false } };
  }

  const leverage    = Number(sample.leverage) || 1;
  const snap        = feeSnapshot ?? sample.feeSnapshot ?? {};
  const marginUsd   = sample.marginUsedUsd ?? null;
  const entryPrice  = sample.entryPrice    ?? null;

  const minNet      = Number(safety.minProtectedNetAfterFeesMarginPct ?? 0.25);
  const minHeadroom = Number(safety.minTriggerToFloorHeadroomMarginPct ?? 0.50);
  const rounding    = Number(safety.floorRoundingIncrementMarginPct ?? 0.05);

  // Resolve entry fee — prefer actual, then snapshot, then conservative taker
  const entryFeeRatePct = snap.entryFeeRatePct ?? config.takerFeeRatePct;
  const entryFeeMarginPct = r(entryFeeRatePct * leverage);
  const entryFeeSource =
    snap.feeSource === "EXCHANGE_FILL" ? "ACTUAL_EXCHANGE" :
    snap.entryFeeRatePct != null       ? "SNAPSHOT"        : "CONSERVATIVE_FALLBACK";

  // For lock exits: use taker rate (market/stop-market) unless explicitly overridden
  const exitFeeRatePct = config.takerFeeRatePct;

  // First raw rule
  const rawFirstRule = rawRules[0];
  const rawFirstFloorMarginPct   = Number(rawFirstRule.lockMarginPct);
  const rawFirstTriggerPricePct  = Number(rawFirstRule.triggerPricePct);
  const rawFirstTriggerMarginPct = r(rawFirstTriggerPricePct * leverage);

  // Compute required gross floor to protect minNet after fees
  const requiredGrossFloor = findMinimumGrossFloor({
    targetNetMarginPct:  minNet,
    entryFeeMarginPct,
    leverage,
    marginUsedUsd:       marginUsd,
    entryPrice,
    exitFeeRatePct,
    roundingIncrementMarginPct: rounding,
  });

  // Apply monotonic floor protection: never go below existing active floor
  const existingFloor = existingActiveLockFloorMarginPct ?? -Infinity;

  const feeSafeFirstFloorMarginPct = Math.max(
    rawFirstFloorMarginPct,
    requiredGrossFloor,
    existingFloor,
  );
  const feeSafeFirstFloorRounded = rIncrement(feeSafeFirstFloorMarginPct, rounding);

  // Raise trigger if needed to maintain trigger-to-floor headroom
  const minRequiredTriggerMarginPct = r(feeSafeFirstFloorRounded + minHeadroom);
  const feeSafeFirstTriggerMarginPct = Math.max(rawFirstTriggerMarginPct, minRequiredTriggerMarginPct);
  const feeSafeFirstTriggerPricePct  = r(feeSafeFirstTriggerMarginPct / leverage);

  // Verify the resulting projected net
  const projectedExitFeeAtFloor = computeProjectedExitFeeAtFloor({
    candidateGrossFloorMarginPct: feeSafeFirstFloorRounded,
    leverage,
    marginUsedUsd: marginUsd,
    entryPrice,
    exitFeeRatePct,
  });
  const projectedNetAtEffectiveFloor = r(
    feeSafeFirstFloorRounded - entryFeeMarginPct - projectedExitFeeAtFloor
  );

  const floorRaised   = feeSafeFirstFloorRounded > rawFirstFloorMarginPct + 0.0001;
  const triggerRaised = feeSafeFirstTriggerMarginPct > rawFirstTriggerMarginPct + 0.0001;
  const alreadySafe   = !floorRaised && !triggerRaised;

  // Net buffer violation check
  const bufferViolation = projectedNetAtEffectiveFloor < minNet - 0.001;

  const feeCalculationStatus =
    entryFeeSource === "CONSERVATIVE_FALLBACK" ? "ESTIMATED_CONSERVATIVE" : "COMPLETE";

  // Build effective first rule
  const effectiveFirstRule = {
    ...rawFirstRule,
    triggerPricePct: feeSafeFirstTriggerPricePct,
    lockMarginPct:   feeSafeFirstFloorRounded,
    _feeSafeApplied: true,
  };

  const effectiveRules = [effectiveFirstRule, ...rawRules.slice(1)];

  const diagnostics = {
    rawFirstLockTriggerMarginPct:         rawFirstTriggerMarginPct,
    rawFirstLockFloorMarginPct:           rawFirstFloorMarginPct,
    feeSafeFirstLockTriggerMarginPct:     feeSafeFirstTriggerMarginPct,
    feeSafeFirstLockFloorMarginPct:       feeSafeFirstFloorRounded,
    feeSafeFirstLockMinNetBufferMarginPct: minNet,
    projectedFirstLockNetAfterFeesMarginPct: projectedNetAtEffectiveFloor,
    firstLockFeeSafetyApplied:            true,
    firstLockFloorRaisedForFees:          floorRaised,
    firstLockTriggerRaisedForHeadroom:    triggerRaised,
    firstLockAlreadyFeeSafe:              alreadySafe,
    firstLockFeeSafetyAdjustmentMarginPct: r(feeSafeFirstFloorRounded - rawFirstFloorMarginPct),
    firstLockFeeCalculationStatus:        feeCalculationStatus,
    firstLockFeeCalculationSource:        entryFeeSource,
    firstLockFeeSafetyVersion:            VERSION,
    firstLockNetBufferViolation:          bufferViolation,

    feeSafeFirstLockExecutionMode:        "APPLY_FIRST_LOCK_ONLY",
    feeSafeFirstLockExecutionApplied:     true,
    feeSafeFirstLockCanAffectTrades:      true,
    feeAwareExecutionMode:                "LOG_ONLY",
    feeAwareExecutionApplied:             false,
    feeAwareExecutionCanAffectTrades:     false,
  };

  return { effectiveRules, diagnostics };
}

/**
 * When a live trade changes exit profile, ensure the new first lock floor
 * never falls below the currently active floor.
 */
export function applyMonotonicFloorOnProfileChange({
  newRawRules,
  currentActiveLockFloorMarginPct,
  sample,
  feeSnapshot,
  config = DEFAULT_FEE_CONFIG,
}) {
  const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({
    sample,
    rawRules: newRawRules,
    feeSnapshot,
    config,
    existingActiveLockFloorMarginPct: currentActiveLockFloorMarginPct ?? -Infinity,
  });

  return { effectiveRules, diagnostics };
}
