import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BinancePriceStream,
  parseBookTickerTick,
  parseAggTradeTick,
  parseMarkPriceTick,
  parsePriceSourcePrecision,
  BINANCE_PRICE_STREAM_SCHEMA_VERSION,
} from "./binancePriceStream.js";

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this._closed = false;
    MockWebSocket._instances.push(this);
    setTimeout(() => {
      if (this._closed) return;
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send() {}
  close() {
    this._closed = true;
    this.readyState = 3;
  }
  static _instances = [];
  static reset() { MockWebSocket._instances = []; }
  static byRoute(route) {
    return [...MockWebSocket._instances].reverse().find(ws => ws.url.includes(route));
  }
  static allByRoute(route) {
    return MockWebSocket._instances.filter(ws => ws.url.includes(route));
  }
}

beforeEach(() => {
  MockWebSocket.reset();
  global.WebSocket = MockWebSocket;
});

afterEach(() => {
  delete global.WebSocket;
});

const waitOpen = () => new Promise(resolve => setTimeout(resolve, 15));

function emit(ws, stream, data) {
  ws?.onmessage?.({ data: JSON.stringify({ stream, data }) });
}

describe("BinancePriceStream routed sockets", () => {
  it("creates routed bookTicker, aggTrade, and all-market mark-price sockets", async () => {
    const stream = new BinancePriceStream();
    stream.subscribe("BTCUSDT", () => {});
    await waitOpen();

    const book = MockWebSocket.byRoute("/public/stream");
    const trade = MockWebSocket._instances.find(ws => ws.url.includes("/market/stream") && ws.url.includes("@aggTrade"));
    const mark = MockWebSocket._instances.find(ws => ws.url.includes("!markPrice@arr@1s"));
    expect(book?.url).toContain("btcusdt@bookTicker");
    expect(trade?.url).toContain("btcusdt@aggTrade");
    expect(mark?.url).toContain("!markPrice@arr@1s");
    expect(stream.getHealthSnapshot().fullyConnected).toBe(true);
    stream.destroy();
  });

  it("delivers book and aggregate-trade ticks to the same subscriber", async () => {
    const stream = new BinancePriceStream();
    const ticks = [];
    stream.subscribe("SOLUSDT", tick => ticks.push(tick));
    await waitOpen();

    emit(MockWebSocket.byRoute("/public/stream"), "solusdt@bookTicker", {
      s: "SOLUSDT", b: "99.5", B: "420", a: "100.5", A: "999999", E: 1000,
    });
    emit(MockWebSocket._instances.find(ws => ws.url.includes("@aggTrade")), "solusdt@aggTrade", {
      s: "SOLUSDT", p: "100.2", T: 1001,
    });

    expect(ticks.map(tick => tick.source)).toEqual(["BOOK_TICKER", "AGG_TRADE"]);
    expect(stream.getLatestPrice("SOLUSDT")).toBeCloseTo(100.2);
    expect(stream.getSymbolHealthSnapshot("SOLUSDT").latestSource).toBe("AGG_TRADE");
    stream.destroy();
  });



  it("uses mark price as a rate-limit-independent safety tick only when primary ticks are stale", async () => {
    const stream = new BinancePriceStream();
    const ticks = [];
    stream.subscribe("VELVETUSDT", tick => ticks.push(tick));
    await waitOpen();

    const markSocket = MockWebSocket._instances.find(ws => ws.url.includes("!markPrice@arr@1s"));
    emit(markSocket, "!markPrice@arr@1s", [
      { s: "VELVETUSDT", p: "0.4129", E: Date.now() },
      { s: "UNWATCHEDUSDT", p: "99", E: Date.now() },
    ]);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].source).toBe("MARK_PRICE_1S");
    expect(ticks[0].price).toBeCloseTo(0.4129);

    emit(MockWebSocket.byRoute("/public/stream"), "velvetusdt@bookTicker", {
      s: "VELVETUSDT", b: "0.4199", a: "0.4201", B: "1", A: "1", E: Date.now(),
    });
    const before = ticks.length;
    emit(markSocket, "!markPrice@arr@1s", [
      { s: "VELVETUSDT", p: "0.4100", E: Date.now() },
    ]);
    expect(ticks).toHaveLength(before);
    expect(stream.getLatestPrice("VELVETUSDT")).toBeCloseTo(0.42);
    stream.destroy();
  });

  it("does not disconnect all routed sockets when one of several positions closes", async () => {
    const stream = new BinancePriceStream();
    const btc = () => {};
    const eth = () => {};
    stream.subscribe("BTCUSDT", btc);
    stream.subscribe("ETHUSDT", eth);
    await new Promise(resolve => setTimeout(resolve, 120));

    const before = MockWebSocket._instances.length;
    stream.unsubscribe("BTCUSDT", btc);
    await new Promise(resolve => setTimeout(resolve, 120));

    expect(MockWebSocket._instances.length).toBe(before);
    expect(stream.getHealthSnapshot().subscribedSymbols).toEqual(["ETHUSDT"]);
    expect(stream.getHealthSnapshot().retainedStreamSymbolCount).toBe(2);
    stream.destroy();
  });

  it("disconnects and clears retained membership after the final callback leaves", async () => {
    const stream = new BinancePriceStream();
    const callback = () => {};
    stream.subscribe("ETHUSDT", callback);
    await waitOpen();
    stream.unsubscribe("ETHUSDT", callback);
    expect(stream.getHealthSnapshot().subscribedSymbolCount).toBe(0);
    expect(stream.getHealthSnapshot().retainedStreamSymbolCount).toBe(0);
    stream.destroy();
  });
});


  it("defers close while a routed socket is still CONNECTING", () => {
    const stream = new BinancePriceStream();
    stream.subscribe("BTCUSDT", () => {});
    const book = MockWebSocket.byRoute("/public/stream");
    expect(book.readyState).toBe(0);
    stream.destroy();
    expect(book._closed).toBe(false);
    book.readyState = 1;
    book.onopen?.();
    expect(book._closed).toBe(true);
  });

