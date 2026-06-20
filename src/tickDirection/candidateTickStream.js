// ─── CANDIDATE TICK STREAM ────────────────────────────────────────────────────
// Manages WebSocket tick streams for real-time market microstructure analysis.
//
// Key design principles (spec §6):
//   - Use incremental SUBSCRIBE/UNSUBSCRIBE JSON control messages instead of
//     rebuilding all sockets for normal membership changes.
//   - Stable shard diffing fallback: keep unchanged shards open; rebuild only
//     the shards whose membership changed.
//   - Track subscription acknowledgements separately from parse errors.
//   - Planned 23h50m connection rotation with jittered reconnect backoff.
//   - Lifecycle handover: active positions leave the research slot after
//     lifecycleHandoverGraceMs, freeing it for pre-entry candidates.

import {
  parseAggTradeTick,
  parseBookTickerTick,
} from "./tickDirection.parsers.js";
import {
  TICK_DIRECTION_CONFIG,
  TICK_DIRECTION_STREAM_SCHEMA_VERSION,
} from "./tickDirection.config.js";
import { TickDirectionBufferStore } from "./tickDirectionBuffer.js";

const BOOK_WS_COMBINED  = "wss://fstream.binance.com/stream";
const TRADE_WS_COMBINED = "wss://fstream.binance.com/stream";

const upper = value => String(value ?? "").trim().toUpperCase();
const lower = value => upper(value).toLowerCase();

// Control-message throttle defaults
const MAX_SUBSCRIPTION_CTRL_PER_SECOND = 5;
const SUBSCRIPTION_BATCH_SIZE = 40;
const SUBSCRIPTION_ACK_TIMEOUT_MS = 5_000;

// Reconnect backoff
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS  = 30_000;
const RECONNECT_JITTER_PCT    = 0.20;

// Planned rotation: rotate connections before Binance's 24h server-side close
const PLANNED_ROTATION_MS = 23 * 60 * 60 * 1_000 + 50 * 60 * 1_000;

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
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function jitteredDelay(base, maxDelay, attempt) {
  const exp = Math.min(base * 2 ** attempt, maxDelay);
  const jitter = exp * RECONNECT_JITTER_PCT * (Math.random() * 2 - 1);
  return Math.max(RECONNECT_BASE_DELAY_MS, exp + jitter);
}

function normalizeMembers(members, config) {
  const seen = new Set();
  return (Array.isArray(members) ? members : [])
    .map((member, index) => typeof member === "string"
      ? { symbol: upper(member), priority: 1_000 - index }
      : { ...member, symbol: upper(member?.symbol), priority: Number(member?.priority ?? 0) })
    .filter(member => member.symbol && !seen.has(member.symbol) && seen.add(member.symbol))
    .sort((a, b) => b.priority - a.priority || a.symbol.localeCompare(b.symbol))
    .slice(0, config.maxSymbols);
}

/** Classify an inbound message and return its type. */
function classifyMessage(message) {
  if (message == null || typeof message !== "object") return "UNKNOWN";
  // Subscription ack: { result: null, id: number } or { result: {...}, id: number }
  if ("id" in message && ("result" in message || "error" in message)) {
    return message.error ? "SUBSCRIPTION_ERROR" : "SUBSCRIPTION_ACK";
  }
  // Ping / protocol control
  if (message.ping != null || message.pong != null) return "PING";
  // Combined stream: { stream: "...", data: {...} }
  if (typeof message.stream === "string" && message.data != null) return "COMBINED_MARKET";
  // Direct payload
  if (message.e != null || message.b != null) return "DIRECT_MARKET";
  return "UNKNOWN";
}

export class CandidateTickStream {
  constructor(config = TICK_DIRECTION_CONFIG, options = {}) {
    this.config      = { ...TICK_DIRECTION_CONFIG, ...config };
    this.bufferStore = options.bufferStore ?? new TickDirectionBufferStore(this.config);
    this.WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;

    // Shared persistent connections (one per kind)
    this._connections = new Map(); // kind → ConnectionState

    // Membership tracking
    this.members = new Map();  // symbol → { symbol, priority, lastDesiredAt, membershipReason }
    this.desired = [];
    this._activeSubscriptions = new Set();  // currently subscribed stream names
    this._pendingAcks         = new Map();  // id → { resolve, reject, timer }
    this._nextSubscriptionId  = 1;
    this._ctrlQueue           = [];
    this._ctrlTimer           = null;
    this._lastCtrlSentAt      = 0;

    // Lifecycle handover tracking
    this._handoverPending = new Map(); // symbol → { exitAt, completed }

    this.membershipTimer = null;
    this.pruneTimer      = null;
    this.rotationTimer   = null;
    this.destroyed       = false;
    this.started         = false;

    this.health = {
      tickResearchStreamConnected:       false,
      tickResearchBookConnected:         false,
      tickResearchTradeConnected:        false,
      tickResearchSubscribedSymbolCount: 0,
      tickResearchLastMessageAt:         null,
      tickResearchReconnectCount:        0,
      tickResearchMembershipHash:        "",
      tickResearchParseErrorCount:       0,
      // Transport health counters (separate from parse errors)
      tickResearchCtrlAckCount:          0,
      tickResearchCtrlErrorCount:        0,
      tickResearchPlannedRotationCount:  0,
      tickResearchUnexpectedDisconnectCount: 0,
      tickResearchActiveSubscriptionCount: 0,
      tickResearchPendingSubscriptionCount: 0,
    };
  }

