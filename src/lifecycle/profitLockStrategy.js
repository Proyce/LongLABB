// ─── PROFIT-LOCK STRATEGY CALCULATION ────────────────────────────────────────
// Pure extraction of the existing fee-safe lock ladder. Protection/execution is
// handled separately by profitLockProtection.js.

import { DEFAULT_FEE_CONFIG } from '../fees/feeConfig.js';
import { getDynamicProfitLockRulesFeeSafe } from '../exitProfiles/dynamicExitProfiles.js';

export function getLongProfitLockUpdate(s, cp, ts, feeConfig = DEFAULT_FEE_CONFIG) {
  const priceFavor = (cp - s.entryPrice) / s.entryPrice * 100;
  const marginPnl = priceFavor * s.leverage;
  const { effectiveRules, rawRules, diagnostics: feeSafeDiagnostics } =
    getDynamicProfitLockRulesFeeSafe(s, feeConfig);

  let bestLockMargin = s.profitLockLevelMarginPct ?? 0;
  let newLockPrice = s.profitLockLevelPrice ?? null;
  let newStage = s.profitLockStage ?? null;
  let events = s.profitLockEvents ?? [];
  let activated = s.profitLockActive ?? false;

  for (const rule of effectiveRules) {
    if (priceFavor >= rule.triggerPricePct && rule.lockMarginPct > bestLockMargin) {
      const lockPrice = Number((s.entryPrice * (1 + rule.lockMarginPct / s.leverage / 100)).toFixed(8));
      bestLockMargin = rule.lockMarginPct;
      newLockPrice = lockPrice;
      newStage = rule.stage;
      activated = true;
      events = [...events, {
        ts,
        symbol: s.symbol,
        leverage: s.leverage,
        stage: rule.stage,
        price: cp,
        priceFavorPct: Number(priceFavor.toFixed(4)),
        marginPnlPct: Number(marginPnl.toFixed(4)),
        lockMarginPct: rule.lockMarginPct,
        lockPrice,
        reason: 'UPDATED',
      }];
    }
  }

  const floorMargin = bestLockMargin || null;
  const floorPrice = newLockPrice;
  const projectedNetAfterFeesAtFloor = floorMargin != null && s.feeSnapshot
    ? Number((floorMargin - (s.feeSnapshot.entryFeeRatePct ?? 0.05) * s.leverage - (s.feeSnapshot.exitFeeRatePct ?? 0.05) * s.leverage).toFixed(4))
    : null;

  return {
    profitLockActive: activated,
    profitLockActivatedAt: activated && !s.profitLockActive ? ts : (s.profitLockActivatedAt ?? null),
    profitLockLevelMarginPct: floorMargin,
    profitLockLevelPrice: floorPrice,
    profitLockStage: newStage,
    profitLockEvents: events,
    highestProfitPricePct: Math.max(s.highestProfitPricePct ?? 0, priceFavor),
    highestMarginPnlPct: Math.max(s.highestMarginPnlPct ?? 0, marginPnl),
    activeLockFloorMarginPct: floorMargin,
    activeLockFloorPrice: floorPrice,
    projectedNetAfterFeesAtFloor,
    rawProfitLockRules: rawRules,
    feeSafeEffectiveProfitLockRules: effectiveRules,
    feeSafeFirstLockDiagnostics: feeSafeDiagnostics,
  };
}
