#!/usr/bin/env node
// ─── LONG EXPORT PURITY CHECK ─────────────────────────────────────────────────
// Verifies the LONG trade export schema is canonical, non-duplicate,
// and free of deprecated field aliases.
//
// Usage: node scripts/check-long-export-purity.mjs

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { join } from "path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

// ── Deprecated field keys that must NOT appear in the schema ──────────────────
const DEPRECATED_EXPORT_KEYS = new Set([
  "longPostFee10Score",
  "longPostFee10Tier",
  "isLongPostFee10Candidate",
  "candidateRunnerScore",
  "candidateRunnerScoreAtScan",
  "entryPolicyWouldAllow",
  "entryPolicyWouldBlock",
  "entryPolicyReasons",
  "entryPolicyVersion",
  "finalPnlPct",
  "longShadowDecisionVerdict",
  "longShadowDecisionReasons",
  "longShadowSubVerdicts",
  "longFilterComponentErrors",
  "longFilterMissingFields",
]);

// ── Required fields that MUST appear in the schema ────────────────────────────
const REQUIRED_EXPORT_KEYS = new Set([
  "id",
  "symbol",
  "feeAdjustedNormPnlPct",
  "longParentBucket",
  "longGateWouldPass",
  "longGateEligibility",
  "bucketAuditWouldPass",
  "longCandidateRunnerScoreAtEntry",
  "longPostFee10EntryScore",
  "entryResearchStatus",
  "tradeSchemaVersion",
  "longFilterSnapshotVersion",
  "longFilterDataQuality",
  "longShadowDecision",
  "entryResearchComponentErrors",
  "grossNormPnlPct",
  "positionLifecycleLastWebsocketAt",
  "positionLifecycleLastRestFallbackAt",
  "positionLifecycleSymbolTickAgeMs",
  "positionLifecycleRestFallbackStatus",
  "positionLifecycleFallbackReason",
  "marketPriceStreamHealthy",
  "entryTickDataQuality",
  "entryTickCanonicalSource",
  "marketTickDirectionVerdict",
  "marketTickPrimaryPattern",
  "marketTickPredictionResult5s",
]);

// ── Required export schema version ────────────────────────────────────────────
const REQUIRED_SCHEMA_VERSION = "LONG_TRADE_EXPORT_V9";

let errors = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  errors++;
}

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

// ── Dynamically import the schema ─────────────────────────────────────────────
let LONG_TRADE_EXPORT_COLUMNS;
try {
  const mod = await import(`file://${ROOT}/src/export/longTradeExportSchema.js`);
  LONG_TRADE_EXPORT_COLUMNS = mod.LONG_TRADE_EXPORT_COLUMNS;
} catch (e) {
  console.error(`\n✗ Failed to import longTradeExportSchema.js: ${e.message}`);
  process.exit(1);
}

console.log(`\nLONG EXPORT PURITY CHECK`);
console.log(`Checking ${LONG_TRADE_EXPORT_COLUMNS.length} columns...\n`);

// ── 1. Unique keys ─────────────────────────────────────────────────────────────
const keys = LONG_TRADE_EXPORT_COLUMNS.map(c => c.key);
const keySet = new Set();
for (const k of keys) {
  if (keySet.has(k)) fail(`Duplicate column key: "${k}"`);
  else keySet.add(k);
}
pass(`Keys: ${keys.length} total, ${keySet.size} unique`);

// ── 2. Unique headers ──────────────────────────────────────────────────────────
const headers = LONG_TRADE_EXPORT_COLUMNS.map(c => c.header);
const headerSet = new Set();
for (const h of headers) {
  if (headerSet.has(h)) fail(`Duplicate column header: "${h}"`);
  else headerSet.add(h);
}
pass(`Headers: ${headers.length} total, ${headerSet.size} unique`);

// ── 3. No deprecated fields ────────────────────────────────────────────────────
let deprecatedFound = 0;
for (const k of keys) {
  if (DEPRECATED_EXPORT_KEYS.has(k)) { fail(`Deprecated key present: "${k}"`); deprecatedFound++; }
}
if (!deprecatedFound) pass(`No deprecated keys found`);

// ── 4. Required fields present ────────────────────────────────────────────────
let missingRequired = 0;
for (const req of REQUIRED_EXPORT_KEYS) {
  if (!keySet.has(req)) { fail(`Required key missing: "${req}"`); missingRequired++; }
}
if (!missingRequired) pass(`All required keys present`);

// ── 5. Schema version correct ─────────────────────────────────────────────────
const versionCol = LONG_TRADE_EXPORT_COLUMNS.find(c => c.key === "tradeSchemaVersion");
if (!versionCol) {
  fail(`"tradeSchemaVersion" column not found`);
} else {
  const version = versionCol.getValue({ tradeSchemaVersion: REQUIRED_SCHEMA_VERSION });
  if (version !== REQUIRED_SCHEMA_VERSION) {
    fail(`tradeSchemaVersion is "${version}", expected "${REQUIRED_SCHEMA_VERSION}"`);
  } else {
    pass(`tradeSchemaVersion = "${version}"`);
  }
}

