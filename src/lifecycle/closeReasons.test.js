import { describe, expect, it } from 'vitest';
import { classifyLongCloseReason, CLOSE_REASON } from './closeReasons.js';

describe('canonical LONG close reasons', () => {
  it('normalizes legacy AUTO_END to RUN_STOP', () => {
    const out = classifyLongCloseReason('AUTO_END');
    expect(out.closeReason).toBe(CLOSE_REASON.RUN_STOP);
    expect(out.closeReasonCategory).toBe('TIME_OR_SESSION_EXIT');
    expect(out.legacyCloseReason).toBe('AUTO_END');
  });

  it('keeps TIMEOUT separate from session stop', () => {
    expect(classifyLongCloseReason('TIMEOUT').closeReason).toBe(CLOSE_REASON.TIMEOUT);
    expect(classifyLongCloseReason('RUN_STOP').closeReason).toBe(CLOSE_REASON.RUN_STOP);
  });
});
