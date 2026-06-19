// ─── LONG FILTER COVERAGE ─────────────────────────────────────────────────────
// Computes per-FILTER coverage statistics across the trade corpus, keyed by
// filter.id (spec §16). Multiple filters may share a source field, so coverage
// is NOT keyed by field. Each entry carries a health verdict from the
// ACTIVE / DEGRADED / NO_DATA / NOT_IMPLEMENTED vocabulary.

import { LONG_FILTER_REGISTRY } from "./longFilterRegistry.js";
import { COVERAGE_STATUS, FILTER_HEALTH, LONG_SCOPE } from "./longFilterConstants.js";

function isUnknown(v) {
  return v === null || v === undefined || v === "UNKNOWN";
}

function isNotApplicable(filter, trade) {
  // A bucket-scoped filter does not apply to trades from the other bucket.
  if (filter.scope === LONG_SCOPE.TOP_LOSER_LONGS) {
    return trade.longParentBucket !== LONG_SCOPE.TOP_LOSER_LONGS;
  }
  if (filter.scope === LONG_SCOPE.TOP_GAINER_LONGS) {
    return trade.longParentBucket !== LONG_SCOPE.TOP_GAINER_LONGS;
  }
  return false;
}

function isImplemented(filter) {
  // A filter is "implemented" unless explicitly flagged otherwise.
  return filter.implemented !== false && filter.status !== "UNAVAILABLE";
}

function getCoverageHealth(implemented, coveragePct) {
  if (!implemented) return FILTER_HEALTH.NOT_IMPLEMENTED;
  if (coveragePct >= 90) return FILTER_HEALTH.ACTIVE;
  if (coveragePct > 0) return FILTER_HEALTH.DEGRADED;
  return FILTER_HEALTH.NO_DATA;
}

function sourceFieldsOf(filter) {
  if (Array.isArray(filter.sourceFields) && filter.sourceFields.length) return filter.sourceFields;
  return filter.field ? [filter.field] : [];
}

/**
 * Computes coverage statistics for every registered filter, keyed by filter.id.
 * @param {Object[]} trades - All available trade records
 * @returns {Object} coverageByFilterId — map of filter.id → coverage stats
 */
export function computeLongFilterCoverage(trades) {
  const list = Array.isArray(trades) ? trades : [];
  const coverageByFilterId = {};

  for (const filter of LONG_FILTER_REGISTRY) {
    const fields = sourceFieldsOf(filter);
    const implemented = isImplemented(filter);

    const applicable = list.filter(t => !isNotApplicable(filter, t));
    const notApplicableTrades = list.length - applicable.length;

    // A trade is "known" for this filter when every source field is known.
    const knownList = applicable.filter(t => fields.every(f => !isUnknown(t[f])));
    const totalTrades = applicable.length;
    const knownTrades = knownList.length;
    const unknownTrades = totalTrades - knownTrades;
    const coveragePct = totalTrades ? parseFloat((knownTrades / totalTrades * 100).toFixed(1)) : 0;
    const health = getCoverageHealth(implemented, coveragePct);

    // Distinct values across the primary field (UI display).
    const valueSet = new Set();
    for (const t of knownList) {
      const v = t[filter.field];
      if (Array.isArray(v)) v.forEach(i => valueSet.size < 50 && valueSet.add(String(i)));
      else if (valueSet.size < 50 && v != null) valueSet.add(String(v));
    }

    const timestamps = knownList
      .map(t => t.entryTimestamp ?? t.longFilterSnapshotComputedAt ?? null)
      .filter(Boolean)
      .sort((a, b) => a - b);

    coverageByFilterId[filter.id] = {
      // ── Canonical §16 shape ──────────────────────────────────────────────
      filterId: filter.id,
      sourceFields: fields,
      implemented,
      totalTrades,
      knownTrades,
      unknownTrades,
      notApplicableTrades,
      coveragePct,
      health,

      // ── Retained for existing UI consumers (back-compat) ─────────────────
      field: filter.field,
      filterLabel: filter.label,
      total: totalTrades,
      known: knownTrades,
      unknown: unknownTrades,
      knownPct: coveragePct,
      status: getCoverageStatus(coveragePct),
      distinctValues: Array.from(valueSet),
      firstObservedAt: timestamps[0] ?? null,
      lastObservedAt: timestamps[timestamps.length - 1] ?? null,
    };
  }

  return coverageByFilterId;
}

export function getCoverageStatus(knownPct) {
  if (knownPct >= 90) return COVERAGE_STATUS.READY;
  if (knownPct >= 50) return COVERAGE_STATUS.PARTIAL;
  if (knownPct >= 1) return COVERAGE_STATUS.LOW;
  return COVERAGE_STATUS.UNAVAILABLE;
}

/**
 * Returns a summary of coverage across all registered filters.
 * `byFilterId` is the canonical view; `byField` is retained as an alias for
 * existing UI consumers that iterate Object.values().
 */
export function buildCoverageSummary(coverage) {
  const all = Object.values(coverage);
  return {
    totalRegistered: all.length,
    // Health counts (canonical §16 vocabulary)
    active: all.filter(c => c.health === FILTER_HEALTH.ACTIVE).length,
    degraded: all.filter(c => c.health === FILTER_HEALTH.DEGRADED).length,
    noData: all.filter(c => c.health === FILTER_HEALTH.NO_DATA).length,
    notImplemented: all.filter(c => c.health === FILTER_HEALTH.NOT_IMPLEMENTED).length,
    // Legacy status counts
    ready: all.filter(c => c.status === COVERAGE_STATUS.READY).length,
    partial: all.filter(c => c.status === COVERAGE_STATUS.PARTIAL).length,
    low: all.filter(c => c.status === COVERAGE_STATUS.LOW).length,
    unavailable: all.filter(c => c.status === COVERAGE_STATUS.UNAVAILABLE).length,
    byFilterId: coverage,
    byField: coverage,
  };
}

/**
 * Returns which registered filter IDs should be disabled given current coverage.
 * Filters are disabled if their coverage status is LOW or UNAVAILABLE.
 */
export function getDisabledFilterIds(coverage, allowLowCoverage = false) {
  return Object.values(coverage)
    .filter(c => {
      if (c.status === COVERAGE_STATUS.UNAVAILABLE) return true;
      if (!allowLowCoverage && c.status === COVERAGE_STATUS.LOW) return true;
      return false;
    })
    .map(c => c.filterId);
}
