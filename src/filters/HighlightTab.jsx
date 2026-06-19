// ─── HIGHLIGHTS SUB-TAB ───────────────────────────────────────────────────────
// Auto-curated leaderboard of the top entry filters, labels, and combos as
// trades / RUNs accumulate — ordered sharpest (narrow, high-edge) to broadest.
// LOG_ONLY research. Clicking a row applies that signal to the active filters.

import { useMemo, useState } from "react";
import { color as C, font as F } from "../ui/tokens.js";
import { curateHighlights, sortSharpToBroad } from "./longHighlightEngine.js";

const mono = F.mono;

const BAND_META = {
  SHARP:  { color: C.long,  label: "SHARP",  hint: "narrow, high edge" },
  STRONG: { color: C.info,  label: "STRONG", hint: "moderate coverage" },
  BROAD:  { color: C.warn,  label: "BROAD",  hint: "wide coverage" },
};

const GRADE_META = {
  DISCOVERY:               { color: C.textDim, label: "DISCOVERY",  hint: "in-sample hypothesis; not promotion-eligible" },
  CROSS_RUN_VALIDATED:     { color: C.info,    label: "X-RUN",      hint: "net positive across multiple runs" },
  CROSS_SESSION_VALIDATED: { color: C.long,    label: "X-SESSION",  hint: "net positive across runs AND sessions" },
  OUT_OF_SAMPLE_VALIDATED: { color: C.long,    label: "OOS",        hint: "validated on held-out data" },
};

