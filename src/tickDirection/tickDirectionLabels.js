import { TICK_DIRECTION_CONFIG } from "./tickDirection.config.js";
import { TICK_DIRECTION, TICK_PATTERN } from "./tickDirection.types.js";

export function getAtrTier(atrPct, config = TICK_DIRECTION_CONFIG) {
  const atr = Number(atrPct);
  if (!Number.isFinite(atr) || atr < config.highAtrMin) return "ATR_INACTIVE";
  if (atr < config.veryHighAtrMin) return "ATR_ACTIVE";
  if (atr < config.extremeAtrMin) return "ATR_HIGH";
  return "ATR_EXTREME";
}

export function classifyTickPattern(features, {
  atrPct = null,
  config = TICK_DIRECTION_CONFIG,
} = {}) {
  const primary = features?.window3s ?? features?.window5s ?? {};
  const fallback = features?.window5s ?? features?.window10s ?? {};
  const direction = primary.direction === TICK_DIRECTION.INSUFFICIENT
    ? fallback.direction
    : primary.direction;
  const efficiency = Number(primary.efficiency ?? fallback.efficiency ?? 0);
  const velocity = Number(primary.velocity ?? fallback.velocity ?? 0);
  const acceleration = primary.acceleration ?? fallback.acceleration;
  const firstHalf = primary.firstHalfNetMoveBps ?? fallback.firstHalfNetMoveBps;
  const secondHalf = primary.secondHalfNetMoveBps ?? fallback.secondHalfNetMoveBps;
  const reversalCount = Number(features?.reversalCount10 ?? primary.reversalCount ?? 0);
  const grossMove = Number(primary.grossMoveBps ?? fallback.grossMoveBps ?? 0);
  const spreadChange = Number(features?.spreadChangeBps3s ?? 0);
  const severeSpreadExpansion = spreadChange > 5;
  const flow = features?.aggressorFlowLabel3s;

  let pattern = TICK_PATTERN.MIXED;
  if (direction === TICK_DIRECTION.INSUFFICIENT) {
    pattern = TICK_PATTERN.INSUFFICIENT;
  } else if (
    grossMove >= config.flatThresholdBps * 8 &&
    efficiency <= config.chaoticEfficiencyMax &&
    reversalCount >= config.chaoticMinimumReversals
  ) {
    pattern = TICK_PATTERN.HIGH_VOL_CHAOS;
  } else if (
    firstHalf != null && firstHalf < -config.flatThresholdBps &&
    secondHalf != null && secondHalf > config.flatThresholdBps &&
    velocity > 0 && flow !== "STRONG_SELL"
  ) {
    pattern = TICK_PATTERN.BULLISH_REVERSAL;
  } else if (
    firstHalf != null && firstHalf > config.flatThresholdBps &&
    secondHalf != null && secondHalf < -config.flatThresholdBps &&
    velocity < 0 && flow !== "STRONG_BUY"
  ) {
    pattern = TICK_PATTERN.BEARISH_REVERSAL;
  } else if (
    direction === TICK_DIRECTION.UP &&
    efficiency >= 0.60 &&
    velocity > 0 &&
    Number(acceleration) > 0 &&
    Number(features?.currentUpStreak ?? 0) >= 3 &&
    !severeSpreadExpansion
  ) {
    pattern = TICK_PATTERN.UP_EXPANSION;
  } else if (
    direction === TICK_DIRECTION.DOWN &&
    efficiency >= 0.60 &&
    velocity < 0 &&
    Number(acceleration) < 0 &&
    Number(features?.currentDownStreak ?? 0) >= 3 &&
    !severeSpreadExpansion
  ) {
    pattern = TICK_PATTERN.DOWN_EXPANSION;
  } else if (direction === TICK_DIRECTION.UP && velocity > 0 && Number(acceleration) < 0) {
    pattern = TICK_PATTERN.UP_DECELERATION;
  } else if (direction === TICK_DIRECTION.DOWN && velocity < 0 && Number(acceleration) > 0) {
    pattern = TICK_PATTERN.DOWN_DECELERATION;
  } else if (direction === TICK_DIRECTION.UP) {
    pattern = TICK_PATTERN.UP_PERSISTENT;
  } else if (direction === TICK_DIRECTION.DOWN) {
    pattern = TICK_PATTERN.DOWN_PERSISTENT;
  } else if (
    getAtrTier(atrPct, config) !== "ATR_INACTIVE" &&
    grossMove < config.flatThresholdBps * 3
  ) {
    pattern = TICK_PATTERN.STALLED;
  }

  const supportingLabels = [
    direction === TICK_DIRECTION.UP ? "RECENT_DIRECTION_UP" : null,
    direction === TICK_DIRECTION.DOWN ? "RECENT_DIRECTION_DOWN" : null,
    features?.tradeBookAgreement3s === "AGREE_UP" ? "TRADE_BOOK_AGREE_UP" : null,
    features?.tradeBookAgreement3s === "AGREE_DOWN" ? "TRADE_BOOK_AGREE_DOWN" : null,
    flow === "STRONG_BUY" ? "STRONG_BUY_AGGRESSOR_FLOW" : null,
    flow === "STRONG_SELL" ? "STRONG_SELL_AGGRESSOR_FLOW" : null,
  ].filter(Boolean);

  return { primaryPattern: pattern, supportingLabels };
}

export function getHighAtrContextLabel(atrPct, primaryPattern, config = TICK_DIRECTION_CONFIG) {
  const tier = getAtrTier(atrPct, config);
  if (tier === "ATR_INACTIVE") return "ATR_NOT_ACTIVE";
  const map = {
    [TICK_PATTERN.UP_EXPANSION]: "HIGH_ATR_TICK_UP_EXPANSION",
    [TICK_PATTERN.BULLISH_REVERSAL]: "HIGH_ATR_TICK_BULLISH_REVERSAL",
    [TICK_PATTERN.UP_DECELERATION]: "HIGH_ATR_TICK_UP_DECELERATION",
    [TICK_PATTERN.DOWN_EXPANSION]: "HIGH_ATR_TICK_DOWN_EXPANSION",
    [TICK_PATTERN.BEARISH_REVERSAL]: "HIGH_ATR_TICK_BEARISH_REVERSAL",
    [TICK_PATTERN.HIGH_VOL_CHAOS]: "HIGH_ATR_TICK_CHAOS",
    [TICK_PATTERN.STALLED]: "HIGH_ATR_TICK_STALLED",
  };
  return map[primaryPattern] ?? "TICK_DIRECTION_UNKNOWN";
}
