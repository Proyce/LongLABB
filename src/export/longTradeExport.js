// ─── CANONICAL LONG TRADE EXPORTER ────────────────────────────────────────────
// Generates CSV, compact JSON, and JSONL from the canonical column schema.
// Headers and row values always come from the same schema — no manual alignment.
// LOG ONLY — must never affect simulation execution.

import {
  LONG_TRADE_EXPORT_COLUMNS,
  LONG_TRADE_FORENSIC_EXPORT_COLUMNS,
  assertUniqueExportColumns,
  serializeScalar,
  serializeJson,
} from './longTradeExportSchema.js';
import { migrateLongTradeRecord } from '../migrations/migrateLongTradeRecord.js';

// Validate column uniqueness at module load time (catches schema bugs early)
assertUniqueExportColumns(LONG_TRADE_EXPORT_COLUMNS);

// ─── EXPORT INTEGRITY SANITIZER ───────────────────────────────────────────────
// Catches "COMPLETE-while-empty": subsystem score present but tier label absent.
// Root cause: pre-WS-1 records were stamped COMPLETE before tier fields existed.
// Fix: run migration (reconstructs tiers from scores), then verify; downgrade
// longFilterDataQuality to DEGRADED if any score-tier gap remains after migration.

const SCORE_TIER_PAIRS = [
  { score: 'longGateScore',                   tier: 'longGateTier' },
  { score: 'longAesScore',                    tier: 'longAesTier' },
  { score: 'longCandidateRunnerScoreAtEntry', tier: 'longCandidateRunnerTierAtEntry' },
  { score: 'longPostFee10EntryScore',         tier: 'longPostFee10EntryTier' },
  { score: 'bucketAuditScore',                tier: 'bucketAuditTier' },
];

export function sanitizeLongTradeForExport(trade) {
  // Run migration once per trade — reconstructs tiers for pre-WS-1 records.
  const migrated = migrateLongTradeRecord(trade);

  // Check remaining score-without-tier gaps after migration.
  const tierGaps = SCORE_TIER_PAIRS
    .filter(({ score, tier }) => migrated[score] != null && migrated[tier] == null)
    .map(({ tier }) => tier);

  if (tierGaps.length === 0) return migrated;

  // Downgrade COMPLETE to DEGRADED — the quality assertion lied.
  const currentQuality = migrated.longFilterDataQuality;
  return {
    ...migrated,
    longFilterDataQuality: currentQuality === 'COMPLETE' ? 'DEGRADED' : currentQuality,
    longFilterMissingTierFields: tierGaps,
  };
}

export function prepareLongTradesForExport(trades) {
  return (Array.isArray(trades) ? trades : []).map(sanitizeLongTradeForExport);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function serializeColumn(col, trade) {
  const raw = col.getValue(trade);
  return col.serialize ? col.serialize(raw) : serializeScalar(raw);
}

export function projectLongTradeToExportObject(trade, { sanitized = false, columns = LONG_TRADE_EXPORT_COLUMNS } = {}) {
  const source = sanitized ? trade : sanitizeLongTradeForExport(trade);
  const obj = {};
  for (const col of columns) {
    obj[col.key] = col.getValue(source);
  }
  return obj;
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

export function buildLongTradeCsvString(trades, { prepared = false, columns = LONG_TRADE_EXPORT_COLUMNS } = {}) {
  const cols = columns;
  const preparedTrades = prepared ? (Array.isArray(trades) ? trades : []) : prepareLongTradesForExport(trades);
  const lines = new Array(preparedTrades.length + 1);

  lines[0] = cols.map(col => csvEscape(col.header)).join(',');
  for (let rowIndex = 0; rowIndex < preparedTrades.length; rowIndex += 1) {
    const trade = preparedTrades[rowIndex];
    const cells = new Array(cols.length);
    for (let colIndex = 0; colIndex < cols.length; colIndex += 1) {
      cells[colIndex] = csvEscape(serializeColumn(cols[colIndex], trade));
    }
    lines[rowIndex + 1] = cells.join(',');
  }

  return lines.join('\n');
}

/**
 * Builds a CSV Blob from an array of trade records.
 * Migration/sanitization runs once per trade rather than once per cell.
 */
export function buildLongTradeCsvBlob(trades) {
  return new Blob([buildLongTradeCsvString(trades)], { type: 'text/csv;charset=utf-8;' });
}

// ─── JSON / JSONL EXPORT ──────────────────────────────────────────────────────

export function buildLongTradeJsonRows(trades, { prepared = false, columns = LONG_TRADE_EXPORT_COLUMNS } = {}) {
  const preparedTrades = prepared ? (Array.isArray(trades) ? trades : []) : prepareLongTradesForExport(trades);
  return preparedTrades.map(trade => projectLongTradeToExportObject(trade, { sanitized: true, columns }));
}

export function buildLongTradeJsonString(trades, { pretty = false, prepared = false, columns = LONG_TRADE_EXPORT_COLUMNS } = {}) {
  return JSON.stringify(buildLongTradeJsonRows(trades, { prepared, columns }), null, pretty ? 2 : 0);
}

export function buildLongTradeJsonLinesString(trades, { prepared = false, columns = LONG_TRADE_EXPORT_COLUMNS } = {}) {
  const rows = buildLongTradeJsonRows(trades, { prepared, columns });
  return rows.map(row => JSON.stringify(row)).join('\n');
}

/**
 * Builds a compact JSON Blob by default. Pretty JSON can be requested explicitly,
 * but compact output is materially lighter for large research batches.
 */
export function buildLongTradeJsonBlob(trades, options = {}) {
  return new Blob([buildLongTradeJsonString(trades, options)], {
    type: 'application/json;charset=utf-8;',
  });
}

export function buildLongTradeJsonLinesBlob(trades) {
  return new Blob([buildLongTradeJsonLinesString(trades)], {
    type: 'application/x-ndjson;charset=utf-8;',
  });
}

export function buildLongTradeForensicJsonLinesString(trades, { prepared = false } = {}) {
  return buildLongTradeJsonLinesString(trades, { prepared, columns: LONG_TRADE_FORENSIC_EXPORT_COLUMNS });
}

export function buildLongTradeForensicJsonLinesBlob(trades) {
  return new Blob([buildLongTradeForensicJsonLinesString(trades)], {
    type: 'application/x-ndjson;charset=utf-8;',
  });
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

export { LONG_TRADE_EXPORT_COLUMNS, LONG_TRADE_FORENSIC_EXPORT_COLUMNS, assertUniqueExportColumns };
export { serializeScalar, serializeJson };

export function getLongTradeExportHeaders() {
  return LONG_TRADE_EXPORT_COLUMNS.map(c => c.header);
}

export function serializeLongTradeRow(trade) {
  const sanitized = sanitizeLongTradeForExport(trade);
  return LONG_TRADE_EXPORT_COLUMNS.map(col => serializeColumn(col, sanitized));
}
