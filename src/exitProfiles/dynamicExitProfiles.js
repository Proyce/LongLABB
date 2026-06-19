// â”€â”€â”€ DYNAMIC EXIT PROFILES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Post-entry dynamic profile selection. Entry validates the short thesis;
// exit profile is chosen and can change while the trade is alive.

import { applyFeeSafeFirstProfitLockRule, applyMonotonicFloorOnProfileChange } from "../fees/feeSafeProfitLock.js";
import { DEFAULT_FEE_CONFIG } from "../fees/feeConfig.js";

export { applyFeeSafeFirstProfitLockRule, applyMonotonicFloorOnProfileChange };

// â”€â”€ Profit lock config (moved here to avoid circular deps) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const PROFIT_LOCK_CONFIG = {
  oneX: [
    { triggerPricePct: 3.0, lockMarginPct: 1.5, stage: "LOCK_1X_S1" },
    { triggerPricePct: 5.0, lockMarginPct: 3.0, stage: "LOCK_1X_S2" },
  ],
  fiveX: [
    { triggerPricePct: 1.0, lockMarginPct: 2,   stage: "LOCK_5X_S1" },
    { triggerPricePct: 2.0, lockMarginPct: 5,   stage: "LOCK_5X_S2" },
  ],
  tenX: [
    { triggerPricePct: 0.75, lockMarginPct: 2,  stage: "LOCK_10X_S1" },
    { triggerPricePct: 1.0,  lockMarginPct: 5,  stage: "LOCK_10X_S2" },
    { triggerPricePct: 2.0,  lockMarginPct: 10, stage: "LOCK_10X_S3" },
  ],
  fallback: [
    { triggerPricePct: 1.0, lockMarginPct: 2,   stage: "LOCK_FB_S1" },
    { triggerPricePct: 2.0, lockMarginPct: 5,   stage: "LOCK_FB_S2" },
  ],
};

export function getProfitLockRules(leverage) {
  if (leverage === 1)  return PROFIT_LOCK_CONFIG.oneX;
  if (leverage === 5)  return PROFIT_LOCK_CONFIG.fiveX;
  if (leverage === 10) return PROFIT_LOCK_CONFIG.tenX;
  return PROFIT_LOCK_CONFIG.fallback;
}

// â”€â”€ Exit profile constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const EXIT_PROFILE = {
  NORMAL: "NORMAL",
  FAST:   "FAST",
  SAFE:   "SAFE",
  RUNNER: "RUNNER",
};

// All values are margin-level PnL percentages, not price-level.
export const EXIT_PROFILE_CONFIG = {
  NORMAL: {
    label: "NORMAL_EXIT_PROFILE",
    tpMarginPct: null,
    lockTriggerMarginPct: null,
    lockFloorMarginPct: null,
  },
  FAST: {
    label: "FAST_LOCK_PROFILE",
    tpMarginPct: 12,
    lockTriggerMarginPct: 1.0,
    lockFloorMarginPct: 0.8,
  },
  SAFE: {
    label: "SAFE_FLOOR_PROFILE",
    tpMarginPct: 12,
    lockTriggerMarginPct: 2.0,
    lockFloorMarginPct: 1.2,
  },
  RUNNER: {
    label: "RUNNER_PROFILE",
    tpMarginPct: 15,
    lockTriggerMarginPct: 3.0,
    lockFloorMarginPct: 2.0,
  },
};

// â”€â”€ Price conversion helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function marginPctToPricePct(marginPct, leverage) {
  if (!leverage) return null;
  return marginPct / leverage;
}

export function lockMarginPctToLongLockPrice(entryPrice, lockMarginPct, leverage) {
  return parseFloat((entryPrice * (1 + lockMarginPct / leverage / 100)).toFixed(8));
}

// â”€â”€ Initial bias resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function resolveInitialExitProfileBias(sample) {
  if (sample.longParentBucket === "TOP_GAINER_LONGS") {
    if (
      sample.hasGainerFailedBreakout ||
      sample.topGainerExhaustionQualityScore >= 120 ||
      sample.hasGainerExhaustionConfirmation
    ) {
      return "GAINER_RUNNER_CANDIDATE";
    }
    return "GAINER_FAST_CANDIDATE";
  }

  if (sample.longParentBucket === "TOP_LOSER_LONGS") {
    if (
      sample.longGateWouldPass &&
      sample.hasRedConfirmation &&
      !sample.hasGreenDanger
    ) {
      return "LOSER_RUNNER_CANDIDATE";
    }
    return "LOSER_NORMAL_CANDIDATE";
  }

  return "NORMAL_CANDIDATE";
}

