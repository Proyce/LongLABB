// ─── FILTER HEALTH STRIP ──────────────────────────────────────────────────────
// Header strip showing filter system status, coverage, and log-only badge.

import React from "react";
import { COVERAGE_STATUS } from "../longFilterConstants.js";

const styles = {
  strip: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.75rem",
    padding: "0.5rem 1rem", background: "#1a1a2e", borderBottom: "1px solid #333",
    fontSize: "0.75rem", color: "#aaa",
  },
  badge: (color) => ({
    padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 700,
    fontSize: "0.65rem", letterSpacing: "0.05em", background: color, color: "#fff",
  }),
  stat: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.1rem" },
  statLabel: { fontSize: "0.6rem", color: "#666", textTransform: "uppercase" },
  statValue: { fontWeight: 700, color: "#ccc" },
  coverageDot: (status) => ({
    width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 4,
    background: status === COVERAGE_STATUS.READY ? "#22c55e"
      : status === COVERAGE_STATUS.PARTIAL ? "#f59e0b"
        : status === COVERAGE_STATUS.LOW ? "#ef4444"
          : "#555",
  }),
};

export function FilterHealthStrip({ inputCount, outputCount, coverageSummary, activePredicateCount, legacyExcluded, feeCoverage }) {
  const entryFinalPct = coverageSummary?.ready != null && coverageSummary.totalRegistered > 0
    ? Math.round((coverageSummary.ready / coverageSummary.totalRegistered) * 100)
    : null;

  return (
    <div style={styles.strip}>
      <span style={styles.badge("#7c3aed")}>LONG FILTERS</span>
      <span style={styles.badge("#dc2626")}>LOG ONLY</span>
      <span style={styles.badge("#166534")}>RESEARCH ONLY</span>

      <div style={styles.stat}>
        <span style={styles.statLabel}>Input</span>
        <span style={styles.statValue}>{inputCount ?? "—"}</span>
      </div>
      <div style={styles.stat}>
        <span style={styles.statLabel}>Filtered</span>
        <span style={styles.statValue}>{outputCount ?? "—"}</span>
      </div>
      <div style={styles.stat}>
        <span style={styles.statLabel}>Predicates</span>
        <span style={styles.statValue}>{activePredicateCount ?? 0}</span>
      </div>
      {legacyExcluded != null && legacyExcluded > 0 && (
        <div style={styles.stat}>
          <span style={styles.statLabel}>Legacy Excluded</span>
          <span style={{ ...styles.statValue, color: "#f59e0b" }}>{legacyExcluded}</span>
        </div>
      )}
      {coverageSummary && (
        <div style={styles.stat}>
          <span style={styles.statLabel}>Filter Coverage</span>
          <span style={styles.statValue}>
            <span style={styles.coverageDot(entryFinalPct >= 90 ? COVERAGE_STATUS.READY : entryFinalPct >= 50 ? COVERAGE_STATUS.PARTIAL : COVERAGE_STATUS.LOW)} />
            {coverageSummary.ready}/{coverageSummary.totalRegistered} ready
          </span>
        </div>
      )}
      {feeCoverage != null && (
        <div style={styles.stat}>
          <span style={styles.statLabel}>Fee Coverage</span>
          <span style={styles.statValue}>{feeCoverage}%</span>
        </div>
      )}
    </div>
  );
}
