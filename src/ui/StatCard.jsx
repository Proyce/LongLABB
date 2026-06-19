import { color, font, type, radius, elevation, motion } from "./tokens.js";

/**
 * StatCard — token-driven stat tile.
 * @param {{ label: string, value: string|number, sub?: string, tone?: string, c?: string }} props
 */
export function StatCard({ label, value, sub, tone, c }) {
  const accentColor = c
    ?? (tone === "long"  ? color.long
      : tone === "short" ? color.short
      : tone === "info"  ? color.info
      : tone === "warn"  ? color.warn
      : color.info);

  return (
    <div
      className="slide-in stat-hover"
      style={{
        background: `linear-gradient(145deg,${color.surface} 0%,${color.surfaceLo} 100%)`,
        border: `1px solid ${color.border}`,
        borderTop: `2px solid ${accentColor}44`,
        borderRadius: radius.lg,
        padding: "12px 14px",
        position: "relative",
        overflow: "hidden",
        boxShadow: elevation.card,
        transition: `all ${motion.base}`,
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 36,
        background: `linear-gradient(180deg,${accentColor}08 0%,transparent 100%)`,
        pointerEvents: "none", borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
      }} />
      <div style={{ ...type.label, color: color.textDim, marginBottom: 7, position: "relative", fontFamily: font.display }}>
        {label}
      </div>
      <div style={{ ...type.stat, color: accentColor, textShadow: `0 0 20px ${accentColor}33`, position: "relative" }}>
        {value}
      </div>
      {sub && (
        <div style={{ ...type.small, color: color.textFaint, marginTop: 5, position: "relative", fontFamily: font.mono }}>
          {sub}
        </div>
      )}
    </div>
  );
}
