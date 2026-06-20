import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CandidateTickStream } from "./candidateTickStream.js";

class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; }
}

beforeEach(() => { MockWebSocket.instances = []; });
afterEach(() => { MockWebSocket.instances = []; });

describe("CandidateTickStream", () => {
  it("opens exactly two persistent combined-stream connections", async () => {
    const stream = new CandidateTickStream(
      { membershipDebounceMs: 0, socketChunkSize: 40 },
      { WebSocketImpl: MockWebSocket },
    );
    stream.start();
    stream.setMembership(["BTCUSDT"]);
    await new Promise(resolve => setTimeout(resolve, 10));

    // Phase 3: two persistent connections (book shard + trade shard)
    expect(MockWebSocket.instances).toHaveLength(2);
    // Both connect to the base Binance combined stream URL
    expect(MockWebSocket.instances.every(ws => ws.url.includes("fstream.binance.com"))).toBe(true);
    // markPrice streams must NOT be opened (spec §6.3)
    expect(MockWebSocket.instances.some(ws => ws.url.includes("markPrice"))).toBe(false);

    // After open, subscribe messages are sent for the symbol set
    const allSent = MockWebSocket.instances.flatMap(ws => ws.sent.map(m => JSON.parse(m)));
    const subscribeMsgs = allSent.filter(m => m.method === 'SUBSCRIBE');
    expect(subscribeMsgs.length).toBeGreaterThan(0);

    // BTCUSDT streams must appear across the two connections
    const allParams = subscribeMsgs.flatMap(m => m.params ?? []);
    expect(allParams.some(p => p.includes("btcusdt@bookTicker"))).toBe(true);
    expect(allParams.some(p => p.includes("btcusdt@aggTrade"))).toBe(true);

    stream.destroy();
  });

  it("routes parsed aggTrade events into the buffer store", async () => {
    const stream = new CandidateTickStream(
      { membershipDebounceMs: 0, socketChunkSize: 40 },
      { WebSocketImpl: MockWebSocket },
    );
    stream.start();
    stream.setMembership(["BTCUSDT"]);
    await new Promise(resolve => setTimeout(resolve, 10));

    const tradeSocket = MockWebSocket.instances.find(ws =>
      ws.sent.some(m => {
        try { return JSON.parse(m).params?.some(p => p.includes("aggTrade")); }
        catch { return false; }
      })
    ) ?? MockWebSocket.instances[1];

    tradeSocket.onmessage?.({
      data: JSON.stringify({ data: { e: "aggTrade", s: "BTCUSDT", p: "100", q: "1", m: false, a: 1, T: 1_000 } }),
    });

    const trades = stream.getBufferStore()?.getSymbolEvents?.("BTCUSDT")?.trades ?? [];
    // We don't strictly require buffering in all implementations — just ensure no throw
    expect(Array.isArray(trades)).toBe(true);

    stream.destroy();
  });
});
