// ─── SHADOW LONG INSPECTION DRAWER ───────────────────────────────────────────
// Linked view: Failed SHORT → Shadow LONG → Combined rescue result
import { color as _tk, font as _tkFont } from "../ui/tokens.js";

const C = {
  bg:       _tk.bg,
  surface:  _tk.surface,
  border:   _tk.border,
  borderLo: _tk.borderLo,
  text:     _tk.text,
  textSub:  _tk.textSub,
  textDim:  _tk.textDim,
  green:    _tk.long,
  red:      _tk.short,
  amber:    _tk.warn,
  blue:     _tk.info,
  purple:   _tk.accent,
  muted:    _tk.textDim,
};

const mono = _tkFont.mono;

const f2  = n => (n != null && Number.isFinite(n)) ? Number(n).toFixed(2) : "—";
const f3  = n => (n != null && Number.isFinite(n)) ? Number(n).toFixed(3) : "—";
const f4  = n => (n != null && Number.isFinite(n)) ? Number(n).toFixed(4) : "—";
const pct = (n, prefix = true) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${prefix && n >= 0 ? "+" : ""}${f2(n)}%`;
};
const pnlColor  = n => (n == null || !Number.isFinite(n)) ? C.textDim : n > 0 ? C.green : n < 0 ? C.red : C.muted;
const ratioDisp = r => r != null ? `${Number(r).toFixed(2)}x` : "—";
const fMs = ms => {
  if (!ms) return "—";
  if (ms < 1000)   return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(2)}m`;
};
const fTime = ts => ts ? new Date(ts).toISOString().slice(11, 23) : "—";

