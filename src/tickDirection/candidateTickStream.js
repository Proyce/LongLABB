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
//   - Each connection (book / trade) owns its own subscription state so that
//     a reconnect on one socket never clears the other's subscriptions.

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

const MEMBERSHIP_REASON = Object.freeze({
  TOP_GAINER:         'TOP_GAINER',
  TOP_LOSER:          'TOP_LOSER',
  IMMINENT_ENTRY:     'IMMINENT_ENTRY',
  LIFECYCLE_HANDOVER: 'LIFECYCLE_HANDOVER',
});

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
  if ("id" in message && ("result" in message || "error" in message)) {
    return message.error ? "SUBSCRIPTION_ERROR" : "SUBSCRIPTION_ACK";
  }
  if (message.ping != null || message.pong != null) return "PING";
  if (typeof message.stream === "string" && message.data != null) return "COMBINED_MARKET";
  if (message.e != null || message.b != null) return "DIRECT_MARKET";
  return "UNKNOWN";
}

export class CandidateTickStream {
  constructor(config = TICK_DIRECTION_CONFIG, options = {}) {
    this.config      = { ...TICK_DIRECTION_CONFIG, ...config };
    this.bufferStore = options.bufferStore ?? new TickDirectionBufferStore(this.config);
    this.WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;

    // Shared persistent connections (one per kind) — each owns its own subscription state
    this._connections = new Map(); // kind → ConnectionState

    // Membership tracking
    this.members = new Map();  // symbol → { symbol, priority, lastDesiredAt, membershipReason }
    this.desired = [];

    // Lifecycle handover: symbol → Set<reason>
    this._membershipReasons = new Map();

    // Lifecycle handover tracking
    this._handoverPending = new Map(); // symbol → { exitAt, completed }

    this.membershipTimer = null;
    this.pruneTimer      = null;
    this.destroyed       = false;
    this.started         = false;

    this.health = {
      tickResearchStreamConnected:           false,
      tickResearchBookConnected:             false,
      tickResearchTradeConnected:            false,
      tickResearchBothSourcesConnected:      false,
      tickResearchAnySourceConnected:        false,
      tickResearchSubscribedSymbolCount:     0,
      tickResearchLastMessageAt:             null,
      tickResearchBookLastMessageAgeMs:      null,
      tickResearchTradeLastMessageAgeMs:     null,
      tickResearchReconnectCount:            0,
      tickResearchMembershipHash:            "",
      tickResearchParseErrorCount:           0,
      tickResearchCtrlAckCount:              0,
      tickResearchCtrlErrorCount:            0,
      tickResearchPlannedRotationCount:      0,
      tickResearchUnexpectedDisconnectCount: 0,
      tickResearchBookActiveSubscriptionCount:    0,
      tickResearchTradeActiveSubscriptionCount:   0,
      tickResearchBookPendingSubscriptionCount:   0,
      tickResearchTradePendingSubscriptionCount:  0,
      tickResearchRotationFailureCount:      0,
      tickResearchLastRotationAt:            null,
      tickResearchLastRotationReason:        null,
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
   * lifecycleHandoverGraceMs via LIFECYCLE_HANDOVER reason, then removes it
   * (unless another reason is still active) so an active position does not
   * permanently occupy one of the research slots.
   */
  notifyLifecycleHandover(symbol, entryTime = Date.now()) {
    const graceMs = this.config.lifecycleHandoverGraceMs ?? 10_000;
    const sym = upper(symbol);

    // Add LIFECYCLE_HANDOVER reason
    if (!this._membershipReasons.has(sym)) {
      this._membershipReasons.set(sym, new Set());
    }
    this._membershipReasons.get(sym).add(MEMBERSHIP_REASON.LIFECYCLE_HANDOVER);

    this._handoverPending.set(sym, {
      exitAt:    entryTime + graceMs,
      completed: false,
    });

    // After grace period, remove LIFECYCLE_HANDOVER reason
    setTimeout(() => {
      const h = this._handoverPending.get(sym);
      if (h && !h.completed) {
        h.completed = true;
        const reasons = this._membershipReasons.get(sym);
        if (reasons) reasons.delete(MEMBERSHIP_REASON.LIFECYCLE_HANDOVER);

        // Only remove symbol from desired if no other reason remains
        const otherReasons = reasons ? [...reasons].filter(r => r !== MEMBERSHIP_REASON.LIFECYCLE_HANDOVER) : [];
        if (otherReasons.length === 0) {
          this.members.delete(sym);
          this.desired = this.desired.filter(s => s !== sym);
          this._scheduleApply(0);
        }
      }
    }, graceMs);
  }

  getBufferStore() { return this.bufferStore; }

  getHealthSnapshot(now = Date.now()) {
    const book  = this._connections.get("book");
    const trade = this._connections.get("trade");
    const bookConnected  = book?.ws?.readyState  === 1 && book?.lastMessageAt  != null;
    const tradeConnected = trade?.ws?.readyState === 1 && trade?.lastMessageAt != null;

    const bookAgeMs  = book?.lastMessageAt  != null ? Math.max(0, now - book.lastMessageAt)  : null;
    const tradeAgeMs = trade?.lastMessageAt != null ? Math.max(0, now - trade.lastMessageAt) : null;

    return {
      ...this.health,
      tickResearchStreamConnected:           bookConnected || tradeConnected,
      tickResearchBookConnected:             bookConnected,
      tickResearchTradeConnected:            tradeConnected,
      tickResearchBothSourcesConnected:      bookConnected && tradeConnected,
      tickResearchAnySourceConnected:        bookConnected || tradeConnected,
      tickResearchSubscribedSymbolCount:     this.desired.length,
      tickResearchLastMessageAgeMs:          bookAgeMs != null || tradeAgeMs != null
        ? Math.min(bookAgeMs ?? Infinity, tradeAgeMs ?? Infinity)
        : null,
      tickResearchBookLastMessageAgeMs:      bookAgeMs,
      tickResearchTradeLastMessageAgeMs:     tradeAgeMs,
      tickResearchBookActiveSubscriptionCount:  book?.activeSubscriptions?.size ?? 0,
      tickResearchTradeActiveSubscriptionCount: trade?.activeSubscriptions?.size ?? 0,
      tickResearchBookPendingSubscriptionCount:  book?.controlQueue?.length ?? 0,
      tickResearchTradePendingSubscriptionCount: trade?.controlQueue?.length ?? 0,
      tickResearchStreamSchemaVersion:       TICK_DIRECTION_STREAM_SCHEMA_VERSION,
      tickResearchMembershipHash:            hashSymbols([...this.desired].sort()),
    };
  }

  destroy() {
    this.destroyed = true;
    this.started   = false;
    clearTimeout(this.membershipTimer);
    clearInterval(this.pruneTimer);
    this.membershipTimer = null;
    this.pruneTimer      = null;
    for (const conn of this._connections.values()) this._closeConnection(conn, "destroy");
    this._connections.clear();
  }

  _scheduleApply(delay) {
    if (!this.started || this.destroyed) return;
    clearTimeout(this.membershipTimer);
    this.membershipTimer = setTimeout(() => {
      this.membershipTimer = null;
      this.reconcileConnectionSubscriptions("book");
      this.reconcileConnectionSubscriptions("trade");
    }, delay);
  }

  /**
   * Reconcile subscriptions for a single connection kind.
   * Each kind only ever sends its own stream type:
   *   book  → @bookTicker
   *   trade → @aggTrade
   */
  reconcileConnectionSubscriptions(kind) {
    const conn = this._connections.get(kind);
    if (!conn || conn.ws?.readyState !== 1) return;

    const symbols = [...this.desired].sort();
    const desired = kind === "book"
      ? new Set(symbols.map(s => `${lower(s)}@bookTicker`))
      : new Set(symbols.map(s => `${lower(s)}@aggTrade`));

    conn.desiredSubscriptions = desired;

    const toSub   = [...desired].filter(s => !conn.activeSubscriptions.has(s));
    const toUnsub = [...conn.activeSubscriptions].filter(s => !desired.has(s));

    for (const batch of chunk(toSub, SUBSCRIPTION_BATCH_SIZE)) {
      this._enqueueCtrl(conn, { method: "SUBSCRIBE", params: batch });
    }
    for (const batch of chunk(toUnsub, SUBSCRIPTION_BATCH_SIZE)) {
      this._enqueueCtrl(conn, { method: "UNSUBSCRIBE", params: batch });
    }
  }

  _enqueueCtrl(conn, message) {
    conn.controlQueue.push(message);
    this._drainCtrlQueue(conn);
  }

  _drainCtrlQueue(conn) {
    if (conn.ctrlTimer != null || conn.controlQueue.length === 0) return;
    const now = Date.now();
    const minInterval = 1_000 / MAX_SUBSCRIPTION_CTRL_PER_SECOND;
    const wait = Math.max(0, minInterval - (now - conn.lastControlSentAt));
    conn.ctrlTimer = setTimeout(() => {
      conn.ctrlTimer = null;
      if (conn.controlQueue.length === 0) return;
      const msg = conn.controlQueue.shift();
      const id  = conn.nextSubscriptionId++;
      if (conn.ws?.readyState === 1) {
        try {
          conn.ws.send(JSON.stringify({ ...msg, id }));
          conn.lastControlSentAt = Date.now();
          // Track pending ack with timeout
          const timer = setTimeout(() => {
            conn.pendingAcks.delete(id);
            this.health.tickResearchCtrlErrorCount += 1;
          }, SUBSCRIPTION_ACK_TIMEOUT_MS);
          conn.pendingAcks.set(id, { method: msg.method, params: msg.params, timer, connKind: conn.kind });
        } catch {
          conn.controlQueue.unshift(msg); // re-queue on send failure
        }
      }
      if (conn.controlQueue.length > 0) this._drainCtrlQueue(conn);
    }, wait);
  }

  _handleCtrlAck(conn, id, error) {
    const pending = conn.pendingAcks.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    conn.pendingAcks.delete(id);
    if (error) {
      this.health.tickResearchCtrlErrorCount += 1;
    } else {
      this.health.tickResearchCtrlAckCount += 1;
      if (pending.method === "SUBSCRIBE") {
        for (const stream of pending.params ?? []) conn.activeSubscriptions.add(stream);
      } else if (pending.method === "UNSUBSCRIBE") {
        for (const stream of pending.params ?? []) conn.activeSubscriptions.delete(stream);
      }
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
      // Per-connection subscription state (R-05 fix)
      desiredSubscriptions: new Set(),
      activeSubscriptions:  new Set(),
      pendingAcks:          new Map(),
      controlQueue:         [],
      ctrlTimer:            null,
      lastControlSentAt:    0,
      nextSubscriptionId:   1,
    };

    try {
      state.ws = new this.WebSocketImpl(base);
    } catch {
      this._scheduleReconnect(state);
      return;
    }
    this._connections.set(kind, state);

    state.ws.onopen = () => {
      state.connectedAt      = Date.now();
      state.reconnectAttempt = 0;
      this.health.tickResearchLastMessageAt = Date.now();
      // Reconcile only this connection's subscriptions on open
      this._reconcileSubscriptions(kind);
      // Schedule planned rotation
      state.rotationTimer = setTimeout(() => {
        if (!this.destroyed) {
          this.rotateConnection(kind);
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
        this.health.tickResearchParseErrorCount += 1;
        return;
      }

      const msgKind = classifyMessage(parsed);
      switch (msgKind) {
        case "SUBSCRIPTION_ACK":
          this._handleCtrlAck(state, parsed.id, null);
          state.lastAckAt = receivedAt;
          break;
        case "SUBSCRIPTION_ERROR":
          this._handleCtrlAck(state, parsed.id, parsed.error);
          break;
        case "PING":
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

  /**
   * Planned rotation — closes the connection with onclose intact so the normal
   * reconnect path fires.  Does NOT set intentionalClose = true.
   */
  rotateConnection(kind) {
    const state = this._connections.get(kind);
    if (!state || this.destroyed) return;

    state.plannedRotationCount++;
    this.health.tickResearchPlannedRotationCount++;
    this.health.tickResearchLastRotationAt = Date.now();
    this.health.tickResearchLastRotationReason = 'PLANNED_AGE_ROTATION';

    this._closeConnectionForRotation(state);
  }

  _closeConnectionForRotation(state) {
    clearTimeout(state.reconnectTimer);
    clearTimeout(state.rotationTimer);

    const ws = state.ws;
    state.ws = null;

    if (!ws) {
      // Nothing to close — schedule immediate reconnect
      this._scheduleReconnect(state);
      return;
    }

    // Replace handlers BEFORE closing so onclose can fire the reconnect
    ws.onerror   = () => {};
    ws.onmessage = null;
    ws.onopen    = null;
    ws.onclose   = () => {
      if (!this.destroyed) {
        this._scheduleReconnect(state);
      }
    };

    try {
      if (ws.readyState === 0) {
        // Still connecting — close once open
        ws.onopen = () => { try { ws.close(1000, "planned-rotation"); } catch {} };
      } else if (ws.readyState === 1) {
        ws.close(1000, "planned-rotation");
      } else {
        // Already closing/closed — just schedule reconnect
        this._scheduleReconnect(state);
      }
    } catch {
      this.health.tickResearchRotationFailureCount++;
      this._scheduleReconnect(state);
    }
  }

  /**
   * Reconcile subscriptions for a single kind on reconnect.
   * Clears only that connection's activeSubscriptions, not the other.
   */
  _reconcileSubscriptions(kind) {
    const conn = this._connections.get(kind);
    if (!conn) return;
    // Clear stale active set — new socket has no subscriptions
    conn.activeSubscriptions.clear();
    this.reconcileConnectionSubscriptions(kind);
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
    if (state.ctrlTimer != null) { clearTimeout(state.ctrlTimer); state.ctrlTimer = null; }
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
