import { useMemo, useState } from "react";
import { applyLongFilterState } from "../longFilterEngine.js";
import { DEFAULT_LONG_FILTER_STATE } from "../longFilterState.js";
import { LONG_FILTER_REGISTRY, getFilterById } from "../longFilterRegistry.js";
import { buildWinningSetupAnalytics } from "../longFilterAnalytics.js";
import {
  LONG_WINNING_SETUPS,
  WINNING_QUICK_VIEW_IDS,
  WINNING_SETUP_FAMILY,
  createWinningSetupFilterState,
  getLongWinningSetup,
  getActiveWinningSetupId,
} from "../longWinningSetups.js";
import { ExplainMatchDrawer } from "./ExplainMatchDrawer.jsx";
import { color, font } from "../../ui/tokens.js";

const mono = font.mono;
const C = {
  surface: color.surface,
  bg: color.bg,
  border: color.border,
  borderLo: color.borderLo,
  text: color.text,
  textSub: color.textSub,
  textDim: color.textDim,
  green: color.long,
  red: color.short,
  blue: color.info,
  amber: color.warn,
};

const FAMILY_LABEL = Object.freeze({
  [WINNING_SETUP_FAMILY.PRIORITY_GATE]: "Priority Gates",
  [WINNING_SETUP_FAMILY.UNIVERSAL]: "Universal Winners",
  [WINNING_SETUP_FAMILY.TOP_GAINER]: "Top Gainer Winners",
  [WINNING_SETUP_FAMILY.TOP_LOSER]: "Top Loser Winners",
  [WINNING_SETUP_FAMILY.TOXIC_CONTROL]: "Toxic Controls",
  [WINNING_SETUP_FAMILY.EXIT_DIAGNOSTIC]: "Exit Diagnostics",
});

function signed(value, digits = 3) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function pct(value, digits = 1) {
  return value == null ? "—" : `${Number(value).toFixed(digits)}%`;
}

function Button({ children, onClick, accent = C.textSub, active = false, title }) {
  return (
    <button title={title} onClick={onClick} style={{
      fontFamily: mono, fontSize: 8, fontWeight: 800, letterSpacing: 0.8,
      padding: "4px 8px", borderRadius: 3, cursor: "pointer",
      color: active ? "#fff" : accent,
      background: active ? "#17315a" : "#0a0d15",
      border: `1px solid ${active ? C.blue : C.border}`,
    }}>{children}</button>
  );
}

