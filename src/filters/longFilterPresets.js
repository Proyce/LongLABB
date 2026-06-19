// ─── LONG FILTER PRESETS ──────────────────────────────────────────────────────
// Registry-backed query presets for the LongLAB Filters subsystem.
// Presets are shortcuts only — RESEARCH ONLY / DOES NOT AFFECT EXECUTION.

import { LONG_SCOPE, OPERATOR } from "./longFilterConstants.js";
import { makeFilterGroup, makePredicate, DEFAULT_LONG_FILTER_STATE } from "./longFilterState.js";

function makePreset(id, label, description, scope, groupDefs) {
  const groups = groupDefs.map(({ predicates }) => {
    const group = makeFilterGroup({ join: "AND" });
    group.predicates = predicates.map(p => makePredicate(p.filterId, p.operator, p.value));
    return group;
  });
  return {
    id,
    label,
    description,
    researchOnly: true,
    executionEffect: false,
    state: {
      ...DEFAULT_LONG_FILTER_STATE,
      scope,
      groups,
    },
  };
}

// ─── PRESET DEFINITIONS ───────────────────────────────────────────────────────

export const PRESET_UNIVERSAL_LONG_CORE = makePreset(
  "UNIVERSAL_LONG_CORE",
  "Gate + Universal Core",
  "Backward-compatible gate-qualified Universal Core: Long Gate pass + green confirmation + CVD not bear",
  LONG_SCOPE.ALL_LONGS,
  [{
    predicates: [
      { filterId: "LONG_GATE_PASS", operator: OPERATOR.IS_TRUE },
      { filterId: "HAS_GREEN_CONFIRMATION", operator: OPERATOR.IS_TRUE },
      { filterId: "HAS_RED_DANGER", operator: OPERATOR.IS_FALSE },
      { filterId: "CVD_LABEL", operator: OPERATOR.IN, value: ["BULL", "NEUT"] },
    ],
  }],
);

export const PRESET_TOP_LOSER_REVERSAL_CORE = makePreset(
  "TOP_LOSER_REVERSAL_CORE",
  "Top Loser Reversal Core",
  "Loser bucket + Long Gate + failed breakdown or lower wick + green + CVD OK",
  LONG_SCOPE.TOP_LOSER_LONGS,
  [{
    predicates: [
      { filterId: "LONG_GATE_PASS", operator: OPERATOR.IS_TRUE },
      { filterId: "HAS_GREEN_CONFIRMATION", operator: OPERATOR.IS_TRUE },
      { filterId: "HAS_RED_DANGER", operator: OPERATOR.IS_FALSE },
      { filterId: "CVD_LABEL", operator: OPERATOR.IN, value: ["BULL", "NEUT"] },
    ],
  }],
);

export const PRESET_TOP_LOSER_REVERSAL_SNIPER = makePreset(
  "TOP_LOSER_REVERSAL_SNIPER",
  "Top Loser Reversal Sniper Research",
  "Loser bucket + high reversal score + high AES + high Best DNA + tight spread",
  LONG_SCOPE.TOP_LOSER_LONGS,
  [{
    predicates: [
      { filterId: "TOP_LOSER_REVERSAL_SCORE", operator: OPERATOR.GTE, value: 70 },
      { filterId: "LONG_AES_SCORE", operator: OPERATOR.GTE, value: 80 },
      { filterId: "BEST_DNA_LONG_SCORE", operator: OPERATOR.GTE, value: 85 },
      { filterId: "ATR_PCT", operator: OPERATOR.GTE, value: 0.6 },
      { filterId: "SPREAD_PCT", operator: OPERATOR.LTE, value: 0.05 },
      { filterId: "LONG_COMBOS_ANTI_COUNT", operator: OPERATOR.EQ, value: 0 },
    ],
  }],
);

