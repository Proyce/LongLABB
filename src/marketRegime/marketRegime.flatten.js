// Flatten market regime snapshot to trade-level fields for CSV/JSON export

function pipeSep(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr.map(x => String(x).replace(/\|/g, " ")).join("|");
}

export function flattenMarketRegimeSnapshot(snapshot) {
  if (!snapshot) return MARKET_REGIME_DEFAULTS;

  const btc = snapshot.btc;
  const eth = snapshot.eth;
  const cross = snapshot.crossMarket;
  const breadth = snapshot.breadth;

  return {
    // Snapshot identity
    marketSnapshotId:          snapshot.snapshotId ?? null,
    marketRegimeVersion:       snapshot.version ?? null,
    marketContextComputedAt:   snapshot.computedAt ?? null,
    marketContextAgeMs:        snapshot.ageMs ?? null,
    marketContextFreshness:    snapshot.freshnessLabel ?? "UNKNOWN",
    marketContextCoveragePct:  snapshot.coveragePct ?? null,

    // BTC
    btcMicroDirectionScore:    btc?.microDirectionScore ?? null,
    btcMicroDirectionLabel:    btc?.microDirectionLabel ?? "UNKNOWN",
    btcTacticalDirectionScore: btc?.tacticalDirectionScore ?? null,
    btcTacticalDirectionLabel: btc?.tacticalDirectionLabel ?? "UNKNOWN",
    btcStructuralDirectionScore: btc?.structuralDirectionScore ?? null,
    btcStructuralDirectionLabel: btc?.structuralDirectionLabel ?? "UNKNOWN",
    btcTrendLabel:             btc?.trendState ?? "UNKNOWN",
    btcMomentumPhase:          btc?.momentumPhase ?? "UNKNOWN",
    btcRegime:                 btc?.regime ?? "UNKNOWN",
    btcVolatilityState:        btc?.volatilityState ?? "UNKNOWN",
    btcStructure15m:           btc?.structure15m ?? "UNKNOWN",
    btcStructure1h:            btc?.structure1h ?? "UNKNOWN",
    btcShortTailwindComponent: cross?._contributions?.btcShortRaw ?? null,

    // ETH
    ethMicroDirectionScore:    eth?.microDirectionScore ?? null,
    ethMicroDirectionLabel:    eth?.microDirectionLabel ?? "UNKNOWN",
    ethTacticalDirectionScore: eth?.tacticalDirectionScore ?? null,
    ethTacticalDirectionLabel: eth?.tacticalDirectionLabel ?? "UNKNOWN",
    ethStructuralDirectionScore: eth?.structuralDirectionScore ?? null,
    ethStructuralDirectionLabel: eth?.structuralDirectionLabel ?? "UNKNOWN",
    ethTrendLabel:             eth?.trendState ?? "UNKNOWN",
    ethMomentumPhase:          eth?.momentumPhase ?? "UNKNOWN",
    ethRegime:                 eth?.regime ?? "UNKNOWN",
    ethVolatilityState:        eth?.volatilityState ?? "UNKNOWN",
    ethStructure15m:           eth?.structure15m ?? "UNKNOWN",
    ethStructure1h:            eth?.structure1h ?? "UNKNOWN",
    ethShortTailwindComponent: cross?._contributions?.ethShortRaw ?? null,

    // Cross-market
    btcEthAlignmentLabel:          cross?.btcEthAlignmentLabel ?? "UNKNOWN",
    crossMarketShortTailwindScore: cross?.crossMarketShortTailwindScore ?? null,
    crossMarketShortBiasLabel:     cross?.crossMarketShortBiasLabel ?? "UNKNOWN",
    crossMarketLongTailwindScore:  cross?.crossMarketLongTailwindScore ?? null,
    crossMarketLongBiasLabel:      cross?.crossMarketLongBiasLabel ?? "UNKNOWN",
    marketConflictFlags:           cross?.marketConflictFlags ?? [],

    // Breadth
    breadthValidSymbolCount: breadth?.validSymbolCount ?? null,
    breadthBearishPct:       breadth?.pctRed15m ?? null,
    breadthDirectionScore:   breadth?.breadthDirectionScore ?? null,
    breadthLabel:            breadth?.breadthLabel ?? "BREADTH_STALE",
    breadthWarnings:         breadth?.warnings ?? [],

    // Backward compat aliases
    btcShortBias:         cross?.crossMarketShortBiasLabel ?? "UNKNOWN",
    btcShortTailwindScore: cross?.crossMarketShortTailwindScore ?? null,
    btcLongTailwindScore:  cross?.crossMarketLongTailwindScore ?? null,

    // Nested snapshots (for JSON export)
    marketContextAtEntry: snapshot,
  };
}

