// ─── EXPLAIN MATCH DRAWER ─────────────────────────────────────────────────────
// Per-trade explanation of why a trade matched / did not match the active filter
// configuration. Reads engine output (filterResultsByTradeId) — it NEVER
// recomputes filter logic (spec §18). LOG_ONLY research view.

import React from "react";

const VERDICT_COLOR = {
  MATCH:          "#2ecc71",
  NO_MATCH:       "#ff4455",
  UNKNOWN:        "#f1c40f",
  NOT_APPLICABLE: "#7f8c8d",
};

function Row({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "2px 0", fontSize: 12 }}>
      <span style={{ color: "#8a93a2" }}>{label}</span>
      <span style={{ color: "#dfe6ee", textAlign: "right" }}>{String(value)}</span>
    </div>
  );
}

function PredicateLine({ pr, registry }) {
  const filter = registry?.find?.(f => f.id === pr.filterId) ?? null;
  const color = VERDICT_COLOR[pr.verdict] ?? "#8a93a2";
  return (
    <div style={{ borderLeft: `3px solid ${color}`, padding: "6px 10px", margin: "4px 0", background: "rgba(255,255,255,0.03)" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong style={{ color: "#dfe6ee", fontSize: 12 }}>{filter?.label ?? pr.filterId}</strong>
        <span style={{ color, fontSize: 11, fontWeight: 700 }}>{pr.verdict}</span>
      </div>
      <Row label="source field" value={filter?.field ?? (filter?.sourceFields ?? []).join(", ")} />
      <Row label="source timing" value={filter?.sourceTiming ?? filter?.timing} />
      <Row label="observed value" value={pr.observedValue ?? pr.fieldValue} />
      <Row label="operator" value={pr.operator} />
      <Row label="target value" value={pr.targetValue ?? pr.value} />
      <Row label="reason" value={pr.reason} />
      <Row label="missing inputs" value={(pr.missingInputs ?? []).join(", ")} />
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.trade
 * @param {Object} props.filterResultsByTradeId - engine output (NOT recomputed)
 * @param {Array}  props.registry
 * @param {Function} [props.onClose]
 */
export function ExplainMatchDrawer({ trade, filterResultsByTradeId, registry, onClose }) {
  if (!trade) return null;
  const tradeId = trade.id ?? `${trade.symbol}_${trade.entryTime}`;
  const groupResults = filterResultsByTradeId?.[tradeId] ?? [];

  // Bucket predicate results by verdict — straight from engine output.
  const byVerdict = { MATCH: [], NO_MATCH: [], UNKNOWN: [], NOT_APPLICABLE: [] };
  const missingFields = new Set();
  for (const g of groupResults) {
    for (const pr of (g.predicateResults ?? [])) {
      (byVerdict[pr.verdict] ?? (byVerdict[pr.verdict] = [])).push(pr);
      (pr.missingInputs ?? []).forEach(m => missingFields.add(m));
    }
  }

  const section = (title, prs) => prs.length ? (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#8a93a2", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, margin: "8px 0 4px" }}>
        {title} ({prs.length})
      </div>
      {prs.map((pr, i) => <PredicateLine key={i} pr={pr} registry={registry} />)}
    </div>
  ) : null;

  return (
    <div style={{ background: "#11161c", border: "1px solid #222c38", borderRadius: 8, padding: 14, maxWidth: 560 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ color: "#dfe6ee" }}>Explain Match — {trade.symbol} #{tradeId}</strong>
        {onClose && <button onClick={onClose} style={{ background: "none", border: "none", color: "#8a93a2", cursor: "pointer" }}>✕</button>}
      </div>

      {section("MATCH", byVerdict.MATCH)}
      {section("NO MATCH", byVerdict.NO_MATCH)}
      {section("UNKNOWN", byVerdict.UNKNOWN)}
      {section("NOT APPLICABLE", byVerdict.NOT_APPLICABLE)}

      {missingFields.size > 0 && (
        <div style={{ marginTop: 6 }}>
          <Row label="missing source fields" value={[...missingFields].join(", ")} />
        </div>
      )}

      <div style={{ marginTop: 10, borderTop: "1px solid #222c38", paddingTop: 8 }}>
        <div style={{ color: "#8a93a2", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Research context</div>
        <Row label="LONG Gate"           value={trade.longGateWouldPass != null ? `${trade.longGateWouldPass ? "PASS" : "REJECT"} (${trade.longGateScore ?? "—"})` : null} />
        <Row label="bucket audit"        value={trade.bucketAuditWouldPass != null ? `${trade.bucketAuditWouldPass ? "PASS" : "FAIL"} (${trade.bucketAuditScore ?? "—"})` : null} />
        <Row label="market context"      value={trade.longMarketContextLabel} />
        <Row label="market breadth"      value={trade.longMarketBreadthLabel} />
        <Row label="LONG audit"          value={trade.longAuditDangerTier} />
        <Row label="LONG AES"            value={trade.longAesScore != null ? `${trade.longAesScore} (${trade.longAesTier ?? "—"})` : null} />
        <Row label="Best DNA LONG"       value={trade.bestDnaLongScore != null ? `${trade.bestDnaLongScore} (${trade.bestDnaLongTier ?? "—"})` : null} />
        <Row label="Runner entry score"  value={trade.longCandidateRunnerScoreAtEntry} />
        <Row label="Post-Fee 10 entry"   value={trade.longPostFee10EntryScore} />
        <Row label="Sniper LONG gate"    value={trade.sniperLongWouldPass != null ? `${trade.sniperLongWouldPass ? "PASS" : "—"} (${trade.sniperLongScore ?? "—"})` : null} />
        <Row label="LONG combos"         value={(trade.longComboLabels ?? trade.longCombosPositiveMatched ?? []).join?.(", ")} />
        <Row label="shadow decision"     value={trade.longShadowDecision} />
        <Row label="data quality"        value={trade.longFilterDataQuality} />
        <Row label="lifecycle outcome"   value={trade.closeReasonDetail ?? trade.closeReason} />
      </div>
    </div>
  );
}

export default ExplainMatchDrawer;
