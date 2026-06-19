// ─── FILTER BUILDER ───────────────────────────────────────────────────────────
// Registry-driven filter builder. Renders controls from LONG_FILTER_REGISTRY.
// No hard-coded label lists — all options come from the registry.

import React, { useState } from "react";
import { LONG_FILTER_REGISTRY, getFiltersByFamily } from "../longFilterRegistry.js";
import { FILTER_FAMILY, OPERATOR, FIELD_TYPE, COVERAGE_STATUS } from "../longFilterConstants.js";
import { makeFilterGroup, makePredicate } from "../longFilterState.js";

const styles = {
  section: { borderBottom: "1px solid #222", padding: "0.5rem 1rem" },
  sectionHeader: {
    display: "flex", alignItems: "center", gap: "0.5rem",
    cursor: "pointer", color: "#a78bfa", fontWeight: 700,
    fontSize: "0.75rem", padding: "0.3rem 0",
  },
  filterRow: {
    display: "flex", alignItems: "center", gap: "0.5rem",
    padding: "0.25rem 0", flexWrap: "wrap",
  },
  label: { color: "#ccc", fontSize: "0.72rem", minWidth: 180 },
  select: {
    background: "#222", border: "1px solid #333", color: "#ccc",
    borderRadius: 4, padding: "0.2rem 0.4rem", fontSize: "0.72rem",
  },
  input: {
    background: "#222", border: "1px solid #333", color: "#ccc",
    borderRadius: 4, padding: "0.2rem 0.4rem", fontSize: "0.72rem", width: 80,
  },
  addBtn: {
    background: "#7c3aed", border: "none", color: "#fff",
    borderRadius: 4, padding: "0.2rem 0.5rem", cursor: "pointer", fontSize: "0.7rem",
  },
  unavailableLabel: { color: "#444", fontSize: "0.7rem", fontStyle: "italic" },
  amberBadge: {
    background: "#92400e", color: "#fbbf24", padding: "0.1rem 0.3rem",
    borderRadius: 3, fontSize: "0.6rem", fontWeight: 700,
  },
};

const FAMILY_ORDER = [
  FILTER_FAMILY.UNIVERSAL_GATE,
  FILTER_FAMILY.MICRO_MOMENTUM,
  FILTER_FAMILY.GREEN_RED_CONFIRMATION,
  FILTER_FAMILY.CVD_FLOW,
  FILTER_FAMILY.VWAP_STRUCTURE,
  FILTER_FAMILY.ENERGY_EXECUTION,
  FILTER_FAMILY.MARKET_CONTEXT,
  FILTER_FAMILY.TOP_LOSER_REVERSAL,
  FILTER_FAMILY.TOP_GAINER_CONTINUATION,
  FILTER_FAMILY.LONG_AES,
  FILTER_FAMILY.LONG_BEST_DNA,
  FILTER_FAMILY.LONG_POST_FEE_10,
  FILTER_FAMILY.SNIPER_LONG,
  FILTER_FAMILY.POSITIVE_COMBOS,
  FILTER_FAMILY.ANTI_COMBOS,
  FILTER_FAMILY.SHADOW_POLICY,
  FILTER_FAMILY.OUTCOME_FORENSICS,
];

const FAMILY_LABELS = {
  [FILTER_FAMILY.UNIVERSAL_GATE]: "Universal Long Gate",
  [FILTER_FAMILY.MICRO_MOMENTUM]: "Micro Momentum",
  [FILTER_FAMILY.GREEN_RED_CONFIRMATION]: "Green / Red Confirmation",
  [FILTER_FAMILY.CVD_FLOW]: "CVD and Flow",
  [FILTER_FAMILY.VWAP_STRUCTURE]: "VWAP and Structure",
  [FILTER_FAMILY.ENERGY_EXECUTION]: "Energy and Execution Quality",
  [FILTER_FAMILY.MARKET_CONTEXT]: "BTC / ETH / Market Context",
  [FILTER_FAMILY.TOP_LOSER_REVERSAL]: "Top Loser Reversal",
  [FILTER_FAMILY.TOP_GAINER_CONTINUATION]: "Top Gainer Continuation",
  [FILTER_FAMILY.LONG_AES]: "Long AES",
  [FILTER_FAMILY.LONG_BEST_DNA]: "Long Best DNA",
  [FILTER_FAMILY.LONG_POST_FEE_10]: "Long Post-Fee-10",
  [FILTER_FAMILY.SNIPER_LONG]: "Sniper Long",
  [FILTER_FAMILY.POSITIVE_COMBOS]: "Positive Long Combos",
  [FILTER_FAMILY.ANTI_COMBOS]: "Anti-Long Combos",
  [FILTER_FAMILY.SHADOW_POLICY]: "Shadow Policy",
  [FILTER_FAMILY.OUTCOME_FORENSICS]: "Outcome Forensics",
};

