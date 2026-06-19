import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CandidateTickStream } from "./candidateTickStream.js";

class MockWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  close() { this.readyState = 3; }
}

beforeEach(() => { MockWebSocket.instances = []; });
afterEach(() => { MockWebSocket.instances = []; });

describe("CandidateTickStream", () => {
  it("opens isolated book/trade sockets only and buffers parsed ticks", async () => {
    const stream = new CandidateTickStream(
      { membershipDebounceMs: 0, socketChunkSize: 40 },
      { WebSocketImpl: MockWebSocket },
    );
    stream.start();
    stream.setMembership(["BTCUSDT"]);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances.some(ws => ws.url.includes("@bookTicker"))).toBe(true);
    expect(MockWebSocket.instances.some(ws => ws.url.includes("@aggTrade"))).toBe(true);
    expect(MockWebSocket.instances.some(ws => ws.url.includes("markPrice"))).toBe(false);

    const tradeSocket = MockWebSocket.instances.find(ws => ws.url.includes("@aggTrade"));
    tradeSocket.onmessage?.({
      data: JSON.stringify({ data: { s: "BTCUSDT", p: "100", q: "1", m: false, a: 1, T: 1_000 } }),
    });
    expect(stream.getBufferStore().getSymbolEvents("BTCUSDT").trades).toHaveLength(1);
    stream.destroy();
  });
});
