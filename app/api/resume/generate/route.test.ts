import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client");
vi.mock("@/lib/db/github");
vi.mock("@/lib/db/resume");
vi.mock("@/lib/ai/client");
vi.mock("node:fs/promises");

import { POST } from "./route";
import * as dbClient from "@/lib/db/client";
import * as dbGithub from "@/lib/db/github";
import * as dbResume from "@/lib/db/resume";
import * as aiClient from "@/lib/ai/client";
import * as fs from "node:fs/promises";
import type { GitHubProfile } from "@/types/github";
import type { ResumeContent } from "@/types/resume";

const MOCK_USER = { id: "user-456", email: "dev@example.com" };

const MOCK_PROFILE: GitHubProfile = {
  login: "devuser",
  name: "Dev User",
  fetched_at: new Date().toISOString(),
  languages: [{ name: "TypeScript", bytes: 50000, percent: 80 }],
  repos: [],
};

const MOCK_CONTENT: ResumeContent = {
  summary: "Experienced TypeScript developer with a focus on backend systems.",
  skills: ["TypeScript", "Node.js"],
  experience: [
    {
      project: "my-project",
      url: "https://github.com/devuser/my-project",
      bullets: ["Built a REST API", "Reduced latency by 30%"],
      technologies: ["TypeScript", "Node.js"],
    },
  ],
};

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost:3000/api/resume/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/resume/generate", () => {
  let mockSupabase: {
    auth: { getUser: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
      },
    };

    vi.mocked(dbClient.createSupabaseServerClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof dbClient.createSupabaseServerClient>
    );
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(MOCK_PROFILE);
    vi.mocked(dbResume.createResume).mockResolvedValue({ id: "resume-123" });
    vi.mocked(aiClient.callClaude).mockResolvedValue(MOCK_CONTENT);
    vi.mocked(fs.readFile).mockResolvedValue("system prompt content" as never);
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when no GitHub profile exists", async () => {
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("GitHub profile not found");
  });

  it("happy path: calls callClaude with profile, persists, returns resume_id and content", async () => {
    const res = await POST(makeRequest({ target_role: "Senior Engineer" }));

    expect(res.status).toBe(200);

    expect(aiClient.callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: expect.anything(),
        feature: "resume-generate",
        systemPrompt: "system prompt content",
        userMessage: expect.stringContaining("Senior Engineer"),
      })
    );

    expect(dbResume.createResume).toHaveBeenCalledWith(mockSupabase, MOCK_USER.id, MOCK_CONTENT);

    const body = await res.json();
    expect(body.resume_id).toBe("resume-123");
    expect(body.content).toEqual(MOCK_CONTENT);
  });

  it("includes target_languages in the user message when provided", async () => {
    await POST(makeRequest({ target_languages: ["TypeScript", "Go"] }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    expect(opts.userMessage).toContain("TypeScript");
    expect(opts.userMessage).toContain("Go");
  });

  it("reads the system prompt from the file system", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("custom prompt" as never);

    await POST(makeRequest());

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    expect(opts.systemPrompt).toBe("custom prompt");
  });

  it("returns 500 when AIValidationError is thrown", async () => {
    const { ZodError } = await import("zod");
    const zodErr = new ZodError([]);
    vi.mocked(aiClient.callClaude).mockRejectedValue(
      new aiClient.AIValidationError("Schema mismatch", zodErr)
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValue(new Error("Network failure"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
