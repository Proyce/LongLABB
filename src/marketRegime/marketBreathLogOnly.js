export function computeMarketBreathLogOnly(marketRegime) {
  const reasons = [];
  let score = 0;

  // Handle both nested (actual snapshot) and flat field names
  const btcMicro      = marketRegime?.btc?.microDirectionLabel      ?? marketRegime?.btcMicroDirectionLabel;
  const btcTactical   = marketRegime?.btc?.tacticalDirectionLabel   ?? marketRegime?.btcTacticalDirectionLabel;
  const btcStructural = marketRegime?.btc?.structuralDirectionLabel ?? marketRegime?.btcStructuralDirectionLabel;
  const btcRegime     = marketRegime?.btc?.regime                   ?? marketRegime?.btcRegime;
  const btcMomentumPhase = marketRegime?.btc?.momentumPhase         ?? marketRegime?.btcMomentumPhase;

  const ethTactical   = marketRegime?.eth?.tacticalDirectionLabel   ?? marketRegime?.ethTacticalDirectionLabel;
  const ethStructural = marketRegime?.eth?.structuralDirectionLabel ?? marketRegime?.ethStructuralDirectionLabel;
  const ethRegime     = marketRegime?.eth?.regime                   ?? marketRegime?.ethRegime;

  const alignment = marketRegime?.crossMarket?.btcEthAlignmentLabel ?? marketRegime?.btcEthAlignmentLabel;
  const breadth   = marketRegime?.breadth?.breadthLabel             ?? marketRegime?.breadthLabel;

  if (btcStructural === "FLAT") {
    score += 18;
    reasons.push("BTC_STRUCTURAL_FLAT_GOOD_FOR_SELECTIVE_SHORTS");
  }

  if (alignment === "BTC_ETH_MIXED" || alignment === "BTC_ETH_RANGE") {
    score += 15;
    reasons.push(`${alignment}_GOOD_BREATH`);
  }

  if (btcMicro === "DOWN" || btcTactical === "DOWN") {
    score += 8;
    reasons.push("BTC_CONTROLLED_DOWN");
  }

  if (ethTactical === "DOWN" || ethStructural === "DOWN") {
    score += 8;
    reasons.push("ETH_DOWN_SUPPORT");
  }

  if (btcTactical === "STRONG_DOWN") {
    score -= 25;
    reasons.push("BTC_TACTICAL_STRONG_DOWN_BOUNCE_RISK");
  }

  if (btcRegime === "BOUNCE_IN_DOWNTREND") {
    score -= 35;
    reasons.push("BTC_BOUNCE_IN_DOWNTREND_DANGER");
  }

  if (btcMomentumPhase === "BULLISH_REVERSAL_ATTEMPT") {
    score -= 25;
    reasons.push("BTC_BULLISH_REVERSAL_ATTEMPT");
  }

  if (alignment === "BTC_ETH_STRONG_BEARISH_ALIGNMENT") {
    score -= 20;
    reasons.push("BTC_ETH_STRONG_BEARISH_ALIGNMENT_PANIC_RISK");
  }

  if (ethRegime === "BOUNCE_IN_DOWNTREND" || ethStructural === "STRONG_DOWN") {
    score -= 20;
    reasons.push("ETH_BOUNCE_OR_STRONG_DOWN_RISK");
  }

  if (breadth === "BREADTH_BULLISH" || breadth === "BREADTH_STRONGLY_BULLISH") {
    score -= 15;
    reasons.push("BREADTH_BULLISH_HEADWIND");
  }

  if (breadth === "BREADTH_INSUFFICIENT") {
    reasons.push("BREADTH_NOT_AVAILABLE_NO_SCORE_IMPACT");
  }

  const clamped = Math.max(-100, Math.min(100, score));

  const label =
    clamped >= 30  ? "SHORT_BREATH_CLEAR"
    : clamped >= 10  ? "SHORT_BREATH_CONTROLLED"
    : clamped >= -5  ? "SHORT_BREATH_MIXED_OK"
    : clamped >= -25 ? "SHORT_BREATH_STRICT"
    : clamped >= -45 ? "SHORT_BREATH_BOUNCE_TRAP_RISK"
    : "SHORT_BREATH_HARD_DANGER";

  return {
    marketBreathScore:    clamped,
    marketBreathLabel:    label,
    marketBreathWouldBlock:
      label === "SHORT_BREATH_HARD_DANGER",
    marketBreathWouldReduceCapacity:
      label === "SHORT_BREATH_STRICT" ||
      label === "SHORT_BREATH_BOUNCE_TRAP_RISK",
    marketBreathReasons:  reasons,
  };
}
