import { describe, it, expect, vi, beforeEach } from "vitest";
import { ingest } from "./ingest";
import * as client from "./client";

vi.mock("./client");

const MOCK_USER: client.GitHubUser = { login: "testuser", name: "Test User" };

function makeRepo(overrides: Partial<client.GitHubRepo> = {}): client.GitHubRepo {
  return {
    name: "repo",
    html_url: "https://github.com/testuser/repo",
    description: null,
    fork: false,
    language: "TypeScript",
    stargazers_count: 0,
    topics: [],
    pushed_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeCommit(date = new Date().toISOString()): client.GitHubCommit {
  return {
    commit: { author: { date }, committer: { date } },
  };
}

describe("ingest", () => {
  beforeEach(() => {
    vi.mocked(client.fetchUser).mockResolvedValue(MOCK_USER);
    vi.mocked(client.fetchLanguages).mockResolvedValue({ TypeScript: 1000 });
    vi.mocked(client.fetchReadme).mockResolvedValue("readme content");
  });

  it("excludes repos with 0 authored commits", async () => {
    vi.mocked(client.fetchRepos).mockResolvedValue([makeRepo()]);
    vi.mocked(client.fetchCommits).mockResolvedValue([]);

    const profile = await ingest("token");
    expect(profile.repos).toHaveLength(0);
  });

  it("excludes fork repos with 0 authored commits", async () => {
    vi.mocked(client.fetchRepos).mockResolvedValue([makeRepo({ fork: true, name: "forked-repo" })]);
    vi.mocked(client.fetchCommits).mockResolvedValue([]);

    const profile = await ingest("token");
    expect(profile.repos).toHaveLength(0);
  });

  it("includes fork repos that have authored commits", async () => {
    vi.mocked(client.fetchRepos).mockResolvedValue([makeRepo({ fork: true, name: "forked-repo" })]);
    vi.mocked(client.fetchCommits).mockResolvedValue([makeCommit()]);

    const profile = await ingest("token");
    expect(profile.repos).toHaveLength(1);
  });

  it("caps output at top 20 repos by signal score", async () => {
    const repos = Array.from({ length: 25 }, (_, i) => makeRepo({ name: `repo-${i}` }));
    vi.mocked(client.fetchRepos).mockResolvedValue(repos);
    vi.mocked(client.fetchCommits).mockResolvedValue([makeCommit()]);

    const profile = await ingest("token");
    expect(profile.repos).toHaveLength(20);
  });

  it("returns a validated GitHubProfile with correct user fields", async () => {
    vi.mocked(client.fetchRepos).mockResolvedValue([makeRepo()]);
    vi.mocked(client.fetchCommits).mockResolvedValue([makeCommit()]);

    const profile = await ingest("token");
    expect(profile.login).toBe("testuser");
    expect(profile.name).toBe("Test User");
    expect(profile.fetched_at).toBeDefined();
  });

  it("falls back to login as name when user.name is null", async () => {
    vi.mocked(client.fetchUser).mockResolvedValue({
      login: "testuser",
      name: null,
    });
    vi.mocked(client.fetchRepos).mockResolvedValue([]);

    const profile = await ingest("token");
    expect(profile.name).toBe("testuser");
  });

  it("aggregates language bytes across all filtered repos", async () => {
    vi.mocked(client.fetchRepos).mockResolvedValue([
      makeRepo({ name: "repo1" }),
      makeRepo({ name: "repo2" }),
    ]);
    vi.mocked(client.fetchCommits).mockResolvedValue([makeCommit()]);
    vi.mocked(client.fetchLanguages).mockResolvedValue({ TypeScript: 500 });

    const profile = await ingest("token");
    const tsLang = profile.languages.find((l) => l.name === "TypeScript");
    expect(tsLang?.bytes).toBe(1000);
  });

  it("includes readme_excerpt from fetchReadme", async () => {
    vi.mocked(client.fetchRepos).mockResolvedValue([makeRepo()]);
    vi.mocked(client.fetchCommits).mockResolvedValue([makeCommit()]);
    vi.mocked(client.fetchReadme).mockResolvedValue("# My Project\nGreat stuff");

    const profile = await ingest("token");
    expect(profile.repos[0].readme_excerpt).toBe("# My Project\nGreat stuff");
  });
});
