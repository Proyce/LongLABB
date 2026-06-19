import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../app/LongLabApp.jsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');

// Source-contract regression checks protect the exact crash/overrun paths that
// previously blanked the cockpit after long sessions.
describe('LongLAB app stability source contracts', () => {
  it('filters non-finite closed PnL before render analytics and equity formatting', () => {
    expect(appSource).toContain('closedSamples.filter(hasFiniteClosedPnl)');
    expect(appSource).toContain('safeRound(cum, 2)');
    expect(appSource).not.toContain('finalPnlPct.toFixed(');
  });

  it('contains the app-level error boundary as a final crash containment layer', () => {
    expect(mainSource).toContain('<AppErrorBoundary>');
    expect(mainSource).toContain('</AppErrorBoundary>');
  });

  it('keeps the 15-second scanner fast and schedules deep telemetry separately', () => {
    expect(appSource).toContain('const SCAN_REQUEST_TIMEOUT_MS = 12_000');
    expect(appSource).toContain('scheduleDeepTelemetryScan(fullUniverse)');
    expect(appSource).toContain('apiGetScan(');
    expect(appSource).not.toContain('await fetchLosersKlines(fullUniverse)');
    expect(appSource).not.toContain('await fetchGainersKlines(fullUniverse)');
  });
});
