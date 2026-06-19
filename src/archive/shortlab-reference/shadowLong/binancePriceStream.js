// ─── BINANCE PRICE STREAM ────────────────────────────────────────────────────
// Lightweight WebSocket manager for Shadow LONG price feeds.
// One shared socket per stream type — avoids per-trade socket proliferation.
// Falls back gracefully; marks precision on every tick.

const WS_BASE = "wss://fstream.binance.com/stream";

const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 8;
export const BINANCE_PRICE_STREAM_SCHEMA_VERSION = 'BINANCE_PRICE_STREAM_V2_2026_06_BOOK_PRICE_FIELDS';
const MAX_REASONABLE_BOOK_SPREAD_PCT = 20;

const finitePositive = value => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Parse a Binance USD-M Futures bookTicker payload.
 *
 * Binance field names are case-sensitive:
 *   b = best bid PRICE
 *   B = best bid QUANTITY
 *   a = best ask PRICE
 *   A = best ask QUANTITY
 *
 * The quantity fields must never be used as prices. The previous implementation
 * accidentally read `A` as the ask price, which produced gigantic fake prices,
 * fake MFE, and trailing exits. Keep this parser as the single source of truth.
 */
export function parseBookTickerTick(data, observedAt = Date.now()) {
  const sym = String(data?.s ?? '').trim().toLowerCase();
  if (!sym) return null;

  const bid = finitePositive(data?.b);
  const ask = finitePositive(data?.a);
  if (bid == null || ask == null || ask < bid) return null;

  const mid = (bid + ask) / 2;
  const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(spreadPct) || spreadPct > MAX_REASONABLE_BOOK_SPREAD_PCT) return null;

  return Object.freeze({
    symbol: sym.toUpperCase(),
    bid,
    ask,
    mid,
    bidQty: finitePositive(data?.B),
    askQty: finitePositive(data?.A),
    spreadPct,
    source: 'BOOK_TICKER',
    precision: 'REALTIME',
    schemaValidated: true,
    priceFieldMap: 'b=bidPrice,a=askPrice,B=bidQty,A=askQty',
    priceStreamSchemaVersion: BINANCE_PRICE_STREAM_SCHEMA_VERSION,
    t: Number.isFinite(Number(data?.E)) ? Number(data.E) : observedAt,
  });
}

export class BinancePriceStream {
  constructor() {
    this._subs = new Map();
    this._ws   = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer    = null;
    this._latestBook  = new Map();
    this._latestTrade = new Map();
    this._destroyed   = false;
    this._pendingReconnect = false;
  }

  subscribe(symbol, callback) {
    const sym = symbol.toLowerCase();
    if (!this._subs.has(sym)) this._subs.set(sym, new Set());
    this._subs.get(sym).add(callback);
    this._ensureConnected();
  }

  unsubscribe(symbol, callback) {
    const sym = symbol.toLowerCase();
    const cbs = this._subs.get(sym);
    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) this._subs.delete(sym);
    }
    if (this._subs.size === 0) this._disconnect();
  }

  getLatestPrice(symbol) {
    const sym = symbol.toLowerCase();
    const book = this._latestBook.get(sym);
    if (book) return (book.bid + book.ask) / 2;
    return this._latestTrade.get(sym)?.price ?? null;
  }

  getLatestBook(symbol) {
    return this._latestBook.get(symbol.toLowerCase()) ?? null;
  }

  destroy() {
    this._destroyed = true;
    this._disconnect();
    clearTimeout(this._reconnectTimer);
  }

  reconnect() {
    this._disconnect();
    this._reconnectAttempts = 0;
    this._connect();
  }

  _buildStreamUrl() {
    const syms = [...this._subs.keys()];
    if (!syms.length) return null;
    const streams = syms.flatMap(s => [`${s}@bookTicker`, `${s}@aggTrade`]);
    return `${WS_BASE}?streams=${streams.join("/")}`;
  }

  _ensureConnected() {
    if (this._ws && (this._ws.readyState === 0 || this._ws.readyState === 1)) return;
    if (this._pendingReconnect) return;
    this._connect();
  }

  _connect() {
    if (this._destroyed || this._subs.size === 0) return;
    const url = this._buildStreamUrl();
    if (!url) return;

    try {
      this._ws = new WebSocket(url);
    } catch (_) {
      this._scheduleReconnect();
      return;
    }

    this._ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this._handleMessage(msg);
      } catch (_) {}
    };

    this._ws.onerror = () => {};

    this._ws.onclose = () => {
      if (!this._destroyed) this._scheduleReconnect();
    };

    this._ws.onopen = () => {
      this._reconnectAttempts = 0;
      this._pendingReconnect  = false;
    };
  }

  _handleMessage(msg) {
    const data   = msg.data ?? msg;
    const stream = msg.stream ?? "";

    if (stream.endsWith("@bookTicker") || data.e === "bookTicker" || (data.b !== undefined && data.a !== undefined)) {
      const tick = parseBookTickerTick(data, Date.now());
      if (tick) {
        const sym = tick.symbol.toLowerCase();
        this._latestBook.set(sym, tick);
        this._notify(sym, tick);
      }
    }

    if (stream.endsWith("@aggTrade") || data.p !== undefined) {
      const sym = (data.s ?? "").toLowerCase();
      if (!sym) return;
      const price = parseFloat(data.p);
      if (!Number.isFinite(price)) return;
      const tick = {
        symbol:    sym.toUpperCase(),
        price,
        source:    "AGG_TRADE",
        precision: "REALTIME",
        t:         parseInt(data.T ?? Date.now(), 10),
      };
      this._latestTrade.set(sym, tick);
      if (!this._latestBook.has(sym)) {
        this._notify(sym, tick);
      }
    }
  }

  _notify(sym, tick) {
    const cbs = this._subs.get(sym);
    if (!cbs) return;
    for (const cb of cbs) {
      try { cb(tick); } catch (_) {}
    }
  }

  _scheduleReconnect() {
    if (this._destroyed) return;
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    this._reconnectAttempts++;
    this._pendingReconnect = true;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._pendingReconnect = false;
      this._connect();
    }, RECONNECT_DELAY_MS * Math.min(this._reconnectAttempts, 4));
  }

  _disconnect() {
    if (this._ws) {
      try { this._ws.onclose = null; this._ws.close(); } catch (_) {}
      this._ws = null;
    }
  }
}

let _sharedStream = null;

export function getSharedPriceStream() {
  if (!_sharedStream || _sharedStream._destroyed) {
    _sharedStream = new BinancePriceStream();
  }
  return _sharedStream;
}

export function destroySharedPriceStream() {
  if (_sharedStream) {
    _sharedStream.destroy();
    _sharedStream = null;
  }
}

export function parsePriceSourcePrecision(tick) {
  if (!tick) return { source: "REST_POLL", precision: "COARSE" };
  return {
    source:    tick.source    ?? "REST_POLL",
    precision: tick.precision ?? "COARSE",
  };
}