describe("Binance bookTicker schema integrity", () => {
  it("uses lowercase a as ask price and never uppercase A ask quantity", () => {
    const tick = parseBookTickerTick({
      e: "bookTicker",
      E: 1781656195104,
      s: "NOTUSDT",
      b: "0.0004196",
      B: "400000",
      a: "0.0004200",
      A: "852212",
    }, 1781656195104);

    expect(tick).not.toBeNull();
    expect(tick.ask).toBeCloseTo(0.00042, 12);
    expect(tick.mid).toBeCloseTo(0.0004198, 12);
    expect(tick.askQty).toBe(852212);
    expect(tick.mid).not.toBeCloseTo(426106.0002098, 3);
    expect(tick.schemaValidated).toBe(true);
    expect(tick.priceStreamSchemaVersion).toBe(BINANCE_PRICE_STREAM_SCHEMA_VERSION);
  });

  it("rejects quantity-only, crossed, and absurd-spread book data", () => {
    expect(parseBookTickerTick({ s: "NOTUSDT", b: "0.0004196", A: "852212" })).toBeNull();
    expect(parseBookTickerTick({ s: "BADUSDT", b: "10", a: "9", A: "2" })).toBeNull();
    expect(parseBookTickerTick({ s: "BADUSDT", b: "1", a: "10", A: "2" })).toBeNull();
  });

  it("parses routed aggTrade ticks as validated real-time prices", () => {
    const tick = parseAggTradeTick({ s: "VELVETUSDT", p: "0.1234", T: 5000 }, 5001);
    expect(tick.price).toBeCloseTo(0.1234);
    expect(tick.source).toBe("AGG_TRADE");
    expect(tick.schemaValidated).toBe(true);
    expect(tick.receivedAt).toBe(5001);
  });

  it("parses the all-market mark-price safety payload", () => {
    const tick = parseMarkPriceTick({ s: "VELVETUSDT", p: "0.4129", E: 6000 }, 6001);
    expect(tick.price).toBeCloseTo(0.4129);
    expect(tick.source).toBe("MARK_PRICE_1S");
    expect(tick.precision).toBe("PROTECTIVE");
    expect(tick.schemaValidated).toBe(true);
  });

  it("delivers the exact run-77 regression payload at the true market mid", async () => {
    const stream = new BinancePriceStream();
    const ticks = [];
    stream.subscribe("NOTUSDT", tick => ticks.push(tick));
    await waitOpen();

    emit(MockWebSocket.byRoute("/public/stream"), "notusdt@bookTicker", {
      e: "bookTicker",
      E: 1781656195104,
      s: "NOTUSDT",
      b: "0.0004196",
      B: "400000",
      a: "0.0004200",
      A: "852212",
    });

    expect(ticks).toHaveLength(1);
    expect(ticks[0].mid).toBeCloseTo(0.0004198, 12);
    expect(stream.getLatestPrice("NOTUSDT")).toBeCloseTo(0.0004198, 12);
    stream.destroy();
  });
});

describe("parsePriceSourcePrecision", () => {
  it("null tick → REST_POLL / COARSE", () => {
    expect(parsePriceSourcePrecision(null)).toEqual({ source: "REST_POLL", precision: "COARSE" });
  });

  it("preserves routed source metadata", () => {
    expect(parsePriceSourcePrecision({ source: "AGG_TRADE", precision: "REALTIME" }))
      .toEqual({ source: "AGG_TRADE", precision: "REALTIME" });
  });
});