function Metric({ label, value, tone = C.text }) {
  return (
    <div style={{ minWidth: 72 }}>
      <div style={{ color: C.textDim, fontSize: 7, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: tone, fontSize: 11, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ReferenceEvidence({ evidence }) {
  if (!evidence) return null;
  return (
    <div style={{
      background: "#090c13", border: `1px solid ${C.borderLo}`, borderRadius: 3,
      padding: "6px 8px", fontSize: 8, color: C.textDim, lineHeight: 1.5,
    }}>
      <span style={{ color: C.amber, fontWeight: 800, letterSpacing: 0.8 }}>REFERENCE</span>
      {evidence.n != null && <span> · n={evidence.n}</span>}
      {evidence.avg != null && <span> · avg {signed(evidence.avg, 4)}</span>}
      {evidence.win != null && <span> · win {pct(evidence.win)}</span>}
      {evidence.note && <div style={{ marginTop: 2 }}>{evidence.note}</div>}
    </div>
  );
}

function isKnown(value) {
  return value !== null && value !== undefined && value !== "UNKNOWN" && value !== "INSUFFICIENT_DATA";
}

function getSetupSourceCoverage(setup, trades) {
  const predicates = [...(setup.predicates ?? []), ...(setup.outcomePredicates ?? [])];
  const fields = [...new Set(predicates.map(predicate => getFilterById(predicate.filterId)?.field).filter(Boolean))];
  if (!fields.length) return { coveragePct: 100, unavailable: false };
  if (!trades.length) return { coveragePct: 0, unavailable: true };
  const known = trades.filter(trade => fields.every(field => isKnown(trade?.[field]))).length;
  const coveragePct = Number((known / trades.length * 100).toFixed(1));
  return { coveragePct, unavailable: known === 0 };
}

function SetupCard({ setup, analysis, availability, active, onView, onAdd, onCompare, onExplain }) {
  const [expanded, setExpanded] = useState(false);
  const positive = (analysis.avgFeeAdjustedNormPnl ?? 0) >= 0;
  return (
    <div style={{
      background: active ? "#0d1524" : C.surface,
      border: `1px solid ${active ? C.blue : C.border}`,
      borderRadius: 5, padding: 11, display: "flex", flexDirection: "column", gap: 8,
      boxShadow: active ? "0 0 0 1px rgba(70,130,255,.12) inset" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: C.text, letterSpacing: 0.4 }}>{setup.title}</div>
          <div style={{ fontSize: 8, color: C.textDim, marginTop: 3, lineHeight: 1.45 }}>{setup.description}</div>
        </div>
        <span style={{
          fontSize: 7, fontWeight: 900, color: setup.status === "BROKEN" ? C.red : C.blue,
          border: `1px solid ${setup.status === "BROKEN" ? "#743332" : "#274b80"}`,
          borderRadius: 10, padding: "2px 6px", whiteSpace: "nowrap",
        }}>{setup.status.replaceAll("_", " ")}</span>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric label="Trades" value={availability.unavailable ? "UNAVAILABLE" : analysis.tradeCount} tone={availability.unavailable ? C.amber : C.text} />
        <Metric label="Avg fee-net" value={signed(analysis.avgFeeAdjustedNormPnl, 4)} tone={positive ? C.green : C.red} />
        <Metric label="Win" value={pct(analysis.winRatePct)} />
        <Metric label="SL" value={pct(analysis.slRatePct)} tone={(analysis.slRatePct ?? 0) > 20 ? C.red : C.text} />
        <Metric label="PF fee-net" value={analysis.feeAdjustedProfitFactor == null ? "∞/—" : analysis.feeAdjustedProfitFactor.toFixed(2)} />
        <Metric label="Sessions" value={`${analysis.positiveSessions}/${analysis.sessionCount}`} />
      </div>

      {expanded && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 6, fontSize: 8 }}>
          <div style={{ color: C.textDim }}>Gainers: <b style={{ color: C.text }}>{analysis.topGainer.trades}</b> · avg <b style={{ color: (analysis.topGainer.avg ?? 0) >= 0 ? C.green : C.red }}>{signed(analysis.topGainer.avg, 4)}</b></div>
          <div style={{ color: C.textDim }}>Losers: <b style={{ color: C.text }}>{analysis.topLoser.trades}</b> · avg <b style={{ color: (analysis.topLoser.avg ?? 0) >= 0 ? C.green : C.red }}>{signed(analysis.topLoser.avg, 4)}</b></div>
          <div style={{ color: C.textDim }}>Source coverage: <b style={{ color: availability.unavailable ? C.amber : C.text }}>{pct(availability.coveragePct)}</b></div>
          <div style={{ color: C.textDim }}>AES V1/V2: <b style={{ color: C.text }}>{analysis.longAesV1Avg ?? "—"} / {analysis.longAesV2Avg ?? "—"}</b></div>
          <div style={{ color: C.textDim }}>DNA V1/V2: <b style={{ color: C.text }}>{analysis.bestDnaV1Avg ?? "—"} / {analysis.bestDnaV2Avg ?? "—"}</b></div>
          <div style={{ color: C.textDim }}>Confidence: <b style={{ color: analysis.confidenceInformativeness?.isInformative ? C.text : C.amber }}>{analysis.confidenceInformativeness?.status ?? "UNCALIBRATED"}</b>{analysis.confidenceInformativeness?.knownCount ? ` · ${analysis.confidenceInformativeness.dominantPct}% dominant` : ""}</div>
        </div>
      )}

      <ReferenceEvidence evidence={setup.referenceEvidence} />

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <Button onClick={() => onView(setup)} accent={C.blue} active={active}>VIEW TRADES</Button>
        <Button onClick={() => onAdd(setup)} accent={C.green}>ADD</Button>
        <Button onClick={() => onCompare(setup)} accent={C.amber}>COMPARE</Button>
        <Button onClick={() => onExplain(setup)} accent={C.textSub}>EXPLAIN</Button>
        <Button onClick={() => setExpanded(value => !value)} accent={C.textSub}>{expanded ? "LESS" : "DETAILS"}</Button>
        <span style={{ marginLeft: "auto", color: C.textDim, fontSize: 7, alignSelf: "center" }}>LOG ONLY · NO EXECUTION EFFECT</span>
      </div>
    </div>
  );
}

export function WinningQuickViewStrip({ closedSamples, filterState, onView, onMore, onClear }) {
  const activeId = getActiveWinningSetupId(filterState);
  const items = useMemo(() => WINNING_QUICK_VIEW_IDS.map(id => {
    const setup = getLongWinningSetup(id);
    const state = createWinningSetupFilterState(setup, DEFAULT_LONG_FILTER_STATE);
    const result = applyLongFilterState(closedSamples, state, LONG_FILTER_REGISTRY);
    return { setup, count: result.outputCount };
  }), [closedSamples]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap",
      padding: "7px 9px", marginBottom: 10,
      background: "#080b12", border: `1px solid ${C.border}`, borderRadius: 4,
    }}>
      <span style={{ fontFamily: mono, fontSize: 7, fontWeight: 900, color: C.amber, letterSpacing: 1.5, marginRight: 3 }}>WINNING QUICK VIEW</span>
      {items.map(({ setup, count }) => (
        <Button key={setup.id} title={setup.description} onClick={() => onView(setup)} active={activeId === setup.id} accent={C.textSub}>
          {setup.shortTitle} <span style={{ opacity: 0.65 }}>({count})</span>
        </Button>
      ))}
      <Button onClick={onMore} accent={C.blue}>MORE</Button>
      {activeId && <Button onClick={onClear} accent={C.red}>CLEAR WINNING VIEW</Button>}
    </div>
  );
}