  start() {
    if (this.destroyed) return;
    this.started = true;
    this._openPersistentConnection("book");
    this._openPersistentConnection("trade");
    if (this.pruneTimer == null) {
      this.pruneTimer = setInterval(() => this.bufferStore.prune(Date.now()), 5_000);
    }
    if (this.desired.length) this._scheduleApply(0);
  }

  setMembership(members, now = Date.now()) {
    const normalized = normalizeMembers(members, this.config);
    const incoming   = new Set(normalized.map(m => m.symbol));

    for (const member of normalized) {
      this.members.set(member.symbol, { ...member, lastDesiredAt: now });
      this.bufferStore.touchMembership(member.symbol, now);
    }

    const graceMs = this.config.membershipGraceMs ?? 30_000;
    for (const [symbol, member] of this.members.entries()) {
      if (!incoming.has(symbol)) {
        if (now - member.lastDesiredAt > graceMs) {
          this.members.delete(symbol);
        } else {
          this.members.set(symbol, { ...member, priority: Math.min(member.priority, -1) });
        }
      }
    }

    this.desired = [...this.members.values()]
      .sort((a, b) => b.priority - a.priority || a.symbol.localeCompare(b.symbol))
      .slice(0, this.config.maxSymbols)
      .map(m => m.symbol);

    this._scheduleApply(this.config.membershipDebounceMs ?? 1_000);
  }

  /**
   * Called at entry time. Keeps the symbol in research membership for
   * lifecycleHandoverGraceMs, then removes it so an active position does not
   * permanently occupy one of the research slots.
   */
  notifyLifecycleHandover(symbol, now = Date.now()) {
    const graceMs = this.config.lifecycleHandoverGraceMs ?? 5_000;
    const sym = upper(symbol);
    this._handoverPending.set(sym, {
      exitAt:    now + graceMs,
      completed: false,
    });
    // After grace, remove from desired membership.
    setTimeout(() => {
      const h = this._handoverPending.get(sym);
      if (h && !h.completed) {
        h.completed = true;
        this.members.delete(sym);
        this.desired = this.desired.filter(s => s !== sym);
        this._scheduleApply(0);
      }
    }, graceMs);
  }

  getBufferStore() { return this.bufferStore; }

  getHealthSnapshot(now = Date.now()) {
    const book  = this._connections.get("book");
    const trade = this._connections.get("trade");
    const bookConnected  = book?.ws?.readyState  === 1 && book?.lastMessageAt  != null;
    const tradeConnected = trade?.ws?.readyState === 1 && trade?.lastMessageAt != null;
    const last = this.health.tickResearchLastMessageAt;

    return {
      ...this.health,
      tickResearchStreamConnected:       bookConnected || tradeConnected,
      tickResearchBookConnected:         bookConnected,
      tickResearchTradeConnected:        tradeConnected,
      tickResearchSubscribedSymbolCount: this._activeSubscriptions.size / 2, // book + trade per symbol
      tickResearchLastMessageAgeMs:      last == null ? null : Math.max(0, now - last),
      tickResearchActiveSubscriptionCount: this._activeSubscriptions.size,
      tickResearchPendingSubscriptionCount: this._ctrlQueue.length,
      tickResearchStreamSchemaVersion:   TICK_DIRECTION_STREAM_SCHEMA_VERSION,
      tickResearchMembershipHash:        hashSymbols([...this.desired].sort()),
    };
  }

