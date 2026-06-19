import { describe, expect, it } from "vitest";
import { TickDirectionBufferStore } from "./tickDirectionBuffer.js";
import { captureTickDirectionSnapshot } from "./tickDirectionSnapshot.js";

function addSeries(store, symbol, prices, start, step, source) {
  prices.forEach((price, index) => {
    const eventTime = start + index * step;
    if (source === "trade") {
      store.addTrade({
        symbol, price, quantity: 1, quoteQuantity: price,
        aggressorSide: "BUY", aggregateTradeId: index + 1,
        eventTime, tradeTime: eventTime, receivedAt: eventTime,
      });
    } else {
      store.addBook({
        symbol, bid: price - 0.01, ask: price + 0.01, mid: price,
        bidQty: 2, askQty: 1, bookImbalance: 1 / 3, spreadPct: 0.02,
        updateId: index + 1, eventTime, receivedAt: eventTime,
      });
    }
  });
}

describe("captureTickDirectionSnapshot", () => {
  it("prefers adequate aggTrade coverage and excludes future events forever", () => {
    const store = new TickDirectionBufferStore();
    addSeries(store, "BTCUSDT", [100, 100.1, 100.2, 100.4, 100.7], 1_000, 500, "trade");
    addSeries(store, "BTCUSDT", [100, 100.05, 100.1, 100.2, 100.3], 1_000, 500, "book");
    store.addTrade({
      symbol: "BTCUSDT", price: 90, aggregateTradeId: 99,
      eventTime: 4_000, tradeTime: 4_000, receivedAt: 4_000,
    });
    const snapshot = captureTickDirectionSnapshot({
      symbol: "BTCUSDT", entryTime: 3_000, entryPrice: 100.7,
      atrPct: 1.2, bufferStore: store, streamHealthy: true,
    });
    expect(snapshot.entryTickCanonicalSource).toBe("AGG_TRADE");
    expect(snapshot.entryTickNewestEventAt).toBe(3_000);
    expect(snapshot.marketTickDirectionVerdict).toMatch(/UP/);
    expect(snapshot.logOnly).toBe(true);
    const frozen = JSON.stringify(snapshot);
    store.addTrade({ symbol: "BTCUSDT", price: 50, aggregateTradeId: 100, eventTime: 5_000, receivedAt: 5_000 });
    expect(JSON.stringify(snapshot)).toBe(frozen);
  });

  it("returns an explicit insufficient snapshot without blocking", () => {
    const snapshot = captureTickDirectionSnapshot({
      symbol: "EMPTYUSDT", entryTime: 10_000, entryPrice: 1,
      bufferStore: new TickDirectionBufferStore(),
    });
    expect(snapshot.entryTickDataQuality).toBe("INSUFFICIENT");
    expect(snapshot.marketTickPrimaryPattern).toBe("TICK_INSUFFICIENT");
    expect(snapshot.marketTickCanAffectExecution).toBe(false);
  });
});
