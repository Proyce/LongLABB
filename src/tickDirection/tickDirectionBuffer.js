import { TICK_DIRECTION_CONFIG } from "./tickDirection.config.js";

const upper = value => String(value ?? "").trim().toUpperCase();
const eventTs = event => Number(event?.eventTime ?? event?.tradeTime ?? event?.t ?? event?.receivedAt);

function makeSymbolStore() {
  return {
    trades: [],
    books: [],
    tradeIds: new Set(),
    bookIds: new Set(),
    counters: {
      accepted: 0,
      duplicates: 0,
      dropped: 0,
      outOfOrder: 0,
      parseErrors: 0,
    },
    lastPrunedAt: 0,
    lastMembershipAt: 0,
  };
}

function bookKey(event) {
  if (event?.updateId != null) return `u:${event.updateId}`;
  return `t:${eventTs(event)}:${event?.bid}:${event?.ask}`;
}

export class TickDirectionBufferStore {
  constructor(config = TICK_DIRECTION_CONFIG) {
    this.config = { ...TICK_DIRECTION_CONFIG, ...config };
    this.symbols = new Map();
  }

  touchMembership(symbol, at = Date.now()) {
    const store = this._store(symbol);
    store.lastMembershipAt = at;
  }

  addTrade(event) {
    return this._add(event, "trades");
  }

  addBook(event) {
    return this._add(event, "books");
  }

  noteParseError(symbol) {
    const sym = upper(symbol);
    if (sym) this._store(sym).counters.parseErrors += 1;
  }

  getSymbolEvents(symbol, { startAt = -Infinity, endAt = Infinity } = {}) {
    const store = this.symbols.get(upper(symbol));
    if (!store) return { trades: [], books: [], counters: null };
    const inWindow = event => {
      const ts = eventTs(event);
      return Number.isFinite(ts) && ts >= startAt && ts <= endAt;
    };
    return {
      trades: store.trades.filter(inWindow),
      books: store.books.filter(inWindow),
      counters: { ...store.counters },
    };
  }

  getLatest(symbol) {
    const store = this.symbols.get(upper(symbol));
    if (!store) return { trade: null, book: null };
    return {
      trade: store.trades[store.trades.length - 1] ?? null,
      book: store.books[store.books.length - 1] ?? null,
    };
  }

  prune(now = Date.now()) {
    const cutoff = now - this.config.maxEventAgeMs;
    for (const [symbol, store] of this.symbols.entries()) {
      store.trades = store.trades.filter(event => eventTs(event) >= cutoff);
      store.books = store.books.filter(event => eventTs(event) >= cutoff);
      store.tradeIds = new Set(store.trades
        .filter(event => event.aggregateTradeId != null)
        .map(event => String(event.aggregateTradeId)));
      store.bookIds = new Set(store.books.map(bookKey));
      store.lastPrunedAt = now;
      const membershipExpired = now - Number(store.lastMembershipAt || 0)
        > this.config.membershipGraceMs + this.config.maxEventAgeMs;
      if (membershipExpired && !store.trades.length && !store.books.length) {
        this.symbols.delete(symbol);
      }
    }
  }

  getHealthCounters() {
    const total = { accepted: 0, duplicates: 0, dropped: 0, outOfOrder: 0, parseErrors: 0 };
    for (const store of this.symbols.values()) {
      for (const key of Object.keys(total)) total[key] += store.counters[key] ?? 0;
    }
    return total;
  }

  _store(symbol) {
    const sym = upper(symbol);
    if (!this.symbols.has(sym)) this.symbols.set(sym, makeSymbolStore());
    return this.symbols.get(sym);
  }

  _add(event, sourceKey) {
    const symbol = upper(event?.symbol);
    const ts = eventTs(event);
    if (!symbol || !Number.isFinite(ts)) return false;
    const store = this._store(symbol);
    const ids = sourceKey === "trades" ? store.tradeIds : store.bookIds;
    const key = sourceKey === "trades" && event.aggregateTradeId != null
      ? String(event.aggregateTradeId)
      : sourceKey === "books" ? bookKey(event) : null;
    if (key != null && ids.has(key)) {
      store.counters.duplicates += 1;
      return false;
    }

    const events = store[sourceKey];
    const lastTs = eventTs(events[events.length - 1]);
    const outOfOrder = Number.isFinite(lastTs) && ts < lastTs;
    if (outOfOrder) store.counters.outOfOrder += 1;
    events.push(event);
    if (outOfOrder) events.sort((left, right) => eventTs(left) - eventTs(right));
    if (key != null) ids.add(key);
    while (events.length > this.config.maxEventsPerSymbolPerSource) {
      const dropped = events.shift();
      const droppedKey = sourceKey === "trades" && dropped?.aggregateTradeId != null
        ? String(dropped.aggregateTradeId)
        : sourceKey === "books" ? bookKey(dropped) : null;
      if (droppedKey != null) ids.delete(droppedKey);
      store.counters.dropped += 1;
    }
    store.counters.accepted += 1;
    return true;
  }
}
