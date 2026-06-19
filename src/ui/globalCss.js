// src/ui/globalCss.js — one CSS string for the whole app.
// Injected via <style>{CSS}</style> in the app root.
// All @keyframes live here, gated by prefers-reduced-motion.

export const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Scrollbars ─────────────────────────────────────────────────────── */
  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:#06060c; }
  ::-webkit-scrollbar-thumb { background:linear-gradient(180deg,#22223a,#101020); border-radius:4px; }
  ::-webkit-scrollbar-thumb:hover { background:#2e2e50; }

  /* ── Tabular numbers for monospace data columns ─────────────────────── */
  .font-mono, [style*="Space Mono"] { font-variant-numeric: tabular-nums; }

  /* ── Global focus ring (a11y) ───────────────────────────────────────── */
  :focus-visible {
    outline: 2px solid #4488ff;
    outline-offset: 2px;
  }
  input:focus-visible { outline: 2px solid #4488ff; outline-offset: 1px; }

  /* ── Interactive hover states ───────────────────────────────────────── */
  .row-hover:hover { background:rgba(80,140,255,0.04) !important; border-left:2px solid #4488ff22 !important; }
  .btn-lev:hover   { transform:translateY(-1px); box-shadow:0 3px 14px rgba(255,165,0,0.25); }
  .btn-act:hover   { opacity:0.82; }
  .mBtn:hover      { background:#0f0f1e !important; border-color:#252540 !important; }
  .stat-hover      { transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
  .stat-hover:hover { border-color:#252548 !important; box-shadow:0 4px 24px rgba(0,0,0,0.5),0 0 0 1px #252548; transform:translateY(-2px); }
  .sample-card-hover:hover { border-color:#1a1a30 !important; box-shadow:0 2px 12px rgba(0,0,0,0.4); }
  .agg-bar  { transition:background 0.2s; }
  .agg-bar:hover { background:#0e1018 !important; }
  .rmBtn:hover { color:#ff4455 !important; }
  a:hover  { opacity:0.72; }

  /* ── Tab nav ────────────────────────────────────────────────────────── */
  .tab-btn { transition:color 0.2s, text-shadow 0.2s, opacity 0.2s; }
  .tab-btn:hover { color:#c0d4ee !important; }
  .tab-active { text-shadow:0 0 12px #00ff8877; }

  /* ── Run badges ─────────────────────────────────────────────────────── */
  .run-badge {
    display:inline-flex; align-items:center; gap:5px;
    background:linear-gradient(135deg,#141424,#0e0e18);
    border:1px solid #20203a; border-radius:5px;
    padding:3px 10px; font-family:'Space Mono',monospace; font-size:11px; font-weight:700;
    transition:all 0.18s; cursor:pointer; letter-spacing:0.5px;
  }
  .run-badge:hover { border-color:#2a2a50; background:linear-gradient(135deg,#181830,#12121e); }
  .run-badge-active {
    background:linear-gradient(135deg,#1a2040,#111830) !important;
    border-color:#2244aa !important; color:#5599ff !important;
    box-shadow:0 0 12px #4488ff22, inset 0 0 8px #4488ff08;
  }

  /* ── Section divider ─────────────────────────────────────────────────── */
  .sec-divider::before {
    content:''; display:inline-block; width:3px; height:10px;
    background:currentColor; border-radius:2px; opacity:0.6; flex-shrink:0;
  }

  /* ── Brand elements ─────────────────────────────────────────────────── */
  .logo-glow       { box-shadow:0 0 0 1px #00ff8830, 0 0 20px #00ff8828, 0 3px 10px rgba(0,0,0,0.7); }
  .header-net-glow { box-shadow:inset 0 0 20px rgba(0,255,136,0.04), 0 0 0 1px #0f1822; }

  .shimmer-text {
    background: linear-gradient(90deg, #ff4455 0%, #ff88aa 40%, #ff4455 60%, #ff2244 100%);
    background-size: 200% auto;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Animations — all gated by prefers-reduced-motion ────────────────── */
  @media (prefers-reduced-motion: no-preference) {
    .pulse      { animation: pulse 2s ease-in-out infinite; }
    .blink      { animation: blink 1s step-end infinite; }
    .slide-in   { animation: slideIn 0.28s cubic-bezier(0.16,1,0.3,1); }
    .fade-up    { animation: fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both; }
    .icon-spin  { animation: iconSpin 20s linear infinite; }
    .rl-idle    { animation: rlIdlePulse 3s ease-in-out infinite; }
    .rl-idle-scan { animation: rlBarScan 2.2s ease-in-out infinite; }
    .shimmer-text { animation: shimmer 3s linear infinite; }
    .pulse-ring::after { animation: ringPulse 2s ease-out infinite; }
    .tab-btn    { transition: color 0.2s, text-shadow 0.2s, opacity 0.2s; }
    .stat-hover { transition: all 0.22s cubic-bezier(0.16,1,0.3,1); }
    .agg-bar    { transition: background 0.2s; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse, .blink, .slide-in, .fade-up, .icon-spin,
    .rl-idle, .rl-idle-scan, .shimmer-text { animation: none !important; }
    .pulse-ring::after { animation: none !important; }
    .tab-btn, .stat-hover, .agg-bar, .btn-lev,
    .mBtn, .sample-card-hover { transition: none !important; }
    .btn-lev:hover { transform: none; box-shadow: none; }
    .stat-hover:hover { transform: none; }
  }

  /* ── @keyframes (only run when motion not reduced) ──────────────────── */
  @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.22} }
  @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes slideIn   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes iconSpin  { to{transform:rotate(360deg)} }
  @keyframes ringPulse { 0%{opacity:0.55;transform:scale(1)} 100%{opacity:0;transform:scale(2.0)} }
  @keyframes neonGlow  { 0%,100%{box-shadow:0 0 6px #00ff8820} 50%{box-shadow:0 0 18px #00ff8840,0 0 32px #00ff8810} }
  @keyframes shimmer   { 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes rlIdlePulse { 0%,100%{opacity:0.45} 50%{opacity:0.72} }
  @keyframes rlBarScan { 0%{background-position:-80% 0} 100%{background-position:180% 0} }

  /* ── Pulse ring pseudo-element (static base) ────────────────────────── */
  .pulse-ring { position:relative; }
  .pulse-ring::after {
    content:''; position:absolute; inset:-3px; border-radius:50%;
    border:1px solid currentColor; opacity:0;
  }
`;
