export const LIVE_EXIT_AUDIT_CSV_HEADERS = [
  "liveExitAuditVersion",
  "liveExitAuditMode",
  "liveExitAuditEvaluatedAt",
  "liveExitScore",
  "liveExitLabel",
  "liveExitWouldHold",
  "liveExitWouldTighten",
  "liveExitWouldFastExit",
  "liveExitWouldEmergencyExit",
  "liveExitWouldProtectProfit",
  "liveExitWouldAllowRunner",
  "liveExitPrimaryReason",
  "liveExitReasons",
  "liveExitRecommendedProfileLogOnly",
  "liveExitAuditExecutionApplied",
  "liveExitAuditCanAffectExecution",
  "liveExitMfePct",
  "liveExitMaePct",
  "liveExitCurrentPnlPct",
  "liveExitSecondsInTrade",
  "liveExitMfeGivebackPct",
  "liveExitMfeCapturePct",
  "liveExitRunnerCapturePotentialScore",
  "liveExitPostFee10LiveConfirmationScore",
  "liveExitRunnerScorePeak",
  "liveExitBuyerDanger",
  "liveExitCvdFlipBullish",
  "liveExitVwapReclaim",
  "liveExitGreenImpulseReturn",
  "liveExitMacdFadeAgainstShort",
  "liveExitRsiRiseAgainstShort",
  "liveExitLongAuditDangerNow",
  "liveExitMarketBreathFlipAgainstShort",
];

const b = v => (v === true ? "true" : v === false ? "false" : "");
const n = v => (v != null ? String(v) : "");
const arr = v => (Array.isArray(v) ? v.join("|") : "");

/**
 * Maps a trade (or audit result merged into trade) to a CSV row object.
 * Produces one value per header in LIVE_EXIT_AUDIT_CSV_HEADERS, in order.
 */
export function flattenLiveExitAuditCsvRow(trade) {
  return [
    n(trade.liveExitAuditVersion),
    n(trade.liveExitAuditMode),
    n(trade.liveExitAuditEvaluatedAt),
    n(trade.liveExitScore),
    n(trade.liveExitLabel),
    b(trade.liveExitWouldHold),
    b(trade.liveExitWouldTighten),
    b(trade.liveExitWouldFastExit),
    b(trade.liveExitWouldEmergencyExit),
    b(trade.liveExitWouldProtectProfit),
    b(trade.liveExitWouldAllowRunner),
    n(trade.liveExitPrimaryReason),
    arr(trade.liveExitReasons),
    n(trade.liveExitRecommendedProfileLogOnly),
    // Safety invariants — always "false"
    "false",
    "false",
    n(trade.liveExitMfePct != null ? Number(trade.liveExitMfePct).toFixed(4) : ""),
    n(trade.liveExitMaePct != null ? Number(trade.liveExitMaePct).toFixed(4) : ""),
    n(trade.liveExitCurrentPnlPct != null ? Number(trade.liveExitCurrentPnlPct).toFixed(4) : ""),
    n(trade.liveExitSecondsInTrade),
    n(trade.liveExitMfeGivebackPct != null ? Number(trade.liveExitMfeGivebackPct).toFixed(4) : ""),
    n(trade.liveExitMfeCapturePct),
    n(trade.liveExitRunnerCapturePotentialScore),
    n(trade.liveExitPostFee10LiveConfirmationScore),
    n(trade.liveExitRunnerScorePeak),
    b(trade.liveExitBuyerDanger),
    b(trade.liveExitCvdFlipBullish),
    b(trade.liveExitVwapReclaim),
    b(trade.liveExitGreenImpulseReturn),
    b(trade.liveExitMacdFadeAgainstShort),
    b(trade.liveExitRsiRiseAgainstShort),
    b(trade.liveExitLongAuditDangerNow),
    b(trade.liveExitMarketBreathFlipAgainstShort),
  ];
}

/**
 * Returns default empty values for trades where the audit hasn't run yet.
 * Use as a fallback when liveExitAuditVersion is not set.
 */
export function flattenLiveExitAuditDefaults() {
  return Array(LIVE_EXIT_AUDIT_CSV_HEADERS.length).fill("");
}
