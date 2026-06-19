import { describe, expect, it } from 'vitest';
import { buildEntrySnapshotProvenance, ENTRY_FIELD_STATUS } from './entrySnapshotProvenance.js';

describe('entry snapshot provenance', () => {
  it('distinguishes false from not recorded', () => {
    const out = buildEntrySnapshotProvenance({ entryTime: 100, entryPrice: 1, leverage: 5, hasGreenConfirmation: false }, 200);
    expect(out.entrySnapshotFieldStatus.hasGreenConfirmation.status).toBe(ENTRY_FIELD_STATUS.RECORDED);
    expect(out.entrySnapshotFieldStatus.longMicroMomentumLabel.status).toBe(ENTRY_FIELD_STATUS.NOT_RECORDED);
    expect(out.entrySnapshotRequiredFieldsComplete).toBe(false);
  });
});
