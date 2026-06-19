import { useState, useMemo } from "react";
import { color as C_tok, font } from "./ui/tokens.js";

// Map legacy keys to tokens so existing C.x references keep working
const C = {
  bg:       C_tok.bg,
  surface:  C_tok.surface,
  border:   C_tok.border,
  borderLo: C_tok.borderLo,
  text:     C_tok.text,
  textSub:  C_tok.textSub,
  textDim:  C_tok.textDim,
  blue:     C_tok.info,
};

const mono = font.mono;

export function usePaginator(items, pageSize = 25) {
  const [page, setPage] = useState(0);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = items.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const go = p => setPage(Math.max(0, Math.min(p, totalPages - 1)));
  return { page: safePage, setPage: go, totalPages, pageItems, total };
}

function pageBtnStyle(disabled) {
  return {
    fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: 1,
    padding: "3px 10px", borderRadius: 3, cursor: disabled ? "default" : "pointer",
    background: disabled ? C.surface : "#12163a",
    color: disabled ? C.textDim : C.blue,
    border: `1px solid ${disabled ? C.border : "#2244aa"}`,
  };
}

export function Pager({ page, totalPages, onPrev, onNext, total, pageSize }) {
  if (totalPages <= 1) return null;
  const start = page * pageSize + 1;
  const end   = Math.min((page + 1) * pageSize, total);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
      <button onClick={onPrev} disabled={page === 0} style={pageBtnStyle(page === 0)}>← Prev</button>
      <span style={{ fontFamily: mono, fontSize: 11, color: C.textDim }}>
        {start}–{end} of {total}
      </span>
      <button onClick={onNext} disabled={page >= totalPages - 1} style={pageBtnStyle(page >= totalPages - 1)}>Next →</button>
    </div>
  );
}

export function EmptyState({ msg }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 11, color: C.textDim, padding: "16px 0" }}>{msg}</div>
  );
}

