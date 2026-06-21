// ─── CANONICAL TRADE IDENTITY ────────────────────────────────────────────────
// Assigns a stable, order-independent trade ID so deduplication and analysis
// do not depend on input array position.
//
// Precedence for selecting the ID:
//   1. trade.canonicalTradeId  — persisted at creation time
//   2. trade.tradeId
//   3. trade.id
//   4. Deterministic legacy key from stable fields (marked LOW confidence)

export const CANONICAL_RESEARCH_EXCLUSION = Object.freeze({
  ACTIVE:                           'ACTIVE',
  FINALIZATION_INVALID:             'FINALIZATION_INVALID',
  FINALIZATION_FAILED:              'FINALIZATION_FAILED',
  ENTRY_PRICE_FALLBACK_USED_AS_FINAL: 'ENTRY_PRICE_FALLBACK_USED_AS_FINAL',
  AUTO_END_ENTRY_PRICE_FALLBACK:    'AUTO_END_ENTRY_PRICE_FALLBACK',
  STALE_FINAL_PRICE_UNRESOLVED:     'STALE_FINAL_PRICE_UNRESOLVED',
  PRICE_INTEGRITY_FAILED:           'PRICE_INTEGRITY_FAILED',
  FINAL_PNL_MISSING:                'FINAL_PNL_MISSING',
  DUPLICATE_SUPERSEDED:             'DUPLICATE_SUPERSEDED',
  MANUAL_EXCLUSION:                 'MANUAL_EXCLUSION',
  UNKNOWN:                          'UNKNOWN',
});

const CANONICAL_SNAPSHOT_PRECEDENCE_VERSION = 'CANONICAL_SNAPSHOT_PRECEDENCE_V1_2026_06';
const CANONICAL_EXPORT_SCHEMA_VERSION       = 'LONG_CANONICAL_EXPORT_V2_2026_06';

/**
 * Resolve the canonical trade ID for a single trade object.
 * Returns { canonicalTradeId, canonicalTradeIdSource, canonicalTradeIdentityConfidence }.
 */
export function resolveCanonicalTradeId(trade) {
  if (trade?.canonicalTradeId != null && String(trade.canonicalTradeId).trim() !== '') {
    return {
      canonicalTradeId:                 String(trade.canonicalTradeId),
      canonicalTradeIdSource:           'PERSISTED',
      canonicalTradeIdentityConfidence: 'HIGH',
    };
  }
  if (trade?.tradeId != null && String(trade.tradeId).trim() !== '') {
    return {
      canonicalTradeId:                 String(trade.tradeId),
      canonicalTradeIdSource:           'TRADE_ID',
      canonicalTradeIdentityConfidence: 'HIGH',
    };
  }
  if (trade?.id != null && String(trade.id).trim() !== '') {
    return {
      canonicalTradeId:                 String(trade.id),
      canonicalTradeIdSource:           'ID',
      canonicalTradeIdentityConfidence: 'MEDIUM',
    };
  }

  // Deterministic legacy key — never use array index.
  const symbol    = String(trade?.symbol ?? 'UNKNOWN');
  const entryTime = String(trade?.entryTime ?? 0);
  const entryPrice = String(trade?.entryPrice ?? '0');
  const legacyKey = `LEGACY:${symbol}:${entryTime}:${entryPrice}`;
  return {
    canonicalTradeId:                 legacyKey,
    canonicalTradeIdSource:           'LEGACY_COMPOSITE',
    canonicalTradeIdentityConfidence: 'LOW',
  };
}

/**
 * Versioned snapshot precedence comparator.
 * Returns a negative number if `left` is preferred over `right` (left wins).
 * The caller should keep the snapshot with the smallest comparator result.
 *
 * Priority tuple (spec §11.2):
 *   1. Same canonical trade ID (external check, not applied here)
 *   2. Finalized beats active
 *   3. Valid finalization beats invalid / fallback
 *   4. Greater lifecycleRevision wins
 *   5. Greater snapshotSequence wins
 *   6. Later closedAt wins (finalized)
 *   7. Later lastPriceUpdateAt wins
 *   8. Later exportedAt wins
 *   9. Deterministic hash tie-breaker
 */
