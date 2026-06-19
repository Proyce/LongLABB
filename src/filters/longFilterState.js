// ─── LONG FILTER STATE ────────────────────────────────────────────────────────
// Generic, versioned query model for the LongLAB filter subsystem.
// LOG_ONLY / RESEARCH_ONLY — state may never gate execution.

import {
  LONG_FILTER_STATE_SCHEMA_VERSION,
  LONG_SCOPE,
  PNL_METRIC,
  GROUP_OPERATOR,
  GROUP_JOIN,
} from "./longFilterConstants.js";

/**
 * Default state for the long filter subsystem.
 * All predicate groups are empty — no filters active on load.
 */
export const DEFAULT_LONG_FILTER_STATE = {
  schemaVersion: LONG_FILTER_STATE_SCHEMA_VERSION,
  scope: LONG_SCOPE.ALL_LONGS,
  tradeStatus: "CLOSED_ONLY",
  timingScope: "ENTRY_FINAL_ONLY",
  pnlMetric: PNL_METRIC.FEE_ADJUSTED_NORMALIZED,
  groupOperator: GROUP_OPERATOR.ALL_GROUPS,
  includeLegacyShortSemanticData: false,
  includePartialEntrySnapshots: false,
  includeUnknownValues: false,
  activeWinningSetupId: null,
  winningSetupsVersion: null,
  groups: [],
  outcomeFilters: [],
  sort: {
    key: "netAfterFeesTotal",
    direction: "desc",
  },
};

/**
 * Creates a new empty filter group with an AND join.
 */
export function makeFilterGroup(overrides = {}) {
  return {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    operator: GROUP_JOIN.ALL_OF,
    predicates: [],
    ...overrides,
  };
}

export { GROUP_OPERATOR, GROUP_JOIN };

/**
 * Creates a new predicate for a filter group.
 * @param {string} filterId - Registry filter ID
 * @param {string} operator - Operator from OPERATOR constants
 * @param {*} value - Value to compare (type depends on field)
 */
export function makePredicate(filterId, operator, value = undefined) {
  return { filterId, operator, value };
}

/**
 * Adds a predicate to a group within a state object.
 * Returns a new state — never mutates.
 */
export function addPredicateToGroup(state, groupId, predicate) {
  return {
    ...state,
    groups: state.groups.map(g =>
      g.id === groupId
        ? { ...g, predicates: [...g.predicates, predicate] }
        : g
    ),
  };
}

/**
 * Removes a predicate from a group.
 * Returns a new state — never mutates.
 */
export function removePredicateFromGroup(state, groupId, predicateIndex) {
  return {
    ...state,
    groups: state.groups.map(g =>
      g.id === groupId
        ? { ...g, predicates: g.predicates.filter((_, i) => i !== predicateIndex) }
        : g
    ),
  };
}

/**
 * Adds a new empty group to the state.
 */
export function addGroup(state, join = "AND") {
  const group = makeFilterGroup({ join });
  return { ...state, groups: [...state.groups, group] };
}

/**
 * Removes a group from the state.
 */
export function removeGroup(state, groupId) {
  return { ...state, groups: state.groups.filter(g => g.id !== groupId) };
}

/**
 * Updates the sort configuration.
 */
export function setSort(state, key, direction = "desc") {
  return { ...state, sort: { key, direction } };
}

/**
 * Updates the scope.
 */
export function setScope(state, scope) {
  return { ...state, scope };
}

/**
 * Updates the PnL metric.
 */
export function setPnlMetric(state, pnlMetric) {
  return { ...state, pnlMetric };
}

/**
 * Resets the state to default.
 */
export function resetFilterState() {
  return { ...DEFAULT_LONG_FILTER_STATE, groups: [], outcomeFilters: [] };
}

/**
 * Returns true if the state has any active predicates.
 */
export function hasActivePredicates(state) {
  return (
    state.groups.some(g => g.predicates.length > 0) ||
    state.outcomeFilters.length > 0
  );
}

/**
 * Returns the total number of active predicates across all groups.
 */
export function countActivePredicates(state) {
  return (
    state.groups.reduce((n, g) => n + g.predicates.length, 0) +
    state.outcomeFilters.length
  );
}

// ─── §17: COMPLETE GROUP OPERATIONS ───────────────────────────────────────────

/** Duplicates a group (new id), inserting the copy directly after the original. */
export function duplicateGroup(state, groupId) {
  const idx = state.groups.findIndex(g => g.id === groupId);
  if (idx === -1) return state;
  const original = state.groups[idx];
  const copy = {
    ...original,
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    predicates: original.predicates.map(p => ({ ...p })),
  };
  const groups = [...state.groups];
  groups.splice(idx + 1, 0, copy);
  return { ...state, groups };
}

/** Moves a group from one index to another. */
export function reorderGroups(state, fromIndex, toIndex) {
  if (fromIndex === toIndex) return state;
  const groups = [...state.groups];
  if (fromIndex < 0 || fromIndex >= groups.length) return state;
  const [moved] = groups.splice(fromIndex, 1);
  groups.splice(Math.max(0, Math.min(groups.length, toIndex)), 0, moved);
  return { ...state, groups };
}