const fmt = (n, d = 2) => (n == null || !isFinite(n) ? "—" : Number(n).toFixed(d));
const sign = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${fmt(n)}`);
const liftColor = (n) => (n == null ? C.textDim : n >= 0 ? C.long : C.short);

function Chip({ children, color, title }) {
  return (
    <span title={title} style={{
      fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
      padding: "2px 6px", borderRadius: 4, color,
      border: `1px solid ${color}55`, background: `${color}14`, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function LiftBar({ lift, maxAbs }) {
  const span = maxAbs > 0 ? Math.min(Math.abs(lift) / maxAbs, 1) : 0;
  const c = liftColor(lift);
  return (
    <div style={{ position: "relative", height: 6, background: C.surfaceLo, borderRadius: 3, overflow: "hidden", flex: 1, minWidth: 60 }}>
      <div style={{
        position: "absolute", top: 0, bottom: 0,
        left: lift >= 0 ? "50%" : `${50 - span * 50}%`,
        width: `${span * 50}%`, background: c, opacity: 0.8,
      }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: C.borderHi }} />
    </div>
  );
}

function StatCell({ label, value, color }) {
  return (
    <div style={{ minWidth: 56 }}>
      <div style={{ fontFamily: mono, fontSize: 8, color: C.textDim, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: color ?? C.text }}>{value}</div>
    </div>
  );
}

function BaselineHeader({ baseline }) {
  return (
    <div style={{
      display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap",
      padding: "10px 14px", marginBottom: 14, borderRadius: 8,
      border: `1px solid ${C.border}`, background: C.surface,
    }}>
      <div style={{ fontFamily: F.display, fontSize: 13, fontWeight: 800, color: C.text, letterSpacing: 0.5 }}>
        AUTO-CURATED HIGHLIGHTS
      </div>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim }}>
        recomputed live as RUNs proceed · log-only
      </div>
      <div style={{ flex: 1 }} />
      <StatCell label="POPULATION" value={baseline.n} />
      <StatCell label="BASELINE PnL" value={sign(baseline.avg)} color={liftColor(baseline.avg)} />
      <StatCell label="BASELINE WIN%" value={`${fmt(baseline.winRatePct, 1)}`} />
      <StatCell label="METRIC" value="NORM" color={C.info} />
    </div>
  );
}

function SignalRow({ rank, label, band, lift, matchedAvg, winRatePct, n, coveragePct, tStat, maxAbsLift, onApply, sub, validationGrade }) {
  const bm = BAND_META[band] ?? BAND_META.BROAD;
  const gm = GRADE_META[validationGrade] ?? null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
      borderBottom: `1px solid ${C.borderLo}`, background: C.surfaceLo,
    }}>
      {rank != null && (
        <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: C.textDim, width: 22, textAlign: "right" }}>#{rank}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chip color={bm.color} title={bm.hint}>{bm.label}</Chip>
          {gm && <Chip color={gm.color} title={gm.hint}>{gm.label}</Chip>}
          <span style={{ fontFamily: mono, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        </div>
        {sub && <div style={{ fontFamily: mono, fontSize: 9, color: C.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: 150 }}>
        <LiftBar lift={lift} maxAbs={maxAbsLift} />
        <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: liftColor(lift), width: 50, textAlign: "right" }}>{sign(lift)}</span>
      </div>
      <StatCell label="AVG" value={sign(matchedAvg)} color={liftColor(matchedAvg)} />
      <StatCell label="WIN%" value={fmt(winRatePct, 0)} />
      <StatCell label="N" value={n} />
      <StatCell label="COV%" value={fmt(coveragePct, 0)} />
      <StatCell label="t" value={fmt(tStat, 1)} color={Math.abs(tStat) >= 2 ? C.info : C.textDim} />
      {onApply ? (
        <button onClick={onApply} title="Apply to active filters" style={{
          fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
          padding: "5px 10px", borderRadius: 5, cursor: "pointer",
          border: `1px solid ${C.info}`, color: C.info, background: `${C.info}12`,
        }}>APPLY →</button>
      ) : (
        <span style={{ width: 62 }} />
      )}
    </div>
  );
}

function ComboRow({ combo, maxAbsLift, onApply }) {
  const [open, setOpen] = useState(false);
  const bm = BAND_META[combo.band] ?? BAND_META.BROAD;
  return (
    <div style={{ borderBottom: `1px solid ${C.borderLo}`, background: C.surfaceLo }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px" }}>
        <button onClick={() => setOpen(o => !o)} style={{
          fontFamily: mono, fontSize: 11, color: C.textDim, background: "none",
          border: "none", cursor: "pointer", width: 16,
        }}>{open ? "▾" : "▸"}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Chip color={bm.color}>{bm.label}</Chip>
            <Chip color={C.accent} title="lift above best single member">SYNERGY {sign(combo.synergy)}</Chip>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {combo.members.length}× combo
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: 150 }}>
          <LiftBar lift={combo.lift} maxAbs={maxAbsLift} />
          <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: liftColor(combo.lift), width: 50, textAlign: "right" }}>{sign(combo.lift)}</span>
        </div>
        <StatCell label="AVG" value={sign(combo.matchedAvg)} color={liftColor(combo.matchedAvg)} />
        <StatCell label="WIN%" value={fmt(combo.winRatePct, 0)} />
        <StatCell label="N" value={combo.n} />
        <StatCell label="COV%" value={fmt(combo.coveragePct, 0)} />
        <button onClick={() => onApply(combo)} title="Apply combo to active filters" style={{
          fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
          padding: "5px 10px", borderRadius: 5, cursor: "pointer",
          border: `1px solid ${C.accent}`, color: C.accent, background: `${C.accent}12`,
        }}>APPLY →</button>
      </div>
      {open && (
        <div style={{ padding: "0 12px 10px 44px" }}>
          {combo.members.map((m, i) => (
            <div key={i} style={{ fontFamily: mono, fontSize: 11, color: C.textSub, padding: "2px 0" }}>
              ∧ {m.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children, count }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "18px 0 6px" }}>
      <span style={{ fontFamily: F.display, fontSize: 12, fontWeight: 800, letterSpacing: 1, color: C.text }}>{children}</span>
      {count != null && <span style={{ fontFamily: mono, fontSize: 10, color: C.textDim }}>({count})</span>}
    </div>
  );
}

const SORT_MODES = [
  { id: "sharp", label: "SHARP → BROAD" },
  { id: "edge",  label: "BY EDGE" },
  { id: "cov",   label: "BY COVERAGE" },
];

export default function HighlightTab({ closedSamples = [], onApply }) {
  const [sortMode, setSortMode] = useState("sharp");
  const [limit, setLimit] = useState(15);

  const highlights = useMemo(() => curateHighlights(closedSamples), [closedSamples]);
  const { baseline, filters, combos, labels, disclaimer, mixedUnitExcludedCount } = highlights;

  const sortedFilters = useMemo(() => {
    if (sortMode === "sharp") return sortSharpToBroad(filters);
    if (sortMode === "cov")   return [...filters].sort((a, b) => b.coveragePct - a.coveragePct);
    return [...filters].sort((a, b) => b.edgeScore - a.edgeScore);
  }, [filters, sortMode]);

  const maxAbsLift = useMemo(() => {
    const all = [...filters, ...combos].map(x => Math.abs(x.lift ?? 0));
    return all.length ? Math.max(...all, 0.5) : 1;
  }, [filters, combos]);

  const apply = (predicates, label) => onApply?.(predicates, label);

  if (baseline.n < 2) {
    return (
      <div style={{ fontFamily: mono, fontSize: 12, color: C.textDim, padding: 24, textAlign: "center" }}>
        Highlights appear automatically once a few trades have closed.
        <div style={{ marginTop: 6, color: C.textFaint }}>Closed trades so far: {baseline.n}</div>
      </div>
    );
  }

  return (
    <div>
      <BaselineHeader baseline={baseline} />

      {disclaimer && (
        <div style={{
          fontFamily: mono, fontSize: 10, color: C.warn,
          border: `1px solid ${C.warn}55`, background: `${C.warn}10`,
          borderRadius: 6, padding: "7px 11px", marginBottom: 10, lineHeight: 1.5,
        }}>
          ⚠ {disclaimer}
          {mixedUnitExcludedCount > 0 && (
            <span style={{ color: C.textDim }}>
              {"  "}· {mixedUnitExcludedCount} legacy record(s) without a normalized metric excluded from the baseline.
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        {SORT_MODES.map(m => (
          <button key={m.id} onClick={() => setSortMode(m.id)} style={{
            fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
            padding: "4px 9px", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${sortMode === m.id ? C.info : C.border}`,
            color: sortMode === m.id ? C.info : C.textDim,
            background: sortMode === m.id ? `${C.info}12` : "transparent",
          }}>{m.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 9, color: C.textDim }}>show</span>
        {[15, 30, 999].map(n => (
          <button key={n} onClick={() => setLimit(n)} style={{
            fontFamily: mono, fontSize: 9, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
            border: `1px solid ${limit === n ? C.info : C.border}`,
            color: limit === n ? C.info : C.textDim, background: "transparent",
          }}>{n === 999 ? "ALL" : n}</button>
        ))}
      </div>

      <SectionTitle count={filters.length}>TOP FILTERS</SectionTitle>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {sortedFilters.length === 0 && (
          <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim, padding: 14 }}>No positive-edge filters yet.</div>
        )}
        {sortedFilters.slice(0, limit).map((f, i) => (
          <SignalRow key={f.key} rank={i + 1} {...f} maxAbsLift={maxAbsLift}
            sub={`${f.field} · edge ${sign(f.edgeScore)}`}
            onApply={() => apply([f.predicate], f.label)} />
        ))}
      </div>

      <SectionTitle count={combos.length}>DISCOVERED COMBOS</SectionTitle>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {combos.length === 0 && (
          <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim, padding: 14 }}>
            No synergistic combos discovered yet — need more closed trades.
          </div>
        )}
        {combos.slice(0, limit).map(c => (
          <ComboRow key={c.id} combo={c} maxAbsLift={maxAbsLift}
            onApply={(combo) => apply(combo.predicates, combo.label)} />
        ))}
      </div>

      <SectionTitle count={labels.length}>TOP LABELS</SectionTitle>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {labels.length === 0 && (
          <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim, padding: 14 }}>No standout labels yet.</div>
        )}
        {labels.slice(0, limit).map((l, i) => (
          <SignalRow key={`${l.field}:${l.value}`} rank={i + 1} {...l} maxAbsLift={maxAbsLift}
            sub={l.field} onApply={null} />
        ))}
      </div>
    </div>
  );
}
