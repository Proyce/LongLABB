// ─── BINANCE PRICE STREAM ────────────────────────────────────────────────────
// Dedicated routed WebSocket manager for open LONG positions.
//
// Primary paths:
//   /public → bookTicker
//   /market → aggTrade
// Safety path:
//   /market → all-symbol markPrice@1s
//
// The mark-price stream is deliberately lower priority. It is emitted only
// when a symbol has not received a primary book/trade tick recently. This keeps
// position lifecycle management independent of REST rate limits, including for
// quiet symbols that may not print aggregate trades for several seconds.

import {
  BINANCE_FUTURES_TICK_SCHEMA_VERSION,
  MAX_REASONABLE_BOOK_SPREAD_PCT,
  parseAggTradeTick,
  parseBookTickerTick,
  parseMarkPriceTick,
} from "../marketData/binanceFuturesTickParsers.js";

const BOOK_WS_BASE = "wss://fstream.binance.com/public/stream";
const TRADE_WS_BASE = "wss://fstream.binance.com/market/stream";
const MARK_WS_URL = "wss://fstream.binance.com/market/stream?streams=!markPrice@arr@1s";

const RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_ATTEMPTS = 20;
const MEMBERSHIP_REBUILD_DEBOUNCE_MS = 75;
const PRIMARY_TICK_GRACE_MS = 1_500;

export const BINANCE_PRICE_STREAM_SCHEMA_VERSION = BINANCE_FUTURES_TICK_SCHEMA_VERSION;
export { MAX_REASONABLE_BOOK_SPREAD_PCT, parseAggTradeTick, parseBookTickerTick, parseMarkPriceTick };

const lowerSymbol = value => String(value ?? '').trim().toLowerCase();

function makeSocketState() {
  return {
    ws: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    pendingReconnect: false,
    connectedSymbolsKey: '',
    lastMessageAt: null,
    lastOpenAt: null,
    lastCloseAt: null,
  };
}

export class BinancePriceStream {
  constructor() {
    this._subs = new Map();
    this._book = makeSocketState();
    this._trade = makeSocketState();
    this._mark = makeSocketState();
    this._latestBook = new Map();
    this._latestTrade = new Map();
    this._latestMark = new Map();
    this._latestPrimary = new Map();
    this._latestTick = new Map();
    this._destroyed = false;
    this._membershipTimer = null;
  }

  subscribe(symbol, callback) {
    const sym = lowerSymbol(symbol);
    if (!sym || typeof callback !== 'function') return;
    const existed = this._subs.has(sym);
    if (!existed) this._subs.set(sym, new Set());
    this._subs.get(sym).add(callback);

    if (!this._hasAnyConnectedOrConnectingSocket()) {
      this._ensureConnected();
    } else if (!existed) {
      this._scheduleMembershipRebuild();
    }
  }

  unsubscribe(symbol, callback) {
    const sym = lowerSymbol(symbol);
    const cbs = this._subs.get(sym);
    if (!cbs) return;
    cbs.delete(callback);

    if (this._activeCallbackCount() === 0) {
      this._subs.clear();
      this._disconnectAll();
      this._latestBook.clear();
      this._latestTrade.clear();
      this._latestMark.clear();
      this._latestPrimary.clear();
      this._latestTick.clear();
    }
    // Retain empty membership while other positions remain open. This avoids a
    // reconnect storm every time a single trade closes.
  }

  getHealthSnapshot(now = Date.now()) {
    const activeSymbols = [...this._subs.entries()]
      .filter(([, cbs]) => cbs.size > 0)
      .map(([symbol]) => symbol.toUpperCase());
    const bookConnected = this._book.ws?.readyState === 1;
    const tradeConnected = this._trade.ws?.readyState === 1;
    const markConnected = this._mark.ws?.readyState === 1;
    const latestMessageAt = Math.max(
      Number(this._book.lastMessageAt ?? 0),
      Number(this._trade.lastMessageAt ?? 0),
      Number(this._mark.lastMessageAt ?? 0),
    ) || null;

    return {
      connected: bookConnected || tradeConnected || markConnected,
      fullyConnected: bookConnected && tradeConnected && markConnected,
      bookConnected,
      tradeConnected,
      markConnected,
      bookConnecting: this._book.ws?.readyState === 0,
      tradeConnecting: this._trade.ws?.readyState === 0,
      markConnecting: this._mark.ws?.readyState === 0,
      subscribedSymbols: activeSymbols,
      subscribedSymbolCount: activeSymbols.length,
      retainedStreamSymbolCount: this._subs.size,
      connectedSymbolsKey: this._desiredSymbolsKey(),
      lastMessageAt: latestMessageAt,
      lastMessageAgeMs: latestMessageAt == null ? null : Math.max(0, now - latestMessageAt),
      bookLastMessageAt: this._book.lastMessageAt,
      tradeLastMessageAt: this._trade.lastMessageAt,
      markLastMessageAt: this._mark.lastMessageAt,
      bookLastMessageAgeMs: this._age(this._book.lastMessageAt, now),
      tradeLastMessageAgeMs: this._age(this._trade.lastMessageAt, now),
      markLastMessageAgeMs: this._age(this._mark.lastMessageAt, now),
      reconnectAttempts: this._book.reconnectAttempts + this._trade.reconnectAttempts + this._mark.reconnectAttempts,
      bookReconnectAttempts: this._book.reconnectAttempts,
      tradeReconnectAttempts: this._trade.reconnectAttempts,
      markReconnectAttempts: this._mark.reconnectAttempts,
      pendingReconnect: this._book.pendingReconnect || this._trade.pendingReconnect || this._mark.pendingReconnect,
      priceStreamSchemaVersion: BINANCE_PRICE_STREAM_SCHEMA_VERSION,
    };
  }