// ── 6. No [object Object] in getValue output ──────────────────────────────────
const testTrade = { id: "test", symbol: "BTCUSDT" };
let objectObjectCount = 0;
for (const col of LONG_TRADE_EXPORT_COLUMNS) {
  const v = col.getValue(testTrade);
  const s = col.serialize ? col.serialize(v) : String(v ?? "");
  if (s === "[object Object]") {
    fail(`Column "${col.key}" produces [object Object] for getValue+serialize`);
    objectObjectCount++;
  }
}
if (!objectObjectCount) pass(`No [object Object] output in serialized values`);

// ── 7. All getValue functions callable ────────────────────────────────────────
let callErrors = 0;
for (const col of LONG_TRADE_EXPORT_COLUMNS) {
  try { col.getValue({}); } catch (e) {
    fail(`Column "${col.key}" getValue threw: ${e.message}`);
    callErrors++;
  }
}
if (!callErrors) pass(`All getValue functions callable with empty trade`);

// ── 8. Populated real V8 trade — required columns must actually populate ──────
// A column can be schema-valid yet dead (always empty). Build a real enriched
// V8 trade and assert the critical entry/research columns serialize to a
// non-empty value.
let populateErrors = 0;
try {
  const { buildResearchEnrichedTrade } = await import(`file://${ROOT}/src/research/buildResearchEnrichedTrade.js`);
  const enriched = buildResearchEnrichedTrade({
    baseTrade: {
      id: "purity-1", symbol: "ADAUSDT", entryPrice: 0.45, entryTime: 1718000000000,
      leverage: 5, longParentBucket: "TOP_LOSER_LONGS",
    },
    entryTelemetry: {
      entryCvdLabel: "BULL", immediateGreenImpulse: true, hasGreenConfirmation: true,
      hasRedDanger: false, spreadPct: 0.05, atrPct: 1.2,
      longMicroMomentumLabel: "MICRO_GREEN_IMPULSE", entryPriceVsVwapLabel: "ABOVE_VWAP",
      hasRsiRolloverUp: true, btcMicroDirectionLabel: "UP", btcTacticalDirectionLabel: "UP",
    },
    marketContext: { btcMicroDirectionLabel: "UP" },
    computedAt: 1718000100000,
  });
  // Attach a realistic closed outcome (research metric present).
  const closedTrade = {
    ...enriched, closed: true, closeReason: "PROFIT_LOCK",
    feeAdjustedNormPnlPct: 1.8, feeAdjustedMarginPnlPct: 9.0, finalPnlPct: 9.0,
  };

  // Columns that must be populated on a real, fully-enriched closed trade, including the June 16 V6 remediation and research contract.
  const MUST_POPULATE = [
    "id", "symbol", "feeAdjustedNormPnlPct", "longParentBucket",
    "longGateWouldPass", "longAesScore", "longCandidateRunnerScoreAtEntry",
    "longPostFee10EntryScore", "entryResearchStatus", "tradeSchemaVersion",
    "longFilterSnapshotVersion", "longFilterDataQuality", "longShadowDecision",
    "longMicroUpConfirmation", "rsiLongMomentumExpansion",
    "longCombosPositiveMatched", "absoluteEntryAdaptiveStatus",
    "longAesScoreV2Shadow", "bestDnaLongScoreV2Shadow",
    "longWinningSetupMatchedIds",
    "requiredEntrySnapshotCompletenessPct",
    "optionalResearchFeatureCoveragePct",
  ];
  const isEmpty = (s) => s == null || s === "" || s === "UNKNOWN";
  for (const key of MUST_POPULATE) {
    const col = LONG_TRADE_EXPORT_COLUMNS.find(c => c.key === key);
    if (!col) { fail(`MUST_POPULATE column not in schema: "${key}"`); populateErrors++; continue; }
    const v = col.getValue(closedTrade);
    const s = col.serialize ? col.serialize(v) : String(v ?? "");
    if (isEmpty(s)) { fail(`Column "${key}" is empty on a populated V8 trade (dead column?)`); populateErrors++; }
  }
  if (!populateErrors) pass(`Populated V8 trade: all ${MUST_POPULATE.length} critical columns populate`);
} catch (e) {
  fail(`Could not build/verify a populated V8 trade: ${e.message}`);
  populateErrors++;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${errors === 0 ? "✓ PASS" : `✗ FAIL (${errors} error${errors !== 1 ? "s" : ""})`}\n`);
process.exit(errors > 0 ? 1 : 0);
