import { useState, useMemo, useEffect, useCallback } from "react";
import {
  summarizeByField,
  summarizeByArrayField,
  buildRunFilterSummary,
} from "./filterAnalytics.js";
import { applyLongFilterState } from "./longFilterEngine.js";
import {
  DEFAULT_LONG_FILTER_STATE,
  makeFilterGroup,
  makePredicate,
  countActivePredicates,
  resetFilterState,
  GROUP_OPERATOR,
  GROUP_JOIN,
  RESEARCH_COCKPIT_STORAGE_KEY,
} from "./longFilterState.js";
import HighlightTab from "./HighlightTab.jsx";
import WinningSetupsPanel, { WinningQuickViewStrip } from "./components/WinningSetupsPanel.jsx";
import CockpitToolsPanel from "./components/CockpitToolsPanel.jsx";
import { ExplainMatchDrawer } from "./components/ExplainMatchDrawer.jsx";
import { deserializeFilterStateFromURL, serializeFilterStateToURL } from "./longFilterState.js";
import { LONG_FILTER_REGISTRY, getFilterById } from "./longFilterRegistry.js";
import { OPERATOR, FILTER_TIMING } from "./longFilterConstants.js";
import { LONG_PF10_TIER } from "../scoring/longPostFee10/longPostFee10.constants.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";
import { LONG_RUNNER_TIER } from "../scoring/longCandidateRunner/longCandidateRunner.constants.js";
import { FilterBuilder } from "./components/FilterBuilder.jsx";
import { computeLongFilterCoverage, buildCoverageSummary } from "./longFilterCoverage.js";
import { FilterHealthStrip } from "./components/FilterHealthStrip.jsx";
import { FilterCoverageDrawer } from "./components/FilterCoverageDrawer.jsx";
import { ActiveFilterSummary } from "./components/ActiveFilterSummary.jsx";
import { SmartTable, EmptyState, usePaginator, Pager } from "../SmartTable.jsx";
import { createWinningSetupFilterState, clearWinningSetupFilterState } from "./longWinningSetups.js";
import TickDirectionLabPanel from "../tickDirection/TickDirectionLabPanel.jsx";

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
import { color as _tk, font as _tkFont } from "../ui/tokens.js";

const C = {
  bg:       _tk.bg,
  surface:  _tk.surface,
  border:   _tk.border,
  borderLo: _tk.borderLo,
  text:     _tk.text,
  textSub:  _tk.textSub,
  textDim:  _tk.textDim,
  pass:     _tk.long,
  fail:     _tk.short,
  blue:     _tk.info,
  amber:    _tk.warn,
  green:    _tk.long,
  red:      _tk.short,
  muted:    _tk.textDim,
};

const mono = _tkFont.mono;

// ─── UTILS ───────────────────────────────────────────────────────────────────

const f2     = n => Number(n).toFixed(2);
const pct    = n => `${n >= 0 ? "+" : ""}${f2(n)}%`;
const pnlCol = n => n >= 0 ? C.green : C.red;
const clean  = s => String(s ?? "").replace(/_/g, " ");
const shortLabel = (s, prefix) => clean(s).replace(new RegExp("^" + prefix.replace(/_/g, " ") + " ", "i"), "");

function getTradeClosedPnl(t) {
  return typeof t.feeAdjustedNormPnlPct === "number"
    ? t.feeAdjustedNormPnlPct
    : null;
}

function buildVisiblePnlStats(trades) {
  const pnls = trades
    .map(t => getTradeClosedPnl(t))
    .filter(v => v !== null);
  const n = pnls.length;
  const net = pnls.reduce((s, v) => s + v, 0);
  const sorted = [...pnls].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = !n ? null : n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const wins = pnls.filter(v => v > 0).length;
  const losses = n - wins;
  const sl = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS).length;
  const locks = trades.filter(t => t.closeReason === "PROFIT_LOCK").length;
  const trails = trades.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.TRAILING_EXIT).length;
  return {
    trades: n,
    net,
    avg: n ? net / n : null,
    median,
    winRate: n ? wins / n * 100 : null,
    wins,
    losses,
    best: n ? Math.max(...pnls) : null,
    worst: n ? Math.min(...pnls) : null,
    sl,
    locks,
    trails,
  };
}

// ─── BASE COMPONENTS ─────────────────────────────────────────────────────────

function Pill({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
      padding: "4px 9px", borderRadius: 3, cursor: "pointer",
      background: on ? "#152050" : C.surface,
      color:      on ? C.blue    : C.textSub,
      border:     `1px solid ${on ? "#3366cc" : C.border}`,
      transition: "all 0.1s",
    }}>{children}</button>
  );
}

function DangerPill({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
      padding: "4px 9px", borderRadius: 3, cursor: "pointer",
      background: on ? "#2a0f0f" : C.surface,
      color:      on ? "#ff8877"  : C.textSub,
      border:     `1px solid ${on ? "#883322" : C.border}`,
    }}>{children}</button>
  );
}

function SectionHead({ children }) {
  return (
    <div style={{
      fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 2,
      color: C.textSub, textTransform: "uppercase",
      borderBottom: `1px solid ${C.border}`, paddingBottom: 5, marginBottom: 10,
    }}>{children}</div>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
      padding: "9px 13px", minWidth: 110,
    }}>
      <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: color ?? C.text }}>{value}</div>
      {sub && <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PassBadge({ pass }) {
  if (pass === undefined || pass === null) return <span style={{ color: C.textDim }}>—</span>;
  return (
    <span style={{
      fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1,
      borderRadius: 3, padding: "1px 6px",
      background: pass ? "#0f3022" : "#2a0f0f",
      color:      pass ? C.pass    : C.fail,
      border:     `1px solid ${pass ? "#226644" : "#883322"}`,
    }}>{pass ? "PASS" : "FAIL"}</span>
  );
}

function WarnBadge({ label }) {
  return (
    <span style={{
      fontFamily: mono, fontSize: 8, letterSpacing: 0.5, borderRadius: 3,
      padding: "1px 5px", marginRight: 3, marginBottom: 2,
      display: "inline-block",
      background: "#2a1800", color: C.amber, border: `1px solid #664400`,
    }}>{clean(label)}</span>
  );
}

function compactScoreTier(tier) {
  if (!tier) return "-";
  if (String(tier).includes("ELITE")) return "E";
  if (String(tier).includes("SNIPER")) return "S";
  if (String(tier).includes("HIGH")) return "H";
  if (String(tier).includes("CANDIDATE")) return "C";
  if (String(tier).includes("WATCH")) return "W";
  return "L";
}

function scoreTip({ title, tier, positives, penalties, labels }) {
  return [
    `${title} | ${tier ?? "-"}`,
    labels?.length ? `Labels: ${labels.join(", ")}` : null,
    positives?.length ? `Positive: ${positives.join(", ")}` : null,
    penalties?.length ? `Penalty: ${penalties.join(", ")}` : null,
  ].filter(Boolean).join("\n");
}

function DnaScoreCell({ score, tier, title, positives = [], penalties = [], labels = [] }) {
  if (score == null) return <span style={{ color: C.textDim }}>—</span>;
  const color = absScoreColor(score);
  return (
    <span title={scoreTip({ title, tier, positives, penalties, labels })} style={{
      fontFamily: mono,
      fontSize: 11,
      fontWeight: 900,
      color,
      border: `1px solid ${color}55`,
      background: `${color}14`,
      borderRadius: 3,
      padding: "2px 6px",
      cursor: "default",
      whiteSpace: "nowrap",
    }}>
      {score} {compactScoreTier(tier)}
    </span>
  );
}

function absScoreColor(score) {
  if (score == null) return "#445566";
  const s = Math.max(0, Math.min(100, score));
  let hue;
  if (s <= 35)       hue = (s / 35) * 6;
  else if (s <= 60)  hue = 6 + ((s - 35) / 25) * 26;
  else if (s <= 80)  hue = 32 + ((s - 60) / 20) * 58;
  else               hue = 90 + ((s - 80) / 20) * 50;
  const lightness = s === 0 ? 58 : 52;
  return `hsl(${Math.round(hue)}, 100%, ${lightness}%)`;
}

// ─── ANALYTICS TABLE ─────────────────────────────────────────────────────────

function CompactMetric({ label, value, color, sub }) {
  return (
    <div style={{
      minWidth: 74, padding: "3px 8px", borderRadius: 3,
      background: C.bg, border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontFamily: mono, fontSize: 7, color: C.textDim, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 800, color: color ?? C.text, lineHeight: 1.25 }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: mono, fontSize: 7, color: C.textDim, lineHeight: 1.1 }}>{sub}</div>}
    </div>
  );
}

const AUDIT_BASE_COLS = [
  { key: "key",          label: "Label",   width: 190, sortValue: r => r.key,
    render: r => <span style={{ color: C.text, fontWeight: 600 }}>{clean(r.key)}</span> },
  { key: "trades",       label: "Trades",  width: 68,  sortValue: r => r.trades,
    render: r => <span style={{ color: C.textSub }}>{r.trades}</span> },
  { key: "netPnl",       label: "Net PnL", width: 82,  sortValue: r => r.netPnl,
    render: r => <span style={{ color: pnlCol(r.netPnl), fontWeight: 700 }}>{pct(r.netPnl)}</span> },
  { key: "avgPnl",       label: "Avg",     width: 75,  sortValue: r => r.avgPnl,
    render: r => <span style={{ color: pnlCol(r.avgPnl) }}>{pct(r.avgPnl)}</span> },
  { key: "medianPnl",    label: "Median",  width: 75,  sortValue: r => r.medianPnl,
    render: r => <span style={{ color: pnlCol(r.medianPnl) }}>{pct(r.medianPnl)}</span> },
  { key: "winRate",      label: "Win %",   width: 62,  sortValue: r => r.winRate,
    render: r => <span style={{ color: r.winRate >= 50 ? C.green : C.red }}>{r.winRate}%</span> },
  { key: "slRate",       label: "SL %",    width: 62,  sortValue: r => r.slRate,
    render: r => <span style={{ color: r.slRate > 40 ? C.red : C.textSub }}>{r.slRate}%</span> },
  { key: "lockToSlRatio",label: "Lock:SL", width: 68,  sortValue: r => r.lockToSlRatio,
    render: r => <span style={{ color: r.lockToSlRatio >= 1 ? C.pass : "#cc7744", fontWeight: 700 }}>{r.lockToSlRatio}</span> },
];

function AuditTable({ rows, closedSamples, extraCols = [] }) {
  const columns = useMemo(() => [
    ...AUDIT_BASE_COLS,
    ...extraCols.map(c => ({
      key: c.key, label: c.label, width: 82, sortValue: null,
      render: r => <span style={{ color: C.textSub }}>{c.render(r, closedSamples)}</span>,
    })),
  ], [extraCols, closedSamples]);

  return (
    <SmartTable
      columns={columns}
      rows={rows ?? []}
      rowKey={r => r.key}
      emptyMsg="No data yet. Labels populate after entry telemetry resolves."
    />
  );
}

const TH = {
  color: C.textDim, fontWeight: 700, textAlign: "left",
  padding: "5px 8px", borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap", fontSize: 9,
};
const TD = { padding: "5px 8px", verticalAlign: "middle" };

// ─── FILTER BAR ──────────────────────────────────────────────────────────────

const QUICK_FILTER_DEFAULTS = {
  showOnlyWouldPass: false,
  showOnlyWouldFail: false,
  showOnlyProfit: false,
  showOnlyLoss: false,
  showOnlySL: false,
  showOnlyProfitLock: false,
  showOnlyTrail: false,
  showOnlyTimeout: false,
  showOnlyProfitLockBelowFloor: false,
  showOnlyFailedBreakout: false,
  showOnlyLongGatePass: false,
  showOnlyGreenConfirm: false,
  showOnlyCvdBull: false,
  showOnlyContinuationPass: false,
  showOnlyRunBest1Norm: false,
  showOnlyRunBest3Norm: false,
  showOnlyPostFee10Plus: false,
  showOnlyNorm2Plus: false,
  minBestDnaScore: undefined,
  minPostFee10PotentialScore: undefined,
  minCandidateRunnerScore: undefined,
  minAtrPct: undefined,
  selectedBestDnaTiers: [],
  selectedPostFee10PotentialTiers: [],
  selectedCandidateRunnerTiers: [],
  requiredBestDnaSetupLabels: [],
  excludedBestDnaDangerLabels: [],
};

