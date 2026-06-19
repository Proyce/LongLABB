// ─── AES V3 ANALYTICS ────────────────────────────────────────────────────────
// Display-only analytics. Never affects live entries or candidate selection.
// Self-contained to avoid circular dependency with filterAnalytics.js.
// The main filterAnalytics.js integrates these directly via inline helpers.

export function buildAbsoluteEntryScoreV3Analytics(trades) {
  // This is a convenience export for external consumers.
  // filterAnalytics.js has its own inline version to avoid circular imports.
  const closed = trades.filter(t => typeof t.finalPnlPct === "number");
  const v3Trades = closed.filter(t => typeof t.absoluteEntryScoreVersion === "string" && t.absoluteEntryScoreVersion.startsWith("aes-v3"));

  return {
    v3TradeCount: v3Trades.length,
    totalTradeCount: closed.length,
  };
}