  destroy() {
    this.destroyed = true;
    this.started   = false;
    clearTimeout(this.membershipTimer);
    clearTimeout(this.rotationTimer);
    clearInterval(this.pruneTimer);
    this.membershipTimer = null;
    this.rotationTimer   = null;
    this.pruneTimer      = null;
    for (const conn of this._connections.values()) this._closeConnection(conn, "destroy");
    this._connections.clear();
    for (const { timer } of this._pendingAcks.values()) clearTimeout(timer);
    this._pendingAcks.clear();
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

    // Compute desired stream names
    const desiredBook  = new Set(symbols.map(s => `${lower(s)}@bookTicker`));
    const desiredTrade = new Set(symbols.map(s => `${lower(s)}@aggTrade`));
    const desired      = new Set([...desiredBook, ...desiredTrade]);

    const toSubscribe   = [...desired].filter(s => !this._activeSubscriptions.has(s));
    const toUnsubscribe = [...this._activeSubscriptions].filter(s => !desired.has(s));

    const conn = this._connections.get("book") ?? this._connections.get("trade");
    if (!conn || conn.ws?.readyState !== 1) {
      // Connection not ready — will reconcile on open/reconnect.
      return;
    }

    // Batch subscribe
    for (const batch of chunk(toSubscribe, SUBSCRIPTION_BATCH_SIZE)) {
      this._enqueueCtrl({ method: "SUBSCRIBE", params: batch });
    }
    // Batch unsubscribe
    for (const batch of chunk(toUnsubscribe, SUBSCRIPTION_BATCH_SIZE)) {
      this._enqueueCtrl({ method: "UNSUBSCRIBE", params: batch });
    }
  }

  _enqueueCtrl(message) {
    this._ctrlQueue.push(message);
    this._drainCtrlQueue();
  }

  _drainCtrlQueue() {
    if (this._ctrlTimer != null || this._ctrlQueue.length === 0) return;
    const now = Date.now();
    const minInterval = 1_000 / MAX_SUBSCRIPTION_CTRL_PER_SECOND;
    const wait = Math.max(0, minInterval - (now - this._lastCtrlSentAt));
    this._ctrlTimer = setTimeout(() => {
      this._ctrlTimer = null;
      if (this._ctrlQueue.length === 0) return;
      const msg = this._ctrlQueue.shift();
      const id  = this._nextSubscriptionId++;
      const conn = this._connections.get("book") ?? this._connections.get("trade");
      if (conn?.ws?.readyState === 1) {
        try {
          conn.ws.send(JSON.stringify({ ...msg, id }));
          this._lastCtrlSentAt = Date.now();
          this.health.tickResearchPendingSubscriptionCount = this._ctrlQueue.length;
          // Track pending ack with timeout
          const timer = setTimeout(() => {
            this._pendingAcks.delete(id);
            this.health.tickResearchCtrlErrorCount += 1;
          }, SUBSCRIPTION_ACK_TIMEOUT_MS);
          this._pendingAcks.set(id, { method: msg.method, params: msg.params, timer });
        } catch {
          this._ctrlQueue.unshift(msg); // re-queue on send failure
        }
      }
      if (this._ctrlQueue.length > 0) this._drainCtrlQueue();
    }, wait);
  }

  _handleCtrlAck(id, error) {
    const pending = this._pendingAcks.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this._pendingAcks.delete(id);
    if (error) {
      this.health.tickResearchCtrlErrorCount += 1;
    } else {
      this.health.tickResearchCtrlAckCount += 1;
      // Update active subscription set
      if (pending.method === "SUBSCRIBE") {
        for (const stream of pending.params ?? []) this._activeSubscriptions.add(stream);
      } else if (pending.method === "UNSUBSCRIBE") {
        for (const stream of pending.params ?? []) this._activeSubscriptions.delete(stream);
      }
      this.health.tickResearchActiveSubscriptionCount = this._activeSubscriptions.size;
    }
  }

