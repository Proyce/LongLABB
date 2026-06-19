import {
  parseAggTradeTick,
  parseBookTickerTick,
} from "./tickDirection.parsers.js";
import {
  TICK_DIRECTION_CONFIG,
  TICK_DIRECTION_STREAM_SCHEMA_VERSION,
} from "./tickDirection.config.js";
import { TickDirectionBufferStore } from "./tickDirectionBuffer.js";

const BOOK_WS_BASE = "wss://fstream.binance.com/public/stream";
const TRADE_WS_BASE = "wss://fstream.binance.com/market/stream";
const upper = value => String(value ?? "").trim().toUpperCase();
const lower = value => upper(value).toLowerCase();

function hashSymbols(symbols) {
  let hash = 2166136261;
  for (const char of symbols.join(",")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

function normalizeMembers(members, config) {
  const seen = new Set();
  return (Array.isArray(members) ? members : [])
    .map((member, index) => typeof member === "string"
      ? { symbol: upper(member), priority: 1_000 - index }
      : { ...member, symbol: upper(member?.symbol), priority: Number(member?.priority ?? 0) })
    .filter(member => member.symbol && !seen.has(member.symbol) && seen.add(member.symbol))
    .sort((left, right) => right.priority - left.priority || left.symbol.localeCompare(right.symbol))
    .slice(0, config.maxSymbols);
}

export class CandidateTickStream {
  constructor(config = TICK_DIRECTION_CONFIG, options = {}) {
    this.config = { ...TICK_DIRECTION_CONFIG, ...config };
    this.bufferStore = options.bufferStore ?? new TickDirectionBufferStore(this.config);
    this.WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;
    this.sockets = new Map();
    this.members = new Map();
    this.desired = [];
    this.membershipTimer = null;
    this.pruneTimer = null;
    this.destroyed = false;
    this.started = false;
    this.health = {
      tickResearchStreamConnected: false,
      tickResearchBookConnected: false,
      tickResearchTradeConnected: false,
      tickResearchSubscribedSymbolCount: 0,
      tickResearchLastMessageAt: null,
      tickResearchReconnectCount: 0,
      tickResearchMembershipHash: "",
      tickResearchParseErrorCount: 0,
    };
  }

  start() {
    if (this.destroyed) return;
    this.started = true;
    if (this.desired.length) this._scheduleApply(0);
    if (this.pruneTimer == null) {
      this.pruneTimer = setInterval(() => this.bufferStore.prune(Date.now()), 5_000);
    }
  }

  setMembership(members, now = Date.now()) {
    const normalized = normalizeMembers(members, this.config);
    const incoming = new Set(normalized.map(member => member.symbol));
    for (const member of normalized) {
      this.members.set(member.symbol, { ...member, lastDesiredAt: now });
      this.bufferStore.touchMembership(member.symbol, now);
    }
    for (const [symbol, member] of this.members.entries()) {
      if (!incoming.has(symbol) && now - member.lastDesiredAt > this.config.membershipGraceMs) {
        this.members.delete(symbol);
      } else if (!incoming.has(symbol)) {
        this.members.set(symbol, { ...member, priority: Math.min(member.priority, -1) });
      }
    }
    this.desired = [...this.members.values()]
      .sort((left, right) => right.priority - left.priority || left.symbol.localeCompare(right.symbol))
      .slice(0, this.config.maxSymbols)
      .map(member => member.symbol);
    this._scheduleApply(this.config.membershipDebounceMs);
  }

  getBufferStore() {
    return this.bufferStore;
  }

  getHealthSnapshot(now = Date.now()) {
    const sockets = [...this.sockets.values()];
    const books = sockets.filter(socket => socket.kind === "book");
    const trades = sockets.filter(socket => socket.kind === "trade");
    const bookConnected = books.length > 0 && books.every(socket => socket.ws?.readyState === 1);
    const tradeConnected = trades.length > 0 && trades.every(socket => socket.ws?.readyState === 1);
    const counters = this.bufferStore.getHealthCounters();
    const last = this.health.tickResearchLastMessageAt;
    return {
      ...this.health,
      tickResearchStreamConnected: bookConnected || tradeConnected,
      tickResearchBookConnected: bookConnected,
      tickResearchTradeConnected: tradeConnected,
      tickResearchSubscribedSymbolCount: this.desired.length,
      tickResearchLastMessageAgeMs: last == null ? null : Math.max(0, now - last),
      tickResearchDroppedEventCount: counters.dropped,
      tickResearchOutOfOrderEventCount: counters.outOfOrder,
      tickResearchParseErrorCount: counters.parseErrors + this.health.tickResearchParseErrorCount,
      tickResearchStreamSchemaVersion: TICK_DIRECTION_STREAM_SCHEMA_VERSION,
    };
  }

  destroy() {
    this.destroyed = true;
    this.started = false;
    clearTimeout(this.membershipTimer);
    clearInterval(this.pruneTimer);
    this.membershipTimer = null;
    this.pruneTimer = null;
    for (const socket of this.sockets.values()) this._closeSocket(socket);
    this.sockets.clear();
  }

  _scheduleApply(delay) {
    if (!this.started || this.destroyed) return;
    clearTimeout(this.membershipTimer);
    this.membershipTimer = setTimeout(() => {
      this.membershipTimer = null;
      this._applyMembership();
    }, delay);
  }

  _applyMembership() {
    if (this.destroyed) return;
    const symbols = [...this.desired].sort();
    const membershipHash = hashSymbols(symbols);
    if (membershipHash === this.health.tickResearchMembershipHash && this.sockets.size) return;
    this.health.tickResearchMembershipHash = membershipHash;
    for (const socket of this.sockets.values()) this._closeSocket(socket);
    this.sockets.clear();
    if (!symbols.length || !this.WebSocketImpl) return;
    const groups = chunk(symbols, this.config.socketChunkSize);
    groups.forEach((group, index) => {
      this._openSocket("book", group, index);
      this._openSocket("trade", group, index);
    });
  }

  _openSocket(kind, symbols, index, reconnectAttempt = 0) {
    if (this.destroyed || !symbols.length) return;
    const suffix = kind === "book" ? "@bookTicker" : "@aggTrade";
    const base = kind === "book" ? BOOK_WS_BASE : TRADE_WS_BASE;
    const url = `${base}?streams=${symbols.map(symbol => `${lower(symbol)}${suffix}`).join("/")}`;
    const key = `${kind}:${index}`;
    const state = { key, kind, symbols, index, ws: null, reconnectAttempt, reconnectTimer: null, intentionalClose: false };
    try {
      state.ws = new this.WebSocketImpl(url);
    } catch {
      this._reconnect(state);
      return;
    }
    this.sockets.set(key, state);
    state.ws.onmessage = event => {
      const receivedAt = Date.now();
      this.health.tickResearchLastMessageAt = receivedAt;
      try {
        const message = JSON.parse(event.data);
        const data = message?.data ?? message;
        const tick = kind === "book"
          ? parseBookTickerTick(data, receivedAt)
          : parseAggTradeTick(data, receivedAt);
        if (!tick) {
          this.health.tickResearchParseErrorCount += 1;
          return;
        }
        if (kind === "book") this.bufferStore.addBook(tick);
        else this.bufferStore.addTrade(tick);
      } catch {
        this.health.tickResearchParseErrorCount += 1;
      }
    };
    state.ws.onerror = () => {};
    state.ws.onclose = () => {
      if (!state.intentionalClose && !this.destroyed) this._reconnect(state);
    };
  }

  _reconnect(state) {
    if (this.destroyed) return;
    this.health.tickResearchReconnectCount += 1;
    const delay = Math.min(10_000, 1_000 * (state.reconnectAttempt + 1));
    state.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this._openSocket(state.kind, state.symbols, state.index, state.reconnectAttempt + 1);
    }, delay);
  }

  _closeSocket(state) {
    state.intentionalClose = true;
    clearTimeout(state.reconnectTimer);
    const ws = state.ws;
    state.ws = null;
    if (!ws) return;
    try {
      ws.onmessage = null;
      ws.onerror = () => {};
      ws.onclose = null;
      if (ws.readyState === 0) {
        ws.onopen = () => {
          try { ws.close(1000, "membership-rebuild"); } catch {}
        };
      } else if (ws.readyState === 1) {
        ws.close(1000, "membership-rebuild");
      }
    } catch {}
  }
}

export function createTickDirectionCollector(config, options) {
  return new CandidateTickStream(config, options);
}