function quickFilterActiveCount(quick) {
  return Object.keys(QUICK_FILTER_DEFAULTS).reduce((n, k) => {
    const def = QUICK_FILTER_DEFAULTS[k];
    const cur = quick[k];
    if (Array.isArray(def)) return n + (cur?.length > 0 ? 1 : 0);
    return n + (cur !== def ? 1 : 0);
  }, 0);
}

function quickFiltersToPredicates(quick) {
  const p = (filterId, operator, value) => ({ filterId, operator, value, source: "quick" });
  const preds = [];
  if (quick.showOnlyWouldPass || quick.showOnlyLongGatePass)
    preds.push(p("LONG_GATE_PASS", OPERATOR.IS_TRUE));
  if (quick.showOnlyWouldFail)
    preds.push(p("LONG_GATE_PASS", OPERATOR.IS_FALSE));
  if (quick.showOnlyProfit)
    preds.push(p("FEE_ADJUSTED_NORM_PNL_PCT", OPERATOR.GTE, 0));
  if (quick.showOnlyLoss)
    preds.push(p("FEE_ADJUSTED_NORM_PNL_PCT", OPERATOR.LTE, 0));
  if (quick.showOnlySL)
    preds.push(p("CLOSE_REASON", OPERATOR.IN, ["SL"]));
  if (quick.showOnlyProfitLock)
    preds.push(p("CLOSE_REASON", OPERATOR.IN, ["PROFIT_LOCK"]));
  if (quick.showOnlyTrail)
    preds.push(p("CLOSE_REASON", OPERATOR.IN, ["TRAIL"]));
  if (quick.showOnlyTimeout)
    preds.push(p("CLOSE_REASON", OPERATOR.IN, ["TIMEOUT"]));
  if (quick.showOnlyProfitLockBelowFloor)
    preds.push(p("PROFIT_LOCK_EXIT_BELOW_FLOOR", OPERATOR.IS_TRUE));
  if (quick.showOnlyGreenConfirm)
    preds.push(p("HAS_GREEN_CONFIRMATION", OPERATOR.IS_TRUE));
  if (quick.showOnlyCvdBull)
    preds.push(p("CVD_LABEL", OPERATOR.IN, ["BULL"]));
  if (quick.showOnlyContinuationPass)
    preds.push(p("TOP_GAINER_CONTINUATION_WOULD_PASS", OPERATOR.IS_TRUE));
  if (quick.showOnlyRunBest1Norm)
    preds.push(p("IS_RUN_BEST_1_NORM", OPERATOR.IS_TRUE));
  if (quick.showOnlyRunBest3Norm)
    preds.push(p("IS_RUN_BEST_3_NORM", OPERATOR.IS_TRUE));
  if (quick.showOnlyPostFee10Plus)
    preds.push(p("IS_POST_FEE_10_PLUS_WINNER", OPERATOR.IS_TRUE));
  if (quick.showOnlyNorm2Plus)
    preds.push(p("IS_NORM_2_PLUS_WINNER", OPERATOR.IS_TRUE));
  if (quick.showOnlyFailedBreakout)
    preds.push(p("FAILED_BREAKDOWN_1M", OPERATOR.IS_TRUE));
  if (quick.minBestDnaScore != null)
    preds.push(p("BEST_DNA_LONG_SCORE", OPERATOR.GTE, quick.minBestDnaScore));
  if (quick.minPostFee10PotentialScore != null)
    preds.push(p("LONG_POST_FEE_10_SCORE", OPERATOR.GTE, quick.minPostFee10PotentialScore));
  if (quick.minCandidateRunnerScore != null)
    preds.push(p("LONG_CANDIDATE_RUNNER_SCORE_AT_ENTRY", OPERATOR.GTE, quick.minCandidateRunnerScore));
  if (quick.minAtrPct != null)
    preds.push(p("ATR_PCT", OPERATOR.GTE, quick.minAtrPct));
  if (quick.selectedBestDnaTiers?.length)
    preds.push(p("BEST_DNA_LONG_TIER", OPERATOR.IN, quick.selectedBestDnaTiers));
  if (quick.selectedPostFee10PotentialTiers?.length)
    preds.push(p("LONG_POST_FEE_10_TIER", OPERATOR.IN, quick.selectedPostFee10PotentialTiers));
  if (quick.selectedCandidateRunnerTiers?.length)
    preds.push(p("LONG_CANDIDATE_RUNNER_TIER_AT_ENTRY", OPERATOR.IN, quick.selectedCandidateRunnerTiers));
  if (quick.requiredBestDnaSetupLabels?.length)
    preds.push(p("BEST_DNA_LONG_POSITIVE_GENES", OPERATOR.INCLUDES_ALL, quick.requiredBestDnaSetupLabels));
  if (quick.excludedBestDnaDangerLabels?.length)
    preds.push(p("BEST_DNA_LONG_PENALTY_GENES", OPERATOR.INCLUDES_NONE, quick.excludedBestDnaDangerLabels));
  return preds;
}

const QUICK_GROUP_ID = "quick-filters";

function buildEngineState(filterState, quick) {
  const baseGroups = (filterState.groups ?? []).filter(group => group.id !== QUICK_GROUP_ID);
  const baseOutcome = (filterState.outcomeFilters ?? []).filter(predicate => predicate.source !== "quick");
  const preds = quickFiltersToPredicates(quick);
  const entryPredicates = preds.filter(predicate => getFilterById(predicate.filterId)?.timing === FILTER_TIMING.ENTRY_FINAL);
  const outcomePredicates = preds.filter(predicate => {
    const timing = getFilterById(predicate.filterId)?.timing;
    return timing === FILTER_TIMING.EXIT_FINAL || timing === FILTER_TIMING.OUTCOME_ONLY;
  });
  const groups = entryPredicates.length
    ? [makeFilterGroup({ id: QUICK_GROUP_ID, operator: GROUP_JOIN.ALL_OF, predicates: entryPredicates }), ...baseGroups]
    : baseGroups;
  return { ...filterState, groups, outcomeFilters: [...outcomePredicates, ...baseOutcome] };
}

function quickPredicatesToFilters(predicates = []) {
  const quick = { ...QUICK_FILTER_DEFAULTS };
  for (const pred of predicates) {
    const { filterId, operator, value } = pred;
    if (filterId === "LONG_GATE_PASS" && operator === OPERATOR.IS_TRUE) quick.showOnlyWouldPass = true;
    else if (filterId === "LONG_GATE_PASS" && operator === OPERATOR.IS_FALSE) quick.showOnlyWouldFail = true;
    else if (filterId === "FEE_ADJUSTED_NORM_PNL_PCT" && operator === OPERATOR.GTE && value === 0) quick.showOnlyProfit = true;
    else if (filterId === "FEE_ADJUSTED_NORM_PNL_PCT" && operator === OPERATOR.LTE && value === 0) quick.showOnlyLoss = true;
    else if (filterId === "CLOSE_REASON" && Array.isArray(value) && value.length === 1 && value[0] === "SL") quick.showOnlySL = true;
    else if (filterId === "CLOSE_REASON" && Array.isArray(value) && value.length === 1 && value[0] === "PROFIT_LOCK") quick.showOnlyProfitLock = true;
    else if (filterId === "CLOSE_REASON" && Array.isArray(value) && value.length === 1 && value[0] === "TRAIL") quick.showOnlyTrail = true;
    else if (filterId === "CLOSE_REASON" && Array.isArray(value) && value.length === 1 && value[0] === "TIMEOUT") quick.showOnlyTimeout = true;
    else if (filterId === "PROFIT_LOCK_EXIT_BELOW_FLOOR") quick.showOnlyProfitLockBelowFloor = true;
    else if (filterId === "FAILED_BREAKDOWN_1M") quick.showOnlyFailedBreakout = true;
    else if (filterId === "HAS_GREEN_CONFIRMATION") quick.showOnlyGreenConfirm = true;
    else if (filterId === "CVD_LABEL") quick.showOnlyCvdBull = true;
    else if (filterId === "TOP_GAINER_CONTINUATION_WOULD_PASS") quick.showOnlyContinuationPass = true;
    else if (filterId === "IS_RUN_BEST_1_NORM") quick.showOnlyRunBest1Norm = true;
    else if (filterId === "IS_RUN_BEST_3_NORM") quick.showOnlyRunBest3Norm = true;
    else if (filterId === "IS_POST_FEE_10_PLUS_WINNER") quick.showOnlyPostFee10Plus = true;
    else if (filterId === "IS_NORM_2_PLUS_WINNER") quick.showOnlyNorm2Plus = true;
    else if (filterId === "BEST_DNA_LONG_SCORE") quick.minBestDnaScore = value;
    else if (filterId === "LONG_POST_FEE_10_SCORE") quick.minPostFee10PotentialScore = value;
    else if (filterId === "LONG_CANDIDATE_RUNNER_SCORE_AT_ENTRY") quick.minCandidateRunnerScore = value;
    else if (filterId === "ATR_PCT") quick.minAtrPct = value;
    else if (filterId === "BEST_DNA_LONG_TIER") quick.selectedBestDnaTiers = Array.isArray(value) ? value : [];
    else if (filterId === "LONG_POST_FEE_10_TIER") quick.selectedPostFee10PotentialTiers = Array.isArray(value) ? value : [];
    else if (filterId === "LONG_CANDIDATE_RUNNER_TIER_AT_ENTRY") quick.selectedCandidateRunnerTiers = Array.isArray(value) ? value : [];
    else if (filterId === "BEST_DNA_LONG_POSITIVE_GENES") quick.requiredBestDnaSetupLabels = Array.isArray(value) ? value : [];
    else if (filterId === "BEST_DNA_LONG_PENALTY_GENES") quick.excludedBestDnaDangerLabels = Array.isArray(value) ? value : [];
  }
  return quick;
}

function splitEffectiveFilterState(state) {
  const source = state ?? DEFAULT_LONG_FILTER_STATE;
  const quickGroup = (source.groups ?? []).find(group => group.id === QUICK_GROUP_ID);
  const quickOutcome = (source.outcomeFilters ?? []).filter(predicate => predicate.source === "quick");
  return {
    filterState: {
      ...source,
      groups: (source.groups ?? []).filter(group => group.id !== QUICK_GROUP_ID),
      outcomeFilters: (source.outcomeFilters ?? []).filter(predicate => predicate.source !== "quick"),
    },
    quickFilters: quickPredicatesToFilters([...(quickGroup?.predicates ?? []), ...quickOutcome]),
  };
}

function removeQuickPredicate(quick, predicate) {
  const next = { ...quick };
  const id = predicate?.filterId;
  if (id === "LONG_GATE_PASS") { next.showOnlyWouldPass = false; next.showOnlyLongGatePass = false; next.showOnlyWouldFail = false; }
  else if (id === "FEE_ADJUSTED_NORM_PNL_PCT") { next.showOnlyProfit = false; next.showOnlyLoss = false; }
  else if (id === "CLOSE_REASON") {
    next.showOnlySL = false;
    next.showOnlyProfitLock = false;
    next.showOnlyTrail = false;
    next.showOnlyTimeout = false;
  }
  else if (id === "PROFIT_LOCK_EXIT_BELOW_FLOOR") next.showOnlyProfitLockBelowFloor = false;
  else if (id === "FAILED_BREAKDOWN_1M") next.showOnlyFailedBreakout = false;
  else if (id === "HAS_GREEN_CONFIRMATION") next.showOnlyGreenConfirm = false;
  else if (id === "CVD_LABEL") next.showOnlyCvdBull = false;
  else if (id === "TOP_GAINER_CONTINUATION_WOULD_PASS") next.showOnlyContinuationPass = false;
  else if (id === "IS_RUN_BEST_1_NORM") next.showOnlyRunBest1Norm = false;
  else if (id === "IS_RUN_BEST_3_NORM") next.showOnlyRunBest3Norm = false;
  else if (id === "IS_POST_FEE_10_PLUS_WINNER") next.showOnlyPostFee10Plus = false;
  else if (id === "IS_NORM_2_PLUS_WINNER") next.showOnlyNorm2Plus = false;
  else if (id === "BEST_DNA_LONG_SCORE") next.minBestDnaScore = undefined;
  else if (id === "LONG_POST_FEE_10_SCORE") next.minPostFee10PotentialScore = undefined;
  else if (id === "LONG_CANDIDATE_RUNNER_SCORE_AT_ENTRY") next.minCandidateRunnerScore = undefined;
  else if (id === "ATR_PCT") next.minAtrPct = undefined;
  else if (id === "BEST_DNA_LONG_TIER") next.selectedBestDnaTiers = [];
  else if (id === "LONG_POST_FEE_10_TIER") next.selectedPostFee10PotentialTiers = [];
  else if (id === "LONG_CANDIDATE_RUNNER_TIER_AT_ENTRY") next.selectedCandidateRunnerTiers = [];
  else if (id === "BEST_DNA_LONG_POSITIVE_GENES") next.requiredBestDnaSetupLabels = [];
  else if (id === "BEST_DNA_LONG_PENALTY_GENES") next.excludedBestDnaDangerLabels = [];
  return next;
}

