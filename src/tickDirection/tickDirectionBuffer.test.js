import { describe, expect, it } from "vitest";
import { TickDirectionBufferStore } from "./tickDirectionBuffer.js";

function trade(symbol, id, eventTime, price = 100) {
  return { symbol, aggregateTradeId: id, eventTime, receivedAt: eventTime, price, source: "AGG_TRADE" };
}

describe("TickDirectionBufferStore", () => {
  it("deduplicates, sorts out-of-order events, and remains bounded", () => {
    const store = new TickDirectionBufferStore({ maxEventsPerSymbolPerSource: 3, maxEventAgeMs: 1_000 });
    expect(store.addTrade(trade("BTCUSDT", 2, 200))).toBe(true);
    expect(store.addTrade(trade("BTCUSDT", 1, 100))).toBe(true);
    expect(store.addTrade(trade("BTCUSDT", 2, 200))).toBe(false);
    store.addTrade(trade("BTCUSDT", 3, 300));
    store.addTrade(trade("BTCUSDT", 4, 400));
    const result = store.getSymbolEvents("BTCUSDT");
    expect(result.trades.map(row => row.aggregateTradeId)).toEqual([2, 3, 4]);
    expect(result.counters.duplicates).toBe(1);
    expect(result.counters.outOfOrder).toBe(1);
    expect(result.counters.dropped).toBe(1);
  });

  it("keeps symbols isolated and prunes by age", () => {
    const store = new TickDirectionBufferStore({ maxEventAgeMs: 100, membershipGraceMs: 10 });
    store.addTrade(trade("BTCUSDT", 1, 100));
    store.addTrade(trade("ETHUSDT", 2, 250));
    store.prune(300);
    expect(store.getSymbolEvents("BTCUSDT").trades).toHaveLength(0);
    expect(store.getSymbolEvents("ETHUSDT").trades).toHaveLength(1);
  });
});
