// Shared Binance USD-M Futures tick parsers.
// These parsers are intentionally execution-neutral and are used by both the
// open-position lifecycle stream and the isolated tick-direction observatory.

export const BINANCE_FUTURES_TICK_SCHEMA_VERSION =
  "BINANCE_FUTURES_TICK_V1_2026_06";
export const MAX_REASONABLE_BOOK_SPREAD_PCT = 20;

const finitePositive = value => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const finiteIntegerOrNull = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const upperSymbol = value => String(value ?? "").trim().toUpperCase();

export function parseBookTickerTick(data, observedAt = Date.now()) {
  const symbol = upperSymbol(data?.s);
  if (!symbol) return null;

  const bid = finitePositive(data?.b);
  const ask = finitePositive(data?.a);
  if (bid == null || ask == null || ask < bid) return null;

  const mid = (bid + ask) / 2;
  const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(spreadPct) || spreadPct > MAX_REASONABLE_BOOK_SPREAD_PCT) return null;

  const bidQty = finitePositive(data?.B);
  const askQty = finitePositive(data?.A);
  const depth = (bidQty ?? 0) + (askQty ?? 0);
  const bookImbalance = bidQty != null && askQty != null && depth > 0
    ? (bidQty - askQty) / depth
    : null;
  const rawEventTime = finiteIntegerOrNull(data?.E);
  const eventTime = rawEventTime ?? observedAt;

  return Object.freeze({
    symbol,
    bid,
    ask,
    mid,
    price: mid,
    bidQty,
    askQty,
    spreadPct,
    bookImbalance,
    updateId: finiteIntegerOrNull(data?.u),
    eventTime,
    receivedAt: observedAt,
    timestampBasis: rawEventTime == null ? "RECEIVED_AT_FALLBACK" : "EXCHANGE_EVENT_TIME",
    source: "BOOK_TICKER",
    precision: "REALTIME",
    schemaValidated: true,
    priceFieldMap: "b=bidPrice,a=askPrice,B=bidQty,A=askQty",
    priceStreamSchemaVersion: BINANCE_FUTURES_TICK_SCHEMA_VERSION,
    t: eventTime,
  });
}

export function parseAggTradeTick(data, observedAt = Date.now()) {
  const symbol = upperSymbol(data?.s);
  const price = finitePositive(data?.p);
  if (!symbol || price == null) return null;

  const quantity = finitePositive(data?.q);
  const rawEventTime = finiteIntegerOrNull(data?.E);
  const rawTradeTime = finiteIntegerOrNull(data?.T);
  const eventTime = rawEventTime ?? rawTradeTime ?? observedAt;
  const tradeTime = rawTradeTime ?? rawEventTime ?? observedAt;
  const buyerIsMaker = typeof data?.m === "boolean" ? data.m : null;

  return Object.freeze({
    symbol,
    price,
    quantity,
    quoteQuantity: quantity == null ? null : price * quantity,
    buyerIsMaker,
    aggressorSide: buyerIsMaker == null ? null : buyerIsMaker ? "SELL" : "BUY",
    aggregateTradeId: finiteIntegerOrNull(data?.a),
    firstTradeId: finiteIntegerOrNull(data?.f),
    lastTradeId: finiteIntegerOrNull(data?.l),
    eventTime,
    tradeTime,
    receivedAt: observedAt,
    timestampBasis: rawTradeTime != null || rawEventTime != null
      ? "EXCHANGE_EVENT_TIME"
      : "RECEIVED_AT_FALLBACK",
    source: "AGG_TRADE",
    precision: "REALTIME",
    schemaValidated: true,
    priceStreamSchemaVersion: BINANCE_FUTURES_TICK_SCHEMA_VERSION,
    t: tradeTime,
  });
}

export function parseMarkPriceTick(data, observedAt = Date.now()) {
  const symbol = upperSymbol(data?.s);
  const price = finitePositive(data?.p);
  if (!symbol || price == null) return null;
  const rawEventTime = finiteIntegerOrNull(data?.E);
  const eventTime = rawEventTime ?? observedAt;
  return Object.freeze({
    symbol,
    price,
    eventTime,
    receivedAt: observedAt,
    timestampBasis: rawEventTime == null ? "RECEIVED_AT_FALLBACK" : "EXCHANGE_EVENT_TIME",
    source: "MARK_PRICE_1S",
    precision: "PROTECTIVE",
    schemaValidated: true,
    priceStreamSchemaVersion: BINANCE_FUTURES_TICK_SCHEMA_VERSION,
    t: eventTime,
  });
}