function BucketScopePills({ scope, setScope }) {
  const opts = [
    { value: "ALL_LONGS",        label: "All Longs" },
    { value: "TOP_LOSER_LONGS",  label: "Losers" },
    { value: "TOP_GAINER_LONGS", label: "Gainers" },
  ];
  return (
    <div style={{ display: "flex", gap: 5, marginBottom: 10, alignItems: "center" }}>
      <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim, letterSpacing: 1, marginRight: 4 }}>BUCKET</span>
      {opts.map(o => (
        <button key={o.value} onClick={() => setScope(o.value)} style={{
          fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
          padding: "4px 11px", borderRadius: 3, cursor: "pointer",
          background: scope === o.value ? "#152050" : C.surface,
          color:      scope === o.value ? C.blue    : C.textDim,
          border:     `1px solid ${scope === o.value ? "#3366cc" : C.border}`,
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function FilterBar({ quickFilters, setQuickFilters, visibleCount, totalCount, pnlStats }) {
  const toggle = key => setQuickFilters(s => ({ ...s, [key]: !s[key] }));
  const reset = () => setQuickFilters(QUICK_FILTER_DEFAULTS);
  const activeCount = quickFilterActiveCount(quickFilters);
  const hasTrades = (pnlStats?.trades ?? 0) > 0;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5,
      padding: "12px 14px", marginBottom: 14,
    }}>
      {/* Row 1: gate + outcome quick pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim, letterSpacing: 1, marginRight: 2 }}>GATE</span>
        <Pill on={quickFilters.showOnlyWouldPass} onClick={() => toggle("showOnlyWouldPass")}>Would Pass</Pill>
        <DangerPill on={quickFilters.showOnlyWouldFail} onClick={() => toggle("showOnlyWouldFail")}>Would Fail</DangerPill>

        <span style={{ color: C.border, padding: "0 4px" }}>│</span>

        <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim, letterSpacing: 1, marginRight: 2 }}>OUTCOME</span>
        <Pill on={quickFilters.showOnlyProfit}            onClick={() => toggle("showOnlyProfit")}>Profit</Pill>
        <Pill on={quickFilters.showOnlyLoss}              onClick={() => toggle("showOnlyLoss")}>Loss</Pill>
        <Pill on={quickFilters.showOnlySL} onClick={() => toggle("showOnlySL")}>SL</Pill>
        <Pill on={quickFilters.showOnlyProfitLock} onClick={() => toggle("showOnlyProfitLock")}>Profit Lock</Pill>
        <Pill on={quickFilters.showOnlyTrail} onClick={() => toggle("showOnlyTrail")}>Trail</Pill>
        <Pill on={quickFilters.showOnlyTimeout} onClick={() => toggle("showOnlyTimeout")}>Timeout</Pill>
        <DangerPill on={quickFilters.showOnlyProfitLockBelowFloor} onClick={() => toggle("showOnlyProfitLockBelowFloor")}>Lock Below Floor</DangerPill>

        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: activeCount ? C.blue : C.textDim }}>
            {visibleCount} / {totalCount} trades
            {activeCount > 0 && <span style={{ color: C.blue, marginLeft: 6 }}>· {activeCount} filter{activeCount !== 1 ? "s" : ""} active</span>}
          </span>
          {activeCount > 0 && (
            <button onClick={reset} style={{
              fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1,
              padding: "3px 9px", borderRadius: 3, cursor: "pointer",
              background: "#1a0a0a", color: "#ff8866", border: "1px solid #883322",
            }}>Reset</button>
          )}
        </span>
      </div>

      <div style={{
        display: "flex", gap: 6, flexWrap: "wrap", alignItems: "stretch",
        marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.borderLo}`,
      }}>
        <CompactMetric
          label="Net PnL"
          value={hasTrades ? pct(pnlStats.net) : "-"}
          color={hasTrades ? pnlCol(pnlStats.net) : C.textDim}
          sub={`${visibleCount} visible`}
        />
        <CompactMetric
          label="Avg PnL"
          value={hasTrades ? pct(pnlStats.avg) : "-"}
          color={hasTrades ? pnlCol(pnlStats.avg) : C.textDim}
          sub="per trade"
        />
        <CompactMetric
          label="Median"
          value={hasTrades ? pct(pnlStats.median) : "-"}
          color={hasTrades ? pnlCol(pnlStats.median) : C.textDim}
        />
        <CompactMetric
          label="Win Rate"
          value={hasTrades ? `${f2(pnlStats.winRate)}%` : "-"}
          color={!hasTrades ? C.textDim : pnlStats.winRate >= 50 ? C.green : C.red}
          sub={hasTrades ? `${pnlStats.wins}W / ${pnlStats.losses}L` : ""}
        />
        <CompactMetric
          label="Best"
          value={hasTrades ? pct(pnlStats.best) : "-"}
          color={hasTrades ? pnlCol(pnlStats.best) : C.textDim}
        />
        <CompactMetric
          label="Worst"
          value={hasTrades ? pct(pnlStats.worst) : "-"}
          color={hasTrades ? pnlCol(pnlStats.worst) : C.textDim}
        />
        <CompactMetric
          label="Exits"
          value={hasTrades ? `${pnlStats.sl} SL` : "-"}
          color={pnlStats?.sl > 0 ? C.red : C.textDim}
          sub={hasTrades ? `${pnlStats.locks} lock / ${pnlStats.trails} trail` : ""}
        />
      </div>
    </div>
  );
}

// ─── INNER TAB NAV ───────────────────────────────────────────────────────────

const INNER_TABS = [
  { id: "winningSetups",      label: "★ Winning Setups" },
  { id: "highlights",         label: "★ Highlights" },
  { id: "overview",           label: "Overview" },
  { id: "signals",            label: "Signals" },
  { id: "pressure",           label: "LONG VWAP & CVD" },
  { id: "bestDna",            label: "BEST / 10+ DNA" },
  { id: "gainerContinuation", label: "Gainer Continuation & Pullback" },
  { id: "exitHealth",         label: "Exit Health" },
  { id: "runs",               label: "Runs" },
  { id: "trades",             label: "Trades" },
  { id: "cockpit",            label: "Cockpit Tools" },
  { id: "policyV2",           label: "Shadow Decision (LOG ONLY)" },
  { id: "tickDirection",      label: "⚡ Tick Direction Lab" },
];

function InnerNav({ active, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
      {INNER_TABS.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 1,
          padding: "6px 14px", cursor: "pointer", border: "none",
          borderBottom: active === t.id ? `2px solid ${C.blue}` : "2px solid transparent",
          background: "transparent",
          color: active === t.id ? C.blue : C.textDim,
          marginBottom: -1,
        }}>{t.label.toUpperCase()}</button>
      ))}
    </div>
  );
}

// ─── PANEL: OVERVIEW ─────────────────────────────────────────────────────────

function OverviewPanel({ closedSamples, auditRows }) {
  const passGroup = closedSamples.filter(t => t.longGateWouldPass === true);
  const failGroup = closedSamples.filter(t => t.longGateWouldPass === false);
  const passNet  = passGroup.reduce((s, t) => s + (getTradeClosedPnl(t) ?? 0), 0);
  const failNet  = failGroup.reduce((s, t) => s + (getTradeClosedPnl(t) ?? 0), 0);
  const passAvg  = passGroup.length ? passNet / passGroup.length : 0;
  const failAvg  = failGroup.length ? failNet / failGroup.length : 0;
  const passSL   = passGroup.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS).length;
  const failSL   = failGroup.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS).length;

  return (
    <div>
      {/* Gate split */}
      <SectionHead>Gate Split</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {[
          { title: "WOULD PASS", group: passGroup, net: passNet, avg: passAvg, sl: passSL, accent: C.pass },
          { title: "WOULD FAIL", group: failGroup, net: failNet, avg: failAvg, sl: failSL, accent: C.fail },
        ].map(({ title, group, net, avg, sl, accent }) => (
          <div key={title} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5,
            padding: "12px 14px", borderLeft: `3px solid ${accent}`,
          }}>
            <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 2, marginBottom: 8 }}>{title}</div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim, marginBottom: 2 }}>TRADES</div>
                <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: C.text }}>{group.length}</div>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim, marginBottom: 2 }}>NET PNL</div>
                <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: pnlCol(net) }}>{pct(net)}</div>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim, marginBottom: 2 }}>AVG PNL</div>
                <div style={{ fontFamily: mono, fontSize: 14, color: pnlCol(avg) }}>{pct(avg)}</div>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim, marginBottom: 2 }}>SL RATE</div>
                <div style={{ fontFamily: mono, fontSize: 14, color: group.length ? pnlCol(-(sl / group.length * 100 - 30)) : C.textDim }}>
                  {group.length ? f2(sl / group.length * 100) : "—"}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Audit label breakdown */}
      <SectionHead>Audit Label Breakdown</SectionHead>
      <AuditTable rows={auditRows} closedSamples={closedSamples} />
    </div>
  );
}

// ─── PANEL: SIGNALS ──────────────────────────────────────────────────────────

const LANE_DESCS = {
  "TOP LOSER SCALP CANDIDATE":               "ticks down + RSI rollover",
  "TOP LOSER RUNNER CANDIDATE":              "immediate red + high ATR",
  "TOP LOSER BLIND WEAKNESS SHORT":          "no momentum confirmation",
  "TOP LOSER BTC BOUNCE TRAP WARNING":       "BTC strong / weak down",
  "TOP LOSER REJECTED GREEN FADE CANDIDATE": "green faded by red / RSI",
  "TOP LOSER BEARISH CHASE WARNING":         "momentum present, chasing",
};

function SignalsPanel({ closedSamples, microRows, laneRows, btcRows }) {
  const [sub, setSub] = useState("micro");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["micro", "Micro Momentum"], ["lane", "Thesis Lane"], ["btc", "BTC Context"]].map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} style={{
            fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1,
            padding: "4px 12px", borderRadius: 3, cursor: "pointer",
            background: sub === id ? "#12163a" : C.surface,
            color:      sub === id ? C.blue    : C.textDim,
            border:     `1px solid ${sub === id ? "#2244aa" : C.border}`,
          }}>{label.toUpperCase()}</button>
        ))}
      </div>

      {sub === "micro" && (
        <>
          <SectionHead>Micro Momentum — does the coin show red movement at entry?</SectionHead>
          <AuditTable rows={microRows} closedSamples={closedSamples} />
        </>
      )}

      {sub === "lane" && (
        <>
          <SectionHead>Thesis Lane</SectionHead>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {Object.entries(LANE_DESCS).map(([k, desc]) => (
              <div key={k} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 3, padding: "5px 9px",
              }}>
                <div style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, color: C.textSub, marginBottom: 2 }}>{k}</div>
                <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim }}>{desc}</div>
              </div>
            ))}
          </div>
          <AuditTable rows={laneRows} closedSamples={closedSamples} />
        </>
      )}

      {sub === "btc" && (
        <>
          <SectionHead>BTC Long Context — compares legacy score vs new long context labels</SectionHead>
          <AuditTable rows={btcRows} closedSamples={closedSamples} extraCols={[
            {
              key: "legacy",
              label: "Tailwind Avg",
              render: (row, cs) => {
                const g = cs.filter(t => t.btcLongContextLabel === row.key);
                const avg = g.length ? g.reduce((s, t) => s + (t.btcLongContextScore ?? 0), 0) / g.length : null;
                return avg != null ? f2(avg) : "—";
              },
            },
            {
              key: "newScore",
              label: "Regime Score",
              render: (row, cs) => {
                const g = cs.filter(t => t.btcLongContextLabel === row.key);
                const avg = g.length ? g.reduce((s, t) => s + (t.btcRegimeScore ?? 0), 0) / g.length : null;
                return avg != null ? f2(avg) : "—";
              },
            },
          ]} />
        </>
      )}
    </div>
  );
}

