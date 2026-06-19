#!/usr/bin/env node
// ─── LONG FILTER PURITY CHECK ─────────────────────────────────────────────────
// Static analysis: fails if primary filter files contain ShortLAB-semantic fields.
// Allowlist: migration files and legacy data adapters.
//
// Usage: node scripts/check-long-filter-purity.mjs

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { LONG_FILTER_REGISTRY, getFilterById } from "../src/filters/longFilterRegistry.js";
import { FILTER_TIMING, PNL_METRIC } from "../src/filters/longFilterConstants.js";
import { freezeLongFilterSnapshot } from "../src/filters/longFilterSnapshot.js";
import { getLongFilterOutcomePnl } from "../src/filters/longFilterEngine.js";
import { LONG_PF10_TIER } from "../src/scoring/longPostFee10/longPostFee10.constants.js";
import { LONG_RUNNER_TIER } from "../src/scoring/longCandidateRunner/longCandidateRunner.constants.js";
import { evaluateBestDnaLongAudit } from "../src/audits/bestDnaLongAudit.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

// Patterns that must NOT appear in primary filter files
const FORBIDDEN_PATTERNS = [
  /\bALL_SHORTS\b/,
  /\bminShortGateScore\b/,
  /\bmaxShortGateScore\b/,
  /\bshowOnlyNoGreen\b/,
  /\bshowOnlyCvdBearNeut\b/,
  /\bshowOnlyBestDnaShortGatePass\b/,
  /\bbtcShortContextLabel\b/,
  /\bbtcShortContextScore\b/,
  /\bshortGateScore\b/,
  /\bshortGateWouldPass\b/,
  /\bsniperShortTier\b/,
  /\bsniperShortWouldPass\b/,
  /\bWOULD_PASS_SHORT_GATE\b/,
  /\bTOP_GAINER_CLASSIC_EXHAUSTION_SHORT\b/,
  /\bTOP_GAINER_HOT_PUMP_FADE_SHORT\b/,
  /\bTOP_GAINER_FAILED_BREAKOUT_SHORT\b/,
  /\bTOP_GAINER_VWAP_LOSS_SHORT\b/,
  /\bTOP_LOSER_BLIND_WEAKNESS_SHORT\b/,
  /\btopGainerExhaustionAuditLabel\b/,
  /["']SHORT_BREATH_(CLEAR|CONTROLLED|MIXED_OK|STRICT|BOUNCE_TRAP_RISK|HARD_DANGER)["']/,
  /\bshortPressureDangerLabel\b/,
  /\bshortPressureDangerScore\b/,
];

// Files/patterns explicitly allowed to reference legacy short fields
const ALLOWLIST = [
  "longFilterMigration.js",
  "filterAnalytics.test.js",           // tests legacy migration path
  "longFilterPurity.js",               // purity checker itself lists the patterns
  "longFilterConstants.js",            // FORBIDDEN_SHORT_FIELDS array defines the list for detection
  "longFilterSnapshot.js",             // detects LEGACY_SHORT_SEMANTIC schema by checking short fields
  "check-long-filter-purity.mjs",      // this script
  "shortPressureDangerLogOnly.js",     // kept for historical comparison, not used in active runtime
  "shortPressureDangerLogOnly.test.js",// tests the historical module
  "marketBreathLogOnly.js",            // kept for historical comparison, not used in active runtime
];

function getAllJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
      files.push(...getAllJsFiles(full));
    } else if (stat.isFile() && (entry.endsWith(".js") || entry.endsWith(".jsx") || entry.endsWith(".mjs"))) {
      files.push(full);
    }
  }
  return files;
}

const filterFiles = getAllJsFiles(join(ROOT, "src/filters"));
const comboFiles = getAllJsFiles(join(ROOT, "src/combos"));
const auditFiles = getAllJsFiles(join(ROOT, "src/longAudits"));
const gateFiles = getAllJsFiles(join(ROOT, "src/longGate"));
const bucketFiles = getAllJsFiles(join(ROOT, "src/longBuckets"));

const allPrimaryFiles = [
  ...filterFiles,
  ...comboFiles,
  ...auditFiles,
  ...gateFiles,
  ...bucketFiles,
];

let violations = 0;

