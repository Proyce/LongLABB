// ─── FEE STATUS BADGE ─────────────────────────────────────────────────────────

import React from "react";
import { FEE_STATUS } from "../../fees/feeLabels.js";

const BADGE_MAP = {
  [FEE_STATUS.FEE_EFFICIENT_WIN]:       { label: "FEE EFFICIENT",   cls: "bg-green-900 text-green-300" },
  [FEE_STATUS.FEE_SAFE_WIN]:            { label: "FEE SAFE WIN",     cls: "bg-green-900 text-green-400" },
  [FEE_STATUS.FEE_HEAVY_WIN]:           { label: "FEE HEAVY",        cls: "bg-yellow-900 text-yellow-300" },
  [FEE_STATUS.FEE_DOMINATED_TRADE]:     { label: "FEE DOMINATED",    cls: "bg-orange-900 text-orange-300" },
  [FEE_STATUS.FEE_FLIPPED_WIN_TO_LOSS]: { label: "FEE FLIP ↓",       cls: "bg-red-900 text-red-300" },
  [FEE_STATUS.FEE_BREAKEVEN]:           { label: "FEE BREAK-EVEN",   cls: "bg-gray-700 text-gray-300" },
  [FEE_STATUS.FEE_DEEPENS_LOSS]:        { label: "LOSS+FEES",        cls: "bg-red-950 text-red-400" },
  [FEE_STATUS.FEE_UNKNOWN]:             { label: "FEE ?",            cls: "bg-gray-700 text-gray-400" },
  [FEE_STATUS.FEE_INCOMPLETE]:          { label: "FEE INCOMPLETE",   cls: "bg-gray-700 text-gray-400" },
  [FEE_STATUS.FIRST_LOCK_FEE_SAFE]:     { label: "FEE-SAFE LOCK ✓",  cls: "bg-emerald-900 text-emerald-300" },
  [FEE_STATUS.FIRST_LOCK_FLOOR_RAISED_FOR_FEES]: { label: "FLOOR RAISED", cls: "bg-amber-900 text-amber-300" },
  [FEE_STATUS.FIRST_LOCK_NET_BUFFER_VIOLATION]:  { label: "NET BUFFER !", cls: "bg-red-900 text-red-300" },
  [FEE_STATUS.GROSS_PROFIT_NET_LOSS]:   { label: "GROSS+/NET-",      cls: "bg-orange-900 text-orange-300" },
};

export function FeeStatusBadge({ status, className = "" }) {
  if (!status) return null;
  const entry = BADGE_MAP[status] ?? { label: status, cls: "bg-gray-700 text-gray-400" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${entry.cls} ${className}`}>
      {entry.label}
    </span>
  );
}

export function FeeDiagnosticBadges({ labels = [], className = "" }) {
  if (!labels || labels.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {labels.map(l => <FeeStatusBadge key={l} status={l} />)}
    </div>
  );
}