// ─── PANEL: PRESSURE & VWAP ──────────────────────────────────────────────────

function PressurePanel({ closedSamples, greenRows, vwapRows, warnRows, warnBuckets }) {
  const [sub, setSub] = useState("green");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["green", "Green Pressure"], ["vwap", "VWAP Context"], ["warn", "Warnings"]].map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} style={{
            fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1,
            padding: "4px 12px", borderRadius: 3, cursor: "pointer",
            background: sub === id ? "#12163a" : C.surface,
            color:      sub === id ? C.blue    : C.textDim,
            border:     `1px solid ${sub === id ? "#2244aa" : C.border}`,
          }}>{label.toUpperCase()}</button>
        ))}
      </div>

      {sub === "green" && (
        <>
          <SectionHead>Green Pressure — does green impulse at entry predict loss?</SectionHead>
          <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, marginBottom: 10 }}>
            Does rejection by red save it? Does RSI rollover rescue it?
          </div>
          <AuditTable rows={greenRows} closedSamples={closedSamples} />
        </>
      )}

      {sub === "vwap" && (
        <>
          <SectionHead>VWAP Context — price position vs VWAP at entry</SectionHead>
          <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, marginBottom: 10 }}>
            Below VWAP + red = useful? Below + green = trap? Above + rejection = bounce short?
          </div>
          <AuditTable rows={vwapRows} closedSamples={closedSamples} />
        </>
      )}

      {sub === "warn" && (
        <>
          <SectionHead>Entry Quality Warnings</SectionHead>
          <AuditTable rows={warnRows} closedSamples={closedSamples} />
          <div style={{ marginTop: 16 }}>
            <SectionHead>Warning Count Buckets</SectionHead>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {warnBuckets.map(b => (
                <StatCard
                  key={b.label}
                  label={b.label.toUpperCase()}
                  value={`${b.count} trades`}
                  color={C.text}
                  sub={`${pct(b.net)} net · ${b.winRate}% WR · SL ${b.slRate}%`}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── PANEL: GAINER CONTINUATION & PULLBACK ───────────────────────────────────

function GainerContinuationPanel({ gainerSamples }) {
  const [sub, setSub] = useState("subBucket");
  const subs = [
    ["subBucket",  "Sub-Bucket"],
    ["contAudit",  "Continuation Audit"],
    ["phase",      "Pump Phase"],
    ["strength",   "Pump Strength"],
    ["vwap",       "VWAP Context"],
    ["rsi",        "RSI Context"],
    ["trend",      "Trend Context"],
    ["flow",       "Vol/Flow"],
    ["rank",       "Rank/Batch"],
    ["warn",       "Warnings"],
  ];
  const rows = useMemo(() => {
    switch (sub) {
      case "subBucket":  return summarizeByField(gainerSamples, "longSubBucket");
      case "contAudit":  return summarizeByField(gainerSamples, "topGainerContinuationAuditLabel");
      case "phase":      return summarizeByField(gainerSamples, "topGainerPumpPhaseLabel");
      case "strength":   return summarizeByField(gainerSamples, "topGainerPumpStrengthLabel");
      case "vwap":       return summarizeByField(gainerSamples, "topGainerVwapContextLabel");
      case "rsi":        return summarizeByField(gainerSamples, "topGainerRsiContextLabel");
      case "trend":      return summarizeByField(gainerSamples, "topGainerTrendContextLabel");
      case "flow":       return summarizeByField(gainerSamples, "topGainerVolumeFlowContextLabel");
      case "rank":       return summarizeByField(gainerSamples, "topGainerEntryBatchLabel");
      case "warn":       return summarizeByArrayField(gainerSamples, "topGainerQualityWarningLabels");
      default:           return [];
    }
  }, [sub, gainerSamples]);

  if (!gainerSamples.length)
    return <EmptyState msg="No closed Top Gainer LONG trades yet. Labels populate after entry telemetry resolves." />;

  return (
    <div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {subs.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} style={{
            fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1,
            padding: "4px 10px", borderRadius: 3, cursor: "pointer",
            background: sub === id ? "#12163a" : C.surface,
            color:      sub === id ? C.blue    : C.textDim,
            border:     `1px solid ${sub === id ? "#2244aa" : C.border}`,
          }}>{label.toUpperCase()}</button>
        ))}
      </div>
      <SectionHead>Gainer Continuation & Pullback: {subs.find(s => s[0] === sub)?.[1]}</SectionHead>
      <AuditTable rows={rows} closedSamples={gainerSamples} />
    </div>
  );
}

// ─── PANEL: EXIT HEALTH ───────────────────────────────────────────────────────

const BEST_DNA_TIER_OPTIONS = [
  "BEST_DNA_WATCH",
  "BEST_DNA_CANDIDATE",
  "BEST_DNA_HIGH",
  "BEST_DNA_SNIPER",
  "BEST_DNA_ELITE",
];

const POST_FEE_10_TIER_OPTIONS = Object.values(LONG_PF10_TIER);

const RUNNER_TIER_OPTIONS = Object.values(LONG_RUNNER_TIER);

const BEST_DNA_SETUP_LABEL_OPTIONS = [
  "GAINER_LONG_DNA_CONTINUATION_BREAKOUT",
  "GAINER_LONG_DNA_PULLBACK_ENTRY",
  "GAINER_LONG_DNA_VWAP_RECLAIM",
  "GAINER_LONG_DNA_GREEN_MULTI_CONFIRM",
  "GAINER_LONG_DNA_REACCELERATION",
  "LOSER_LONG_DNA_REVERSAL_IMPULSE",
  "LOSER_LONG_DNA_VWAP_RECLAIM",
  "LOSER_LONG_DNA_CVD_BULL_OVERSOLD",
  "LOSER_LONG_DNA_RSI_ROLLOVER",
  "LOSER_LONG_DNA_ATR_SNIPER",
];

const BEST_DNA_DANGER_LABEL_OPTIONS = [
  "CVD_BEAR",
  "RED_PRESSURE",
  "VWAP_RECLAIM_FAILED",
  "FALLING_KNIFE",
  "OVEREXTENDED",
  "WIDE_SPREAD",
  "THIN_BOOK",
  "LONG_GATE_FAIL",
  "NO_LONG_MOMENTUM",
  "HOSTILE_MARKET",
];

function NumberFilter({ label, value, onChange, step = 1 }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim, letterSpacing: 1 }}>{label}</span>
      <input
        value={value ?? ""}
        onChange={e => {
          const raw = e.target.value;
          const n = raw === "" ? undefined : Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        type="number"
        min="0"
        step={step}
        style={{
          width: 64,
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          color: C.text,
          fontFamily: mono,
          fontSize: 10,
          padding: "4px 6px",
        }}
      />
    </label>
  );
}

function ToggleGroup({ title, options, active, onToggle, danger = false }) {
  return (
    <div>
      <SectionHead>{title}</SectionHead>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {options.map(value => {
          const on = active?.includes(value);
          const short = value
            .replace(/^BEST_DNA_/, "")
            .replace(/^LONG_PF10_/, "")
            .replace(/^LONG_RUNNER_/, "")
            .replace(/^GAINER_BEST_DNA_/, "")
            .replace(/^LOSER_BEST_DNA_/, "")
            .replace(/_/g, " ");
          const Cmp = danger ? DangerPill : Pill;
          return <Cmp key={value} on={on} onClick={() => onToggle(value)}>{short}</Cmp>;
        })}
      </div>
    </div>
  );
}

function BestDnaPanel({ closedSamples, visibleTrades, quickFilters, setQuickFilters }) {
  const bestTierRows = useMemo(() => summarizeByField(closedSamples, "bestDnaLongTier"), [closedSamples]);
  const postTierRows = useMemo(() => summarizeByField(closedSamples, "longPostFee10EntryTier"), [closedSamples]);
  const runnerRows   = useMemo(() => summarizeByField(closedSamples, "longCandidateRunnerTierAtEntry"), [closedSamples]);
  const setupRows    = useMemo(() => summarizeByArrayField(closedSamples, "bestDnaLongLabels"), [closedSamples]);

  const setValue = (key, value) => setQuickFilters(s => ({ ...s, [key]: value }));
  const toggleArray = (key, value) => setQuickFilters(s => {
    const arr = s[key] ?? [];
    return { ...s, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
  });
  const toggleBool = key => setQuickFilters(s => ({ ...s, [key]: !s[key] }));
  const avg = key => {
    const vals = visibleTrades.map(t => t[key]).filter(v => typeof v === "number");
    return vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : null;
  };

  return (
    <div>
      <SectionHead>BEST / 10+ DNA</SectionHead>
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 5,
        padding: "12px 14px",
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <NumberFilter label="BEST MIN" value={quickFilters.minBestDnaScore} onChange={v => setValue("minBestDnaScore", v)} />
          <NumberFilter label="10+ MIN" value={quickFilters.minPostFee10PotentialScore} onChange={v => setValue("minPostFee10PotentialScore", v)} />
          <NumberFilter label="CAND RUN MIN" value={quickFilters.minCandidateRunnerScore} onChange={v => setValue("minCandidateRunnerScore", v)} />
          <NumberFilter label="ATR MIN" value={quickFilters.minAtrPct} step={0.1} onChange={v => setValue("minAtrPct", v)} />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <Pill on={quickFilters.showOnlyFailedBreakout} onClick={() => toggleBool("showOnlyFailedBreakout")}>Failed Breakout</Pill>
          <Pill on={quickFilters.showOnlyLongGatePass} onClick={() => toggleBool("showOnlyLongGatePass")}>Long Gate Pass</Pill>
          <Pill on={quickFilters.showOnlyGreenConfirm} onClick={() => toggleBool("showOnlyGreenConfirm")}>Green Confirm</Pill>
          <Pill on={quickFilters.showOnlyCvdBull} onClick={() => toggleBool("showOnlyCvdBull")}>CVD Bull</Pill>
          <Pill on={quickFilters.showOnlyContinuationPass} onClick={() => toggleBool("showOnlyContinuationPass")}>Cont. Pass</Pill>
          <Pill on={quickFilters.showOnlyRunBest1Norm} onClick={() => toggleBool("showOnlyRunBest1Norm")}>BEST1</Pill>
          <Pill on={quickFilters.showOnlyRunBest3Norm} onClick={() => toggleBool("showOnlyRunBest3Norm")}>BEST3</Pill>
          <Pill on={quickFilters.showOnlyPostFee10Plus} onClick={() => toggleBool("showOnlyPostFee10Plus")}>10+ Outcome</Pill>
          <Pill on={quickFilters.showOnlyNorm2Plus} onClick={() => toggleBool("showOnlyNorm2Plus")}>Norm 2%+</Pill>
        </div>

        <ToggleGroup
          title="Score Tiers"
          options={[...BEST_DNA_TIER_OPTIONS, ...POST_FEE_10_TIER_OPTIONS, ...RUNNER_TIER_OPTIONS]}
          active={[...(quickFilters.selectedBestDnaTiers ?? []), ...(quickFilters.selectedPostFee10PotentialTiers ?? []), ...(quickFilters.selectedCandidateRunnerTiers ?? [])]}
          onToggle={value => {
            if (value.startsWith("BEST_DNA_")) toggleArray("selectedBestDnaTiers", value);
            else if (value.startsWith("LONG_PF10_")) toggleArray("selectedPostFee10PotentialTiers", value);
            else if (value.startsWith("LONG_RUNNER_")) toggleArray("selectedCandidateRunnerTiers", value);
          }}
        />
        <ToggleGroup
          title="Required Setup Labels"
          options={BEST_DNA_SETUP_LABEL_OPTIONS}
          active={quickFilters.requiredBestDnaSetupLabels}
          onToggle={value => toggleArray("requiredBestDnaSetupLabels", value)}
        />
        <ToggleGroup
          title="Excluded Danger Labels"
          options={BEST_DNA_DANGER_LABEL_OPTIONS}
          active={quickFilters.excludedBestDnaDangerLabels}
          onToggle={value => toggleArray("excludedBestDnaDangerLabels", value)}
          danger
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="VISIBLE" value={`${visibleTrades.length}`} color={C.text} />
        <StatCard label="AVG BEST" value={avg("bestDnaLongScore") ?? "-"} color={C.blue} />
        <StatCard label="AVG POST-FEE 10 ENTRY SCORE" value={avg("longPostFee10EntryScore") ?? "-"} color={C.green} />
        <StatCard label="AVG RUNNER ENTRY SCORE" value={avg("longCandidateRunnerScoreAtEntry") ?? "-"} color="#55ccff" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        <div>
          <SectionHead>BEST DNA Tiers</SectionHead>
          <AuditTable rows={bestTierRows} closedSamples={closedSamples} />
        </div>
        <div>
          <SectionHead>Post-Fee 10+ Tiers</SectionHead>
          <AuditTable rows={postTierRows} closedSamples={closedSamples} />
        </div>
        <div>
          <SectionHead>Runner Tiers</SectionHead>
          <AuditTable rows={runnerRows} closedSamples={closedSamples} />
        </div>
        <div>
          <SectionHead>Setup Labels</SectionHead>
          <AuditTable rows={setupRows} closedSamples={closedSamples} />
        </div>
      </div>
    </div>
  );
}

function buildExitReasonHealth(trades, closeReason) {
  const rows = trades.filter(trade => String(trade.closeReason ?? "").toUpperCase() === closeReason);
  const pnls = rows.map(getTradeClosedPnl).filter(value => value !== null);
  const positive = pnls.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
  const negative = Math.abs(pnls.filter(value => value < 0).reduce((sum, value) => sum + value, 0));
  const total = pnls.reduce((sum, value) => sum + value, 0);
  const belowFloor = rows.filter(trade =>
    trade.profitLockExitBelowFloor === true ||
    trade.profitLockFloorMissed === true ||
    trade.lockFloorMissed === true
  ).length;
  const mfeGiveback = rows.filter(trade => {
    const labels = Array.isArray(trade.exitDiagnosticLabels) ? trade.exitDiagnosticLabels : [];
    return labels.some(label => String(label).includes("MFE_GIVEBACK") || String(label).includes("GIVEN_BACK"));
  }).length;
  return {
    closeReason,
    trades: rows.length,
    avg: pnls.length ? total / pnls.length : null,
    winRate: pnls.length ? pnls.filter(value => value > 0).length / pnls.length * 100 : null,
    profitFactor: negative > 0 ? positive / negative : positive > 0 ? null : 0,
    belowFloor,
    mfeGiveback,
  };
}

function ExitReasonHealthCard({ row }) {
  const positive = (row.avg ?? 0) >= 0;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
      padding: "9px 11px", minWidth: 180, flex: "1 1 180px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 900, color: row.closeReason === "PROFIT_LOCK" ? C.amber : C.text }}>{row.closeReason}</div>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim }}>n={row.trades}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginTop: 8 }}>
        <div><div style={{ fontSize: 7, color: C.textDim }}>AVG FEE-NET</div><b style={{ fontFamily: mono, fontSize: 10, color: positive ? C.green : C.red }}>{row.avg == null ? "—" : pct(row.avg)}</b></div>
        <div><div style={{ fontSize: 7, color: C.textDim }}>WIN</div><b style={{ fontFamily: mono, fontSize: 10, color: C.text }}>{row.winRate == null ? "—" : `${row.winRate.toFixed(1)}%`}</b></div>
        <div><div style={{ fontSize: 7, color: C.textDim }}>PF</div><b style={{ fontFamily: mono, fontSize: 10, color: C.text }}>{row.profitFactor == null ? "∞" : row.profitFactor.toFixed(2)}</b></div>
      </div>
      {(row.closeReason === "PROFIT_LOCK" || row.belowFloor || row.mfeGiveback) && (
        <div style={{ marginTop: 7, fontFamily: mono, fontSize: 7, color: C.textDim }}>
          BELOW FLOOR <b style={{ color: row.belowFloor ? C.red : C.text }}>{row.belowFloor}</b> · MFE GIVEBACK <b style={{ color: row.mfeGiveback ? C.amber : C.text }}>{row.mfeGiveback}</b>
        </div>
      )}
    </div>
  );
}

function ExitHealthPanel({ closedSamples, profitLockSamples, gainerSamples }) {
  const [sub, setSub] = useState("exitTypes");
  const exitTypeRows  = useMemo(() => summarizeByField(closedSamples, "exitProfileLabel"), [closedSamples]);
  const diagRows      = useMemo(() => summarizeByArrayField(closedSamples, "exitDiagnosticLabels"), [closedSamples]);
  const lockDiagRows  = useMemo(() => summarizeByField(profitLockSamples, "negativeProfitLockExit"), [profitLockSamples]);
  const simRows       = useMemo(() => {
    if (!gainerSamples.length) return [];
    return summarizeByField(gainerSamples, "bestSimExitProfile");
  }, [gainerSamples]);
  const exitHealthRows = useMemo(() =>
    ["PROFIT_LOCK", "TRAIL", "TIMEOUT", "RUN_STOP", "APP_SHUTDOWN", "SL", "FINALIZATION_FAILED"].map(reason => buildExitReasonHealth(closedSamples, reason)),
  [closedSamples]);

  return (
    <div>
      <SectionHead>Exit Health — close reasons are never aggregated</SectionHead>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {exitHealthRows.map(row => <ExitReasonHealthCard key={row.closeReason} row={row} />)}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          ["exitTypes", "Exit Types"],
          ["diagnostics", "Diagnostics"],
          ["lockDiag", "Lock Diag"],
          ["simulations", "Simulations"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} style={{
            fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1,
            padding: "4px 10px", borderRadius: 3, cursor: "pointer",
            background: sub === id ? "#12163a" : C.surface,
            color:      sub === id ? C.blue    : C.textDim,
            border:     `1px solid ${sub === id ? "#2244aa" : C.border}`,
          }}>{label.toUpperCase()}</button>
        ))}
      </div>

      {sub === "exitTypes" && (
        <>
          <SectionHead>Exit Types — by bucket side and close reason</SectionHead>
          <AuditTable rows={exitTypeRows} closedSamples={closedSamples} />
        </>
      )}
      {sub === "diagnostics" && (
        <>
          <SectionHead>Exit Diagnostic Labels — did the exit engine harvest?</SectionHead>
          <AuditTable rows={diagRows} closedSamples={closedSamples} />
        </>
      )}
      {sub === "lockDiag" && (
        <>
          <SectionHead>Profit Lock Diagnostics — trades that hit lock exit</SectionHead>
          <AuditTable rows={lockDiagRows} closedSamples={profitLockSamples} />
        </>
      )}
      {sub === "simulations" && (
        <>
          <SectionHead>Best Simulation Profile — which exit profile would have won?</SectionHead>
          {simRows.length
            ? <AuditTable rows={simRows} closedSamples={gainerSamples} />
            : <EmptyState msg="No gainer simulation data yet." />
          }
        </>
      )}
    </div>
  );
}