function FilterControl({ filter, coverage, onAdd }) {
  const [operator, setOperator] = useState(filter.operators[0] ?? "IS_TRUE");
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");

  const coverageInfo = coverage?.[filter.field];
  const status = coverageInfo?.status ?? COVERAGE_STATUS.READY;
  const disabled = status === COVERAGE_STATUS.UNAVAILABLE;

  function handleAdd() {
    let resolvedValue;
    if (filter.fieldType === FIELD_TYPE.NUMERIC) {
      if (operator === OPERATOR.BETWEEN) resolvedValue = [parseFloat(value), parseFloat(value2)];
      else resolvedValue = parseFloat(value);
    } else if (filter.fieldType === FIELD_TYPE.ENUM) {
      resolvedValue = value ? [value] : undefined;
    } else if (filter.fieldType === FIELD_TYPE.ARRAY) {
      resolvedValue = value ? value.split(",").map(v => v.trim()) : undefined;
    } else {
      resolvedValue = undefined;
    }
    onAdd(makePredicate(filter.id, operator, resolvedValue));
  }

  if (disabled) {
    return (
      <div style={styles.filterRow}>
        <span style={styles.unavailableLabel}>{filter.label} — UNAVAILABLE (no data)</span>
      </div>
    );
  }

  return (
    <div style={styles.filterRow}>
      <span style={styles.label}>
        {filter.label}
        {status === COVERAGE_STATUS.PARTIAL && <span style={{ ...styles.amberBadge, marginLeft: 4 }}>PARTIAL</span>}
        {status === COVERAGE_STATUS.LOW && <span style={{ ...styles.amberBadge, background: "#7f1d1d", color: "#fca5a5", marginLeft: 4 }}>LOW</span>}
      </span>
      <select style={styles.select} value={operator} onChange={e => setOperator(e.target.value)}>
        {filter.operators.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
      {filter.fieldType === FIELD_TYPE.NUMERIC && ![OPERATOR.IS_KNOWN, OPERATOR.IS_UNKNOWN].includes(operator) && (
        <>
          <input style={styles.input} type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="value" />
          {operator === OPERATOR.BETWEEN && (
            <input style={styles.input} type="number" value={value2} onChange={e => setValue2(e.target.value)} placeholder="max" />
          )}
        </>
      )}
      {(filter.fieldType === FIELD_TYPE.ENUM || filter.fieldType === FIELD_TYPE.ARRAY) && ![OPERATOR.IS_KNOWN, OPERATOR.IS_UNKNOWN, OPERATOR.IS_EMPTY, OPERATOR.IS_NOT_EMPTY].includes(operator) && (
        filter.enumValues ? (
          <select style={styles.select} value={value} onChange={e => setValue(e.target.value)}>
            <option value="">— select —</option>
            {filter.enumValues.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <input style={styles.input} type="text" value={value} onChange={e => setValue(e.target.value)} placeholder="value(s)" />
        )
      )}
      <button style={styles.addBtn} onClick={handleAdd}>+ Add</button>
    </div>
  );
}

function FamilySection({ family, filters, coverage, onAddPredicate }) {
  const [open, setOpen] = useState(family === FILTER_FAMILY.UNIVERSAL_GATE);
  const availableFilters = filters.filter(f => f.status !== "DEPRECATED");

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader} onClick={() => setOpen(o => !o)}>
        {open ? "▾" : "▸"} {FAMILY_LABELS[family] ?? family}
        <span style={{ color: "#555", fontWeight: 400 }}>({availableFilters.length})</span>
      </div>
      {open && availableFilters.map(f => (
        <FilterControl key={f.id} filter={f} coverage={coverage} onAdd={pred => onAddPredicate(pred)} />
      ))}
    </div>
  );
}

export function FilterBuilder({ scope, coverage, onAddPredicate }) {
  const scopeRegistry = LONG_FILTER_REGISTRY.filter(f =>
    f.family !== FILTER_FAMILY.OUTCOME_FORENSICS &&
    (f.scope === scope || f.scope === "ALL_LONGS")
  );

  return (
    <div>
      {FAMILY_ORDER.map(family => {
        const filters = scopeRegistry.filter(f => f.family === family);
        if (!filters.length) return null;
        return (
          <FamilySection
            key={family}
            family={family}
            filters={filters}
            coverage={coverage}
            onAddPredicate={onAddPredicate}
          />
        );
      })}
    </div>
  );
}
