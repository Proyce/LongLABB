import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../app/LongLabApp.jsx', import.meta.url), 'utf8');

describe('Analysis ZIP UI safety', () => {
  it('uses non-submit buttons so export cannot navigate or reload the app', () => {
    expect(appSource).toContain('type="button"');
    expect(appSource).toContain('event?.preventDefault?.()');
    expect(appSource).toContain('event?.stopPropagation?.()');
  });

  it('sends only the selected batch snapshot to the export worker', () => {
    expect(appSource).toContain('trades: selectedExportBatchTrades');
    expect(appSource).not.toContain('trades: rankedSamples,\n        descriptor: selectedExportBatch');
  });
});
