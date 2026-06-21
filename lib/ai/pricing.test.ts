import { describe, it, expect } from "vitest";
import { estimateCost } from "./pricing";

describe("estimateCost", () => {
  describe("claude-sonnet-4-5 ($3.00 input / $15.00 output per 1M tokens)", () => {
    it("returns correct cost for 1M input + 1M output tokens", () => {
      const cost = estimateCost("claude-sonnet-4-5", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(18.0, 6);
    });

    it("returns correct cost for a typical call (1240 input, 890 output)", () => {
      // (1240 / 1_000_000) * 3.0 + (890 / 1_000_000) * 15.0
      const expected = (1240 / 1_000_000) * 3.0 + (890 / 1_000_000) * 15.0;
      expect(estimateCost("claude-sonnet-4-5", 1240, 890)).toBeCloseTo(expected, 8);
    });

    it("returns 0 for zero tokens", () => {
      expect(estimateCost("claude-sonnet-4-5", 0, 0)).toBe(0);
    });

    it("returns input-only cost when output tokens are 0", () => {
      const cost = estimateCost("claude-sonnet-4-5", 1_000_000, 0);
      expect(cost).toBeCloseTo(3.0, 6);
    });

    it("returns output-only cost when input tokens are 0", () => {
      const cost = estimateCost("claude-sonnet-4-5", 0, 1_000_000);
      expect(cost).toBeCloseTo(15.0, 6);
    });
  });

  describe("claude-haiku-3-5 ($0.80 input / $4.00 output per 1M tokens)", () => {
    it("returns correct cost for 1M input + 1M output tokens", () => {
      const cost = estimateCost("claude-haiku-3-5", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(4.8, 6);
    });

    it("returns correct cost for a typical call", () => {
      const expected = (500 / 1_000_000) * 0.8 + (300 / 1_000_000) * 4.0;
      expect(estimateCost("claude-haiku-3-5", 500, 300)).toBeCloseTo(expected, 8);
    });
  });

  describe("unknown model", () => {
    it("returns 0 for an unrecognised model", () => {
      expect(estimateCost("claude-opus-99", 1_000_000, 1_000_000)).toBe(0);
    });

    it("returns 0 for an empty model string", () => {
      expect(estimateCost("", 100, 100)).toBe(0);
    });
  });
});
