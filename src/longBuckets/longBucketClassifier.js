// ─── LONG BUCKET CLASSIFIER ──────────────────────────────────────────────────

import { classifyTopLoserLong }  from "./topLoserLongClassifier.js";
import { classifyTopGainerLong } from "./topGainerLongClassifier.js";

export function classifyLongBucket(sample) {
  if (sample.longParentBucket === "TOP_LOSER_LONGS") {
    return classifyTopLoserLong(sample);
  }

  if (sample.longParentBucket === "TOP_GAINER_LONGS") {
    return classifyTopGainerLong(sample);
  }

  return {
    longSubBucket:     "UNKNOWN_LONG_BUCKET",
    longSetupScore:    0,
    longSetupReasons:  [],
    longSetupWarnings: ["UNKNOWN_PARENT_BUCKET"],
  };
}
