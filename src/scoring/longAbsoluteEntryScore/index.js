// ─── LONG AES V1 PUBLIC API ────────────────────────────────────────────────────

export {
  computeLongAbsoluteEntryScoreV1,
  flattenLongAesV1,
  LONG_AES_V1_CSV_HEADERS,
  longAesV1CSVRow,
} from "./longAbsoluteEntryScore.scorer.js";

export {
  buildLongAesPreviewSnapshot,
  normalizeLongAesFeatures,
} from "./longAbsoluteEntryScore.features.js";

export {
  DEFAULT_LONG_AES_CONFIG,
  LONG_AES_VERSION,
  mergeLongAesConfig,
} from "./longAbsoluteEntryScore.config.js";

export {
  classifyLongAesTier,
  classifyLongAesEligibility,
  classifyLongAesConfidenceLabel,
  computeLongAesConfidenceScore,
} from "./longAbsoluteEntryScore.labels.js";
