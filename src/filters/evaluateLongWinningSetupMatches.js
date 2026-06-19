// ─── LONG WINNING SETUP MATCH AUDIT ──────────────────────────────────────────
// Evaluates curated ENTRY_FINAL setup definitions against one frozen candidate.
// Outcome-only setup definitions are intentionally excluded to prevent leakage.
// LOG ONLY / RESEARCH ONLY.

import {
  LONG_WINNING_SETUPS,
  LONG_WINNING_SETUPS_VERSION,
} from "./longWinningSetups.js";
import { getFilterById } from "./longFilterRegistry.js";
import { evaluatePredicate, FILTER_VERDICT } from "./longFilterEngine.js";

export function evaluateLongWinningSetupMatches(sample = {}) {
  const details = [];

  for (const setup of LONG_WINNING_SETUPS) {
    if ((setup.outcomePredicates ?? []).length > 0) continue;

    const scopeMatched = setup.scope === "ALL_LONGS" || sample.longParentBucket === setup.scope;
    const predicateResults = (setup.predicates ?? []).map(predicate => {
      const filter = getFilterById(predicate.filterId);
      if (!filter) {
        return { filterId: predicate.filterId, verdict: FILTER_VERDICT.UNKNOWN, reason: "FILTER_NOT_IN_REGISTRY" };
      }
      return {
        filterId: predicate.filterId,
        ...evaluatePredicate(sample, predicate, filter),
      };
    });
    const matched = scopeMatched && predicateResults.length > 0 && predicateResults.every(result => result.verdict === FILTER_VERDICT.MATCH);
    const unknown = predicateResults.some(result => result.verdict === FILTER_VERDICT.UNKNOWN);

    details.push({
      setupId: setup.id,
      matched,
      unknown,
      status: matched ? "MATCHED" : unknown ? "INCOMPLETE" : "NOT_MATCHED",
      scopeMatched,
      predicateResults,
      matchedClauses: predicateResults.filter(result => result.verdict === FILTER_VERDICT.MATCH),
      failedClauses: predicateResults.filter(result => result.verdict !== FILTER_VERDICT.MATCH && result.verdict !== FILTER_VERDICT.UNKNOWN),
      unavailableClauses: predicateResults.filter(result => result.verdict === FILTER_VERDICT.UNKNOWN),
      definitionVersion: setup.version ?? LONG_WINNING_SETUPS_VERSION,
      snapshotPhase: "ENTRY",
    });
  }

  const matchedIds = details.filter(detail => detail.matched).map(detail => detail.setupId);
  return Object.freeze({
    activeWinningSetupIds: matchedIds,
    longWinningSetupMatchedIds: matchedIds,
    longWinningSetupMatchDetails: details,
    longWinningSetupCatalogVersion: LONG_WINNING_SETUPS_VERSION,
    longWinningSetupsVersion: LONG_WINNING_SETUPS_VERSION,
    logOnly: true,
    canAffectExecution: false,
    executionApplied: false,
  });
}