export function compareCanonicalTradeSnapshots(left, right) {
  const fn = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  // 2. Finalized beats active
  const leftFinal  = left?.closed === true ? 1 : 0;
  const rightFinal = right?.closed === true ? 1 : 0;
  if (leftFinal !== rightFinal) return rightFinal - leftFinal; // higher = preferred

  // 3. Valid finalization beats invalid / fallback
  const leftValid  = left?.finalizationDataQuality === 'VALID' || left?.finalizationDataQuality === 'COMPLETE' ? 1 : 0;
  const rightValid = right?.finalizationDataQuality === 'VALID' || right?.finalizationDataQuality === 'COMPLETE' ? 1 : 0;
  if (leftValid !== rightValid) return rightValid - leftValid;

  // Reject frozen entry-price fallback in both
  const leftFallback  = left?.finalPriceIsEntryFallback === true ? 1 : 0;
  const rightFallback = right?.finalPriceIsEntryFallback === true ? 1 : 0;
  if (leftFallback !== rightFallback) return leftFallback - rightFallback; // lower = preferred

  // 4. Greater lifecycleRevision wins
  const leftRev  = fn(left?.lifecycleRevision)  ?? -1;
  const rightRev = fn(right?.lifecycleRevision) ?? -1;
  if (leftRev !== rightRev) return rightRev - leftRev;

  // 5. Greater snapshotSequence wins
  const leftSeq  = fn(left?.snapshotSequence)  ?? -1;
  const rightSeq = fn(right?.snapshotSequence) ?? -1;
  if (leftSeq !== rightSeq) return rightSeq - leftSeq;

  // 6. Later closedAt wins
  const leftClosed  = fn(left?.closedAt)  ?? 0;
  const rightClosed = fn(right?.closedAt) ?? 0;
  if (leftClosed !== rightClosed) return rightClosed - leftClosed;

  // 7. Later lastPriceUpdateAt
  const leftUpdate  = fn(left?.lastPriceUpdateAt)  ?? 0;
  const rightUpdate = fn(right?.lastPriceUpdateAt) ?? 0;
  if (leftUpdate !== rightUpdate) return rightUpdate - leftUpdate;

  // 8. Later exportedAt
  const leftExported  = fn(left?.exportedAt)  ?? 0;
  const rightExported = fn(right?.exportedAt) ?? 0;
  if (leftExported !== rightExported) return rightExported - leftExported;

  // 9. Deterministic tie-breaker: content-aware DJB2-32 hash
  const leftHash  = snapshotContentHash(left);
  const rightHash = snapshotContentHash(right);
  return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : 0;
}

