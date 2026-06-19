// Market Regime Engine — main entry point
import { MARKET_REGIME_CONFIG, MARKET_REGIME_VERSION } from "./marketRegime.config.js";
import { computeAssetContext } from "./marketRegime.asset.js";
import { computeCrossMarketContext } from "./marketRegime.crossMarket.js";
import { computeBreadthMetrics } from "./marketRegime.breadth.js";
import { classifyFreshness, computeConfidence } from "./marketRegime.labels.js";

let _lastValidBtc  = null;
let _lastValidEth  = null;
let _lastValidBreadth = null;
let _inflightPromise = null;
let _snapshotCounter = 0;

function makeSnapshotId(computedAt) {
  _snapshotCounter++;
  return `mrv2-${computedAt}-${_snapshotCounter}`;
}

// ── Shared fetch (BTC + ETH in one coordinated refresh) ───────────────────────

export async function fetchMarketRegimeContext({
  getKlines,
  klinesMap = {},
  config = MARKET_REGIME_CONFIG,
}) {
  // Deduplicate in-flight refreshes
  if (_inflightPromise) return _inflightPromise;

  const startedAt = Date.now();

  _inflightPromise = _doFetch({ getKlines, klinesMap, config, startedAt })
    .finally(() => { _inflightPromise = null; });

  return _inflightPromise;
}

async function _doFetch({ getKlines, klinesMap, config, startedAt }) {
  const fetchTasks = [];
  const warnings   = [];
  const failedIntervals = [];

  // Fetch BTC klines for all timeframes
  const btcKlines = {};
  const ethKlines = {};

  for (const tf of config.timeframes) {
    const limit = config.candleLimits[tf] ?? 160;
    fetchTasks.push(
      getKlines(config.symbols.btc, tf, limit)
        .then(data => { btcKlines[tf] = data; })
        .catch(() => { failedIntervals.push(`BTC_${tf.toUpperCase()}_FETCH_FAILED`); })
    );
    fetchTasks.push(
      getKlines(config.symbols.eth, tf, limit)
        .then(data => { ethKlines[tf] = data; })
        .catch(() => { failedIntervals.push(`ETH_${tf.toUpperCase()}_FETCH_FAILED`); })
    );
  }

  await Promise.allSettled(fetchTasks);

  const computedAt = Date.now();
  const latencyMs  = computedAt - startedAt;

  // Compute BTC asset context
  let btcContext = null;
  try {
    btcContext = computeAssetContext({
      symbol: config.symbols.btc,
      klinesByInterval: btcKlines,
      computedAt,
      config,
    });
    _lastValidBtc = btcContext;
  } catch (err) {
    warnings.push("BTC_ASSET_COMPUTE_FAILED");
    btcContext = _lastValidBtc;
  }

  // Compute ETH asset context
  let ethContext = null;
  try {
    ethContext = computeAssetContext({
      symbol: config.symbols.eth,
      klinesByInterval: ethKlines,
      computedAt,
      config,
    });
    _lastValidEth = ethContext;
  } catch (err) {
    warnings.push("ETH_ASSET_COMPUTE_FAILED");
    ethContext = _lastValidEth;
  }

  // Breadth — use klinesMap if provided, otherwise skip
  let breadthContext = _lastValidBreadth;
  if (config.breadth.enabled && Object.keys(klinesMap).length >= config.breadth.minValidSymbols) {
    try {
      const symbols = Object.keys(klinesMap)
        .filter(s => !config.breadth.excludeSymbols.includes(s))
        .slice(0, config.breadth.maxSymbols);

      const k5m  = {};
      const k15m = {};
      for (const sym of symbols) {
        if (klinesMap[sym]?.["5m"])  k5m[sym]  = klinesMap[sym]["5m"];
        if (klinesMap[sym]?.["15m"]) k15m[sym] = klinesMap[sym]["15m"];
      }

      breadthContext = computeBreadthMetrics({
        symbolKlinesMap5m:  k5m,
        symbolKlinesMap15m: k15m,
        computedAt,
        config,
      });
      _lastValidBreadth = breadthContext;
    } catch (_) {
      warnings.push("BREADTH_COMPUTE_FAILED");
    }
  }

  // Cross-market context
  const btcFreshnessAge = btcContext ? computedAt - (btcContext.computedAt ?? computedAt) : Infinity;
  const ethFreshnessAge = ethContext ? computedAt - (ethContext.computedAt ?? computedAt) : Infinity;

  const btcFreshLabel = classifyFreshness(btcFreshnessAge);
  const ethFreshLabel = classifyFreshness(ethFreshnessAge);

  const btcCtxWithFreshness = btcContext ? { ...btcContext, freshnessLabel: btcFreshLabel } : null;
  const ethCtxWithFreshness = ethContext ? { ...ethContext, freshnessLabel: ethFreshLabel } : null;

  const crossMarket = computeCrossMarketContext({
    btc:    btcCtxWithFreshness,
    eth:    ethCtxWithFreshness,
    breadth: breadthContext,
  });

  // Overall freshness
  const snapshotAge   = computedAt - startedAt;
  const snapshotFresh = classifyFreshness(0); // just computed
  const degraded      = failedIntervals.length > 0 || !btcCtxWithFreshness || !ethCtxWithFreshness;
  const stale         = btcFreshLabel === "HARD_STALE";

  const coveragePct = Number((
    ((btcContext?.validTimeframeCount ?? 0) + (ethContext?.validTimeframeCount ?? 0)) /
    (config.timeframes.length * 2)
  ).toFixed(2));

  const confidence = computeConfidence({
    coveragePct,
    freshnessLabel: snapshotFresh,
    validTimeframeCount: (btcContext?.validTimeframeCount ?? 0) + (ethContext?.validTimeframeCount ?? 0),
  });

  const snapshotId = makeSnapshotId(computedAt);

  const snapshot = {
    version:       MARKET_REGIME_VERSION,
    snapshotId,
    computedAt,
    fetchStartedAt: startedAt,
    latencyMs,
    ageMs:         0,
    source:        "binance-futures",
    stale,
    degraded,
    freshnessLabel: snapshotFresh,
    coveragePct,
    confidence,
    warnings:       [...warnings, ...failedIntervals],
    failedIntervals,

    btc:         btcCtxWithFreshness,
    eth:         ethCtxWithFreshness,
    breadth:     breadthContext,
    crossMarket,

    // Legacy compat fields
    btcRegime:             btcCtxWithFreshness?.regime ?? "UNKNOWN",
    btcShortBias:          crossMarket.crossMarketShortBiasLabel,
    btcShortTailwindScore: crossMarket.crossMarketShortTailwindScore ?? 0,
    longTailwindScore:     crossMarket.crossMarketLongTailwindScore  ?? 0,
  };

  // Log transitions
  _logTransitions(snapshot);

  return snapshot;
}

