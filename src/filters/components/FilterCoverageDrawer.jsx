// ─── FILTER COVERAGE DRAWER ───────────────────────────────────────────────────
// Shows per-field coverage stats for all registered filters.

import React, { useState } from "react";
import { COVERAGE_STATUS } from "../longFilterConstants.js";

const STATUS_COLOR = {
  [COVERAGE_STATUS.READY]: "#22c55e",
  [COVERAGE_STATUS.PARTIAL]: "#f59e0b",
  [COVERAGE_STATUS.LOW]: "#ef4444",
  [COVERAGE_STATUS.UNAVAILABLE]: "#555",
};

const styles = {
  container: { padding: "0.5rem 0" },
  toggle: {
    cursor: "pointer", padding: "0.4rem 1rem",
    color: "#7c3aed", fontWeight: 700, fontSize: "0.75rem",
    borderBottom: "1px solid #333", background: "#111",
    display: "flex", alignItems: "center", gap: "0.4rem",
  },
  drawer: { padding: "0.5rem 1rem", maxHeight: 400, overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" },
  th: { padding: "0.3rem 0.5rem", color: "#666", textAlign: "left", borderBottom: "1px solid #222" },
  td: { padding: "0.25rem 0.5rem", borderBottom: "1px solid #1a1a2e", color: "#ccc" },
  dot: (status) => ({
    display: "inline-block", width: 8, height: 8, borderRadius: "50%",
    background: STATUS_COLOR[status] ?? "#555", marginRight: 4,
  }),
};

export function FilterCoverageDrawer({ coverageSummary }) {
  const [open, setOpen] = useState(false);

  if (!coverageSummary?.byField) return null;
  const fields = Object.values(coverageSummary.byField);

  return (
    <div style={styles.container}>
      <div style={styles.toggle} onClick={() => setOpen(o => !o)}>
        {open ? "▾" : "▸"} Filters Health
        <span style={{ color: "#22c55e", marginLeft: 8 }}>{coverageSummary.ready} ready</span>
        <span style={{ color: "#f59e0b", marginLeft: 8 }}>{coverageSummary.partial} partial</span>
        <span style={{ color: "#ef4444", marginLeft: 8 }}>{coverageSummary.unavailable} unavailable</span>
      </div>
      {open && (
        <div style={styles.drawer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Filter</th>
                <th style={styles.th}>Field</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Known %</th>
                <th style={styles.th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(f => (
                <tr key={f.field}>
                  <td style={styles.td}>{f.filterLabel}</td>
                  <td style={{ ...styles.td, color: "#666" }}>{f.field}</td>
                  <td style={styles.td}>
                    <span style={styles.dot(f.status)} />
                    {f.status}
                  </td>
                  <td style={styles.td}>{f.knownPct}%</td>
                  <td style={styles.td}>{f.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
