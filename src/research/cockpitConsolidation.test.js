import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { buildResearchEnrichedTrade } from './buildResearchEnrichedTrade.js';
import { buildManualResearchTrade } from './buildManualResearchTrade.js';
import { buildBatchResearchTrade } from './buildBatchResearchTrade.js';
import { buildLongShadowDecision } from './buildLongShadowDecision.js';
import { migrateLongTradeRecord } from '../migrations/migrateLongTradeRecord.js';
import { assertEntrySnapshotConsistency, CONSISTENCY_CHECKS } from '../safety/assertEntrySnapshotConsistency.js';
import {
  insertSimulatedTrade,
  applyPriceUpdate,
  finalizeLongTrade,
} from '../lifecycle/longTradeLifecycle.js';
import { buildLongTradeJsonBlob } from '../export/longTradeExport.js';
import { LONG_RUNNER_TIER } from '../scoring/longCandidateRunner/index.js';
import { LONG_PF10_TIER } from '../scoring/longPostFee10/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

const STRONG_PARAMS = {
  baseTrade: {
    id: 'cockpit-strong', symbol: 'ADAUSDT', entryPrice: 0.45,
    entryTime: 1_718_000_000_000, leverage: 5, longParentBucket: 'TOP_LOSER_LONGS',
  },
  entryTelemetry: {
    immediateGreenImpulse: true, greenImpulseDetected: true,
    entryCvdLabel: 'BULL', spreadPct: 0.05, atrPct: 1.2,
    longMicroMomentumLabel: 'MICRO_GREEN_IMPULSE', hasGreenConfirmation: true,
    hasRedDanger: false, longVwapContextLabel: 'VWAP_SUPPORT_HOLD',
    entryPriceVsVwapLabel: 'ABOVE_VWAP', hasRsiRolloverUp: true,
    btcMicroDirectionLabel: 'UP', btcTacticalDirectionLabel: 'UP',
  },
  marketRegime: { btcMicroDirectionLabel: 'UP' },
  marketContext: { btcMicroDirectionLabel: 'UP' },
  sessionContext: { sessionId: 'sess-strong' },
  computedAt: 1_718_000_100_000,
};

const HARD_DANGER_PARAMS = {
  baseTrade: {
    id: 'cockpit-hard', symbol: 'ADAUSDT', entryPrice: 0.45,
    entryTime: 1_718_000_000_000, leverage: 5, longParentBucket: 'TOP_GAINER_LONGS',
  },
  entryTelemetry: {
    hasRedDanger: true, immediateRedImpulse: true, redImpulseDetected: true,
    entryCvdLabel: 'BEAR', spreadPct: 0.9, atrPct: 9.5,
    longMicroMomentumLabel: 'MICRO_RED_PRESSURE', hasGreenConfirmation: false,
    last3TicksDown: true, longMarketBreadthLabel: 'LONG_BREADTH_HARD_DANGER',
  },
  marketContext: { btcMicroDirectionLabel: 'DOWN', longMarketContextLabel: 'LONG_CONTEXT_STRONG_HEADWIND' },
  computedAt: 1_718_000_100_000,
};

// ─── §6: gate values visible to AES feature snapshot ───────────────────────────

describe('§6 cumulative working trade', () => {
  it('AES feature snapshot observes the merged gate values', () => {
    const trade = buildResearchEnrichedTrade(STRONG_PARAMS);
    const snap = trade.entryResearchSnapshot;
    expect(snap.longAes.longAesFeatureSnapshot.longGateWouldPass)
      .toBe(snap.gate.longGateWouldPass);
    expect(snap.longAes.longAesFeatureSnapshot.longGateScore)
      .toBe(snap.gate.longGateScore);
  });

  it('snapshot exposes canonical keys (bucketClassification, comboResult)', () => {
    const trade = buildResearchEnrichedTrade(STRONG_PARAMS);
    const snap = trade.entryResearchSnapshot;
    expect(snap).toHaveProperty('bucketClassification');
    expect(snap).toHaveProperty('comboResult');
    expect(snap).not.toHaveProperty('comboLabels');
    expect(snap).toHaveProperty('entryResearchStatus');
  });
});

// ─── §11: consistency assertion catches every mutation ─────────────────────────

describe('§11 consistency assertion mutation detection', () => {
  it('passes for an unmutated valid trade', () => {
    const trade = buildResearchEnrichedTrade(STRONG_PARAMS);
    expect(() => assertEntrySnapshotConsistency(trade)).not.toThrow();
  });

  for (const field of [
    'longParentBucket',
    'longGateScore',
    'longAesScore',
    'longAesTier',
    'longAuditDangerTier',
    'longCandidateRunnerScoreAtEntry',
    'longPostFee10EntryScore',
    'longShadowDecision',
    'longFilterDataQuality',
    'entryResearchStatus',
  ]) {
    it(`detects a mutation of top-level ${field}`, () => {
      const trade = buildResearchEnrichedTrade(STRONG_PARAMS);
      const mutated = { ...trade, [field]: '___MUTATED___' };
      expect(() => assertEntrySnapshotConsistency(mutated)).toThrow();
    });
  }

  it('mapping table covers all listed canonical fields', () => {
    const tops = CONSISTENCY_CHECKS.map(c => c.topLevel);
    expect(tops).toContain('longShadowDecision');
    expect(tops).toContain('longFilterDataQuality');
  });
});