function Row({ label, value, color, mono: isMono = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.borderLo}` }}>
      <span style={{ color: C.textDim, fontSize: 8 }}>{label}</span>
      <span style={{ color: color ?? C.text, fontSize: 9, fontFamily: isMono ? mono : undefined, fontWeight: 600 }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: 1.2,
      color: C.muted, margin: "14px 0 6px", paddingBottom: 4,
      borderBottom: `1px solid ${C.border}`,
    }}>
      {children}
    </div>
  );
}

function PnlRow({ label, value }) {
  return <Row label={label} value={pct(value)} color={pnlColor(value)} />;
}

function DiagBadge({ label }) {
  const color = label?.includes("WHIPSAW") ? C.red : label?.includes("CONFIRMED") ? C.green : C.textDim;
  return (
    <span style={{
      fontFamily: mono, fontSize: 7, padding: "2px 6px", borderRadius: 3,
      background: `${color}15`, border: `1px solid ${color}44`, color,
      display: "inline-block", margin: "2px 3px",
    }}>
      {label}
    </span>
  );
}

// ─── MINI PRICE CHART ─────────────────────────────────────────────────────────

function MiniPriceChart({ audit }) {
  const history = audit.priceHistory ?? [];
  if (history.length < 2) return (
    <div style={{ color: C.textDim, fontSize: 8, padding: "10px 0" }}>No price history</div>
  );

  const W = 360, H = 80;
  const prices = history.map(h => h.p);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const toX = (i) => (i / (history.length - 1)) * W;
  const toY = (p) => H - ((p - minP) / range) * H;

  const points = history.map((h, i) => `${toX(i)},${toY(h.p)}`).join(" ");

  // Key markers
  const entryIdx   = history.findIndex(h => h.t >= (audit.shadowLongEntryTime ?? 0));
  const shortSlT   = audit.sourceShortClosedAt;
  const slIdx      = history.findIndex(h => h.t >= shortSlT);

  const entryPx    = entryIdx >= 0 ? toX(entryIdx) : null;
  const shortSlPx  = slIdx >= 0 ? toX(slIdx) : null;

  return (
    <div style={{ margin: "10px 0" }}>
      <svg width={W} height={H + 16} style={{ display: "block", overflow: "visible" }}>
        <polyline points={points} fill="none" stroke={C.blue} strokeWidth={1.5} />
        {shortSlPx != null && (
          <line x1={shortSlPx} y1={0} x2={shortSlPx} y2={H} stroke={C.red} strokeWidth={1} strokeDasharray="3,2" />
        )}
        {entryPx != null && (
          <line x1={entryPx} y1={0} x2={entryPx} y2={H} stroke={C.green} strokeWidth={1} strokeDasharray="3,2" />
        )}
        {shortSlPx != null && (
          <text x={shortSlPx + 2} y={H + 12} fill={C.red} fontSize={7} fontFamily={mono}>SL</text>
        )}
        {entryPx != null && (
          <text x={entryPx + 2} y={H + 12} fill={C.green} fontSize={7} fontFamily={mono}>L↗</text>
        )}
      </svg>
    </div>
  );
}

// ─── MAIN DRAWER ─────────────────────────────────────────────────────────────

export default function ShadowLongInspectionDrawer({ audit, onClose }) {
  if (!audit) return null;

  const whipsaw = (
    (audit.sourceShortDurationMs ?? Infinity) <= 60_000 &&
    audit.mirrorCloseReason === "SL" &&
    (audit.durationMs ?? Infinity) <= 60_000
  );

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 440,
      background: "#0c0c1a", borderLeft: `1px solid ${C.border}`,
      overflowY: "auto", zIndex: 1000, padding: "18px 20px",
      boxShadow: "-4px 0 20px #00000088",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: C.text }}>{audit.symbol}</div>
          <div style={{ fontSize: 8, color: C.purple, marginTop: 2 }}>SHADOW LONG AUDIT · OBSERVER ONLY</div>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: `1px solid ${C.border}`, color: C.textDim,
          fontFamily: mono, fontSize: 11, padding: "4px 10px", cursor: "pointer", borderRadius: 3,
        }}>✕ CLOSE</button>
      </div>

      {/* Observer notice */}
      <div style={{
        background: "#08050a", border: "1px solid #aa66ff33", borderRadius: 3,
        padding: "5px 10px", marginBottom: 12, fontSize: 7, color: C.purple, fontFamily: mono,
      }}>
        SHADOW ONLY · NO REAL LONG ORDERS
      </div>

      {/* Whipsaw alert */}
      {whipsaw && (
        <div style={{
          background: "#1a0505", border: "1px solid #ff445566", borderRadius: 3,
          padding: "6px 10px", marginBottom: 12,
        }}>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.red, fontWeight: 700 }}>
            ⚠ WHIPSAW — SHORT SL + LONG SL both within 60s. Doubled losses.
          </span>
        </div>
      )}

      {/* ── SECTION 1: Failed SHORT ─────────────────────────────────────────── */}
      <SectionTitle>① FAILED SHORT</SectionTitle>
      <Row label="Symbol"        value={audit.symbol} />
      <Row label="Entry time"    value={fTime(audit.sourceShortEntryTime)} />
      <Row label="SL fill time"  value={fTime(audit.sourceShortClosedAt)} />
      <Row label="Duration"      value={fMs(audit.sourceShortDurationMs)} color={C.amber} />
      <Row label="Duration label" value={audit.sourceShortDurationLabel?.replace(/SHORT_SL_/, "")} />
      <Row label="Entry price"   value={f4(audit.sourceShortEntryPrice)} />
      <Row label="Exit price"    value={f4(audit.sourceShortExitPrice)} />
      <Row label="Leverage"      value={`${audit.sourceShortLeverage ?? "—"}x`} />
      <PnlRow label="SHORT gross margin"    value={audit.sourceShortGrossMarginPnlPct} />
      <PnlRow label="SHORT fee-net margin"  value={audit.sourceShortFeeNetMarginPnlPct} />
      <PnlRow label="SHORT fee-net 1x"      value={audit.sourceShortFeeNetNormPnlPct} />
      <Row label="Source bucket" value={audit.sourceShortParentBucket?.replace(/_/g, " ")} />
      <Row label="Sub bucket"    value={audit.sourceShortSubBucket?.replace(/_/g, " ")} />
      <Row label="ATR"           value={f3(audit.atrPct)} />
      <Row label="ATR class"     value={audit.shadowLongAtrClass} />
      <Row label="AES"           value={audit.aes ?? "—"} />
      <Row label="Entry rank"    value={audit.entryRank ?? "—"} />
      <Row label="CVD label"     value={audit.cvdLabel ?? "—"} />
      <Row label="VWAP pct"      value={f2(audit.priceVsVwapPct)} />
      <Row label="Last 3 ticks"  value={audit.last3TicksDirection ?? "—"} />
      <Row label="BTC direction" value={audit.btcDirection ?? "—"} color={audit.btcDirection === "UP" ? C.green : audit.btcDirection === "DOWN" ? C.red : C.muted} />
      <Row label="ETH direction" value={audit.ethDirection ?? "—"} color={audit.ethDirection === "UP" ? C.green : audit.ethDirection === "DOWN" ? C.red : C.muted} />
      <Row label="BTC regime"    value={audit.btcRegime ?? "—"} />
      <Row label="Hypothesis eligible" value={audit.shadowLongHypothesisEligible ? "YES" : "NO"}
        color={audit.shadowLongHypothesisEligible ? C.purple : C.muted} />
      {audit.shadowLongHypothesisFailReasons?.length > 0 && (
        <Row label="Fail reasons" value={audit.shadowLongHypothesisFailReasons.join(", ")} color={C.amber} />
      )}

      {/* ── SECTION 2: Shadow LONG ──────────────────────────────────────────── */}
      <SectionTitle>② SHADOW LONG SIMULATION</SectionTitle>
      <Row label="Signal time"      value={fTime(audit.shadowLongSignalTime)} />
      <Row label="Entry time"       value={fTime(audit.shadowLongEntryTime)} />
      <Row label="Trigger delay"    value={fMs(audit.shadowLongTriggerDelayMs)} />
      <Row label="Ref price"        value={f4(audit.shadowLongEntryReferencePrice)} />
      <Row label="Entry price (slip)" value={f4(audit.shadowLongEntryPrice)} />
      <Row label="Leverage"         value={`${audit.shadowLongLeverage ?? "—"}x`} />
      <Row label="Price source"     value={audit.priceSource} />
      <Row label="Precision"        value={audit.samplingPrecision}
        color={audit.samplingPrecision === "REALTIME" ? C.green : C.amber} />
      <PnlRow label="LONG gross 1x"      value={audit.shadowLongGrossNormPnlPct} />
      <PnlRow label="LONG fee-net 1x"    value={audit.shadowLongFeeNetNormPnlPct} />
      <PnlRow label="LONG fee-net margin" value={audit.shadowLongFeeNetMarginPnlPct} />
      <PnlRow label="Mirror profile net"  value={audit.mirrorFeeNetNormPnlPct} />
      <Row    label="Mirror close reason" value={audit.mirrorCloseReason ?? "—"} />
      <PnlRow label="ATR profile net"     value={audit.atrProfileFeeNetNormPnlPct} />
      <Row    label="ATR profile close"   value={audit.atrProfileCloseReason ?? "—"} />
      <Row    label="MFE (LONG potential)" value={pct(audit.grossMfeNormPct, false)} color={C.green} />
      <Row    label="MAE (LONG adverse)"   value={pct(audit.grossMaeNormPct, false)} color={C.red} />
      <Row    label="MFE ATR multiple"     value={audit.mfeAtrMultiple != null ? `${f2(audit.mfeAtrMultiple)}x` : "—"} />

      <div style={{ marginTop: 8 }}>
        <div style={{ fontFamily: mono, fontSize: 7, color: C.textDim, marginBottom: 4 }}>FIXED-HORIZON SNAPSHOTS (fee-net 1x)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {[
            ["15s",  audit.feeNetPnlAt15sNormPct],
            ["30s",  audit.feeNetPnlAt30sNormPct],
            ["1m",   audit.feeNetPnlAt60sNormPct],
            ["2m",   audit.feeNetPnlAt120sNormPct],
            ["3m",   audit.feeNetPnlAt180sNormPct],
            ["5m",   audit.feeNetPnlAt300sNormPct],
            ["10m",  audit.feeNetPnlAt600sNormPct],
          ].map(([label, val]) => (
            <div key={label} style={{
              background: C.surface, border: `1px solid ${C.borderLo}`,
              borderRadius: 3, padding: "4px 6px", textAlign: "center",
            }}>
              <div style={{ fontSize: 7, color: C.textDim }}>{label}</div>
              <div style={{ fontSize: 8, fontFamily: mono, color: pnlColor(val) }}>{pct(val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 3: Combined rescue ──────────────────────────────────────── */}
      <SectionTitle>③ COMBINED RESCUE RESULT</SectionTitle>
      <PnlRow label="SHORT fee-net loss"     value={audit.sourceShortFeeNetMarginPnlPct} />
      <PnlRow label="LONG fee-net result"    value={audit.shadowLongFeeNetMarginPnlPct} />
      <PnlRow label="Combined additive"      value={audit.combinedAdditiveMarginPnlPct} />
      <PnlRow label="Combined compounded"    value={audit.combinedCompoundedMarginPnlPct} />
      <Row label="Recovery ratio"   value={ratioDisp(audit.shortLossRecoveryRatio)}
        color={pnlColor((audit.shortLossRecoveryRatio ?? 0) - 1)} />
      <Row label="Full rescue"      value={audit.fullyRecoveredShortLoss ? "YES" : "NO"}
        color={audit.fullyRecoveredShortLoss ? C.green : C.red} />
      <Row label="Profitable after rescue" value={audit.profitableAfterFullRescue ? "YES" : "NO"}
        color={audit.profitableAfterFullRescue ? C.green : C.muted} />
      <Row label="Whipsaw"          value={whipsaw ? "YES ⚠" : "NO"}
        color={whipsaw ? C.red : C.muted} />
      <Row label="Outcome"          value={audit.outcomeLabel?.replace(/^SHADOW_LONG_/, "").replace(/_/g, " ") ?? "—"}
        color={audit.outcomeLabel?.includes("PROFIT") ? C.green : audit.outcomeLabel?.includes("ADDED_TO") ? C.red : C.amber} />

      {audit.diagnosticLabels?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 7, color: C.textDim, marginBottom: 4 }}>DIAGNOSTIC LABELS</div>
          {audit.diagnosticLabels.map(d => <DiagBadge key={d} label={d} />)}
        </div>
      )}

      {/* ── SECTION 4: Price path chart ─────────────────────────────────────── */}
      {audit.priceHistory?.length > 1 && (
        <>
          <SectionTitle>④ PRICE PATH</SectionTitle>
          <MiniPriceChart audit={audit} />
          <div style={{ display: "flex", gap: 14, fontSize: 7, color: C.textDim, marginTop: 4 }}>
            <span style={{ color: C.red }}>─ ─ SHORT SL</span>
            <span style={{ color: C.green }}>─ ─ LONG L↗ entry</span>
          </div>
        </>
      )}

      {/* Data warnings */}
      {audit.dataWarnings?.length > 0 && (
        <div style={{ marginTop: 14, padding: "6px 10px", background: "#1a1005", border: "1px solid #ffaa4433", borderRadius: 3 }}>
          {audit.dataWarnings.map(w => (
            <div key={w} style={{ fontFamily: mono, fontSize: 7, color: C.amber }}>{w}</div>
          ))}
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
