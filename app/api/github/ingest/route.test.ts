import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client");
vi.mock("@/lib/db/github");
vi.mock("@/lib/github/ingest");

import { POST } from "./route";
import * as dbClient from "@/lib/db/client";
import * as dbGithub from "@/lib/db/github";
import * as githubIngest from "@/lib/github/ingest";
import { GitHubRateLimitError } from "@/lib/github/client";
import type { GitHubProfile } from "@/types/github";

const MOCK_USER = { id: "user-123", email: "user@example.com" };

const MOCK_PROFILE: GitHubProfile = {
  login: "testuser",
  name: "Test User",
  fetched_at: new Date().toISOString(),
  languages: [],
  repos: [],
};

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/github/ingest", {
    method: "POST",
  });
}

describe("POST /api/github/ingest", () => {
  let mockSupabase: {
    auth: {
      getUser: ReturnType<typeof vi.fn>;
      getSession: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { provider_token: "gh_token_123" } },
          error: null,
        }),
      },
    };

    vi.mocked(dbClient.createSupabaseServerClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof dbClient.createSupabaseServerClient>
    );
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(null);
    vi.mocked(dbGithub.upsertGitHubProfile).mockResolvedValue(undefined);
    vi.mocked(githubIngest.ingest).mockResolvedValue(MOCK_PROFILE);
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when the GitHub provider token is missing", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { provider_token: null } },
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 401 when session is null", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns cached profile when fetched_at is within 7 days", async () => {
    const recentProfile: GitHubProfile = {
      ...MOCK_PROFILE,
      fetched_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(recentProfile);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(githubIngest.ingest).not.toHaveBeenCalled();
    expect(dbGithub.upsertGitHubProfile).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.profile.login).toBe("testuser");
  });

  it("re-ingests when cached profile is older than 7 days", async () => {
    const staleProfile: GitHubProfile = {
      ...MOCK_PROFILE,
      fetched_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(staleProfile);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(githubIngest.ingest).toHaveBeenCalledWith("gh_token_123");
  });

  it("happy path: ingests, upserts, and returns profile", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(githubIngest.ingest).toHaveBeenCalledWith("gh_token_123");
    expect(dbGithub.upsertGitHubProfile).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      MOCK_PROFILE.login,
      MOCK_PROFILE
    );
    const body = await res.json();
    expect(body.profile).toEqual(MOCK_PROFILE);
  });

  it("returns 429 with retry_after when GitHub is rate-limited", async () => {
    vi.mocked(githubIngest.ingest).mockRejectedValue(new GitHubRateLimitError(60));

    const res = await POST();

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("rate limit");
    expect(body.retry_after).toBe(60);
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(githubIngest.ingest).mockRejectedValue(new Error("Unexpected"));

    const res = await POST();

    expect(res.status).toBe(500);
  });
});