// ─── PANEL: RUNS ─────────────────────────────────────────────────────────────

const RUNS_COLS = [
  { key: "run",                        label: "Run",       width: 55,  sortValue: r => r.run ?? 0,
    render: r => <span style={{ color: C.blue, fontWeight: 700 }}>{r.run}</span> },
  { key: "trades",                     label: "Trades",    width: 65,  sortValue: r => r.trades ?? 0,
    render: r => <span style={{ color: C.textSub }}>{r.trades}</span> },
  { key: "netPnl",                     label: "Net",       width: 80,  sortValue: r => r.netPnl ?? 0,
    render: r => <span style={{ color: pnlCol(r.netPnl), fontWeight: 700 }}>{pct(r.netPnl)}</span> },
  { key: "winRate",                    label: "Win %",     width: 65,  sortValue: r => r.winRate ?? 0,
    render: r => <span style={{ color: r.winRate >= 50 ? C.green : C.red }}>{r.winRate}%</span> },
  { key: "slCount",                    label: "SL",        width: 52,  sortValue: r => r.slCount ?? 0,
    render: r => <span style={{ color: r.slCount > 0 ? C.red : C.textSub }}>{r.slCount}</span> },
  { key: "profitLockCount",            label: "Lock",      width: 55,  sortValue: r => r.profitLockCount ?? 0,
    render: r => <span style={{ color: r.profitLockCount > 0 ? C.pass : C.textSub }}>{r.profitLockCount}</span> },
  { key: "trailCount",                 label: "Trail",     width: 55,  sortValue: r => r.trailCount ?? 0,
    render: r => <span style={{ color: "#55ccff" }}>{r.trailCount}</span> },
  { key: "lockToSlRatio",              label: "Lock:SL",   width: 68,  sortValue: r => r.lockToSlRatio ?? 0,
    render: r => <span style={{ color: r.lockToSlRatio >= 1 ? C.pass : "#cc7744", fontWeight: 700 }}>{r.lockToSlRatio}</span> },
  { key: "wouldPassCount",             label: "Pass",      width: 55,  sortValue: r => r.wouldPassCount ?? 0,
    render: r => <span style={{ color: C.pass }}>{r.wouldPassCount}</span> },
  { key: "wouldFailCount",             label: "Fail",      width: 52,  sortValue: r => r.wouldFailCount ?? 0,
    render: r => <span style={{ color: r.wouldFailCount > 0 ? C.fail : C.textSub }}>{r.wouldFailCount}</span> },
  { key: "wouldPassNetPnl",            label: "Pass Net",  width: 80,  sortValue: r => r.wouldPassNetPnl ?? 0,
    render: r => <span style={{ color: pnlCol(r.wouldPassNetPnl) }}>{pct(r.wouldPassNetPnl)}</span> },
  { key: "wouldFailNetPnl",            label: "Fail Net",  width: 80,  sortValue: r => r.wouldFailNetPnl ?? 0,
    render: r => <span style={{ color: pnlCol(r.wouldFailNetPnl) }}>{pct(r.wouldFailNetPnl)}</span> },
  { key: "microMomentumCount",         label: "Momentum",  width: 76,  sortValue: r => r.microMomentumCount ?? 0,
    render: r => <span style={{ color: C.textSub }}>{r.microMomentumCount}</span> },
  { key: "blindWeaknessCount",         label: "Blind",     width: 55,  sortValue: r => r.blindWeaknessCount ?? 0,
    render: r => <span style={{ color: r.blindWeaknessCount > 0 ? C.amber : C.textDim }}>{r.blindWeaknessCount}</span> },
  { key: "greenPressureCount",         label: "Green",     width: 55,  sortValue: r => r.greenPressureCount ?? 0,
    render: r => <span style={{ color: r.greenPressureCount > 0 ? C.amber : C.textDim }}>{r.greenPressureCount}</span> },
  { key: "btcTrapCount",               label: "BTC Trap",  width: 68,  sortValue: r => r.btcTrapCount ?? 0,
    render: r => <span style={{ color: r.btcTrapCount > 0 ? C.fail : C.textDim }}>{r.btcTrapCount}</span> },
  { key: "loserCount",                 label: "Losers",    width: 58,  sortValue: r => r.loserCount ?? 0,
    render: r => <span style={{ color: C.textSub }}>{r.loserCount ?? 0}</span> },
  { key: "gainerCount",                label: "Gainers",   width: 62,  sortValue: r => r.gainerCount ?? 0,
    render: r => <span style={{ color: C.textSub }}>{r.gainerCount ?? 0}</span> },
  { key: "gainerClassicExhaustionCount", label: "G.Classic",  width: 70, sortValue: r => r.gainerClassicExhaustionCount ?? 0,
    render: r => <span style={{ color: C.textSub }}>{r.gainerClassicExhaustionCount ?? 0}</span> },
  { key: "gainerHotPumpFadeCount",     label: "G.HotFade", width: 72,  sortValue: r => r.gainerHotPumpFadeCount ?? 0,
    render: r => <span style={{ color: C.textSub }}>{r.gainerHotPumpFadeCount ?? 0}</span> },
  { key: "gainerContinuationDangerCount", label: "G.Cont.Risk", width: 80, sortValue: r => r.gainerContinuationDangerCount ?? 0,
    render: r => <span style={{ color: (r.gainerContinuationDangerCount ?? 0) > 0 ? C.amber : C.textDim }}>{r.gainerContinuationDangerCount ?? 0}</span> },
  { key: "gainerNegativeProfitLockCount", label: "G.NegLock", width: 76, sortValue: r => r.gainerNegativeProfitLockCount ?? 0,
    render: r => <span style={{ color: (r.gainerNegativeProfitLockCount ?? 0) > 0 ? C.fail : C.textDim }}>{r.gainerNegativeProfitLockCount ?? 0}</span> },
];

