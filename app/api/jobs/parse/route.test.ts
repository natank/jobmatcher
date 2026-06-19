import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client");
vi.mock("@/lib/db/job");
vi.mock("@/lib/ai/client");
vi.mock("node:fs/promises");

import { POST } from "./route";
import * as dbClient from "@/lib/db/client";
import * as dbJob from "@/lib/db/job";
import * as aiClient from "@/lib/ai/client";
import * as fs from "node:fs/promises";
import type { JobPosting } from "@/types/job";

const MOCK_USER = { id: "user-abc", email: "dev@example.com" };

const MOCK_JOB_POSTING: JobPosting = {
  source: "text",
  source_url: null,
  title: "Senior Frontend Engineer",
  company: "Acme Corp",
  seniority: "senior",
  required_skills: ["react", "typescript", "node.js"],
  preferred_skills: ["graphql", "docker"],
  responsibilities: ["Build UI components", "Collaborate with design team"],
  keywords: ["spa", "frontend", "b2b"],
  raw_text: "We are looking for a Senior Frontend Engineer...",
};

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost:3000/api/jobs/parse", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/jobs/parse", () => {
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
    vi.mocked(dbJob.createJob).mockResolvedValue({ id: "job-123" });
    vi.mocked(aiClient.callClaude).mockResolvedValue(MOCK_JOB_POSTING);
    vi.mocked(fs.readFile).mockResolvedValue("system prompt content" as never);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest({ text: "Some job posting text here" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when neither text nor url is provided", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("text");
    expect(body.error).toContain("url");
  });

  it("returns 400 when body is missing entirely", async () => {
    const req = new NextRequest("http://localhost:3000/api/jobs/parse", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("happy path (text input): parses job, canonicalizes skills, persists, returns job", async () => {
    const res = await POST(
      makeRequest({
        text: "We are looking for a Senior Frontend Engineer with React and TypeScript...",
      })
    );

    expect(res.status).toBe(200);

    expect(aiClient.callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "job-parse",
        systemPrompt: "system prompt content",
        userMessage: expect.stringContaining("source_url` to null"),
      })
    );

    expect(dbJob.createJob).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      expect.objectContaining({
        source: "text",
        title: "Senior Frontend Engineer",
        required_skills: expect.arrayContaining(["react", "typescript", "node.js"]),
      })
    );

    const body = await res.json();
    expect(body.job).toBeDefined();
    expect(body.job.id).toBe("job-123");
    expect(body.job.title).toBe("Senior Frontend Engineer");
    expect(body.warning).toBeUndefined();
  });

  it("URL input: sets source to 'url' and includes source_url in user message", async () => {
    const mockUrl = "https://example.com/jobs/senior-engineer";
    const mockFetchResponse = {
      text: vi
        .fn()
        .mockResolvedValue(
          "<html><main><article>Senior Frontend Engineer role at Acme Corp. Required: React, TypeScript.</article></main></html>"
        ),
      redirected: false,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));

    vi.mocked(aiClient.callClaude).mockResolvedValue({
      ...MOCK_JOB_POSTING,
      source: "url",
      source_url: mockUrl,
    });

    const res = await POST(makeRequest({ url: mockUrl }));

    expect(res.status).toBe(200);

    expect(aiClient.callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining(mockUrl),
      })
    );

    expect(dbJob.createJob).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      expect.objectContaining({
        source: "url",
        source_url: mockUrl,
      })
    );

    const body = await res.json();
    expect(body.job.source).toBe("url");

    vi.unstubAllGlobals();
  });

  it("URL input: returns 422 when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const res = await POST(makeRequest({ url: "https://blocked-site.example.com/job" }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("url_blocked");

    vi.unstubAllGlobals();
  });

  it("non-job content: returns low_confidence warning when seniority=unknown and no required skills", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValue({
      source: "text",
      source_url: null,
      title: "Unknown",
      company: null,
      seniority: "unknown",
      required_skills: [],
      preferred_skills: [],
      responsibilities: [],
      keywords: [],
      raw_text: "This is not a job posting.",
    });

    const res = await POST(
      makeRequest({ text: "This is not a job posting at all, just random text lorem ipsum." })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warning).toBe("low_confidence");
    expect(body.job).toBeDefined();
  });

  it("returns 500 with retry suggestion when AIValidationError is thrown", async () => {
    const { ZodError } = await import("zod");
    const zodErr = new ZodError([]);
    vi.mocked(aiClient.callClaude).mockRejectedValue(
      new aiClient.AIValidationError("Schema mismatch", zodErr)
    );

    const res = await POST(
      makeRequest({ text: "We need a JavaScript developer with 5+ years experience." })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValue(new Error("Network failure"));

    const res = await POST(makeRequest({ text: "Some job description text for testing." }));

    expect(res.status).toBe(500);
  });

  it("reads system prompt from file system", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("custom job parse prompt" as never);

    await POST(makeRequest({ text: "Some job description text for testing the prompt." }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    expect(opts.systemPrompt).toBe("custom job parse prompt");
  });

  it("canonicalizes synonyms in required_skills (e.g. 'ReactJS' → 'react')", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValue({
      ...MOCK_JOB_POSTING,
      required_skills: ["ReactJS", "NodeJS", "ts"],
      preferred_skills: ["K8s"],
    });

    await POST(makeRequest({ text: "We need a ReactJS developer with NodeJS and TypeScript." }));

    expect(dbJob.createJob).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      expect.objectContaining({
        required_skills: expect.arrayContaining(["react", "node.js", "typescript"]),
        preferred_skills: expect.arrayContaining(["kubernetes"]),
      })
    );
  });

  it("truncates raw text to 12,000 characters", async () => {
    const longText = "a".repeat(20_000);

    await POST(makeRequest({ text: longText }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    // The user message embeds the truncated raw text
    const embeddedText = opts.userMessage.split("```")[1]?.trim() ?? "";
    expect(embeddedText.length).toBeLessThanOrEqual(12_000);
  });
});
