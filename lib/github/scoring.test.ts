import { describe, it, expect } from "vitest";
import { computeSignalScore } from "./scoring";

const BASE_REPO = {
  primary_language: null,
  languages: [] as { name: string; percent: number }[],
  stars: 0,
  authored_commits: 0,
  last_commit_at: null,
  readme_excerpt: "",
};

describe("computeSignalScore", () => {
  it("returns 0 for a repo with no signal at all", () => {
    const score = computeSignalScore(BASE_REPO, "user");
    expect(score).toBe(0);
  });

  it("total score is between 0 and 1 for a perfect repo", () => {
    const score = computeSignalScore(
      {
        primary_language: "TypeScript",
        languages: [{ name: "TypeScript", percent: 100 }],
        stars: 1000,
        authored_commits: 100,
        last_commit_at: new Date().toISOString(),
        readme_excerpt: "# Title\n" + "x".repeat(250) + "\n```js\ncode\n```",
      },
      "user"
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  describe("recency factor", () => {
    it("recent repos score higher than old repos", () => {
      const recent = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

      const recentScore = computeSignalScore({ ...BASE_REPO, last_commit_at: recent }, "user");
      const oldScore = computeSignalScore({ ...BASE_REPO, last_commit_at: old }, "user");

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it("null last_commit_at contributes 0 to recency", () => {
      const withDate = computeSignalScore(
        { ...BASE_REPO, last_commit_at: new Date().toISOString() },
        "user"
      );
      const withNull = computeSignalScore({ ...BASE_REPO, last_commit_at: null }, "user");
      expect(withDate).toBeGreaterThan(withNull);
    });
  });

  describe("commit volume", () => {
    it("more commits score higher than fewer", () => {
      const manyCommits = computeSignalScore({ ...BASE_REPO, authored_commits: 50 }, "user");
      const fewCommits = computeSignalScore({ ...BASE_REPO, authored_commits: 1 }, "user");
      expect(manyCommits).toBeGreaterThan(fewCommits);
    });

    it("commit volume is capped — 1000 commits scores same as 100", () => {
      const cap = computeSignalScore({ ...BASE_REPO, authored_commits: 100 }, "user");
      const overCap = computeSignalScore({ ...BASE_REPO, authored_commits: 1000 }, "user");
      expect(overCap).toBeCloseTo(cap, 10);
    });
  });

  describe("language weight", () => {
    it("uses primary language byte share when no targetLanguages", () => {
      const repo = {
        ...BASE_REPO,
        primary_language: "TypeScript",
        languages: [
          { name: "TypeScript", percent: 80 },
          { name: "JavaScript", percent: 20 },
        ],
      };
      const score = computeSignalScore(repo, "user");
      // Only language_weight component: 0.20 * 0.80 = 0.16
      expect(score).toBeCloseTo(0.16, 5);
    });

    it("uses targetLanguages byte share when provided", () => {
      const repo = {
        ...BASE_REPO,
        primary_language: "TypeScript",
        languages: [
          { name: "TypeScript", percent: 80 },
          { name: "Python", percent: 20 },
        ],
      };
      const tsScore = computeSignalScore(repo, "user", ["TypeScript"]);
      const pyScore = computeSignalScore(repo, "user", ["Python"]);
      expect(tsScore).toBeGreaterThan(pyScore);
    });

    it("returns 0 language weight when no languages are present", () => {
      const score = computeSignalScore(
        { ...BASE_REPO, primary_language: "TypeScript", languages: [] },
        "user"
      );
      expect(score).toBe(0);
    });
  });

  describe("readme quality", () => {
    it("empty readme contributes 0", () => {
      expect(computeSignalScore({ ...BASE_REPO, readme_excerpt: "" }, "user")).toBe(0);
    });

    it("short readme without headings or code contributes 0", () => {
      expect(computeSignalScore({ ...BASE_REPO, readme_excerpt: "short" }, "user")).toBe(0);
    });

    it("full-quality readme (length + headings + code) scores max", () => {
      const fullReadme = "# Project\n" + "a".repeat(250) + "\n```js\ncode\n```";
      const maxLangScore = computeSignalScore(
        {
          ...BASE_REPO,
          readme_excerpt: fullReadme,
          primary_language: "TypeScript",
          languages: [{ name: "TypeScript", percent: 100 }],
        },
        "user"
      );
      const noReadmeScore = computeSignalScore(
        {
          ...BASE_REPO,
          primary_language: "TypeScript",
          languages: [{ name: "TypeScript", percent: 100 }],
        },
        "user"
      );
      // readme_quality contribution = 0.15 * 1.0 = 0.15
      expect(maxLangScore - noReadmeScore).toBeCloseTo(0.15, 5);
    });
  });

  describe("popularity", () => {
    it("more stars score higher", () => {
      const highStars = computeSignalScore({ ...BASE_REPO, stars: 500 }, "user");
      const lowStars = computeSignalScore({ ...BASE_REPO, stars: 1 }, "user");
      expect(highStars).toBeGreaterThan(lowStars);
    });

    it("popularity is capped at 1000 stars", () => {
      const atCap = computeSignalScore({ ...BASE_REPO, stars: 1000 }, "user");
      const overCap = computeSignalScore({ ...BASE_REPO, stars: 100000 }, "user");
      expect(overCap).toBeCloseTo(atCap, 10);
    });
  });
});