// ─── §23: manual / batch parity through real adapters ──────────────────────────

describe('§23 real adapter parity', () => {
  const manual = buildManualResearchTrade(STRONG_PARAMS);
  const batch  = buildBatchResearchTrade(STRONG_PARAMS);

  const canonicalFields = [
    'longParentBucket', 'longGateWouldPass', 'longGateScore', 'bucketAuditWouldPass',
    'longAesScore', 'longAesTier', 'bestDnaLongScore', 'longCandidateRunnerScoreAtEntry',
    'longPostFee10EntryScore', 'longShadowDecision', 'longFilterDataQuality',
    'entryResearchStatus', 'entryResearchSchemaVersion',
  ];

  for (const f of canonicalFields) {
    it(`canonical field ${f} matches across adapters`, () => {
      expect(manual[f]).toEqual(batch[f]);
    });
  }

  it('snapshots agree on schema version and shadow verdict', () => {
    expect(manual.entryResearchSnapshot.schemaVersion).toBe(batch.entryResearchSnapshot.schemaVersion);
    expect(manual.entryResearchSnapshot.shadowDecision.finalVerdict)
      .toBe(batch.entryResearchSnapshot.shadowDecision.finalVerdict);
  });

  it('neither adapter imports direct scorer functions (static check)', () => {
    const forbidden = [
      'computeLongAbsoluteEntryScoreV1', 'computeLongEntryDangerAuditLogOnly',
      'computeLongMarketBreadthLogOnly', 'evaluateBestDnaLongAudit',
      'scoreLongCandidateRunner', 'scoreLongPostFee10Entry',
      'evaluateSniperLongGateLogOnly', 'evaluateLongCombos',
      'freezeLongFilterSnapshot', 'evaluateEntryPolicy', 'computeAdaptiveAes',
    ];
    for (const file of ['buildManualResearchTrade.js', 'buildBatchResearchTrade.js']) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      for (const fn of forbidden) {
        expect(src.includes(fn), `${file} must not import ${fn}`).toBe(false);
      }
    }
  });
});

// ─── §24: no-block lifecycle ────────────────────────────────────────────────────

describe('§24 no-block lifecycle', () => {
  it('a WOULD_HARD_BLOCK candidate still simulates, finalizes, and exports', async () => {
    const createdTrade = insertSimulatedTrade(buildBatchResearchTrade(HARD_DANGER_PARAMS));

    expect(createdTrade.tradeId).toBeDefined();
    expect(createdTrade.longShadowDecision).toBe('WOULD_HARD_BLOCK');

    const updatedTrade = applyPriceUpdate(createdTrade, 0.47);
    expect(updatedTrade).not.toBeNull();

    const closedTrade = finalizeLongTrade(updatedTrade, 'AUTO_END', 4.4, { closedAt: 1_718_000_900_000 });
    expect(closedTrade.isFinalOutcome).toBe(true);
    expect(closedTrade.closeReason).toBe('RUN_STOP');
    expect(closedTrade.closeReasonCategory).toBe('TIME_OR_SESSION_EXIT');
    expect(closedTrade.closeReasonDetail).toBe('RUN_STOP');
    expect(closedTrade.legacyCloseReason).toBe('AUTO_END');
    expect(closedTrade.executionApplied).toBe(false);
    expect(closedTrade.canAffectExecution).toBe(false);

    const blob = buildLongTradeJsonBlob([closedTrade]);
    const parsedExport = JSON.parse(await blob.text());
    expect(parsedExport[0].tradeId ?? parsedExport[0].id).toBe(closedTrade.tradeId);
    expect(parsedExport[0].longShadowDecision).toBe('WOULD_HARD_BLOCK');
  });
});

// ─── §28: shadow + migration probes ─────────────────────────────────────────────

describe('§28 shadow probes', () => {
  const base = {
    longGate: { longGateEligibility: 'ELIGIBLE', longGateWouldPass: true },
    longAes: { longAesEligibility: 'VALID', longAesScore: 60 },
    longAudit: { longAuditDangerTier: 'CLEAR' },
    dataQuality: { longFilterDataQuality: 'COMPLETE' },
  };

  it('LONG_CONTEXT_STRONG_HEADWIND → block evidence', () => {
    const r = buildLongShadowDecision({ ...base, marketContext: { longMarketContextLabel: 'LONG_CONTEXT_STRONG_HEADWIND' } });
    expect(r.blockReasons.length).toBeGreaterThan(0);
    expect(r.finalVerdict).toBe('WOULD_BLOCK');
  });

  it('LONG_CONTEXT_STRONG_TAILWIND → positive evidence', () => {
    const r = buildLongShadowDecision({ ...base, marketContext: { longMarketContextLabel: 'LONG_CONTEXT_STRONG_TAILWIND' } });
    expect(r.positiveReasons).toContain('MARKET_CONTEXT_STRONG_TAILWIND');
  });

  it('LONG_CONTEXT_STALE → unknown context verdict', () => {
    const r = buildLongShadowDecision({ ...base, marketContext: { longMarketContextLabel: 'LONG_CONTEXT_STALE' } });
    expect(r.marketContextVerdict).toBe('UNKNOWN');
  });

  it('LONG_BREADTH_HARD_DANGER → WOULD_HARD_BLOCK', () => {
    const r = buildLongShadowDecision({ ...base, marketBreadth: { longMarketBreadthLabel: 'LONG_BREADTH_HARD_DANGER' } });
    expect(r.finalVerdict).toBe('WOULD_HARD_BLOCK');
  });

  it('CONFLICTED data → final UNKNOWN', () => {
    const r = buildLongShadowDecision({ ...base, dataQuality: { longFilterDataQuality: 'CONFLICTED' } });
    expect(r.finalVerdict).toBe('UNKNOWN');
  });
});

