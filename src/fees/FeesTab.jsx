// ─── FEES TAB ─────────────────────────────────────────────────────────────────
// Top-level FEES analysis tab.

import React, { useMemo, useState } from "react";
import {
  aggregateTradeFees,
  aggregateSymbolFees,
  aggregateLeverageFees,
  buildRunFeeSummaries,
} from "./feeAggregates.js";
import {
  getGrossMarginPnlPct,
  getNetMarginPnlPct,
  getTradingFeeMarginPct,
  isNetWinner,
  isFeeFlipped,
  isClosed,
} from "./feeSelectors.js";
import { FeeStatusBadge } from "../components/fees/FeeStatusBadge.jsx";
import { FeeSourceBadge } from "../components/fees/FeeValue.jsx";
import { FeeBreakdownPopover } from "../components/fees/FeeBreakdownPopover.jsx";
import { FeeAuditDrawer } from "../components/fees/FeeAuditDrawer.jsx";
import { DEFAULT_FEE_CONFIG } from "./feeConfig.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(v, d = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

function fmt2(v) { return v != null ? v.toFixed(2) : "—"; }

function StatCard({ label, value, sub, color = "text-gray-200", warn = false }) {
  return (
    <div className={`bg-gray-800 rounded-lg p-3 border ${warn ? "border-orange-700" : "border-gray-700"}`}>
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Primary Summary Cards ────────────────────────────────────────────────────

function SummaryCards({ agg }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard
        label="Gross PnL"
        value={pct(agg.grossPnlSum)}
        color={agg.grossPnlSum >= 0 ? "text-blue-300" : "text-red-400"}
        sub="margin points"
      />
      <StatCard
        label="Trading Fees"
        value={pct(-agg.feeSum)}
        color="text-purple-400"
        sub={`${agg.closedCount} trades`}
      />
      <StatCard
        label="Net After Fees"
        value={pct(agg.netPnlSum)}
        color={agg.netPnlSum >= 0 ? "text-green-400" : "text-red-400"}
        sub="fee-adjusted"
      />
      <StatCard
        label="Fee Burden"
        value={agg.feeBurdenPct != null ? `${agg.feeBurdenPct.toFixed(1)}%` : "—"}
        color={agg.feeBurdenPct > 50 ? "text-orange-400" : "text-gray-200"}
        sub="of gross PnL"
        warn={agg.feeBurdenPct > 50}
      />
      <StatCard
        label="Gross Win Rate"
        value={`${agg.grossWinRate.toFixed(1)}%`}
        color="text-blue-300"
        sub="before fees"
      />
      <StatCard
        label="Net Win Rate"
        value={`${agg.netWinRate.toFixed(1)}%`}
        color={agg.netWinRate >= agg.grossWinRate ? "text-green-400" : "text-amber-400"}
        sub="after fees"
      />
      <StatCard
        label="Fee-Flipped Trades"
        value={agg.feeFlipCount}
        color={agg.feeFlipCount > 0 ? "text-orange-400" : "text-gray-400"}
        sub={`${agg.feeFlipRate?.toFixed(1)}% of closed`}
        warn={agg.feeFlipCount > 0}
      />
      <StatCard
        label="Avg Fee / Trade"
        value={pct(agg.avgFeeMarginPct)}
        color="text-purple-400"
        sub="margin pts"
      />
    </div>
  );
}

// ─── Run Fee Table ────────────────────────────────────────────────────────────

function RunFeeTable({ runs }) {
  if (!runs || runs.length === 0) return <div className="text-gray-500 text-xs">No run data.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-[10px] uppercase">
            <th className="text-left py-2 pr-3">Run</th>
            <th className="text-right pr-3">Trades</th>
            <th className="text-right pr-3">Gross PnL</th>
            <th className="text-right pr-3">Fees</th>
            <th className="text-right pr-3">Net After Fees</th>
            <th className="text-right pr-3">Fee Burden</th>
            <th className="text-right pr-3">Gross WR</th>
            <th className="text-right pr-3">Net WR</th>
            <th className="text-right pr-3">Fee Flips</th>
            <th className="text-left">Model</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.runId} className="border-b border-gray-800 hover:bg-gray-800/50">
              <td className="py-1.5 pr-3 text-gray-300">#{r.runId}</td>
              <td className="text-right pr-3">{r.closedCount}</td>
              <td className={`text-right pr-3 ${r.grossPnlSum >= 0 ? "text-blue-300" : "text-red-400"}`}>{pct(r.grossPnlSum)}</td>
              <td className="text-right pr-3 text-purple-400">{pct(-r.feeSum)}</td>
              <td className={`text-right pr-3 font-bold ${r.netPnlSum >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(r.netPnlSum)}</td>
              <td className={`text-right pr-3 ${r.feeBurdenPct > 50 ? "text-orange-400" : "text-gray-300"}`}>{r.feeBurdenPct != null ? `${r.feeBurdenPct.toFixed(1)}%` : "—"}</td>
              <td className="text-right pr-3">{r.grossWinRate.toFixed(1)}%</td>
              <td className={`text-right pr-3 ${r.netWinRate >= r.grossWinRate ? "text-green-400" : "text-amber-400"}`}>{r.netWinRate.toFixed(1)}%</td>
              <td className={`text-right pr-3 ${r.feeFlipCount > 0 ? "text-orange-400" : "text-gray-500"}`}>{r.feeFlipCount}</td>
              <td className="text-gray-500 text-[10px]">{r.hasMixedFeeModels ? <span className="text-orange-400">MIXED</span> : r.feeModelSummary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Trade Fee Audit Table ────────────────────────────────────────────────────

function TradeFeeAuditTable({ trades, onSelectTrade }) {
  const closed = useMemo(() => (trades ?? []).filter(isClosed).slice(0, 200), [trades]);

  if (closed.length === 0) return <div className="text-gray-500 text-xs">No closed trades.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-[10px] uppercase">
            <th className="text-left py-2 pr-3">Symbol</th>
            <th className="text-left pr-3">Run</th>
            <th className="text-right pr-3">Lev</th>
            <th className="text-right pr-3">Gross</th>
            <th className="text-right pr-3">Entry Fee</th>
            <th className="text-right pr-3">Exit Fee</th>
            <th className="text-right pr-3">Total Fee</th>
            <th className="text-right pr-3">Net</th>
            <th className="text-right pr-3">Burden</th>
            <th className="text-left pr-3">Status</th>
            <th className="text-left">Source</th>
          </tr>
        </thead>
        <tbody>
          {closed.map((t, i) => {
            const gross   = getGrossMarginPnlPct(t);
            const net     = getNetMarginPnlPct(t);
            const fee     = getTradingFeeMarginPct(t);
            const flipped = isFeeFlipped(t);
            return (
              <tr
                key={t.id ?? i}
                className={`border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer ${flipped ? "bg-orange-950/20" : ""}`}
                onClick={() => onSelectTrade?.(t)}
              >
                <td className="py-1.5 pr-3 text-gray-200">{t.symbol}</td>
                <td className="pr-3 text-gray-400">#{t.run}</td>
                <td className="text-right pr-3 text-gray-400">{t.leverage}×</td>
                <td className={`text-right pr-3 ${gross >= 0 ? "text-blue-300" : "text-red-400"}`}>{pct(gross)}</td>
                <td className="text-right pr-3 text-purple-400">{t.entryFeeMarginPct != null ? `-${fmt2(t.entryFeeMarginPct)}%` : "—"}</td>
                <td className="text-right pr-3 text-purple-400">{t.exitFeeMarginPct != null ? `-${fmt2(t.exitFeeMarginPct)}%` : "—"}</td>
                <td className="text-right pr-3 text-purple-400">{fee != null ? `-${fmt2(fee)}%` : "—"}</td>
                <td className={`text-right pr-3 font-bold ${net >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(net)}</td>
                <td className={`text-right pr-3 ${t.feeBurdenPct > 50 ? "text-orange-400" : "text-gray-400"}`}>{t.feeBurdenPct != null ? `${t.feeBurdenPct.toFixed(0)}%` : "—"}</td>
                <td className="pr-3"><FeeStatusBadge status={t.feeStatusLabel} /></td>
                <td><FeeSourceBadge source={t.feeSource} confidence={t.feeCalculationConfidence} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Symbol & Leverage Tables ─────────────────────────────────────────────────

function SymbolFeeTable({ rows }) {
  if (!rows || rows.length === 0) return <div className="text-gray-500 text-xs">No data.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-[10px] uppercase">
            <th className="text-left py-2 pr-3">Symbol</th>
            <th className="text-right pr-3">Trades</th>
            <th className="text-right pr-3">Gross PnL</th>
            <th className="text-right pr-3">Fees</th>
            <th className="text-right pr-3">Net After Fees</th>
            <th className="text-right pr-3">Avg Fee</th>
            <th className="text-right pr-3">Burden</th>
            <th className="text-right">Flips</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.symbol} className="border-b border-gray-800 hover:bg-gray-800/50">
              <td className="py-1.5 pr-3 text-gray-200">{r.symbol}</td>
              <td className="text-right pr-3">{r.closedCount}</td>
              <td className={`text-right pr-3 ${r.grossPnlSum >= 0 ? "text-blue-300" : "text-red-400"}`}>{pct(r.grossPnlSum)}</td>
              <td className="text-right pr-3 text-purple-400">{pct(-r.feeSum)}</td>
              <td className={`text-right pr-3 font-bold ${r.netPnlSum >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(r.netPnlSum)}</td>
              <td className="text-right pr-3 text-purple-400">{pct(r.avgFeeMarginPct)}</td>
              <td className={`text-right pr-3 ${r.feeBurdenPct > 50 ? "text-orange-400" : "text-gray-400"}`}>{r.feeBurdenPct != null ? `${r.feeBurdenPct.toFixed(1)}%` : "—"}</td>
              <td className={`text-right ${r.feeFlipCount > 0 ? "text-orange-400" : "text-gray-500"}`}>{r.feeFlipCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeverageFeeTable({ rows }) {
  if (!rows || rows.length === 0) return <div className="text-gray-500 text-xs">No data.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-[10px] uppercase">
            <th className="text-left py-2 pr-3">Leverage</th>
            <th className="text-right pr-3">Trades</th>
            <th className="text-right pr-3">RT Fee Drag</th>
            <th className="text-right pr-3">Gross PnL</th>
            <th className="text-right pr-3">Fees</th>
            <th className="text-right pr-3">Net After Fees</th>
            <th className="text-right pr-3">Gross WR</th>
            <th className="text-right pr-3">Net WR</th>
            <th className="text-right">Flips</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const rtDrag = parseFloat(((DEFAULT_FEE_CONFIG.takerFeeRatePct * 2) * r.leverage).toFixed(2));
            return (
              <tr key={r.leverage} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="py-1.5 pr-3 text-gray-200">{r.leverage}×</td>
                <td className="text-right pr-3">{r.closedCount}</td>
                <td className="text-right pr-3 text-amber-400">{rtDrag}%</td>
                <td className={`text-right pr-3 ${r.grossPnlSum >= 0 ? "text-blue-300" : "text-red-400"}`}>{pct(r.grossPnlSum)}</td>
                <td className="text-right pr-3 text-purple-400">{pct(-r.feeSum)}</td>
                <td className={`text-right pr-3 font-bold ${r.netPnlSum >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(r.netPnlSum)}</td>
                <td className="text-right pr-3">{r.grossWinRate.toFixed(1)}%</td>
                <td className={`text-right pr-3 ${r.netWinRate >= r.grossWinRate ? "text-green-400" : "text-amber-400"}`}>{r.netWinRate.toFixed(1)}%</td>
                <td className={`text-right ${r.feeFlipCount > 0 ? "text-orange-400" : "text-gray-500"}`}>{r.feeFlipCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section Tabs ─────────────────────────────────────────────────────────────

const SECTIONS = ["Overview", "By Run", "By Symbol", "By Leverage", "Trade Audit"];

// ─── Main FeesTab ─────────────────────────────────────────────────────────────

export function FeesTab({ trades = [] }) {
  const [section, setSection]   = useState("Overview");
  const [selected, setSelected] = useState(null);
  const [drawerTrade, setDrawerTrade] = useState(null);

  const agg      = useMemo(() => aggregateTradeFees(trades), [trades]);
  const runs     = useMemo(() => buildRunFeeSummaries(trades), [trades]);
  const symbols  = useMemo(() => aggregateSymbolFees(trades), [trades]);
  const levs     = useMemo(() => aggregateLeverageFees(trades), [trades]);

  return (
    <div className="p-4 text-gray-200">
      {/* Section nav */}
      <div className="flex gap-2 mb-6 border-b border-gray-700 pb-2">
        {SECTIONS.map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`text-xs font-mono px-3 py-1 rounded transition-colors ${
              section === s
                ? "bg-purple-900 text-purple-200 border border-purple-700"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="ml-auto text-[10px] text-gray-500 self-center">
          {trades.length} trades · {agg.closedCount} closed
          {agg.hasMixedFeeModels && <span className="text-orange-400 ml-2">MIXED FEE MODE</span>}
        </div>
      </div>

      {section === "Overview" && (
        <>
          <SummaryCards agg={agg} />
          <div className="text-xs text-gray-500 mt-2">
            <span className="text-blue-300">GROSS</span> = before fees &nbsp;·&nbsp;
            <span className="text-purple-400">FEES</span> = trading commissions &nbsp;·&nbsp;
            <span className="text-green-400">NET</span> = after entry + exit fees &nbsp;·&nbsp;
            Dollar totals: {agg.tradeCount > 0 && trades[0]?.grossPnlUsd != null ? "Available" : "Unavailable (no position size)"}
          </div>
        </>
      )}

      {section === "By Run" && (
        <RunFeeTable runs={runs} />
      )}

      {section === "By Symbol" && (
        <SymbolFeeTable rows={symbols} />
      )}

      {section === "By Leverage" && (
        <LeverageFeeTable rows={levs} />
      )}

      {section === "Trade Audit" && (
        <TradeFeeAuditTable
          trades={trades}
          onSelectTrade={t => setDrawerTrade(t)}
        />
      )}

      {drawerTrade && (
        <FeeAuditDrawer
          trade={drawerTrade}
          onClose={() => setDrawerTrade(null)}
        />
      )}
    </div>
  );
}
