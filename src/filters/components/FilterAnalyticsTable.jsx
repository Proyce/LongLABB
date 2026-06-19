// ─── FILTER ANALYTICS TABLE ───────────────────────────────────────────────────
// Renders cohort summary rows with fee-aware metrics.

import React, { useState } from "react";
import { PNL_METRIC } from "../longFilterConstants.js";

const SAMPLE_BADGE_COLORS = {
  TINY_SAMPLE: "#991b1b",
  EARLY: "#92400e",
  DEVELOPING: "#1e40af",
  VALIDATING: "#065f46",
  ROBUST_SAMPLE: "#166534",
  LARGE_SAMPLE: "#14532d",
};

const styles = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" },
  th: {
    padding: "0.4rem 0.6rem", background: "#1a1a2e", color: "#888",
    textAlign: "right", borderBottom: "1px solid #333", cursor: "pointer",
    whiteSpace: "nowrap", userSelect: "none",
  },
  thLeft: {
    padding: "0.4rem 0.6rem", background: "#1a1a2e", color: "#888",
    textAlign: "left", borderBottom: "1px solid #333",
  },
  td: {
    padding: "0.35rem 0.6rem", textAlign: "right",
    borderBottom: "1px solid #1e1e2e", color: "#ccc",
  },
  tdLeft: {
    padding: "0.35rem 0.6rem", textAlign: "left",
    borderBottom: "1px solid #1e1e2e", color: "#ddd", fontWeight: 600,
  },
  positive: { color: "#22c55e" },
  negative: { color: "#ef4444" },
  neutral: { color: "#ccc" },
  badge: (type) => ({
    padding: "0.1rem 0.35rem", borderRadius: "3px",
    fontSize: "0.6rem", fontWeight: 700,
    background: SAMPLE_BADGE_COLORS[type] ?? "#333",
    color: "#fff",
  }),
};

function pnlColor(v) {
  if (v == null) return styles.neutral;
  return v > 0 ? styles.positive : v < 0 ? styles.negative : styles.neutral;
}

function fmt(v, decimals = 2) {
  if (v == null) return "—";
  return typeof v === "number" ? v.toFixed(decimals) : v;
}

const DEFAULT_COLUMNS = [
  { key: "label", label: "Filter / Label", align: "left" },
  { key: "trades", label: "Trades", numeric: true },
  { key: "netAfterFeesTotal", label: "Net Fees Total", numeric: true, pnl: true },
  { key: "netAfterFeesAvg", label: "Net Fees Avg", numeric: true, pnl: true },
  { key: "netAfterFeesMedian", label: "Net Fees Med", numeric: true, pnl: true },
  { key: "netAfterFeesWinRate", label: "Fee Win %", numeric: true },
  { key: "feeFlipRate", label: "Fee Flip %", numeric: true },
  { key: "profitFactor", label: "Profit Factor", numeric: true },
  { key: "slRate", label: "SL %", numeric: true },
  { key: "positiveRunRate", label: "+Run %", numeric: true },
  { key: "positiveDatasetRate", label: "+Set %", numeric: true },
  { key: "sampleBadge", label: "Sample", badge: true },
];

export function FilterAnalyticsTable({ rows, pnlMetric = PNL_METRIC.NET_AFTER_FEES, columns = DEFAULT_COLUMNS, emptyMessage = "No data" }) {
  const [sortKey, setSortKey] = useState("netAfterFeesTotal");
  const [sortDir, setSortDir] = useState("desc");

  if (!rows?.length) {
    return <div style={{ color: "#555", padding: "1rem" }}>{emptyMessage}</div>;
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? av - bv : bv - av;
  });

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                style={col.align === "left" ? styles.thLeft : styles.th}
                onClick={() => toggleSort(col.key)}
              >
                {col.label} {sortKey === col.key ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.key ?? i}>
              {columns.map(col => {
                if (col.badge) {
                  return (
                    <td key={col.key} style={styles.td}>
                      <span style={styles.badge(row[col.key])}>{row[col.key] ?? "—"}</span>
                    </td>
                  );
                }
                if (col.align === "left") return <td key={col.key} style={styles.tdLeft}>{row[col.key] ?? "—"}</td>;
                if (col.pnl) {
                  const v = row[col.key];
                  return <td key={col.key} style={{ ...styles.td, ...pnlColor(v) }}>{fmt(v)}</td>;
                }
                return <td key={col.key} style={styles.td}>{fmt(row[col.key])}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { DEFAULT_COLUMNS };
