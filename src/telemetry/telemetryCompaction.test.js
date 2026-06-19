import { describe, expect, it } from 'vitest';
import {
  compactLongTradeForRuntime,
  buildExceptionalForensicEvent,
  HEAVY_DUPLICATE_TELEMETRY_FIELDS,
} from './telemetryCompaction.js';

describe('LongLAB V8 telemetry compaction', () => {
  it('removes duplicated nested telemetry and row-constant registry metadata', () => {
    const input = {
      id: 't1', symbol: 'BTCUSDT', grossNormPnlPct: 1.2,
      entryResearchSnapshot: { huge: true }, longComboDetails: [{ id: 1 }],
      longWinningSetupMatchDetails: [{ id: 2 }], entrySnapshotFieldStatus: { a: {} },
      scoreRegistryVersion: 'v', longAesV2ComponentWeights: { flow: 1.7 },
      cvdStateAtEntry: 'BULL', cvdStateCurrent: 'BULL',
    };
    const result = compactLongTradeForRuntime(input);
    for (const field of HEAVY_DUPLICATE_TELEMETRY_FIELDS) expect(result[field]).toBeUndefined();
    expect(result.scoreRegistryVersion).toBeUndefined();
    expect(result.longAesV2ComponentWeights).toBeUndefined();
    expect(result.cvdStateCurrent).toBeUndefined();
    expect(result.grossNormPnlPct).toBe(1.2);
    expect(result.telemetryStorageProfile).toBe('LONG_TELEMETRY_V9_COMPACT');
    expect(input.entryResearchSnapshot).toEqual({ huge: true });
  });

  it('persists sparse forensic evidence only for exceptional exits', () => {
    expect(buildExceptionalForensicEvent({ id: 'ok', symbol: 'BTCUSDT' })).toBeNull();
    const event = buildExceptionalForensicEvent({
      id: 'bad', run: 7, symbol: 'ETHUSDT', profitLockFloorMissed: true,
      boundedExitTickAudit: [[1, 100, 'B', 0]],
    });
    expect(event.tradeId).toBe('bad');
    expect(event.profitLockFloorMissed).toBe(true);
    expect(event.boundedExitTickAudit).toHaveLength(1);
  });
});
