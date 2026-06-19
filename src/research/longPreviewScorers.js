// ─── LONG LIVE-PREVIEW SCORERS ───────────────────────────────────────────────
// ENTRY_PREVIEW helpers for the ticker leaderboard display only. These are NOT
// the entry-final research path — that flows exclusively through
// buildLongEntryResearchSnapshot. This module isolates the direct scorer imports
// so the app and entry adapters never import scorers directly (spec §26).
// LOG ONLY — preview scores never gate or affect execution.

import {
  computeLongAbsoluteEntryScoreV1,
  buildLongAesPreviewSnapshot,
} from '../scoring/longAbsoluteEntryScore/index.js';
import { evaluateBestDnaLongAudit } from '../audits/bestDnaLongAudit.js';
import { scoreLongPostFee10Entry } from '../scoring/longPostFee10/index.js';
import { computeLongEntryDangerAuditLogOnly } from '../longAudits/longEntryDangerAuditLogOnly.js';

// AES V3 preview. Always returns a non-null result. Missing kline booleans stay
// null (unknown), never false — missing red is not confirmed absence of red.
export function tickerPreviewScore(kl, ticker, rankIndex, side) {
  const snapshot = buildLongAesPreviewSnapshot({ kl: kl ?? {}, ticker: ticker ?? {}, rankIndex, side });
  return computeLongAbsoluteEntryScoreV1(snapshot);
}

export const tickerAesPreviewScore = (...args) => tickerPreviewScore(...args);

// ─── POST-FEE 10+ PREVIEW ─────────────────────────────────────────────────────
// Dedicated ENTRY_PREVIEW scorer for the ticker leaderboard. Builds canonical
// preview facts, derives a legitimate preview danger tier, then calls the SAME
// canonical LONG Post-Fee entry scorer used at entry-final. It does NOT route
// through Best DNA (which no longer emits Post-Fee fields) — that left the
// Post-Fee preview blank (review P0 blocker 3).
// LOG ONLY — preview scores never gate or affect execution.
export function tickerPostFee10PreviewAssessment(kl, ticker, rankIndex, side) {
  if (!kl || !(kl.entryCvdLabel ?? kl.cvdLabel)) return null;

  // 1) Canonical preview facts (kl + ticker → scorer input fields).
  const anyTrueOrNull = (values) => {
    if (values.some(v => v === true)) return true;
    if (values.some(v => v === false)) return false;
    return null;
  };
  const facts = {
    longParentBucket: side === 'GAINERS' ? 'TOP_GAINER_LONGS' : 'TOP_LOSER_LONGS',
    entryCvdLabel:            kl.entryCvdLabel ?? kl.cvdLabel ?? null,
    cvdImproving:             kl.cvdImproving ?? null,
    spreadPct:                kl.spreadPct ?? null,
    atrPct:                   kl.atrPct ?? null,
    hasGreenConfirmation:     kl.hasGreenConfirmation ?? anyTrueOrNull([kl.immediateGreenImpulse, kl.greenImpulseDetected]),
    longMicroMomentumLabel:   kl.longMicroMomentumLabel ?? null,
    longVwapContextLabel:     kl.longVwapContextLabel ?? null,
    immediateGreenImpulse:    kl.immediateGreenImpulse ?? null,
    greenImpulseDetected:     kl.greenImpulseDetected ?? null,
    immediateRedImpulse:      kl.immediateRedImpulse ?? null,
    redImpulseDetected:       kl.redImpulseDetected ?? null,
    last3TicksDirection:      kl.last3TicksDirection ?? null,
    hasRsiRolloverUp:         kl.hasRsiRolloverUp ?? null,
    greenReacceleration:      kl.greenReacceleration ?? null,
  };

  // 2) Derive a legitimate preview danger tier (a valid scorer input).
  const danger = computeLongEntryDangerAuditLogOnly(facts);
  facts.longAuditDangerTier = danger.longAuditDangerTier;

  // 3) Canonical Post-Fee scorer.
  const scored = scoreLongPostFee10Entry(facts);

  // 4) Mark as a log-only preview that can never affect execution.
  return {
    ...scored,
    sourceTiming:       'ENTRY_PREVIEW',
    logOnly:            true,
    canAffectExecution: false,
  };
}

export function tickerBestDnaPreviewAssessment(kl, ticker, rankIndex, side) {
  if (!kl || !(kl.entryCvdLabel ?? kl.cvdLabel)) return null;
  return evaluateBestDnaLongAudit({
    longParentBucket: side === 'GAINERS' ? 'TOP_GAINER_LONGS' : 'TOP_LOSER_LONGS',
    leaderboardSide: side,
    entryCvdLabel: kl.entryCvdLabel ?? kl.cvdLabel ?? null,
    atrPct: kl.atrPct ?? null,
    volAccel: kl.volAccel ?? null,
    candleColorAtEntry: kl.candleColorAtEntry ?? null,
    immediateRedImpulse: kl.immediateRedImpulse ?? null,
    immediateGreenImpulse: kl.immediateGreenImpulse ?? null,
    redImpulseDetected: kl.redImpulseDetected ?? null,
    greenImpulseDetected: kl.greenImpulseDetected ?? null,
    last3TicksDirection: kl.last3TicksDirection ?? null,
    failedBreakout1m: kl.failedBreakout1m ?? null,
    failedBreakout3m: kl.failedBreakout3m ?? null,
    change24h: ticker ? parseFloat(ticker.priceChangePercent) : null,
    quoteVol: ticker ? parseFloat(ticker.quoteVolume) : null,
    entryRank: rankIndex + 1,
    entryRankInBucket: rankIndex + 1,
  });
}
