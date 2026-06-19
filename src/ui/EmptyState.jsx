import { color, font, type } from "./tokens.js";

/**
 * EmptyState — mandatory placeholder for every async surface with no data.
 * @param {{ msg?: string, action?: { label: string, onClick: () => void } }} props
 */
export function EmptyState({ msg = "No data.", action }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: "32px 16px",
      color: color.textDim,
      fontFamily: font.mono,
      ...type.small,
      textAlign: "center",
    }}>
      <span style={{ fontSize: 22, opacity: 0.3 }}>◌</span>
      <span>{msg}</span>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 4,
            background: "transparent",
            border: `1px solid ${color.info}`,
            color: color.info,
            borderRadius: 4,
            padding: "4px 12px",
            cursor: "pointer",
            fontFamily: font.display,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
