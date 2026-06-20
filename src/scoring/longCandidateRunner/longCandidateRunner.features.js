import { LONG_RUNNER_FEATURE } from './longCandidateRunner.constants.js';
import { normalizeLongMicroMomentumLabel, CANONICAL_LONG_MICRO } from '../longMicroMomentumNormalizer.js';

// Required inputs that must be present for a meaningful score.
const REQUIRED_INPUT_KEYS = [
  'longMicroMomentumLabel',
  'hasGreenConfirmation',
  'entryCvdLabel',
  'spreadPct',
  'atrPct',
  'longAuditDangerTier',
];

export function extractLongRunnerFeatures(candidate) {
  const c = candidate ?? {};

  // ── Track required-input coverage ─────────────────────────────────────────
  const microLabelRaw  = c.longMicroMomentumLabel ?? c.microMomentumLabel ?? null;
  const cvdLabelRaw    = c.entryCvdLabel ?? c.cvdLabel ?? null;
  const spreadKnown    = Number.isFinite(c.spreadPct);
  const atrKnown       = Number.isFinite(c.atrPct);
  const greenConfirmKnown = c.hasGreenConfirmation === true || c.hasGreenConfirmation === false;
  const auditTierKnown = c.longAuditDangerTier != null;

  const requiredKnownFlags = [
    microLabelRaw != null,
    greenConfirmKnown,
    cvdLabelRaw != null,
    spreadKnown,
    atrKnown,
    auditTierKnown,
  ];

  const knownCount        = requiredKnownFlags.filter(Boolean).length;
  const featureCoveragePct = (knownCount / REQUIRED_INPUT_KEYS.length) * 100;
  const availableFeatures  = REQUIRED_INPUT_KEYS.filter((_, i) => requiredKnownFlags[i]);
  const missingFeatures    = REQUIRED_INPUT_KEYS.filter((_, i) => !requiredKnownFlags[i]);

  // ── Derive feature flags — null means unknown, not false ──────────────────
  // Use shared normalizer so all historical alias mapping lives in one place.
  const { canonical: microCanonical } = normalizeLongMicroMomentumLabel(microLabelRaw);
  const microMultiConfirm = microLabelRaw != null
    ? microCanonical === CANONICAL_LONG_MICRO.GREEN_MULTI_CONFIRM
    : null;
  const microRed = microLabelRaw != null
    ? microCanonical === CANONICAL_LONG_MICRO.RED_PRESSURE
    : null;

  const immediateGreen = c.immediateGreenImpulse === true;
  const immediateRed   = c.immediateRedImpulse === true;
  const last3Down      = c.last3TicksDirection === 'DOWN';

  const cvdBull      = cvdLabelRaw != null ? (cvdLabelRaw === 'BULL' || cvdLabelRaw === 'BULLISH') : null;
  const cvdBear      = cvdLabelRaw != null ? (cvdLabelRaw === 'BEAR' || cvdLabelRaw === 'BEARISH') : null;
  const cvdImproving = c.cvdImproving === true;

  const rsiDelta = c.rsi1mDelta ?? null;
  const rsiUp    = c.hasRsiRolloverUp === true || (rsiDelta != null && rsiDelta > 2);

  const macdState  = c.macdHistogramState1m ?? c.macdHistogramState3m ?? '';
  const macdBullExp = macdState.includes('POSITIVE_EXPANDING');

  const vwapCtx           = c.longVwapContextLabel ?? c.vwapLongContextLabel ?? c.vwapContextLabel ?? '';
  const vwapSupport       = vwapCtx.includes('SUPPORT') || vwapCtx.includes('ABOVE_VWAP');
  const vwapReclaim       = vwapCtx.includes('RECLAIM_CONFIRMED') || vwapCtx.includes('RECLAIM_ATTEMPT');
  const vwapReclaimFailed = vwapCtx.includes('RECLAIM_FAIL') || c.vwapStateAtEntry === 'VWAP_RECLAIM_FAILED';

  const overextended = c.topGainerOverextensionDanger === true;

  // Null-safe spread / ATR / liquidity — missing ≠ tight/healthy/strong
  const tightSpread    = spreadKnown ? c.spreadPct < 0.2 : null;
  const wideSpread     = spreadKnown ? c.spreadPct > 0.8 : null;
  const healthyAtr     = atrKnown    ? (c.atrPct >= 0.5 && c.atrPct <= 3.5) : null;
  const thinBook       = c.thinBookDanger === true;
  const thinBookKnown  = c.thinBookDanger === true || c.thinBookDanger === false;
  const strongLiquidity = (spreadKnown && thinBookKnown) ? (!thinBook && !wideSpread) : null;

  const mcLabel          = c.longMarketContextLabel ?? c.btcLongContextLabel ?? '';
  const supportiveMarket = mcLabel.includes('UP') || mcLabel.includes('TAILWIND') || mcLabel.includes('STRONG');
  const hostileMarket    = mcLabel.includes('DOWN') || mcLabel.includes('HEADWIND') || mcLabel.includes('HOSTILE');

  return {
    features: {
      [LONG_RUNNER_FEATURE.MICRO_GREEN_MULTI_CONFIRM]:  microMultiConfirm,
      [LONG_RUNNER_FEATURE.IMMEDIATE_GREEN_IMPULSE]:    immediateGreen,
      [LONG_RUNNER_FEATURE.CVD_BULL]:                   cvdBull,
      [LONG_RUNNER_FEATURE.CVD_IMPROVING]:              cvdImproving,
      [LONG_RUNNER_FEATURE.RSI_UPWARD_EXPANSION]:       rsiUp,
      [LONG_RUNNER_FEATURE.MACD_BULLISH_EXPANSION]:     macdBullExp,
      [LONG_RUNNER_FEATURE.VWAP_SUPPORT]:               vwapSupport,
      [LONG_RUNNER_FEATURE.VWAP_RECLAIM]:               vwapReclaim,
      [LONG_RUNNER_FEATURE.TIGHT_SPREAD]:               tightSpread,
      [LONG_RUNNER_FEATURE.HEALTHY_ATR]:                healthyAtr,
      [LONG_RUNNER_FEATURE.STRONG_LIQUIDITY]:           strongLiquidity,
      [LONG_RUNNER_FEATURE.SUPPORTIVE_MARKET_CONTEXT]:  supportiveMarket,
      [LONG_RUNNER_FEATURE.MICRO_RED_PRESSURE]:         microRed,
      [LONG_RUNNER_FEATURE.IMMEDIATE_RED_IMPULSE]:      immediateRed,
      [LONG_RUNNER_FEATURE.CVD_BEAR]:                   cvdBear,
      [LONG_RUNNER_FEATURE.LAST_3_TICKS_DOWN]:          last3Down,
      [LONG_RUNNER_FEATURE.VWAP_RECLAIM_FAILED]:        vwapReclaimFailed,
      [LONG_RUNNER_FEATURE.OVEREXTENSION_NO_RESET]:     overextended,
      [LONG_RUNNER_FEATURE.THIN_BOOK]:                  thinBook,
      [LONG_RUNNER_FEATURE.WIDE_SPREAD]:                wideSpread,
      [LONG_RUNNER_FEATURE.HOSTILE_MARKET_CONTEXT]:     hostileMarket,
    },
    availableFeatures,
    missingFeatures,
    featureCoveragePct,
  };
}
