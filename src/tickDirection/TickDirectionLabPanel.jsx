import { useMemo } from "react";
import { buildTickDirectionAnalytics } from "./tickDirectionAnalytics.js";

const C = {
  bg: "#090b12", card: "#0d111c", border: "#202a3d",
  text: "#d9e2f2", dim: "#7f8ca6", green: "#35e095",
  red: "#ff647c", blue: "#62a7ff", amber: "#ffc466",
};
const mono = "'Space Mono', monospace";

function Stat({ label, value, color = C.text }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: "9px 11px", minWidth: 120 }}>
    <div style={{ color: C.dim, fontSize: 8, letterSpacing: 1 }}>{label}</div>
    <div style={{ color, fontSize: 15, fontWeight: 700, marginTop: 4 }}>{value}</div>
  </div>;
}

function AccuracyTable({ rows, firstColumn }) {
  return <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 5 }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
      <thead><tr style={{ color: C.dim, background: "#0b0e17" }}>
        <th style={{ padding: 7, textAlign: "left" }}>{firstColumn}</th>
        <th>N</th>
        {["1s", "3s", "5s", "10s", "30s"].map(h => <th key={h}>{h} ACC</th>)}
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row[firstColumn]} style={{ borderTop: `1px solid ${C.border}` }}>
        <td style={{ padding: 7, color: C.text }}>{row[firstColumn]}</td>
        <td style={{ textAlign: "center", color: C.dim }}>{row.trades}</td>
        {["1s", "3s", "5s", "10s", "30s"].map(h => <td key={h} style={{ textAlign: "center", color: row.horizons[h]?.correctPct >= 55 ? C.green : C.text }}>
          {row.horizons[h]?.correctPct == null ? "—" : `${row.horizons[h].correctPct}%`}
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

function SmallTable({ headers, rows }) {
  return <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 5 }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
      <thead><tr style={{ color: C.dim, background: "#0b0e17" }}>
        {headers.map(header => <th key={header.key} style={{ padding: 7, textAlign: header.align ?? "left" }}>{header.label}</th>)}
      </tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.id ?? row.prediction ?? row.source ?? row.agreement ?? index} style={{ borderTop: `1px solid ${C.border}` }}>
        {headers.map(header => <td key={header.key} style={{ padding: 7, textAlign: header.align ?? "left", color: header.color?.(row) ?? C.text }}>
          {row[header.key] ?? "—"}
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

export default function TickDirectionLabPanel({ samples = [], streamHealth = {} }) {
  const analytics = useMemo(() => buildTickDirectionAnalytics(samples), [samples]);
  const quality = analytics.qualityCounts;
  return <div style={{ fontFamily: mono, color: C.text, background: C.bg }}>
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
      <Stat label="MODE" value="LOG ONLY" color={C.amber} />
      <Stat label="STREAM" value={streamHealth.tickResearchStreamConnected ? "CONNECTED" : "OFFLINE"} color={streamHealth.tickResearchStreamConnected ? C.green : C.red} />
      <Stat label="BOOK / TRADE" value={`${streamHealth.tickResearchBookConnected ? "UP" : "—"} / ${streamHealth.tickResearchTradeConnected ? "UP" : "—"}`} />
      <Stat label="SYMBOLS" value={streamHealth.tickResearchSubscribedSymbolCount ?? 0} color={C.blue} />
      <Stat label="LAST EVENT AGE" value={streamHealth.tickResearchLastMessageAgeMs == null ? "—" : `${streamHealth.tickResearchLastMessageAgeMs}ms`} />
      <Stat label="ENTRY COVERAGE" value={`${analytics.coveragePct ?? 0}%`} />
      <Stat label="COMPLETE / PARTIAL" value={`${quality.COMPLETE ?? 0} / ${quality.PARTIAL ?? 0}`} color={C.green} />
      <Stat label="INSUFFICIENT / STALE" value={`${quality.INSUFFICIENT ?? 0} / ${quality.STALE ?? 0}`} color={C.red} />
    </div>

    <div style={{ color: C.blue, fontSize: 10, letterSpacing: 1, margin: "12px 0 7px" }}>PREDICTION ACCURACY BY ATR TIER</div>
    <AccuracyTable rows={analytics.byAtrTier} firstColumn="atrTier" />
    <div style={{ color: C.blue, fontSize: 10, letterSpacing: 1, margin: "16px 0 7px" }}>PATTERN PERFORMANCE</div>
    <AccuracyTable rows={analytics.byPattern} firstColumn="pattern" />
    <div style={{ color: C.blue, fontSize: 10, letterSpacing: 1, margin: "16px 0 7px" }}>CONFIDENCE CALIBRATION</div>
    <AccuracyTable rows={analytics.confidenceBuckets} firstColumn="bucket" />
    <div style={{ color: C.blue, fontSize: 10, letterSpacing: 1, margin: "16px 0 7px" }}>5S BIAS / CONFUSION MATRIX</div>
    <SmallTable
      headers={[
        { key: "prediction", label: "PREDICTION" },
        { key: "n", label: "N", align: "center" },
        { key: "up", label: "ACTUAL UP", align: "center" },
        { key: "neutral", label: "ACTUAL NEUTRAL", align: "center" },
        { key: "down", label: "ACTUAL DOWN", align: "center" },
      ]}
      rows={analytics.confusion5s}
    />
    <div style={{ color: C.blue, fontSize: 10, letterSpacing: 1, margin: "16px 0 7px" }}>SOURCE DIAGNOSTICS</div>
    <AccuracyTable rows={analytics.bySource} firstColumn="source" />
    <div style={{ marginTop: 8 }}><AccuracyTable rows={analytics.byAgreement} firstColumn="agreement" /></div>
    <div style={{ color: C.blue, fontSize: 10, letterSpacing: 1, margin: "16px 0 7px" }}>LEGACY CANDLE VS GENUINE TICK</div>
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      <Stat label="COMPARABLE" value={analytics.legacyComparison.comparable} />
      <Stat label="3S AGREEMENT" value={analytics.legacyComparison.agreement3sPct == null ? "—" : `${analytics.legacyComparison.agreement3sPct}%`} />
      <Stat label="3S REVERSALS" value={analytics.legacyComparison.reversal3sCount} color={C.amber} />
    </div>
    <div style={{ color: C.blue, fontSize: 10, letterSpacing: 1, margin: "16px 0 7px" }}>HIGH-ATR HYPOTHESES</div>
    <SmallTable
      headers={[
        { key: "id", label: "HYPOTHESIS" },
        { key: "trades", label: "N", align: "center" },
        { key: "status", label: "STATUS", align: "center" },
      ]}
      rows={analytics.hypotheses}
    />
    <div style={{ color: C.blue, fontSize: 10, letterSpacing: 1, margin: "16px 0 7px" }}>RECENT TICK-AUDITED TRADES</div>
    <SmallTable
      headers={[
        { key: "symbol", label: "SYMBOL" },
        { key: "marketTickDirectionVerdict", label: "VERDICT" },
        { key: "marketTickDirectionConfidenceScore", label: "CONF" },
        { key: "marketTickDirection3s", label: "3S" },
        { key: "marketTickDirection10s", label: "10S" },
        { key: "marketTickPrimaryPattern", label: "PATTERN" },
        { key: "marketTickAggressorFlowLabel3s", label: "FLOW" },
        { key: "entryTickDataQuality", label: "QUALITY" },
        { key: "marketTickPredictionResult5s", label: "5S RESULT" },
      ]}
      rows={samples.filter(sample => sample.entryTickSnapshotVersion).slice(-50).reverse()}
    />
    {!analytics.trades && <div style={{ marginTop: 14, padding: 16, border: `1px dashed ${C.border}`, color: C.dim }}>
      Collecting genuine pre-entry bookTicker and aggTrade evidence. No reference edge is assumed before logs exist.
    </div>}
  </div>;
}
