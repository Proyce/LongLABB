// ─── LONG FILTER ENGINE ───────────────────────────────────────────────────────
// Evaluates a LongLAB filter state against a set of trades.
// LOG_ONLY / RESEARCH_ONLY — never mutates trades, never blocks execution.
// Four-state verdicts: MATCH | NO_MATCH | UNKNOWN | NOT_APPLICABLE

import { getFilterById, LONG_FILTER_REGISTRY } from "./longFilterRegistry.js";
import {
  LONG_SCOPE,
  FIELD_TYPE,
  OPERATOR,
  FILTER_TIMING,
  LONG_FILTER_REGISTRY_VERSION,
  PNL_METRIC,
  DEFAULT_PNL_METRIC,
  GROUP_OPERATOR,
} from "./longFilterConstants.js";
import { isLegacyShortSemantic } from "./longFilterSnapshot.js";
import { getGrossMarginPnlPct, getNetMarginPnlPct } from "../fees/feeSelectors.js";

// ─── VERDICT CONSTANTS ────────────────────────────────────────────────────────

export const FILTER_VERDICT = Object.freeze({
  MATCH:          'MATCH',
  NO_MATCH:       'NO_MATCH',
  UNKNOWN:        'UNKNOWN',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

// ─── PNL RESOLUTION ───────────────────────────────────────────────────────────
// Each metric reads ONE explicit field with matching units. Normalized metrics
// NEVER substitute a margin value when the normalized field is absent — they are
// marked unavailable so the trade falls into a separate legacy cohort rather
// than silently mixing leveraged and de-leveraged values (review P0 blocker 2).

function strictField(trade, field) {
  const v = trade?.[field];
  if (typeof v === "number" && Number.isFinite(v)) {
    return { pnlValue: v, pnlMetricAvailable: true, pnlMetricFallbackUsed: false };
  }
  return { pnlValue: null, pnlMetricAvailable: false, pnlMetricFallbackUsed: false };
}

export function getLongFilterOutcomePnl(trade, metric = DEFAULT_PNL_METRIC) {
  switch (metric) {
    // ── Canonical explicit metrics ──────────────────────────────────────────
    case PNL_METRIC.FEE_ADJUSTED_NORMALIZED:
      return strictField(trade, "feeAdjustedNormPnlPct");

    case PNL_METRIC.RAW_NORMALIZED:
      return strictField(trade, "rawNormPnlPct");

    case PNL_METRIC.FEE_ADJUSTED_MARGIN:
      return strictField(trade, "feeAdjustedMarginPnlPct");

    case PNL_METRIC.RAW_MARGIN:
      return strictField(trade, "rawMarginPnlPct");

    // ── Legacy aliases (margin semantics) ───────────────────────────────────
    case PNL_METRIC.GROSS_MARGIN: {
      const value = getGrossMarginPnlPct(trade);
      return { pnlValue: value, pnlMetricAvailable: typeof value === "number" && Number.isFinite(value), pnlMetricFallbackUsed: false };
    }

    case PNL_METRIC.NET_AFTER_FEES:
      return strictField(trade, "feeAdjustedMarginPnlPct");

    case PNL_METRIC.NET_AFTER_ALL_COSTS:
      return strictField(trade, "netAfterAllCostsMarginPnlPct");

    default:
      return { pnlValue: null, pnlMetricAvailable: false, pnlMetricFallbackUsed: false };
  }
}

// ─── UNKNOWN HANDLING ─────────────────────────────────────────────────────────

function isDataUnknown(value) {
  return (
    value === null ||
    value === undefined ||
    value === 'UNKNOWN' ||
    value === 'INSUFFICIENT_DATA' ||
    value === 'INSUFFICIENT'
  );
}

function isDataKnown(value) {
  return !isDataUnknown(value);
}

// ─── PREDICATE EVALUATION (FOUR-STATE) ───────────────────────────────────────

/**
 * Evaluates a single predicate against a trade.
 * Returns { verdict, reason, missingInputs, sourceTiming }.
 */
export function evaluatePredicate(trade, predicate, registryFilter) {
  const { operator, value } = predicate;
  const fieldValue = trade[registryFilter.field];
  const fieldType  = registryFilter.fieldType;

  // Missing data → UNKNOWN (never false)
  if (operator !== OPERATOR.IS_KNOWN && operator !== OPERATOR.IS_UNKNOWN) {
    if (isDataUnknown(fieldValue)) {
      return {
        verdict:      FILTER_VERDICT.UNKNOWN,
        reason:       `${registryFilter.field}_MISSING`,
        missingInputs: [registryFilter.field],
        sourceTiming:  registryFilter.timing ?? null,
      };
    }
  }

  // IS_KNOWN / IS_UNKNOWN work regardless of type
  if (operator === OPERATOR.IS_KNOWN) {
    return {
      verdict:      isDataKnown(fieldValue) ? FILTER_VERDICT.MATCH : FILTER_VERDICT.NO_MATCH,
      reason:       isDataKnown(fieldValue) ? 'FIELD_KNOWN' : 'FIELD_UNKNOWN',
      missingInputs: [],
      sourceTiming:  registryFilter.timing ?? null,
    };
  }
  if (operator === OPERATOR.IS_UNKNOWN) {
    return {
      verdict:      isDataUnknown(fieldValue) ? FILTER_VERDICT.MATCH : FILTER_VERDICT.NO_MATCH,
      reason:       isDataUnknown(fieldValue) ? 'FIELD_IS_UNKNOWN' : 'FIELD_IS_KNOWN',
      missingInputs: [],
      sourceTiming:  registryFilter.timing ?? null,
    };
  }

  let matched = false;

  if (fieldType === FIELD_TYPE.BOOLEAN) {
    if (operator === OPERATOR.IS_TRUE)  matched = fieldValue === true;
    else if (operator === OPERATOR.IS_FALSE) matched = fieldValue === false;
  } else if (fieldType === FIELD_TYPE.NUMERIC) {
    const n = Number(fieldValue);
    if      (operator === OPERATOR.GTE) matched = n >= Number(value);
    else if (operator === OPERATOR.LTE) matched = n <= Number(value);
    else if (operator === OPERATOR.EQ)  matched = n === Number(value);
    else if (operator === OPERATOR.BETWEEN) {
      const [lo, hi] = Array.isArray(value) ? value : [value, value];
      matched = n >= Number(lo) && n <= Number(hi);
    }
  } else if (fieldType === FIELD_TYPE.ENUM) {
    const arr = Array.isArray(value) ? value : [value];
    if      (operator === OPERATOR.IN)     matched = arr.includes(fieldValue);
    else if (operator === OPERATOR.NOT_IN) matched = !arr.includes(fieldValue);
  } else if (fieldType === FIELD_TYPE.ARRAY) {
    const arr = Array.isArray(fieldValue) ? fieldValue : null;
    if      (operator === OPERATOR.IS_EMPTY)     matched = arr != null && arr.length === 0;
    else if (operator === OPERATOR.IS_NOT_EMPTY) matched = arr != null && arr.length > 0;
    else if (arr !== null) {
      const needles = Array.isArray(value) ? value : [value];
      if      (operator === OPERATOR.INCLUDES_ANY)  matched = needles.some(n => arr.includes(n));
      else if (operator === OPERATOR.INCLUDES_ALL)  matched = needles.every(n => arr.includes(n));
      else if (operator === OPERATOR.INCLUDES_NONE) matched = !needles.some(n => arr.includes(n));
    }
  } else if (fieldType === FIELD_TYPE.STRING) {
    if      (operator === OPERATOR.EQ) matched = fieldValue === value;
    else if (operator === OPERATOR.IN) matched = Array.isArray(value) && value.includes(fieldValue);
  }

  return {
    verdict:      matched ? FILTER_VERDICT.MATCH : FILTER_VERDICT.NO_MATCH,
    reason:       matched ? `${registryFilter.field}_MATCHED` : `${registryFilter.field}_NO_MATCH`,
    missingInputs: [],
    sourceTiming:  registryFilter.timing ?? null,
  };
}

function isTimingAllowed(timingScope, filterTiming) {
  const scope = timingScope ?? 'ENTRY_FINAL_ONLY';
  if (scope === 'ALL_TIMINGS') return true;
  if (scope === 'ENTRY_FINAL_ONLY') return filterTiming === FILTER_TIMING.ENTRY_FINAL;
  if (scope === 'POST_ENTRY_LIVE_ONLY') return filterTiming === FILTER_TIMING.POST_ENTRY_LIVE;
  if (scope === 'OUTCOME_ONLY') {
    return filterTiming === FILTER_TIMING.EXIT_FINAL || filterTiming === FILTER_TIMING.OUTCOME_ONLY;
  }
  return false;
}

// ─── GROUP EVALUATION ─────────────────────────────────────────────────────────

/**
 * Evaluates a group of predicates with an operator (ALL_OF / ANY_OF / NONE_OF).
 * Returns { groupVerdict, predicateResults }.
 */
function evaluateGroup(trade, group, registryMap, errors, timingScope) {
  const operator = group.operator ?? 'ALL_OF';
  if (!group.predicates?.length) {
    return { groupVerdict: FILTER_VERDICT.MATCH, predicateResults: [] };
  }

  const predicateResults = group.predicates.map(predicate => {
    const registryFilter = registryMap.get(predicate.filterId);
    if (!registryFilter) {
      errors.push(`Unknown filter ID: ${predicate.filterId}`);
      return {
        filterId:     predicate.filterId,
        label:        predicate.filterId,
        sourceField:  null,
        verdict:      FILTER_VERDICT.UNKNOWN,
        reason:       'FILTER_NOT_IN_REGISTRY',
        missingInputs: [predicate.filterId],
        sourceTiming: null,
      };
    }

    if (!isTimingAllowed(timingScope, registryFilter.timing)) {
      return {
        filterId: predicate.filterId,
        label: registryFilter.label ?? predicate.filterId,
        sourceField: registryFilter.field,
        verdict: FILTER_VERDICT.NOT_APPLICABLE,
        reason: `TIMING_${registryFilter.timing}_NOT_ALLOWED_IN_${timingScope ?? 'ENTRY_FINAL_ONLY'}`,
        missingInputs: [],
        sourceTiming: registryFilter.timing ?? null,
      };
    }

    const validOperators = registryFilter.operators;
    if (!validOperators.includes(predicate.operator)) {
      errors.push(`Operator ${predicate.operator} is not valid for filter ${predicate.filterId}`);
      return {
        filterId:    predicate.filterId,
        label:       registryFilter.label ?? predicate.filterId,
        sourceField: registryFilter.field,
        verdict:     FILTER_VERDICT.UNKNOWN,
        reason:      'INVALID_OPERATOR',
        missingInputs: [],
        sourceTiming: registryFilter.timing ?? null,
      };
    }

    const { verdict, reason, missingInputs, sourceTiming } =
      evaluatePredicate(trade, predicate, registryFilter);

    return {
      filterId:    predicate.filterId,
      label:       registryFilter.label ?? predicate.filterId,
      sourceField: registryFilter.field,
      verdict,
      reason,
      missingInputs,
      sourceTiming,
    };
  });

  // Apply group operator
  const applicable = predicateResults.filter(r => r.verdict !== FILTER_VERDICT.NOT_APPLICABLE);
  const matches  = applicable.filter(r => r.verdict === FILTER_VERDICT.MATCH);
  const unknowns = applicable.filter(r => r.verdict === FILTER_VERDICT.UNKNOWN);
  const noMatch  = applicable.filter(r => r.verdict === FILTER_VERDICT.NO_MATCH);

  let groupVerdict;
  if (applicable.length === 0) {
    groupVerdict = FILTER_VERDICT.NOT_APPLICABLE;
  } else if (operator === 'ALL_OF') {
    if (noMatch.length > 0)          groupVerdict = FILTER_VERDICT.NO_MATCH;
    else if (unknowns.length > 0)    groupVerdict = FILTER_VERDICT.UNKNOWN;
    else                             groupVerdict = FILTER_VERDICT.MATCH;
  } else if (operator === 'ANY_OF') {
    if (matches.length > 0)          groupVerdict = FILTER_VERDICT.MATCH;
    else if (unknowns.length > 0)    groupVerdict = FILTER_VERDICT.UNKNOWN;
    else                             groupVerdict = FILTER_VERDICT.NO_MATCH;
  } else if (operator === 'NONE_OF') {
    if (matches.length > 0)          groupVerdict = FILTER_VERDICT.NO_MATCH;
    else if (unknowns.length > 0)    groupVerdict = FILTER_VERDICT.UNKNOWN;
    else                             groupVerdict = FILTER_VERDICT.MATCH;
  } else {
    groupVerdict = noMatch.length > 0 ? FILTER_VERDICT.NO_MATCH
      : unknowns.length > 0 ? FILTER_VERDICT.UNKNOWN
      : FILTER_VERDICT.MATCH;
  }

  return { groupVerdict, predicateResults };
}

// ─── SCOPE FILTERING ──────────────────────────────────────────────────────────

function matchesScope(trade, scope) {
  if (scope === LONG_SCOPE.ALL_LONGS) return true;
  return trade.longParentBucket === scope;
}

// ─── TRADE DEDUPLICATION ──────────────────────────────────────────────────────

function deduplicateTrades(trades) {
  const seen = new Map();
  for (const t of trades) {
    const key = t.id ?? (t.symbol + '_' + t.entryTimestamp);
    if (!seen.has(key)) {
      seen.set(key, t);
    } else {
      // Keep the record with a filter snapshot (more complete)
      const existing = seen.get(key);
      if (t.longFilterSnapshotVersion && !existing.longFilterSnapshotVersion) {
        seen.set(key, t);
      }
    }
  }
  return Array.from(seen.values());
}

// ─── MAIN ENGINE ──────────────────────────────────────────────────────────────

/**
 * Applies a LongLAB filter state to a set of trades.
 * Returns filtered trades plus four-state diagnostics keyed by trade ID.
 * Never mutates the input trades array.
 *
 * @param {Object[]} trades - Array of finalized trade records
 * @param {Object}   state  - DEFAULT_LONG_FILTER_STATE compatible object
 * @param {Object[]} [registry] - LONG_FILTER_REGISTRY override (for testing)
 * @returns {{
 *   trades, inputCount, outputCount, excludedByScope, excludedByPredicate,
 *   filterResultsByTradeId, matchedCountsByFilterId, noMatchCountsByFilterId,
 *   unknownCountsByFilterId, notApplicableCountsByFilterId,
 *   unknownFieldCounts, disabledPredicates, registryVersion, errors
 * }}
 */
export function applyLongFilterState(trades, state, registry = LONG_FILTER_REGISTRY) {
  if (!trades || !state) {
    return {
      trades:                     trades ?? [],
      inputCount:                 0,
      outputCount:                0,
      excludedByScope:            0,
      excludedByPredicate:        0,
      filterResultsByTradeId:     {},
      matchedCountsByFilterId:    {},
      noMatchCountsByFilterId:    {},
      unknownCountsByFilterId:    {},
      notApplicableCountsByFilterId: {},
      unknownFieldCounts:         {},
      disabledPredicates:         [],
      registryVersion:            LONG_FILTER_REGISTRY_VERSION,
      errors:                     ['Missing trades or state'],
    };
  }

  const registryMap = new Map(registry.map(f => [f.id, f]));
  const errors             = [];
  const disabledPredicates = [];
  const unknownFieldCounts = {};

  // Per-filter counters
  const matchedCountsByFilterId       = {};
  const noMatchCountsByFilterId       = {};
  const unknownCountsByFilterId       = {};
  const notApplicableCountsByFilterId = {};
  const filterResultsByTradeId        = {};

  // 1. Deduplicate by trade ID
  const deduped    = deduplicateTrades(trades);
  const inputCount = deduped.length;

  // 2. Exclude legacy short-semantic records
  let working = deduped;
  if (!state.includeLegacyShortSemanticData) {
    working = working.filter(t => !isLegacyShortSemantic(t));
  }

  // 3. Filter by trade status
  if (state.tradeStatus === 'CLOSED_ONLY') {
    working = working.filter(t => {
      const finalized = t.isFinalOutcome === true || t.closed === true;
      const { pnlMetricAvailable } = getLongFilterOutcomePnl(t, state.pnlMetric ?? DEFAULT_PNL_METRIC);
      return finalized && pnlMetricAvailable;
    });
  }

  // 4. Apply scope
  const afterScope      = working.filter(t => matchesScope(t, state.scope ?? LONG_SCOPE.ALL_LONGS));
  const excludedByScope = working.length - afterScope.length;

  // 5. Collect unknown field counts for diagnostics
  for (const f of registry) {
    const unknownCount = afterScope.filter(t => isDataUnknown(t[f.field])).length;
    if (unknownCount > 0) unknownFieldCounts[f.field] = unknownCount;
  }

  // 6. Evaluate entry predicate groups and track per-trade results
  const allGroups = state.groups ?? [];
  let afterPredicates = [];

  for (const trade of afterScope) {
    const tradeId      = trade.id ?? trade.symbol + '_' + trade.entryTime;
    const groupResults = [];
    let tradeMatches   = true;

    if (allGroups.length > 0) {
      tradeMatches = false;
      for (const group of allGroups) {
        const { groupVerdict, predicateResults } = evaluateGroup(trade, group, registryMap, errors, state.timingScope);
        groupResults.push({ operator: group.operator ?? 'ALL_OF', verdict: groupVerdict, predicateResults });

        // Track per-filter counts
        for (const pr of predicateResults) {
          if (pr.verdict === FILTER_VERDICT.MATCH)          (matchedCountsByFilterId[pr.filterId] ??= 0) + 1 && (matchedCountsByFilterId[pr.filterId]++);
          else if (pr.verdict === FILTER_VERDICT.NO_MATCH)  (noMatchCountsByFilterId[pr.filterId] ??= 0) + 1 && (noMatchCountsByFilterId[pr.filterId]++);
          else if (pr.verdict === FILTER_VERDICT.UNKNOWN)   (unknownCountsByFilterId[pr.filterId] ??= 0) + 1 && (unknownCountsByFilterId[pr.filterId]++);
          else if (pr.verdict === FILTER_VERDICT.NOT_APPLICABLE) (notApplicableCountsByFilterId[pr.filterId] ??= 0) + 1 && (notApplicableCountsByFilterId[pr.filterId]++);
        }
      }

      // Cross-group composition: ALL_GROUPS (AND) or ANY_GROUPS (OR)
      const applicableGroups = groupResults.filter(g => g.verdict !== FILTER_VERDICT.NOT_APPLICABLE);
      if (applicableGroups.length === 0) {
        tradeMatches = false;
      } else if ((state.groupOperator ?? GROUP_OPERATOR.ALL_GROUPS) === GROUP_OPERATOR.ANY_GROUPS) {
        tradeMatches = applicableGroups.some(g => g.verdict === FILTER_VERDICT.MATCH);
      } else {
        const anyNoMatch = applicableGroups.some(g => g.verdict === FILTER_VERDICT.NO_MATCH);
        const anyUnknown = applicableGroups.some(g => g.verdict === FILTER_VERDICT.UNKNOWN);
        tradeMatches = !anyNoMatch && !anyUnknown;
      }
    }

    filterResultsByTradeId[tradeId] = groupResults;

    if (tradeMatches) {
      afterPredicates.push(trade);
    }
  }

  const excludedByPredicate = afterScope.length - afterPredicates.length;

  // 7. Apply outcome filters (separate pass, same four-state logic)
  let afterOutcome   = afterPredicates;
  const outcomeFilters = state.outcomeFilters ?? [];

  for (const predicate of outcomeFilters) {
    const registryFilter = registryMap.get(predicate.filterId);
    if (!registryFilter) {
      errors.push(`Unknown outcome filter ID: ${predicate.filterId}`);
      continue;
    }
    if (registryFilter.timing === FILTER_TIMING.ENTRY_FINAL) {
      errors.push(`Filter ${predicate.filterId} is an entry filter and must not be placed in outcomeFilters`);
      continue;
    }
    afterOutcome = afterOutcome.filter(t => {
      const result = evaluatePredicate(t, predicate, registryFilter);
      return result.verdict === FILTER_VERDICT.MATCH;
    });
  }

  return {
    trades:                     afterOutcome,
    inputCount,
    outputCount:                afterOutcome.length,
    excludedByScope,
    excludedByPredicate,
    filterResultsByTradeId,
    matchedCountsByFilterId,
    noMatchCountsByFilterId,
    unknownCountsByFilterId,
    notApplicableCountsByFilterId,
    unknownFieldCounts,
    disabledPredicates,
    registryVersion:            LONG_FILTER_REGISTRY_VERSION,
    errors,
  };
}
