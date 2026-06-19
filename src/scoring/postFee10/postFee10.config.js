export const POST_FEE_10_SCORE_VERSION = "post-fee-10-detector-v1";

export const DEFAULT_POST_FEE_10_CONFIG = {
  enabled: true,
  logOnly: true,

  candidateThreshold: 75,
  sniperThreshold: 85,
  godTierThreshold: 92,

  minimumAtrBroad: 0.2,
  minimumAtrSniper: 0.6,
  maximumCleanSpreadPct: 0.05,

  requireNoImmediateGreenForSniper: true,
  requireCvdNotBullForSniper: true,
  requireFreshRedForSniper: true,

  enableLiveConfirmation: true,
  enableUiColumns: true,
  enablePostRunRanking: true,
};

export function mergePostFee10Config(config = {}) {
  return {
    ...DEFAULT_POST_FEE_10_CONFIG,
    ...(config ?? {}),
    logOnly: config?.logOnly ?? DEFAULT_POST_FEE_10_CONFIG.logOnly,
  };
}