// DJB2-32 content-aware hash for snapshot tie-breaking (R-17).
// Includes lifecycle and finalization fields so snapshots with the same
// identity keys but different finalization state still produce distinct hashes.
function snapshotContentHash(obj) {
  const str = [
    obj?.canonicalTradeId ?? obj?.tradeId ?? obj?.id ?? '',
    obj?.entryPrice ?? '',
    obj?.entryTime  ?? '',
    obj?.symbol     ?? '',
    obj?.lifecycleRevision   ?? '',
    obj?.snapshotSequence    ?? '',
    obj?.finalizationDataQuality ?? '',
    obj?.finalPriceIsEntryFallback ?? '',
    obj?.closedAt ?? '',
  ].join('|');
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Determine the exclusion reason for a trade that should not enter the
 * research-clean cohort.  Returns null if the trade is clean.
 */
export function classifyResearchExclusion(trade) {
  if (trade?.closed !== true) return CANONICAL_RESEARCH_EXCLUSION.ACTIVE;
  if (trade?.strategyResearchEligible === false) {
    return trade?.strategyResearchExclusionReason ?? CANONICAL_RESEARCH_EXCLUSION.MANUAL_EXCLUSION;
  }
  if (trade?.finalizationDataQuality === 'INVALID') {
    return CANONICAL_RESEARCH_EXCLUSION.FINALIZATION_INVALID;
  }
  if (trade?.finalizationStatus === 'FAILED') {
    return CANONICAL_RESEARCH_EXCLUSION.FINALIZATION_FAILED;
  }
  if (trade?.priceIntegrityStatus === 'FAILED') {
    return CANONICAL_RESEARCH_EXCLUSION.PRICE_INTEGRITY_FAILED;
  }
  if (trade?.autoEndUsedEntryPriceFallback === true) {
    return CANONICAL_RESEARCH_EXCLUSION.AUTO_END_ENTRY_PRICE_FALLBACK;
  }
  if (trade?.finalPriceIsEntryFallback === true) {
    return CANONICAL_RESEARCH_EXCLUSION.ENTRY_PRICE_FALLBACK_USED_AS_FINAL;
  }
  if (trade?.staleFinalPriceUnresolved === true) {
    return CANONICAL_RESEARCH_EXCLUSION.STALE_FINAL_PRICE_UNRESOLVED;
  }
  const pnl = trade?.feeAdjustedFinalPnlPct ?? trade?.finalPnlPct
    ?? trade?.feeAdjustedNormPnlPct ?? trade?.rawNormPnlPct;
  if (pnl == null || !Number.isFinite(Number(pnl))) {
    return CANONICAL_RESEARCH_EXCLUSION.FINAL_PNL_MISSING;
  }
  return null; // Clean
}

/**
 * Deduplicate a trade array using canonical IDs and the versioned precedence
 * comparator.  Input order is irrelevant — result is always the same for the
 * same trade set.
 *
 * Returns { canonical: Trade[], duplicateAudit: AuditRow[] }.
 */
export function deduplicateByCanonicalId(trades) {
  const byId  = new Map();  // id → { winner, superseded[] }
  const input = Array.isArray(trades) ? trades : [];

  for (const trade of input) {
    const { canonicalTradeId, canonicalTradeIdSource, canonicalTradeIdentityConfidence } =
      resolveCanonicalTradeId(trade);
    const enriched = {
      ...trade,
      canonicalTradeId,
      canonicalTradeIdSource,
      canonicalTradeIdentityConfidence,
    };
    if (!byId.has(canonicalTradeId)) {
      byId.set(canonicalTradeId, { winner: enriched, superseded: [] });
    } else {
      const slot = byId.get(canonicalTradeId);
      if (compareCanonicalTradeSnapshots(slot.winner, enriched) > 0) {
        // New snapshot is preferred — displace current winner.
        slot.superseded.push({
          ...slot.winner,
          canonicalSnapshotSelectedReason: 'SUPERSEDED_BY_NEWER_SNAPSHOT',
        });
        slot.winner = enriched;
      } else {
        slot.superseded.push({
          ...enriched,
          canonicalSnapshotSelectedReason: 'SUPERSEDED_BY_EXISTING_WINNER',
        });
      }
    }
  }

  const canonical    = [];
  const duplicateAudit = [];
  let totalSuperseded  = 0;

  for (const { winner, superseded } of byId.values()) {
    canonical.push({
      ...winner,
      canonicalSnapshotPrecedenceVersion: CANONICAL_SNAPSHOT_PRECEDENCE_VERSION,
      canonicalSnapshotSupersededCount:   superseded.length,
    });
    totalSuperseded += superseded.length;
    for (const s of superseded) {
      duplicateAudit.push(s);
    }
  }

  return { canonical, duplicateAudit, totalSuperseded };
}

export { CANONICAL_SNAPSHOT_PRECEDENCE_VERSION, CANONICAL_EXPORT_SCHEMA_VERSION };
