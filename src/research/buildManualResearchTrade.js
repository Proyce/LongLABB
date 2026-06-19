// ─── MANUAL RESEARCH TRADE ADAPTER ───────────────────────────────────────────
// Production adapter used by the manual entry path (addSample). It delegates to
// the canonical builder and adds NO research fields afterward. Both the manual
// and batch adapters must produce identical canonical research output for
// identical input (spec §23). Do not import scorer functions here.

import { buildResearchEnrichedTrade } from './buildResearchEnrichedTrade.js';

export function buildManualResearchTrade({
  baseTrade,
  entryTelemetry,
  marketContext,
  marketRegime,
  sessionContext,
  computedAt = Date.now(),
} = {}) {
  return buildResearchEnrichedTrade({
    baseTrade,
    entryTelemetry,
    marketContext,
    marketRegime,
    sessionContext,
    computedAt,
  });
}
