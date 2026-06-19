import { color, font, type } from "./tokens.js";

/**
 * LoadingState — skeleton row or spinner for async surfaces.
 * @param {{ rows?: number, msg?: string }} props
 */
export function LoadingState({ rows = 5, msg }) {
  return (
    <div style={{ padding: "8px 0" }}>
      {msg && (
        <div style={{ ...type.small, color: color.long, fontFamily: font.mono, padding: "30px 0 8px" }}>
          {msg}<span className="blink">_</span>
        </div>
      )}
      {!msg && Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 28,
            borderRadius: 4,
            background: `linear-gradient(90deg,${color.surface} 0%,${color.surfaceHi} 50%,${color.surface} 100%)`,
            backgroundSize: "200% 100%",
            marginBottom: 4,
            opacity: 1 - i * 0.12,
          }}
          className="rl-idle-scan"
        />
      ))}
    </div>
  );
}

/**
 * ErrorState — inline error with optional retry action.
 * @param {{ msg: string, onRetry?: () => void }} props
 */
export function ErrorState({ msg, onRetry }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      background: `${color.short}0a`,
      border: `1px solid ${color.short}33`,
      borderRadius: 4,
      ...type.small,
      color: color.short,
      fontFamily: font.mono,
    }}>
      <span>⚠</span>
      <span style={{ flex: 1 }}>{msg}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "transparent",
            border: `1px solid ${color.short}44`,
            color: color.short,
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            fontFamily: font.display,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
