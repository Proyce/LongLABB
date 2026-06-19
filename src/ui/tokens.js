// src/ui/tokens.js — single source of truth for all design tokens.
// Import from here; never hard-code hex/size literals elsewhere.

export const color = Object.freeze({
  // surfaces (dark → light)
  bg:        "#06060c",
  surface:   "#0d0d1a",
  surfaceHi: "#10101f",
  surfaceLo: "#09090f",

  // borders
  border:    "#1e2038",
  borderLo:  "#14142a",
  borderHi:  "#2a2a48",

  // text — all AA-compliant (≥ 4.5:1) on color.bg
  text:      "#e6ecfb",   // primary  ≥ 13:1
  textSub:   "#aebdde",   // secondary ≥ 7:1
  textDim:   "#8094bc",   // tertiary  ≥ 4.6:1
  textFaint: "#5a6890",   // decorative dividers ONLY — never reading text

  // semantic state
  long:      "#00ff88",  longDim:   "#55cc88",
  short:     "#ff4455",  shortDim:  "#cc4455",
  info:      "#4488ff",  infoDim:   "#5577bb",
  warn:      "#ffa500",  warnDim:   "#cc8800",
  accent:    "#aa88ff",

  // brand gradient stops
  brandA:    "#ff4455",
  brandB:    "#ff2255",
});

export const font = Object.freeze({
  display: "'Syne', sans-serif",
  mono:    "'Space Mono', monospace",
});

// Type scale — minimum readable size is 11px. Nothing below this.
export const type = Object.freeze({
  micro:  { fontSize: 11, lineHeight: 1.35, letterSpacing: 0.4 },
  small:  { fontSize: 12, lineHeight: 1.4 },
  body:   { fontSize: 13, lineHeight: 1.5 },
  label:  { fontSize: 11, lineHeight: 1.3, letterSpacing: 1.4, fontWeight: 700, textTransform: "uppercase" },
  h3:     { fontSize: 15, lineHeight: 1.3, fontWeight: 800, letterSpacing: 1 },
  h2:     { fontSize: 18, lineHeight: 1.25, fontWeight: 800 },
  h1:     { fontSize: 24, lineHeight: 1.2, fontWeight: 800, letterSpacing: 1 },
  stat:   { fontSize: 22, lineHeight: 1, fontWeight: 800, fontFamily: "'Space Mono', monospace" },
});

export const space = Object.freeze({ xs: 4, sm: 6, md: 10, lg: 16, xl: 24, xxl: 36 });
export const radius = Object.freeze({ sm: 4, md: 6, lg: 10, pill: 999 });
export const z = Object.freeze({ base: 0, sticky: 50, overlay: 1000, toast: 1100 });

export const elevation = Object.freeze({
  card:   "0 2px 12px rgba(0,0,0,0.4)",
  raised: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px #2a2a48`,
  modal:  "0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px #0a0a1a",
  glow:   (c) => `0 0 12px ${c}33, inset 0 0 8px ${c}0a`,
});

export const motion = Object.freeze({
  fast: "0.15s",
  base: "0.22s cubic-bezier(0.16,1,0.3,1)",
  slow: "0.35s cubic-bezier(0.16,1,0.3,1)",
});

// breakpoints (px) — used by useBreakpoint hook
export const bp = Object.freeze({ xs: 560, sm: 900, md: 1280 });
