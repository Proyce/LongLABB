import { describe, expect, it } from "vitest";
import {
  buildTickDirectionOutcomeDefaults,
  censorUnfilledTickDirectionOutcomes,
  updateTickDirectionOutcomeAudit,
} from "./tickDirectionOutcomeAudit.js";

describe("tick direction fixed-horizon audit", () => {
  it("fills each horizon once with symmetric prediction correctness", () => {
    const trade = {
      entryTime: 1_000,
      entryPrice: 100,
      marketTickDirectionVerdict: "UP",
      ...buildTickDirectionOutcomeDefaults({ entrySpreadPct: 0 }),
    };
    const first = updateTickDirectionOutcomeAudit({
      trade, currentPrice: 100.1, observedAt: 2_050, source: "AGG_TRADE",
    });
    expect(first.marketTickPredictionResult1s).toBe("CORRECT");
    expect(first.marketTickPredictionCorrect1s).toBe(true);
    const second = updateTickDirectionOutcomeAudit({
      trade: { ...trade, ...first }, currentPrice: 90, observedAt: 2_100, source: "AGG_TRADE",
    });
    expect(second.marketTickPredictionResult1s).toBeUndefined();
  });

  it("uses the frozen neutral threshold and censors unfilled horizons", () => {
    const trade = {
      entryTime: 0,
      entryPrice: 100,
      marketTickDirectionVerdict: "DOWN",
      ...buildTickDirectionOutcomeDefaults({ entrySpreadPct: 0.02 }),
    };
    const update = updateTickDirectionOutcomeAudit({
      trade, currentPrice: 99.99, observedAt: 1_000, source: "BOOK_TICKER",
    });
    expect(update.marketTickPredictionResult1s).toBe("NEUTRAL_TARGET");
    const censored = censorUnfilledTickDirectionOutcomes({ ...trade, ...update });
    expect(censored.marketTickPredictionResult3s).toBe("CENSORED");
  });
});
