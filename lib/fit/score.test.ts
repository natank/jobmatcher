import { describe, it, expect } from "vitest";
import { computeCoverage, combinedScore } from "./score";

describe("computeCoverage", () => {
  it("returns full required coverage when all required skills are present", () => {
    const result = computeCoverage(
      ["react", "typescript"],
      ["node.js"],
      ["react", "typescript", "node.js"],
      [],
      "senior"
    );

    expect(result.matched_required).toEqual(
      expect.arrayContaining(["react", "typescript", "node.js"])
    );
    expect(result.missing_required).toHaveLength(0);
    // coverage = 0.6 * 1.0 + 0.25 * 0 + 0.15 * 0.5 = 0.675
    expect(result.coverage).toBeCloseTo(0.675);
  });

  it("returns zero required coverage when no required skills match", () => {
    const result = computeCoverage(["python"], [], ["react", "typescript"], [], "mid");

    expect(result.matched_required).toHaveLength(0);
    expect(result.missing_required).toEqual(expect.arrayContaining(["react", "typescript"]));
    // coverage = 0.6 * 0 + 0.25 * 0 + 0.15 * 0.5 = 0.075
    expect(result.coverage).toBeCloseTo(0.075);
  });

  it("includes preferred coverage in score", () => {
    const result = computeCoverage(
      ["react", "docker"],
      [],
      ["react"],
      ["docker", "kubernetes"],
      "mid"
    );

    expect(result.matched_preferred).toContain("docker");
    expect(result.matched_preferred).not.toContain("kubernetes");
    // required_coverage = 1.0, preferred_coverage = 0.5, seniority = 0.5 (unknown resume)
    // coverage = 0.6*1.0 + 0.25*0.5 + 0.15*0.5 = 0.6 + 0.125 + 0.075 = 0.8
    expect(result.coverage).toBeCloseTo(0.8);
  });

  it("handles seniority match: aligned levels give 1.0 seniority score", () => {
    const result = computeCoverage(["react"], [], ["react"], [], "senior", "senior");

    // seniority_match = 1.0
    // coverage = 0.6*1.0 + 0.25*0 + 0.15*1.0 = 0.75
    expect(result.coverage).toBeCloseTo(0.75);
  });

  it("handles seniority match: adjacent levels give 0.5 seniority score", () => {
    const result = computeCoverage(["react"], [], ["react"], [], "senior", "mid");

    // seniority_match = 0.5
    // coverage = 0.6*1.0 + 0.25*0 + 0.15*0.5 = 0.675
    expect(result.coverage).toBeCloseTo(0.675);
  });

  it("handles seniority match: far levels give 0 seniority score", () => {
    const result = computeCoverage(["react"], [], ["react"], [], "lead", "junior");

    // seniority_match = 0 (diff = 3)
    // coverage = 0.6*1.0 + 0.25*0 + 0.15*0 = 0.6
    expect(result.coverage).toBeCloseTo(0.6);
  });

  it("defaults to 0.5 seniority score when resume seniority is unknown", () => {
    const withUnknown = computeCoverage(["react"], [], ["react"], [], "senior", "unknown");
    const withUndefined = computeCoverage(["react"], [], ["react"], [], "senior");

    // Both should produce seniority_match = 0.5
    expect(withUnknown.coverage).toBeCloseTo(withUndefined.coverage);
    expect(withUnknown.coverage).toBeCloseTo(0.675);
  });

  it("handles empty required skills list (returns 0 required_coverage)", () => {
    const result = computeCoverage(
      ["react"],
      [],
      [], // no required skills
      ["docker"],
      "mid"
    );

    expect(result.matched_required).toHaveLength(0);
    expect(result.missing_required).toHaveLength(0);
    // coverage = 0.6*0 + 0.25*0 + 0.15*0.5 = 0.075
    expect(result.coverage).toBeCloseTo(0.075);
  });

  it("collects tech from resumeTech alongside resumeSkills", () => {
    const result = computeCoverage(
      [], // no explicit skills
      ["react", "typescript"], // tech from projects
      ["react", "typescript"],
      [],
      "mid"
    );

    expect(result.matched_required).toEqual(expect.arrayContaining(["react", "typescript"]));
    expect(result.missing_required).toHaveLength(0);
  });

  it("canonicalizes synonym skills (ReactJS → react)", () => {
    const result = computeCoverage(["ReactJS"], [], ["react"], [], "mid");

    expect(result.matched_required).toContain("react");
    expect(result.missing_required).toHaveLength(0);
  });
});

describe("combinedScore", () => {
  it("returns 1 at minimum (coverage=0, aiQuality=0)", () => {
    expect(combinedScore(0, 0)).toBe(1);
  });

  it("returns 5 at maximum (coverage=1, aiQuality=1)", () => {
    expect(combinedScore(1, 1)).toBe(5);
  });

  it("returns correct midpoint score", () => {
    // raw = 0.7 * 0.5 + 0.3 * 0.5 = 0.5
    // Math.round(1 + 0.5 * 4) = Math.round(3) = 3
    expect(combinedScore(0.5, 0.5)).toBe(3);
  });

  it("weights coverage at 70% and ai_quality at 30%", () => {
    // High coverage, low ai_quality
    // raw = 0.7 * 1.0 + 0.3 * 0 = 0.7 → score = Math.round(1 + 0.7*4) = Math.round(3.8) = 4
    expect(combinedScore(1, 0)).toBe(4);

    // Low coverage, high ai_quality
    // raw = 0.7 * 0 + 0.3 * 1.0 = 0.3 → score = Math.round(1 + 0.3*4) = Math.round(2.2) = 2
    expect(combinedScore(0, 1)).toBe(2);
  });

  it("clamps score between 1 and 5 for extreme inputs", () => {
    expect(combinedScore(-0.5, -0.5)).toBe(1);
    expect(combinedScore(2, 2)).toBe(5);
  });
});