for (const filePath of allPrimaryFiles) {
  const name = filePath.split(/[/\\]/).pop();
  if (ALLOWLIST.some(a => name === a)) continue;

  const rel = relative(ROOT, filePath);
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(lines[i])) {
        console.error(`[PURITY FAIL] ${rel}:${i + 1} — matches ${pattern}`);
        console.error(`  > ${lines[i].trim()}`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n❌ Long filter purity check FAILED: ${violations} violation(s) found.`);
  process.exit(1);
}

// ─── §26: LONG-LEGACY FIELD CHECKS ────────────────────────────────────────────
// Active filter files must use canonical entry fields, never the legacy aliases.

const LONG_LEGACY_PATTERNS = [
  /\blongPostFee10Score\b/,
  /\blongPostFee10Tier\b/,
  /\bisLongPostFee10Candidate\b/,
  /\bcandidateRunnerScoreAtScan\b/,
  /\bcandidateRunnerScore\b/,
  /\bcandidateRunnerTier\b/,
  /\bentryPolicyWouldAllow\b/,
  /\bentryPolicyWouldBlock\b/,
];

// finalPnlPct may exist as a backward-compat fallback, but never as a DEFAULT metric.
const FINAL_PNL_DEFAULT_PATTERNS = [
  /useState\(\s*["']finalPnlPct["']\s*\)/,
  /defaultMetric\s*[:=]\s*["']finalPnlPct["']/,
  /DEFAULT_METRIC\s*=\s*["']finalPnlPct["']/,
  /selectedMetric\s*=\s*["']finalPnlPct["']/,
];

const LONG_LEGACY_ALLOWLIST = [
  "longFilterMigration.js",
  "longFilterConstants.js",
  "filterAnalytics.test.js",
  "longFilterPurity.js",
  "check-long-filter-purity.mjs",
];

for (const filePath of filterFiles) {
  const name = filePath.split(/[/\\]/).pop();
  if (LONG_LEGACY_ALLOWLIST.some(a => name === a)) continue;
  if (name.endsWith(".test.js") || name.endsWith(".test.jsx")) continue;

  const rel = relative(ROOT, filePath);
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of LONG_LEGACY_PATTERNS) {
      if (pattern.test(line)) {
        console.error(`[PURITY FAIL] ${rel}:${i + 1} — legacy long field matches ${pattern}`);
        console.error(`  > ${line.trim()}`);
        violations++;
      }
    }
    for (const pattern of FINAL_PNL_DEFAULT_PATTERNS) {
      if (pattern.test(line)) {
        console.error(`[PURITY FAIL] ${rel}:${i + 1} — finalPnlPct used as default metric`);
        console.error(`  > ${line.trim()}`);
        violations++;
      }
    }
  }
}

// runnerCapturePotentialScore must NOT carry sourceTiming ENTRY_FINAL — it is a
// LIVE exit-management field, not entry evidence.
{
  const registryPath = join(ROOT, "src/filters/longFilterRegistry.js");
  const registry = readFileSync(registryPath, "utf8");
  // Find any registry block that pairs runnerCapturePotential* with ENTRY_FINAL.
  const runnerBlocks = registry.split(/\{/).filter(b => /runnerCapturePotential/.test(b));
  for (const block of runnerBlocks) {
    if (/ENTRY_FINAL/.test(block)) {
      console.error(`[PURITY FAIL] longFilterRegistry.js — runnerCapturePotential* registered with ENTRY_FINAL timing (must be LIVE/EXIT_MANAGEMENT)`);
      violations++;
    }
  }
}

// ─── §26: REQUIRED ACTIVE IMPORTS ─────────────────────────────────────────────
const REQUIRED_FILTER_IMPORTS = [
  "computeLongFilterCoverage",
  "FilterHealthStrip",
  "FilterCoverageDrawer",
  "ActiveFilterSummary",
];
{
  const filtersDirContent = filterFiles
    .map(f => readFileSync(f, "utf8"))
    .join("\n");
  for (const req of REQUIRED_FILTER_IMPORTS) {
    if (!new RegExp(`import[^\\n]*\\b${req}\\b`).test(filtersDirContent)) {
      console.error(`[PURITY FAIL] required active import missing from filters tree: ${req}`);
      violations++;
    }
  }
}

// ─── BEHAVIORAL SCHEMA PURITY ────────────────────────────────────────────────
// Static greps cannot catch enum drift, source-field drift, timing leakage, or
// unit mismatches. Exercise the canonical registry and selectors directly.

function sameSet(a, b) {
  return a.length === b.length && a.every(value => b.includes(value));
}

{
  const pf10 = getFilterById("LONG_POST_FEE_10_TIER");
  if (!pf10 || !sameSet(pf10.enumValues ?? [], Object.values(LONG_PF10_TIER))) {
    console.error("[PURITY FAIL] Post-Fee tier registry values do not match LONG_PF10_TIER");
    violations++;
  }

  const runner = getFilterById("LONG_CANDIDATE_RUNNER_TIER_AT_ENTRY");
  if (!runner || !sameSet(runner.enumValues ?? [], Object.values(LONG_RUNNER_TIER))) {
    console.error("[PURITY FAIL] Candidate Runner tier registry values do not match LONG_RUNNER_TIER");
    violations++;
  }
}

{
  const forbiddenEntryFields = new Set([
    "cvdLabel", "priceVsVwapLabel", "priceVsVwapPct",
    "longPostFee10Score", "longPostFee10Tier",
    "candidateRunnerScoreAtScan", "candidateRunnerTierAtScan",
    "runnerCapturePotentialScore", "runnerCapturePotentialTier",
    "entryPolicyWouldAllow", "entryPolicyWouldBlock",
  ]);
  for (const filter of LONG_FILTER_REGISTRY) {
    if (filter.entryPredictive === true && filter.timing !== FILTER_TIMING.ENTRY_FINAL) {
      console.error(`[PURITY FAIL] ${filter.id} is entryPredictive but timing=${filter.timing}`);
      violations++;
    }
    if (filter.entryPredictive === true && forbiddenEntryFields.has(filter.field)) {
      console.error(`[PURITY FAIL] ${filter.id} uses legacy/live entry field ${filter.field}`);
      violations++;
    }
    if (
      filter.entryPredictive === true &&
      /^(marketTickForward|marketTickPredictionCorrect|marketTickPredictionResult)/.test(filter.field)
    ) {
      console.error(`[PURITY FAIL] ${filter.id} leaks outcome-only tick field ${filter.field} into ENTRY_FINAL`);
      violations++;
    }
    if (
      /^(marketTickForward|marketTickPredictionCorrect|marketTickPredictionResult)/.test(filter.field) &&
      filter.timing !== FILTER_TIMING.OUTCOME_ONLY
    ) {
      console.error(`[PURITY FAIL] ${filter.id} tick outcome timing=${filter.timing}; expected OUTCOME_ONLY`);
      violations++;
    }
  }
}

{
  const populated = {
    entryResearchSchemaVersion: "LONG_ENTRY_RESEARCH_V4",
    longParentBucket: "TOP_GAINER_LONGS",
    longFilterDataQuality: "COMPLETE",
  };
  for (const filter of LONG_FILTER_REGISTRY) {
    if (filter.entryPredictive === true && filter.timing === FILTER_TIMING.ENTRY_FINAL) {
      populated[filter.field] = null;
    }
  }
  const snapshot = freezeLongFilterSnapshot(populated);
  for (const filter of LONG_FILTER_REGISTRY) {
    if (filter.entryPredictive === true && filter.timing === FILTER_TIMING.ENTRY_FINAL &&
        !Object.prototype.hasOwnProperty.call(snapshot, filter.field)) {
      console.error(`[PURITY FAIL] filter snapshot omits ENTRY_FINAL source field ${filter.field}`);
      violations++;
    }
  }
}

{
  const rawNorm = getLongFilterOutcomePnl(
    { rawNormPnlPct: 1.23, rawMarginPnlPct: 99 },
    PNL_METRIC.RAW_NORMALIZED,
  );
  if (!rawNorm.pnlMetricAvailable || rawNorm.pnlValue !== 1.23) {
    console.error("[PURITY FAIL] RAW_NORMALIZED does not resolve rawNormPnlPct strictly");
    violations++;
  }
}

{
  const canonical = {
    longParentBucket: "TOP_GAINER_LONGS",
    entryCvdLabel: "BULL",
    entryPriceVsVwapLabel: "ABOVE_VWAP",
    longVwapContextLabel: "VWAP_RECLAIM_CONFIRMED",
    longMicroMomentumLabel: "MICRO_GREEN_IMPULSE",
    hasGreenConfirmation: true,
    immediateGreenImpulse: true,
    last3TicksDirection: "UP",
    atrPct: 1,
    spreadPct: 0.05,
  };
  const clean = evaluateBestDnaLongAudit(canonical);
  const polluted = evaluateBestDnaLongAudit({
    ...canonical,
    cvdLabel: "BEAR",
    priceVsVwapLabel: "BELOW_VWAP",
    vwapContextLabel: "VWAP_RECLAIM_FAILURE",
    microMomentumLabel: "MICRO_RED_PRESSURE",
  });
  if (clean.bestDnaLongScore !== polluted.bestDnaLongScore ||
      clean.bestDnaLongTier !== polluted.bestDnaLongTier) {
    console.error("[PURITY FAIL] Best DNA changes when deprecated aliases are added");
    violations++;
  }
}

if (violations > 0) {
  console.error(`\n❌ Long filter purity check FAILED: ${violations} violation(s) found.`);
  process.exit(1);
}

console.log("✅ Long filter purity check passed (static + behavioral).");
process.exit(0);