/** Moves a predicate within a group from one index to another. */
export function reorderPredicate(state, groupId, fromIndex, toIndex) {
  return {
    ...state,
    groups: state.groups.map(g => {
      if (g.id !== groupId) return g;
      const predicates = [...g.predicates];
      if (fromIndex < 0 || fromIndex >= predicates.length) return g;
      const [moved] = predicates.splice(fromIndex, 1);
      predicates.splice(Math.max(0, Math.min(predicates.length, toIndex)), 0, moved);
      return { ...g, predicates };
    }),
  };
}

/** Sets a single group's predicate-join operator (ALL_OF / ANY_OF / NONE_OF). */
export function setGroupOperator(state, groupId, operator) {
  return {
    ...state,
    groups: state.groups.map(g => (g.id === groupId ? { ...g, operator } : g)),
  };
}

/** Sets the cross-group composition operator (ALL_GROUPS / ANY_GROUPS). */
export function setGroupComposition(state, groupOperator) {
  return { ...state, groupOperator };
}

// ─── §20: URL STATE + SAVED VIEWS ─────────────────────────────────────────────

export const RESEARCH_COCKPIT_STORAGE_KEY = "longlab.researchCockpit.v4";

/**
 * Serializes the research-relevant slice of filter state into a compact,
 * URL-safe string (base64-encoded JSON). Only the persisted keys from spec §20
 * are included.
 */
export function serializeFilterStateToURL(state, extra = {}) {
  const payload = {
    v: state.schemaVersion ?? LONG_FILTER_STATE_SCHEMA_VERSION,
    groupOperator: state.groupOperator ?? GROUP_OPERATOR.ALL_GROUPS,
    activeWinningSetupId: state.activeWinningSetupId ?? null,
    winningSetupsVersion: state.winningSetupsVersion ?? null,
    groups: (state.groups ?? []).map(g => ({
      id: g.id ?? null,
      label: g.label ?? null,
      setupId: g.setupId ?? null,
      source: g.source ?? null,
      operator: g.operator ?? GROUP_JOIN.ALL_OF,
      predicates: (g.predicates ?? []).map(p => ({
        filterId: p.filterId,
        operator: p.operator,
        value: p.value,
        source: p.source,
      })),
    })),
    outcomeFilters: (state.outcomeFilters ?? []).map(p => ({
      filterId: p.filterId,
      operator: p.operator,
      value: p.value,
      source: p.source,
      setupId: p.setupId ?? null,
    })),
    timingScope: state.timingScope ?? "ENTRY_FINAL_ONLY",
    scope: state.scope ?? LONG_SCOPE.ALL_LONGS,
    metric: state.pnlMetric ?? PNL_METRIC.FEE_ADJUSTED_NORMALIZED,
    sort: state.sort ?? null,
    ...extra,
  };
  const json = JSON.stringify(payload);
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(json)));
  return Buffer.from(json, "utf8").toString("base64");
}

/**
 * Deserializes URL state. Malformed input safely falls back to defaults
 * (returns DEFAULT_LONG_FILTER_STATE) rather than throwing (spec §20).
 */
export function deserializeFilterStateFromURL(encoded) {
  if (!encoded || typeof encoded !== "string") return { ...DEFAULT_LONG_FILTER_STATE };
  try {
    const json = typeof atob === "function"
      ? decodeURIComponent(escape(atob(encoded)))
      : Buffer.from(encoded, "base64").toString("utf8");
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.groups)) {
      return { ...DEFAULT_LONG_FILTER_STATE };
    }
    return {
      ...DEFAULT_LONG_FILTER_STATE,
      activeWinningSetupId: payload.activeWinningSetupId ?? null,
      winningSetupsVersion: payload.winningSetupsVersion ?? null,
      groupOperator: payload.groupOperator ?? DEFAULT_LONG_FILTER_STATE.groupOperator,
      scope: payload.scope ?? DEFAULT_LONG_FILTER_STATE.scope,
      timingScope: payload.timingScope ?? DEFAULT_LONG_FILTER_STATE.timingScope,
      pnlMetric: payload.metric ?? DEFAULT_LONG_FILTER_STATE.pnlMetric,
      sort: payload.sort ?? DEFAULT_LONG_FILTER_STATE.sort,
      groups: payload.groups.map(g => ({
        id: g.id ?? `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: g.label ?? null,
        setupId: g.setupId ?? null,
        source: g.source ?? null,
        operator: g.operator ?? GROUP_JOIN.ALL_OF,
        predicates: Array.isArray(g.predicates)
          ? g.predicates.map(p => ({ ...makePredicate(p.filterId, p.operator, p.value), source: p.source, setupId: p.setupId ?? null }))
          : [],
      })),
      outcomeFilters: Array.isArray(payload.outcomeFilters)
        ? payload.outcomeFilters.map(p => ({ ...makePredicate(p.filterId, p.operator, p.value), source: p.source, setupId: p.setupId ?? null }))
        : [],
    };
  } catch {
    return { ...DEFAULT_LONG_FILTER_STATE };
  }
}

/** Builds a named saved view from the current state. */
export function makeSavedView(name, state) {
  return {
    id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    encoded: serializeFilterStateToURL(state),
    createdAt: Date.now(),
  };
}

/** Restores a saved view's state. Malformed views fall back to defaults. */
export function restoreSavedView(view) {
  return deserializeFilterStateFromURL(view?.encoded);
}
