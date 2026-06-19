// ─── LEGACY DATA WARNING ──────────────────────────────────────────────────────
// Shown when legacy short-semantic records are present but excluded by default.

import React from "react";

const styles = {
  box: {
    margin: "0.5rem 1rem", padding: "0.6rem 0.8rem",
    borderRadius: "6px", border: "1px solid #7c4b00",
    background: "#1a0f00", color: "#f59e0b", fontSize: "0.75rem",
    display: "flex", alignItems: "center", gap: "0.5rem",
  },
  title: { fontWeight: 700 },
};

export function LegacyDataWarning({ legacyCount, onInclude, includingLegacy }) {
  if (!legacyCount) return null;
  return (
    <div style={styles.box}>
      <span>⚠</span>
      <span>
        <span style={styles.title}>Legacy Records Excluded: </span>
        {legacyCount} records with short-semantic field data are hidden by default.
        {includingLegacy
          ? " Currently shown — field values may reflect ShortLAB semantics."
          : <> <button onClick={onInclude} style={{ background: "none", border: "1px solid #7c4b00", color: "#f59e0b", cursor: "pointer", padding: "0.1rem 0.4rem", borderRadius: 4 }}>Show legacy data</button></>
        }
      </span>
    </div>
  );
}
