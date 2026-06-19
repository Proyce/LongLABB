// ─── LONG HIGHLIGHT ENGINE ────────────────────────────────────────────────────
// Automatically curates the top entry filters, labels, and combos as trades /
// RUNs accumulate. LOG_ONLY research — nothing here gates execution.
//
// Pipeline:
//   1. Generate candidate ENTRY-timing predicates from the registry + observed
//      categorical values (labels). Live/exit fields are never used as entry
//      evidence (entryPredictive + ENTRY_FINAL gate).
//   2. Score each candidate's univariate edge vs the population baseline, using
//      shrinkage-adjusted lift (robust to tiny samples) + a t-like confidence.
//   3. Mine 2- and 3-signal combos with an apriori/greedy algorithm, keeping
//      combos with sufficient support AND positive synergy over their members.
//   4. Rank everything from sharpest (narrow, high-edge) to broadest.
//
// Matching reuses the real engine predicate evaluator (evaluatePredicate) so
// curation and the live filter results are always consistent.

import { evaluatePredicate, FILTER_VERDICT, getLongFilterOutcomePnl } from "./longFilterEngine.js";
import { LONG_FILTER_REGISTRY } from "./longFilterRegistry.js";
import {
  OPERATOR, FIELD_TYPE, FILTER_TIMING, PNL_METRIC,
} from "./longFilterConstants.js";

// ─── TUNABLES ─────────────────────────────────────────────────────────────────

export const HIGHLIGHT_DEFAULTS = Object.freeze({
  metricField: "feeAdjustedNormPnlPct",   // canonical research metric (§21)
  fallbackMetricField: null,               // NO unit-mixing fallback (review Highlights #5)
  minSupport: 8,            // discovery floor for surfacing a single hypothesis
  minComboSupport: 6,       // discovery floor for surfacing a combo hypothesis
  minPromotionSupport: 30,  // a single must reach this n to be promotion-eligible
  minComboPromotionSupport: 20, // a combo must reach this n to be promotion-eligible
  shrinkageK: 8,            // Bayesian shrink toward zero lift for small n
  topSinglesForCombos: 14,  // how many top singles seed combo mining
  maxCombos: 40,            // cap surfaced combos
  comboSynergyEpsilon: 0.05,// joint lift must beat best member by this margin
  maxEnumValuesPerField: 6, // distinct categorical values to test per field
  narrowCoveragePct: 22,    // <= this coverage is considered "SHARP/narrow"
  strongCoveragePct: 55,    // <= this coverage is "STRONG", above is "BROAD"
  // Cross-run / cross-session validation gates (review Highlights #4)
  minRunsForValidation: 3,        // distinct runs needed to claim cross-run validation
  minSessionsForValidation: 2,    // distinct sessions needed for cross-session validation
  minPositiveFraction: 0.6,       // fraction of runs/sessions that must be net positive
});

// Disclaimer surfaced with every result — these are in-sample hypotheses.
export const HIGHLIGHT_DISCLAIMER =
  "EXPLORATORY HYPOTHESES · IN-SAMPLE · NOT VALIDATED — discovered and scored on the same trades; not a production candidate.";

// Validation grade ladder (review Highlights presentation rule).
export const HIGHLIGHT_GRADE = Object.freeze({
  DISCOVERY:                "DISCOVERY",
  CROSS_RUN_VALIDATED:      "CROSS_RUN_VALIDATED",
  CROSS_SESSION_VALIDATED:  "CROSS_SESSION_VALIDATED",
  OUT_OF_SAMPLE_VALIDATED:  "OUT_OF_SAMPLE_VALIDATED",
});

// ─── METRIC + STATS HELPERS ────────────────────────────────────────────────────

