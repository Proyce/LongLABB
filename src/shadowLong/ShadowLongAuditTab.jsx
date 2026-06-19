import { useState, useMemo } from "react";
import { summarizeShadowLongs, computeHorizonStats, buildAnalyticsTables, buildHypothesisComparison } from "./shadowLongAnalytics.js";
import { DEFAULT_SHADOW_LONG_FILTER_STATE, applyShadowLongFilters, buildShadowLongFilterOptions } from "./shadowLongFilters.js";
import ShadowLongInspectionDrawer from "./ShadowLongInspectionDrawer.jsx";

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
  green:    _tk.long,
  red:      _tk.short,
  amber:    _tk.warn,
  blue:     _tk.info,
  purple:   _tk.accent,
  muted:    _tk.textDim,
};

const mono = _tkFont.mono;

// ─── UTILS ───────────────────────────────────────────────────────────────────

const f2  = n => (n != null && Number.isFinite(n)) ? Number(n).toFixed(2) : "—";
const f3  = n => (n != null && Number.isFinite(n)) ? Number(n).toFixed(3) : "—";
const pct = (n, prefix = true) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${prefix && n >= 0 ? "+" : ""}${f2(n)}%`;
};
const pnlColor  = n => (n == null || !Number.isFinite(n)) ? C.textDim : n > 0 ? C.green : n < 0 ? C.red : C.muted;
const ratioDisp = r => r != null ? `${Number(r).toFixed(2)}x` : "—";
const fMs  = ms => {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
};
const fTime = ts => ts ? new Date(ts).toISOString().slice(11, 19) : "—";
const confidenceColor = (label) => {
  if (label === "RESEARCH_WORTHY") return C.green;
  if (label === "DEVELOPING")      return C.amber;
  return C.red;
};

// ─── BASE COMPONENTS ─────────────────────────────────────────────────────────

function Pill({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
      padding: "4px 9px", borderRadius: 3, cursor: "pointer",
      background: on ? "#152050" : C.surface,
      color:      on ? C.blue    : C.textSub,
      border:     `1px solid ${on ? "#3366cc" : C.border}`,
    }}>{children}</button>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 4, padding: "10px 14px", ...style,
    }}>{children}</div>
  );
}

function MetricCard({ label, value, color, sub }) {
  return (
    <Card style={{ minWidth: 110, flex: 1 }}>
      <div style={{ color: C.textDim, fontSize: 8, letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color ?? C.text, fontFamily: mono, fontSize: 16, fontWeight: 700 }}>{value ?? "—"}</div>
      {sub && <div style={{ color: C.textDim, fontSize: 8, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "18px 0 8px" }}>
      <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.muted }}>{title}</span>
      {sub && <span style={{ fontSize: 8, color: C.textDim }}>{sub}</span>}
    </div>
  );
}

function ObserverBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "7px 14px",
      background: "#08050a", border: "1px solid #aa66ff44", borderRadius: 4,
      marginBottom: 12,
    }}>
      <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.purple }}>
        SHADOW LONG OBSERVER
      </span>
      <span style={{ fontSize: 8, color: C.textDim }}>
        No real LONG orders · No entry blocking · No effect on LongLAB PnL
      </span>
    </div>
  );
}

function ConfidenceBadge({ label, n }) {
  return (
    <span style={{
      fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
      padding: "2px 7px", borderRadius: 3,
      background: "#0a0a1a",
      color: confidenceColor(label),
      border: `1px solid ${confidenceColor(label)}44`,
    }}>
      {label?.replace(/_/g, " ")} · N={n}
    </span>
  );
}

// ─── OUTCOME BADGE ────────────────────────────────────────────────────────────

function OutcomeBadge({ label }) {
  if (!label) return <span style={{ color: C.textDim, fontSize: 8 }}>—</span>;
  const clean = label.replace(/^SHADOW_LONG_/, "").replace(/_/g, " ");
  let color = C.muted;
  if (label.includes("PROFIT"))   color = C.green;
  else if (label.includes("FULL_RESCUE")) color = "#55ff99";
  else if (label.includes("PARTIAL"))    color = C.amber;
  else if (label.includes("ADDED_TO"))   color = C.red;
  else if (label.includes("WHIPSAW"))    color = "#ff2222";
  else if (label.includes("NO_RECOV"))   color = "#cc4444";
  return <span style={{ fontFamily: mono, fontSize: 8, color }}>{clean}</span>;
}

// ─── FILTER PANEL ─────────────────────────────────────────────────────────────

const FILTER_GROUPS = [
  {
    heading: "TRIGGER",
    pills: [
      { key: "hypothesisEligibleOnly", label: "Hypothesis Eligible", toggle: true },
      { key: "selectedDurationLabels", value: "SHORT_SL_WITHIN_15S",  label: "≤15s" },
      { key: "selectedDurationLabels", value: "SHORT_SL_WITHIN_30S",  label: "≤30s" },
      { key: "selectedDurationLabels", value: "SHORT_SL_WITHIN_60S",  label: "≤60s" },
      { key: "selectedDurationLabels", value: "SHORT_SL_WITHIN_120S", label: "≤2m" },
      { key: "selectedDurationLabels", value: "SHORT_SL_WITHIN_180S", label: "≤3m" },
    ],
  },
  {
    heading: "ATR",
    pills: [
      { key: "selectedAtrClasses", value: "ATR_MEDIUM",    label: "Medium" },
      { key: "selectedAtrClasses", value: "ATR_HIGH",      label: "High" },
      { key: "selectedAtrClasses", value: "ATR_VERY_HIGH", label: "Very High" },
      { key: "selectedAtrClasses", value: "ATR_EXTREME",   label: "Extreme" },
    ],
  },
  {
    heading: "OUTCOME",
    pills: [
      { key: "selectedOutcomeLabels", value: "SHADOW_LONG_FULL_RESCUE_AND_PROFIT", label: "Full Rescue + Profit" },
      { key: "selectedOutcomeLabels", value: "SHADOW_LONG_FULL_RESCUE_ONLY",       label: "Full Rescue" },
      { key: "selectedOutcomeLabels", value: "SHADOW_LONG_PARTIAL_RECOVERY",       label: "Partial Recovery" },
      { key: "selectedOutcomeLabels", value: "SHADOW_LONG_NO_RECOVERY",            label: "No Recovery" },
      { key: "selectedOutcomeLabels", value: "SHADOW_LONG_ADDED_TO_LOSS",          label: "Added Loss" },
      { key: "showOnlyWhipsaw", label: "Whipsaw", toggle: true },
    ],
  },
  {
    heading: "PNL",
    pills: [
      { key: "showOnlyLongWinners",     label: "LONG Winner",     toggle: true },
      { key: "showOnlyLongLosers",      label: "LONG Loser",      toggle: true },
      { key: "showOnlyCombinedWinners", label: "Combined Winner", toggle: true },
    ],
  },
  {
    heading: "CONTEXT",
    pills: [
      { key: "selectedBtcDirections", value: "UP",   label: "BTC Up" },
      { key: "selectedBtcDirections", value: "DOWN", label: "BTC Down" },
      { key: "selectedEthDirections", value: "UP",   label: "ETH Up" },
      { key: "selectedEthDirections", value: "DOWN", label: "ETH Down" },
    ],
  },
  {
    heading: "QUALITY",
    pills: [
      { key: "showOnlyDataWarnings", label: "Data Warnings", toggle: true },
    ],
  },
];

function FilterPanel({ filters, onChange }) {
  function toggleArr(key, value) {
    const cur = filters[key] ?? [];
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
    onChange({ ...filters, [key]: next });
  }
  function toggleBool(key) {
    onChange({ ...filters, [key]: !filters[key] });
  }
  function isOn(key, value) {
    if (value === undefined) return !!filters[key];
    return (filters[key] ?? []).includes(value);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
      {FILTER_GROUPS.map(g => (
        <div key={g.heading}>
          <div style={{ fontFamily: mono, fontSize: 7, color: C.textDim, letterSpacing: 1, marginBottom: 4 }}>
            {g.heading}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {g.pills.map(p => (
              <Pill
                key={`${p.key}-${p.value ?? "t"}`}
                on={isOn(p.key, p.value)}
                onClick={() => p.toggle ? toggleBool(p.key) : toggleArr(p.key, p.value)}
              >
                {p.label}
              </Pill>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        <button
          onClick={() => onChange(DEFAULT_SHADOW_LONG_FILTER_STATE)}
          style={{
            fontFamily: mono, fontSize: 8, padding: "4px 10px", borderRadius: 3, cursor: "pointer",
            background: "none", border: `1px solid ${C.border}`, color: C.textDim,
          }}
        >
          RESET FILTERS
        </button>
      </div>
    </div>
  );
}

// ─── SUMMARY CARDS ────────────────────────────────────────────────────────────

function SummaryCards({ summary, activeCount, completedCount }) {
  if (!summary) return null;
  const { longAvg, combAvg, fullRescueRate, partRescueRate, whipsawRate, avgRecoveryRatio,
    win1mRate, win3mRate, win5mRate, longWinRate, sampleConfidence, completed } = summary;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      <MetricCard label="ACTIVE"     value={activeCount}    color={C.blue} />
      <MetricCard label="COMPLETED"  value={completedCount} color={C.textSub} />
      <MetricCard label="LONG NET AVG"    value={pct(longAvg)} color={pnlColor(longAvg)} sub="fee-net 1x" />
      <MetricCard label="FLIP NET AVG"    value={pct(combAvg)} color={pnlColor(combAvg)} sub="compounded margin" />
      <MetricCard label="LONG WIN %"      value={`${f2(longWinRate)}%`} color={pnlColor(longWinRate - 50)} />
      <MetricCard label="FULL RESCUE %"   value={`${f2(fullRescueRate)}%`} color={fullRescueRate >= 50 ? C.green : C.amber} />
      <MetricCard label="PARTIAL RESCUE %" value={`${f2(partRescueRate)}%`} color={C.amber} />
      <MetricCard label="WHIPSAW %"       value={`${f2(whipsawRate)}%`} color={whipsawRate > 20 ? C.red : C.muted} />
      <MetricCard label="AVG RECOVERY"    value={ratioDisp(avgRecoveryRatio)} color={avgRecoveryRatio >= 1 ? C.green : C.amber} />
      <MetricCard label="1m WIN %"        value={`${f2(win1mRate)}%`}  color={pnlColor((win1mRate ?? 50) - 50)} />
      <MetricCard label="3m WIN %"        value={`${f2(win3mRate)}%`}  color={pnlColor((win3mRate ?? 50) - 50)} />
      <MetricCard label="5m WIN %"        value={`${f2(win5mRate)}%`}  color={pnlColor((win5mRate ?? 50) - 50)} />
      <div style={{ display: "flex", alignItems: "center", marginLeft: 4 }}>
        <ConfidenceBadge label={sampleConfidence} n={completed} />
      </div>
    </div>
  );
}

// ─── ACTIVE TABLE ─────────────────────────────────────────────────────────────

function ActiveTable({ audits, onInspect }) {
  if (!audits.length) return (
    <div style={{ color: C.textDim, fontFamily: mono, fontSize: 9, padding: "14px 0" }}>
      No active Shadow LONG audits
    </div>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 9 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.borderLo}`, color: C.textDim }}>
            {["Symbol", "Run", "Bucket", "SL Time", "SHORT Dur", "ATR", "AES",
              "LONG Entry", "Current", "Live Flip", "MFE", "Recovery", "BTC", "ETH", "Age", "Prec"].map(h => (
              <th key={h} style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, fontSize: 8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {audits.map(a => {
            const age = a.shadowLongEntryTime ? Date.now() - a.shadowLongEntryTime : null;
            const liveGross = a.currentPrice && a.shadowLongEntryPrice
              ? ((a.currentPrice - a.shadowLongEntryPrice) / a.shadowLongEntryPrice) * 100
              : null;
            const liveFlipMargin = liveGross != null
              ? (liveGross - 0.14) * (a.shadowLongLeverage ?? 5) + (a.sourceShortFeeNetMarginPnlPct ?? 0)
              : null;
            const rowColor = liveFlipMargin != null
              ? (liveFlipMargin > 0 ? "#0a1a0a" : liveFlipMargin > -2 ? "#1a120a" : "#1a0a0a")
              : C.bg;
            const borderLeft = a.shadowLongHypothesisEligible ? `2px solid ${C.purple}` : `2px solid transparent`;

            return (
              <tr key={a.id} style={{ borderBottom: `1px solid ${C.borderLo}`, background: rowColor, cursor: "pointer" }}
                  onClick={() => onInspect?.(a)}>
                <td style={{ padding: "5px 8px", borderLeft, color: C.text, fontWeight: 700 }}>{a.symbol}</td>
                <td style={{ padding: "5px 8px", color: C.textDim }}>{a.sourceShortRun ?? "—"}</td>
                <td style={{ padding: "5px 8px", color: C.textDim, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {(a.sourceShortParentBucket ?? "—").replace("TOP_", "").replace("_SHORTS", "")}
                </td>
                <td style={{ padding: "5px 8px", color: C.textDim }}>{fTime(a.sourceShortClosedAt)}</td>
                <td style={{ padding: "5px 8px", color: C.amber }}>{fMs(a.sourceShortDurationMs)}</td>
                <td style={{ padding: "5px 8px", color: C.textSub }}>{a.atrPct != null ? f3(a.atrPct) : "—"}</td>
                <td style={{ padding: "5px 8px", color: C.textSub }}>{a.aes ?? "—"}</td>
                <td style={{ padding: "5px 8px", color: C.textDim }}>{a.shadowLongEntryPrice != null ? a.shadowLongEntryPrice.toFixed(4) : "—"}</td>
                <td style={{ padding: "5px 8px", color: C.text }}>{a.currentPrice != null ? a.currentPrice.toFixed(4) : "—"}</td>
                <td style={{ padding: "5px 8px", color: pnlColor(liveFlipMargin) }}>{pct(liveFlipMargin)}</td>
                <td style={{ padding: "5px 8px", color: C.green }}>{pct(a.grossMfeNormPct, false)}↑</td>
                <td style={{ padding: "5px 8px", color: pnlColor((a.shortLossRecoveryRatio ?? 0) - 1) }}>{ratioDisp(a.shortLossRecoveryRatio)}</td>
                <td style={{ padding: "5px 8px", color: a.btcDirection === "UP" ? C.green : a.btcDirection === "DOWN" ? C.red : C.muted }}>
                  {a.btcDirection ?? "—"}
                </td>
                <td style={{ padding: "5px 8px", color: a.ethDirection === "UP" ? C.green : a.ethDirection === "DOWN" ? C.red : C.muted }}>
                  {a.ethDirection ?? "—"}
                </td>
                <td style={{ padding: "5px 8px", color: C.textDim }}>{age ? fMs(age) : "—"}</td>
                <td style={{ padding: "5px 8px", color: a.samplingPrecision === "REALTIME" ? C.green : C.amber, fontSize: 7 }}>
                  {a.samplingPrecision === "REALTIME" ? "RT" : "COARSE"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── COMPLETED TABLE ──────────────────────────────────────────────────────────

function CompletedTable({ audits, onInspect }) {
  const [sortCol, setSortCol] = useState("closedAt");
  const [sortDir, setSortDir] = useState("desc");

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const sorted = useMemo(() => {
    return [...audits].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (va == null) va = sortDir === "asc" ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === "asc" ? Infinity : -Infinity;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [audits, sortCol, sortDir]);

  if (!audits.length) return (
    <div style={{ color: C.textDim, fontFamily: mono, fontSize: 9, padding: "14px 0" }}>
      No completed Shadow LONG audits yet
    </div>
  );

  const Th = ({ col, children }) => (
    <th onClick={() => toggleSort(col)} style={{
      padding: "4px 8px", textAlign: "left", fontWeight: 600, fontSize: 8,
      cursor: "pointer", color: sortCol === col ? C.blue : C.textDim,
      userSelect: "none",
    }}>
      {children}{sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 9 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.borderLo}` }}>
            <Th col="symbol">Symbol</Th>
            <Th col="sourceShortRun">Run</Th>
            <Th col="sourceShortDurationMs">SHORT Dur</Th>
            <Th col="atrPct">ATR</Th>
            <Th col="aes">AES</Th>
            <Th col="sourceShortFeeNetMarginPnlPct">SHORT Net</Th>
            <Th col="mirrorFeeNetNormPnlPct">Mirror Net</Th>
            <Th col="atrProfileFeeNetNormPnlPct">ATR Net</Th>
            <Th col="combinedCompoundedMarginPnlPct">Flip Net</Th>
            <Th col="shortLossRecoveryRatio">Recovery</Th>
            <Th col="feeNetPnlAt60sNormPct">1m</Th>
            <Th col="feeNetPnlAt180sNormPct">3m</Th>
            <Th col="feeNetPnlAt300sNormPct">5m</Th>
            <Th col="grossMfeNormPct">MFE</Th>
            <Th col="grossMaeNormPct">MAE</Th>
            <Th col="mirrorCloseReason">Close</Th>
            <th style={{ padding: "4px 8px", fontSize: 8, color: C.textDim }}>Outcome</th>
            <th style={{ padding: "4px 8px", fontSize: 8, color: C.textDim }}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(a => {
            const isWipsaw = (a.sourceShortDurationMs ?? Infinity) <= 60_000 && a.mirrorCloseReason === "SL" && (a.durationMs ?? Infinity) <= 60_000;
            const rowBg = isWipsaw ? "#1a0505" : (a.combinedCompoundedMarginPnlPct ?? -1) > 0 ? "#0a1a0a" : "#0f0f1a";
            const borderLeft = a.shadowLongHypothesisEligible ? `2px solid ${C.purple}` : `2px solid transparent`;

            return (
              <tr key={a.id} style={{ borderBottom: `1px solid ${C.borderLo}`, background: rowBg }}>
                <td style={{ padding: "5px 8px", borderLeft, color: C.text, fontWeight: 700 }}>{a.symbol}</td>
                <td style={{ padding: "5px 8px", color: C.textDim }}>{a.sourceShortRun ?? "—"}</td>
                <td style={{ padding: "5px 8px", color: C.amber }}>{fMs(a.sourceShortDurationMs)}</td>
                <td style={{ padding: "5px 8px", color: C.textSub }}>{a.atrPct != null ? f3(a.atrPct) : "—"}</td>
                <td style={{ padding: "5px 8px", color: C.textSub }}>{a.aes ?? "—"}</td>
                <td style={{ padding: "5px 8px", color: pnlColor(a.sourceShortFeeNetMarginPnlPct) }}>{pct(a.sourceShortFeeNetMarginPnlPct)}</td>
                <td style={{ padding: "5px 8px", color: pnlColor(a.mirrorFeeNetNormPnlPct) }}>{pct(a.mirrorFeeNetNormPnlPct)}</td>
                <td style={{ padding: "5px 8px", color: pnlColor(a.atrProfileFeeNetNormPnlPct) }}>{pct(a.atrProfileFeeNetNormPnlPct)}</td>
                <td style={{ padding: "5px 8px", color: pnlColor(a.combinedCompoundedMarginPnlPct), fontWeight: 700 }}>
                  {pct(a.combinedCompoundedMarginPnlPct)}
                </td>
                <td style={{ padding: "5px 8px", color: pnlColor((a.shortLossRecoveryRatio ?? 0) - 1) }}>{ratioDisp(a.shortLossRecoveryRatio)}</td>
                <td style={{ padding: "5px 8px", color: pnlColor(a.feeNetPnlAt60sNormPct) }}>{pct(a.feeNetPnlAt60sNormPct)}</td>
                <td style={{ padding: "5px 8px", color: pnlColor(a.feeNetPnlAt180sNormPct) }}>{pct(a.feeNetPnlAt180sNormPct)}</td>
                <td style={{ padding: "5px 8px", color: pnlColor(a.feeNetPnlAt300sNormPct) }}>{pct(a.feeNetPnlAt300sNormPct)}</td>
                <td style={{ padding: "5px 8px", color: C.green }}>{pct(a.grossMfeNormPct, false)}</td>
                <td style={{ padding: "5px 8px", color: C.red }}>{pct(a.grossMaeNormPct, false)}</td>
                <td style={{ padding: "5px 8px", color: C.textDim, fontSize: 8 }}>{a.mirrorCloseReason ?? "—"}</td>
                <td style={{ padding: "5px 8px" }}><OutcomeBadge label={a.outcomeLabel} /></td>
                <td style={{ padding: "5px 8px" }}>
                  <button onClick={() => onInspect?.(a)} style={{
                    background: "none", border: `1px solid ${C.border}`, color: C.blue,
                    fontFamily: mono, fontSize: 8, padding: "2px 7px", cursor: "pointer", borderRadius: 3,
                  }}>INSPECT</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── ANALYTICS TABLE ──────────────────────────────────────────────────────────

function AnalyticsTable({ rows, title }) {
  if (!rows?.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionHeader title={title} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 8 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.borderLo}`, color: C.textDim }}>
              {["Label", "N", "LONG Avg", "Flip Avg", "LONG Win%", "Full Rescue%", "Partial%", "Whipsaw%", "Avg Recovery", "Avg MFE", "1m%", "3m%", "5m%", "PF"].map(h => (
                <th key={h} style={{ padding: "3px 8px", textAlign: "left", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} style={{ borderBottom: `1px solid ${C.borderLo}` }}>
                <td style={{ padding: "4px 8px", color: C.text, fontWeight: 600 }}>
                  {String(r.label).replace(/_/g, " ")}
                </td>
                <td style={{ padding: "4px 8px", color: C.textDim }}>
                  {r.completed}
                  <span style={{ color: confidenceColor(r.sampleConfidence), marginLeft: 3, fontSize: 7 }}>
                    {r.sampleConfidence === "RESEARCH_WORTHY" ? "✓" : r.sampleConfidence === "DEVELOPING" ? "~" : "!"}
                  </span>
                </td>
                <td style={{ padding: "4px 8px", color: pnlColor(r.longAvg) }}>{pct(r.longAvg)}</td>
                <td style={{ padding: "4px 8px", color: pnlColor(r.combAvg), fontWeight: 700 }}>{pct(r.combAvg)}</td>
                <td style={{ padding: "4px 8px", color: pnlColor((r.longWinRate ?? 50) - 50) }}>{f2(r.longWinRate)}%</td>
                <td style={{ padding: "4px 8px", color: r.fullRescueRate >= 50 ? C.green : C.amber }}>{f2(r.fullRescueRate)}%</td>
                <td style={{ padding: "4px 8px", color: C.amber }}>{f2(r.partRescueRate)}%</td>
                <td style={{ padding: "4px 8px", color: r.whipsawRate > 20 ? C.red : C.muted }}>{f2(r.whipsawRate)}%</td>
                <td style={{ padding: "4px 8px", color: pnlColor((r.avgRecoveryRatio ?? 0) - 1) }}>{ratioDisp(r.avgRecoveryRatio)}</td>
                <td style={{ padding: "4px 8px", color: C.green }}>{pct(r.avgMfe, false)}</td>
                <td style={{ padding: "4px 8px", color: pnlColor((r.win1mRate ?? 50) - 50) }}>{f2(r.win1mRate)}%</td>
                <td style={{ padding: "4px 8px", color: pnlColor((r.win3mRate ?? 50) - 50) }}>{f2(r.win3mRate)}%</td>
                <td style={{ padding: "4px 8px", color: pnlColor((r.win5mRate ?? 50) - 50) }}>{f2(r.win5mRate)}%</td>
                <td style={{ padding: "4px 8px", color: r.profitFactor >= 1 ? C.green : C.red }}>{r.profitFactor != null ? f2(r.profitFactor) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── HYPOTHESIS COMPARISON ────────────────────────────────────────────────────

function HypothesisComparison({ groups }) {
  const items = [groups.strictHypothesis, groups.lowAtrComparison, groups.slowSlComparison];
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
      {items.map(g => g && (
        <Card key={g.label} style={{ minWidth: 180, flex: 1 }}>
          <div style={{ fontFamily: mono, fontSize: 8, color: C.muted, marginBottom: 6, letterSpacing: 0.8 }}>{g.label}</div>
          <div style={{ fontFamily: mono, fontSize: 7, color: C.textDim, marginBottom: 2 }}>N={g.completed ?? 0}</div>
          <div style={{ color: pnlColor(g.combAvg), fontFamily: mono, fontSize: 14, fontWeight: 700 }}>{pct(g.combAvg)}</div>
          <div style={{ color: C.textDim, fontSize: 7, marginTop: 2 }}>flip avg</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 7 }}>
            <span style={{ color: g.fullRescueRate >= 50 ? C.green : C.amber }}>{f2(g.fullRescueRate)}% rescue</span>
            <span style={{ color: g.whipsawRate > 20 ? C.red : C.muted }}>{f2(g.whipsawRate)}% whipsaw</span>
          </div>
          <ConfidenceBadge label={g.sampleConfidence} n={g.completed ?? 0} />
        </Card>
      ))}
    </div>
  );
}

// ─── INNER TABS ───────────────────────────────────────────────────────────────

const INNER_TABS = [
  { id: "active",    label: "ACTIVE" },
  { id: "completed", label: "COMPLETED" },
  { id: "analytics", label: "ANALYTICS" },
];

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export default function ShadowLongAuditTab({ shadowLongAudits = [] }) {
  const [innerTab, setInnerTab]     = useState("active");
  const [filters,  setFilters]      = useState(DEFAULT_SHADOW_LONG_FILTER_STATE);
  const [inspecting, setInspecting] = useState(null);

  const activeAudits    = useMemo(() => shadowLongAudits.filter(a => a.status === "ACTIVE" || a.status === "PENDING_ENTRY"), [shadowLongAudits]);
  const completedAudits = useMemo(() => shadowLongAudits.filter(a => a.status === "COMPLETED"), [shadowLongAudits]);

  const filteredActive    = useMemo(() => applyShadowLongFilters(activeAudits, filters), [activeAudits, filters]);
  const filteredCompleted = useMemo(() => applyShadowLongFilters(completedAudits, filters), [completedAudits, filters]);

  const summary  = useMemo(() => summarizeShadowLongs(completedAudits), [completedAudits]);
  const analytics = useMemo(() => buildAnalyticsTables(completedAudits), [completedAudits]);

  return (
    <div style={{ padding: "16px 20px", fontFamily: mono, color: C.text, minHeight: 300 }}>
      <ObserverBanner />

      <SummaryCards
        summary={summary}
        activeCount={activeAudits.length}
        completedCount={completedAudits.length}
      />

      <FilterPanel filters={filters} onChange={setFilters} />

      {/* Inner tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.borderLo}`, marginBottom: 14 }}>
        {INNER_TABS.map(t => (
          <button key={t.id} onClick={() => setInnerTab(t.id)} style={{
            background: "transparent", border: "none", padding: "8px 14px",
            fontFamily: mono, fontSize: 8, letterSpacing: 1.2, cursor: "pointer",
            borderBottom: innerTab === t.id ? `2px solid ${C.purple}` : "2px solid transparent",
            color: innerTab === t.id ? C.purple : C.textDim,
          }}>
            {t.id === "active"    ? `${t.label} (${filteredActive.length})` :
             t.id === "completed" ? `${t.label} (${filteredCompleted.length})` : t.label}
          </button>
        ))}
      </div>

      {innerTab === "active" && (
        <ActiveTable audits={filteredActive} onInspect={setInspecting} />
      )}

      {innerTab === "completed" && (
        <CompletedTable audits={filteredCompleted} onInspect={setInspecting} />
      )}

      {innerTab === "analytics" && (
        <div>
          {analytics.hypothesisVsComp && (
            <>
              <SectionHeader title="HYPOTHESIS TEST — ATR + DURATION GROUPS" />
              <HypothesisComparison groups={analytics.hypothesisVsComp} />
            </>
          )}
          <AnalyticsTable rows={analytics.byDurationLabel}  title="BY SOURCE DURATION" />
          <AnalyticsTable rows={analytics.byAtrClass}       title="BY ATR CLASS" />
          <AnalyticsTable rows={analytics.bySourceBucket}   title="BY SOURCE BUCKET" />
          <AnalyticsTable rows={analytics.byOutcome}        title="BY OUTCOME" />
          <AnalyticsTable rows={analytics.byAesBand}        title="BY AES BAND" />
          <AnalyticsTable rows={analytics.byBtcDirection}   title="BY BTC DIRECTION" />
          <AnalyticsTable rows={analytics.byCvd}            title="BY CVD LABEL" />
          <AnalyticsTable rows={analytics.byLast3Ticks}     title="BY LAST 3 TICKS" />
        </div>
      )}

      {inspecting && (
        <ShadowLongInspectionDrawer
          audit={inspecting}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  );
}
