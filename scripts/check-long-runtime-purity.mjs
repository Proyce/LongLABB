#!/usr/bin/env node
/**
 * Long Runtime Purity Guard
 *
 * Fails when the active LongLAB runtime imports short-oriented modules or
 * populates primary long fields from short-side sources.
 *
 * Run: node scripts/check-long-runtime-purity.mjs
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC  = join(ROOT, "src");

// ── Banned patterns in the active runtime ──────────────────────────────────
// Allowlist: these are valid market-mechanics terms, NOT ShortLAB strategy terms
const MARKET_MECHANICS_ALLOWLIST = ['SHORT_SQUEEZE', 'shortLiquidation', 'shortInterest', 'shortCovering'];

function isMechanicsContext(line) {
  return MARKET_MECHANICS_ALLOWLIST.some(term => line.includes(term));
}

const BANNED = [
  {
    pattern: /computeAbsoluteEntryScore\b(?!.*cross[Ss]ide|.*archive|.*shortlab)/,
    reason:  "computeAbsoluteEntryScore (short scorer) must not be imported as primary long AES",
    exclude: ["absoluteEntryScore", "crossSideResearch", "archive"],
  },
  // bestDnaAudit.js imports are checked specifically below (allow cross-side imports,
  // but evaluateBestDnaAudit must not be CALLED as a primary scorer)
  // Session quality labels are checked specifically in the app-file section below

  {
    pattern: /continuationShort\s*[^=](?!=)/,
    reason:  "continuationShort must not be used as a primary exit signal in long runtime",
    exclude: ["dynamicExitProfiles", "archive"],
    comment: "dynamicExitProfiles exposes it as a legacy compat alias set to false",
  },
  {
    pattern: /btcLongTailwindScore\s*:\s*.*shortTailwindScore/,
    reason:  "btcLongTailwindScore must not be sourced from shortTailwindScore",
    exclude: ["archive"],
  },
  {
    pattern: /crossMarketShortBiasLabel.*LONG.*header|SHORT.*chip.*LongLab/i,
    reason:  "Primary market bias chip must show LONG not SHORT",
    exclude: ["archive"],
  },
  // ── Section 28 additions ──────────────────────────────────────────────────
  {
    pattern: /\bshortGateScore\b/,
    reason:  "shortGateScore must not be used — use longGateScore or longGateQualityScore",
    exclude: ["archive", "crossSideResearch", "check-long-runtime-purity",
              "longFilterConstants", "longFilterMigration", "longFilterPurity", "longFilterSnapshot",
              "sniperShortGateLogOnly"],
  },
  {
    pattern: /\bshortGateWouldPass\b/,
    reason:  "shortGateWouldPass must not be used — use longGateWouldPass or longGateEligibility",
    exclude: ["archive", "crossSideResearch", "check-long-runtime-purity",
              "candidateRunner"],
  },
  {
    pattern: /\bsniperShortTier\b/,
    reason:  "sniperShortTier must not be used — use sniperLongTier",
    exclude: ["archive", "crossSideResearch", "check-long-runtime-purity",
              "entryPolicyLogOnly.flatten", "sniperShortGateLogOnly"],
  },
  {
    pattern: /\bsniperShortWouldPass\b/,
    reason:  "sniperShortWouldPass must not be used — use sniperLongWouldPass",
    exclude: ["archive", "crossSideResearch", "check-long-runtime-purity",
              "entryPolicyLogOnly.flatten", "sniperShortGateLogOnly"],
  },
  {
    pattern: /\bbtcShortContextLabel\b/,
    reason:  "btcShortContextLabel must not be used — use btcLongContextLabel",
    exclude: ["archive", "crossSideResearch", "check-long-runtime-purity",
              "longFilterConstants", "longFilterMigration", "longFilterPurity",
              "aesDiscoveryShadowEngine"],
  },
  {
    pattern: /\btopGainerExhaustionAuditLabel\b/,
    reason:  "topGainerExhaustionAuditLabel must not be used — use topGainerContinuationAuditLabel",
    exclude: ["archive", "crossSideResearch", "check-long-runtime-purity",
              "topGainerExhaustionAudit"],
  },
  {
    pattern: /\bshowOnlyNoGreen\b/,
    reason:  "showOnlyNoGreen is a ShortLAB UI filter — removed from LongLAB",
    exclude: ["archive", "check-long-runtime-purity",
              "longFilterConstants", "longFilterMigration"],
  },
  {
    pattern: /\bshowOnlyCvdBearNeut\b/,
    reason:  "showOnlyCvdBearNeut is a ShortLAB UI filter — removed from LongLAB",
    exclude: ["archive", "check-long-runtime-purity",
              "longFilterConstants", "longFilterMigration"],
  },
  {
    pattern: /\bminShortGateScore\b/,
    reason:  "minShortGateScore is a ShortLAB control — use minLongGateScore",
    exclude: ["archive", "check-long-runtime-purity", "check-long-filter-purity",
              "longFilterConstants", "longFilterMigration"],
  },
  {
    pattern: /["']SHORT_BREATH_(CLEAR|CONTROLLED|MIXED_OK|STRICT|BOUNCE_TRAP_RISK|HARD_DANGER)["']/,
    reason:  "SHORT_BREATH_* labels must not be emitted in LongLAB — use LONG_BREADTH_* labels",
    exclude: ["archive", "crossSideResearch", "marketBreathLogOnly", "check-long-runtime-purity",
              "sniperShortGateLogOnly"],
  },
  {
    pattern: /["']TOP_GAINER_HOT_PUMP_FADE_SHORT["']/,
    reason:  "TOP_GAINER_HOT_PUMP_FADE_SHORT is a ShortLAB label",
    exclude: ["archive", "crossSideResearch", "check-long-runtime-purity",
              "topGainerExhaustionAudit"],
  },
  {
    pattern: /["']TOP_GAINER_FAILED_BREAKOUT_SHORT["']/,
    reason:  "TOP_GAINER_FAILED_BREAKOUT_SHORT is a ShortLAB label",
    exclude: ["archive", "crossSideResearch", "check-long-runtime-purity",
              "topGainerExhaustionAudit"],
  },
  {
    pattern: /from ['"]\.\.\/longAudits\/shortPressureDangerLogOnly/,
    reason:  "Active code must import from longEntryDangerAuditLogOnly, not shortPressureDangerLogOnly",
    exclude: ["archive", "crossSideResearch", "shortPressureDangerLogOnly.test", "check-long-runtime-purity"],
  },
  {
    pattern: /from ['"]\.\.\/marketRegime\/marketBreathLogOnly/,
    reason:  "Active code must import from longMarketBreadthLogOnly, not marketBreathLogOnly",
    exclude: ["archive", "crossSideResearch", "marketBreathLogOnly.test", "check-long-runtime-purity"],
  },
];

// ── Files to scan ──────────────────────────────────────────────────────────

function getAllJsFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!["node_modules", ".git", "dist"].includes(entry)) {
        getAllJsFiles(full, results);
      }
    } else if (/\.(js|jsx|mjs)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

// ── Active runtime files (not archive/crossSide/test files) ───────────────

const ARCHIVE_DIRS = ["archive", "shortlab-reference", "crossSideResearch"];

function isArchiveFile(filePath) {
  const rel = relative(SRC, filePath).replace(/\\/g, "/");
  if (ARCHIVE_DIRS.some(d => rel.startsWith(d))) return true;
  // Exclude test files and the short scorer from broad pattern scans
  if (rel.endsWith(".test.js") || rel.endsWith(".test.jsx")) return true;
  // Short scorer is allowed to keep its own terms
  if (rel.startsWith("scoring/absoluteEntryScore")) return true;
  if (rel.startsWith("scoring/postFee10")) return true;
  if (rel.startsWith("audits/bestDnaAudit")) return true;
  return false;
}

// ── Specific file checks ───────────────────────────────────────────────────

function checkAppFile(filePath, content) {
  const violations = [];
  const rel = relative(ROOT, filePath).replace(/\\/g, "/");

  for (const ban of BANNED) {
    const excluded = ban.exclude?.some(e => filePath.includes(e));
    if (excluded) continue;

    if (ban.pattern.test(content)) {
      violations.push({ file: rel, reason: ban.reason });
    }
  }
  return violations;
}

// ── Main ───────────────────────────────────────────────────────────────────

const files = getAllJsFiles(SRC).filter(f => !isArchiveFile(f));
let totalViolations = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const vs = checkAppFile(file, content);
  totalViolations = totalViolations.concat(vs);
}

// ── Specific checks for primary app file ──────────────────────────────────

const appFile = join(SRC, "app", "LongLabApp.jsx");
const appContent = readFileSync(appFile, "utf8");

// ── §26: builder is the sole research owner ───────────────────────────────
// LongLabApp.jsx and the entry adapters must NOT import scorer functions
// directly. The only allowed research owner is buildLongEntryResearchSnapshot.js.
const FORBIDDEN_SCORER_IMPORTS = [
  "computeLongAbsoluteEntryScoreV1",
  "computeLongEntryDangerAuditLogOnly",
  "computeLongMarketBreadthLogOnly",
  "evaluateBestDnaLongAudit",
  "scoreLongCandidateRunner",
  "scoreLongPostFee10Entry",
  "evaluateSniperLongGateLogOnly",
  "evaluateLongCombos",
  "freezeLongFilterSnapshot",
  "evaluateEntryPolicy",
  "evaluateEntryPolicyLogOnly",
  "computeAdaptiveAes",
];

// Extract just the import section (top-of-file import statements) to avoid
// flagging string mentions in comments or unrelated identifiers.
function extractImportBlock(content) {
  return content
    .split("\n")
    .filter(l => /^\s*import\b/.test(l) || /^\s*[A-Za-z0-9_]+,?\s*$/.test(l))
    .join("\n");
}

const PURITY_OWNED_FILES = [
  { rel: "src/app/LongLabApp.jsx", abs: join(SRC, "app", "LongLabApp.jsx") },
  { rel: "src/research/buildManualResearchTrade.js", abs: join(SRC, "research", "buildManualResearchTrade.js") },
  { rel: "src/research/buildBatchResearchTrade.js", abs: join(SRC, "research", "buildBatchResearchTrade.js") },
];

for (const { rel, abs } of PURITY_OWNED_FILES) {
  let src;
  try { src = readFileSync(abs, "utf8"); } catch { continue; }
  const imports = extractImportBlock(src);
  for (const fn of FORBIDDEN_SCORER_IMPORTS) {
    if (new RegExp(`\\b${fn}\\b`).test(imports)) {
      totalViolations.push({
        file: rel,
        reason: `§26: ${fn} must not be imported directly — buildLongEntryResearchSnapshot.js is the sole research owner`,
      });
    }
  }
}

// The builder MUST own the scorers (sanity: it imports the AES scorer).
if (!appContent.includes("buildResearchEnrichedTrade")) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Active app must route entry research through buildResearchEnrichedTrade",
  });
}

// Fail when active runtime imports SHORT-named research universe modules.
for (const file of files) {
  const c = readFileSync(file, "utf8");
  if (/\bbuildFullShortUniverse\b/.test(c)) {
    totalViolations.push({
      file: relative(ROOT, file).replace(/\\/g, "/"),
      reason: "§26: buildFullShortUniverse (SHORT-named research module) must not be imported in active long runtime",
    });
  }
}

// evaluateBestDnaAudit (short) must not be called as primary scorer — only cross-side imports allowed
const shortBestDnaCallPattern = /evaluateBestDnaAudit\s*\(/;
if (shortBestDnaCallPattern.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "evaluateBestDnaAudit (short) must not be CALLED in active long runtime — use evaluateBestDnaLongAudit",
  });
}

// Must not have short session quality labels as return values or color selectors
if (/"SHORT_FRIENDLY_CANDIDATE"/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "SHORT_FRIENDLY_CANDIDATE must not appear as a session quality label in active runtime",
  });
}
if (/"BOUNCE_TRAP_CANDIDATE"/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "BOUNCE_TRAP_CANDIDATE must not appear as a session quality label in active runtime",
  });
}

// MarketRegimeHeader must show LONG chip not SHORT
const headerFile = join(SRC, "components", "MarketRegimeHeader.jsx");
const headerContent = readFileSync(headerFile, "utf8");
if (headerContent.includes("SHORT{shortScore") || headerContent.includes(">SHORT<")) {
  totalViolations.push({
    file: "src/components/MarketRegimeHeader.jsx",
    reason: "Market bias chip must say LONG not SHORT",
  });
}
if (!headerContent.includes("crossMarketLongTailwindScore") && !headerContent.includes("longScore")) {
  totalViolations.push({
    file: "src/components/MarketRegimeHeader.jsx",
    reason: "Market bias chip must read from crossMarketLongTailwindScore",
  });
}

// feeAccounting must use addition for long floor price
const feeFile = join(SRC, "fees", "feeAccounting.js");
const feeContent = readFileSync(feeFile, "utf8");
if (feeContent.includes("1 - pricePct / 100") || feeContent.includes("(1-pricePct/100)")) {
  totalViolations.push({
    file: "src/fees/feeAccounting.js",
    reason: "Long floor price must use (1 + pricePct/100) not subtraction",
  });
}

// dynamicExitProfiles must use currentPrice - entryPrice for priceFavorPct
const exitFile = join(SRC, "exitProfiles", "dynamicExitProfiles.js");
const exitContent = readFileSync(exitFile, "utf8");
if (exitContent.includes("(entryPrice - currentPrice) / entryPrice")) {
  totalViolations.push({
    file: "src/exitProfiles/dynamicExitProfiles.js",
    reason: "priceFavorPct must use (currentPrice - entryPrice) for longs",
  });
}

// ── Layer 1: Forbidden active imports in LongLabApp ───────────────────────

// Must NOT call applyPostFee10EntryScoring in the entry lifecycle (short scorer call)
if (/applyPostFee10EntryScoring\s*\(/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Layer 1: applyPostFee10EntryScoring (short entry scorer) must not be called — entry lifecycle must use long-native bestDnaLongAudit",
  });
}
// Must NOT call calculatePostFee10EntryAssessment as primary entry scoring
if (/calculatePostFee10EntryAssessment\s*\(/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Layer 1: calculatePostFee10EntryAssessment (short scorer) must not be called in primary entry lifecycle",
  });
}

// Must NOT import computeRunnerCapturePotential (short runner) as primary scorer
if (/computeRunnerCapturePotential\s*\(/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Layer 1: computeRunnerCapturePotential (short) must not be called as primary — use computeLongRunnerCaptureAudit",
  });
}

// Must NOT use crossMarketShortBiasLabel in adaptive AES or entry policy
const adaptiveAesFile = join(SRC, "entryPolicy", "adaptiveAes.js");
const adaptiveAesContent = readFileSync(adaptiveAesFile, "utf8");
if (adaptiveAesContent.includes("crossMarketShortBiasLabel") || adaptiveAesContent.includes("shortBiasAdjustments")) {
  totalViolations.push({
    file: "src/entryPolicy/adaptiveAes.js",
    reason: "Layer 1: adaptiveAes.js must use crossMarketLongBiasLabel/longBiasAdjustments not short variants",
  });
}

// Must NOT use short bias in AES discovery shadow engine
const shadowEngineFile = join(SRC, "aesDiscovery", "aesDiscoveryShadowEngine.js");
const shadowEngineContent = readFileSync(shadowEngineFile, "utf8");
if (shadowEngineContent.includes("checkUniversalShortGate")) {
  totalViolations.push({
    file: "src/aesDiscovery/aesDiscoveryShadowEngine.js",
    reason: "Layer 1: Shadow engine must use checkUniversalLongGate not checkUniversalShortGate",
  });
}

// ── Layer 4: Schema contract — UI field mappings must use long-native names ─

// LongLabApp must not read short-era scoring field names as primary UI values
if (/exact\?\.postFee10PotentialScoreV2|preview\.postFee10PotentialScoreV2/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Layer 4: UI must read longPostFee10EntryScore not postFee10PotentialScoreV2",
  });
}
if (/exact\?\.bestDnaScore\b|preview\.bestDnaScore\b/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Layer 4: UI must read bestDnaLongScore not bestDnaScore",
  });
}

// Ticker preview must read CANONICAL entry fields, not the legacy aliases.
if (/exact\?\.longPostFee10Score\b|preview\.longPostFee10Score\b/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Layer 4: ticker preview must read longPostFee10EntryScore, not longPostFee10Score",
  });
}
if (/candidateRunnerScoreAtScan\b|exact\?\.candidateRunnerScore\b|exact\?\.candidateRunnerTier\b/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Layer 4: runner preview must read longCandidateRunnerScoreAtEntry/TierAtEntry, not legacy scan fields",
  });
}
if (/\.filter\(\s*s\s*=>\s*s\.postFee10EntryScore\b/.test(appContent)) {
  totalViolations.push({
    file: "src/app/LongLabApp.jsx",
    reason: "Layer 4: postFee10BySymbol must filter on longPostFee10EntryScore, not postFee10EntryScore",
  });
}

// FiltersTab must use long-native sort/filter fields
const filtersTabFile = join(SRC, "filters", "FiltersTab.jsx");
const filtersTabContent = readFileSync(filtersTabFile, "utf8");
if (/"bestDnaScore"/.test(filtersTabContent) || /"postFee10PotentialScoreV2"/.test(filtersTabContent)) {
  totalViolations.push({
    file: "src/filters/FiltersTab.jsx",
    reason: "Layer 4: FiltersTab column definitions must use bestDnaLongScore and longPostFee10EntryScore",
  });
}

// filterAnalytics must filter on long-native fields
const filterAnalyticsFile = join(SRC, "filters", "filterAnalytics.js");
const filterAnalyticsContent = readFileSync(filterAnalyticsFile, "utf8");
if (/t\.bestDnaScore\b/.test(filterAnalyticsContent)) {
  totalViolations.push({
    file: "src/filters/filterAnalytics.js",
    reason: "Layer 4: filterAnalytics must filter on bestDnaLongScore not bestDnaScore",
  });
}
if (/t\.postFee10PotentialScoreV2\b/.test(filterAnalyticsContent)) {
  totalViolations.push({
    file: "src/filters/filterAnalytics.js",
    reason: "Layer 4: filterAnalytics must filter on longPostFee10EntryScore not postFee10PotentialScoreV2",
  });
}

// Genuine tick-direction fields are observatory-only. Execution-facing gates,
// scorers, policies, sizing, and exit selectors must not consume them.
const TICK_EXECUTION_GUARD_PATHS = [
  "src/longGate",
  "src/scoring/longAbsoluteEntryScore",
  "src/scoring/longCandidateRunner",
  "src/scoring/longPostFee10",
  "src/entryPolicy",
  "src/exitProfiles",
  "src/lifecycle/openPositionLifecycle.js",
  "src/lifecycle/profitLockStrategy.js",
  "src/lifecycle/profitLockProtection.js",
];
for (const relativePath of TICK_EXECUTION_GUARD_PATHS) {
  const absolutePath = join(ROOT, relativePath);
  let guardedFiles = [];
  try {
    guardedFiles = statSync(absolutePath).isDirectory() ? getAllJsFiles(absolutePath) : [absolutePath];
  } catch {
    continue;
  }
  for (const file of guardedFiles.filter(path => !path.includes(".test."))) {
    const content = readFileSync(file, "utf8");
    if (/\b(?:marketTick|entryTick|highAtrDirectionalOpportunity)/.test(content)) {
      totalViolations.push({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        reason: "Tick-direction research fields must not influence execution-facing gates, scorers, policies, sizing, or exits",
      });
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

if (totalViolations.length === 0) {
  console.log("✓ Long runtime purity: PASS — no short-legacy violations found");
  process.exit(0);
} else {
  console.error(`✗ Long runtime purity: FAIL — ${totalViolations.length} violation(s)\n`);
  for (const v of totalViolations) {
    console.error(`  [${v.file}]`);
    console.error(`    → ${v.reason}\n`);
  }
  process.exit(1);
}
