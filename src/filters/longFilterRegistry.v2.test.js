import { describe, expect, it } from "vitest";
import { LONG_FILTER_REGISTRY } from "./longFilterRegistry.js";
import { FIELD_TYPE } from "./longFilterConstants.js";

const REQUIRED_IDS = [
  "LONG_GATE_TIER",
  "LONG_GATE_RESEARCH_BAND_V2",
  "LONG_MICRO_UP_CONFIRMATION",
  "LONG_MICRO_UP_CONFIRMATION_REASONS",
  "RSI_LONG_MOMENTUM_EXPANSION",
  "MACD_BULLISH_EXPANSION",
  "TOP_LOSER_THESIS_LANE",
  "ACTIVE_WINNING_SETUP_IDS",
  "LONG_WINNING_SETUP_CATALOG_VERSION",
];

describe("Long filter registry V2 integrity", () => {
  it("has unique IDs and contains every June 16 canonical filter", () => {
    const ids = LONG_FILTER_REGISTRY.map(filter => filter.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED_IDS) expect(ids, id).toContain(id);
  });

  it("defines valid enum presets and never marks a research filter execution-safe", () => {
    for (const filter of LONG_FILTER_REGISTRY) {
      expect(filter.executionSafe, filter.id).toBe(false);
      if (filter.fieldType === FIELD_TYPE.ENUM && filter.presets) {
        expect(Array.isArray(filter.presets), filter.id).toBe(true);
      }
      if (filter.enumValues) {
        expect(new Set(filter.enumValues).size, filter.id).toBe(filter.enumValues.length);
      }
    }
  });

  it("exposes the calibrated Gate score presets", () => {
    const gate = LONG_FILTER_REGISTRY.find(filter => filter.id === "LONG_GATE_SCORE");
    expect(gate.presets).toEqual([60, 75, 85, 90, 95]);
  });
});
