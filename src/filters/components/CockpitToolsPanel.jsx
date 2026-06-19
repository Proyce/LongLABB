// ─── COCKPIT TOOLS PANEL ──────────────────────────────────────────────────────
// Wires the previously logic-only cockpit features into the UI:
//   • arbitrary group editor (add / duplicate / remove / reorder / operators)
//   • Compare Mode (two configs through the real engine)
//   • saved views + shareable URL state
// LOG_ONLY research.

import { useMemo, useState } from "react";
import { color as C, font as F } from "../../ui/tokens.js";
import {
  addGroup, removeGroup, duplicateGroup, reorderGroups,
  setGroupOperator, setGroupComposition,
  addPredicateToGroup, removePredicateFromGroup, reorderPredicate, makePredicate,
  serializeFilterStateToURL, makeSavedView, restoreSavedView,
  RESEARCH_COCKPIT_STORAGE_KEY,
  GROUP_OPERATOR, GROUP_JOIN,
} from "../longFilterState.js";
import { LONG_FILTER_REGISTRY, getFilterById } from "../longFilterRegistry.js";
import { OPERATOR, FIELD_TYPE } from "../longFilterConstants.js";
import { compareFilterConfigurations } from "../longCompareMode.js";

const VALUELESS_OPERATORS = new Set([
  OPERATOR.IS_TRUE, OPERATOR.IS_FALSE, OPERATOR.IS_KNOWN, OPERATOR.IS_UNKNOWN,
  OPERATOR.IS_EMPTY, OPERATOR.IS_NOT_EMPTY,
]);
const ARRAY_VALUE_OPERATORS = new Set([
  OPERATOR.IN, OPERATOR.NOT_IN, OPERATOR.INCLUDES_ANY, OPERATOR.INCLUDES_ALL, OPERATOR.INCLUDES_NONE,
]);
const REGISTRY_SORTED = [...LONG_FILTER_REGISTRY].sort((a, b) => a.label.localeCompare(b.label));

