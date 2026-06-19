// ─── AES DISCOVERY SCORE MODULE ───────────────────────────────────────────────
// Computes aesFull, aesNoRank, aesSetupOnly from one telemetry snapshot.
// All variants call the canonical V3 scorer with component flags.
// Never calculates aesNoRank by subtracting guessed points.

import { computeAbsoluteEntryScoreV3 } from "../scoring/absoluteEntryScore/absoluteEntryScore.scorer.js";
import { ABSOLUTE_ENTRY_SCORE_VERSION } from "../scoring/absoluteEntryScore/absoluteEntryScore.config.js";

const AES_CONFIG_OVERRIDES = {
  logOnly: true,
  allowExecutionImpact: false,
};

// ── Score variants ────────────────────────────────────────────────────────────

function safeScore(snapshot, componentOptions) {
  try {
    return computeAbsoluteEntryScoreV3(snapshot, AES_CONFIG_OVERRIDES, componentOptions);
  } catch (err) {
    console.warn("[AES_DISCOVERY_SCORE] scorer error", err?.message);
    return null;
  }
}

export function computeDiscoveryAesVariants(snapshot) {
  // aesFull: canonical AES with all components
  const fullResult = safeScore(snapshot, {
    includeRankInBucket: true,
    includeSideSpecificLeaderboardBonus: true,
  });

  // aesNoRank: exclude entryRankInBucket only
  const noRankResult = safeScore(snapshot, {
    includeRankInBucket: false,
    includeSideSpecificLeaderboardBonus: true,
  });

  // aesSetupOnly: exclude rank + leaderboard bonuses
  const setupOnlyResult = safeScore(snapshot, {
    includeRankInBucket: false,
    includeSideSpecificLeaderboardBonus: false,
  });

  const aesFull      = fullResult?.absoluteEntryScore ?? null;
  const aesNoRank    = noRankResult?.absoluteEntryScore ?? null;
  const aesSetupOnly = setupOnlyResult?.absoluteEntryScore ?? null;

  // Disagreement fields
  const aesFullMinusNoRank    = aesFull != null && aesNoRank != null    ? aesFull - aesNoRank    : null;
  const aesFullMinusSetupOnly = aesFull != null && aesSetupOnly != null ? aesFull - aesSetupOnly : null;
  const aesNoRankMinusSetupOnly = aesNoRank != null && aesSetupOnly != null ? aesNoRank - aesSetupOnly : null;

  // Rank contribution net: sum of EXECUTION family rank contributions in aesFull
  const rankContributionNet = _computeRankContribution(fullResult);

  // 24h magnitude is not a discrete scoring component in V3 — field is null
  const change24hContributionNet = null;

  return {
    aesFull,
    aesNoRank,
    aesSetupOnly,
    aesFullResult:      fullResult,
    aesNoRankResult:    noRankResult,
    aesSetupOnlyResult: setupOnlyResult,

    aesFullMinusNoRank,
    aesFullMinusSetupOnly,
    aesNoRankMinusSetupOnly,
    rankContributionNet,
    change24hContributionNet,

    scoreVersion: ABSOLUTE_ENTRY_SCORE_VERSION,
  };
}

function _computeRankContribution(result) {
  if (!result) return null;
  const pos = result.absoluteEntryPositiveContributions ?? [];
  const neg = result.absoluteEntryNegativeContributions ?? [];
  const all = [...pos, ...neg];
  const rankContribs = all.filter(c => c.family === "EXECUTION" && c.code && c.code.startsWith("RANK"));
  return rankContribs.reduce((sum, c) => sum + (c.points ?? 0), 0);
}

// ── Universal long gate check ─────────────────────────────────────────────────
// Passes when the snapshot shows long-continuation confirmation signals.

export function checkUniversalLongGate(snapshot, fullResult) {
  if (!snapshot || !fullResult) return false;
  const activeGreen  = snapshot.immediateGreenImpulse === true || snapshot.greenImpulseDetected === true;
  const immediateRed = snapshot.immediateRedImpulse === true;
  const atrActive    = (snapshot.atrPct ?? 0) >= 0.2;
  const cvdBull      = snapshot.cvdLabel === "BULL";
  return activeGreen && !immediateRed && atrActive && cvdBull;
}

// Legacy alias — kept for archive/cross-side research only
export { checkUniversalLongGate as checkUniversalShortGate };