function RunsPanel({ runRows }) {
  if (!runRows.length) return <EmptyState msg="No completed runs yet." />;
  return (
    <>
      <SectionHead>Run-Level Thesis Summary — compare green runs vs red runs</SectionHead>
      <SmartTable columns={RUNS_COLS} rows={runRows} rowKey={r => r.run} emptyMsg="No completed runs yet." />
    </>
  );
}

// ─── PANEL: TRADES ───────────────────────────────────────────────────────────

const TRADES_COLS = [
  { key: "symbol",      label: "Symbol",   width: 88,  sortValue: t => t.symbol ?? "",
    render: t => <span style={{ color: C.text, fontWeight: 600 }}>{t.symbol?.replace("USDT","") ?? "—"}</span> },
  { key: "run",         label: "Run",      width: 52,  sortValue: t => t.run ?? 0,
    render: t => <span style={{ color: C.blue }}>{t.run}</span> },
  { key: "absoluteEntryScore", label: "AES", width: 62, firstClickDir: "desc", sortValue: t => t.absoluteEntryScore ?? -1,
    render: t => {
      const score = t.absoluteEntryScore;
      if (score == null) return <span style={{ color: C.textDim }}>—</span>;
      const color = absScoreColor(score);
      const isResearchBlock = (t.absoluteEntryResearchBlockReasons?.length ?? 0) > 0;
      const isCaution = !isResearchBlock && (t.absoluteEntryCautionReasons?.length ?? 0) > 0;
      const suffix = isResearchBlock ? " R" : isCaution ? " C" : "";
      const tip = [
        `AES V3: ${score}`,
        `Tier: ${t.absoluteEntryTier ?? "—"}`,
        `Confidence: ${t.absoluteEntryConfidence ?? "—"}/100`,
        `Eligibility: ${t.absoluteEntryEligibility ?? "—"}`,
        "LOG ONLY",
      ].join("\n");
      return (
        <span title={tip} style={{ color, fontWeight: 700, opacity: isResearchBlock ? 0.75 : 1 }}>
          {score}<span style={{ fontSize: 9 }}>{suffix}</span>
        </span>
      );
    }},
  { key: "bestDnaLongScore", label: "BEST DNA", width: 82, firstClickDir: "desc", sortValue: t => t.bestDnaLongScore ?? -1,
    render: t => <DnaScoreCell
      title="BEST DNA"
      score={t.bestDnaLongScore}
      tier={t.bestDnaLongTier}
      labels={t.bestDnaLongLabels}
      positives={t.bestDnaLongPositiveGenes}
      penalties={t.bestDnaLongPenaltyGenes}
    /> },
  { key: "longPostFee10EntryScore", label: "POST-FEE 10 ENTRY SCORE", width: 100, firstClickDir: "desc", sortValue: t => t.longPostFee10EntryScore ?? -1,
    render: t => <DnaScoreCell
      title="Post-Fee 10 Entry"
      score={t.longPostFee10EntryScore}
      tier={t.longPostFee10EntryTier}
      labels={t.longPostFee10Labels}
      positives={t.longPostFee10PositiveGenes}
      penalties={t.longPostFee10PenaltyGenes}
    /> },
  { key: "longCandidateRunnerScoreAtEntry", label: "RUNNER ENTRY SCORE", width: 100, firstClickDir: "desc", sortValue: t => t.longCandidateRunnerScoreAtEntry ?? -1,
    render: t => <DnaScoreCell
      title="Runner Entry"
      score={t.longCandidateRunnerScoreAtEntry}
      tier={t.longCandidateRunnerTierAtEntry}
      labels={t.longCandidateRunnerReasons}
      positives={t.longCandidateRunnerReasons}
      penalties={t.longCandidateRunnerPenalties}
    /> },
  { key: "entryRank",   label: "Rank",     width: 52,  sortValue: t => t.entryRank ?? 99,
    render: t => <span style={{ color: C.textSub }}>{t.entryRank}</span> },
  { key: "change24h",   label: "24h %",    width: 68,  sortValue: t => t.change24h ?? 0,
    render: t => <span style={{ color: (t.change24h ?? 0) >= 0 ? C.green : C.red }}>
      {t.change24h != null ? `${t.change24h}%` : "—"}
    </span> },
  { key: "feeAdjustedNormPnlPct", label: "PnL",      width: 78,  sortValue: t => getTradeClosedPnl(t) ?? -Infinity,
    render: t => { const p = getTradeClosedPnl(t); return <span style={{ color: pnlCol(p ?? 0), fontWeight: 700 }}>{p != null ? pct(p) : "—"}</span>; } },
  { key: "closeReason", label: "Close",    width: 80,  sortValue: t => t.closeReason ?? "",
    render: t => <span style={{ color: C.textSub }}>{t.closeReason ?? "—"}</span> },
  { key: "longGateWouldPass", label: "Gate", width: 58, sortValue: t => t.longGateWouldPass ? 1 : 0,
    render: t => <PassBadge pass={t.longGateWouldPass} /> },
  { key: "longMicroMomentumLabel", label: "Momentum", width: 118, sortValue: t => t.longMicroMomentumLabel ?? t.microMomentumLabel ?? "",
    render: t => {
      const lbl = t.longMicroMomentumLabel ?? t.microMomentumLabel;
      return <span style={{ color: C.textSub }}>{lbl?.replace("LONG_MICRO_","").replace("MICRO_","").replace(/_/g," ") ?? "—"}</span>;
    }},
  { key: "longSubBucket", label: "Sub-Bucket", width: 130, sortValue: t => t.longSubBucket ?? t.topLoserThesisLaneLabel ?? "",
    render: t => {
      const lbl = t.longSubBucket ?? t.topLoserLongSubBucket ?? t.topGainerLongSubBucket ?? t.topLoserThesisLaneLabel;
      return <span style={{ color: C.textSub }}>{lbl?.replace(/^TOP_(LOSER|GAINER)_LONGS?_?/,"").replace(/_/g," ") ?? "—"}</span>;
    }},
  { key: "btcLongContextLabel", label: "BTC", width: 96, sortValue: t => t.btcLongContextLabel ?? "",
    render: t => <span style={{ color: C.textSub }}>
      {t.btcLongContextLabel?.replace("BTC_LONG_","").replace("BTC_","").replace(/_/g," ") ?? "—"}
    </span> },
  { key: "greenPressureLabel", label: "Green", width: 110, sortValue: t => t.greenPressureLabel ?? "",
    render: t => <span style={{ color: (t.hasGreenConfirmation || t.immediateGreenImpulse) ? C.green : C.textSub }}>
      {t.greenPressureLabel?.replace("GREEN_PRESSURE_","").replace("NO_GREEN_PRESSURE","NONE").replace(/_/g," ") ?? "—"}
    </span> },
  { key: "longVwapContextLabel", label: "VWAP", width: 120, sortValue: t => t.longVwapContextLabel ?? t.vwapContextLabel ?? "",
    render: t => {
      const lbl = t.longVwapContextLabel ?? t.vwapLongContextLabel ?? t.vwapContextLabel;
      return <span style={{ color: C.textSub }}>{lbl?.replace(/_/g," ") ?? "—"}</span>;
    }},
  { key: "warnings", label: "Warnings", width: 170, sortValue: t => (t.entryQualityWarningLabels ?? []).length,
    render: t => (t.entryQualityWarningLabels ?? []).length === 0
      ? <span style={{ color: C.textDim }}>—</span>
      : (t.entryQualityWarningLabels ?? []).map(w => <WarnBadge key={w} label={w} />) },
];

