import { describe, it, expect } from "vitest";
import { GitHubProfileSchema } from "./github";

const VALID_PROFILE = {
  login: "testuser",
  name: "Test User",
  fetched_at: new Date().toISOString(),
  languages: [{ name: "TypeScript", bytes: 10000, percent: 100 }],
  repos: [
    {
      name: "my-repo",
      url: "https://github.com/testuser/my-repo",
      description: null,
      primary_language: "TypeScript",
      languages: [{ name: "TypeScript", percent: 100 }],
      stars: 5,
      topics: ["nextjs"],
      authored_commits: 42,
      first_commit_at: "2023-01-01T00:00:00.000Z",
      last_commit_at: "2024-01-01T00:00:00.000Z",
      readme_excerpt: "A great project",
      signal_score: 0.75,
    },
  ],
};

describe("GitHubProfileSchema", () => {
  it("accepts a valid profile", () => {
    const result = GitHubProfileSchema.safeParse(VALID_PROFILE);
    expect(result.success).toBe(true);
  });

  it("rejects a missing login field", () => {
    const { login: _login, ...rest } = VALID_PROFILE;
    const result = GitHubProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid fetched_at format", () => {
    const result = GitHubProfileSchema.safeParse({
      ...VALID_PROFILE,
      fetched_at: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts repos with null first/last commit dates", () => {
    const result = GitHubProfileSchema.safeParse({
      ...VALID_PROFILE,
      repos: [
        {
          ...VALID_PROFILE.repos[0],
          first_commit_at: null,
          last_commit_at: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty repos array", () => {
    const result = GitHubProfileSchema.safeParse({
      ...VALID_PROFILE,
      repos: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a repo missing the signal_score field", () => {
    const { signal_score: _s, ...repoWithoutScore } = VALID_PROFILE.repos[0];
    const result = GitHubProfileSchema.safeParse({
      ...VALID_PROFILE,
      repos: [repoWithoutScore],
    });
    expect(result.success).toBe(false);
  });
});