export const PRESET_TOP_GAINER_CONTINUATION_CORE = makePreset(
  "TOP_GAINER_CONTINUATION_CORE",
  "Research / Unstable · Top Gainer Continuation Core",
  "Gainer bucket + higher low or breakout retest + above/at VWAP + green + CVD OK",
  LONG_SCOPE.TOP_GAINER_LONGS,
  [{
    predicates: [
      { filterId: "LONG_GATE_PASS", operator: OPERATOR.IS_TRUE },
      { filterId: "HAS_GREEN_CONFIRMATION", operator: OPERATOR.IS_TRUE },
      { filterId: "HAS_RED_DANGER", operator: OPERATOR.IS_FALSE },
      { filterId: "CVD_LABEL", operator: OPERATOR.IN, value: ["BULL", "NEUT"] },
      { filterId: "PRICE_VS_VWAP_LABEL", operator: OPERATOR.IN, value: ["ABOVE_VWAP", "AT_VWAP"] },
    ],
  }],
);

export const PRESET_TOP_GAINER_CONTINUATION_SNIPER = makePreset(
  "TOP_GAINER_CONTINUATION_SNIPER",
  "Research / Unstable · Top Gainer Continuation Sniper",
  "Gainer + high continuation score + low blowoff risk + high AES + Best DNA",
  LONG_SCOPE.TOP_GAINER_LONGS,
  [{
    predicates: [
      { filterId: "TOP_GAINER_CONTINUATION_SCORE", operator: OPERATOR.GTE, value: 70 },
      { filterId: "TOP_GAINER_BLOWOFF_RISK_SCORE", operator: OPERATOR.LTE, value: 20 },
      { filterId: "LONG_AES_SCORE", operator: OPERATOR.GTE, value: 80 },
      { filterId: "BEST_DNA_LONG_SCORE", operator: OPERATOR.GTE, value: 85 },
      { filterId: "SPREAD_PCT", operator: OPERATOR.LTE, value: 0.05 },
      { filterId: "LONG_COMBOS_ANTI_COUNT", operator: OPERATOR.EQ, value: 0 },
    ],
  }],
);

export const PRESET_FALLING_KNIFE_FORENSICS = makePreset(
  "FALLING_KNIFE_FORENSICS",
  "Falling Knife Forensics",
  "Top Loser entries that matched the falling knife anti-combo",
  LONG_SCOPE.TOP_LOSER_LONGS,
  [{
    predicates: [
      { filterId: "LONG_COMBOS_ANTI_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_FALLING_KNIFE_ANTI_V1"] },
    ],
  }],
);

export const PRESET_BLOWOFF_DANGER_FORENSICS = makePreset(
  "BLOWOFF_DANGER_FORENSICS",
  "Blowoff Danger Forensics",
  "Top Gainer entries with high blowoff risk",
  LONG_SCOPE.TOP_GAINER_LONGS,
  [{
    predicates: [
      { filterId: "TOP_GAINER_BLOWOFF_RISK_SCORE", operator: OPERATOR.GTE, value: 30 },
    ],
  }],
);


export const PRESET_UNIVERSAL_CORE_FORMAL = makePreset(
  "UNIVERSAL_CORE_FORMAL",
  "Universal Core (Formal V1)",
  "Exact formal combo: green impulse + CVD BULL/NEUT + no immediate red impulse.",
  LONG_SCOPE.ALL_LONGS,
  [{ predicates: [
    { filterId: "LONG_COMBOS_POSITIVE_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_UNIVERSAL_CORE_V1"] },
  ] }],
);

export const PRESET_UNIVERSAL_CORE_MICRO_UP = makePreset(
  "UNIVERSAL_CORE_MICRO_UP",
  "Universal Core + Micro Up",
  "Formal Universal Core plus narrow upward microstructure confirmation.",
  LONG_SCOPE.ALL_LONGS,
  [{ predicates: [
    { filterId: "LONG_COMBOS_POSITIVE_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_UNIVERSAL_CORE_MICRO_UP_V1"] },
  ] }],
);

export const PRESET_GATE_STRONG_MICRO_UP_CLEAN = makePreset(
  "GATE_STRONG_MICRO_UP_CLEAN",
  "Gate >= Strong + Micro Up + Clean",
  "Gate PREMIUM/STRONG with narrow micro-up and zero Long anti-combos.",
  LONG_SCOPE.ALL_LONGS,
  [{ predicates: [
    { filterId: "LONG_COMBOS_POSITIVE_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_GATE_STRONG_MICRO_UP_CLEAN_V1"] },
  ] }],
);

