// Null-safe numeric helpers for render and analytics paths.
// A missing/invalid number must never crash the React tree or poison aggregates.

export function finiteNumberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function safeFixed(value, digits = 2, fallback = '—') {
  const number = finiteNumberOrNull(value);
  return number == null ? fallback : number.toFixed(digits);
}

export function safeSignedPercent(value, digits = 2, fallback = '—') {
  const number = finiteNumberOrNull(value);
  if (number == null) return fallback;
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

export function safeRound(value, digits = 2) {
  const number = finiteNumberOrNull(value);
  if (number == null) return null;
  const factor = 10 ** digits;
  return Math.round((number + Number.EPSILON) * factor) / factor;
}

export function hasFiniteClosedPnl(trade) {
  return trade?.closed === true && finiteNumberOrNull(trade?.finalPnlPct) != null;
}

export function safeSymbol(symbol) {
  return String(symbol ?? 'UNKNOWN').replace('USDT', '');
}
