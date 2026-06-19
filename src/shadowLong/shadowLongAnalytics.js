// ─── SHADOW LONG ANALYTICS ───────────────────────────────────────────────────
// Pure analytics / aggregation functions. No side effects.

function safeAvg(arr) {
  const valid = arr.filter(v => v != null && Number.isFinite(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function safeMedian(arr) {
  const sorted = [...arr].filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function safeSum(arr) {
  return arr.filter(v => v != null && Number.isFinite(v)).reduce((a, b) => a + b, 0);
}

function safePct(num, den) {
  return den > 0 ? (num / den) * 100 : null;
}

function profitFactor(audits, pnlKey) {
  const wins   = audits.filter(a => (a[pnlKey] ?? 0) > 0).map(a => a[pnlKey]);
  const losses = audits.filter(a => (a[pnlKey] ?? 0) < 0).map(a => Math.abs(a[pnlKey]));
  const sumW = safeSum(wins);
  const sumL = safeSum(losses);
  return sumL > 0 ? sumW / sumL : null;
}

function sampleConfidenceLabel(n) {
  if (n < 10)  return "VERY_SMALL_SAMPLE";
  if (n < 30)  return "SMALL_SAMPLE";
  if (n < 100) return "DEVELOPING";
  return "RESEARCH_WORTHY";
}

export function buildAuditSummaryRow(audits) {
  if (!audits.length) return null;
  const completed = audits.filter(a => a.status === "COMPLETED");
  const n = audits.length;
  const nc = completed.length;

  const longNets = completed.map(a => a.shadowLongFeeNetNormPnlPct).filter(v => v != null);
  const combNets = completed.map(a => a.combinedCompoundedMarginPnlPct).filter(v => v != null);
  const mirrorNets = completed.map(a => a.mirrorFeeNetNormPnlPct).filter(v => v != null);
  const atrNets = completed.map(a => a.atrProfileFeeNetNormPnlPct).filter(v => v != null);

  const longWins      = longNets.filter(v => v > 0).length;
  const combWins      = combNets.filter(v => v > 0).length;
  const fullRescue    = completed.filter(a => a.fullyRecoveredShortLoss === true).length;
  const partRescue    = completed.filter(a => a.partialRecovery === true).length;
  const whipsaws      = completed.filter(a => a.sourceShortDurationMs <= 60_000 && a.mirrorCloseReason === "SL" && (a.durationMs ?? Infinity) <= 60_000).length;

  const recoveryRatios = completed.map(a => a.shortLossRecoveryRatio).filter(v => v != null && Number.isFinite(v));

  const pnlAt60s  = completed.map(a => a.feeNetPnlAt60sNormPct).filter(v => v != null);
  const pnlAt180s = completed.map(a => a.feeNetPnlAt180sNormPct).filter(v => v != null);
  const pnlAt300s = completed.map(a => a.feeNetPnlAt300sNormPct).filter(v => v != null);

  const uniqueRuns    = new Set(audits.map(a => a.sourceShortRun).filter(v => v != null));
  const positiveRuns  = [...uniqueRuns].filter(run => {
    const runAudits = completed.filter(a => a.sourceShortRun === run);
    return runAudits.length > 0 && safeSum(runAudits.map(a => a.shadowLongFeeNetNormPnlPct ?? 0)) > 0;
  });

  const uniqueSymbols = new Set(audits.map(a => a.symbol).filter(Boolean));

  return {
    audits:      n,
    completed:   nc,
    longNetSum:  safeSum(longNets),
    longAvg:     safeAvg(longNets),
    longMedian:  safeMedian(longNets),
    combNetSum:  safeSum(combNets),
    combAvg:     safeAvg(combNets),
    combMedian:  safeMedian(combNets),
    mirrorAvg:   safeAvg(mirrorNets),
    atrAvg:      safeAvg(atrNets),
    longWinRate: safePct(longWins, nc),
    combWinRate: safePct(combWins, nc),
    fullRescueRate: safePct(fullRescue, nc),
    partRescueRate: safePct(partRescue, nc),
    whipsawRate:    safePct(whipsaws, nc),
    avgRecoveryRatio: safeAvg(recoveryRatios),
    avgMfe: safeAvg(completed.map(a => a.grossMfeNormPct)),
    avgMae: safeAvg(completed.map(a => a.grossMaeNormPct)),
    win1mRate:  safePct(pnlAt60s.filter(v => v > 0).length,  pnlAt60s.length),
    win3mRate:  safePct(pnlAt180s.filter(v => v > 0).length, pnlAt180s.length),
    win5mRate:  safePct(pnlAt300s.filter(v => v > 0).length, pnlAt300s.length),
    positiveRunsPct: safePct(positiveRuns.length, uniqueRuns.size),
    uniqueSymbols:   uniqueSymbols.size,
    profitFactor:    profitFactor(completed, "shadowLongFeeNetNormPnlPct"),
    sampleConfidence: sampleConfidenceLabel(nc),
  };
}

export function summarizeShadowLongs(audits) {
  return buildAuditSummaryRow(audits);
}

export function summarizeShadowLongsByField(audits, fieldFn, labelFn) {
  const groups = new Map();
  for (const a of audits) {
    const key = labelFn ? labelFn(fieldFn(a)) : fieldFn(a);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  const rows = [];
  for (const [label, group] of groups) {
    const summary = buildAuditSummaryRow(group);
    if (summary) rows.push({ label, ...summary });
  }
  return rows.sort((a, b) => (b.combNetSum ?? 0) - (a.combNetSum ?? 0));
}

export function computeRescueRate(audits) {
  const completed = audits.filter(a => a.status === "COMPLETED");
  if (!completed.length) return { full: null, partial: null, none: null, whipsaw: null };
  const full    = completed.filter(a => a.fullyRecoveredShortLoss).length;
  const partial = completed.filter(a => a.partialRecovery).length;
  const whipsaw = completed.filter(a => a.sourceShortDurationMs <= 60_000 && a.mirrorCloseReason === "SL" && (a.durationMs ?? Infinity) <= 60_000).length;
  const none    = completed.length - full - partial;
  return {
    full:    safePct(full,    completed.length),
    partial: safePct(partial, completed.length),
    none:    safePct(Math.max(0, none), completed.length),
    whipsaw: safePct(whipsaw, completed.length),
  };
}

export function computeWhipsawRate(audits) {
  const completed = audits.filter(a => a.status === "COMPLETED");
  const whipsaws  = completed.filter(a =>
    (a.sourceShortDurationMs ?? Infinity) <= 60_000 &&
    a.mirrorCloseReason === "SL" &&
    (a.durationMs ?? Infinity) <= 60_000
  );
  return { count: whipsaws.length, rate: safePct(whipsaws.length, completed.length) };
}

export function computeHorizonStats(audits) {
  const completed = audits.filter(a => a.status === "COMPLETED");
  const horizons = [
    { key: "feeNetPnlAt15sNormPct",   label: "15s" },
    { key: "feeNetPnlAt30sNormPct",   label: "30s" },
    { key: "feeNetPnlAt60sNormPct",   label: "1m" },
    { key: "feeNetPnlAt120sNormPct",  label: "2m" },
    { key: "feeNetPnlAt180sNormPct",  label: "3m" },
    { key: "feeNetPnlAt300sNormPct",  label: "5m" },
    { key: "feeNetPnlAt600sNormPct",  label: "10m" },
  ];

  return horizons.map(({ key, label }) => {
    const vals = completed.map(a => a[key]).filter(v => v != null && Number.isFinite(v));
    const wins = vals.filter(v => v > 0).length;
    return {
      label,
      n:       vals.length,
      avg:     safeAvg(vals),
      median:  safeMedian(vals),
      sum:     safeSum(vals),
      winRate: safePct(wins, vals.length),
    };
  });
}

export function buildShadowLongRunSummary(audits) {
  return summarizeShadowLongsByField(audits, a => a.sourceShortRun, v => `Run ${v}`);
}

export function buildHypothesisComparison(audits) {
  const completed = audits.filter(a => a.status === "COMPLETED");

  const strictGroup = completed.filter(a =>
    a.shadowLongHypothesisEligible &&
    (a.atrPct ?? 0) >= 0.6 &&
    (a.sourceShortDurationMs ?? Infinity) <= 60_000
  );

  const lowAtrGroup = completed.filter(a =>
    !a.shadowLongHypothesisEligible &&
    (a.atrPct ?? 0) < 0.6 &&
    (a.sourceShortDurationMs ?? Infinity) <= 60_000
  );

  const slowGroup = completed.filter(a =>
    (a.atrPct ?? 0) >= 0.6 &&
    (a.sourceShortDurationMs ?? Infinity) > 60_000 &&
    (a.sourceShortDurationMs ?? Infinity) <= 180_000
  );

  return {
    strictHypothesis:   { label: "ATR≥0.6 + SL≤60s", ...buildAuditSummaryRow(strictGroup) },
    lowAtrComparison:   { label: "ATR<0.6 + SL≤60s",  ...buildAuditSummaryRow(lowAtrGroup) },
    slowSlComparison:   { label: "ATR≥0.6 + SL 60-180s", ...buildAuditSummaryRow(slowGroup) },
  };
}

export function buildAnalyticsTables(audits) {
  return {
    byDurationLabel:   summarizeShadowLongsByField(audits, a => a.sourceShortDurationLabel),
    byAtrClass:        summarizeShadowLongsByField(audits, a => a.shadowLongAtrClass),
    bySourceBucket:    summarizeShadowLongsByField(audits, a => a.sourceShortParentBucket),
    byOutcome:         summarizeShadowLongsByField(audits, a => a.outcomeLabel),
    byAesBand:         summarizeShadowLongsByField(audits, a => getAesBand(a.aes)),
    byBtcDirection:    summarizeShadowLongsByField(audits, a => a.btcDirection),
    byBtcRegime:       summarizeShadowLongsByField(audits, a => a.btcRegime),
    byEthDirection:    summarizeShadowLongsByField(audits, a => a.ethDirection),
    byCvd:             summarizeShadowLongsByField(audits, a => a.cvdLabel),
    byLast3Ticks:      summarizeShadowLongsByField(audits, a => a.last3TicksDirection),
    byLeverage:        summarizeShadowLongsByField(audits, a => `${a.shadowLongLeverage}x`),
    hypothesisVsComp:  buildHypothesisComparison(audits),
    horizonStats:      computeHorizonStats(audits),
  };
}

function getAesBand(aes) {
  if (aes == null) return "AES_UNKNOWN";
  if (aes === 0)   return "AES_0";
  if (aes < 40)    return "AES_1_39";
  if (aes < 70)    return "AES_40_69";
  if (aes < 90)    return "AES_70_89";
  return "AES_90_PLUS";
}
