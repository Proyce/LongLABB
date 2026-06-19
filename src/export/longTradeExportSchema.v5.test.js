import { describe, expect, it } from 'vitest';
import {
  LONG_TRADE_EXPORT_COLUMNS,
  LONG_TRADE_FORENSIC_EXPORT_COLUMNS,
  assertUniqueExportColumns,
} from './longTradeExportSchema.js';
import { LONG_TRADE_EXPORT_VERSION } from '../research/longResearchSchemaVersions.js';

describe('Long V8 compact export schema', () => {
  it('keeps critical scalar research fields and omits duplicated forensic payloads', () => {
    expect(() => assertUniqueExportColumns(LONG_TRADE_EXPORT_COLUMNS)).not.toThrow();
    const keys = new Set(LONG_TRADE_EXPORT_COLUMNS.map(column => column.key));
    for (const key of [
      'longMicroUpConfirmation',
      'rsiLongMomentumExpansion',
      'macdBullishExpansion',
      'longCombosPositiveMatched',
      'absoluteEntryAdaptiveScore',
      'longAesScoreV2Shadow',
      'bestDnaLongScoreV2Shadow',
      'profitLockCrossDetected',
      'profitLockObservedFillPrice',
      'profitLockRecommendedActionLogOnly',
      'longWinningSetupMatchedIds',
      'entryPolicyDiagnosticDecision',
      'requiredEntrySnapshotCompletenessPct',
      'optionalResearchFeatureCoveragePct',
    ]) expect(keys.has(key), key).toBe(true);

    for (const removed of [
      'activeWinningSetupIds',
      'longWinningSetupMatchDetails',
      'longComboDetails',
      'entrySnapshotFieldStatus',
      'exportSchemaVersion',
    ]) expect(keys.has(removed), removed).toBe(false);
  });

  it('retains the full forensic schema only when explicitly requested', () => {
    const keys = new Set(LONG_TRADE_FORENSIC_EXPORT_COLUMNS.map(column => column.key));
    expect(keys.has('longWinningSetupMatchDetails')).toBe(true);
    expect(keys.has('longComboDetails')).toBe(true);
    const marker = LONG_TRADE_FORENSIC_EXPORT_COLUMNS.find(item => item.key === 'exportSchemaVersion');
    expect(marker.getValue({})).toBe(LONG_TRADE_EXPORT_VERSION);
  });
});
