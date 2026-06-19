import { color, font, radius, motion } from "./tokens.js";

/**
 * variants: "primary" | "ghost" | "toggle" | "danger"
 * sizes:    "sm" | "md"
 */
export function Button({
  children,
  onClick,
  variant = "ghost",
  size = "md",
  disabled = false,
  active = false,
  activeColor,
  "aria-label": ariaLabel,
  className = "",
  style = {},
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.sm,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: font.display,
    fontWeight: 700,
    letterSpacing: 0.5,
    transition: `all ${motion.fast}`,
    opacity: disabled ? 0.25 : 1,
    border: "1px solid",
    lineHeight: 1.2,
  };

  const sizes = {
    sm: { fontSize: 11, padding: "2px 8px" },
    md: { fontSize: 11, padding: "4px 11px" },
  };

  const variants = {
    primary: {
      background: color.info,
      borderColor: color.info,
      color: "#fff",
      boxShadow: disabled ? "none" : `0 0 10px ${color.info}28`,
    },
    ghost: {
      background: "transparent",
      borderColor: active ? (activeColor || color.info) : color.border,
      color: active ? (activeColor || color.info) : color.textSub,
      boxShadow: active && !disabled ? `0 0 10px ${activeColor || color.info}16` : "none",
    },
    toggle: {
      background: active && activeColor
        ? `linear-gradient(135deg,${activeColor}ee,${activeColor}99)`
        : active
          ? `linear-gradient(135deg,${color.info}ee,${color.info}99)`
          : "transparent",
      borderColor: active ? (activeColor || color.info) : color.border,
      color: active ? "#05050c" : (activeColor || color.textSub),
      boxShadow: active ? `0 2px 14px ${activeColor || color.info}44` : "none",
    },
    danger: {
      background: "transparent",
      borderColor: color.short,
      color: color.short,
    },
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={variant === "toggle" ? active : undefined}
      className={className}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}
