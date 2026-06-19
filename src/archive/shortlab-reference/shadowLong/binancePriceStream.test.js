import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BinancePriceStream, parsePriceSourcePrecision } from "./binancePriceStream.js";

// ─── WebSocket mock ───────────────────────────────────────────────────────────

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onmessage  = null;
    this.onopen     = null;
    this.onclose    = null;
    this.onerror    = null;
    this._closed    = false;
    MockWebSocket._instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send() {}
  close() {
    this._closed    = true;
    this.readyState = 3;
  }
  static _instances = [];
  static reset() { MockWebSocket._instances = []; }
  static last() { return MockWebSocket._instances[MockWebSocket._instances.length - 1]; }
}

beforeEach(() => {
  MockWebSocket.reset();
  global.WebSocket = MockWebSocket;
});

afterEach(() => {
  delete global.WebSocket;
});

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe("BinancePriceStream subscribe / unsubscribe", () => {
  it("creates WebSocket on first subscribe", () => {
    const stream = new BinancePriceStream();
    stream.subscribe("BTCUSDT", () => {});
    expect(MockWebSocket._instances.length).toBeGreaterThan(0);
    stream.destroy();
  });

  it("delivers bookTicker tick to subscriber", async () => {
    const stream = new BinancePriceStream();
    const ticks  = [];
    stream.subscribe("SOLUSDT", t => ticks.push(t));

    await new Promise(r => setTimeout(r, 10));
    const ws = MockWebSocket.last();

    ws.onmessage?.({
      data: JSON.stringify({
        stream: "solusdt@bookTicker",
        data:   { s: "SOLUSDT", b: "99.5", A: "100.5" },
      }),
    });

    expect(ticks).toHaveLength(1);
    expect(ticks[0].source).toBe("BOOK_TICKER");
    expect(ticks[0].bid).toBeCloseTo(99.5);
    expect(ticks[0].ask).toBeCloseTo(100.5);
    stream.destroy();
  });

  it("delivers aggTrade tick when no bookTicker present", async () => {
    const stream = new BinancePriceStream();
    const ticks  = [];
    stream.subscribe("XRPUSDT", t => ticks.push(t));

    await new Promise(r => setTimeout(r, 10));
    const ws = MockWebSocket.last();

    ws.onmessage?.({
      data: JSON.stringify({
        stream: "xrpusdt@aggTrade",
        data:   { s: "XRPUSDT", p: "0.55", T: Date.now() },
      }),
    });

    expect(ticks).toHaveLength(1);
    expect(ticks[0].source).toBe("AGG_TRADE");
    stream.destroy();
  });

  it("unsubscribe removes callback", async () => {
    const stream = new BinancePriceStream();
    const ticks  = [];
    const cb = t => ticks.push(t);
    stream.subscribe("ETHUSDT", cb);
    stream.unsubscribe("ETHUSDT", cb);

    await new Promise(r => setTimeout(r, 10));
    const ws = MockWebSocket.last();
    ws?.onmessage?.({
      data: JSON.stringify({
        stream: "ethusdt@bookTicker",
        data:   { s: "ETHUSDT", b: "2000", A: "2001" },
      }),
    });

    expect(ticks).toHaveLength(0);
    stream.destroy();
  });
});

describe("BinancePriceStream getLatestPrice / getLatestBook", () => {
  it("getLatestBook returns null before any tick", () => {
    const stream = new BinancePriceStream();
    expect(stream.getLatestBook("BTCUSDT")).toBeNull();
    stream.destroy();
  });

  it("getLatestPrice returns mid-price after bookTicker tick", async () => {
    const stream = new BinancePriceStream();
    stream.subscribe("BTCUSDT", () => {});

    await new Promise(r => setTimeout(r, 10));
    const ws = MockWebSocket.last();
    ws.onmessage?.({
      data: JSON.stringify({
        stream: "btcusdt@bookTicker",
        data:   { s: "BTCUSDT", b: "50000", A: "50010" },
      }),
    });

    const price = stream.getLatestPrice("BTCUSDT");
    expect(price).toBeCloseTo(50005);
    stream.destroy();
  });
});

describe("parsePriceSourcePrecision", () => {
  it("null tick → REST_POLL / COARSE", () => {
    const r = parsePriceSourcePrecision(null);
    expect(r.source).toBe("REST_POLL");
    expect(r.precision).toBe("COARSE");
  });

  it("bookTicker tick → BOOK_TICKER / REALTIME", () => {
    const r = parsePriceSourcePrecision({ source: "BOOK_TICKER", precision: "REALTIME" });
    expect(r.source).toBe("BOOK_TICKER");
    expect(r.precision).toBe("REALTIME");
  });
});
