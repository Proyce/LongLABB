import { LONG_PF10_FEATURE } from './longPostFee10.constants.js';

const REQUIRED_INPUT_KEYS = [
  'hasGreenConfirmation',
  'entryCvdLabel',
  'spreadPct',
  'atrPct',
  'longMicroMomentumLabel',
  'longAuditDangerTier',
];

export function extractLongPostFee10Features(candidate) {
  const c = candidate ?? {};

  // ── Required-input coverage ────────────────────────────────────────────────
  const cvdLabelRaw       = c.entryCvdLabel ?? c.cvdLabel ?? null;
  const spreadKnown       = Number.isFinite(c.spreadPct);
  const atrKnown          = Number.isFinite(c.atrPct);
  const greenConfirmKnown = c.hasGreenConfirmation === true || c.hasGreenConfirmation === false;
  const microLabelRaw     = c.longMicroMomentumLabel ?? c.microMomentumLabel ?? null;
  const auditTierKnown    = c.longAuditDangerTier != null;

  const requiredKnownFlags = [
    greenConfirmKnown,
    cvdLabelRaw != null,
    spreadKnown,
    atrKnown,
    microLabelRaw != null,
    auditTierKnown,
  ];

  const knownCount         = requiredKnownFlags.filter(Boolean).length;
  const featureCoveragePct = (knownCount / REQUIRED_INPUT_KEYS.length) * 100;
  const availableFeatures  = REQUIRED_INPUT_KEYS.filter((_, i) => requiredKnownFlags[i]);
  const missingFeatures    = REQUIRED_INPUT_KEYS.filter((_, i) => !requiredKnownFlags[i]);

  // ── Derive features — null means unknown, not false ───────────────────────
  const triOr = (values) => {
    if (values.some(v => v === true)) return true;
    if (values.some(v => v === false)) return false;
    return null;
  };
  const greenConfirmation = greenConfirmKnown
    ? c.hasGreenConfirmation
    : triOr([c.immediateGreenImpulse, c.greenImpulseDetected]);
  const greenReaccel   = triOr([c.greenReacceleration, c.hasGreenReacceleration]);
  const immediateGreen = c.immediateGreenImpulse === true ? true : c.immediateGreenImpulse === false ? false : null;
  const immediateRed   = c.immediateRedImpulse === true ? true : c.immediateRedImpulse === false ? false : null;
  const last3Down      = c.last3TicksDirection != null ? c.last3TicksDirection === 'DOWN' : null;
  const microLabel     = microLabelRaw ?? '';
  const microRed       = microLabelRaw != null
    ? (microLabel === 'MICRO_RED_IMPULSE' || microLabel === 'LONG_MICRO_RED_PRESSURE')
    : null;
  const rsiUp          = c.hasRsiRolloverUp === true ? true : c.hasRsiRolloverUp === false ? false : null;

  const cvdBull      = cvdLabelRaw != null ? (cvdLabelRaw === 'BULL' || cvdLabelRaw === 'BULLISH') : null;
  const cvdBear      = cvdLabelRaw != null ? (cvdLabelRaw === 'BEAR' || cvdLabelRaw === 'BEARISH') : null;
  const cvdImproving = c.cvdImproving === true ? true : c.cvdImproving === false ? false : null;

  const vwapCtxRaw        = c.longVwapContextLabel ?? c.vwapLongContextLabel ?? c.vwapContextLabel ?? null;
  const vwapCtx           = vwapCtxRaw ?? '';
  const vwapReclaim       = vwapCtxRaw != null ? (vwapCtx.includes('RECLAIM_CONFIRMED') || vwapCtx.includes('RECLAIM_ATTEMPT')) : null;
  const vwapSupportHold   = vwapCtxRaw != null ? (vwapCtx.includes('SUPPORT') || vwapCtx.includes('HOLD')) : null;
  const vwapReclaimFailed = vwapCtxRaw != null || c.vwapStateAtEntry != null
    ? (vwapCtx.includes('RECLAIM_FAIL') || c.vwapStateAtEntry === 'VWAP_RECLAIM_FAILED')
    : null;
  const overextended      = c.topGainerOverextensionDanger === true ? true : c.topGainerOverextensionDanger === false ? false : null;

  // Null-safe spread / ATR / liquidity
  const wideSpread     = spreadKnown ? c.spreadPct > 0.8 : null;
  const controlledAtr  = atrKnown    ? (c.atrPct > 0 && c.atrPct < 4) : null;
  const thinBook       = c.thinBookDanger === true ? true : c.thinBookDanger === false ? false : null;
  const thinBookKnown  = c.thinBookDanger === true || c.thinBookDanger === false;
  const strongLiquidity = (spreadKnown && thinBookKnown) ? (!thinBook && !wideSpread) : null;

  // cvdBearNoGreen: only meaningful when we know cvd label
  const cvdBearNoGreen = cvdBear != null ? (cvdBear && !greenConfirmation) : null;

  const marketCtxRaw     = c.longMarketContextLabel ?? c.btcLongContextLabel ?? null;
  const marketCtxLabel   = marketCtxRaw ?? '';
  const supportiveMarket = marketCtxRaw != null ? (marketCtxLabel.includes('UP') || marketCtxLabel.includes('TAILWIND')) : null;

  return {
    features: {
      [LONG_PF10_FEATURE.IMMEDIATE_GREEN_IMPULSE]:    immediateGreen,
      [LONG_PF10_FEATURE.GREEN_REACCELERATION]:       greenReaccel,
      [LONG_PF10_FEATURE.RSI_ROLLOVER_UP]:            rsiUp,
      [LONG_PF10_FEATURE.CVD_BULL]:                   cvdBull,
      [LONG_PF10_FEATURE.CVD_IMPROVING]:              cvdImproving,
      [LONG_PF10_FEATURE.VWAP_RECLAIM]:               vwapReclaim,
      [LONG_PF10_FEATURE.VWAP_SUPPORT_HOLD]:          vwapSupportHold,
      [LONG_PF10_FEATURE.STRONG_LIQUIDITY]:           strongLiquidity,
      [LONG_PF10_FEATURE.CONTROLLED_ATR]:             controlledAtr,
      [LONG_PF10_FEATURE.SUPPORTIVE_MARKET_CONTEXT]:  supportiveMarket,
      [LONG_PF10_FEATURE.IMMEDIATE_RED_IMPULSE]:      immediateRed,
      [LONG_PF10_FEATURE.MICRO_RED_PRESSURE]:         microRed,
      [LONG_PF10_FEATURE.LAST_3_TICKS_DOWN]:          last3Down,
      [LONG_PF10_FEATURE.CVD_BEAR_NO_GREEN]:          cvdBearNoGreen,
      [LONG_PF10_FEATURE.VWAP_RECLAIM_FAILED]:        vwapReclaimFailed,
      [LONG_PF10_FEATURE.OVEREXTENSION_NO_PULLBACK]:  overextended,
      [LONG_PF10_FEATURE.THIN_BOOK]:                  thinBook,
      [LONG_PF10_FEATURE.WIDE_SPREAD]:                wideSpread,
    },
    availableFeatures,
    missingFeatures,
    featureCoveragePct,
  };
}