// columns: [{ key, label, width?, minWidth?, sortValue?(row)=>val, render(row)=>node, firstClickDir? }]
// rows: array of data objects
// rowKey: function(row) => unique React key
// onRowClick?: (row) => void — if provided, rows are clickable
// rowStyle?: (row) => CSSProperties — optional per-row style overrides
export function SmartTable({ columns, rows, rowKey, pageSize = 25, emptyMsg = "No data.", onRowClick, rowStyle }) {
  const [sortKey, setSortKey]   = useState(null);
  const [sortDir, setSortDir]   = useState("asc");
  const [colOrder, setColOrder] = useState(null);
  const columnWidth = c => Math.max(c.width ?? 90, c.minWidth ?? 48);
  const [widths, setWidths]     = useState(
    () => Object.fromEntries(columns.map(c => [c.key, columnWidth(c)]))
  );
  const [compact, setCompact]   = useState(false);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const activeOrder = colOrder ?? columns.map(c => c.key);
  const orderedCols = useMemo(
    () => activeOrder.map(k => columns.find(c => c.key === k)).filter(Boolean),
    [activeOrder, columns],
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find(c => c.key === sortKey);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const { page, setPage, totalPages, pageItems, total } = usePaginator(sortedRows, pageSize);

  function onHeaderClick(key, col) {
    if (!col.sortValue) return;
    if (sortKey !== key) { setSortKey(key); setSortDir(col.firstClickDir ?? "asc"); setPage(0); return; }
    if (sortDir === "asc") { setSortDir("desc"); setPage(0); return; }
    setSortKey(null); setSortDir("asc"); setPage(0);
  }

  function onDragStart(e, key) { e.dataTransfer.effectAllowed = "move"; setDragFrom(key); }
  function onDragOver(e, key)  { e.preventDefault(); setDragOver(key); }
  function onDragEnd()         { setDragFrom(null); setDragOver(null); }
  function onDrop(e, toKey) {
    e.preventDefault();
    if (dragFrom && dragFrom !== toKey) {
      setColOrder(prev => {
        const base = prev ?? columns.map(c => c.key);
        const arr  = [...base];
        const fi   = arr.indexOf(dragFrom);
        const ti   = arr.indexOf(toKey);
        if (fi < 0 || ti < 0) return prev;
        arr.splice(fi, 1);
        arr.splice(ti, 0, dragFrom);
        return arr;
      });
    }
    onDragEnd();
  }
  function onHandleDragStart(e, key) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    setDragFrom(key);
  }

  function startResize(e, key) {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX;
    const col = columns.find(c => c.key === key);
    const minWidth = col?.minWidth ?? 48;
    const w0 = widths[key] ?? 90;
    const onMove = me => setWidths(p => ({ ...p, [key]: Math.max(minWidth, w0 + me.clientX - x0) }));
    const onUp   = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }

  const pv = compact ? 2 : 5;
  const fs = compact ? 11 : 12;
  const effectiveWidth = c => Math.max(widths[c.key] ?? columnWidth(c), c.minWidth ?? 48);
  const totalW = orderedCols.reduce((s, c) => s + effectiveWidth(c), 0);

  if (!rows?.length) return <EmptyState msg={emptyMsg} />;

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button onClick={() => setCompact(v => !v)} style={{
          fontFamily: mono, fontSize: 11, fontWeight: 700, letterSpacing: 1,
          padding: "3px 9px", borderRadius: 4, cursor: "pointer",
          background: compact ? "#0e1828" : "transparent",
          color: compact ? C.blue : C.textDim,
          border: `1px solid ${compact ? "#2244aa" : C.border}`,
          transition: "all 0.18s",
        }}>{compact ? "COMPACT ▲" : "COMPACT ▾"}</button>

        {sortKey && (
          <span style={{ display: "flex", alignItems: "center", gap: 4,
            fontFamily: mono, fontSize: 11, color: C.textDim,
            background: "#0a0a18", border: `1px solid ${C.border}`, borderRadius: 4,
            padding: "2px 8px" }}>
            sorted: <span style={{ color: C.blue, marginLeft: 3 }}>{sortKey}</span>
            <span style={{ opacity: 0.7 }}>{sortDir === "asc" ? " ↑" : " ↓"}</span>
            <button onClick={() => { setSortKey(null); setSortDir("asc"); }} style={{
              fontFamily: mono, fontSize: 11, padding: "0 4px", cursor: "pointer",
              background: "transparent", color: "#ff6644", border: "none", marginLeft: 2,
            }}>×</button>
          </span>
        )}

        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11,
          color: C_tok.textFaint, letterSpacing: 0.5, userSelect: "none" }}>
          DRAG COLS · DRAG EDGES TO RESIZE
        </span>
      </div>

      {/* ── Scrollable table container with sticky header ────────────── */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 560 }}>
        <table style={{
          tableLayout: "fixed",
          width: totalW,
          borderCollapse: "collapse",
          fontFamily: mono,
          fontSize: fs,
        }}>
          <colgroup>
            {orderedCols.map(col => (
              <col key={col.key} style={{ width: effectiveWidth(col) }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              {orderedCols.map(col => {
                const active  = sortKey === col.key;
                const isDrop  = dragOver === col.key && dragFrom !== col.key;
                const isDrag  = dragFrom === col.key;
                const icon    = col.sortValue
                  ? (active ? (sortDir === "asc" ? " ↑" : " ↓") : " ⇅")
                  : "";
                return (
                  <th
                    key={col.key}
                    onDragOver={e => onDragOver(e, col.key)}
                    onDrop={e    => onDrop(e, col.key)}
                    onClick={() => onHeaderClick(col.key, col)}
                    style={{
                      position: "sticky", top: 0, zIndex: 2,
                      background: active ? "#0b0d1e" : "#09091a",
                      color: active ? C.blue : "#6888aa",
                      fontWeight: 700, textAlign: "left",
                      padding: `${pv}px 8px`,
                      paddingRight: 14,
                      borderBottom: `2px solid ${active ? C.blue : "#161630"}`,
                      borderLeft: isDrop ? `2px solid ${C.blue}` : "none",
                      whiteSpace: "nowrap", fontSize: 11, fontFamily: mono,
                      letterSpacing: active ? 0.5 : 0,
                      cursor: col.sortValue ? "pointer" : "default",
                      userSelect: "none",
                      overflow: "hidden",
                      boxSizing: "border-box",
                      opacity: isDrag ? 0.4 : 1,
                      transition: "opacity 0.12s, color 0.15s, background 0.15s, border-color 0.15s",
                    }}
                  >
                    <span
                      draggable
                      onDragStart={e => onHandleDragStart(e, col.key)}
                      onDragEnd={onDragEnd}
                      onClick={e => e.stopPropagation()}
                      title="Drag to reorder column"
                      style={{
                        cursor: "grab", marginRight: 5, opacity: 0.35, fontSize: 11,
                        display: "inline-block", userSelect: "none",
                      }}
                    >⠿</span>
                    {col.label}
                    {icon && (
                      <span style={{ marginLeft: 3, opacity: active ? 1 : 0.28, fontSize: 11 }}>
                        {icon}
                      </span>
                    )}
                    <div
                      onMouseDown={e => startResize(e, col.key)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: "absolute", right: 0, top: 0, bottom: 0, width: 6,
                        cursor: "col-resize", background: "transparent",
                        borderRight: `1px solid ${C.border}`,
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {pageItems.map(row => {
              const extraStyle = rowStyle ? rowStyle(row) : {};
              return (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    borderBottom: `1px solid ${C.borderLo}`,
                    cursor: onRowClick ? "pointer" : "default",
                    ...extraStyle,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#0c0e1c"; e.currentTarget.style.boxShadow = "inset 3px 0 0 #4488ff22"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = extraStyle.background ?? ""; e.currentTarget.style.boxShadow = ""; }}
                >
                  {orderedCols.map(col => (
                    <td key={col.key} style={{
                      padding: `${pv}px 8px`,
                      verticalAlign: "middle",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pager page={page} totalPages={totalPages} total={total} pageSize={pageSize}
        onPrev={() => setPage(page - 1)} onNext={() => setPage(page + 1)} />
    </div>
  );
}