function metricOf(trade, metricField, fallbackField) {
  const v = trade?.[metricField];
  if (typeof v === "number") return v;
  if (!fallbackField) return null;   // no unit-mixing fallback by default
  const fb = trade?.[fallbackField];
  return typeof fb === "number" ? fb : null;
}

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdev(xs, m) {
  if (xs.length < 2) return 0;
  const mu = m ?? mean(xs);
  const variance = xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function round(n, d = 3) {
  if (n == null || !isFinite(n)) return n;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// ─── CANDIDATE GENERATION ──────────────────────────────────────────────────────

// Only entry-predictive, entry-final filters are eligible as entry evidence.
function isEntryEligible(filter) {
  return filter.entryPredictive === true && filter.timing === FILTER_TIMING.ENTRY_FINAL;
}

function distinctValues(trades, field, limit) {
  const counts = new Map();
  for (const t of trades) {
    const v = t?.[field];
    if (v == null || v === "UNKNOWN") continue;
    if (Array.isArray(v)) {
      for (const item of v) counts.set(item, (counts.get(item) ?? 0) + 1);
    } else {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

/**
 * Builds candidate signals: { key, filterId, label, field, predicate }.
 * Each predicate is directly applyable to the active filter state.
 */
function generateCandidates(trades, opts) {
  const out = [];
  const seen = new Set();
  const push = (c) => { if (!seen.has(c.key)) { seen.add(c.key); out.push(c); } };

  for (const filter of LONG_FILTER_REGISTRY) {
    if (!isEntryEligible(filter)) continue;
    const { id, label, field, fieldType, presets } = filter;

    if (fieldType === FIELD_TYPE.BOOLEAN) {
      push({ key: `${id}:TRUE`, filterId: id, field,
        label: `${label} = true`,
        predicate: { filterId: id, operator: OPERATOR.IS_TRUE } });
    } else if (fieldType === FIELD_TYPE.NUMERIC) {
      const thresholds = Array.isArray(presets) && presets.length ? presets : [50, 70, 85];
      for (const p of thresholds) {
        push({ key: `${id}:GTE:${p}`, filterId: id, field,
          label: `${label} ≥ ${p}`,
          predicate: { filterId: id, operator: OPERATOR.GTE, value: p } });
      }
    } else if (fieldType === FIELD_TYPE.ENUM) {
      for (const v of distinctValues(trades, field, opts.maxEnumValuesPerField)) {
        push({ key: `${id}:IN:${v}`, filterId: id, field,
          label: `${label} = ${v}`,
          predicate: { filterId: id, operator: OPERATOR.IN, value: [v] } });
      }
    } else if (fieldType === FIELD_TYPE.ARRAY) {
      for (const v of distinctValues(trades, field, opts.maxEnumValuesPerField)) {
        push({ key: `${id}:HAS:${v}`, filterId: id, field,
          label: `${label} ∋ ${v}`,
          predicate: { filterId: id, operator: OPERATOR.INCLUDES_ANY, value: [v] } });
      }
    }
  }
  return out;
}

const REGISTRY_BY_ID = new Map(LONG_FILTER_REGISTRY.map(f => [f.id, f]));

// Partition trades into matched / unmatched values for a predicate (UNKNOWN excluded).
function matchedMetricValues(trades, predicate, metricField, fallbackField) {
  const rf = REGISTRY_BY_ID.get(predicate.filterId);
  if (!rf) return { matched: [], matchedIds: new Set() };
  const matched = [];
  const matchedIds = new Set();
  for (const t of trades) {
    const res = evaluatePredicate(t, predicate, rf);
    if (res.verdict !== FILTER_VERDICT.MATCH) continue;
    const m = metricOf(t, metricField, fallbackField);
    if (m == null) continue;
    matched.push(m);
    matchedIds.add(t.id ?? `${t.symbol}_${t.entryTime}`);
  }
  return { matched, matchedIds };
}

// ─── SCORING ────────────────────────────────────────────────────────────────────

function scoreSignal({ matched, baselineAvg, totalKnown, opts }) {
  const n = matched.length;
  const matchedAvg = mean(matched);
  const lift = matchedAvg - baselineAvg;
  const sd = stdev(matched, matchedAvg);
  const winRate = n ? matched.filter(v => v > 0).length / n : 0;
  const coveragePct = totalKnown ? (n / totalKnown) * 100 : 0;

  // Shrinkage-adjusted lift: small samples are pulled toward zero edge.
  const shrink = n / (n + opts.shrinkageK);
  const adjLift = lift * shrink;

  // t-like confidence (guarded). Higher = more reliable separation.
  const tStat = (sd > 0 && n > 1) ? lift / (sd / Math.sqrt(n)) : 0;

  // Edge score blends adjusted lift with confidence; primary curation rank.
  const edgeScore = adjLift * (1 + Math.min(Math.abs(tStat), 4) / 4);

  let band;
  if (coveragePct <= opts.narrowCoveragePct) band = "SHARP";
  else if (coveragePct <= opts.strongCoveragePct) band = "STRONG";
  else band = "BROAD";

  return {
    n, matchedAvg: round(matchedAvg), lift: round(lift), adjLift: round(adjLift),
    winRatePct: round(winRate * 100, 1), coveragePct: round(coveragePct, 1),
    tStat: round(tStat, 2), edgeScore: round(edgeScore), band,
  };
}

// ─── CROSS-RUN / CROSS-SESSION CONSISTENCY ───────────────────────────────────
// A signal that ranks highly only because of one exceptional run or symbol
// cluster is fragile. We measure how consistently the matched cohort is net
// positive across distinct runs and sessions (review Highlights #4).

function buildIdMeta(known) {
  // id -> { m, run, session, symbol }
  const map = new Map();
  for (const x of known) {
    const id = x.t.id ?? `${x.t.symbol}_${x.t.entryTime}`;
    map.set(id, {
      m: x.m,
      run: x.t.run ?? x.t.runId ?? 'NO_RUN',
      session: x.t.sessionId ?? 'NO_SESSION',
      symbol: x.t.symbol ?? 'NO_SYMBOL',
    });
  }
  return map;
}

function consistencyFor(idSet, idMeta) {
  const runSums = new Map();      // run -> { sum, n }
  const sessionSums = new Map();  // session -> { sum, n }
  const symbols = new Set();
  for (const id of idSet) {
    const meta = idMeta.get(id);
    if (!meta || typeof meta.m !== 'number') continue;
    symbols.add(meta.symbol);
    const r = runSums.get(meta.run) ?? { sum: 0, n: 0 };
    r.sum += meta.m; r.n += 1; runSums.set(meta.run, r);
    const s = sessionSums.get(meta.session) ?? { sum: 0, n: 0 };
    s.sum += meta.m; s.n += 1; sessionSums.set(meta.session, s);
  }
  const runs = [...runSums.values()];
  const sessions = [...sessionSums.values()];
  const posRuns = runs.filter(r => r.sum / r.n > 0).length;
  const posSessions = sessions.filter(s => s.sum / s.n > 0).length;
  return {
    runCount: runs.length,
    sessionCount: sessions.length,
    symbolCount: symbols.size,
    positiveRunCount: posRuns,
    positiveSessionCount: posSessions,
    runPositiveFraction: runs.length ? round(posRuns / runs.length, 2) : 0,
    sessionPositiveFraction: sessions.length ? round(posSessions / sessions.length, 2) : 0,
  };
}

function gradeFor(stats, consistency, opts, promotionFloor) {
  // Anything below the promotion sample floor is a hypothesis only.
  if (stats.n < promotionFloor) return HIGHLIGHT_GRADE.DISCOVERY;

  const runOk =
    consistency.runCount >= opts.minRunsForValidation &&
    consistency.runPositiveFraction >= opts.minPositiveFraction;
  const sessionOk =
    consistency.sessionCount >= opts.minSessionsForValidation &&
    consistency.sessionPositiveFraction >= opts.minPositiveFraction;

  // Out-of-sample validation requires a held-out test set, which this in-sample
  // engine never has — it is reserved for an external validation pass.
  if (runOk && sessionOk) return HIGHLIGHT_GRADE.CROSS_SESSION_VALIDATED;
  if (runOk) return HIGHLIGHT_GRADE.CROSS_RUN_VALIDATED;
  return HIGHLIGHT_GRADE.DISCOVERY;
}


function intersectionSize(a, b) {
  let n = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const id of small) if (big.has(id)) n++;
  return n;
}

function comboStats(memberIdSets, idToMetric, baselineAvg, totalKnown, opts) {
  // Joint match = intersection of all member matched-id sets.
  let joint = null;
  for (const s of memberIdSets) {
    if (joint == null) { joint = new Set(s); continue; }
    const next = new Set();
    for (const id of joint) if (s.has(id)) next.add(id);
    joint = next;
  }
  const values = [];
  for (const id of joint) {
    const m = idToMetric.get(id);
    if (typeof m === "number") values.push(m);
  }
  return { jointIds: joint, ...scoreSignal({ matched: values, baselineAvg, totalKnown, opts }) };
}

function mineCombos(rankedSingles, idToMetric, baselineAvg, totalKnown, opts, idMeta) {
  const seeds = rankedSingles.slice(0, opts.topSinglesForCombos);
  const combos = [];

  const memberMaxLift = (members) => Math.max(...members.map(m => m.stats.lift));
  const differentField = (a, b) => a.field !== b.field;

  // 2-combos
  const pairs = [];
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const a = seeds[i], b = seeds[j];
      if (!differentField(a, b)) continue;            // avoid same-field conjunctions
      const stats = comboStats([a.matchedIds, b.matchedIds], idToMetric, baselineAvg, totalKnown, opts);
      if (stats.n < opts.minComboSupport) continue;
      const synergy = stats.lift - memberMaxLift([a, b]);
      if (stats.lift <= 0 && stats.edgeScore <= 0) continue;
      // 2-combos must also show real positive synergy to survive (review
      // Highlights #1 — previously only 3-combos were synergy-gated).
      if (synergy < opts.comboSynergyEpsilon) continue;
      pairs.push({ members: [a, b], stats, synergy: round(synergy) });
    }
  }
  pairs.sort((x, y) => y.stats.edgeScore - x.stats.edgeScore);
  combos.push(...pairs);

  // 3-combos: greedily expand the strongest pairs with a third distinct-field seed.
  const topPairs = pairs.slice(0, Math.min(12, pairs.length));
  for (const pair of topPairs) {
    for (const c of seeds) {
      if (pair.members.some(m => m.field === c.field || m.key === c.key)) continue;
      const members = [...pair.members, c];
      const stats = comboStats(members.map(m => m.matchedIds), idToMetric, baselineAvg, totalKnown, opts);
      if (stats.n < opts.minComboSupport) continue;
      const synergy = stats.lift - memberMaxLift(members);
      // 3-combos must show real positive synergy to survive (anti-overfit).
      if (synergy < opts.comboSynergyEpsilon) continue;
      combos.push({ members, stats, synergy: round(synergy) });
    }
  }

  // Dedupe by sorted member keys; keep the strongest.
  const byKey = new Map();
  for (const combo of combos) {
    const k = combo.members.map(m => m.key).sort().join("&");
    const existing = byKey.get(k);
    if (!existing || combo.stats.edgeScore > existing.stats.edgeScore) byKey.set(k, combo);
  }

  return [...byKey.values()]
    .sort((a, b) => b.stats.edgeScore - a.stats.edgeScore)
    .slice(0, opts.maxCombos)
    .map((combo, i) => {
      const consistency = idMeta
        ? consistencyFor(combo.stats.jointIds ?? new Set(), idMeta)
        : null;
      const validationGrade = consistency
        ? gradeFor(combo.stats, consistency, opts, opts.minComboPromotionSupport)
        : HIGHLIGHT_GRADE.DISCOVERY;
      return {
        id: `combo-${i}`,
        label: combo.members.map(m => m.label).join("  ∧  "),
        members: combo.members.map(m => ({ key: m.key, label: m.label, predicate: m.predicate })),
        predicates: combo.members.map(m => m.predicate),
        synergy: combo.synergy,
        ...combo.stats,
        consistency,
        validationGrade,
        promotable: validationGrade !== HIGHLIGHT_GRADE.DISCOVERY,
        jointIds: undefined,
      };
    });
}

// ─── LABEL CURATION ──────────────────────────────────────────────────────────────

const LABEL_FIELDS = [
  { field: "longShadowDecision", label: "Shadow Decision" },
  { field: "longComboLabels", label: "Combo", array: true },
  { field: "bestDnaLongTier", label: "Best DNA Tier" },
  { field: "longPostFee10EntryTier", label: "Post-Fee 10 Tier" },
  { field: "longCandidateRunnerTierAtEntry", label: "Runner Tier" },
  { field: "longMicroMomentumLabel", label: "Micro Momentum" },
  { field: "longSubBucket", label: "Sub-Bucket" },
];

function curateLabels(trades, baselineAvg, totalKnown, opts) {
  const out = [];
  for (const { field, label, array } of LABEL_FIELDS) {
    const values = distinctValues(trades, field, 12);
    for (const v of values) {
      const matched = [];
      for (const t of trades) {
        const fv = t?.[field];
        const hit = array ? (Array.isArray(fv) && fv.includes(v)) : fv === v;
        if (!hit) continue;
        const m = metricOf(t, opts.metricField, opts.fallbackMetricField);
        if (m != null) matched.push(m);
      }
      if (matched.length < opts.minSupport) continue;
      const stats = scoreSignal({ matched, baselineAvg, totalKnown, opts });
      out.push({ field, value: v, label: `${label}: ${v}`, ...stats });
    }
  }
  return out.sort((a, b) => b.edgeScore - a.edgeScore);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────────

/**
 * Curates highlights from closed trades.
 * @param {Object[]} trades - closed trades (with canonical entry fields)
 * @param {Object} [options]
 * @returns {{ baseline, filters, combos, labels, generatedAtCount, metricField }}
 */
export function curateHighlights(trades, options = {}) {
  const opts = { ...HIGHLIGHT_DEFAULTS, ...options };
  const list = Array.isArray(trades) ? trades.filter(t => t && t.closed !== false) : [];

  const known = list
    .map(t => ({ t, m: metricOf(t, opts.metricField, opts.fallbackMetricField) }))
    .filter(x => x.m != null);
  const totalKnown = known.length;
  const baselineValues = known.map(x => x.m);
  const baselineAvg = mean(baselineValues);
  const baselineWin = totalKnown ? baselineValues.filter(v => v > 0).length / totalKnown : 0;

  const idToMetric = new Map(known.map(x => [x.t.id ?? `${x.t.symbol}_${x.t.entryTime}`, x.m]));
  const idMeta = buildIdMeta(known);

  // Count records dropped for lacking the canonical normalized metric — these
  // form a separate legacy cohort rather than being mixed into the baseline.
  const mixedUnitExcludedCount = list.length - totalKnown;

  const baseline = {
    n: totalKnown,
    avg: round(baselineAvg),
    winRatePct: round(baselineWin * 100, 1),
    metricField: opts.metricField,
  };

  if (totalKnown < 2) {
    return {
      baseline, filters: [], combos: [], labels: [],
      generatedAtCount: list.length, metricField: opts.metricField,
      disclaimer: HIGHLIGHT_DISCLAIMER, mixedUnitExcludedCount,
    };
  }

  // 1–2: score single candidates
  const candidates = generateCandidates(list, opts);
  const scored = [];
  for (const cand of candidates) {
    const { matched, matchedIds } = matchedMetricValues(list, cand.predicate, opts.metricField, opts.fallbackMetricField);
    if (matched.length < opts.minSupport) continue;
    const stats = scoreSignal({ matched, baselineAvg, totalKnown, opts });
    scored.push({ ...cand, matchedIds, stats });
  }
  scored.sort((a, b) => b.stats.edgeScore - a.stats.edgeScore);

  // Positive-edge singles (curated from sharpest → broadest)
  const positives = scored.filter(s => s.stats.edgeScore > 0);
  const filters = positives.map((s, i) => {
    const consistency = consistencyFor(s.matchedIds, idMeta);
    const validationGrade = gradeFor(s.stats, consistency, opts, opts.minPromotionSupport);
    return {
      rank: i + 1,
      key: s.key,
      filterId: s.filterId,
      field: s.field,
      label: s.label,
      predicate: s.predicate,
      ...s.stats,
      consistency,
      validationGrade,
      promotable: validationGrade !== HIGHLIGHT_GRADE.DISCOVERY,
    };
  });

  // 3: combo mining over top positive singles
  const combos = mineCombos(positives, idToMetric, baselineAvg, totalKnown, opts, idMeta);

  // labels
  const labels = curateLabels(list, baselineAvg, totalKnown, opts);

  return {
    baseline, filters, combos, labels,
    generatedAtCount: list.length, metricField: opts.metricField,
    disclaimer: HIGHLIGHT_DISCLAIMER, mixedUnitExcludedCount,
  };
}

/**
 * Sorts curated filters from sharpest (narrow, high edge) to broadest.
 * SHARP bands first, then STRONG, then BROAD; within a band by edge.
 */
export function sortSharpToBroad(items) {
  const bandRank = { SHARP: 0, STRONG: 1, BROAD: 2 };
  return [...items].sort((a, b) => {
    const bd = (bandRank[a.band] ?? 9) - (bandRank[b.band] ?? 9);
    if (bd !== 0) return bd;
    return b.edgeScore - a.edgeScore;
  });
}
