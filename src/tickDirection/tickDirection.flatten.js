const suffix = windowMs => `${windowMs / 1_000}s`;

export function flattenTickDirectionFeatures({
  canonicalFeatures,
  tradeFeatures,
  bookFeatures,
  aggressor,
  bookPressure,
  agreements,
} = {}) {
  const result = {};
  for (const count of [3, 5, 10]) {
    result[`marketTickDirection${count}`] = canonicalFeatures?.[`direction${count}`] ?? "INSUFFICIENT";
    result[`marketTickUpCount${count}`] = canonicalFeatures?.[`upCount${count}`] ?? 0;
    result[`marketTickDownCount${count}`] = canonicalFeatures?.[`downCount${count}`] ?? 0;
    result[`marketTickFlatCount${count}`] = canonicalFeatures?.[`flatCount${count}`] ?? 0;
  }
  Object.assign(result, {
    marketTickCurrentUpStreak: canonicalFeatures?.currentUpStreak ?? 0,
    marketTickCurrentDownStreak: canonicalFeatures?.currentDownStreak ?? 0,
    marketTickMaxUpStreak10: canonicalFeatures?.maxUpStreak10 ?? 0,
    marketTickMaxDownStreak10: canonicalFeatures?.maxDownStreak10 ?? 0,
    marketTickReversalCount10: canonicalFeatures?.reversalCount10 ?? 0,
    marketTickSequenceSignature10: canonicalFeatures?.sequenceSignature10 ?? "",
    marketTickRunSignature10: canonicalFeatures?.runSignature10 ?? "",
  });

  for (const windowMs of [1_000, 3_000, 5_000, 10_000, 30_000]) {
    const key = suffix(windowMs);
    const window = canonicalFeatures?.[`window${windowMs}`] ?? {};
    result[`marketTickDirection${key}`] = window.direction ?? "INSUFFICIENT";
    result[`marketTickEventCount${key}`] = window.eventCount ?? 0;
    result[`marketTickDistinctPriceCount${key}`] = window.distinctPriceCount ?? 0;
    result[`marketTickNetMoveBps${key}`] = window.netMoveBps ?? null;
    result[`marketTickGrossMoveBps${key}`] = window.grossMoveBps ?? null;
    result[`marketTickEfficiency${key}`] = window.efficiency ?? null;
    result[`marketTickUpRatio${key}`] = window.upRatio ?? null;
    result[`marketTickDownRatio${key}`] = window.downRatio ?? null;
    result[`marketTickFlatRatio${key}`] = window.flatRatio ?? null;
    result[`marketTickReversalCount${key}`] = window.reversalCount ?? null;
    result[`marketTickVelocityBpsPerSec${key}`] = window.velocity ?? null;
    result[`marketTickAccelerationBpsPerSec2_${key}`] = window.acceleration ?? null;
    result[`marketTickMeanInterArrivalMs${key}`] = window.meanInterArrivalMs ?? null;
    result[`marketTickMedianInterArrivalMs${key}`] = window.medianInterArrivalMs ?? null;
  }

  for (const windowMs of [3_000, 10_000]) {
    const key = suffix(windowMs);
    const flow = aggressor?.[windowMs] ?? {};
    result[`marketTickBuyTradeCount${key}`] = flow.buyTradeCount ?? 0;
    result[`marketTickSellTradeCount${key}`] = flow.sellTradeCount ?? 0;
    result[`marketTickBuyQuoteVolume${key}`] = flow.buyQuoteVolume ?? null;
    result[`marketTickSellQuoteVolume${key}`] = flow.sellQuoteVolume ?? null;
    result[`marketTickAggressorCountImbalance${key}`] = flow.countImbalance ?? null;
    result[`marketTickAggressorVolumeImbalance${key}`] = flow.volumeImbalance ?? null;
    result[`marketTickSignedQuoteFlow${key}`] = flow.signedQuoteFlow ?? null;
    result[`marketTickAggressorFlowLabel${key}`] = flow.label ?? "INSUFFICIENT";
  }

  Object.assign(result, {
    marketTickBookImbalanceLatest: bookPressure?.latestImbalance ?? null,
    marketTickSpreadLatestPct: bookPressure?.latestSpreadPct ?? null,
    marketTickBookPressureLabel: bookPressure?.label ?? "INSUFFICIENT",
  });
  for (const windowMs of [1_000, 3_000, 10_000]) {
    const key = suffix(windowMs);
    const book = bookPressure?.[windowMs] ?? {};
    result[`marketTickBookImbalanceMean${key}`] = book.imbalanceMean ?? null;
    result[`marketTickBookImbalanceSlope${key}`] = book.imbalanceSlope ?? null;
    result[`marketTickSpreadMean${key}`] = book.spreadMeanPct ?? null;
    result[`marketTickSpreadChangeBps${key}`] = book.spreadChangeBps ?? null;
  }

  Object.assign(result, {
    marketTickTradeDirection3s: tradeFeatures?.window3000?.direction ?? "INSUFFICIENT",
    marketTickBookDirection3s: bookFeatures?.window3000?.direction ?? "INSUFFICIENT",
    marketTickTradeBookAgreement3s: agreements?.agreement3s ?? "BOTH_INSUFFICIENT",
    marketTickTradeDirection10s: tradeFeatures?.window10000?.direction ?? "INSUFFICIENT",
    marketTickBookDirection10s: bookFeatures?.window10000?.direction ?? "INSUFFICIENT",
    marketTickTradeBookAgreement10s: agreements?.agreement10s ?? "BOTH_INSUFFICIENT",
  });
  return result;
}
