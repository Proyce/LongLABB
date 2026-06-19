import { describe, expect, it } from 'vitest';
import {
  createLongBatchWorkerSnapshot,
  LONG_BATCH_TRANSPORT_OMITTED_FIELDS,
} from './longBatchExportTransport.js';

describe('Long batch export worker transport', () => {
  it('removes heavyweight nested forensic fields without mutating live trades', () => {
    const source = {
      id: 'trade-1',
      symbol: 'BTCUSDT',
      longGateScore: 90,
      entryResearchSnapshot: { huge: 'x'.repeat(10_000) },
      longComboDetails: [{ id: 'combo' }],
      longWinningSetupMatchDetails: [{ id: 'setup' }],
      entrySnapshotFieldStatus: { field: { status: 'RECORDED' } },
    };

    const [snapshot] = createLongBatchWorkerSnapshot([source]);

    expect(snapshot).not.toBe(source);
    expect(snapshot.id).toBe('trade-1');
    expect(snapshot.longGateScore).toBe(90);
    LONG_BATCH_TRANSPORT_OMITTED_FIELDS.forEach(field => {
      expect(snapshot).not.toHaveProperty(field);
      expect(source).toHaveProperty(field);
    });
  });
});