export default function WinningSetupsPanel({ closedSamples, filterState, onView, onAdd, onCompare }) {
  const [explain, setExplain] = useState(null);
  const activeId = getActiveWinningSetupId(filterState);

  const rows = useMemo(() => LONG_WINNING_SETUPS.map(setup => {
    const state = createWinningSetupFilterState(setup, DEFAULT_LONG_FILTER_STATE);
    const result = applyLongFilterState(closedSamples, state, LONG_FILTER_REGISTRY);
    return {
      setup,
      result,
      analysis: buildWinningSetupAnalytics(result.trades),
      availability: getSetupSourceCoverage(setup, closedSamples),
    };
  }), [closedSamples]);

  const groups = Object.values(WINNING_SETUP_FAMILY).map(family => ({
    family,
    rows: rows.filter(row => row.setup.family === family),
  })).filter(group => group.rows.length > 0);

  const handleExplain = setup => {
    const row = rows.find(item => item.setup.id === setup.id);
    setExplain(row ? { setup, trade: row.result.trades[0] ?? null, result: row.result } : null);
  };

  return (
    <div style={{ fontFamily: mono }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
        background: "#0a101a", border: `1px solid ${C.border}`, borderRadius: 5, padding: "9px 11px",
      }}>
        <div>
          <div style={{ color: C.amber, fontSize: 9, fontWeight: 900, letterSpacing: 1.4 }}>★ CURATED WINNING SETUPS</div>
          <div style={{ color: C.textDim, fontSize: 8, marginTop: 3 }}>CURRENT metrics use the real registry engine. REFERENCE evidence is shown separately. RESEARCH ONLY · FILTERS DO NOT AFFECT EXECUTION.</div>
        </div>
        <span style={{ marginLeft: "auto", color: C.blue, fontSize: 7, fontWeight: 900 }}>LONG_WINNING_SETUPS_V1</span>
      </div>

      {explain && (
        <div style={{ marginBottom: 12 }}>
          {explain.trade ? (
            <ExplainMatchDrawer trade={explain.trade} filterResultsByTradeId={explain.result.filterResultsByTradeId} registry={LONG_FILTER_REGISTRY} onClose={() => setExplain(null)} />
          ) : (
            <div style={{ color: C.textDim, border: `1px solid ${C.border}`, padding: 10, borderRadius: 4 }}>
              No current trade matches {explain.setup.title}. Its predicates remain available in Advanced Filters.
              <button onClick={() => setExplain(null)} style={{ marginLeft: 10 }}>Close</button>
            </div>
          )}
        </div>
      )}

      {groups.map(group => (
        <section key={group.family} style={{ marginBottom: 18 }}>
          <div style={{
            color: group.family === WINNING_SETUP_FAMILY.TOXIC_CONTROL ? C.red : group.family === WINNING_SETUP_FAMILY.EXIT_DIAGNOSTIC ? C.amber : C.textSub,
            fontSize: 9, fontWeight: 900, letterSpacing: 1.8, textTransform: "uppercase",
            borderBottom: `1px solid ${C.border}`, paddingBottom: 5, marginBottom: 8,
          }}>{FAMILY_LABEL[group.family]}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(390px, 1fr))", gap: 8 }}>
            {group.rows.map(row => (
              <SetupCard key={row.setup.id} setup={row.setup} analysis={row.analysis} availability={row.availability} active={activeId === row.setup.id}
                onView={onView} onAdd={onAdd} onCompare={onCompare} onExplain={handleExplain} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
