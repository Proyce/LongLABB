// ─── BATCH RESEARCH TRADE ADAPTER ────────────────────────────────────────────
// Production adapter used by the batch entry path (startBucketSet). It delegates
// to the canonical builder and adds NO research fields afterward. The only
// non-research fields appended are execution-safety booleans, which carry no
// research signal. Both adapters must produce identical canonical research
// output for identical input (spec §23). Do not import scorer functions here.

import { buildResearchEnrichedTrade } from './buildResearchEnrichedTrade.js';

export function buildBatchResearchTrade({
  baseTrade,
  entryTelemetry,
  marketContext,
  marketRegime,
  sessionContext,
  computedAt = Date.now(),
} = {}) {
  const enrichedTrade = buildResearchEnrichedTrade({
    baseTrade,
    entryTelemetry,
    marketContext,
    marketRegime,
    sessionContext,
    computedAt,
  });

  // Execution-safety flags only — NOT research fields.
  return {
    ...enrichedTrade,
    runnerCaptureEntrySafe:             false,
    postFee10LiveConfirmationEntrySafe: false,
  };
}
