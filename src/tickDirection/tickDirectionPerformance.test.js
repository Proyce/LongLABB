import { describe, expect, it } from "vitest";
import { TickDirectionBufferStore } from "./tickDirectionBuffer.js";
import { captureTickDirectionSnapshot } from "./tickDirectionSnapshot.js";
import { buildTickDirectionOutcomeDefaults } from "./tickDirectionOutcomeAudit.js";
import { compactLongTradeForRuntime } from "../telemetry/telemetryCompaction.js";

describe("tick direction bounded-ingest performance", () => {
  it("ingests 250,000 events across 80 symbols without unbounded growth", () => {
    const capacity = 64;
    const store = new TickDirectionBufferStore({
      maxEventsPerSymbolPerSource: capacity,
      maxEventAgeMs: 1_000_000,
    });
    const started = Date.now();
    for (let index = 0; index < 250_000; index += 1) {
      const symbolIndex = index % 80;
      const sequence = Math.floor(index / 80);
      store.addTrade({
        symbol: `S${symbolIndex}USDT`,
        aggregateTradeId: index,
        price: 100 + sequence / 10_000,
        eventTime: sequence,
        receivedAt: sequence,
      });
    }
    for (let symbolIndex = 0; symbolIndex < 80; symbolIndex += 1) {
      expect(store.getSymbolEvents(`S${symbolIndex}USDT`).trades.length).toBeLessThanOrEqual(capacity);
    }
    expect(store.symbols.size).toBe(80);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 20_000);

  it("keeps full and compact per-trade tick telemetry within bounded budgets", () => {
    const store = new TickDirectionBufferStore();
    for (let index = 0; index < 60; index += 1) {
      const eventTime = 100_000 + index * 400;
      const price = 100 + index * 0.01;
      store.addTrade({
        symbol: "BTCUSDT", price, quantity: 1, quoteQuantity: price,
        aggressorSide: "BUY", aggregateTradeId: index,
        eventTime, tradeTime: eventTime, receivedAt: eventTime,
      });
      store.addBook({
        symbol: "BTCUSDT", bid: price - 0.01, ask: price + 0.01, mid: price,
        bidQty: 2, askQty: 1, bookImbalance: 1 / 3, spreadPct: 0.02,
        updateId: index, eventTime, receivedAt: eventTime,
      });
    }
    const base = { id: 1, symbol: "BTCUSDT", entryTime: 123_600, entryPrice: 100.59 };
    const snapshot = captureTickDirectionSnapshot({
      ...base, atrPct: 1.2, bufferStore: store, streamHealthy: true,
    });
    const full = {
      ...base,
      ...snapshot,
      ...buildTickDirectionOutcomeDefaults({ entrySpreadPct: snapshot.entryTickSpreadPctObserved }),
    };
    const compact = compactLongTradeForRuntime(full);
    const baseBytes = Buffer.byteLength(JSON.stringify(base));
    expect(Buffer.byteLength(JSON.stringify(full)) - baseBytes).toBeLessThan(8 * 1_024);
    expect(Buffer.byteLength(JSON.stringify(compact)) - baseBytes).toBeLessThan(2 * 1_024);
  });
});
