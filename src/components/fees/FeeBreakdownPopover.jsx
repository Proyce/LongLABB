// ─── FEE BREAKDOWN POPOVER ────────────────────────────────────────────────────
// Compact popover showing per-trade fee arithmetic.

import React from "react";
import { FeeValue, FeeSourceBadge } from "./FeeValue.jsx";
import { FeeStatusBadge } from "./FeeStatusBadge.jsx";

function sign(v) { return v >= 0 ? "+" : ""; }
function fmt(v, d = 2) { return v != null ? `${sign(v)}${Number(v).toFixed(d)}%` : "N/A"; }

export function FeeBreakdownPopover({ trade, onClose }) {
  if (!trade) return null;

  const isActive = trade.closed === false;
  const gross    = trade.grossMarginPnlPct ?? trade.finalPnlPct;
  const net      = trade.feeAdjustedMarginPnlPct;
  const entryFee = trade.entryFeeMarginPct;
  const exitFee  = isActive ? trade.projectedExitFeeMarginPct : trade.exitFeeMarginPct;
  const totalFee = trade.tradingFeeMarginPct;

  const rawTrigger  = trade.rawFirstLockTriggerMarginPct;
  const rawFloor    = trade.rawFirstLockFloorMarginPct;
  const effTrigger  = trade.feeSafeFirstLockTriggerMarginPct;
  const effFloor    = trade.feeSafeFirstLockFloorMarginPct;
  const lockNet     = trade.projectedFirstLockNetAfterFeesMarginPct;
  const lockRaised  = trade.firstLockFloorRaisedForFees;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[400px] shadow-2xl text-xs font-mono"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-purple-400 font-bold uppercase text-[11px]">
            Fee Breakdown — {trade.symbol}
          </span>
          <FeeSourceBadge source={trade.feeSource} confidence={trade.feeCalculationConfidence} />
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 ml-2">✕</button>
        </div>

        <div className="space-y-1 mb-3">
          <FeeValue label="Fee Model"         value={null} kind="incomplete" />
          <div className="text-gray-500 -mt-1 mb-1 pl-2">{trade.feeModelId} v{trade.feeModelVersion} | {trade.feeMode}</div>

          <FeeValue label="Entry Order"       value={null} />
          <div className="text-gray-400 -mt-1 mb-1 pl-2">{trade.entryOrderType} @ {trade.entryFeeRatePct}%</div>

          <FeeValue label="Exit Order"        value={null} />
          <div className="text-gray-400 -mt-1 mb-1 pl-2">{trade.exitOrderType} @ {trade.exitFeeRatePct}%</div>

          <FeeValue label="Leverage"          value={null} />
          <div className="text-gray-400 -mt-1 mb-2 pl-2">{trade.leverage}×</div>

          <div className="border-t border-gray-800 pt-2">
            <FeeValue label="GROSS MARGIN PNL"   value={gross}    kind={gross >= 0 ? "gross" : "net_neg"} />
            <FeeValue label={isActive ? "ENTRY FEE EST" : "ENTRY FEE PAID"}
                                                  value={entryFee != null ? -entryFee : null} kind="fee" />
            <FeeValue label={isActive ? "EXIT FEE IF NOW" : "EXIT FEE PAID"}
                                                  value={exitFee != null ? -exitFee : null}
                                                  kind={isActive ? "projected" : "fee"} />
            <FeeValue label="TOTAL FEES"          value={totalFee != null ? -totalFee : null} kind="fee" />
            <div className="border-t border-gray-700 mt-1 pt-1">
              <FeeValue label={isActive ? "NET IF CLOSED" : "NET AFTER FEES"}
                                                  value={net}
                                                  kind={net != null && net >= 0 ? "net_pos" : "net_neg"} />
            </div>
          </div>

          {trade.grossPnlUsd != null && (
            <div className="border-t border-gray-800 pt-2 space-y-1">
              <div className="text-gray-500 text-[10px] uppercase mb-1">USD (when available)</div>
              <div className="flex justify-between"><span className="text-gray-400">Gross PnL</span><span>{fmt(trade.grossPnlUsd, 2).replace("%", "")} USDT</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Entry fee</span><span className="text-purple-400">{trade.entryFeeUsd != null ? `-$${trade.entryFeeUsd.toFixed(2)}` : "N/A"}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Exit fee</span><span className="text-amber-400">{trade.exitFeeUsd != null ? `-$${trade.exitFeeUsd.toFixed(2)}` : isActive ? "(projected)" : "N/A"}</span></div>
              <div className="flex justify-between border-t border-gray-700 pt-1"><span className="text-gray-400">Net after fees</span><span className={trade.netPnlUsdAfterFees >= 0 ? "text-green-400" : "text-red-400"}>{trade.netPnlUsdAfterFees != null ? `$${trade.netPnlUsdAfterFees.toFixed(2)}` : "N/A"}</span></div>
            </div>
          )}

          {rawTrigger != null && (
            <div className="border-t border-gray-800 pt-2 space-y-1">
              <div className="text-gray-500 text-[10px] uppercase mb-1">First Profit Lock</div>
              <div className="flex justify-between"><span className="text-gray-400">Raw trigger</span><span>{fmt(rawTrigger)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Raw floor</span><span>{fmt(rawFloor)}</span></div>
              {effTrigger != null && <div className="flex justify-between"><span className="text-emerald-400">Effective trigger</span><span className="text-emerald-400">{fmt(effTrigger)}</span></div>}
              {effFloor != null && <div className="flex justify-between"><span className="text-emerald-400">Effective floor</span><span className="text-emerald-400">{fmt(effFloor)}</span></div>}
              {lockNet != null && <div className="flex justify-between"><span className="text-green-400">Protected net</span><span className="text-green-400">{fmt(lockNet)}</span></div>}
              {lockRaised && <div className="text-amber-400 mt-1">▲ Floor raised for fee safety</div>}
            </div>
          )}

          <div className="border-t border-gray-800 pt-2">
            <div className="text-gray-500 text-[10px] uppercase mb-1">Confidence</div>
            <FeeStatusBadge status={trade.feeStatusLabel} />
            <div className="text-gray-500 mt-1">{trade.feeCalculationConfidence} — {trade.feeSource}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