export const PRESET_GATE_90_RSI_MACD = makePreset(
  "GATE_90_RSI_MACD",
  "Gate 90 + RSI + MACD Expansion",
  "Strict Gate quality with RSI momentum expansion and bullish MACD expansion.",
  LONG_SCOPE.ALL_LONGS,
  [{ predicates: [
    { filterId: "LONG_COMBOS_POSITIVE_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_GATE_RSI_MACD_EXPANSION_V1"] },
  ] }],
);

export const PRESET_PREMIUM_PF10_RUNNER = makePreset(
  "PREMIUM_PF10_RUNNER",
  "Premium + PF10 Elite + Runner Elite",
  "Agreement stack across Long Gate, Post-Fee-10 entry quality and entry-safe Runner quality.",
  LONG_SCOPE.ALL_LONGS,
  [{ predicates: [
    { filterId: "LONG_COMBOS_POSITIVE_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_PREMIUM_PF10_RUNNER_V1"] },
  ] }],
);

export const PRESET_BULL_CONFIRMED_VWAP_RECLAIM = makePreset(
  "BULL_CONFIRMED_VWAP_RECLAIM",
  "Bull-Confirmed VWAP Reclaim",
  "Below-VWAP reclaim attempt with bullish microstructure and non-bearish CVD.",
  LONG_SCOPE.ALL_LONGS,
  [{ predicates: [
    { filterId: "LONG_COMBOS_POSITIVE_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1"] },
  ] }],
);

export const PRESET_GAINER_GREEN_REACCELERATION = makePreset(
  "GAINER_GREEN_REACCELERATION",
  "Top Gainer Green Reacceleration",
  "Confirmed gainer reacceleration rather than generic continuation chasing.",
  LONG_SCOPE.TOP_GAINER_LONGS,
  [{ predicates: [
    { filterId: "LONG_COMBOS_POSITIVE_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_GAINER_GREEN_REACCELERATION_V1"] },
  ] }],
);

export const PRESET_LOSER_SCALP_REVERSAL = makePreset(
  "LOSER_SCALP_REVERSAL",
  "Top Loser Scalp Reversal",
  "Confirmed loser-side reversal lane with Long-native evidence.",
  LONG_SCOPE.TOP_LOSER_LONGS,
  [{ predicates: [
    { filterId: "TOP_LOSER_THESIS_LANE", operator: OPERATOR.IN, value: ["TOP_LOSER_SCALP_REVERSAL_CANDIDATE"] },
  ] }],
);

export const PRESET_RED_CVD_BEAR_FORENSICS = makePreset(
  "RED_CVD_BEAR_FORENSICS",
  "Red + CVD Bear Forensics",
  "Toxic-control cohort matching the red-pressure and bearish-CVD anti-combo.",
  LONG_SCOPE.ALL_LONGS,
  [{ predicates: [
    { filterId: "LONG_COMBOS_ANTI_MATCHED", operator: OPERATOR.INCLUDES_ANY, value: ["LONG_RED_CVD_BEAR_ANTI_V1"] },
  ] }],
);

// ─── REGISTRY ─────────────────────────────────────────────────────────────────

export const LONG_FILTER_PRESETS = [
  PRESET_UNIVERSAL_CORE_FORMAL,
  PRESET_UNIVERSAL_CORE_MICRO_UP,
  PRESET_GATE_STRONG_MICRO_UP_CLEAN,
  PRESET_GATE_90_RSI_MACD,
  PRESET_PREMIUM_PF10_RUNNER,
  PRESET_BULL_CONFIRMED_VWAP_RECLAIM,
  PRESET_GAINER_GREEN_REACCELERATION,
  PRESET_LOSER_SCALP_REVERSAL,
  PRESET_RED_CVD_BEAR_FORENSICS,
  PRESET_UNIVERSAL_LONG_CORE,
  PRESET_TOP_LOSER_REVERSAL_CORE,
  PRESET_TOP_LOSER_REVERSAL_SNIPER,
  PRESET_TOP_GAINER_CONTINUATION_CORE,
  PRESET_TOP_GAINER_CONTINUATION_SNIPER,
  PRESET_FALLING_KNIFE_FORENSICS,
  PRESET_BLOWOFF_DANGER_FORENSICS,
];

export function getPresetById(id) {
  return LONG_FILTER_PRESETS.find(p => p.id === id) ?? null;
}
