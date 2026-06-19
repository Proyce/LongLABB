// ─── AES V3 PUBLIC API ────────────────────────────────────────────────────────

export {
  computeAbsoluteEntryScoreV3,
  flattenAbsoluteEntryScoreV3,
  ABSOLUTE_ENTRY_SCORE_V3_CSV_HEADERS,
  absoluteEntryScoreV3CSVRow,
} from "./absoluteEntryScore.scorer.js";

export {
  buildAbsoluteEntryPreviewSnapshot,
  normalizeAesFeatures,
} from "./absoluteEntryScore.features.js";

export {
  DEFAULT_AES_CONFIG,
  ABSOLUTE_ENTRY_SCORE_VERSION,
  mergeAesConfig,
} from "./absoluteEntryScore.config.js";

export {
  classifyAesTier,
  classifyAesEligibility,
  classifyAesConfidenceLabel,
  computeAesConfidenceScore,
} from "./absoluteEntryScore.labels.js";

export { buildAbsoluteEntryScoreV3Analytics } from "./absoluteEntryScore.analytics.js";

// Legacy V2 available for side-by-side comparison
export {
  computeAbsoluteEntryScore as calculateLegacyAbsoluteEntryScoreV2,
  classifyAbsoluteEntryTier as classifyLegacyAbsoluteEntryTierV2,
} from "./absoluteEntryScore.legacy-v2.js";