// â”€â”€ Live context builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function buildLiveExitContext(sample, cp, ts, lockUpdate = {}) {
  const entryPrice   = Number(sample.entryPrice);
  const leverage     = Number(sample.leverage) || 1;
  const currentPrice = Number(cp);

  // LONG: price rising above entry is favorable
  const priceFavorPct = entryPrice > 0
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : 0;

  const marginPnlPct = priceFavorPct * leverage;
  const mfeMarginPct = Math.max(
    sample.highestMarginPnlPct ?? 0,
    lockUpdate.highestMarginPnlPct ?? 0,
    marginPnlPct,
  );

  // LONG: seller danger = bearish signals threatening long thesis
  const sellerDanger =
    sample.hasRedDanger ||
    sample.entryTiming?.immediateRedImpulse ||
    sample.immediateRedImpulse ||
    sample.redPressureLabel === "IMMEDIATE_RED_ACTIVE" ||
    sample.cvdLabel === "BEAR" ||
    sample.vwapContextLabel === "VWAP_LOSS" ||
    sample.btcRunDirection === "DOWN";

  // LONG: continuation = bullish signals supporting long thesis
  const continuationLong =
    !sellerDanger &&
    (
      sample.immediateGreenImpulse ||
      sample.entryTiming?.immediateGreenImpulse ||
      sample.hasGreenConfirmation
    ) &&
    (
      sample.cvdLabel === "BULL" ||
      sample.cvdLabel === "NEUT" ||
      sample.btcRunDirection === "UP" ||
      sample.vwapContextLabel === "VWAP_RECLAIM" ||
      sample.vwapContextLabel === "ABOVE_VWAP" ||
      sample.hasRsiRolloverUp ||
      sample.hasMicroMomentum
    );

  return {
    ts,
    currentPrice,
    leverage,
    priceFavorPct,
    marginPnlPct,
    mfeMarginPct,
    sellerDanger,
    continuationLong,
    // Legacy compat aliases so existing callers that reference these fields still work
    greenDanger: sellerDanger,
    continuationShort: false,
    lockActive: lockUpdate.profitLockActive || sample.profitLockActive,
    activeLockFloorMarginPct:
      lockUpdate.profitLockLevelMarginPct ??
      sample.profitLockLevelMarginPct ??
      sample.activeLockFloorMarginPct ??
      null,
  };
}

// â”€â”€ Profile activation rules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function shouldActivateFastProfile(sample, live) {
  if (live.mfeMarginPct < EXIT_PROFILE_CONFIG.FAST.lockTriggerMarginPct) return false;

  const isGainer = sample.longParentBucket === "TOP_GAINER_LONGS";

  // LONG: fast-harvest when seller danger is detected or momentum is decaying
  const fragileProfit =
    live.sellerDanger ||
    sample.hasGainerContinuationDanger ||
    sample.topGainerContinuationDangerScore >= 60 ||
    sample.topGainerContinuationPressureLabel === "HIGH" ||
    sample.topGainerPumpPhaseLabel === "PUMP_STILL_HOT" ||
    sample.btcRunDirection === "DOWN";

  // LONG: gainer fast-harvest when profit is available but continuation is not confirmed
  if (isGainer && live.mfeMarginPct >= 1.0 && !live.continuationLong) return true;

  return fragileProfit;
}

export function shouldActivateRunnerProfile(sample, live) {
  if (live.mfeMarginPct < EXIT_PROFILE_CONFIG.RUNNER.lockTriggerMarginPct) return false;
  // LONG: seller danger blocks runner — only run when long continuation is present
  if (live.sellerDanger) return false;
  if (!live.continuationLong) return false;

  // LONG loser reversal runner: confirmed reversal with bullish follow-through
  const isLoserRunner =
    sample.longParentBucket === "TOP_LOSER_LONGS" &&
    sample.longGateWouldPass &&
    !sample.hasRedDanger &&
    (
      sample.btcRunDirection === "UP" ||
      sample.hasRsiRolloverUp ||
      sample.cvdLabel === "BULL" ||
      sample.hasMicroMomentum
    );

  // LONG gainer continuation runner: healthy continuation with no blowoff danger
  const isGainerRunner =
    sample.longParentBucket === "TOP_GAINER_LONGS" &&
    sample.hasGreenConfirmation &&
    !sample.hasGainerBlowoffDanger &&
    !sample.hasGainerContinuationDanger &&
    (
      sample.cvdLabel === "BULL" ||
      sample.vwapContextLabel === "ABOVE_VWAP" ||
      sample.vwapContextLabel === "VWAP_RECLAIM"
    );

  return isLoserRunner || isGainerRunner;
}

export function shouldDowngradeRunnerProfile(sample, live) {
  if (sample.exitProfileSelected !== EXIT_PROFILE.RUNNER) return false;

  // LONG: downgrade runner when seller danger or bearish signals emerge
  return (
    live.sellerDanger ||
    sample.hasGainerContinuationDanger ||
    sample.hasGainerBlowoffDanger ||
    sample.cvdLabel === "BEAR" ||
    sample.btcRunDirection === "DOWN" ||
    sample.vwapContextLabel === "VWAP_LOSS" ||
    sample.redPressureLabel === "IMMEDIATE_RED_ACTIVE"
  );
}

