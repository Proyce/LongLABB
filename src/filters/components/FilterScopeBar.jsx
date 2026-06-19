// ─── FILTER SCOPE BAR ─────────────────────────────────────────────────────────
// Scope selector for the LongLAB Filters tab.

import React from "react";
import { LONG_SCOPE } from "../longFilterConstants.js";

const SCOPES = [
  { value: LONG_SCOPE.ALL_LONGS, label: "All Longs" },
  { value: LONG_SCOPE.TOP_LOSER_LONGS, label: "Top Loser Reversals" },
  { value: LONG_SCOPE.TOP_GAINER_LONGS, label: "Top Gainer Continuations" },
];

const styles = {
  bar: {
    display: "flex", gap: "0.5rem", padding: "0.5rem 1rem",
    borderBottom: "1px solid #333", background: "#111",
  },
  btn: (active) => ({
    padding: "0.3rem 0.8rem", borderRadius: "6px", border: "none", cursor: "pointer",
    fontWeight: active ? 700 : 400, fontSize: "0.8rem",
    background: active ? "#7c3aed" : "#222", color: active ? "#fff" : "#aaa",
    transition: "background 0.15s",
  }),
};

export function FilterScopeBar({ scope, onScopeChange }) {
  return (
    <div style={styles.bar}>
      {SCOPES.map(s => (
        <button
          key={s.value}
          style={styles.btn(scope === s.value)}
          onClick={() => onScopeChange(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
