import { TICK_DIRECTION_CONFIG } from "./tickDirection.config.js";
import { TICK_DIRECTION } from "./tickDirection.types.js";

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
export const tickEventTime = event => finite(event?.eventTime ?? event?.tradeTime ?? event?.t ?? event?.receivedAt);

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function directionCode(deltaBps, flatThresholdBps) {
  if (deltaBps > flatThresholdBps) return "U";
  if (deltaBps < -flatThresholdBps) return "D";
  return "F";
}

function buildChanges(events, priceField, config) {
  const sorted = [...events]
    .map(event => ({ event, ts: tickEventTime(event), price: finite(event?.[priceField]) }))
    .filter(row => row.ts != null && row.price != null && row.price > 0)
    .sort((a, b) => a.ts - b.ts);
  const changes = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const deltaBps = ((current.price - previous.price) / previous.price) * 10_000;
    changes.push({
      fromTs: previous.ts,
      ts: current.ts,
      fromPrice: previous.price,
      price: current.price,
      deltaBps,
      code: directionCode(deltaBps, config.flatThresholdBps),
    });
  }
  return { sorted, changes };
}

function reversalCount(codes) {
  const directional = codes.filter(code => code !== "F");
  let count = 0;
  for (let i = 1; i < directional.length; i += 1) {
    if (directional[i] !== directional[i - 1]) count += 1;
  }
  return count;
}

function streaks(codes) {
  let currentCode = null;
  let currentLength = 0;
  let maxUp = 0;
  let maxDown = 0;
  const runs = [];
  for (const code of codes) {
    if (code === currentCode) currentLength += 1;
    else {
      if (currentCode) runs.push(`${currentCode}${currentLength}`);
      currentCode = code;
      currentLength = 1;
    }
    if (code === "U") maxUp = Math.max(maxUp, currentLength);
    if (code === "D") maxDown = Math.max(maxDown, currentLength);
  }
  if (currentCode) runs.push(`${currentCode}${currentLength}`);
  return {
    currentUp: currentCode === "U" ? currentLength : 0,
    currentDown: currentCode === "D" ? currentLength : 0,
    maxUp,
    maxDown,
    runSignature: runs.join(">"),
  };
}

function classifyWindow({ eventCount, distinctPriceCount, durationMs, freshnessMs, netMoveBps, efficiency, upRatio, downRatio }, config) {
  if (
    eventCount < config.minimumCanonicalEvents ||
    distinctPriceCount < config.minimumDistinctPriceChanges ||
    durationMs < config.minimumWindowDurationMs ||
    freshnessMs > config.staleAfterMs
  ) return TICK_DIRECTION.INSUFFICIENT;
  if (Math.abs(netMoveBps) < config.flatThresholdBps) return TICK_DIRECTION.FLAT;
  if (netMoveBps > 0 && efficiency >= config.cleanDirectionEfficiencyMin && upRatio >= config.cleanDirectionDominanceMin) {
    return TICK_DIRECTION.UP;
  }
  if (netMoveBps < 0 && efficiency >= config.cleanDirectionEfficiencyMin && downRatio >= config.cleanDirectionDominanceMin) {
    return TICK_DIRECTION.DOWN;
  }
  return TICK_DIRECTION.MIXED;
}