function TradesPanel({ visibleTrades, totalClosed, filterResultsByTradeId }) {
  const [selected, setSelected] = useState(null);
  if (!totalClosed) return <EmptyState msg="No closed trades yet. Thesis labels populate after entry telemetry resolves." />;
  if (!visibleTrades.length) return <EmptyState msg="No trades match the active filters." />;
  return (
    <>
      <SectionHead>Filtered Trades — {visibleTrades.length} match · {totalClosed} total closed · click a row to Explain Match</SectionHead>
      {selected && (
        <div style={{ marginBottom: 12 }}>
          <ExplainMatchDrawer
            trade={selected}
            filterResultsByTradeId={filterResultsByTradeId}
            registry={LONG_FILTER_REGISTRY}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
      <SmartTable columns={TRADES_COLS} rows={visibleTrades} rowKey={t => t.id}
        onRowClick={t => setSelected(t)}
        emptyMsg="No trades match the active filters." />
    </>
  );
}

// ─── PANEL: POLICY V2 LOG-ONLY ───────────────────────────────────────────────

const V2_DECISION_ORDER = [
  "WOULD_ALLOW_FULL", "WOULD_ALLOW_STRICT", "WOULD_ALLOW_REDUCED", "WOULD_SNIPER_ONLY",
  "WOULD_BLOCK_LOW_QUALITY", "WOULD_BLOCK_GREEN_DANGER", "WOULD_BLOCK_BULLISH_CVD",
  "WOULD_BLOCK_LONG_AUDIT_DANGER", "WOULD_BLOCK_MARKET_BREATH_DANGER",
  "WOULD_BLOCK_STALE_CONTEXT", "WOULD_BLOCK_INVALID_TELEMETRY", "WOULD_WARN_ONLY",
];

const LONG_AUDIT_ORDER = ["LONG_AUDIT_CLEAR","LONG_AUDIT_CAUTION","LONG_AUDIT_DANGER","LONG_AUDIT_HARD_DANGER"];
const BREATH_ORDER = ["LONG_BREADTH_STRONG","LONG_BREADTH_SUPPORTIVE","LONG_BREADTH_MIXED","LONG_BREADTH_HOSTILE","LONG_BREADTH_HARD_DANGER","LONG_BREADTH_STALE","LONG_BREADTH_INSUFFICIENT"];
const SNIPER_TIER_ORDER = ["SNIPER_ELITE","SNIPER_VALID","SNIPER_WATCH","SNIPER_FAIL"];
const EXEC_RANK_ORDER = ["EXECUTION_RANK_SNIPER_LOG_ONLY","EXECUTION_RANK_HIGH_LOG_ONLY","EXECUTION_RANK_VALID_LOG_ONLY","EXECUTION_RANK_WEAK_LOG_ONLY","EXECUTION_RANK_REJECT_LOG_ONLY"];

function v2Color(field, value) {
  if (field === "allow") return value ? "#00ff88" : "#ff4455";
  if (field === "longAudit") {
    if (value === "LONG_AUDIT_CLEAR") return "#00ff88";
    if (value === "LONG_AUDIT_CAUTION") return "#ffaa44";
    if (value === "LONG_AUDIT_DANGER") return "#ff8833";
    return "#ff4455";
  }
  if (field === "breath") {
    if (value === "LONG_BREADTH_STRONG" || value === "LONG_BREADTH_SUPPORTIVE") return "#00ff88";
    if (value === "LONG_BREADTH_MIXED") return "#ffaa44";
    if (value === "LONG_BREADTH_HOSTILE" || value === "LONG_BREADTH_HARD_DANGER") return "#ff4455";
    return "#8899cc";
  }
  return "#8899cc";
}

function V2Row({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.borderLo}` }}>
      <span style={{ color: C.textDim, fontSize: 9 }}>{label}</span>
      <span style={{ color: color ?? C.text, fontSize: 9, fontWeight: 700 }}>{String(value ?? "—")}</span>
    </div>
  );
}

function V2FieldBreakdown({ label, samples, field, order }) {
  const rows = useMemo(() => {
    const groups = {};
    for (const t of samples) {
      const v = t[field] ?? "(none)";
      if (!groups[v]) groups[v] = { count: 0, wins: 0, net: 0 };
      groups[v].count++;
      const pnl = getTradeClosedPnl(t);
      if (pnl !== null) {
        groups[v].net += pnl;
        if (pnl > 0) groups[v].wins++;
      }
    }
    const keys = order
      ? [...order.filter(k => groups[k]), ...Object.keys(groups).filter(k => !order.includes(k))]
      : Object.keys(groups).sort((a, b) => (groups[b]?.count ?? 0) - (groups[a]?.count ?? 0));
    return keys.map(k => ({
      label: k,
      ...groups[k],
      winRate: groups[k].count ? (groups[k].wins / groups[k].count * 100).toFixed(0) : "—",
      avg: groups[k].count ? (groups[k].net / groups[k].count).toFixed(2) : "—",
    }));
  }, [samples, field, order]);

  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHead>{label}</SectionHead>
      {rows.length === 0 ? <EmptyState msg="No data" /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6 }}>
          {rows.map(r => (
            <div key={r.label} style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3,
              padding: "6px 10px", display: "flex", justifyContent: "space-between",
            }}>
              <span style={{ fontFamily: mono, fontSize: 8, color: C.textSub }}>{clean(r.label)}</span>
              <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim }}>
                {r.count}T · {r.winRate}%W · avg {r.avg}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CANONICAL SHADOW DECISION PANEL ──────────────────────────────────────────
// Reads ONLY the canonical longShadow* fields (review cockpit item 7). The
// retired parallel Entry-Policy-V2 diagnostic fields are no longer surfaced.

const SHADOW_VERDICT_ORDER = [
  "WOULD_ALLOW_PREMIUM", "WOULD_ALLOW", "WOULD_CAUTION",
  "WOULD_BLOCK", "WOULD_HARD_BLOCK", "UNKNOWN",
];
const SHADOW_COMPONENTS = [
  ["baseGate", "Base Gate"], ["aes", "AES"], ["audit", "Danger Audit"],
  ["bucketAudit", "Bucket Audit"], ["marketContext", "Market Context"],
  ["marketBreadth", "Market Breadth"], ["runner", "Candidate Runner"],
  ["postFee10", "Post-Fee 10+"], ["dataQuality", "Data Quality"],
];

function countReasons(samples, field) {
  const counts = {};
  for (const t of samples) {
    const arr = t?.[field];
    if (!Array.isArray(arr)) continue;
    for (const r of arr) counts[r] = (counts[r] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function ReasonList({ label, samples, field, color }) {
  const rows = useMemo(() => countReasons(samples, field), [samples, field]);
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <SectionHead>{label}</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6 }}>
        {rows.map(([reason, count]) => (
          <div key={reason} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: "6px 10px", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: mono, fontSize: 8, color: color ?? C.textSub }}>{clean(reason)}</span>
            <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim }}>{count}×</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComponentVerdictBreakdown({ samples }) {
  const rows = useMemo(() => {
    return SHADOW_COMPONENTS.map(([key, label]) => {
      const counts = {};
      for (const t of samples) {
        const v = t?.longShadowComponentVerdicts?.[key];
        if (v == null) continue;
        counts[v] = (counts[v] ?? 0) + 1;
      }
      return { key, label, counts };
    }).filter(r => Object.keys(r.counts).length > 0);
  }, [samples]);
  if (rows.length === 0) return <EmptyState msg="No component verdicts in this sample" />;
  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHead>Component Verdicts</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 6 }}>
        {rows.map(r => (
          <div key={r.key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: "6px 10px" }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.text, marginBottom: 3 }}>{r.label}</div>
            <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(r.counts).sort((a, b) => b[1] - a[1]).map(([v, c]) => (
                <span key={v}>{clean(v)}: {c}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShadowDecisionPanel({ closedSamples }) {
  const n = closedSamples.length;
  const hasShadow = closedSamples.some(t => t.longShadowDecision != null);
  const allow   = closedSamples.filter(t => t.longShadowDecision === "WOULD_ALLOW" || t.longShadowDecision === "WOULD_ALLOW_PREMIUM").length;
  const caution = closedSamples.filter(t => t.longShadowDecision === "WOULD_CAUTION").length;
  const block   = closedSamples.filter(t => t.longShadowDecision === "WOULD_BLOCK" || t.longShadowDecision === "WOULD_HARD_BLOCK").length;
  const unknown = closedSamples.filter(t => t.longShadowDecision === "UNKNOWN" || t.longShadowDecision == null).length;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
        background: "#080a1a", border: "1px solid #2244aa44", borderRadius: 4, marginBottom: 16,
      }}>
        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: "#4488ff" }}>
          SHADOW DECISION — LOG ONLY
        </span>
        <span style={{ fontSize: 8, color: "#8899cc" }}>
          Canonical longShadowDecision · diagnostic only · canAffectExecution = false
        </span>
        <span style={{
          marginLeft: "auto", fontFamily: mono, fontSize: 7, fontWeight: 700, letterSpacing: 1,
          padding: "2px 7px", borderRadius: 2, background: "#12204a", color: "#4488ff", border: "1px solid #2244aa",
        }}>SHADOW_ONLY</span>
      </div>

      {!hasShadow ? (
        <EmptyState msg="No canonical shadow decisions in this sample yet." />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard label="WOULD ALLOW"   value={allow}   color="#00ff88" sub={n ? `${(allow/n*100).toFixed(0)}%` : null} />
            <StatCard label="WOULD CAUTION" value={caution} color="#ffaa44" sub={n ? `${(caution/n*100).toFixed(0)}%` : null} />
            <StatCard label="WOULD BLOCK"   value={block}   color="#ff4455" sub={n ? `${(block/n*100).toFixed(0)}%` : null} />
            <StatCard label="UNKNOWN"       value={unknown} color="#8899cc" sub={n ? `${(unknown/n*100).toFixed(0)}%` : null} />
          </div>

          <V2FieldBreakdown label="Final Verdict (longShadowDecision)" samples={closedSamples} field="longShadowDecision" order={SHADOW_VERDICT_ORDER} />
          <ComponentVerdictBreakdown samples={closedSamples} />
          <ReasonList label="Top Positive Reasons" samples={closedSamples} field="longShadowPositiveReasons" color="#55dd88" />
          <ReasonList label="Top Caution Reasons"  samples={closedSamples} field="longShadowCautionReasons"  color="#ffaa44" />
          <ReasonList label="Top Block Reasons"    samples={closedSamples} field="longShadowBlockReasons"    color="#ff6677" />
          <ReasonList label="Top Unknown Reasons"  samples={closedSamples} field="longShadowUnknownReasons"  color="#8899cc" />
        </>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

const LS_KEY = "longlab.researchCockpit.v4";

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function savePersistedState(filterState, quickFilters) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ filterState, quickFilters }));
  } catch { /* storage quota exceeded — ignore */ }
}

export default function FiltersTab({ samples, tickDirectionHealth = {} }) {
  const persisted = useMemo(loadPersistedState, []);
  // URL hash state (#f=...) takes precedence over localStorage on first load (spec §20).
  const urlState = useMemo(() => {
    try {
      const m = typeof location !== "undefined" && location.hash.match(/[#&]f=([^&]+)/);
      return m ? deserializeFilterStateFromURL(decodeURIComponent(m[1])) : null;
    } catch { return null; }
  }, []);
  const initialEffectiveState = useMemo(() => urlState ?? persisted?.filterState ?? DEFAULT_LONG_FILTER_STATE, [urlState, persisted]);
  const initialSplit = useMemo(() => splitEffectiveFilterState(initialEffectiveState), [initialEffectiveState]);
  const [filterState, setFilterState] = useState(initialSplit.filterState);
  const [quickFilters, setQuickFilters] = useState(() => urlState
    ? initialSplit.quickFilters
    : { ...initialSplit.quickFilters, ...(persisted?.quickFilters ?? {}) });
  const [innerTab, setInnerTab] = useState("winningSetups");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showCoverageDrawer, setShowCoverageDrawer] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState(null);
  const effectiveFilterState = useMemo(() => buildEngineState(filterState, quickFilters), [filterState, quickFilters]);

  const restoreEffectiveFilterState = useCallback((state) => {
    const split = splitEffectiveFilterState(state);
    setFilterState(split.filterState);
    setQuickFilters(split.quickFilters);
  }, []);

  useEffect(() => {
    savePersistedState(filterState, quickFilters);
    // Mirror the EFFECTIVE filter state (registry filters + folded quick
    // filters) into the URL hash so a shared link reproduces the exact visible
    // trade set, not just the registry portion (review cockpit item 5).
    try {
      const encoded = serializeFilterStateToURL(effectiveFilterState);
      history.replaceState(null, "", `#f=${encoded}`);
    } catch { /* ignore */ }
  }, [filterState, quickFilters, effectiveFilterState]);

  const closedSamples = useMemo(
    () => samples.filter(s =>
      (s.isFinalOutcome === true || s.closed === true) &&
      typeof s.feeAdjustedNormPnlPct === "number"
    ),
    [samples],
  );

  const gainerSamples = useMemo(
    () => closedSamples.filter(s => s.longParentBucket === "TOP_GAINER_LONGS"),
    [closedSamples],
  );

  const profitLockSamples = useMemo(
    () => closedSamples.filter(t => t.closeReason === "PROFIT_LOCK"),
    [closedSamples],
  );

  // Registry-based filtering (primary engine — single pass, no post-filter)
  const filterEngineResult = useMemo(
    () => applyLongFilterState(closedSamples, effectiveFilterState, LONG_FILTER_REGISTRY),
    [closedSamples, effectiveFilterState],
  );
  const visibleTrades = filterEngineResult.trades;
  const visiblePnlStats = useMemo(
    () => buildVisiblePnlStats(visibleTrades),
    [visibleTrades],
  );

  const registryPredicateCount = countActivePredicates(filterState);
  const resetAllFilters = () => {
    setFilterState(resetFilterState());
    setQuickFilters(QUICK_FILTER_DEFAULTS);
  };

  // Apply a curated highlight (single predicate or a combo) to the active
  // filters as a new ALL_OF group, then jump to Trades to see the result.
  const handleViewWinningSetup = useCallback((setup) => {
    if (!setup) return;
    setFilterState(prev => createWinningSetupFilterState(setup, prev, { mode: "replace" }));
    setInnerTab("trades");
  }, []);

  const handleAddWinningSetup = useCallback((setup) => {
    if (!setup) return;
    setFilterState(prev => createWinningSetupFilterState(setup, prev, { mode: "add", source: `winning-add-${setup.id}` }));
  }, []);

  const handleClearWinningSetup = useCallback(() => {
    setFilterState(prev => clearWinningSetupFilterState(prev));
  }, []);

  const handleCompareWinningSetup = useCallback((setup) => {
    if (!setup) return;
    const compareState = createWinningSetupFilterState(setup, DEFAULT_LONG_FILTER_STATE, { mode: "replace" });
    try {
      const a = { state: JSON.parse(JSON.stringify(effectiveFilterState)), label: "Current filters" };
      const b = { state: compareState, label: setup.title };
      localStorage.setItem(`${RESEARCH_COCKPIT_STORAGE_KEY}.compare`, JSON.stringify({ a, b }));
    } catch { /* localStorage unavailable */ }
    setInnerTab("cockpit");
  }, [effectiveFilterState]);

  const handleApplyHighlight = useCallback((predicates, label) => {
    const preds = (Array.isArray(predicates) ? predicates : [predicates])
      .filter(Boolean)
      .map(p => makePredicate(p.filterId, p.operator, p.value));
    if (!preds.length) return;
    setFilterState(prev => ({
      ...prev,
      groups: [
        ...prev.groups,
        makeFilterGroup({
          id: `highlight-${Date.now()}`,
          operator: GROUP_JOIN.ALL_OF,
          label: label ?? "Highlight",
          predicates: preds,
        }),
      ],
    }));
    setInnerTab("trades");
  }, []);

  const coverage = useMemo(() => computeLongFilterCoverage(closedSamples), [closedSamples]);
  const coverageSummary = useMemo(() => buildCoverageSummary(coverage), [coverage]);

  const auditRows = useMemo(() => summarizeByField(closedSamples, "longGateAuditLabel"), [closedSamples]);
  const microRows = useMemo(() => summarizeByField(closedSamples, "longMicroMomentumLabel"), [closedSamples]);
  const laneRows  = useMemo(() => summarizeByField(closedSamples, "longSubBucket"), [closedSamples]);
  const btcRows   = useMemo(() => summarizeByField(closedSamples, "btcLongContextLabel"), [closedSamples]);
  const greenRows = useMemo(() => summarizeByField(closedSamples, "greenPressureLabel"), [closedSamples]);
  const vwapRows  = useMemo(() => summarizeByField(closedSamples, "longVwapContextLabel"), [closedSamples]);
  const warnRows  = useMemo(() => summarizeByArrayField(closedSamples, "entryQualityWarningLabels"), [closedSamples]);
  const runRows   = useMemo(() => buildRunFilterSummary(samples), [samples]);

  const warnBuckets = useMemo(() => [0, 1, 2, 3].map(n => {
    const g = n === 3
      ? closedSamples.filter(t => (t.entryQualityWarningLabels?.length ?? 0) >= 3)
      : closedSamples.filter(t => (t.entryQualityWarningLabels?.length ?? 0) === n);
    const net  = g.reduce((s, t) => s + (getTradeClosedPnl(t) ?? 0), 0);
    const wins = g.filter(t => (getTradeClosedPnl(t) ?? 0) > 0).length;
    const sls  = g.filter(t => normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS).length;
    return {
      label: n === 3 ? "3+ warnings" : `${n} warning${n !== 1 ? "s" : ""}`,
      count: g.length,
      net:     parseFloat(net.toFixed(2)),
      winRate: g.length ? parseFloat((wins / g.length * 100).toFixed(1)) : 0,
      slRate:  g.length ? parseFloat((sls  / g.length * 100).toFixed(1)) : 0,
    };
  }), [closedSamples]);

  return (
    <div style={{ fontFamily: mono, fontSize: 11, color: C.text }}>
      {/* Research-mode banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        background: "#090a14", border: `1px solid #1e2a44`,
        borderRadius: 4, padding: "7px 12px", marginBottom: 10,
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: C.blue }}>RESEARCH MODE</span>
        <span style={{ color: C.border }}>│</span>
        <span style={{ fontSize: 9, color: C.textDim }}>
          All filters and policy decisions are log-only. No candidate is blocked, skipped, resized, or reprioritized.
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
          {["LOG ONLY", "SHADOW ONLY", "LIVE BLOCKING"].map((m, i) => (
            <span key={m} style={{
              fontFamily: mono, fontSize: 7, fontWeight: 700, letterSpacing: 1,
              padding: "2px 7px", borderRadius: 2,
              background: i === 0 ? "#12204a" : "transparent",
              color:      i === 0 ? C.blue    : C.border,
              border:     `1px solid ${i === 0 ? "#2244aa" : C.border}`,
            }}>{m}{i > 1 ? " 🔒" : ""}</span>
          ))}
        </div>
      </div>

      {/* Filter health strip */}
      <FilterHealthStrip
        inputCount={filterEngineResult.inputCount}
        outputCount={filterEngineResult.outputCount}
        coverageSummary={coverageSummary}
        activePredicateCount={registryPredicateCount + quickFilterActiveCount(quickFilters)}
      />

      {/* Bucket scope */}
      <BucketScopePills
        scope={filterState.scope ?? "ALL_LONGS"}
        setScope={v => setFilterState(s => ({ ...s, scope: v }))}
      />

      <WinningQuickViewStrip
        closedSamples={closedSamples}
        filterState={filterState}
        onView={handleViewWinningSetup}
        onMore={() => setInnerTab("winningSetups")}
        onClear={handleClearWinningSetup}
      />

      {/* Quick filter bar */}
      <FilterBar
        quickFilters={quickFilters}
        setQuickFilters={setQuickFilters}
        visibleCount={visibleTrades.length}
        totalCount={closedSamples.length}
        pnlStats={visiblePnlStats}
      />

      {/* Active filter summary with group operator display */}
      {countActivePredicates(effectiveFilterState) > 0 && (
        <ActiveFilterSummary
          state={effectiveFilterState}
          onRemovePredicate={(groupId, predicateIndex) => {
            if (groupId === QUICK_GROUP_ID) {
              const quickGroup = effectiveFilterState.groups.find(g => g.id === QUICK_GROUP_ID);
              setQuickFilters(prev => removeQuickPredicate(prev, quickGroup?.predicates?.[predicateIndex]));
              return;
            }
            setFilterState(prev => ({
              ...prev,
              groups: prev.groups.map(g =>
                g.id === groupId
                  ? { ...g, predicates: g.predicates.filter((_, i) => i !== predicateIndex) }
                  : g
              ).filter(g => g.predicates.length > 0),
            }));
          }}
          onRemoveOutcomeFilter={idx => {
            const predicate = effectiveFilterState.outcomeFilters?.[idx];
            if (predicate?.source === "quick") {
              setQuickFilters(prev => removeQuickPredicate(prev, predicate));
              return;
            }
            setFilterState(prev => ({
              ...prev,
              outcomeFilters: (prev.outcomeFilters ?? []).filter(item => item !== predicate),
            }));
          }}
        />
      )}

      {/* Advanced registry filters (FilterBuilder) */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
            padding: "7px 12px",
            borderBottom: showAdvancedFilters ? `1px solid ${C.borderLo}` : undefined,
            borderBottomLeftRadius: showAdvancedFilters ? 0 : 4,
            borderBottomRightRadius: showAdvancedFilters ? 0 : 4,
          }}
          onClick={() => setShowAdvancedFilters(v => !v)}
        >
          <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1, color: registryPredicateCount > 0 ? C.blue : C.textDim }}>
            ADVANCED FILTERS
          </span>
          {registryPredicateCount > 0 && (
            <span style={{ fontFamily: mono, fontSize: 8, color: C.blue }}>
              · {registryPredicateCount} registry predicate{registryPredicateCount !== 1 ? "s" : ""} active
            </span>
          )}
          {registryPredicateCount > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setFilterState(resetFilterState()); }}
              style={{
                fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1,
                padding: "2px 8px", borderRadius: 3, cursor: "pointer",
                background: "#1a0a0a", color: "#ff8866", border: "1px solid #883322",
              }}
            >Clear</button>
          )}
          <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 9, color: C.textDim }}>
            {showAdvancedFilters ? "▲" : "▾"}
          </span>
        </div>
        {showAdvancedFilters && (
          <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }}>
            {/* Top-level group operator selector */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
              borderBottom: `1px solid ${C.borderLo}`, background: C.bg,
            }}>
              <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim, letterSpacing: 1 }}>GROUPS MATCH:</span>
              {[GROUP_OPERATOR.ALL_GROUPS, GROUP_OPERATOR.ANY_GROUPS].map(op => (
                <button key={op} onClick={() => setFilterState(s => ({ ...s, groupOperator: op }))} style={{
                  fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                  padding: "3px 9px", borderRadius: 3, cursor: "pointer",
                  background: (filterState.groupOperator ?? GROUP_OPERATOR.ALL_GROUPS) === op ? "#152050" : C.surface,
                  color:      (filterState.groupOperator ?? GROUP_OPERATOR.ALL_GROUPS) === op ? C.blue    : C.textDim,
                  border:     `1px solid ${(filterState.groupOperator ?? GROUP_OPERATOR.ALL_GROUPS) === op ? "#3366cc" : C.border}`,
                }}>{op === GROUP_OPERATOR.ALL_GROUPS ? "ALL (AND)" : "ANY (OR)"}</button>
              ))}
              <button onClick={() => setShowCoverageDrawer(v => !v)} style={{
                marginLeft: "auto", fontFamily: mono, fontSize: 8, fontWeight: 700,
                padding: "3px 9px", borderRadius: 3, cursor: "pointer",
                background: showCoverageDrawer ? "#152050" : C.surface,
                color: showCoverageDrawer ? C.blue : C.textDim,
                border: `1px solid ${showCoverageDrawer ? "#3366cc" : C.border}`,
              }}>Field Coverage</button>
            </div>
            {showCoverageDrawer && <FilterCoverageDrawer coverageSummary={coverageSummary} />}
            {/* Per-group join operator for the active builder group */}
            {filterState.groups.some(g => g.id === "builder" && g.predicates.length > 0) && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                borderBottom: `1px solid ${C.borderLo}`, background: C.bg,
              }}>
                <span style={{ fontFamily: mono, fontSize: 8, color: C.textDim, letterSpacing: 1 }}>PREDICATES JOIN:</span>
                {[GROUP_JOIN.ALL_OF, GROUP_JOIN.ANY_OF, GROUP_JOIN.NONE_OF].map(op => {
                  const builderGroup = filterState.groups.find(g => g.id === "builder");
                  const active = (builderGroup?.operator ?? GROUP_JOIN.ALL_OF) === op;
                  return (
                    <button key={op} onClick={() => setFilterState(prev => ({
                      ...prev,
                      groups: prev.groups.map(g => g.id === "builder" ? { ...g, operator: op } : g),
                    }))} style={{
                      fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                      padding: "3px 9px", borderRadius: 3, cursor: "pointer",
                      background: active ? "#152050" : C.surface,
                      color: active ? C.blue : C.textDim,
                      border: `1px solid ${active ? "#3366cc" : C.border}`,
                    }}>{op.replace("_OF", "")}</button>
                  );
                })}
              </div>
            )}
            <FilterBuilder
              scope={filterState.scope ?? "ALL_LONGS"}
              onAddPredicate={pred => {
                setFilterState(prev => {
                  const builderGroup = prev.groups.find(g => g.id === "builder");
                  if (builderGroup) {
                    return {
                      ...prev,
                      groups: prev.groups.map(g =>
                        g.id === "builder"
                          ? { ...g, predicates: [...g.predicates, pred] }
                          : g
                      ),
                    };
                  }
                  return {
                    ...prev,
                    groups: [...prev.groups, makeFilterGroup({ id: "builder", operator: GROUP_JOIN.ALL_OF, predicates: [pred] })],
                  };
                });
              }}
            />
          </div>
        )}
      </div>

      {/* Inner navigation */}
      <InnerNav active={innerTab} onChange={t => { setInnerTab(t); }} />

      {/* Content */}
      {innerTab === "winningSetups" && (
        <WinningSetupsPanel
          closedSamples={closedSamples}
          filterState={filterState}
          onView={handleViewWinningSetup}
          onAdd={handleAddWinningSetup}
          onCompare={handleCompareWinningSetup}
        />
      )}
      {innerTab === "highlights" && (
        <HighlightTab closedSamples={closedSamples} onApply={handleApplyHighlight} />
      )}
      {innerTab === "overview" && (
        <OverviewPanel closedSamples={closedSamples} auditRows={auditRows} />
      )}
      {innerTab === "signals" && (
        <SignalsPanel
          closedSamples={closedSamples}
          microRows={microRows}
          laneRows={laneRows}
          btcRows={btcRows}
        />
      )}
      {innerTab === "pressure" && (
        <PressurePanel
          closedSamples={closedSamples}
          greenRows={greenRows}
          vwapRows={vwapRows}
          warnRows={warnRows}
          warnBuckets={warnBuckets}
        />
      )}
      {innerTab === "bestDna" && (
        <BestDnaPanel
          closedSamples={closedSamples}
          visibleTrades={visibleTrades}
          quickFilters={quickFilters}
          setQuickFilters={setQuickFilters}
        />
      )}
      {innerTab === "gainerContinuation" && (
        <GainerContinuationPanel gainerSamples={gainerSamples} />
      )}
      {innerTab === "exitHealth" && (
        <ExitHealthPanel
          closedSamples={closedSamples}
          profitLockSamples={profitLockSamples}
          gainerSamples={gainerSamples}
        />
      )}
      {innerTab === "runs" && (
        <RunsPanel runRows={runRows} />
      )}
      {innerTab === "trades" && (
        <TradesPanel visibleTrades={visibleTrades} totalClosed={closedSamples.length}
          filterResultsByTradeId={filterEngineResult.filterResultsByTradeId} />
      )}
      {innerTab === "cockpit" && (
        <CockpitToolsPanel closedSamples={closedSamples} filterState={filterState} setFilterState={setFilterState} effectiveFilterState={effectiveFilterState} onRestoreEffectiveState={restoreEffectiveFilterState} />
      )}
      {innerTab === "policyV2" && (
        <ShadowDecisionPanel closedSamples={closedSamples} />
      )}
      {innerTab === "tickDirection" && (
        <TickDirectionLabPanel samples={samples} streamHealth={tickDirectionHealth} />
      )}
    </div>
  );
}
