import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { color, font, type, radius, z, motion } from "./tokens.js";

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastCtx = createContext(null);

/**
 * useToast — returns { toast } where toast(msg, opts) fires a notification.
 * opts: { tone?: "long"|"short"|"info"|"warn", duration?: number (ms) }
 */
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((msg, { tone = "info", duration = 3500 } = {}) => {
    const id = ++counter.current;
    setToasts(prev => [...prev.slice(-4), { id, msg, tone }]);
    setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

// ─── Host ─────────────────────────────────────────────────────────────────────

const TONE_COLORS = {
  long:  color.long,
  short: color.short,
  info:  color.info,
  warn:  color.warn,
};

function ToastHost({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        zIndex: z.toast,
        pointerEvents: "none",
      }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }) {
  const accent = TONE_COLORS[t.tone] ?? color.info;
  return (
    <div
      className="slide-in"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 13px",
        background: color.surfaceHi,
        border: `1px solid ${accent}44`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: radius.md,
        boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${color.borderLo}`,
        ...type.body,
        color: color.text,
        fontFamily: font.display,
        maxWidth: 340,
        pointerEvents: "auto",
        backdropFilter: "blur(8px)",
      }}
    >
      <span style={{ color: accent, flexShrink: 0, fontSize: 13 }}>
        {t.tone === "long"  ? "✓"
        : t.tone === "short" ? "!"
        : t.tone === "warn"  ? "⚠"
        : "●"}
      </span>
      <span style={{ flex: 1 }}>{t.msg}</span>
      <button
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss notification"
        style={{
          background: "transparent",
          border: "none",
          color: color.textFaint,
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: "0 2px",
          flexShrink: 0,
        }}
      >×</button>
    </div>
  );
}