function summarizeRows(rows, entryTime, config) {
  const eventCount = rows.length;
  const prices = rows.map(row => row.price);
  const distinctPriceCount = new Set(prices).size;
  const durationMs = eventCount >= 2 ? rows[eventCount - 1].ts - rows[0].ts : 0;
  const freshnessMs = eventCount ? Math.max(0, entryTime - rows[eventCount - 1].ts) : Number.POSITIVE_INFINITY;
  const localChanges = [];
  for (let i = 1; i < rows.length; i += 1) {
    const deltaBps = ((rows[i].price - rows[i - 1].price) / rows[i - 1].price) * 10_000;
    localChanges.push({ deltaBps, code: directionCode(deltaBps, config.flatThresholdBps), ts: rows[i].ts });
  }
  const netMoveBps = eventCount >= 2 ? ((prices.at(-1) - prices[0]) / prices[0]) * 10_000 : 0;
  const grossMoveBps = localChanges.reduce((sum, change) => sum + Math.abs(change.deltaBps), 0);
  const efficiency = grossMoveBps > 0 ? Math.abs(netMoveBps) / grossMoveBps : 0;
  const upCount = localChanges.filter(change => change.code === "U").length;
  const downCount = localChanges.filter(change => change.code === "D").length;
  const flatCount = localChanges.length - upCount - downCount;
  const denominator = localChanges.length || 1;
  const elapsedSeconds = durationMs / 1_000;
  const velocity = elapsedSeconds > 0 ? netMoveBps / elapsedSeconds : null;
  const midTs = eventCount >= 2 ? rows[0].ts + durationMs / 2 : null;
  const firstHalf = midTs == null ? [] : rows.filter(row => row.ts <= midTs);
  const secondHalf = midTs == null ? [] : rows.filter(row => row.ts >= midTs);
  const halfVelocity = half => {
    if (half.length < 2) return null;
    const seconds = (half.at(-1).ts - half[0].ts) / 1_000;
    return seconds >= config.minimumWindowDurationMs / 2_000
      ? (((half.at(-1).price - half[0].price) / half[0].price) * 10_000) / seconds
      : null;
  };
  const firstHalfVelocity = halfVelocity(firstHalf);
  const secondHalfVelocity = halfVelocity(secondHalf);
  const acceleration = firstHalfVelocity != null && secondHalfVelocity != null
    ? secondHalfVelocity - firstHalfVelocity
    : null;
  const interArrival = rows.slice(1).map((row, index) => row.ts - rows[index].ts).filter(value => value >= 0);
  const base = {
    eventCount,
    distinctPriceCount,
    durationMs,
    freshnessMs,
    netMoveBps,
    grossMoveBps,
    efficiency,
    upRatio: upCount / denominator,
    downRatio: downCount / denominator,
    flatRatio: flatCount / denominator,
    reversalCount: reversalCount(localChanges.map(change => change.code)),
    velocity,
    acceleration,
    firstHalfVelocity,
    secondHalfVelocity,
    firstHalfNetMoveBps: firstHalf.length >= 2
      ? ((firstHalf.at(-1).price - firstHalf[0].price) / firstHalf[0].price) * 10_000
      : null,
    secondHalfNetMoveBps: secondHalf.length >= 2
      ? ((secondHalf.at(-1).price - secondHalf[0].price) / secondHalf[0].price) * 10_000
      : null,
    meanInterArrivalMs: interArrival.length
      ? interArrival.reduce((sum, value) => sum + value, 0) / interArrival.length
      : null,
    medianInterArrivalMs: median(interArrival),
  };
  return {
    ...Object.fromEntries(Object.entries(base).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
    direction: classifyWindow(base, config),
  };
}

export function computeDirectionalFeatures(events, {
  entryTime,
  priceField = "price",
  config = TICK_DIRECTION_CONFIG,
} = {}) {
  const resolved = { ...TICK_DIRECTION_CONFIG, ...config };
  const { sorted, changes } = buildChanges(events, priceField, resolved);
  const output = { eventCountTotal: sorted.length, distinctPriceCountTotal: new Set(sorted.map(row => row.price)).size };

  for (const count of resolved.countWindows) {
    const recent = changes.slice(-count);
    const codes = recent.map(change => change.code);
    const up = codes.filter(code => code === "U").length;
    const down = codes.filter(code => code === "D").length;
    const flat = codes.length - up - down;
    const net = recent.reduce((sum, change) => sum + change.deltaBps, 0);
    const gross = recent.reduce((sum, change) => sum + Math.abs(change.deltaBps), 0);
    const efficiency = gross > 0 ? Math.abs(net) / gross : 0;
    const denominator = recent.length || 1;
    let direction = TICK_DIRECTION.INSUFFICIENT;
    if (recent.length >= count) {
      if (Math.abs(net) < resolved.flatThresholdBps) direction = TICK_DIRECTION.FLAT;
      else if (net > 0 && efficiency >= resolved.cleanDirectionEfficiencyMin && up / denominator >= resolved.cleanDirectionDominanceMin) direction = TICK_DIRECTION.UP;
      else if (net < 0 && efficiency >= resolved.cleanDirectionEfficiencyMin && down / denominator >= resolved.cleanDirectionDominanceMin) direction = TICK_DIRECTION.DOWN;
      else direction = TICK_DIRECTION.MIXED;
    }
    output[`direction${count}`] = direction;
    output[`upCount${count}`] = up;
    output[`downCount${count}`] = down;
    output[`flatCount${count}`] = flat;
  }

  const last10 = changes.slice(-10).map(change => change.code);
  const run = streaks(last10);
  output.currentUpStreak = run.currentUp;
  output.currentDownStreak = run.currentDown;
  output.maxUpStreak10 = run.maxUp;
  output.maxDownStreak10 = run.maxDown;
  output.reversalCount10 = reversalCount(last10);
  output.sequenceSignature10 = last10.join("");
  output.runSignature10 = run.runSignature;

  for (const windowMs of resolved.timeWindowsMs) {
    const start = entryTime - windowMs;
    const rows = sorted.filter(row => row.ts >= start && row.ts <= entryTime);
    output[`window${windowMs}`] = summarizeRows(rows, entryTime, resolved);
  }
  return output;
}

export function computeAggressorFlowFeatures(trades, entryTime, config = TICK_DIRECTION_CONFIG) {
  const result = {};
  for (const windowMs of [3_000, 10_000]) {
    const rows = trades.filter(event => {
      const ts = tickEventTime(event);
      return ts != null && ts >= entryTime - windowMs && ts <= entryTime;
    });
    const buys = rows.filter(row => row.aggressorSide === "BUY");
    const sells = rows.filter(row => row.aggressorSide === "SELL");
    const buyQuote = buys.reduce((sum, row) => sum + Number(row.quoteQuantity ?? 0), 0);
    const sellQuote = sells.reduce((sum, row) => sum + Number(row.quoteQuantity ?? 0), 0);
    const totalCount = buys.length + sells.length;
    const totalQuote = buyQuote + sellQuote;
    const countImbalance = totalCount ? (buys.length - sells.length) / totalCount : null;
    const volumeImbalance = totalQuote > 0 ? (buyQuote - sellQuote) / totalQuote : null;
    let label = "INSUFFICIENT";
    if (totalCount >= config.minimumCanonicalEvents) {
      if (volumeImbalance >= 0.6) label = "STRONG_BUY";
      else if (volumeImbalance >= 0.2) label = "BUY";
      else if (volumeImbalance <= -0.6) label = "STRONG_SELL";
      else if (volumeImbalance <= -0.2) label = "SELL";
      else label = "NEUTRAL";
    }
    result[windowMs] = {
      buyTradeCount: buys.length,
      sellTradeCount: sells.length,
      buyQuoteVolume: round(buyQuote),
      sellQuoteVolume: round(sellQuote),
      countImbalance: round(countImbalance),
      volumeImbalance: round(volumeImbalance),
      signedQuoteFlow: round(buyQuote - sellQuote),
      label,
    };
  }
  return result;
}

function linearSlope(points) {
  if (points.length < 2) return null;
  const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const yMean = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  return denominator > 0 ? numerator / denominator : null;
}

export function computeBookPressureFeatures(books, entryTime) {
  const sorted = [...books].filter(event => tickEventTime(event) != null).sort((a, b) => tickEventTime(a) - tickEventTime(b));
  const latest = sorted.at(-1) ?? null;
  const result = {
    latestImbalance: finite(latest?.bookImbalance),
    latestSpreadPct: finite(latest?.spreadPct),
  };
  for (const windowMs of [1_000, 3_000, 10_000]) {
    const rows = sorted.filter(event => tickEventTime(event) >= entryTime - windowMs && tickEventTime(event) <= entryTime);
    const imbalances = rows.map(row => finite(row.bookImbalance)).filter(value => value != null);
    const spreads = rows.map(row => finite(row.spreadPct)).filter(value => value != null);
    result[windowMs] = {
      imbalanceMean: imbalances.length ? round(imbalances.reduce((sum, value) => sum + value, 0) / imbalances.length) : null,
      imbalanceSlope: round(linearSlope(rows
        .map(row => ({ x: (tickEventTime(row) - (entryTime - windowMs)) / 1_000, y: finite(row.bookImbalance) }))
        .filter(point => point.y != null))),
      spreadMeanPct: spreads.length ? round(spreads.reduce((sum, value) => sum + value, 0) / spreads.length) : null,
      spreadChangeBps: spreads.length >= 2 ? round((spreads.at(-1) - spreads[0]) * 100) : null,
    };
  }
  const mean3 = result[3_000].imbalanceMean;
  result.label = mean3 == null ? "INSUFFICIENT"
    : mean3 >= 0.35 ? "STRONG_BID_PRESSURE"
      : mean3 >= 0.1 ? "BID_PRESSURE"
        : mean3 <= -0.35 ? "STRONG_ASK_PRESSURE"
          : mean3 <= -0.1 ? "ASK_PRESSURE"
            : "NEUTRAL";
  return result;
}

export function directionAgreement(tradeDirection, bookDirection) {
  const usable = direction => direction === TICK_DIRECTION.UP || direction === TICK_DIRECTION.DOWN;
  if (!usable(tradeDirection) && !usable(bookDirection)) return "BOTH_INSUFFICIENT";
  if (!usable(tradeDirection) || !usable(bookDirection)) return "ONE_SOURCE_ONLY";
  if (tradeDirection === bookDirection) return tradeDirection === TICK_DIRECTION.UP ? "AGREE_UP" : "AGREE_DOWN";
  return "DISAGREE";
}

export function normalizeSigned(value, scale) {
  if (!Number.isFinite(Number(value)) || !scale) return 0;
  return clamp(Number(value) / scale, -1, 1);
}
