// ─── FEE MODEL STRIP ──────────────────────────────────────────────────────────
// Compact header bar showing the active fee model.
// Clicking it opens the FeeModelInspector.

import React, { useState } from "react";
import { DEFAULT_FEE_CONFIG } from "../../fees/feeConfig.js";
import { FeeModelInspector } from "./FeeModelInspector.jsx";

export function FeeModelStrip({ config = DEFAULT_FEE_CONFIG, leverage = 5 }) {
  const [open, setOpen] = useState(false);

  const lev         = Number(leverage) || 1;
  const taker       = config.takerFeeRatePct ?? 0.05;
  const rt          = parseFloat((taker * 2).toFixed(2));
  const marginDrag  = parseFloat((rt * lev).toFixed(2));
  const isSimulated = (config.source ?? "SIMULATED_CONFIG").includes("SIMULATED");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-mono text-gray-300 transition-colors"
        title="Click to open Fee Model Inspector"
      >
        <span className="text-purple-400 font-bold">FEES</span>
        <span className="text-gray-500">|</span>
        <span className={isSimulated ? "text-violet-400" : "text-cyan-400"}>
          {isSimulated ? "SIMULATED" : "EXCHANGE"}
        </span>
        <span className="text-gray-500">|</span>
        <span>TAKER {taker}% / SIDE</span>
        <span className="text-gray-500">|</span>
        <span>RT {rt}% NOTIONAL</span>
        <span className="text-gray-500">|</span>
        <span className="text-amber-400">{lev}× = {marginDrag}% MARGIN</span>
        <span className="text-gray-500">|</span>
        <span className="text-green-400">NET VIEW ON</span>
      </button>

      {open && (
        <FeeModelInspector
          config={config}
          leverage={leverage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
