// ─── AES DISCOVERY TAB ────────────────────────────────────────────────────────
// LOG ONLY · NO ORDERS · BINANCE-WIDE RESEARCH

import { useState, useMemo } from "react";
import { SmartTable } from "../SmartTable.jsx";
import { AES_DISCOVERY_CONFIG } from "./aesDiscoveryConfig.js";
import { buildAesDiscoveryAnalyticsReport,
         DISCOVERY_EVENT_CSV_HEADERS, discoveryEventCSVRow,
         SHADOW_TRADE_CSV_HEADERS, shadowTradeCSVRow,
         exportCSV, exportJSON } from "./aesDiscoveryAnalytics.js";
import { classifyNConfidence } from "./aesDiscoveryLabels.js";
import { CLOSE_REASON, normalizeLongCloseReason } from "../lifecycle/closeReasons.js";

import { color as _tk } from "../ui/tokens.js";

const C = {
  bg:     _tk.bg,
  panel:  _tk.surfaceLo,
  border: _tk.border,
  border2:_tk.borderHi,
  green:  _tk.long,
  orange: _tk.warn,
  red:    _tk.short,
  blue:   _tk.info,
  text:   _tk.text,
  dim:    _tk.textDim,
  accent: _tk.accent,
};

const S = {
  safetyBanner: {
    display: "flex", alignItems: "center", gap: 12,
    background: "linear-gradient(90deg,#0a0030,#06001a)",
    border: "1px solid #7055cc44",
    borderRadius: 4, padding: "8px 14px", marginBottom: 10,
    fontSize: 9, letterSpacing: 2, fontWeight: 700,
  },
  pill: (c) => ({
    padding: "2px 8px", borderRadius: 3,
    border: `1px solid ${c}55`,
    background: `${c}11`, color: c,
    fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
  }),
  card: {
    background: C.panel, border: `1px solid ${C.border2}`,
    borderRadius: 4, padding: "10px 14px", minWidth: 100,
  },
  statCard: (c = C.green) => ({
    background: C.panel, border: `1px solid ${C.border2}`,
    borderTop: `2px solid ${c}44`, borderRadius: 4, padding: "10px 14px",
    minWidth: 100, position: "relative",
  }),
  grid: {
    display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8,
  },
  row: {
    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  },
  secLbl: {
    fontSize: 8, color: "#3a4878", letterSpacing: 3, fontWeight: 700,
    textTransform: "uppercase", padding: "4px 0", borderBottom: "1px solid #0e0e1e",
    marginBottom: 8,
  },
  filter: {
    background: "transparent", border: `1px solid ${C.border2}`,
    color: C.text, padding: "3px 8px", borderRadius: 3,
    fontFamily: "Space Mono,monospace", fontSize: 9, cursor: "pointer",
  },
};