let _previousSnapshot = null;

function _logTransitions(snapshot) {
  if (!_previousSnapshot) { _previousSnapshot = snapshot; return; }

  const prev = _previousSnapshot;
  const changes = [];

  const prevBtcRegime  = prev.btc?.regime  ?? "UNKNOWN";
  const currBtcRegime  = snapshot.btc?.regime  ?? "UNKNOWN";
  const prevEthRegime  = prev.eth?.regime  ?? "UNKNOWN";
  const currEthRegime  = snapshot.eth?.regime  ?? "UNKNOWN";
  const prevShortScore = prev.crossMarket?.crossMarketShortTailwindScore ?? 0;
  const currShortScore = snapshot.crossMarket?.crossMarketShortTailwindScore ?? 0;

  if (prevBtcRegime !== currBtcRegime) {
    changes.push(`BTC ${prevBtcRegime} -> ${currBtcRegime}`);
  }
  if (prevEthRegime !== currEthRegime) {
    changes.push(`ETH ${prevEthRegime} -> ${currEthRegime}`);
  }
  if (Math.abs(prevShortScore - currShortScore) >= 10) {
    changes.push(`SHORT bias ${prevShortScore >= 0 ? "+" : ""}${prevShortScore} -> ${currShortScore >= 0 ? "+" : ""}${currShortScore}`);
  }

  if (changes.length) {
    console.info("[MARKET_REGIME]", changes.join("\n"), `| id=${snapshot.snapshotId}`);
  }

  _previousSnapshot = snapshot;
}

export function getLastValidSnapshot() {
  return _previousSnapshot;
}

export function computeSnapshotAgeMs(snapshot) {
  if (!snapshot?.computedAt) return Infinity;
  return Date.now() - snapshot.computedAt;
}

export function isSnapshotHardStale(snapshot, config = MARKET_REGIME_CONFIG) {
  const age = computeSnapshotAgeMs(snapshot);
  return age > config.hardStaleAgeMs;
}

export { MARKET_REGIME_VERSION, MARKET_REGIME_CONFIG };
