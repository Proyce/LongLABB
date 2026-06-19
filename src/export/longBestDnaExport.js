// ─── LONG BEST DNA EXPORT ─────────────────────────────────────────────────────
// LONG-native CSV headers, default fields, row builder, and outcome fields.
// Replaces BEST_DNA_DEFAULT_FIELDS / BEST_DNA_CSV_HEADERS / bestDnaCSVRow /
// flattenBestDnaOutcomeFields from ShortLAB's bestDnaAudit.js.
// LOG ONLY — must never affect simulation execution.

import { longFeeAdjustedNormPnlPct } from "./runOutcomeRanking.js";

function finiteNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function feeAdjustedLeveragedPnlPct(trade) {
  return (
    finiteNumberOrNull(trade?.feeAdjustedFinalPnlPct) ??
    finiteNumberOrNull(trade?.feeAdjustedMarginPnlPct) ??
    null
  );
}

function jsonArray(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Outcome fields ─────────────────────────────────────────────────────────────

export function flattenLongOutcomeFields(trade) {
  const norm = longFeeAdjustedNormPnlPct(trade);
  const leveraged = feeAdjustedLeveragedPnlPct(trade);
  const isPostFee10PlusWinner = leveraged != null && leveraged >= 10;
  const isNorm2PlusWinner = norm != null && norm >= 2;
  const isNorm3PlusWinner = norm != null && norm >= 3;

  let longBestDnaOutcomeLabel = "LONG_OUTCOME_UNKNOWN";
  if (isPostFee10PlusWinner)                              longBestDnaOutcomeLabel = "LONG_POST_FEE_10_PLUS_WINNER";
  else if (isNorm3PlusWinner)                             longBestDnaOutcomeLabel = "LONG_NORM3_PLUS_WINNER";
  else if (isNorm2PlusWinner)                             longBestDnaOutcomeLabel = "LONG_NORM2_PLUS_WINNER";
  else if (leveraged != null && leveraged > 0)            longBestDnaOutcomeLabel = "LONG_FEE_ADJUSTED_WIN";
  else if (leveraged != null)                             longBestDnaOutcomeLabel = "LONG_FEE_ADJUSTED_NON_WINNER";

  return {
    feeAdjustedNormPnlPct: norm,
    feeAdjustedLeveragedPnlPct: leveraged,
    isPostFee10PlusWinner,
    isNorm2PlusWinner,
    isNorm3PlusWinner,
    longBestDnaOutcomeLabel,
  };
}

// ── Default fields ─────────────────────────────────────────────────────────────

export const LONG_BEST_DNA_DEFAULT_FIELDS = Object.freeze({
  // LONG Best DNA entry score
  bestDnaLongScoreRaw:        null,
  bestDnaLongScore:           null,
  bestDnaLongTier:            null,
  bestDnaLongPrimaryLabel:    null,
  bestDnaLongLabels:          [],
  bestDnaLongPositiveGenes:   [],
  bestDnaLongPenaltyGenes:    [],
  bestDnaLongVersion:         null,

  // LONG Post-Fee-10 entry potential
  longPostFee10ScoreRaw:      null,
  longPostFee10Score:         null,
  longPostFee10Tier:          null,
  longPostFee10Labels:        [],
  longPostFee10PositiveGenes: [],
  longPostFee10PenaltyGenes:  [],
  longPostFee10ScoreVersion:  null,

  // LONG Best DNA tier flags
  isBestDnaLongHigh:          false,
  isBestDnaLongSniper:        false,
  isBestDnaLongElite:         false,
  isLongPostFee10Candidate:   false,
  isLongPostFee10Sniper:      false,
  isLongPostFee10Elite:       false,

  // Observer config — all must remain false (log-only)
  useBestDnaLongEntryGate:    false,
  useLongPostFee10EntryGate:  false,
  useBestDnaLongForLeverage:  false,
  useBestDnaLongForPositionSizing: false,

  // Outcome / ranking fields (direction-neutral)
  feeAdjustedNormPnlPct:      null,
  feeAdjustedLeveragedPnlPct: null,
  isPostFee10PlusWinner:      false,
  isNorm2PlusWinner:          false,
  isNorm3PlusWinner:          false,
  isRunBest1Norm:             false,
  isRunBest3Norm:             false,
  runNormRank:                null,
  runClosedTradeCount:        null,
  longBestDnaOutcomeLabel:    null,
});

// ── CSV headers ────────────────────────────────────────────────────────────────

// feeAdjustedNormPnlPct is intentionally excluded — it is already written
// into the fee-telemetry section of CSV_COLS to avoid a duplicate column.
export const LONG_BEST_DNA_CSV_HEADERS = [
  "bestDnaLongScoreRaw",
  "bestDnaLongScore",
  "bestDnaLongTier",
  "bestDnaLongPrimaryLabel",
  "bestDnaLongLabels",
  "bestDnaLongPositiveGenes",
  "bestDnaLongPenaltyGenes",
  "bestDnaLongVersion",
  "longPostFee10ScoreRaw",
  "longPostFee10Score",
  "longPostFee10Tier",
  "longPostFee10Labels",
  "longPostFee10PositiveGenes",
  "longPostFee10PenaltyGenes",
  "longPostFee10ScoreVersion",
  "isBestDnaLongHigh",
  "isBestDnaLongSniper",
  "isBestDnaLongElite",
  "isLongPostFee10Candidate",
  "isLongPostFee10Sniper",
  "isLongPostFee10Elite",
  "useBestDnaLongEntryGate",
  "useLongPostFee10EntryGate",
  "useBestDnaLongForLeverage",
  "useBestDnaLongForPositionSizing",
  "feeAdjustedLeveragedPnlPct",
  "isPostFee10PlusWinner",
  "isNorm2PlusWinner",
  "isNorm3PlusWinner",
  "isRunBest1Norm",
  "isRunBest3Norm",
  "runNormRank",
  "runClosedTradeCount",
  "longBestDnaOutcomeLabel",
];

// ── CSV row builder ────────────────────────────────────────────────────────────

export function longBestDnaCSVRow(s = {}) {
  return [
    csvCell(s.bestDnaLongScoreRaw ?? ""),
    csvCell(s.bestDnaLongScore ?? ""),
    csvCell(s.bestDnaLongTier ?? ""),
    csvCell(s.bestDnaLongPrimaryLabel ?? ""),
    csvCell(jsonArray(s.bestDnaLongLabels)),
    csvCell(jsonArray(s.bestDnaLongPositiveGenes)),
    csvCell(jsonArray(s.bestDnaLongPenaltyGenes)),
    csvCell(s.bestDnaLongVersion ?? ""),
    csvCell(s.longPostFee10ScoreRaw ?? ""),
    csvCell(s.longPostFee10Score ?? ""),
    csvCell(s.longPostFee10Tier ?? ""),
    csvCell(jsonArray(s.longPostFee10Labels)),
    csvCell(jsonArray(s.longPostFee10PositiveGenes)),
    csvCell(jsonArray(s.longPostFee10PenaltyGenes)),
    csvCell(s.longPostFee10ScoreVersion ?? ""),
    csvCell(s.isBestDnaLongHigh ?? false),
    csvCell(s.isBestDnaLongSniper ?? false),
    csvCell(s.isBestDnaLongElite ?? false),
    csvCell(s.isLongPostFee10Candidate ?? false),
    csvCell(s.isLongPostFee10Sniper ?? false),
    csvCell(s.isLongPostFee10Elite ?? false),
    csvCell(s.useBestDnaLongEntryGate ?? false),
    csvCell(s.useLongPostFee10EntryGate ?? false),
    csvCell(s.useBestDnaLongForLeverage ?? false),
    csvCell(s.useBestDnaLongForPositionSizing ?? false),
    // feeAdjustedNormPnlPct omitted — already in fee telemetry section
    csvCell(s.feeAdjustedLeveragedPnlPct ?? ""),
    csvCell(s.isPostFee10PlusWinner ?? false),
    csvCell(s.isNorm2PlusWinner ?? false),
    csvCell(s.isNorm3PlusWinner ?? false),
    csvCell(s.isRunBest1Norm ?? false),
    csvCell(s.isRunBest3Norm ?? false),
    csvCell(s.runNormRank ?? ""),
    csvCell(s.runClosedTradeCount ?? ""),
    csvCell(s.longBestDnaOutcomeLabel ?? ""),
  ];
}
