import { describe, expect, it } from "vitest";
import { applyLongFilterState } from "./longFilterEngine.js";
import {
  DEFAULT_LONG_FILTER_STATE,
  makeFilterGroup,
  makePredicate,
  serializeFilterStateToURL,
  deserializeFilterStateFromURL,
} from "./longFilterState.js";
import { LONG_FILTER_REGISTRY, getFilterById } from "./longFilterRegistry.js";
import { OPERATOR } from "./longFilterConstants.js";
import { PRESET_UNIVERSAL_LONG_CORE } from "./longFilterPresets.js";
import {
  LONG_WINNING_SETUPS,
  createWinningSetupFilterState,
  getLongWinningSetup,
  WINNING_VIEW_GROUP_ID,
  clearWinningSetupFilterState,
} from "./longWinningSetups.js";

const trade = (overrides = {}) => ({
  id: Math.random().toString(36),
  longParentBucket: "TOP_GAINER_LONGS",
  longGateScore: 96,
  longGateTier: "PREMIUM",
  longCombosPositiveMatched: ["LONG_UNIVERSAL_CORE_V1", "LONG_GAINER_GREEN_REACCELERATION_V1"],
  longCombosAntiMatched: [],
  longCombosAntiCount: 0,
  feeAdjustedNormPnlPct: 1,
  isFinalOutcome: true,
  closeReason: "TRAIL",
  ...overrides,
});

describe("curated Long winning setups", () => {
  it("contains only valid registry predicates and remains research-only", () => {
    expect(LONG_WINNING_SETUPS.length).toBeGreaterThanOrEqual(20);
    for (const setup of LONG_WINNING_SETUPS) {
      expect(setup.researchOnly).toBe(true);
      expect(setup.canAffectExecution).toBe(false);
      for (const predicate of [...setup.predicates, ...setup.outcomePredicates]) {
        expect(getFilterById(predicate.filterId), `${setup.id}/${predicate.filterId}`).toBeTruthy();
      }
    }
  });

  it("applies Universal Core through the canonical registry engine", () => {
    const setup = getLongWinningSetup("UNIVERSAL_CORE_FORMAL_V1");
    const state = createWinningSetupFilterState(setup, DEFAULT_LONG_FILTER_STATE);
    const result = applyLongFilterState([
      trade(),
      trade({ longCombosPositiveMatched: [] }),
    ], state, LONG_FILTER_REGISTRY);
    expect(result.outputCount).toBe(1);
  });

  it("replaces only the active curated view while retaining advanced groups", () => {
    const advanced = makeFilterGroup({
      id: "advanced-user-group",
      predicates: [makePredicate("ATR_PCT", OPERATOR.GTE, 0.6)],
    });
    const first = createWinningSetupFilterState(getLongWinningSetup("GATE_ELITE_95"), {
      ...DEFAULT_LONG_FILTER_STATE,
      groups: [advanced],
    });
    const second = createWinningSetupFilterState(getLongWinningSetup("UNIVERSAL_CORE_FORMAL_V1"), first);
    expect(second.groups.some(group => group.id === "advanced-user-group")).toBe(true);
    expect(second.groups.filter(group => group.id === WINNING_VIEW_GROUP_ID)).toHaveLength(1);
  });

  it("ADD appends a persistent setup group that a later VIEW does not erase", () => {
    const added = createWinningSetupFilterState(
      getLongWinningSetup("GATE_ELITE_95"),
      DEFAULT_LONG_FILTER_STATE,
      { mode: "add" },
    );
    const viewed = createWinningSetupFilterState(getLongWinningSetup("UNIVERSAL_CORE_FORMAL_V1"), added);
    expect(viewed.groups.some(group => group.source === "winning-add")).toBe(true);
    expect(viewed.groups.some(group => group.id === WINNING_VIEW_GROUP_ID)).toBe(true);
  });

  it("adds bucket scope as a predicate without overwriting the user's global scope", () => {
    const setup = getLongWinningSetup("GAINER_GREEN_REACCELERATION");
    const state = createWinningSetupFilterState(setup, { ...DEFAULT_LONG_FILTER_STATE, scope: "ALL_LONGS" });
    expect(state.scope).toBe("ALL_LONGS");
    expect(state.groups[0].predicates.some(predicate => predicate.filterId === "LONG_PARENT_BUCKET")).toBe(true);
  });
  it("round-trips the active Winning Setup and stable group identity through URL state", () => {
    const state = createWinningSetupFilterState(getLongWinningSetup("GATE_ELITE_95"), DEFAULT_LONG_FILTER_STATE);
    const restored = deserializeFilterStateFromURL(serializeFilterStateToURL(state));
    expect(restored.activeWinningSetupId).toBe("GATE_ELITE_95");
    expect(restored.groups.some(group => group.id === WINNING_VIEW_GROUP_ID)).toBe(true);
  });

  it("clears only the active winning-view group and preserves advanced/add groups", () => {
    const added = createWinningSetupFilterState(getLongWinningSetup("GATE_ELITE_95"), DEFAULT_LONG_FILTER_STATE, { mode: "add" });
    const viewed = createWinningSetupFilterState(getLongWinningSetup("UNIVERSAL_CORE_FORMAL_V1"), added);
    const cleared = clearWinningSetupFilterState(viewed);
    expect(cleared.activeWinningSetupId).toBeNull();
    expect(cleared.groups.some(group => group.id === WINNING_VIEW_GROUP_ID)).toBe(false);
    expect(cleared.groups.some(group => group.source === "winning-add")).toBe(true);
  });

  it("keeps outcome-only exit diagnostics separate from entry setups", () => {
    for (const setup of LONG_WINNING_SETUPS) {
      if (setup.family === "EXIT_DIAGNOSTIC") {
        expect(setup.predicates).toEqual([]);
        expect(setup.outcomePredicates.length).toBeGreaterThan(0);
      } else {
        expect(setup.outcomePredicates).toEqual([]);
        for (const predicate of setup.predicates) {
          expect(getFilterById(predicate.filterId).timing).not.toBe("OUTCOME_ONLY");
        }
      }
    }
  });

  it("keeps Profit Lock and Trail as distinct outcome views", () => {
    const lock = getLongWinningSetup("PROFIT_LOCK_ONLY");
    const trail = getLongWinningSetup("TRAIL_ONLY");
    expect(lock.outcomePredicates[0].value).toEqual(["PROFIT_LOCK"]);
    expect(trail.outcomePredicates[0].value).toEqual(["TRAIL"]);
    expect(lock.outcomePredicates[0]).not.toEqual(trail.outcomePredicates[0]);
  });

  it("distinguishes the formal Universal Core from the stricter Gate plus Core preset", () => {
    const formal = getLongWinningSetup("UNIVERSAL_CORE_FORMAL_V1");
    const gatedPredicates = PRESET_UNIVERSAL_LONG_CORE.state.groups.flatMap(group => group.predicates);
    expect(formal.predicates).toHaveLength(1);
    expect(gatedPredicates.length).toBeGreaterThan(formal.predicates.length);
    expect(gatedPredicates.some(predicate => predicate.filterId === "LONG_GATE_PASS")).toBe(true);
  });

});
