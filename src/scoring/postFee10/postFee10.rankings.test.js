import { describe, expect, it } from "vitest";
import { assignAllPostFee10WinnerRanks, assignWinnerRanks } from "./index.js";

function trade(overrides) {
  return {
    id: overrides.id,
    run: overrides.run ?? 1,
    setId: overrides.setId ?? "s1",
    autoRunId: overrides.autoRunId ?? "b1",
    closed: true,
    closedAt: overrides.closedAt ?? Date.now(),
    entryTime: overrides.entryTime ?? Date.now() - 10_000,
    feeAdjustedFinalPnlPct: overrides.pnl,
    ...overrides,
  };
}

describe("assignWinnerRanks", () => {
  it("ranks top three by feeAdjustedFinalPnlPct", () => {
    const ranked = assignWinnerRanks([
      trade({ id: "a", pnl: 5 }),
      trade({ id: "b", pnl: 20 }),
      trade({ id: "c", pnl: 10 }),
      trade({ id: "d", pnl: 7 }),
    ], "runId");

    expect(ranked.find(t => t.id === "b").bestRankInRun).toBe(1);
    expect(ranked.find(t => t.id === "c").bestRankInRun).toBe(2);
    expect(ranked.find(t => t.id === "d").bestRankInRun).toBe(3);
    expect(ranked.find(t => t.id === "a").isTop3WinnerInRun).toBe(false);
  });

  it("ranks independently for run, set, and batch", () => {
    const ranked = assignAllPostFee10WinnerRanks([
      trade({ id: "r1", run: 1, setId: "s1", autoRunId: "b1", pnl: 10 }),
      trade({ id: "r2", run: 2, setId: "s1", autoRunId: "b1", pnl: 30 }),
      trade({ id: "r3", run: 1, setId: "s2", autoRunId: "b2", pnl: 40 }),
    ]);

    expect(ranked.find(t => t.id === "r1").bestRankInRun).toBe(2);
    expect(ranked.find(t => t.id === "r1").bestRankInSet).toBe(2);
    expect(ranked.find(t => t.id === "r1").bestRankInBatch).toBe(2);
    expect(ranked.find(t => t.id === "r3").bestRankInRun).toBe(1);
    expect(ranked.find(t => t.id === "r3").bestRankInSet).toBe(1);
    expect(ranked.find(t => t.id === "r3").bestRankInBatch).toBe(1);
  });

  it("does not duplicate ranks for duplicate exports", () => {
    const ranked = assignWinnerRanks([
      trade({ id: "dup", pnl: 10 }),
      trade({ id: "dup", pnl: 10 }),
      trade({ id: "x", pnl: 9 }),
    ], "runId");

    expect(ranked.filter(t => t.bestRankInRun === 1)).toHaveLength(1);
    expect(ranked.find(t => t.id === "x").bestRankInRun).toBe(2);
  });

  it("excludes open trades", () => {
    const ranked = assignWinnerRanks([
      trade({ id: "open", pnl: 100, closed: false }),
      trade({ id: "closed", pnl: 10 }),
    ], "runId");

    expect(ranked.find(t => t.id === "open").bestRankInRun).toBeNull();
    expect(ranked.find(t => t.id === "closed").bestRankInRun).toBe(1);
  });

  it("excludes missing PnL trades", () => {
    const ranked = assignWinnerRanks([
      trade({ id: "missing", pnl: null }),
      trade({ id: "closed", pnl: 10 }),
    ], "runId");

    expect(ranked.find(t => t.id === "missing").bestRankInRun).toBeNull();
    expect(ranked.find(t => t.id === "closed").bestRankInRun).toBe(1);
  });

  it("breaks ties deterministically", () => {
    const ranked = assignWinnerRanks([
      trade({ id: "b", pnl: 10, closedAt: 200, entryTime: 100 }),
      trade({ id: "a", pnl: 10, closedAt: 100, entryTime: 100 }),
      trade({ id: "c", pnl: 10, closedAt: 200, entryTime: 50 }),
    ], "runId");

    expect(ranked.find(t => t.id === "a").bestRankInRun).toBe(1);
    expect(ranked.find(t => t.id === "c").bestRankInRun).toBe(2);
    expect(ranked.find(t => t.id === "b").bestRankInRun).toBe(3);
  });
});

