// ─── FEE MODEL INSPECTOR ──────────────────────────────────────────────────────

import React from "react";
import { DEFAULT_FEE_CONFIG } from "../../fees/feeConfig.js";

function Row({ label, value, valueClass = "text-gray-200" }) {
  return (
    <tr className="border-b border-gray-800">
      <td className="py-1 pr-4 text-gray-400 whitespace-nowrap">{label}</td>
      <td className={`py-1 font-mono ${valueClass}`}>{value ?? "—"}</td>
    </tr>
  );
}

export function FeeModelInspector({ config = DEFAULT_FEE_CONFIG, leverage = 5, onClose }) {
  const lev        = Number(leverage) || 1;
  const taker      = config.takerFeeRatePct ?? 0.05;
  const maker      = config.makerFeeRatePct ?? 0.02;
  const rt         = parseFloat((taker * 2).toFixed(4));
  const marginDrag = parseFloat((rt * lev).toFixed(4));
  const safety     = config.profitLockFeeSafety ?? {};
  const minFloor   = parseFloat(((taker * 2 * lev) + (safety.minProtectedNetAfterFeesMarginPct ?? 0.25)).toFixed(4));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-purple-400 uppercase tracking-widest">Fee Model Inspector</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-lg leading-none">✕</button>
        </div>

        <table className="w-full text-xs">
          <tbody>
            <Row label="Venue"                     value="Binance USDT-M" />
            <Row label="Model"                     value={`${config.feeModelId} v${config.feeModelVersion}`} valueClass="text-violet-300" />
            <Row label="Source"                    value={config.source === "SIMULATED_CONFIG" ? "Simulated configuration" : config.source} valueClass={config.source === "EXCHANGE_FILL" ? "text-cyan-300" : "text-violet-300"} />
            <Row label="Entry order assumption"    value={config.defaultEntryOrderType} />
            <Row label="Exit order assumption"     value={config.defaultExitOrderType} />
            <Row label="Entry rate"                value={`${taker}% notional`} valueClass="text-amber-300" />
            <Row label="Exit rate"                 value={`${taker}% notional`} valueClass="text-amber-300" />
            <Row label="Maker rate"                value={`${maker}% notional`} />
            <Row label="Round trip"                value={`${rt}% notional`} valueClass="text-purple-300" />
            <Row label="Selected leverage"         value={`${lev}×`} />
            <Row label="Projected margin drag"     value={`${marginDrag}%`} valueClass="text-amber-400" />
            <Row label="Position size mode"        value={config.positionSizingMode} />
            <Row label="Dollar fee totals"         value={config.simulatedMarginPerTradeUsd ? `Simulated at $${config.simulatedMarginPerTradeUsd}/trade` : "Unavailable: no margin size configured"} valueClass={config.simulatedMarginPerTradeUsd ? "text-green-300" : "text-gray-500"} />
            <Row label="Historical recalculation"  value="Disabled (snapshots frozen at entry)" />
            <Row label="First-lock net buffer"     value={`+${safety.minProtectedNetAfterFeesMarginPct ?? 0.25}% margin`} valueClass="text-green-400" />
            <Row label="Min fee-safe first floor"  value={`${minFloor}% at ${lev}× taker/taker`} valueClass="text-emerald-300" />
            <Row label="First-lock exit fee basis" value="Projected taker fee (conservative)" />
            <Row label="First-lock execution"      value="APPLY_FIRST_LOCK_ONLY" valueClass="text-amber-300" />
            <Row label="General fee execution"     value="LOG_ONLY" valueClass="text-gray-400" />
          </tbody>
        </table>

        <div className="mt-4 p-3 bg-gray-800 rounded text-[11px] text-gray-400 font-mono leading-relaxed">
          <div className="text-gray-300 mb-1">Fee formula:</div>
          <div>gross_floor − entry_fee_margin − exit_fee_at_floor ≥ +{safety.minProtectedNetAfterFeesMarginPct ?? 0.25}%</div>
          <div className="mt-1 text-gray-300">At {lev}× taker/taker:</div>
          <div>entry_fee = {taker}% × {lev} = {(taker * lev).toFixed(2)}% margin</div>
          <div>exit_fee  = {taker}% × {lev} = {(taker * lev).toFixed(2)}% margin (projected)</div>
          <div>min gross floor = {(taker * 2 * lev).toFixed(2)}% + {safety.minProtectedNetAfterFeesMarginPct ?? 0.25}% = <span className="text-emerald-400">{minFloor}%</span></div>
        </div>
      </div>
    </div>
  );
}