  getSymbolHealthSnapshot(symbol, now = Date.now()) {
    const sym = lowerSymbol(symbol);
    const book = this._latestBook.get(sym) ?? null;
    const trade = this._latestTrade.get(sym) ?? null;
    const mark = this._latestMark.get(sym) ?? null;
    const primary = this._latestPrimary.get(sym) ?? null;
    const latest = this._latestTick.get(sym) ?? null;
    const tickAt = latest?.receivedAt ?? latest?.t ?? null;
    const primaryAt = primary?.receivedAt ?? primary?.t ?? null;
    return {
      symbol: sym.toUpperCase(),
      subscribed: (this._subs.get(sym)?.size ?? 0) > 0,
      latestSource: latest?.source ?? null,
      latestTickAt: tickAt,
      latestTickAgeMs: tickAt == null ? null : Math.max(0, now - tickAt),
      latestPrimaryAt: primaryAt,
      latestPrimaryAgeMs: primaryAt == null ? null : Math.max(0, now - primaryAt),
      latestBookAt: book?.receivedAt ?? book?.t ?? null,
      latestBookAgeMs: book == null ? null : Math.max(0, now - Number(book.receivedAt ?? book.t)),
      latestTradeAt: trade?.receivedAt ?? trade?.t ?? null,
      latestTradeAgeMs: trade == null ? null : Math.max(0, now - Number(trade.receivedAt ?? trade.t)),
      latestMarkAt: mark?.receivedAt ?? mark?.t ?? null,
      latestMarkAgeMs: mark == null ? null : Math.max(0, now - Number(mark.receivedAt ?? mark.t)),
      latestPrice: latest?.mid ?? latest?.price ?? null,
    };
  }

  getLatestPrice(symbol) {
    const latest = this._latestTick.get(lowerSymbol(symbol));
    return latest?.mid ?? latest?.price ?? null;
  }

  getLatestTick(symbol) {
    return this._latestTick.get(lowerSymbol(symbol)) ?? null;
  }

  getLatestBook(symbol) {
    return this._latestBook.get(lowerSymbol(symbol)) ?? null;
  }

  destroy() {
    this._destroyed = true;
    this._disconnectAll();
    clearTimeout(this._membershipTimer);
  }

  reconnect() {
    this._disconnectAll();
    this._book.reconnectAttempts = 0;
    this._trade.reconnectAttempts = 0;
    this._mark.reconnectAttempts = 0;
    this._ensureConnected();
  }

  _age(value, now) {
    return value == null ? null : Math.max(0, now - Number(value));
  }

  _activeCallbackCount() {
    let count = 0;
    for (const callbacks of this._subs.values()) count += callbacks.size;
    return count;
  }

  _desiredSymbols() {
    return [...this._subs.keys()].sort();
  }

  _desiredSymbolsKey() {
    return this._desiredSymbols().join(',');
  }

  _hasAnyConnectedOrConnectingSocket() {
    return [this._book.ws, this._trade.ws, this._mark.ws]
      .some(ws => ws && (ws.readyState === 0 || ws.readyState === 1));
  }

  _buildUrl(kind) {
    if (kind === 'mark') return MARK_WS_URL;
    const symbols = this._desiredSymbols();
    if (!symbols.length) return null;
    const suffix = kind === 'book' ? '@bookTicker' : '@aggTrade';
    const base = kind === 'book' ? BOOK_WS_BASE : TRADE_WS_BASE;
    return `${base}?streams=${symbols.map(symbol => `${symbol}${suffix}`).join('/')}`;
  }

  _ensureConnected() {
    if (this._destroyed || this._subs.size === 0) return;
    if (!this._book.ws || ![0, 1].includes(this._book.ws.readyState)) this._connect('book');
    if (!this._trade.ws || ![0, 1].includes(this._trade.ws.readyState)) this._connect('trade');
    if (!this._mark.ws || ![0, 1].includes(this._mark.ws.readyState)) this._connect('mark');
  }

  _scheduleMembershipRebuild() {
    clearTimeout(this._membershipTimer);
    this._membershipTimer = setTimeout(() => {
      this._membershipTimer = null;
      if (this._destroyed || this._subs.size === 0) return;
      const key = this._desiredSymbolsKey();
      if (key !== this._book.connectedSymbolsKey || key !== this._trade.connectedSymbolsKey) {
        // The global mark stream has no symbol membership and remains connected.
        this._disconnectSocket(this._book);
        this._disconnectSocket(this._trade);
        this._ensureConnected();
      }
    }, MEMBERSHIP_REBUILD_DEBOUNCE_MS);
  }

