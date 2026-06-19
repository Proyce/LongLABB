// Expanded market regime detail panel — opened by clicking header chips
import { color as _tk, font as _tkFont } from "../ui/tokens.js";
const mono = _tkFont.mono;
const C = {
  bg:      _tk.bg,
  surface: _tk.surface,
  border:  _tk.border,
  text:    _tk.text,
  dim:     _tk.textDim,
  green:   _tk.long,
  red:     _tk.short,
  amber:   _tk.warn,
  blue:    _tk.info,
  purple:  _tk.accent,
};

const f2 = n => (n != null && Number.isFinite(Number(n))) ? Number(n).toFixed(2) : "—";
const fPct = n => n != null ? `${n >= 0 ? "+" : ""}${f2(n)}%` : "—";

function scoreColor(score) {
  if (score == null) return C.dim;
  if (score > 20) return C.green;
  if (score < -20) return C.red;
  return C.amber;
}

function regimeColor(regime) {
  if (!regime) return C.amber;
  const r = String(regime).toUpperCase();
  if (r.includes("TRENDING_UP") || r.includes("BREAKOUT_UP"))    return C.green;
  if (r.includes("PULLBACK_IN_UPTREND") || r.includes("TRANSITION_UP")) return C.amber;
  if (r.includes("RANGING") || r.includes("CHOPPY"))             return C.dim;
  if (r.includes("TRANSITION_DOWN"))                              return C.amber;
  if (r.includes("BOUNCE_IN_DOWNTREND"))                         return C.amber;
  if (r.includes("TRENDING_DOWN") || r.includes("BREAKDOWN_DOWN")) return C.red;
  if (r.includes("STALE"))                                        return C.purple;
  return C.amber;
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.dim, fontSize: 8, fontFamily: mono }}>{label}</span>
      <span style={{ color: color ?? C.text, fontSize: 8, fontFamily: mono, fontWeight: 700 }}>{value ?? "—"}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: C.blue, fontSize: 8, fontFamily: mono, fontWeight: 700, letterSpacing: 1, marginBottom: 4, paddingBottom: 2, borderBottom: `1px solid ${C.border}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function AssetPanel({ asset, label }) {
  if (!asset) return <div style={{ color: C.dim, fontSize: 8 }}>No {label} context</div>;

  return (
    <Section title={`${label} ASSET CONTEXT`}>
      <Row label="Regime"          value={asset.regime}                    color={regimeColor(asset.regime)} />
      <Row label="Trend"           value={asset.trendState}                color={C.amber} />
      <Row label="Momentum"        value={asset.momentumPhase}             color={C.amber} />
      <Row label="Volatility"      value={asset.volatilityState}           />
      <Row label="Micro Dir Score" value={asset.microDirectionScore}       color={scoreColor(asset.microDirectionScore)} />
      <Row label="Micro Dir"       value={asset.microDirectionLabel}       />
      <Row label="Tactical Score"  value={asset.tacticalDirectionScore}    color={scoreColor(asset.tacticalDirectionScore)} />
      <Row label="Tactical Dir"    value={asset.tacticalDirectionLabel}    />
      <Row label="Structural Score" value={asset.structuralDirectionScore} color={scoreColor(asset.structuralDirectionScore)} />
      <Row label="Structural Dir"  value={asset.structuralDirectionLabel}  />
      <Row label="ADX14"           value={asset.adx14?.toFixed(1)}        />
      <Row label="EMA Stack"       value={asset.emaStack}                  />
      <Row label="DMI Bias"        value={asset.dmiBias}                   />
      <Row label="ATR%"            value={asset.atrPct?.toFixed(4)}       />
      <Row label="Structure 15m"   value={asset.structure15m}              />
      <Row label="Structure 1h"    value={asset.structure1h}               />
      <Row label="Coverage"        value={asset.coveragePct != null ? `${(asset.coveragePct * 100).toFixed(0)}%` : "—"} />
      {asset.warnings?.length > 0 && (
        <Row label="Warnings" value={asset.warnings.join(" | ")} color={C.amber} />
      )}
    </Section>
  );
}

function CrossPanel({ cross }) {
  if (!cross) return <div style={{ color: C.dim, fontSize: 8 }}>No cross-market context</div>;
  return (
    <Section title="CROSS-MARKET">
      <Row label="BTC/ETH Alignment"  value={cross.btcEthAlignmentLabel}          color={C.amber} />
      <Row label="LONG Tailwind Score" value={cross.crossMarketLongTailwindScore}   color={scoreColor(cross.crossMarketLongTailwindScore)} />
      <Row label="LONG Bias"           value={cross.crossMarketLongBiasLabel}       />
      <Row label="SHORT Tailwind Score" value={cross.crossMarketShortTailwindScore}  color={scoreColor(cross.crossMarketShortTailwindScore)} />
      <Row label="SHORT Bias"          value={cross.crossMarketShortBiasLabel}      color={C.dim} />
      {cross.marketConflictFlags?.length > 0 && (
        <Row label="Conflicts" value={cross.marketConflictFlags.join(" | ")} color={C.amber} />
      )}
    </Section>
  );
}

function BreadthPanel({ breadth }) {
  if (!breadth) return <div style={{ color: C.dim, fontSize: 8 }}>No breadth data</div>;
  return (
    <Section title="MARKET BREADTH">
      <Row label="Label"              value={breadth.breadthLabel}           color={C.amber} />
      <Row label="Direction Score"    value={breadth.breadthDirectionScore}  color={scoreColor(breadth.breadthDirectionScore)} />
      <Row label="Valid Symbols"      value={breadth.validSymbolCount}       />
      <Row label="Green 5m %"        value={breadth.pctGreen5m != null ? `${breadth.pctGreen5m}%` : "—"}         color={breadth.pctGreen5m >= 60 ? C.green : C.dim} />
      <Row label="Green 15m %"       value={breadth.pctGreen15m != null ? `${breadth.pctGreen15m}%` : "—"}        color={breadth.pctGreen15m >= 60 ? C.green : C.dim} />
      <Row label="Above VWAP 15m %"  value={breadth.pctAboveVwap15m != null ? `${breadth.pctAboveVwap15m}%` : "—"} color={breadth.pctAboveVwap15m >= 55 ? C.green : C.dim} />
      <Row label="Bull EMA Stack %"  value={breadth.pctBullishEmaStack15m != null ? `${breadth.pctBullishEmaStack15m}%` : "—"} color={breadth.pctBullishEmaStack15m >= 55 ? C.green : C.dim} />
      <Row label="Median Return 15m" value={breadth.medianReturn15m != null ? fPct(breadth.medianReturn15m) : "—"} color={breadth.medianReturn15m >= 0 ? C.green : C.red} />
      <Row label="Breadth Long Score" value={breadth.breadthLongScore != null ? `${breadth.breadthLongScore}` : "—"} color={scoreColor(breadth.breadthLongScore)} />
      <Row label="Red 5m %"          value={breadth.pctRed5m != null ? `${breadth.pctRed5m}%` : "—"}            color={C.dim} />
      <Row label="Red 15m %"         value={breadth.pctRed15m != null ? `${breadth.pctRed15m}%` : "—"}           color={C.dim} />
      <Row label="Below VWAP 15m %"  value={breadth.pctBelowVwap15m != null ? `${breadth.pctBelowVwap15m}%` : "—"} color={C.dim} />
      <Row label="Bear EMA Stack %"  value={breadth.pctBearishEmaStack15m != null ? `${breadth.pctBearishEmaStack15m}%` : "—"} color={C.dim} />
    </Section>
  );
}

function SessionPanel({ sessionHealth }) {
  if (!sessionHealth) return <div style={{ color: C.dim, fontSize: 8 }}>No session health data</div>;
  const m = sessionHealth.metrics ?? {};
  return (
    <Section title="SESSION HEALTH">
      <Row label="Effective State"    value={sessionHealth.effectiveState}        color={C.amber} />
      <Row label="Candidate State"    value={sessionHealth.candidateState}        />
      <Row label="Severity"           value={sessionHealth.severity}              />
      <Row label="Transition Reason"  value={sessionHealth.transitionReason}      />
      <Row label="Live Norm Total"    value={m.liveFeeAdjustedNormTotal?.toFixed(4)} color={m.liveFeeAdjustedNormTotal >= 0 ? C.green : C.red} />
      <Row label="Realized Norm Total" value={m.realizedFeeAdjustedNormTotal?.toFixed(4)} color={m.realizedFeeAdjustedNormTotal >= 0 ? C.green : C.red} />
      <Row label="Net Norm Total"     value={m.netFeeAdjustedNormTotal?.toFixed(4)} color={m.netFeeAdjustedNormTotal >= 0 ? C.green : C.red} />
      <Row label="Recent Win Rate"    value={m.recentWinRateAfterFees != null ? `${(m.recentWinRateAfterFees * 100).toFixed(1)}%` : "—"} />
      <Row label="Recent SL Rate"     value={m.recentSlRate != null ? `${(m.recentSlRate * 100).toFixed(1)}%` : "—"} color={m.recentSlRate > 0.35 ? C.red : C.text} />
      <Row label="Expectancy"         value={m.recentExpectancy?.toFixed(4)} color={m.recentExpectancy >= 0 ? C.green : C.red} />
      <Row label="Consecutive Losses" value={m.consecutiveLosses}             color={m.consecutiveLosses >= 4 ? C.red : C.text} />
      <Row label="Threshold Delta"    value={sessionHealth.recommendedThresholdDelta != null ? `+${sessionHealth.recommendedThresholdDelta}` : "—"} />
      <Row label="Capacity"           value={sessionHealth.recommendedCapacityMultiplier != null ? `${(sessionHealth.recommendedCapacityMultiplier * 100).toFixed(0)}%` : "—"} />
    </Section>
  );
}

function PolicyPanel({ entryPolicy }) {
  if (!entryPolicy) return <div style={{ color: C.dim, fontSize: 8 }}>No policy data</div>;
  const wpColor = entryPolicy.entryPolicyWouldAllow ? C.green : C.red;
  return (
    <Section title="ENTRY POLICY">
      <Row label="Mode"              value={entryPolicy.entryPolicyMode}              color={C.amber} />
      <Row label="Shadow Decision"   value={entryPolicy.entryPolicyShadowDecision}    color={wpColor} />
      <Row label="Would Allow"       value={entryPolicy.entryPolicyWouldAllow ? "YES" : "NO"} color={wpColor} />
      <Row label="Execution Applied" value="false (SHADOW ONLY)"                      color={C.purple} />
      <Row label="Required AES"      value={entryPolicy.entryPolicyRequiredAes}       />
      <Row label="AES Gap"           value={entryPolicy.entryPolicyAesGap}            color={entryPolicy.entryPolicyAesGap >= 0 ? C.green : C.red} />
      <Row label="Context Age"       value={entryPolicy.entryPolicyContextAgeMs != null ? `${Math.round(entryPolicy.entryPolicyContextAgeMs / 1000)}s` : "—"} />
      <Row label="Eval Timing"       value={entryPolicy.entryPolicyEvaluationTiming} />
      {entryPolicy.entryPolicyReasons?.length > 0 && (
        <Row label="Reasons" value={entryPolicy.entryPolicyReasons.join(" | ")} color={C.amber} />
      )}
    </Section>
  );
}

export default function MarketRegimeDetails({ marketRegime, sessionHealth, entryPolicy, target, onClose, samples = [] }) {
  return (
    <div style={{
      position: "fixed",
      top: 60,
      right: 12,
      width: 340,
      maxHeight: "80vh",
      overflowY: "auto",
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 5,
      padding: "10px 12px",
      zIndex: 9999,
      boxShadow: "0 8px 40px #00000099",
      fontFamily: mono,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: C.blue, fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>MARKET REGIME DETAIL</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 12, padding: 2 }}>✕</button>
      </div>

      <div style={{ fontSize: 7, color: C.dim, marginBottom: 8 }}>
        Snapshot: {marketRegime?.snapshotId ?? "—"} · {marketRegime?.computedAt ? new Date(marketRegime.computedAt).toISOString().slice(11, 19) : "—"}
      </div>

      {(target === "btc" || !target) && <AssetPanel asset={marketRegime?.btc}  label="BTC" />}
      {(target === "eth" || !target) && <AssetPanel asset={marketRegime?.eth}  label="ETH" />}
      {(target === "cross" || !target) && <CrossPanel cross={marketRegime?.crossMarket} />}
      {(target === "breadth" || !target) && <BreadthPanel breadth={marketRegime?.breadth} />}
      {(target === "session" || !target) && <SessionPanel sessionHealth={sessionHealth} />}
      {(target === "policy" || !target) && <PolicyPanel entryPolicy={entryPolicy} />}

      {(target === "context" || !target) && (
        <Section title="SNAPSHOT INFO">
          <Row label="Freshness"  value={marketRegime?.freshnessLabel}  color={marketRegime?.freshnessLabel === "LIVE" ? C.green : C.amber} />
          <Row label="Degraded"   value={marketRegime?.degraded ? "YES" : "NO"} />
          <Row label="Coverage"   value={marketRegime?.coveragePct != null ? `${(marketRegime.coveragePct * 100).toFixed(0)}%` : "—"} />
          <Row label="Confidence" value={marketRegime?.confidence}  />
          <Row label="Latency"    value={marketRegime?.latencyMs != null ? `${marketRegime.latencyMs}ms` : "—"} />
          {marketRegime?.warnings?.length > 0 && (
            <Row label="Warnings" value={marketRegime.warnings.join(" | ")} color={C.amber} />
          )}
        </Section>
      )}
    </div>
  );
}