const mono = F.mono;
const fmt = (n, d = 2) => (n == null || !isFinite(n) ? "—" : Number(n).toFixed(d));
const sign = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${fmt(n)}`);
const liftColor = (n) => (n == null ? C.textDim : n >= 0 ? C.long : C.short);

const btn = (active, accent = C.info) => ({
  fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
  padding: "4px 9px", borderRadius: 5, cursor: "pointer",
  border: `1px solid ${active ? accent : C.border}`,
  color: active ? accent : C.textDim,
  background: active ? `${accent}12` : "transparent",
});

function Section({ title, children, right }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: F.display, fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.text }}>{title}</span>
        <div style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, background: C.surface }}>{children}</div>
    </div>
  );
}

// ─── PREDICATE VALUE EDITOR ───────────────────────────────────────────────────

function describePredicate(pred) {
  const rf = getFilterById(pred.filterId);
  const name = rf?.label ?? pred.filterId;
  const op = (pred.operator ?? "").replace(/_/g, " ").toLowerCase();
  let val = "";
  if (!VALUELESS_OPERATORS.has(pred.operator)) {
    val = Array.isArray(pred.value) ? ` [${pred.value.join(", ")}]`
      : pred.value != null ? ` ${pred.value}` : "";
  }
  return `${name} · ${op}${val}`;
}

function AddPredicateForm({ groupId, onAdd }) {
  const [filterId, setFilterId] = useState(REGISTRY_SORTED[0]?.id ?? "");
  const rf = useMemo(() => getFilterById(filterId), [filterId]);
  const ops = rf?.operators ?? [];
  const [operator, setOperator] = useState(ops[0] ?? OPERATOR.IS_TRUE);
  const [num1, setNum1] = useState("");
  const [num2, setNum2] = useState("");
  const [picked, setPicked] = useState([]);
  const [freeText, setFreeText] = useState("");

  // Keep operator valid when the filter changes.
  const effectiveOps = rf?.operators ?? [];
  const op = effectiveOps.includes(operator) ? operator : (effectiveOps[0] ?? OPERATOR.IS_TRUE);

  const needsValue = !VALUELESS_OPERATORS.has(op);
  const isArrayVal = ARRAY_VALUE_OPERATORS.has(op);
  const isBetween = op === OPERATOR.BETWEEN;
  const enumValues = rf?.enumValues ?? null;

  const buildValue = () => {
    if (!needsValue) return undefined;
    if (isBetween) return [Number(num1), Number(num2)];
    if (rf?.fieldType === FIELD_TYPE.NUMERIC) return Number(num1);
    if (isArrayVal) {
      if (enumValues) return picked;
      return freeText.split(",").map(s => s.trim()).filter(Boolean);
    }
    return num1; // fallback string
  };

  const canAdd = !needsValue
    || (isBetween && num1 !== "" && num2 !== "")
    || (rf?.fieldType === FIELD_TYPE.NUMERIC && num1 !== "")
    || (isArrayVal && (enumValues ? picked.length > 0 : freeText.trim() !== ""));

  const submit = () => {
    if (!canAdd) return;
    onAdd(groupId, makePredicate(filterId, op, buildValue()));
    setNum1(""); setNum2(""); setPicked([]); setFreeText("");
  };

  const togglePick = (v) => setPicked(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6, padding: "6px 0 2px" }}>
      <select value={filterId} onChange={e => setFilterId(e.target.value)}
        style={{ fontFamily: mono, fontSize: 10, padding: "3px 6px", borderRadius: 4, border: `1px solid ${C.border}`, background: C.surfaceLo, color: C.text, maxWidth: 200 }}>
        {REGISTRY_SORTED.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <select value={op} onChange={e => setOperator(e.target.value)}
        style={{ fontFamily: mono, fontSize: 10, padding: "3px 6px", borderRadius: 4, border: `1px solid ${C.border}`, background: C.surfaceLo, color: C.text }}>
        {effectiveOps.map(o => <option key={o} value={o}>{o.replace(/_/g, " ").toLowerCase()}</option>)}
      </select>
      {needsValue && !isArrayVal && (
        <input value={num1} onChange={e => setNum1(e.target.value)} placeholder="value" type={rf?.fieldType === FIELD_TYPE.NUMERIC ? "number" : "text"}
          style={{ fontFamily: mono, fontSize: 10, padding: "3px 6px", width: 70, borderRadius: 4, border: `1px solid ${C.border}`, background: C.surfaceLo, color: C.text }} />
      )}
      {needsValue && isBetween && (
        <input value={num2} onChange={e => setNum2(e.target.value)} placeholder="max" type="number"
          style={{ fontFamily: mono, fontSize: 10, padding: "3px 6px", width: 70, borderRadius: 4, border: `1px solid ${C.border}`, background: C.surfaceLo, color: C.text }} />
      )}
      {needsValue && isArrayVal && enumValues && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {enumValues.map(v => (
            <button key={v} style={btn(picked.includes(v), C.long)} onClick={() => togglePick(v)}>{v}</button>
          ))}
        </div>
      )}
      {needsValue && isArrayVal && !enumValues && (
        <input value={freeText} onChange={e => setFreeText(e.target.value)} placeholder="a, b, c"
          style={{ fontFamily: mono, fontSize: 10, padding: "3px 6px", width: 130, borderRadius: 4, border: `1px solid ${C.border}`, background: C.surfaceLo, color: C.text }} />
      )}
      <button style={{ ...btn(false, C.long), opacity: canAdd ? 1 : 0.4, cursor: canAdd ? "pointer" : "not-allowed" }} disabled={!canAdd} onClick={submit}>+ ADD</button>
    </div>
  );
}

// ─── GROUP EDITOR ─────────────────────────────────────────────────────────────

function GroupEditor({ filterState, setFilterState }) {
  const comp = filterState.groupOperator ?? GROUP_OPERATOR.ALL_GROUPS;
  const groups = filterState.groups ?? [];
  const [openGroupId, setOpenGroupId] = useState(null);

  return (
    <Section title="FILTER GROUPS" right={
      <div style={{ display: "flex", gap: 6 }}>
        {[GROUP_OPERATOR.ALL_GROUPS, GROUP_OPERATOR.ANY_GROUPS].map(op => (
          <button key={op} style={btn(comp === op)} onClick={() => setFilterState(s => setGroupComposition(s, op))}>
            {op.replace("_GROUPS", " GROUPS")}
          </button>
        ))}
        <button style={btn(false, C.long)} onClick={() => setFilterState(s => addGroup(s))}>+ GROUP</button>
      </div>
    }>
      {groups.length === 0 && (
        <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>No groups yet. Add one, or apply a Highlight.</div>
      )}
      {groups.map((g, idx) => {
        const preds = g.predicates ?? [];
        const isOpen = openGroupId === g.id;
        const isEmpty = preds.length === 0;
        return (
          <div key={g.id} style={{ borderBottom: idx < groups.length - 1 ? `1px solid ${C.borderLo}` : "none", padding: "8px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.textDim, width: 28 }}>G{idx + 1}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[GROUP_JOIN.ALL_OF, GROUP_JOIN.ANY_OF, GROUP_JOIN.NONE_OF].map(op => (
                  <button key={op} style={btn((g.operator ?? GROUP_JOIN.ALL_OF) === op)}
                    onClick={() => setFilterState(s => setGroupOperator(s, g.id, op))}>{op.replace("_OF", "")}</button>
                ))}
              </div>
              <button style={btn(isOpen, C.info)} onClick={() => setOpenGroupId(isOpen ? null : g.id)}>
                {preds.length} predicate(s) {isOpen ? "▾" : "▸"}
              </button>
              {isEmpty && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>empty → matches all</span>}
              <div style={{ flex: 1 }} />
              <button style={btn(false)} disabled={idx === 0} onClick={() => setFilterState(s => reorderGroups(s, idx, idx - 1))}>↑</button>
              <button style={btn(false)} disabled={idx === groups.length - 1} onClick={() => setFilterState(s => reorderGroups(s, idx, idx + 1))}>↓</button>
              <button style={btn(false, C.accent)} onClick={() => setFilterState(s => duplicateGroup(s, g.id))}>DUP</button>
              <button style={btn(false, C.short)} onClick={() => setFilterState(s => removeGroup(s, g.id))}>✕</button>
            </div>
            {isOpen && (
              <div style={{ marginLeft: 36, marginTop: 6 }}>
                {preds.map((p, pi) => (
                  <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                    <span style={{ fontFamily: mono, fontSize: 10, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {describePredicate(p)}
                    </span>
                    <button style={btn(false)} disabled={pi === 0} onClick={() => setFilterState(s => reorderPredicate(s, g.id, pi, pi - 1))}>↑</button>
                    <button style={btn(false)} disabled={pi === preds.length - 1} onClick={() => setFilterState(s => reorderPredicate(s, g.id, pi, pi + 1))}>↓</button>
                    <button style={btn(false, C.short)} onClick={() => setFilterState(s => removePredicateFromGroup(s, g.id, pi))}>✕</button>
                  </div>
                ))}
                <AddPredicateForm groupId={g.id} onAdd={(gid, pred) => setFilterState(s => addPredicateToGroup(s, gid, pred))} />
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}

// ─── COMPARE MODE ─────────────────────────────────────────────────────────────

function MetricRow({ label, a, b, fmtFn = sign, color = true }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 8, padding: "3px 0", fontFamily: mono, fontSize: 11 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ color: color ? liftColor(a) : C.text, textAlign: "right" }}>{fmtFn(a)}</span>
      <span style={{ color: color ? liftColor(b) : C.text, textAlign: "right" }}>{fmtFn(b)}</span>
    </div>
  );
}

function BreakdownCompare({ title, a, b }) {
  const keys = useMemo(() => {
    const s = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
    return [...s].sort();
  }, [a, b]);
  if (keys.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.textFaint, letterSpacing: 0.8, marginBottom: 2 }}>{title}</div>
      {keys.map(k => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 8, fontFamily: mono, fontSize: 10, padding: "1px 0" }}>
          <span style={{ color: C.textDim }}>{String(k)}</span>
          <span style={{ textAlign: "right", color: C.long }}>{a?.[k] ?? 0}</span>
          <span style={{ textAlign: "right", color: C.accent }}>{b?.[k] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

function loadCompareConfigs() {
  try {
    const raw = localStorage.getItem(`${RESEARCH_COCKPIT_STORAGE_KEY}.compare`);
    return raw ? JSON.parse(raw) : { a: null, b: null };
  } catch { return { a: null, b: null }; }
}
function persistCompareConfigs(a, b) {
  try { localStorage.setItem(`${RESEARCH_COCKPIT_STORAGE_KEY}.compare`, JSON.stringify({ a, b })); } catch { /* ignore */ }
}

function CompareMode({ closedSamples, captureState }) {
  const initial = useMemo(loadCompareConfigs, []);
  const [configA, setConfigA] = useState(initial.a);
  const [configB, setConfigB] = useState(initial.b);
  const [showBreakdowns, setShowBreakdowns] = useState(false);

  // Capture the EFFECTIVE filter state so "= CURRENT" reflects the actual
  // visible configuration, including active quick filters (review cockpit
  // item 5 / Compare omits quick filters).
  const snapshot = () => JSON.parse(JSON.stringify(captureState));
  const setA = () => { const c = { state: snapshot() }; setConfigA(c); persistCompareConfigs(c, configB); };
  const setB = () => { const c = { state: snapshot() }; setConfigB(c); persistCompareConfigs(configA, c); };
  const clear = () => { setConfigA(null); setConfigB(null); persistCompareConfigs(null, null); };

  const result = useMemo(() => {
    if (!configA || !configB) return null;
    return compareFilterConfigurations(closedSamples, configA.state, configB.state);
  }, [closedSamples, configA, configB]);

  return (
    <Section title="COMPARE MODE" right={
      <div style={{ display: "flex", gap: 6 }}>
        <button style={btn(!!configA, C.long)} onClick={setA}>SET A = CURRENT</button>
        <button style={btn(!!configB, C.accent)} onClick={setB}>SET B = CURRENT</button>
        {(configA || configB) && <button style={btn(false, C.short)} onClick={clear}>CLEAR</button>}
      </div>
    }>
      {!result && (
        <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>
          Capture two configurations to compare. Default metric: feeAdjustedNormPnlPct. Captured configs persist across sessions.
        </div>
      )}
      {result && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 8, padding: "3px 0", fontFamily: mono, fontSize: 10, color: C.textFaint, borderBottom: `1px solid ${C.borderLo}`, marginBottom: 4 }}>
            <span>METRIC ({result.metricField})</span><span style={{ textAlign: "right", color: C.long }}>CONFIG A</span><span style={{ textAlign: "right", color: C.accent }}>CONFIG B</span>
          </div>
          <MetricRow label="trade count" a={result.a.tradeCount} b={result.b.tradeCount} fmtFn={v => v} color={false} />
          <MetricRow label="avg norm PnL" a={result.a.avgMetric} b={result.b.avgMetric} />
          <MetricRow label="median norm PnL" a={result.a.medianMetric} b={result.b.medianMetric} />
          <MetricRow label="fee win %" a={result.a.feeWinRatePct} b={result.b.feeWinRatePct} fmtFn={v => fmt(v, 1)} color={false} />
          <MetricRow label="SL rate %" a={result.a.slRatePct} b={result.b.slRatePct} fmtFn={v => fmt(v, 1)} color={false} />
          <MetricRow label="profit factor" a={result.a.profitFactor} b={result.b.profitFactor} fmtFn={v => fmt(v, 2)} color={false} />
          <MetricRow label="top-gainer avg" a={result.a.topGainer.avgMetric} b={result.b.topGainer.avgMetric} />
          <MetricRow label="top-loser avg" a={result.a.topLoser.avgMetric} b={result.b.topLoser.avgMetric} />
          <MetricRow label="sessions" a={result.a.sessionCount} b={result.b.sessionCount} fmtFn={v => v} color={false} />
          <MetricRow label="positive sessions" a={result.a.positiveSessionCount} b={result.b.positiveSessionCount} fmtFn={v => v} color={false} />
          <MetricRow label="negative sessions" a={result.a.negativeSessionCount} b={result.b.negativeSessionCount} fmtFn={v => v} color={false} />
          <div style={{ display: "flex", gap: 14, marginTop: 8, fontFamily: mono, fontSize: 10, color: C.textSub }}>
            <span>overlap: <b style={{ color: C.text }}>{result.overlapCount}</b></span>
            <span>A-only: <b style={{ color: C.long }}>{result.aOnlyCount}</b></span>
            <span>B-only: <b style={{ color: C.accent }}>{result.bOnlyCount}</b></span>
          </div>

          <button style={{ ...btn(showBreakdowns, C.info), marginTop: 10 }} onClick={() => setShowBreakdowns(v => !v)}>
            {showBreakdowns ? "HIDE BREAKDOWNS ▾" : "SHOW DISTRIBUTIONS ▸"}
          </button>
          {showBreakdowns && (
            <div style={{ marginTop: 6 }}>
              <BreakdownCompare title="LEVERAGE" a={result.a.leverageBreakdown} b={result.b.leverageBreakdown} />
              <BreakdownCompare title="CLOSE REASON" a={result.a.closeReasonBreakdown} b={result.b.closeReasonBreakdown} />
              <BreakdownCompare title="AUTO_END DETAIL" a={result.a.autoEndBreakdown} b={result.b.autoEndBreakdown} />
              <BreakdownCompare title="TIMEOUT DETAIL" a={result.a.timeoutBreakdown} b={result.b.timeoutBreakdown} />
              <BreakdownCompare title="SL DETAIL" a={result.a.slBreakdown} b={result.b.slBreakdown} />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── SAVED VIEWS + SHARE URL ────────────────────────────────────────────────────

function loadViews() {
  try {
    const raw = localStorage.getItem(`${RESEARCH_COCKPIT_STORAGE_KEY}.views`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistViews(views) {
  try { localStorage.setItem(`${RESEARCH_COCKPIT_STORAGE_KEY}.views`, JSON.stringify(views)); } catch { /* ignore */ }
}

function SavedViews({ filterState, setFilterState, captureState, onRestoreEffectiveState }) {
  const [views, setViews] = useState(loadViews);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  // Saved views and shared URLs capture the EFFECTIVE state (registry + quick
  // filters) so they reproduce the visible trade set; RESTORE writes back into
  // the raw registry filter state (review cockpit item 5).
  const save = () => {
    const view = makeSavedView(name.trim() || `View ${views.length + 1}`, captureState);
    const next = [...views, view];
    setViews(next); persistViews(next); setName("");
  };
  const restore = (view) => {
    const restored = restoreSavedView(view);
    if (onRestoreEffectiveState) onRestoreEffectiveState(restored);
    else setFilterState(restored);
  };
  const remove = (id) => { const next = views.filter(v => v.id !== id); setViews(next); persistViews(next); };
  const share = () => {
    const encoded = serializeFilterStateToURL(captureState);
    const url = `${location.origin}${location.pathname}#f=${encoded}`;
    try { history.replaceState(null, "", `#f=${encoded}`); navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* ignore */ }
  };

  return (
    <Section title="SAVED VIEWS" right={
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="view name"
          style={{ fontFamily: mono, fontSize: 10, padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.surfaceLo, color: C.text, width: 110 }} />
        <button style={btn(false, C.long)} onClick={save}>SAVE</button>
        <button style={btn(copied, C.info)} onClick={share}>{copied ? "COPIED ✓" : "SHARE URL"}</button>
      </div>
    }>
      {views.length === 0 && <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>No saved views yet.</div>}
      {views.map(v => (
        <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.text, flex: 1 }}>{v.name}</span>
          <button style={btn(false)} onClick={() => restore(v)}>RESTORE</button>
          <button style={btn(false, C.short)} onClick={() => remove(v.id)}>✕</button>
        </div>
      ))}
    </Section>
  );
}

export default function CockpitToolsPanel({ closedSamples = [], filterState, setFilterState, effectiveFilterState, onRestoreEffectiveState }) {
  const captureState = effectiveFilterState ?? filterState;
  return (
    <div>
      <GroupEditor filterState={filterState} setFilterState={setFilterState} />
      <CompareMode closedSamples={closedSamples} captureState={captureState} />
      <SavedViews filterState={filterState} setFilterState={setFilterState} captureState={captureState} onRestoreEffectiveState={onRestoreEffectiveState} />
    </div>
  );
}
