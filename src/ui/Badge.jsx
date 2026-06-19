import { color, font, radius } from "./tokens.js";

/**
 * Pip — small status dot with optional pulse animation.
 * @param {{ color: string, pulse?: boolean, label?: string }} props
 */
export function Pip({ color: dotColor, pulse = false, label }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      letterSpacing: 1.4,
      fontWeight: 700,
      color: dotColor,
      fontFamily: font.display,
    }}>
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 7, height: 7, flexShrink: 0 }}>
        <span
          style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "block" }}
          className={pulse ? "pulse" : ""}
        />
        {pulse && (
          <span
            className="pulse-ring"
            style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1px solid ${dotColor}` }}
          />
        )}
      </span>
      {label}
    </div>
  );
}

/**
 * Badge — inline semantic label chip.
 * @param {{ tone?: "long"|"short"|"info"|"warn"|"accent"|"dim", children }} props
 */
export function Badge({ tone = "dim", children, style = {} }) {
  const tones = {
    long:   { color: color.long,   background: `${color.long}12`,   border: `1px solid ${color.long}30` },
    short:  { color: color.short,  background: `${color.short}12`,  border: `1px solid ${color.short}30` },
    info:   { color: color.info,   background: `${color.info}12`,   border: `1px solid ${color.info}30` },
    warn:   { color: color.warn,   background: `${color.warn}12`,   border: `1px solid ${color.warn}30` },
    accent: { color: color.accent, background: `${color.accent}12`, border: `1px solid ${color.accent}30` },
    dim:    { color: color.textDim, background: color.surface,      border: `1px solid ${color.border}` },
  };

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1,
      padding: "1px 7px",
      borderRadius: radius.sm,
      fontFamily: font.display,
      ...tones[tone] ?? tones.dim,
      ...style,
    }}>
      {children}
    </span>
  );
}
