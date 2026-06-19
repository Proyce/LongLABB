// ─── CURATED LONG WINNING SETUPS ─────────────────────────────────────────────
// Manually reviewed, versioned research hypotheses. Unlike Highlights, these
// are stable definitions backed by the canonical registry and filter engine.
// RESEARCH ONLY: these definitions must never affect execution.

import { OPERATOR, LONG_SCOPE } from "./longFilterConstants.js";
import { GROUP_JOIN, makeFilterGroup, makePredicate } from "./longFilterState.js";

export const LONG_WINNING_SETUPS_VERSION = "LONG_WINNING_SETUPS_V1";
export const WINNING_VIEW_GROUP_ID = "winning-view";
export const WINNING_VIEW_OUTCOME_SOURCE = "winning-view";

export const WINNING_SETUP_FAMILY = Object.freeze({
  PRIORITY_GATE: "PRIORITY_GATE",
  UNIVERSAL: "UNIVERSAL",
  TOP_GAINER: "TOP_GAINER",
  TOP_LOSER: "TOP_LOSER",
  TOXIC_CONTROL: "TOXIC_CONTROL",
  EXIT_DIAGNOSTIC: "EXIT_DIAGNOSTIC",
});

export const WINNING_SETUP_STATUS = Object.freeze({
  PRODUCTION_CANDIDATE: "PRODUCTION_CANDIDATE",
  CROSS_BATCH_VALIDATED: "CROSS_BATCH_VALIDATED",
  SHADOW_CANDIDATE: "SHADOW_CANDIDATE",
  DIAGNOSTIC: "DIAGNOSTIC",
  BROKEN: "BROKEN",
});

const p = (filterId, operator, value) => ({ filterId, operator, value });
const evidence = (n, avg, win, note = "June 16 full-telemetry research universe") => ({ n, avg, win, note });

