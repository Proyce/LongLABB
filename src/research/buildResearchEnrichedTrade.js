// ─── SHARED PRODUCTION FUNCTION ───────────────────────────────────────────────
// Single entry point used by both app paths (addSample, startBucketSet) and tests.
// Returns a fully enriched trade object with all canonical research fields.
// Spread order: raw telemetry preserved, canonical flattened overrides aliases.

import { buildLongEntryResearchSnapshot } from './buildLongEntryResearchSnapshot.js';

export function buildResearchEnrichedTrade({
  baseTrade,
  entryTelemetry,
  marketRegime,
  marketContext,
  sessionContext,
  computedAt = Date.now(),
} = {}) {
  const result = buildLongEntryResearchSnapshot({
    baseTrade,
    entryTelemetry,
    marketRegime,
    marketContext,
    sessionContext,
    computedAt,
  });

  return {
    ...baseTrade,
    ...entryTelemetry,
    ...result.flattened,
    entryResearchSnapshot: result.snapshot,
  };
}