// â”€â”€ Main resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function resolveDynamicExitProfile(sample, live) {
  if (sample.exitProfileSelected === EXIT_PROFILE.RUNNER && shouldDowngradeRunnerProfile(sample, live)) {
    return {
      exitProfileSelected: EXIT_PROFILE.FAST,
      exitProfileReason: "RUNNER_DOWNGRADED_SELLER_DANGER_OR_BEARISH_SIGNAL",
      exitProfileDowngradedFrom: EXIT_PROFILE.RUNNER,
      exitProfileDowngradeReason: "SELLER_DANGER_OR_CVD_BEAR_OR_BTC_DOWN",
    };
  }

  if (shouldActivateRunnerProfile(sample, live)) {
    return {
      exitProfileSelected: EXIT_PROFILE.RUNNER,
      exitProfileReason: "MFE_3_PLUS_LONG_CONTINUATION_CONFIRMED",
      runnerProfileActivated: true,
    };
  }

  if (shouldActivateFastProfile(sample, live)) {
    return {
      exitProfileSelected: EXIT_PROFILE.FAST,
      exitProfileReason: "MFE_1_PLUS_FRAGILE_PROFIT_FAST_HARVEST",
      fastProfileActivated: true,
    };
  }

  if (live.lockActive) {
    return {
      exitProfileSelected: EXIT_PROFILE.SAFE,
      exitProfileReason: "LOCK_ACTIVE_SAFE_FLOOR_ENFORCEMENT",
      safeProfileActivated: true,
    };
  }

  return {
    exitProfileSelected: sample.exitProfileSelected ?? EXIT_PROFILE.NORMAL,
    exitProfileReason: sample.exitProfileReason ?? "NORMAL_NO_DYNAMIC_PROFILE_TRIGGER",
  };
}

// â”€â”€ Dynamic lock rules by profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getDynamicProfitLockRules(sample) {
  const profile = sample.exitProfileSelected ?? EXIT_PROFILE.NORMAL;

  if (profile === EXIT_PROFILE.FAST) {
    return [
      {
        triggerPricePct: marginPctToPricePct(EXIT_PROFILE_CONFIG.FAST.lockTriggerMarginPct, sample.leverage),
        lockMarginPct: EXIT_PROFILE_CONFIG.FAST.lockFloorMarginPct,
        stage: "FAST_LOCK_S1",
      },
    ];
  }

  if (profile === EXIT_PROFILE.SAFE) {
    return [
      {
        triggerPricePct: marginPctToPricePct(EXIT_PROFILE_CONFIG.SAFE.lockTriggerMarginPct, sample.leverage),
        lockMarginPct: EXIT_PROFILE_CONFIG.SAFE.lockFloorMarginPct,
        stage: "SAFE_LOCK_S1",
      },
    ];
  }

  if (profile === EXIT_PROFILE.RUNNER) {
    return [
      {
        triggerPricePct: marginPctToPricePct(EXIT_PROFILE_CONFIG.RUNNER.lockTriggerMarginPct, sample.leverage),
        lockMarginPct: EXIT_PROFILE_CONFIG.RUNNER.lockFloorMarginPct,
        stage: "RUNNER_LOCK_S1",
      },
      ...getProfitLockRules(sample.leverage),
    ];
  }

  return getProfitLockRules(sample.leverage);
}

// â”€â”€ Fee-safe combined lock resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Get dynamic profit-lock rules with the fee-safe first-lock clamp applied.
 * This is the canonical entry point for all callers that need effective rules.
 *
 * Execution authority:
 *   feeSafeFirstLockExecutionMode: "APPLY_FIRST_LOCK_ONLY"
 *   feeSafeFirstLockCanAffectTrades: true
 */
export function getDynamicProfitLockRulesFeeSafe(sample, feeConfig = DEFAULT_FEE_CONFIG) {
  const rawRules = getDynamicProfitLockRules(sample);
  const { effectiveRules, diagnostics } = applyFeeSafeFirstProfitLockRule({
    sample,
    rawRules,
    feeSnapshot: sample.feeSnapshot,
    config: feeConfig,
    existingActiveLockFloorMarginPct: sample.activeLockFloorMarginPct ?? null,
  });
  return { effectiveRules, rawRules, diagnostics };
}

// â”€â”€ Default exit profile sample fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function makeExitProfileDefaults() {
  return {
    exitProfileSelected:         EXIT_PROFILE.NORMAL,
    exitProfileInitialBias:      null,
    exitProfileReason:           "DEFAULT_NORMAL",
    exitProfileChangedAt:        null,
    exitProfileHistory:          [],

    fastProfileActivated:        false,
    safeProfileActivated:        false,
    runnerProfileActivated:      false,

    exitProfileDowngradedFrom:   null,
    exitProfileDowngradeReason:  null,

    activeLockFloorMarginPct:    null,
    activeLockFloorPrice:        null,
    floorExitEnforced:           false,
    wouldHaveExitedBelowFloor:   false,
  };
}