export const MARKET_REGIME_DEFAULTS = {
  marketSnapshotId:          null,
  marketRegimeVersion:       null,
  marketContextComputedAt:   null,
  marketContextAgeMs:        null,
  marketContextFreshness:    "UNKNOWN",
  marketContextCoveragePct:  null,

  btcMicroDirectionScore:    null,
  btcMicroDirectionLabel:    "UNKNOWN",
  btcTacticalDirectionScore: null,
  btcTacticalDirectionLabel: "UNKNOWN",
  btcStructuralDirectionScore: null,
  btcStructuralDirectionLabel: "UNKNOWN",
  btcTrendLabel:             "UNKNOWN",
  btcMomentumPhase:          "UNKNOWN",
  btcRegime:                 "UNKNOWN",
  btcVolatilityState:        "UNKNOWN",
  btcStructure15m:           "UNKNOWN",
  btcStructure1h:            "UNKNOWN",
  btcShortTailwindComponent: null,

  ethMicroDirectionScore:    null,
  ethMicroDirectionLabel:    "UNKNOWN",
  ethTacticalDirectionScore: null,
  ethTacticalDirectionLabel: "UNKNOWN",
  ethStructuralDirectionScore: null,
  ethStructuralDirectionLabel: "UNKNOWN",
  ethTrendLabel:             "UNKNOWN",
  ethMomentumPhase:          "UNKNOWN",
  ethRegime:                 "UNKNOWN",
  ethVolatilityState:        "UNKNOWN",
  ethStructure15m:           "UNKNOWN",
  ethStructure1h:            "UNKNOWN",
  ethShortTailwindComponent: null,

  btcEthAlignmentLabel:          "UNKNOWN",
  crossMarketShortTailwindScore: null,
  crossMarketShortBiasLabel:     "UNKNOWN",
  crossMarketLongTailwindScore:  null,
  crossMarketLongBiasLabel:      "UNKNOWN",
  marketConflictFlags:           [],

  breadthValidSymbolCount: null,
  breadthBearishPct:       null,
  breadthDirectionScore:   null,
  breadthLabel:            "BREADTH_STALE",
  breadthWarnings:         [],

  btcShortBias:          "UNKNOWN",
  btcShortTailwindScore: null,
  btcLongTailwindScore:  null,
  marketContextAtEntry:  null,
};

export const MARKET_REGIME_CSV_HEADERS = [
  "marketSnapshotId",
  "marketRegimeVersion",
  "marketContextComputedAt",
  "marketContextAgeMs",
  "marketContextFreshness",
  "marketContextCoveragePct",
  "btcMicroDirectionScore",
  "btcMicroDirectionLabel",
  "btcTacticalDirectionScore",
  "btcTacticalDirectionLabel",
  "btcStructuralDirectionScore",
  "btcStructuralDirectionLabel",
  "btcTrendLabel",
  "btcMomentumPhase",
  "btcRegime",
  "btcVolatilityState",
  "btcStructure15m",
  "btcStructure1h",
  "btcShortTailwindComponent",
  "ethMicroDirectionScore",
  "ethMicroDirectionLabel",
  "ethTacticalDirectionScore",
  "ethTacticalDirectionLabel",
  "ethStructuralDirectionScore",
  "ethStructuralDirectionLabel",
  "ethTrendLabel",
  "ethMomentumPhase",
  "ethRegime",
  "ethVolatilityState",
  "ethStructure15m",
  "ethStructure1h",
  "ethShortTailwindComponent",
  "btcEthAlignmentLabel",
  "crossMarketShortTailwindScore",
  "crossMarketShortBiasLabel",
  "crossMarketLongTailwindScore",
  "crossMarketLongBiasLabel",
  "marketConflictFlags",
  "breadthValidSymbolCount",
  "breadthBearishPct",
  "breadthDirectionScore",
  "breadthLabel",
  "breadthWarnings",
];

function c(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function marketRegimeCSVRow(s) {
  return [
    c(s.marketSnapshotId ?? ""),
    c(s.marketRegimeVersion ?? ""),
    c(s.marketContextComputedAt ?? ""),
    c(s.marketContextAgeMs ?? ""),
    c(s.marketContextFreshness ?? ""),
    c(s.marketContextCoveragePct ?? ""),
    c(s.btcMicroDirectionScore ?? ""),
    c(s.btcMicroDirectionLabel ?? ""),
    c(s.btcTacticalDirectionScore ?? ""),
    c(s.btcTacticalDirectionLabel ?? ""),
    c(s.btcStructuralDirectionScore ?? ""),
    c(s.btcStructuralDirectionLabel ?? ""),
    c(s.btcTrendLabel ?? ""),
    c(s.btcMomentumPhase ?? ""),
    c(s.btcRegime ?? ""),
    c(s.btcVolatilityState ?? ""),
    c(s.btcStructure15m ?? ""),
    c(s.btcStructure1h ?? ""),
    c(s.btcShortTailwindComponent ?? ""),
    c(s.ethMicroDirectionScore ?? ""),
    c(s.ethMicroDirectionLabel ?? ""),
    c(s.ethTacticalDirectionScore ?? ""),
    c(s.ethTacticalDirectionLabel ?? ""),
    c(s.ethStructuralDirectionScore ?? ""),
    c(s.ethStructuralDirectionLabel ?? ""),
    c(s.ethTrendLabel ?? ""),
    c(s.ethMomentumPhase ?? ""),
    c(s.ethRegime ?? ""),
    c(s.ethVolatilityState ?? ""),
    c(s.ethStructure15m ?? ""),
    c(s.ethStructure1h ?? ""),
    c(s.ethShortTailwindComponent ?? ""),
    c(s.btcEthAlignmentLabel ?? ""),
    c(s.crossMarketShortTailwindScore ?? ""),
    c(s.crossMarketShortBiasLabel ?? ""),
    c(s.crossMarketLongTailwindScore ?? ""),
    c(s.crossMarketLongBiasLabel ?? ""),
    c(pipeSep(s.marketConflictFlags ?? [])),
    c(s.breadthValidSymbolCount ?? ""),
    c(s.breadthBearishPct ?? ""),
    c(s.breadthDirectionScore ?? ""),
    c(s.breadthLabel ?? ""),
    c(pipeSep(s.breadthWarnings ?? [])),
  ];
}
