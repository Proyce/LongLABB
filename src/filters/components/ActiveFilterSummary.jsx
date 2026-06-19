// ─── ACTIVE FILTER SUMMARY ────────────────────────────────────────────────────
// Renders a readable query sentence and one-click predicate removal.

import React from "react";
import { getFilterById } from "../longFilterRegistry.js";
import { PNL_METRIC } from "../longFilterConstants.js";

const styles = {
  container: { padding: "0.5rem 1rem", background: "#161625", borderBottom: "1px solid #333" },
  empty: { color: "#555", fontSize: "0.75rem" },
  row: { display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" },
  pill: {
    display: "flex", alignItems: "center", gap: "0.3rem",
    padding: "0.2rem 0.5rem", borderRadius: "4px",
    background: "#2d2d4e", fontSize: "0.72rem", color: "#ddd",
  },
  remove: {
    cursor: "pointer", color: "#888", fontWeight: 700,
    marginLeft: "0.2rem", fontSize: "0.9em",
  },
  label: { color: "#a78bfa", fontWeight: 700, fontSize: "0.72rem" },
  divider: { color: "#555", fontSize: "0.72rem", margin: "0 0.2rem" },
};

function formatPredicate(predicate) {
  const f = getFilterById(predicate.filterId);
  const label = f?.label ?? predicate.filterId;
  const op = predicate.operator;
  const val = predicate.value;

  if (op === "IS_TRUE") return `${label} = YES`;
  if (op === "IS_FALSE") return `${label} = NO`;
  if (op === "IS_KNOWN") return `${label} known`;
  if (op === "IS_UNKNOWN") return `${label} unknown`;
  if (op === "GTE") return `${label} ≥ ${val}`;
  if (op === "LTE") return `${label} ≤ ${val}`;
  if (op === "EQ") return `${label} = ${val}`;
  if (op === "BETWEEN") return `${label} ${val?.[0]}–${val?.[1]}`;
  if (op === "IN") return `${label} in [${Array.isArray(val) ? val.join(", ") : val}]`;
  if (op === "NOT_IN") return `${label} not in [${Array.isArray(val) ? val.join(", ") : val}]`;
  if (op === "INCLUDES_ANY") return `${label} has any [${Array.isArray(val) ? val.join(", ") : val}]`;
  if (op === "INCLUDES_ALL") return `${label} has all [${Array.isArray(val) ? val.join(", ") : val}]`;
  if (op === "INCLUDES_NONE") return `${label} excludes [${Array.isArray(val) ? val.join(", ") : val}]`;
  if (op === "IS_EMPTY") return `${label} is empty`;
  if (op === "IS_NOT_EMPTY") return `${label} not empty`;
  return `${label} ${op} ${val ?? ""}`;
}

const PNL_LABELS = {
  [PNL_METRIC.FEE_ADJUSTED_NORMALIZED]: "Fee-Adjusted Normalized",
  [PNL_METRIC.RAW_NORMALIZED]: "Raw Normalized",
  [PNL_METRIC.FEE_ADJUSTED_MARGIN]: "Fee-Adjusted Margin",
  [PNL_METRIC.RAW_MARGIN]: "Raw Margin",
  [PNL_METRIC.GROSS_MARGIN]: "Gross Margin (Legacy)",
  [PNL_METRIC.NET_AFTER_FEES]: "Net Margin After Fees (Legacy)",
  [PNL_METRIC.NET_AFTER_ALL_COSTS]: "Net Margin After All Costs",
};

export function ActiveFilterSummary({ state, onRemovePredicate, onRemoveOutcomeFilter }) {
  const hasAny = state.groups.some(g => g.predicates.length > 0) || state.outcomeFilters.length > 0;

  if (!hasAny) {
    return (
      <div style={styles.container}>
        <span style={styles.empty}>No active entry filters — showing all trades in scope.</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={styles.label}>Scope:</span>
        <span style={{ ...styles.pill, background: "#2d3748" }}>{state.scope}</span>
        <span style={styles.divider}>|</span>

        {state.groups.flatMap((group, gi) =>
          group.predicates.map((pred, pi) => (
            <span key={`${gi}-${pi}`} style={styles.pill}>
              {formatPredicate(pred)}
              {onRemovePredicate && (
                <span style={styles.remove} onClick={() => onRemovePredicate(group.id, pi)}>✕</span>
              )}
            </span>
          ))
        )}

        {state.outcomeFilters.length > 0 && (
          <>
            <span style={{ ...styles.divider, color: "#f59e0b" }}>| OUTCOME:</span>
            {state.outcomeFilters.map((pred, i) => (
              <span key={`out-${i}`} style={{ ...styles.pill, background: "#3d2700" }}>
                {formatPredicate(pred)}
                {onRemoveOutcomeFilter && (
                  <span style={styles.remove} onClick={() => onRemoveOutcomeFilter(i)}>✕</span>
                )}
              </span>
            ))}
          </>
        )}

        <span style={styles.divider}>|</span>
        <span style={{ ...styles.pill, background: "#1f2937" }}>
          Metric: {PNL_LABELS[state.pnlMetric] ?? state.pnlMetric}
        </span>
      </div>
    </div>
  );
}