  _state(kind) {
    if (kind === 'book') return this._book;
    if (kind === 'trade') return this._trade;
    return this._mark;
  }

  _connect(kind) {
    if (this._destroyed || this._subs.size === 0) return;
    const state = this._state(kind);
    const url = this._buildUrl(kind);
    if (!url) return;

    try {
      state.ws = new WebSocket(url);
    } catch (_) {
      this._scheduleReconnect(kind);
      return;
    }

    state.ws.onmessage = event => {
      const observedAt = Date.now();
      try {
        const message = JSON.parse(event.data);
        state.lastMessageAt = observedAt;
        const data = message?.data ?? message;
        if (kind === 'book') {
          const tick = parseBookTickerTick(data, observedAt);
          if (tick) this._acceptPrimaryTick(tick, this._latestBook);
        } else if (kind === 'trade') {
          const tick = parseAggTradeTick(data, observedAt);
          if (tick) this._acceptPrimaryTick(tick, this._latestTrade);
        } else {
          const rows = Array.isArray(data) ? data : [];
          for (const row of rows) {
            const sym = lowerSymbol(row?.s);
            if (!sym || !this._subs.has(sym)) continue;
            const tick = parseMarkPriceTick(row, observedAt);
            if (tick) this._acceptMarkTick(tick, observedAt);
          }
        }
      } catch (_) {}
    };

    state.ws.onerror = () => {};
    state.ws.onclose = () => {
      state.lastCloseAt = Date.now();
      state.connectedSymbolsKey = '';
      state.ws = null;
      if (!this._destroyed && this._activeCallbackCount() > 0) this._scheduleReconnect(kind);
    };
    state.ws.onopen = () => {
      state.reconnectAttempts = 0;
      state.pendingReconnect = false;
      state.connectedSymbolsKey = kind === 'mark' ? 'ALL_MARK_PRICE_1S' : this._desiredSymbolsKey();
      state.lastOpenAt = Date.now();
    };
  }

  _acceptPrimaryTick(tick, store) {
    const sym = lowerSymbol(tick.symbol);
    store.set(sym, tick);
    this._latestPrimary.set(sym, tick);
    this._latestTick.set(sym, tick);
    this._notify(sym, tick);
  }

  _acceptMarkTick(tick, observedAt) {
    const sym = lowerSymbol(tick.symbol);
    this._latestMark.set(sym, tick);
    const primary = this._latestPrimary.get(sym);
    const primaryAt = Number(primary?.receivedAt ?? primary?.t ?? 0);
    if (primaryAt > 0 && observedAt - primaryAt <= PRIMARY_TICK_GRACE_MS) return;
    this._latestTick.set(sym, tick);
    this._notify(sym, tick);
  }

  _notify(sym, tick) {
    const callbacks = this._subs.get(sym);
    if (!callbacks?.size) return;
    for (const callback of callbacks) {
      try { callback(tick); } catch (_) {}
    }
  }

  _scheduleReconnect(kind) {
    if (this._destroyed || this._activeCallbackCount() === 0) return;
    const state = this._state(kind);
    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      state.reconnectAttempts = MAX_RECONNECT_ATTEMPTS - 1;
    }
    state.reconnectAttempts += 1;
    state.pendingReconnect = true;
    clearTimeout(state.reconnectTimer);
    const delay = RECONNECT_DELAY_MS * Math.min(state.reconnectAttempts, 5);
    state.reconnectTimer = setTimeout(() => {
      state.pendingReconnect = false;
      this._connect(kind);
    }, delay);
  }

  _disconnectSocket(state) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    state.pendingReconnect = false;
    const ws = state.ws;
    state.ws = null;
    if (ws) {
      try {
        ws.onmessage = null;
        ws.onerror = () => {};
        ws.onclose = null;
        // Chrome logs a noisy warning when close() is called while CONNECTING.
        // Defer the close until OPEN instead of tearing down the app console.
        if (ws.readyState === 0) {
          ws.onopen = () => {
            try { ws.close(1000, 'membership-rebuild'); } catch (_) {}
          };
        } else if (ws.readyState === 1) {
          ws.close(1000, 'membership-rebuild');
        }
      } catch (_) {}
    }
    state.connectedSymbolsKey = '';
  }

  _disconnectAll() {
    this._disconnectSocket(this._book);
    this._disconnectSocket(this._trade);
    this._disconnectSocket(this._mark);
  }
}

let sharedStream = null;

export function getSharedPriceStream() {
  if (!sharedStream || sharedStream._destroyed) sharedStream = new BinancePriceStream();
  return sharedStream;
}

export function destroySharedPriceStream() {
  if (sharedStream) {
    sharedStream.destroy();
    sharedStream = null;
  }
}

export function parsePriceSourcePrecision(tick) {
  if (!tick) return { source: 'REST_POLL', precision: 'COARSE' };
  return {
    source: tick.source ?? 'REST_POLL',
    precision: tick.precision ?? 'COARSE',
  };
}