describe('§28 migration tier probes', () => {
  it('90 Runner score → LONG_RUNNER_ELITE', () => {
    const out = migrateLongTradeRecord({ longCandidateRunnerScoreAtEntry: 90 });
    expect(out.longCandidateRunnerTierAtEntry).toBe(LONG_RUNNER_TIER.ELITE);
    expect(out.longCandidateRunnerTierAtEntry).toBe('LONG_RUNNER_ELITE');
  });

  it('90 Post-Fee score → LONG_PF10_ELITE', () => {
    const out = migrateLongTradeRecord({ longPostFee10EntryScore: 90 });
    expect(out.longPostFee10EntryTier).toBe(LONG_PF10_TIER.ELITE);
    expect(out.longPostFee10EntryTier).toBe('LONG_PF10_ELITE');
  });

  it('V4 record is repaired (not blindly returned) and tiers are not fabricated', () => {
    const out = migrateLongTradeRecord({
      entryResearchSchemaVersion: 'LONG_ENTRY_RESEARCH_V4',
      longGateScore: 80, longGateTier: null,
    });
    expect(out.longFilterMissingTierFields).toContain('longGateTier');
    expect(out.longGateTier).toBeNull();
    expect(out.longFilterDataQuality).toBe('DEGRADED');
  });
});

// ─── REVIEW FIXES — REGRESSION LOCKS ──────────────────────────────────────────

describe('review fixes: AES consumes canonical fact schema', () => {
  it('AES feature snapshot reads canonical entryCvdLabel (not legacy cvdLabel)', () => {
    const trade = buildResearchEnrichedTrade(STRONG_PARAMS);
    const fs = trade.entryResearchSnapshot.longAes.longAesFeatureSnapshot;
    expect(fs.cvdLabel).toBe('BULL');
    expect(fs.cvdLabel).not.toBe('UNKNOWN');
  });

  it('AES derives BTC direction from canonical btcMicroDirectionLabel', () => {
    const trade = buildResearchEnrichedTrade(STRONG_PARAMS);
    const fs = trade.entryResearchSnapshot.longAes.longAesFeatureSnapshot;
    expect(fs.btcRunDirection).toBe('UP');
  });
});

describe('review fixes: filter snapshot is canonical and consistent', () => {
  it('nested filterSnapshot quality equals the canonical top-level/snapshot verdict', () => {
    const trade = buildResearchEnrichedTrade(STRONG_PARAMS);
    const snap = trade.entryResearchSnapshot;
    expect(snap.filterSnapshot.longFilterDataQuality).toBe(trade.longFilterDataQuality);
    expect(snap.filterSnapshot.longFilterDataQuality).toBe(snap.dataQuality.verdict);
  });

  it('filter snapshot carries canonical entry fields + shadow decision', () => {
    const trade = buildResearchEnrichedTrade(STRONG_PARAMS);
    const fs = trade.entryResearchSnapshot.filterSnapshot;
    expect(fs.longPostFee10EntryScore).not.toBeUndefined();
    expect(fs.longPostFee10Score).toBeUndefined();
    expect(fs).toHaveProperty('longShadowDecision');
    expect(fs.longShadowDecision).toBe(trade.entryResearchSnapshot.shadowDecision.finalVerdict);
  });
});

describe('review fixes: app uses the shared lifecycle finalize helper', () => {
  it('LongLabApp.finalizeClosedSample routes through finalizeLongTrade', () => {
    const appSrc = readFileSync(join(__dirname, '..', 'app', 'LongLabApp.jsx'), 'utf8');
    expect(appSrc).toMatch(/import\s*\{[^}]*finalizeLongTrade[^}]*\}\s*from\s*["'][^"']*longTradeLifecycle/);
    expect(appSrc).toMatch(/finalizeLongTrade\(mergedSample, closeReason, canonicalFinalPnlPct/);
  });

  it('finalizeLongTrade stamps log-only execution flags', () => {
    const out = finalizeLongTrade({ id: 'x', symbol: 'AAA' }, 'PROFIT_LOCK', 2.0);
    expect(out.closed).toBe(true);
    expect(out.canAffectExecution).toBe(false);
    expect(out.executionApplied).toBe(false);
    expect(out.closeReasonDetail).toBeDefined();
  });
});
