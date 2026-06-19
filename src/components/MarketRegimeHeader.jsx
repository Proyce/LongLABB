import { useState } from "react";
import MarketRegimeDetails from "./MarketRegimeDetails.jsx";

const mono = "'Space Mono', monospace";

const POLICY_COLORS = {
  POLICY_FULL_PASS:                  "#00ff88",
  POLICY_WARMUP:                     "#4488ff",
  POLICY_STRICT:                     "#ffaa44",
  POLICY_RECOVERY_STRICT:            "#ff8833",
  POLICY_REDUCED_CAPACITY:           "#aabb44",
  POLICY_FULL_BLOCK_CANDIDATE:       "#ff4455",
  POLICY_DATA_STALE_BLOCK_CANDIDATE: "#cc44ff",
};

const BIAS_COLORS = {
  STRONG_LONG_TAILWIND: "#00ff88",
  LONG_TAILWIND:        "#55dd88",
  SELECTIVE_LONG:       "#aabb44",
  LONG_NEUTRAL:         "#8899cc",
  LONG_HEADWIND:        "#ff8833",
  STRONG_LONG_HEADWIND: "#ff4455",
  LONG_CONTEXT_STALE:   "#cc44ff",
};

const REGIME_COLORS = {
  TRENDING_DOWN:     "#00ff88",
  BREAKDOWN_DOWN:    "#00ee77",
  BOUNCE_IN_DOWNTREND: "#aabb44",
  TRANSITION_DOWN:   "#88aa44",
  RANGING:           "#8899cc",
  CHOPPY:            "#99aacc",
  VOLATILE_TWO_WAY:  "#ffaa44",
  UNKNOWN:           "#6677aa",
  STALE:             "#cc44ff",
  PULLBACK_IN_UPTREND: "#ff8833",
  TRANSITION_UP:     "#ff6655",
  TRENDING_UP:       "#ff4455",
  BREAKOUT_UP:       "#ff3344",
};

const FRESHNESS_COLORS = {
  LIVE:      "#00ff88",
  DEGRADED:  "#aabb44",
  STALE:     "#ffaa44",
  HARD_STALE: "#cc44ff",
};

function dirArrow(label) {
  if (label === "STRONG_UP" || label === "UP") return "↑";
  if (label === "STRONG_DOWN" || label === "DOWN") return "↓";
  return "→";
}

function shortLabel(s, maxLen = 12) {
  if (!s) return "—";
  const clean = s.replace(/_/g, " ");
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
}