export const LONG_WINNING_SETUPS = Object.freeze([
  // ── Priority gates ─────────────────────────────────────────────────────────
  {
    id: "GATE_ELITE_95", title: "Gate Score 95+", shortTitle: "Gate 95+",
    family: WINNING_SETUP_FAMILY.PRIORITY_GATE, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.PRODUCTION_CANDIDATE,
    description: "Strictest Long Gate research band. Highest broad expectancy in the June 16 score ladder.",
    predicates: [p("LONG_GATE_SCORE", OPERATOR.GTE, 95)], outcomePredicates: [],
    referenceEvidence: evidence(293, 0.6606, 60.1, "Broad rich + compact validation; 8/8 sessions positive"),
  },
  {
    id: "GATE_PREMIUM_90", title: "Gate Score 90+", shortTitle: "Gate 90+",
    family: WINNING_SETUP_FAMILY.PRIORITY_GATE, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.PRODUCTION_CANDIDATE,
    description: "High-quality Long Gate threshold with positive performance across all observed sessions.",
    predicates: [p("LONG_GATE_SCORE", OPERATOR.GTE, 90)], outcomePredicates: [],
    referenceEvidence: evidence(365, 0.5290, 57.5, "Broad rich + compact validation; 8/8 sessions positive"),
  },
  {
    id: "GATE_TIER_PREMIUM", title: "Gate Tier PREMIUM", shortTitle: "Gate Premium",
    family: WINNING_SETUP_FAMILY.PRIORITY_GATE, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.PRODUCTION_CANDIDATE,
    description: "Canonical PREMIUM Long Gate tier.",
    predicates: [p("LONG_GATE_TIER", OPERATOR.IN, ["PREMIUM"])], outcomePredicates: [],
    referenceEvidence: evidence(492, 0.3816, 55.1, "Full-telemetry universe"),
  },
  {
    id: "GATE_TIER_GE_STRONG", title: "Gate Tier PREMIUM or STRONG", shortTitle: "Gate ≥ Strong",
    family: WINNING_SETUP_FAMILY.PRIORITY_GATE, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.PRODUCTION_CANDIDATE,
    description: "The cleanest single-condition whole-book flip in the June 16 full-telemetry universe.",
    predicates: [p("LONG_GATE_TIER", OPERATOR.IN, ["PREMIUM", "STRONG"])], outcomePredicates: [],
    referenceEvidence: evidence(938, 0.2581, 50.9, "+242.07 total; nearly identical across all three windows"),
  },

  // ── Universal winners ──────────────────────────────────────────────────────
  {
    id: "UNIVERSAL_CORE_FORMAL_V1", title: "Universal Core (Formal V1)", shortTitle: "Universal Core",
    family: WINNING_SETUP_FAMILY.UNIVERSAL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Formal registry combo: green impulse, CVD BULL/NEUT, and no immediate red impulse.",
    predicates: [p("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_UNIVERSAL_CORE_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(665, 0.2236, 51.0),
  },
  {
    id: "UNIVERSAL_CORE_MICRO_UP", title: "Universal Core + Micro Up", shortTitle: "Core + Micro Up",
    family: WINNING_SETUP_FAMILY.UNIVERSAL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Formal Universal Core plus narrow upward microstructure confirmation.",
    predicates: [p("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_UNIVERSAL_CORE_MICRO_UP_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(314, 0.4787, 58.3, "Positive in all three full-telemetry windows"),
  },
  {
    id: "GATE_STRONG_MICRO_UP_CLEAN", title: "Gate ≥ Strong + Micro Up + No Anti", shortTitle: "Strong + Micro + Clean",
    family: WINNING_SETUP_FAMILY.UNIVERSAL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Gate quality plus narrow micro-up confirmation, excluding all Long anti-combos.",
    predicates: [p("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_GATE_STRONG_MICRO_UP_CLEAN_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(583, 0.4159, 55.6, "Retained nearly all Gate ≥ Strong total profit with fewer trades"),
  },
  {
    id: "PREMIUM_PF10_RUNNER", title: "Premium + PF10 Elite + Runner Elite", shortTitle: "Premium Triple",
    family: WINNING_SETUP_FAMILY.UNIVERSAL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Agreement stack across Gate, Post-Fee-10 entry quality, and entry-safe Runner quality.",
    predicates: [p("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_PREMIUM_PF10_RUNNER_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(399, 0.4297, 57.4),
  },
  {
    id: "GATE_90_RSI_MACD", title: "Gate 90 + RSI + MACD Expansion", shortTitle: "Gate 90 + RSI + MACD",
    family: WINNING_SETUP_FAMILY.UNIVERSAL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Strict Gate quality with simultaneous RSI momentum expansion and bullish MACD expansion.",
    predicates: [p("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_GATE_RSI_MACD_EXPANSION_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(114, 1.1477, 71.1, "PF 9.17; positive in all four rich sessions"),
  },
  {
    id: "BULL_CONFIRMED_VWAP_RECLAIM", title: "Bull-Confirmed VWAP Reclaim", shortTitle: "Bull VWAP Reclaim",
    family: WINNING_SETUP_FAMILY.UNIVERSAL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.SHADOW_CANDIDATE,
    description: "Below-VWAP reclaim attempt with fresh bullish microstructure and non-bearish CVD.",
    predicates: [p("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_BULL_CONFIRMED_VWAP_RECLAIM_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(69, 0.9649, 65.2, "Small but positive in all rich sessions"),
  },
  {
    id: "LAST3_UP_RSI_EXPANSION", title: "Last 3 Ticks UP + RSI Expansion", shortTitle: "Last3 UP + RSI",
    family: WINNING_SETUP_FAMILY.UNIVERSAL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Direct upward ticks plus short-term RSI momentum expansion.",
    predicates: [
      p("LAST_3_TICKS_DIRECTION", OPERATOR.IN, ["UP"]),
      p("RSI_LONG_MOMENTUM_EXPANSION", OPERATOR.IS_TRUE),
    ], outcomePredicates: [],
    referenceEvidence: evidence(250, 0.7172, 62.4),
  },
  {
    id: "NO_ANTI_COMBOS", title: "No Long Anti-Combos", shortTitle: "No Anti",
    family: WINNING_SETUP_FAMILY.UNIVERSAL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.DIAGNOSTIC,
    description: "Exclude trades matching any registered Long anti-combo.",
    predicates: [p("LONG_COMBOS_ANTI_COUNT", OPERATOR.EQ, 0)], outcomePredicates: [],
    referenceEvidence: { note: "Safety refinement; evaluate with a positive entry gate" },
  },

  // ── Top Gainer winners ─────────────────────────────────────────────────────
  {
    id: "GAINER_GREEN_REACCELERATION", title: "Top Gainer Green Reacceleration", shortTitle: "Gainer Reacceleration",
    family: WINNING_SETUP_FAMILY.TOP_GAINER, scope: LONG_SCOPE.TOP_GAINER_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Top-gainer continuation only after genuine green reacceleration, not blind chasing.",
    predicates: [p("LONG_COMBOS_POSITIVE_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_GAINER_GREEN_REACCELERATION_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(85, 0.4294, 55.3, "Rich telemetry; positive all four sessions"),
  },
  {
    id: "GAINER_GATE90_LAST3_RSI", title: "Gainer Gate 90 + Last3 UP + RSI Expansion", shortTitle: "Gainer Gate90 + Up + RSI",
    family: WINNING_SETUP_FAMILY.TOP_GAINER, scope: LONG_SCOPE.TOP_GAINER_LONGS,
    status: WINNING_SETUP_STATUS.SHADOW_CANDIDATE,
    description: "Strict gainer quality plus direct upward ticks and RSI acceleration.",
    predicates: [
      p("LONG_GATE_SCORE", OPERATOR.GTE, 90),
      p("LAST_3_TICKS_DIRECTION", OPERATOR.IN, ["UP"]),
      p("RSI_LONG_MOMENTUM_EXPANSION", OPERATOR.IS_TRUE),
    ], outcomePredicates: [],
    referenceEvidence: evidence(53, 1.2479, 71.7),
  },
  {
    id: "GAINER_GATE90_MACD_CVD_BULL", title: "Gainer Gate 90 + MACD + CVD BULL", shortTitle: "Gainer Gate90 + MACD + CVD",
    family: WINNING_SETUP_FAMILY.TOP_GAINER, scope: LONG_SCOPE.TOP_GAINER_LONGS,
    status: WINNING_SETUP_STATUS.SHADOW_CANDIDATE,
    description: "Strict gainer quality with expanding MACD and bullish order flow.",
    predicates: [
      p("LONG_GATE_SCORE", OPERATOR.GTE, 90),
      p("MACD_BULLISH_EXPANSION", OPERATOR.IS_TRUE),
      p("CVD_LABEL", OPERATOR.IN, ["BULL"]),
    ], outcomePredicates: [],
    referenceEvidence: evidence(52, 1.2213, 71.2),
  },

  // ── Top Loser winners ──────────────────────────────────────────────────────
  {
    id: "LOSER_SCALP_REVERSAL_CANDIDATE", title: "Top Loser Scalp Reversal Candidate", shortTitle: "Loser Scalp Reversal",
    family: WINNING_SETUP_FAMILY.TOP_LOSER, scope: LONG_SCOPE.TOP_LOSER_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Confirmed loser-side reversal lane. Never interpret as blind dip buying.",
    predicates: [p("TOP_LOSER_THESIS_LANE", OPERATOR.IN, ["TOP_LOSER_SCALP_REVERSAL_CANDIDATE"])], outcomePredicates: [],
    referenceEvidence: evidence(245, 0.2005, 51.8),
  },
  {
    id: "LOSER_GATE90_MACD_CVD_NOT_BEAR", title: "Loser Gate 90 + MACD + CVD Not Bear", shortTitle: "Loser Gate90 + MACD",
    family: WINNING_SETUP_FAMILY.TOP_LOSER, scope: LONG_SCOPE.TOP_LOSER_LONGS,
    status: WINNING_SETUP_STATUS.SHADOW_CANDIDATE,
    description: "Strict loser reversal quality, bullish MACD expansion, and no bearish CVD.",
    predicates: [
      p("LONG_GATE_SCORE", OPERATOR.GTE, 90),
      p("MACD_BULLISH_EXPANSION", OPERATOR.IS_TRUE),
      p("CVD_LABEL", OPERATOR.NOT_IN, ["BEAR"]),
    ], outcomePredicates: [],
    referenceEvidence: evidence(72, 0.8145, 70.8),
  },
  {
    id: "LOSER_IMMEDIATE_GREEN_RSI", title: "Loser Immediate Green + RSI Expansion", shortTitle: "Loser Green + RSI",
    family: WINNING_SETUP_FAMILY.TOP_LOSER, scope: LONG_SCOPE.TOP_LOSER_LONGS,
    status: WINNING_SETUP_STATUS.SHADOW_CANDIDATE,
    description: "Loser-side reversal already showing immediate green pressure and RSI expansion.",
    predicates: [
      p("IMMEDIATE_GREEN_IMPULSE", OPERATOR.IS_TRUE),
      p("RSI_LONG_MOMENTUM_EXPANSION", OPERATOR.IS_TRUE),
    ], outcomePredicates: [],
    referenceEvidence: evidence(56, 0.7334, 64.3),
  },

  // ── Toxic controls ─────────────────────────────────────────────────────────
  {
    id: "RED_CVD_BEAR_ANTI", title: "Red + CVD Bear Anti-Combo", shortTitle: "Red + CVD Bear",
    family: WINNING_SETUP_FAMILY.TOXIC_CONTROL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.DIAGNOSTIC,
    description: "Long entry with red pressure and bearish CVD. A consistently toxic control cohort.",
    predicates: [p("LONG_COMBOS_ANTI_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_RED_CVD_BEAR_ANTI_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(155, -0.6289, 19.4),
  },
  {
    id: "FALLING_KNIFE_ANTI", title: "Falling Knife Anti-Combo", shortTitle: "Falling Knife",
    family: WINNING_SETUP_FAMILY.TOXIC_CONTROL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.DIAGNOSTIC,
    description: "Unconfirmed falling-knife Long entries.",
    predicates: [p("LONG_COMBOS_ANTI_MATCHED", OPERATOR.INCLUDES_ANY, ["LONG_FALLING_KNIFE_ANTI_V1"])], outcomePredicates: [],
    referenceEvidence: evidence(93, -0.5595, 21.5),
  },
  {
    id: "IMMEDIATE_RED_TOXIC", title: "Immediate Red Impulse", shortTitle: "Immediate Red",
    family: WINNING_SETUP_FAMILY.TOXIC_CONTROL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.DIAGNOSTIC,
    description: "Immediate red pressure at Long entry.",
    predicates: [p("IMMEDIATE_RED_IMPULSE", OPERATOR.IS_TRUE)], outcomePredicates: [],
    referenceEvidence: evidence(320, -0.5557, null, "Negative in every rich session"),
  },
  {
    id: "GATE_RESEARCH_REJECT", title: "Gate Research Reject", shortTitle: "Gate Reject",
    family: WINNING_SETUP_FAMILY.TOXIC_CONTROL, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.DIAGNOSTIC,
    description: "Canonical Long Gate research-reject cohort.",
    predicates: [p("LONG_GATE_TIER", OPERATOR.IN, ["RESEARCH_REJECT"])], outcomePredicates: [],
    referenceEvidence: evidence(1953, -0.3257, 29.2),
  },
  {
    id: "GAINER_OVEREXTENDED_NO_PULLBACK", title: "Gainer Overextended, No Pullback", shortTitle: "Gainer No Pullback",
    family: WINNING_SETUP_FAMILY.TOXIC_CONTROL, scope: LONG_SCOPE.TOP_GAINER_LONGS,
    status: WINNING_SETUP_STATUS.DIAGNOSTIC,
    description: "Top-gainer chase without a healthy pullback or renewed confirmation.",
    predicates: [p("TOP_GAINER_SUB_BUCKET", OPERATOR.IN, ["TOP_GAINER_OVEREXTENDED_NO_PULLBACK"])], outcomePredicates: [],
    referenceEvidence: evidence(190, -0.4134, null),
  },

  // ── Exit diagnostics ───────────────────────────────────────────────────────
  {
    id: "PROFIT_LOCK_ONLY", title: "Profit Lock Exits", shortTitle: "Profit Lock",
    family: WINNING_SETUP_FAMILY.EXIT_DIAGNOSTIC, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.BROKEN,
    description: "Inspect PROFIT_LOCK separately from TRAIL. Current cohort is strongly negative.",
    predicates: [], outcomePredicates: [p("CLOSE_REASON", OPERATOR.IN, ["PROFIT_LOCK"])],
    referenceEvidence: evidence(710, -0.2079, 19.3, "Full-telemetry universe; do not aggregate with TRAIL"),
  },
  {
    id: "PROFIT_LOCK_BELOW_FLOOR", title: "Profit Lock Below Floor", shortTitle: "Lock Below Floor",
    family: WINNING_SETUP_FAMILY.EXIT_DIAGNOSTIC, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.BROKEN,
    description: "Profit-lock exits explicitly diagnosed below the configured floor.",
    predicates: [], outcomePredicates: [p("PROFIT_LOCK_EXIT_BELOW_FLOOR", OPERATOR.IS_TRUE)],
    referenceEvidence: { note: "Execution defect cohort; current-corpus metrics are authoritative" },
  },
  {
    id: "TRAIL_ONLY", title: "Trailing Exits", shortTitle: "Trail",
    family: WINNING_SETUP_FAMILY.EXIT_DIAGNOSTIC, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.CROSS_BATCH_VALIDATED,
    description: "Inspect TRAIL independently from PROFIT_LOCK.",
    predicates: [], outcomePredicates: [p("CLOSE_REASON", OPERATOR.IN, ["TRAIL"])],
    referenceEvidence: evidence(53, 2.9785, 100, "Full-telemetry universe"),
  },
  {
    id: "TIMEOUT_ONLY", title: "Timeout Exits", shortTitle: "Timeout",
    family: WINNING_SETUP_FAMILY.EXIT_DIAGNOSTIC, scope: LONG_SCOPE.ALL_LONGS,
    status: WINNING_SETUP_STATUS.DIAGNOSTIC,
    description: "Inspect TIMEOUT separately as a descriptive exit cohort.",
    predicates: [], outcomePredicates: [p("CLOSE_REASON", OPERATOR.IN, ["TIMEOUT"])],
    referenceEvidence: { note: "Descriptive only; does not prove timeout causality" },
  },
].map(setup => Object.freeze({
  ...setup,
  version: LONG_WINNING_SETUPS_VERSION,
  researchOnly: true,
  executionEffect: "NONE",
  logOnly: true,
  canAffectExecution: false,
  executionApplied: false,
})));

export const LONG_WINNING_SETUP_BY_ID = new Map(LONG_WINNING_SETUPS.map(setup => [setup.id, setup]));

export const WINNING_QUICK_VIEW_IDS = Object.freeze([
  "GATE_ELITE_95",
  "GATE_PREMIUM_90",
  "GATE_TIER_PREMIUM",
  "GATE_TIER_GE_STRONG",
  "UNIVERSAL_CORE_FORMAL_V1",
  "UNIVERSAL_CORE_MICRO_UP",
  "PREMIUM_PF10_RUNNER",
  "GATE_90_RSI_MACD",
  "BULL_CONFIRMED_VWAP_RECLAIM",
  "GAINER_GREEN_REACCELERATION",
  "LOSER_SCALP_REVERSAL_CANDIDATE",
  "NO_ANTI_COMBOS",
]);

export function getLongWinningSetup(setupId) {
  return LONG_WINNING_SETUP_BY_ID.get(setupId) ?? null;
}

function setupGroup(setup, { id = WINNING_VIEW_GROUP_ID, source = WINNING_VIEW_OUTCOME_SOURCE } = {}) {
  const scopePredicate = setup?.scope && setup.scope !== LONG_SCOPE.ALL_LONGS
    ? [p("LONG_PARENT_BUCKET", OPERATOR.IN, [setup.scope])]
    : [];
  const predicates = [...scopePredicate, ...(setup?.predicates ?? [])];
  if (!predicates.length) return null;
  return makeFilterGroup({
    id,
    label: setup.title,
    setupId: setup.id,
    source,
    operator: GROUP_JOIN.ALL_OF,
    predicates: predicates.map(item => ({ ...makePredicate(item.filterId, item.operator, item.value), source })),
  });
}

export function createWinningSetupFilterState(setup, baseState = {}, options = {}) {
  const mode = options.mode ?? "replace";
  const source = options.source ?? (mode === "add" ? "winning-add" : WINNING_VIEW_OUTCOME_SOURCE);
  const existingGroups = baseState.groups ?? [];
  const existingOutcomes = baseState.outcomeFilters ?? [];
  const id = mode === "add" ? `winning-${setup.id}-${Date.now()}` : WINNING_VIEW_GROUP_ID;
  const group = setupGroup(setup, { id, source });
  const groupsWithoutView = existingGroups.filter(g => g.id !== WINNING_VIEW_GROUP_ID && g.source !== WINNING_VIEW_OUTCOME_SOURCE);
  const outcomesWithoutView = existingOutcomes.filter(item => item.source !== WINNING_VIEW_OUTCOME_SOURCE);

  return {
    ...baseState,
    scope: baseState.scope ?? LONG_SCOPE.ALL_LONGS,
    groups: mode === "add"
      ? [...existingGroups, ...(group ? [group] : [])]
      : [...groupsWithoutView, ...(group ? [group] : [])],
    outcomeFilters: mode === "add"
      ? [...existingOutcomes, ...(setup.outcomePredicates ?? []).map(item => ({ ...item, source, setupId: setup.id }))]
      : [...outcomesWithoutView, ...(setup.outcomePredicates ?? []).map(item => ({ ...item, source, setupId: setup.id }))],
    activeWinningSetupId: mode === "add" ? (baseState.activeWinningSetupId ?? null) : setup.id,
    winningSetupsVersion: LONG_WINNING_SETUPS_VERSION,
  };
}

export function getActiveWinningSetupId(state) {
  return state?.activeWinningSetupId
    ?? state?.groups?.find(g => g.id === WINNING_VIEW_GROUP_ID)?.setupId
    ?? state?.outcomeFilters?.find(item => item.source === WINNING_VIEW_OUTCOME_SOURCE)?.setupId
    ?? null;
}

export function clearWinningSetupFilterState(baseState = {}) {
  return {
    ...baseState,
    activeWinningSetupId: null,
    groups: (baseState.groups ?? []).filter(group =>
      group.id !== WINNING_VIEW_GROUP_ID && group.source !== WINNING_VIEW_OUTCOME_SOURCE
    ),
    outcomeFilters: (baseState.outcomeFilters ?? []).filter(item =>
      item.source !== WINNING_VIEW_OUTCOME_SOURCE
    ),
  };
}
