import { describe, it, expect } from "vitest";
import { canonicalizeSkill, canonicalizeSkills } from "./canonicalize";

describe("canonicalizeSkill", () => {
  it("maps known synonyms to canonical form", () => {
    expect(canonicalizeSkill("js")).toBe("javascript");
    expect(canonicalizeSkill("ts")).toBe("typescript");
    expect(canonicalizeSkill("ReactJS")).toBe("react");
    expect(canonicalizeSkill("react.js")).toBe("react");
    expect(canonicalizeSkill("nodejs")).toBe("node.js");
    expect(canonicalizeSkill("node")).toBe("node.js");
    expect(canonicalizeSkill("k8s")).toBe("kubernetes");
    expect(canonicalizeSkill("postgres")).toBe("postgresql");
    expect(canonicalizeSkill("mongo")).toBe("mongodb");
    expect(canonicalizeSkill("golang")).toBe("go");
    expect(canonicalizeSkill("py")).toBe("python");
  });

  it("passes through unknown skills unchanged (lowercased)", () => {
    expect(canonicalizeSkill("some-unknown-lib")).toBe("some-unknown-lib");
    expect(canonicalizeSkill("MyFramework")).toBe("myframework");
  });

  it("trims whitespace before mapping", () => {
    expect(canonicalizeSkill("  js  ")).toBe("javascript");
    expect(canonicalizeSkill(" TypeScript ")).toBe("typescript");
  });

  it("is case-insensitive for synonym lookup", () => {
    expect(canonicalizeSkill("JS")).toBe("javascript");
    expect(canonicalizeSkill("Js")).toBe("javascript");
    expect(canonicalizeSkill("REACTJS")).toBe("react");
  });
});

describe("canonicalizeSkills", () => {
  it("maps each skill through the synonym map", () => {
    expect(canonicalizeSkills(["js", "ts", "ReactJS"])).toEqual([
      "javascript",
      "typescript",
      "react",
    ]);
  });

  it("deduplicates skills that map to the same canonical form", () => {
    const result = canonicalizeSkills(["js", "javascript", "JS"]);
    expect(result).toEqual(["javascript"]);
  });

  it("deduplicates mixed synonym + explicit canonical", () => {
    const result = canonicalizeSkills(["node", "nodejs", "node.js"]);
    expect(result).toEqual(["node.js"]);
  });

  it("returns empty array for empty input", () => {
    expect(canonicalizeSkills([])).toEqual([]);
  });

  it("preserves unknown skills that don't need canonicalization", () => {
    const result = canonicalizeSkills(["rust", "elixir", "haskell"]);
    expect(result).toEqual(["rust", "elixir", "haskell"]);
  });

  it("mixes known and unknown skills correctly", () => {
    const result = canonicalizeSkills(["js", "rust", "postgres"]);
    expect(result).toEqual(["javascript", "rust", "postgresql"]);
  });
});
