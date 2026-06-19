import { useState, useEffect, useRef, useCallback } from "react";
import { color, font, type, radius, z, motion } from "./tokens.js";

// Tab group config — must match all tab === "x" branches in LongLabApp
const TAB_GROUPS = [
  { group: "DISCOVER",  tabs: [{ id: "losers", label: "Losers" }, { id: "gainers", label: "Gainers" }] },
  { group: "TRADE",     tabs: [{ id: "samples", label: "Samples" }, { id: "runs", label: "Runs" }] },
  { group: "ANALYZE",   tabs: [{ id: "filters", label: "Filters" }] },
  { group: "SHADOW",    tabs: [{ id: "shadow-long", label: "Shadow Long" }] },
  { group: "COST",      tabs: [{ id: "fees", label: "Fees" }] },
];

const ALL_TAB_ITEMS = TAB_GROUPS.flatMap(g =>
  g.tabs.map(t => ({ ...t, group: g.group, kind: "tab" }))
);

/**
 * CommandPalette — Cmd/Ctrl+K quick-nav overlay.
 * @param {{ setTab: (id:string)=>void, symbols?: string[], onRun?: ()=>void, onExportCsv?: ()=>void, onExportJson?: ()=>void, onRefresh?: ()=>void }} props
 */
export function CommandPalette({ setTab, symbols = [], onRun, onExportCsv, onExportJson, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  const close = useCallback(() => { setOpen(false); setQuery(""); setActiveIdx(0); }, []);

  // Register Cmd/Ctrl+K globally
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
        setQuery("");
        setActiveIdx(0);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const actions = [
    onRun         && { kind: "action", id: "run",    label: "+ Run",       group: "ACTIONS", action: onRun },
    onExportCsv   && { kind: "action", id: "csv",    label: "Export CSV",  group: "ACTIONS", action: onExportCsv },
    onExportJson  && { kind: "action", id: "json",   label: "Export JSON", group: "ACTIONS", action: onExportJson },
    onRefresh     && { kind: "action", id: "refresh",label: "Refresh",     group: "ACTIONS", action: onRefresh },
  ].filter(Boolean);

  const symbolItems = symbols.map(s => ({ kind: "symbol", id: `sym:${s}`, label: s, group: "SYMBOLS" }));

  const allItems = [...actions, ...ALL_TAB_ITEMS, ...symbolItems];

  const q = query.trim().toLowerCase();
  const filtered = q
    ? allItems.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
    : allItems;

  function activate(item) {
    if (item.kind === "tab")    setTab(item.id);
    if (item.kind === "symbol") setTab("losers"); // jump to losers focused on symbol
    if (item.kind === "action" && item.action) item.action();
    close();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown")  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp")    { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter")      { e.preventDefault(); if (filtered[activeIdx]) activate(filtered[activeIdx]); }
    if (e.key === "Escape")     close();
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          zIndex: z.overlay,
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="slide-in"
        style={{
          position: "fixed",
          top: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(560px, 92vw)",
          background: color.surfaceHi,
          border: `1px solid ${color.borderHi}`,
          borderRadius: radius.lg,
          boxShadow: `0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px ${color.borderLo}`,
          zIndex: z.overlay + 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${color.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: color.textDim, fontSize: 14 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="Jump to tab, symbol, or action…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: color.text,
              fontFamily: font.display,
              ...type.body,
            }}
          />
          <kbd style={{ ...type.micro, color: color.textFaint, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 4, padding: "2px 6px", fontFamily: font.mono }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "20px 14px", ...type.small, color: color.textDim, fontFamily: font.mono, textAlign: "center" }}>
              No results for "{query}"
            </div>
          )}
          {filtered.map((item, idx) => {
            const prev = filtered[idx - 1];
            const showGroup = !prev || prev.group !== item.group;
            return (
              <div key={item.id}>
                {showGroup && (
                  <div style={{ ...type.label, color: color.textFaint, fontFamily: font.display, padding: "8px 14px 4px" }}>
                    {item.group}
                  </div>
                )}
                <button
                  onClick={() => activate(item)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    gap: 10,
                    padding: "9px 14px",
                    background: idx === activeIdx ? `${color.info}12` : "transparent",
                    border: "none",
                    borderLeft: idx === activeIdx ? `2px solid ${color.info}` : "2px solid transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    color: idx === activeIdx ? color.text : color.textSub,
                    fontFamily: font.display,
                    ...type.body,
                    transition: `background ${motion.fast}`,
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.5 }}>
                    {item.kind === "tab"    ? "⊞"
                    : item.kind === "action" ? "▶"
                    : "◈"}
                  </span>
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 14px", borderTop: `1px solid ${color.border}`, display: "flex", gap: 12 }}>
          {[["↑↓", "navigate"], ["↵", "select"], ["ESC", "close"]].map(([k, v]) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, ...type.micro, color: color.textFaint, fontFamily: font.mono }}>
              <kbd style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: 3, padding: "1px 5px" }}>{k}</kbd>
              {v}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
