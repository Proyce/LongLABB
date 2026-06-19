// ─── FEE VALUE ────────────────────────────────────────────────────────────────
// Renders a single fee-aware PnL value with its label and confidence badge.

import React from "react";

const KIND_COLORS = {
  gross:     "text-blue-300",
  fee:       "text-purple-400",
  projected: "text-amber-400",
  net_pos:   "text-green-400",
  net_neg:   "text-red-400",
  incomplete: "text-gray-400",
  actual:    "text-cyan-400",
};

function sign(v) { return v >= 0 ? "+" : ""; }

export function FeeValue({ label, value, kind = "gross", unit = "%", decimals = 2, className = "" }) {
  const color = KIND_COLORS[kind] ?? "text-gray-200";
  const display = value == null
    ? <span className="text-gray-500">N/A</span>
    : <span className={color}>{sign(value)}{Number(value).toFixed(decimals)}{unit}</span>;

  return (
    <div className={`flex items-center justify-between text-xs font-mono ${className}`}>
      <span className="text-gray-400 uppercase tracking-wide mr-2">{label}</span>
      {display}
    </div>
  );
}

export function FeeSourceBadge({ source, confidence }) {
  const map = {
    EXCHANGE_FILL:     { label: "ACTUAL",  cls: "bg-cyan-900 text-cyan-300 border-cyan-700" },
    SIMULATED_CONFIG:  { label: "SIM",     cls: "bg-violet-900 text-violet-300 border-violet-700" },
    IMPORTED_LOG:      { label: "IMPORT",  cls: "bg-blue-900 text-blue-300 border-blue-700" },
    LEGACY_RECOMPUTED: { label: "LEGACY",  cls: "bg-gray-700 text-gray-300 border-gray-600" },
    MIXED:             { label: "MIXED",   cls: "bg-orange-900 text-orange-300 border-orange-700" },
  };

  const entry = map[source] ?? { label: source ?? "?", cls: "bg-gray-700 text-gray-400 border-gray-600" };

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${entry.cls}`}>
      {entry.label}
      {confidence === "INCOMPLETE" && <span className="ml-1 text-yellow-400">!</span>}
    </span>
  );
}
