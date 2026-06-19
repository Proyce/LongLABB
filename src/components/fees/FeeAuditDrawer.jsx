// ─── FEE AUDIT DRAWER ─────────────────────────────────────────────────────────
// Full fee audit drawer with event timeline, model snapshot, and diagnostics.

import React from "react";
import { FeeStatusBadge, FeeDiagnosticBadges } from "./FeeStatusBadge.jsx";
import { FeeSourceBadge } from "./FeeValue.jsx";

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, valueClass = "text-gray-200" }) {
  return (
    <div className="flex items-center justify-between text-xs font-mono py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className={valueClass}>{value ?? "—"}</span>
    </div>
  );
}

export function FeeAuditDrawer({ trade, onClose }) {
  if (!trade) return null;

  const isActive = trade.closed === false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-[480px] h-full bg-gray-950 border-l border-gray-700 overflow-y-auto p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-bold text-purple-400">Fee Audit</h2>
            <div className="text-gray-500 text-xs mt-0.5">{trade.symbol} / {trade.leverage}×</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-lg">✕</button>
        </div>

        <Section title="Fee Model Snapshot">
          <Row label="Model ID"      value={`${trade.feeModelId} v${trade.feeModelVersion}`} valueClass="text-violet-300" />
          <Row label="Source"        value={trade.feeSource} />
          <Row label="Mode"          value={trade.feeMode} />
          <Row label="Snapshot at"   value={trade.feeSnapshotCapturedAt ? new Date(trade.feeSnapshotCapturedAt).toISOString() : null} valueClass="text-gray-400" />
          <Row label="Entry order"   value={`${trade.entryOrderType} @ ${trade.entryFeeRatePct}%`} />
          <Row label="Exit order"    value={`${trade.exitOrderType} @ ${trade.exitFeeRatePct}%`} />
          <Row label="Confidence"    value={trade.feeCalculationConfidence} valueClass={trade.feeCalculationConfidence === "EXACT" ? "text-green-400" : "text-amber-400"} />
        </Section>

        <Section title="Accounting">
          <Row label="Gross margin PnL"     value={trade.grossMarginPnlPct != null ? `${trade.grossMarginPnlPct >= 0 ? "+" : ""}${trade.grossMarginPnlPct?.toFixed(2)}%` : null} valueClass="text-blue-300" />
          <Row label="Entry fee margin"     value={trade.entryFeeMarginPct != null ? `-${trade.entryFeeMarginPct.toFixed(2)}%` : null} valueClass="text-purple-400" />
          {isActive
            ? <Row label="Proj exit fee margin" value={trade.projectedExitFeeMarginPct != null ? `-${trade.projectedExitFeeMarginPct.toFixed(2)}%` : null} valueClass="text-amber-400" />
            : <Row label="Exit fee margin"      value={trade.exitFeeMarginPct != null ? `-${trade.exitFeeMarginPct.toFixed(2)}%` : null} valueClass="text-purple-400" />
          }
          <Row label="Total trading fees"   value={trade.tradingFeeMarginPct != null ? `-${trade.tradingFeeMarginPct.toFixed(2)}%` : null} valueClass="text-purple-400" />
          <Row label={isActive ? "Net if closed now" : "Net after fees"} value={trade.feeAdjustedMarginPnlPct != null ? `${trade.feeAdjustedMarginPnlPct >= 0 ? "+" : ""}${trade.feeAdjustedMarginPnlPct.toFixed(2)}%` : null} valueClass={trade.feeAdjustedMarginPnlPct >= 0 ? "text-green-400" : "text-red-400"} />
          <Row label="Fee burden"           value={trade.feeBurdenPct != null ? `${trade.feeBurdenPct.toFixed(1)}%` : null} />
          <Row label="Fee breakeven (gross)" value={trade.feeBreakevenGrossMarginPct != null ? `${trade.feeBreakevenGrossMarginPct.toFixed(2)}%` : null} />
        </Section>

        {trade.rawFirstLockFloorMarginPct != null && (
          <Section title="First Profit Lock — Fee Safety">
            <Row label="Raw trigger"           value={trade.rawFirstLockTriggerMarginPct != null ? `+${trade.rawFirstLockTriggerMarginPct.toFixed(2)}%` : null} />
            <Row label="Raw floor"             value={trade.rawFirstLockFloorMarginPct != null ? `+${trade.rawFirstLockFloorMarginPct.toFixed(2)}%` : null} />
            <Row label="Effective trigger"     value={trade.feeSafeFirstLockTriggerMarginPct != null ? `+${trade.feeSafeFirstLockTriggerMarginPct.toFixed(2)}%` : null} valueClass="text-emerald-400" />
            <Row label="Effective floor"       value={trade.feeSafeFirstLockFloorMarginPct != null ? `+${trade.feeSafeFirstLockFloorMarginPct.toFixed(2)}%` : null} valueClass="text-emerald-400" />
            <Row label="Min net buffer"        value={trade.feeSafeFirstLockMinNetBufferMarginPct != null ? `+${trade.feeSafeFirstLockMinNetBufferMarginPct.toFixed(2)}%` : null} />
            <Row label="Protected net at floor" value={trade.projectedFirstLockNetAfterFeesMarginPct != null ? `+${trade.projectedFirstLockNetAfterFeesMarginPct.toFixed(2)}%` : null} valueClass="text-green-400" />
            <Row label="Floor raised"          value={trade.firstLockFloorRaisedForFees ? "YES ▲" : "No"} valueClass={trade.firstLockFloorRaisedForFees ? "text-amber-400" : "text-gray-400"} />
            <Row label="Trigger raised"        value={trade.firstLockTriggerRaisedForHeadroom ? "YES ▲" : "No"} valueClass={trade.firstLockTriggerRaisedForHeadroom ? "text-amber-400" : "text-gray-400"} />
            <Row label="Fee calc source"       value={trade.firstLockFeeCalculationSource} />
            <Row label="Fee calc status"       value={trade.firstLockFeeCalculationStatus} />
            <Row label="Lock version"          value={trade.firstLockFeeSafetyVersion} valueClass="text-gray-500" />
          </Section>
        )}

        <Section title="Diagnostics">
          <div className="mb-2">
            <FeeStatusBadge status={trade.feeStatusLabel} />
          </div>
          <FeeDiagnosticBadges labels={trade.feeDiagnosticLabels} />
          {trade.feeCalculationWarning && (
            <div className="text-yellow-400 text-xs mt-2">⚠ {trade.feeCalculationWarning}</div>
          )}
        </Section>

        {trade._feeMigrationVersion && (
          <Section title="Migration">
            <Row label="Migrated"   value="Yes" valueClass="text-gray-400" />
            <Row label="Version"    value={trade._feeMigrationVersion} valueClass="text-gray-500" />
            <Row label="At"         value={trade._feeMigratedAt ? new Date(trade._feeMigratedAt).toISOString() : null} valueClass="text-gray-500" />
            <div className="text-gray-600 text-[10px] mt-1">Original finalPnlPct preserved. Fees recomputed from legacy defaults.</div>
          </Section>
        )}
      </div>
    </div>
  );
}