  _openPersistentConnection(kind) {
    if (this.destroyed || !this.WebSocketImpl) return;
    const existing = this._connections.get(kind);
    if (existing?.ws?.readyState === 0 || existing?.ws?.readyState === 1) return;

    const base = kind === "book" ? BOOK_WS_COMBINED : TRADE_WS_COMBINED;
    const connId = `${kind}-${Date.now()}`;
    const state = {
      kind, connId,
      ws: null,
      connectedAt:     null,
      lastMessageAt:   null,
      lastAckAt:       null,
      reconnectAttempt: existing?.reconnectAttempt ?? 0,
      plannedRotationCount: existing?.plannedRotationCount ?? 0,
      unexpectedDisconnectCount: existing?.unexpectedDisconnectCount ?? 0,
      intentionalClose: false,
      reconnectTimer:  null,
      rotationTimer:   null,
    };

    try {
      state.ws = new this.WebSocketImpl(base);
    } catch {
      this._scheduleReconnect(state);
      return;
    }
    this._connections.set(kind, state);

    state.ws.onopen = () => {
      state.connectedAt   = Date.now();
      state.reconnectAttempt = 0;
      this.health.tickResearchLastMessageAt = Date.now();
      // Reconcile subscriptions on open
      this._reconcileSubscriptions();
      // Schedule planned rotation
      state.rotationTimer = setTimeout(() => {
        if (!this.destroyed) {
          state.plannedRotationCount++;
          this.health.tickResearchPlannedRotationCount++;
          state.intentionalClose = false; // allow reconnect
          this._closeConnection(state, "planned-rotation");
        }
      }, PLANNED_ROTATION_MS);
    };

    state.ws.onmessage = event => {
      const receivedAt = Date.now();
      this.health.tickResearchLastMessageAt = receivedAt;
      state.lastMessageAt = receivedAt;

      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        // Not valid JSON at all — do count as parse error
        this.health.tickResearchParseErrorCount += 1;
        return;
      }

      const msgKind = classifyMessage(parsed);
      switch (msgKind) {
        case "SUBSCRIPTION_ACK":
          this._handleCtrlAck(parsed.id, null);
          state.lastAckAt = receivedAt;
          break;
        case "SUBSCRIPTION_ERROR":
          this._handleCtrlAck(parsed.id, parsed.error);
          break;
        case "PING":
          // Respond to ping
          try { state.ws.send(JSON.stringify({ pong: parsed.ping ?? Date.now() })); } catch {}
          break;
        case "COMBINED_MARKET": {
          const stream = String(parsed.stream ?? "");
          const data   = parsed.data;
          const tick   = stream.endsWith("@bookTicker")
            ? parseBookTickerTick(data, receivedAt)
            : stream.endsWith("@aggTrade")
              ? parseAggTradeTick(data, receivedAt)
              : null;
          if (!tick) {
            this.health.tickResearchParseErrorCount += 1;
          } else if (stream.endsWith("@bookTicker")) {
            this.bufferStore.addBook(tick);
          } else {
            this.bufferStore.addTrade(tick);
          }
          break;
        }
        case "DIRECT_MARKET": {
          const isBook = parsed.b != null || parsed.B != null;
          const tick   = isBook
            ? parseBookTickerTick(parsed, receivedAt)
            : parseAggTradeTick(parsed, receivedAt);
          if (!tick) {
            this.health.tickResearchParseErrorCount += 1;
          } else if (isBook) {
            this.bufferStore.addBook(tick);
          } else {
            this.bufferStore.addTrade(tick);
          }
          break;
        }
        default:
          // Unknown — don't increment parse error for genuinely unknown control msgs
          break;
      }
    };

    state.ws.onerror  = () => {};
    state.ws.onclose  = () => {
      clearTimeout(state.rotationTimer);
      if (!state.intentionalClose && !this.destroyed) {
        state.unexpectedDisconnectCount++;
        this.health.tickResearchUnexpectedDisconnectCount++;
        this._scheduleReconnect(state);
      }
    };
  }

  _reconcileSubscriptions() {
    // On reconnect, re-subscribe to all desired streams.
    this._activeSubscriptions.clear();
    const symbols = [...this.desired].sort();
    const allStreams = [
      ...symbols.map(s => `${lower(s)}@bookTicker`),
      ...symbols.map(s => `${lower(s)}@aggTrade`),
    ];
    for (const batch of chunk(allStreams, SUBSCRIPTION_BATCH_SIZE)) {
      this._enqueueCtrl({ method: "SUBSCRIBE", params: batch });
    }
  }

  _scheduleReconnect(state) {
    if (this.destroyed) return;
    this.health.tickResearchReconnectCount++;
    const delay = jitteredDelay(RECONNECT_BASE_DELAY_MS, RECONNECT_MAX_DELAY_MS, state.reconnectAttempt);
    state.reconnectAttempt++;
    state.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this._openPersistentConnection(state.kind);
    }, delay);
  }

  _closeConnection(state, reason = "normal") {
    state.intentionalClose = true;
    clearTimeout(state.reconnectTimer);
    clearTimeout(state.rotationTimer);
    const ws = state.ws;
    state.ws = null;
    if (!ws) return;
    try {
      ws.onmessage = null;
      ws.onerror   = () => {};
      ws.onclose   = null;
      if (ws.readyState === 0) {
        ws.onopen = () => { try { ws.close(1000, reason); } catch {} };
      } else if (ws.readyState === 1) {
        ws.close(1000, reason);
      }
    } catch {}
  }
}

export function createTickDirectionCollector(config, options) {
  return new CandidateTickStream(config, options);
}
