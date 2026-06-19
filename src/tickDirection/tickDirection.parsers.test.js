import { describe, expect, it } from "vitest";
import { parseAggTradeTick, parseBookTickerTick } from "./tickDirection.parsers.js";

describe("tick direction parsers", () => {
  it("retains aggressor identity, quantity, quote volume, and IDs", () => {
    const buy = parseAggTradeTick({
      s: "BTCUSDT", p: "100", q: "2.5", m: false,
      a: 11, f: 20, l: 22, E: 1_000, T: 999,
    }, 1_005);
    expect(buy).toMatchObject({
      symbol: "BTCUSDT",
      price: 100,
      quantity: 2.5,
      quoteQuantity: 250,
      buyerIsMaker: false,
      aggressorSide: "BUY",
      aggregateTradeId: 11,
      firstTradeId: 20,
      lastTradeId: 22,
      eventTime: 1_000,
      tradeTime: 999,
      receivedAt: 1_005,
    });
    expect(parseAggTradeTick({ s: "BTCUSDT", p: "100", q: "1", m: true })?.aggressorSide).toBe("SELL");
  });

  it("retains book pressure and rejects malformed spreads", () => {
    const tick = parseBookTickerTick({
      s: "ETHUSDT", b: "99", a: "101", B: "3", A: "1", u: 7, E: 500,
    }, 510);
    expect(tick.mid).toBe(100);
    expect(tick.bookImbalance).toBe(0.5);
    expect(tick.updateId).toBe(7);
    expect(parseBookTickerTick({ s: "ETHUSDT", b: "101", a: "99" })).toBeNull();
  });
});