function SC({ label, value, sub, c = C.green }) {
  return (
    <div style={S.statCard(c)}>
      <div style={{ fontSize: 7, color: C.dim, letterSpacing: 2.5, marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Space Mono", color: c, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#6888a8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Sect({ title, children, collapsible }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ ...S.secLbl, display: "flex", alignItems: "center", gap: 8, cursor: collapsible ? "pointer" : "default" }}
           onClick={() => collapsible && setOpen(o => !o)}>
        {collapsible && <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span>}
        {title}
      </div>
      {open && children}
    </div>
  );
}

function pct(v) { return v != null ? `${v.toFixed(2)}%` : "—"; }
function num(v) { return v != null ? v.toFixed(2) : "—"; }
function fint(v) { return v != null ? String(Math.round(v)) : "—"; }
function fTime(ms) {
  if (ms == null) return "—";
  if (ms < 60_000)  return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}
function fTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.toISOString().slice(11, 19)}Z`;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AesDiscoveryTab({
  discoveryEvents = [],
  shadowTrades    = [],
  scannerHealth   = {},
  universeMeta    = {},
  queueSnapshot   = {},
  performanceCounters = {},
  configOverride  = null,
  onConfigChange  = null,
}) {
  const [filterSide, setFilterSide]           = useState("ALL");
  const [filterBand, setFilterBand]           = useState("ALL");
  const [filterOutsideTop, setFilterOutsideTop] = useState("ALL");
  const [filterAesThr, setFilterAesThr]       = useState("ALL");
  const [filterCohort, setFilterCohort]       = useState("ALL");
  const [filterStatus, setFilterStatus]       = useState("ALL");
  const [filterPostFeeWinner, setFilterPostFeeWinner] = useState(false);
  const [showConfig, setShowConfig]           = useState(false);
  const [datasetSource, setDatasetSource]     = useState("DISCOVERY");

  const config = configOverride ?? AES_DISCOVERY_CONFIG;

  const analytics = useMemo(() => buildAesDiscoveryAnalyticsReport(shadowTrades, config), [shadowTrades, config]);

  // ── Filtered discovery events ────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let evts = [...discoveryEvents];
    if (filterSide !== "ALL") evts = evts.filter(e => e.side === filterSide || (filterSide === "GAINER" ? e.leaderboardSide === "GAINERS" : e.leaderboardSide === "LOSERS"));
    if (filterBand !== "ALL") evts = evts.filter(e => e.rankBandAtDetection === filterBand);
    if (filterOutsideTop === "OUTSIDE_25") evts = evts.filter(e => e.outsideTop25);
    if (filterOutsideTop === "OUTSIDE_50") evts = evts.filter(e => e.outsideTop50);
    if (filterAesThr !== "ALL") {
      const thr = parseInt(filterAesThr);
      evts = evts.filter(e => Math.max(e.aesFull ?? 0, e.aesNoRank ?? 0, e.aesSetupOnly ?? 0) >= thr);
    }
    return evts.sort((a, b) => {
      const aMax = Math.max(a.aesNoRank ?? 0, a.aesSetupOnly ?? 0);
      const bMax = Math.max(b.aesNoRank ?? 0, b.aesSetupOnly ?? 0);
      if (bMax !== aMax) return bMax - aMax;
      if ((b.aesFull ?? 0) !== (a.aesFull ?? 0)) return (b.aesFull ?? 0) - (a.aesFull ?? 0);
      return (a.side24hRankAtDetection ?? 999) - (b.side24hRankAtDetection ?? 999);
    });
  }, [discoveryEvents, filterSide, filterBand, filterOutsideTop, filterAesThr]);

  // ── Filtered shadow trades ────────────────────────────────────────────────────
  const filteredShadows = useMemo(() => {
    let trades = [...shadowTrades];
    if (filterSide !== "ALL") trades = trades.filter(t => t.side === filterSide);
    if (filterBand !== "ALL") trades = trades.filter(t => t.rankBandAtEntry === filterBand);
    if (filterCohort === "RAW")  trades = trades.filter(t => t.isRawCohort && !t.isGoldCohort);
    if (filterCohort === "GOLD") trades = trades.filter(t => t.isGoldCohort);
    if (filterStatus === "ACTIVE")  trades = trades.filter(t => !t.closed);
    if (filterStatus === "CLOSED")  trades = trades.filter(t => t.closed);
    if (filterPostFeeWinner) trades = trades.filter(t => (t.normFeeAdjustedPnlPct ?? 0) > 0);
    return trades;
  }, [shadowTrades, filterSide, filterBand, filterCohort, filterStatus, filterPostFeeWinner]);

  const activeShadows = shadowTrades.filter(t => !t.closed);
  const closedShadows = shadowTrades.filter(t => t.closed);
  const rawShadows    = shadowTrades.filter(t => t.isRawCohort);
  const goldShadows   = shadowTrades.filter(t => t.isGoldCohort);

  // ── Export helpers ────────────────────────────────────────────────────────────
  function exportDiscoveryCSV() {
    const rows = filteredEvents.map(discoveryEventCSVRow);
    downloadFile(exportCSV(rows, DISCOVERY_EVENT_CSV_HEADERS), "aes_discovery_events.csv", "text/csv");
  }
  function exportDiscoveryJSON() {
    downloadFile(exportJSON(filteredEvents), "aes_discovery_events.json", "application/json");
  }
  function exportShadowCSV() {
    const rows = filteredShadows.map(shadowTradeCSVRow);
    downloadFile(exportCSV(rows, SHADOW_TRADE_CSV_HEADERS), "aes_shadow_trades.csv", "text/csv");
  }
  function exportShadowJSON() {
    downloadFile(exportJSON(filteredShadows), "aes_shadow_trades.json", "application/json");
  }

  // ── Discovery event columns ───────────────────────────────────────────────────
  const eventCols = [
    { key: "symbol",    label: "SYMBOL",    width: 90,  sortValue: e => e.symbol, render: e => <span style={{ color: C.text, fontWeight: 700 }}>{e.symbol.replace("USDT", "")}</span> },
    { key: "side",      label: "SIDE",      width: 60,  sortValue: e => e.side,   render: e => <span style={{ color: e.leaderboardSide === "GAINERS" ? C.green : C.red, fontSize: 8, fontWeight: 700 }}>{e.leaderboardSide === "GAINERS" ? "GAIN" : "LOSE"}</span> },
    { key: "change24h", label: "24h %",     width: 65,  sortValue: e => e.change24hAtDetection, render: e => <span style={{ color: (e.change24hAtDetection ?? 0) >= 0 ? C.green : C.red, fontFamily: "Space Mono" }}>{(e.change24hAtDetection ?? 0).toFixed(2)}%</span> },
    { key: "rank",      label: "RANK",      width: 55,  sortValue: e => e.side24hRankAtDetection, render: e => <span style={{ color: C.orange }}>{e.side24hRankAtDetection ?? "?"}</span> },
    { key: "band",      label: "BAND",      width: 100, sortValue: e => e.rankBandAtDetection, render: e => <span style={{ color: C.dim, fontSize: 8 }}>{e.rankBandAtDetection ?? "?"}</span> },
    { key: "aes",       label: "AES",       width: 50,  sortValue: e => e.aesFull, render: e => <span style={{ color: (e.aesFull ?? 0) >= 80 ? C.green : (e.aesFull ?? 0) >= 70 ? C.orange : C.dim, fontFamily: "Space Mono", fontWeight: 700 }}>{e.aesFull ?? "?"}</span> },
    { key: "aesNR",     label: "AES NR",    width: 60,  sortValue: e => e.aesNoRank, render: e => <span style={{ color: (e.aesNoRank ?? 0) >= 70 ? C.blue : C.dim, fontFamily: "Space Mono" }}>{e.aesNoRank ?? "?"}</span> },
    { key: "aesSO",     label: "AES SETUP", width: 70,  sortValue: e => e.aesSetupOnly, render: e => <span style={{ color: (e.aesSetupOnly ?? 0) >= 70 ? C.accent : C.dim, fontFamily: "Space Mono" }}>{e.aesSetupOnly ?? "?"}</span> },
    { key: "cov",       label: "COV%",      width: 55,  sortValue: e => e.telemetryCoveragePct, render: e => <span style={{ color: (e.telemetryCoveragePct ?? 0) >= 70 ? C.green : C.red }}>{e.telemetryCoveragePct ?? "?"}%</span> },
    { key: "ticks",     label: "TICKS",     width: 55,  render: e => <span style={{ color: e.last3BroadTicksDirection === "DOWN" ? C.red : C.dim, fontSize: 8 }}>{e.last3BroadTicksDirection ?? "?"}</span> },
    { key: "candle",    label: "CANDLE",    width: 60,  render: e => <span style={{ color: e.candleColorAtEntry === "RED" ? C.red : C.dim, fontSize: 8 }}>{e.candleColorAtEntry ?? "?"}</span> },
    { key: "atr",       label: "ATR",       width: 50,  sortValue: e => e.atrPct, render: e => <span style={{ color: C.dim, fontFamily: "Space Mono", fontSize: 9 }}>{e.atrPct?.toFixed(3) ?? "?"}</span> },
    { key: "cvd",       label: "CVD",       width: 55,  render: e => <span style={{ color: e.cvdLabel === "BEAR" ? C.red : e.cvdLabel === "BULL" ? C.green : C.orange, fontSize: 8 }}>{e.cvdLabel ?? "?"}</span> },
    { key: "labels",    label: "LABELS",    width: 200, render: e => <span style={{ color: C.accent, fontSize: 7, fontFamily: "Space Mono" }}>{(e.labels ?? []).slice(0, 3).join(" | ")}</span> },
    { key: "detected",  label: "DETECTED",  width: 80,  sortValue: e => e.detectedAt, render: e => <span style={{ color: C.dim, fontSize: 8 }}>{fTs(e.detectedAt)}</span> },
  ];

  // ── Shadow trade columns ──────────────────────────────────────────────────────
  const shadowCols = [
    { key: "symbol",     label: "SYMBOL",       width: 90,  sortValue: t => t.symbol, render: t => <span style={{ color: C.text, fontWeight: 700 }}>{t.symbol.replace("USDT", "")}</span> },
    { key: "side",       label: "SIDE",         width: 55,  render: t => <span style={{ color: t.side === "GAINER" ? C.green : C.red, fontSize: 8, fontWeight: 700 }}>{t.side}</span> },
    { key: "entryRank",  label: "ENT RANK",     width: 70,  sortValue: t => t.side24hRankAtEntry, render: t => <span style={{ color: C.orange }}>{t.side24hRankAtEntry ?? "?"}</span> },
    { key: "currRank",   label: "CUR RANK",     width: 70,  sortValue: t => t.currentSide24hRank, render: t => <span style={{ color: t.currentSide24hRank < t.side24hRankAtEntry ? C.green : C.dim }}>{t.currentSide24hRank ?? "?"}</span> },
    { key: "top50",      label: "TOP50?",        width: 60,  render: t => <span style={{ color: t.enteredTop50 ? C.green : C.dim, fontSize: 8 }}>{t.enteredTop50 ? "YES" : "NO"}</span> },
    { key: "aesEnt",     label: "ENT AES",      width: 65,  sortValue: t => t.aesFullAtEntry, render: t => <span style={{ color: (t.aesFullAtEntry ?? 0) >= 80 ? C.green : C.orange, fontFamily: "Space Mono", fontWeight: 700 }}>{t.aesFullAtEntry ?? "?"}</span> },
    { key: "aesNRent",   label: "NR AES",       width: 60,  render: t => <span style={{ color: C.blue, fontFamily: "Space Mono" }}>{t.aesNoRankAtEntry ?? "?"}</span> },
    { key: "aesSoEnt",   label: "SO AES",       width: 60,  render: t => <span style={{ color: C.accent, fontFamily: "Space Mono" }}>{t.aesSetupOnlyAtEntry ?? "?"}</span> },
    { key: "entPrice",   label: "ENT $",        width: 80,  render: t => <span style={{ color: C.dim, fontFamily: "Space Mono", fontSize: 9 }}>{t.entryPrice?.toFixed(4) ?? "?"}</span> },
    { key: "pnl",        label: "NORM FEE PNL", width: 90,  sortValue: t => t.normFeeAdjustedPnlPct, render: t => {
      const v = t.normFeeAdjustedPnlPct;
      return <span style={{ color: v == null ? C.dim : v > 0 ? C.green : C.red, fontFamily: "Space Mono", fontWeight: 700 }}>{v != null ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "OPEN"}</span>;
    }},
    { key: "mfe",        label: "MFE",          width: 55,  sortValue: t => t.mfe, render: t => <span style={{ color: C.green, fontFamily: "Space Mono" }}>{pct(t.mfe)}</span> },
    { key: "mae",        label: "MAE",          width: 55,  sortValue: t => t.mae, render: t => <span style={{ color: C.red,   fontFamily: "Space Mono" }}>{pct(t.mae)}</span> },
    { key: "hold",       label: "HOLD",         width: 65,  render: t => <span style={{ color: C.dim, fontSize: 9 }}>{t.closed ? fTime(t.holdMsActual) : "OPEN"}</span> },
    { key: "reason",     label: "REASON",       width: 70,  render: t => <span style={{ color: normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.STOP_LOSS ? C.red : normalizeLongCloseReason(t.closeReason) === CLOSE_REASON.TAKE_PROFIT ? C.green : C.orange, fontSize: 8 }}>{t.closeReason ?? "OPEN"}</span> },
    { key: "cohort",     label: "COHORT",       width: 80,  render: t => <span style={{ color: t.isGoldCohort ? C.orange : C.blue, fontSize: 8 }}>{t.isGoldCohort ? "GOLD" : "RAW"}</span> },
    { key: "labels",     label: "LABELS",       width: 200, render: t => <span style={{ color: C.accent, fontSize: 7, fontFamily: "Space Mono" }}>{(t.labels ?? []).slice(0, 3).join(" | ")}</span> },
  ];

  return (
    <div style={{ fontFamily: "Space Mono, monospace", color: C.text, padding: "0 4px" }}>

      {/* Safety banner */}
      <div style={S.safetyBanner}>
        <span style={S.pill(C.accent)}>LOG ONLY</span>
        <span style={S.pill(C.red)}>NO ORDERS</span>
        <span style={S.pill(C.blue)}>BINANCE-WIDE RESEARCH</span>
        <span style={{ color: "#7055cc", fontSize: 8, marginLeft: "auto", letterSpacing: 1.5 }}>
          AES_DISCOVERY_V1 · {config.scannerVersion}
        </span>
      </div>

      {/* Header stat cards */}
      <div style={S.grid}>
        <SC label="UNIVERSE"      value={fint(universeMeta.eligibleUniverseSize)}  sub="eligible USDT perps" c={C.blue} />
        <SC label="OUTSIDE TOP25" value={fint(universeMeta.outsideTop25Count)}      sub="candidates"         c={C.orange} />
        <SC label="OUTSIDE TOP50" value={fint(universeMeta.outsideTop50Count)}      sub="candidates"         c={C.orange} />
        <SC label="QUEUE DEPTH"   value={fint(queueSnapshot.metrics?.queuedCount)} sub="pending deep scans"  c={C.dim} />
        <SC label="DEEP SCANS"    value={fint(queueSnapshot.metrics?.totalCompleted)} sub="completed"        c={C.green} />
        <SC label="CACHE HIT%"    value={queueSnapshot.metrics?.totalEnqueued > 0 ? `${Math.round((queueSnapshot.metrics.cacheHits / queueSnapshot.metrics.totalEnqueued) * 100)}%` : "—"} sub="telemetry cache" c={C.green} />
        <SC label="RATE SKIPS"    value={fint(queueSnapshot.metrics?.rateLimitSkips)} sub="rate-budget paused" c={C.red} />
        <SC label="ACTIVE SHAD"   value={activeShadows.length}    sub="shadow trades open"   c={C.orange} />
        <SC label="CLOSED SHAD"   value={closedShadows.length}    sub="shadow trades closed" c={C.dim} />
        <SC label="RAW HIGH AES"  value={rawShadows.length}       sub="Cohort A"              c={C.blue} />
        <SC label="GOLD CONFIRM"  value={goldShadows.length}      sub="Cohort B"              c={C.orange} />
        <SC label="DISCOVERIES"   value={discoveryEvents.length}  sub="events logged"         c={C.accent} />
      </div>

      {/* Scanner health strip */}
      <Sect title="SCANNER HEALTH">
        <div style={S.row}>
          <span style={S.pill(scannerHealth.enabled !== false ? C.green : C.red)}>
            {scannerHealth.enabled !== false ? "SCANNING" : "PAUSED"}
          </span>
          <span style={{ color: C.dim, fontSize: 8 }}>BROAD: {fTs(scannerHealth.lastBroadScan)}</span>
          <span style={{ color: C.dim, fontSize: 8 }}>DEEP:  {fTs(scannerHealth.lastDeepScan)}</span>
          <span style={{ color: C.dim, fontSize: 8 }}>FAIL RATE: {scannerHealth.telemetryFailRate != null ? `${(scannerHealth.telemetryFailRate * 100).toFixed(1)}%` : "—"}</span>
          <span style={{ color: C.dim, fontSize: 8 }}>RL USAGE: {scannerHealth.rateLimitUsagePct != null ? `${scannerHealth.rateLimitUsagePct.toFixed(1)}%` : "—"}</span>
          <span style={{ color: C.dim, fontSize: 8 }}>SCORE VER: {config.scannerVersion}</span>
          {performanceCounters.broadScanDurationMs != null && (
            <span style={{ color: C.dim, fontSize: 8 }}>BROAD: {performanceCounters.broadScanDurationMs}ms</span>
          )}
          {performanceCounters.deepScanDurationMs != null && (
            <span style={{ color: C.dim, fontSize: 8 }}>DEEP: {performanceCounters.deepScanDurationMs}ms</span>
          )}
        </div>
      </Sect>

      {/* Filters */}
      <Sect title="FILTERS">
        <div style={S.row}>
          {[["Side", filterSide, setFilterSide, ["ALL","GAINER","LOSER"]],
            ["Band", filterBand, setFilterBand, ["ALL","TOP_1_25","RANK_26_50","RANK_51_100","RANK_101_200","RANK_201_PLUS"]],
            ["Outside", filterOutsideTop, setFilterOutsideTop, ["ALL","OUTSIDE_25","OUTSIDE_50"]],
            ["AES ≥", filterAesThr, setFilterAesThr, ["ALL","60","70","80","90"]],
            ["Cohort", filterCohort, setFilterCohort, ["ALL","RAW","GOLD"]],
            ["Status", filterStatus, setFilterStatus, ["ALL","ACTIVE","CLOSED"]],
          ].map(([label, val, setFn, opts]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>{label}</span>
              <select value={val} onChange={e => setFn(e.target.value)} style={S.filter}>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: C.dim, cursor: "pointer" }}>
            <input type="checkbox" checked={filterPostFeeWinner} onChange={e => setFilterPostFeeWinner(e.target.checked)} />
            POST-FEE WINNER
          </label>
        </div>
      </Sect>

      {/* Discovery events table */}
      <Sect title={`DISCOVERY EVENTS (${filteredEvents.length})`}>
        <SmartTable
          columns={eventCols}
          rows={filteredEvents}
          rowKey={e => e.discoveryEventId ?? e.symbol + e.detectedAt}
          pageSize={50}
          emptyMsg="No discovery events yet. Scanner will populate this table during broad scans."
        />
      </Sect>

      {/* Shadow trades table */}
      <Sect title={`SHADOW TRADES (${filteredShadows.length})`}>
        <SmartTable
          columns={shadowCols}
          rows={filteredShadows}
          rowKey={t => t.id}
          pageSize={50}
          emptyMsg="No shadow trades yet. They will appear when a symbol crosses AES >= 70 outside Top 25."
        />
      </Sect>

      {/* Analytics */}
      {analytics.totalClosed > 0 && (
        <Sect title="ANALYTICS" collapsible>
          <div style={S.row}>
            <span style={{ color: C.dim, fontSize: 8 }}>N={analytics.totalClosed}</span>
            <span style={S.pill(C.dim)}>{analytics.nConfidence}</span>
            {analytics.concentration?.concentrationFlags?.map(f => (
              <span key={f} style={S.pill(C.red)}>{f}</span>
            ))}
          </div>

          {/* Rank band performance */}
          {Object.keys(analytics.rankBandPerformance).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={S.secLbl}>RANK BAND PERFORMANCE</div>
              <div style={S.grid}>
                {Object.entries(analytics.rankBandPerformance).map(([k, v]) => (
                  <div key={k} style={S.card}>
                    <div style={{ fontSize: 8, color: C.blue, fontWeight: 700, marginBottom: 4 }}>{k}</div>
                    <div style={{ fontSize: 9, color: C.dim }}>n={v.n} <span style={{ color: C.dim, fontSize: 7 }}>{v.nConfidence}</span></div>
                    <div style={{ color: (v.winRate ?? 0) >= 50 ? C.green : C.red }}>{pct(v.winRate)} WR</div>
                    <div style={{ color: (v.avgFeeAdjPnl ?? 0) >= 0 ? C.green : C.red }}>{v.avgFeeAdjPnl != null ? `${v.avgFeeAdjPnl > 0 ? "+" : ""}${v.avgFeeAdjPnl.toFixed(2)}%` : "—"} avg</div>
                    <div style={{ color: C.dim, fontSize: 8 }}>PF: {num(v.profitFactor)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw vs confirmed */}
          {analytics.rawVsConfirmedComparison && (
            <div style={{ marginTop: 12 }}>
              <div style={S.secLbl}>RAW AES vs GATE-CONFIRMED</div>
              <div style={S.grid}>
                {[["RAW COHORT", analytics.rawVsConfirmedComparison.rawOnly, C.blue],
                  ["GOLD CONFIRMED", analytics.rawVsConfirmedComparison.goldConfirmed, C.orange]
                ].map(([label, m, c]) => m && (
                  <div key={label} style={S.card}>
                    <div style={{ fontSize: 8, color: c, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 9, color: C.dim }}>n={m.n} <span style={{ fontSize: 7 }}>{m.nConfidence}</span></div>
                    <div style={{ color: (m.winRate ?? 0) >= 50 ? C.green : C.red }}>{pct(m.winRate)} WR</div>
                    <div style={{ color: (m.avgFeeAdjPnl ?? 0) >= 0 ? C.green : C.red }}>{m.avgFeeAdjPnl != null ? `${m.avgFeeAdjPnl > 0 ? "+" : ""}${m.avgFeeAdjPnl.toFixed(2)}%` : "—"} avg</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Sect>
      )}

      {/* Config panel */}
      <Sect title="CONFIGURATION" collapsible>
        <div style={{ marginTop: 6 }}>
          <button style={S.filter} onClick={() => setShowConfig(o => !o)}>
            {showConfig ? "HIDE CONFIG" : "SHOW CONFIG"}
          </button>
          {showConfig && (
            <pre style={{ fontSize: 8, color: C.dim, marginTop: 8, background: C.panel, padding: 10, borderRadius: 4, border: `1px solid ${C.border}`, overflow: "auto", maxHeight: 300 }}>
              {JSON.stringify(config, null, 2)}
            </pre>
          )}
        </div>
      </Sect>

      {/* Exports */}
      <Sect title="EXPORTS">
        <div style={S.row}>
          {[
            ["EXPORT AES DISCOVERY CSV",      exportDiscoveryCSV],
            ["EXPORT AES DISCOVERY JSON",     exportDiscoveryJSON],
            ["EXPORT AES SHADOW TRADES CSV",  exportShadowCSV],
            ["EXPORT AES SHADOW TRADES JSON", exportShadowJSON],
          ].map(([label, fn]) => (
            <button key={label} style={S.filter} onClick={fn}>{label}</button>
          ))}
        </div>
        <div style={{ color: C.dim, fontSize: 8, marginTop: 6 }}>
          Discovery and normal exports are separate. These exports contain only research/shadow data.
        </div>
      </Sect>

    </div>
  );
}