function Chip({ children, color = "#8899cc", bg = "#0d0d1e", border = "#252840", onClick, pulse = false, style = {} }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 7px",
        borderRadius: 3,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontFamily: mono,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: 0.5,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        whiteSpace: "nowrap",
        animation: pulse ? "pulseGlow 1.2s ease-in-out infinite" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function AssetChip({ label, asset, onClick }) {
  if (!asset) return (
    <Chip color="#6677aa" onClick={onClick}>{label}: —</Chip>
  );

  const regime = asset.regime ?? "UNKNOWN";
  const micro   = dirArrow(asset.microDirectionLabel ?? "UNKNOWN");
  const tactic  = dirArrow(asset.tacticalDirectionLabel ?? "UNKNOWN");
  const struct  = dirArrow(asset.structuralDirectionLabel ?? "UNKNOWN");
  const col = REGIME_COLORS[regime] ?? "#8899cc";

  return (
    <Chip color={col} border={`${col}44`} onClick={onClick} style={{ gap: 5 }}>
      <span style={{ color: "#8899cc" }}>{label}:</span>
      <span style={{ color: col }}>{shortLabel(regime, 10)}</span>
      <span style={{ color: "#8899cc", fontWeight: 400 }}>μ{micro} T{tactic} S{struct}</span>
    </Chip>
  );
}

export default function MarketRegimeHeader({ marketRegime, sessionHealth, entryPolicy, samples = [] }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);

  function openDetail(target) {
    setDetailTarget(target);
    setDetailOpen(true);
  }

  if (!marketRegime) {
    return (
      <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 8px", background: "#09091a", borderBottom: "1px solid #151528", flexWrap: "wrap" }}>
        <Chip color="#6677aa">MARKET LOADING…</Chip>
      </div>
    );
  }

  const cross        = marketRegime.crossMarket;
  const longScore    = cross?.crossMarketLongTailwindScore;
  const longBias     = cross?.crossMarketLongBiasLabel ?? "LONG_CONTEXT_STALE";
  const biasColor    = BIAS_COLORS[longBias] ?? "#8899cc";
  const freshness    = marketRegime.freshnessLabel ?? "UNKNOWN";
  const ageMs        = marketRegime.ageMs ?? (marketRegime.computedAt ? (Date.now() - marketRegime.computedAt) : null);
  const ageSec       = ageMs != null ? Math.round(ageMs / 1000) : null;
  const freshColor   = FRESHNESS_COLORS[freshness] ?? "#8899cc";

  const policyMode   = entryPolicy?.entryPolicyMode ?? sessionHealth?.recommendedPolicyMode ?? null;
  const policyColor  = POLICY_COLORS[policyMode] ?? "#8899cc";
  const policyLabel  = policyMode ? policyMode.replace("POLICY_", "").replace(/_/g, " ") : null;

  const breadthLabel = marketRegime.breadth?.breadthLabel ?? "BREADTH_STALE";
  const breadthBull  = marketRegime.breadth?.pctGreen15m ?? null;
  // LONG: bullish breadth = favorable (green), bearish breadth = danger (red)
  const breadthColor = breadthLabel.includes("BULLISH") ? "#00ff88" : breadthLabel.includes("BEARISH") ? "#ff4455" : "#8899cc";

  const requiredAes  = entryPolicy?.entryPolicyRequiredAes ?? null;
  const sessionState = sessionHealth?.effectiveState ?? null;

  return (
    <>
      <div style={{
        display: "flex",
        gap: 5,
        alignItems: "center",
        padding: "4px 10px",
        background: "#09091a",
        borderBottom: "1px solid #151528",
        flexWrap: "wrap",
        minHeight: 28,
      }}>
        {/* Policy chip */}
        {policyLabel && (
          <Chip
            color={policyColor}
            border={`${policyColor}55`}
            bg="#0d0d1e"
            onClick={() => openDetail("policy")}
            pulse={policyMode === "POLICY_FULL_BLOCK_CANDIDATE" || policyMode === "POLICY_DATA_STALE_BLOCK_CANDIDATE"}
          >
            {policyLabel}
          </Chip>
        )}

        {/* Session state */}
        {sessionState && (
          <Chip
            color={policyColor}
            onClick={() => openDetail("session")}
            style={{ opacity: 0.85 }}
          >
            {sessionState.replace("SESSION_", "").replace(/_/g, " ")}
          </Chip>
        )}

        <span style={{ color: "#1e1e38", fontSize: 10 }}>│</span>

        {/* LONG market bias chip */}
        <Chip color={biasColor} border={`${biasColor}44`} onClick={() => openDetail("cross")}>
          LONG{longScore != null ? ` ${longScore > 0 ? "+" : ""}${longScore}` : ""} {shortLabel(longBias, 14)}
        </Chip>

        {/* BTC chip */}
        <AssetChip label="BTC" asset={marketRegime.btc} onClick={() => openDetail("btc")} />

        {/* ETH chip */}
        <AssetChip label="ETH" asset={marketRegime.eth} onClick={() => openDetail("eth")} />

        {/* Breadth chip */}
        <Chip color={breadthColor} onClick={() => openDetail("breadth")}>
          BRDTH{breadthBull != null ? ` ${breadthBull.toFixed(0)}%↑` : ""} {shortLabel(breadthLabel.replace("BREADTH_", ""), 8)}
        </Chip>

        <span style={{ color: "#1e1e38", fontSize: 10 }}>│</span>

        {/* AES required */}
        {requiredAes != null && (
          <Chip color="#8899cc" onClick={() => openDetail("policy")}>
            AES REQ {requiredAes}
          </Chip>
        )}

        {/* Freshness */}
        <Chip color={freshColor} pulse={freshness === "HARD_STALE"} onClick={() => openDetail("context")}>
          CTX {freshness} {ageSec != null ? `${ageSec}s` : ""}
        </Chip>

        <span style={{ color: "#1e1e38", fontSize: 10 }}>│</span>

        {/* LOG ONLY badge — always shown */}
        <Chip color="#4488ff" border="#2244aa44" bg="#0a0a1e" style={{ fontWeight: 900 }}>
          LOG ONLY
        </Chip>
        <Chip color="#445566" border="#223344" bg="#080810">
          NO EXEC
        </Chip>
      </div>

      {detailOpen && (
        <MarketRegimeDetails
          marketRegime={marketRegime}
          sessionHealth={sessionHealth}
          entryPolicy={entryPolicy}
          target={detailTarget}
          onClose={() => setDetailOpen(false)}
          samples={samples}
        />
      )}
    </>
  );
}
