export const POST_FEE_10_TIER_LABELS = {
  GOD_TIER: "POST_FEE_10_GOD_TIER",
  SUPER_SNIPER: "POST_FEE_10_SUPER_SNIPER",
  HIGH_QUALITY: "POST_FEE_10_HIGH_QUALITY",
  WATCHLIST: "POST_FEE_10_WATCHLIST",
  LOW_CONFIDENCE: "POST_FEE_10_LOW_CONFIDENCE",
  REJECTED: "POST_FEE_10_REJECTED",
};

export const POST_FEE_10_TIERS = [
  "GOD_TIER",
  "SUPER_SNIPER",
  "HIGH_QUALITY",
  "WATCHLIST",
  "LOW_CONFIDENCE",
  "REJECTED",
];

export function classifyPostFee10Tier(score) {
  if (score >= 92) return "GOD_TIER";
  if (score >= 85) return "SUPER_SNIPER";
  if (score >= 75) return "HIGH_QUALITY";
  if (score >= 65) return "WATCHLIST";
  if (score >= 50) return "LOW_CONFIDENCE";
  return "REJECTED";
}

export function downgradePostFee10Tier(tier) {
  const i = POST_FEE_10_TIERS.indexOf(tier);
  if (i < 0) return "REJECTED";
  return POST_FEE_10_TIERS[Math.min(POST_FEE_10_TIERS.length - 1, i + 1)];
}

export function compactPostFee10Tier(tier) {
  switch (tier) {
    case "GOD_TIER": return "GOD";
    case "SUPER_SNIPER": return "SUPER";
    case "HIGH_QUALITY": return "HIGH";
    case "WATCHLIST": return "WATCH";
    case "LOW_CONFIDENCE": return "LOW";
    case "REJECTED": return "REJ";
    default: return "-";
  }
}

