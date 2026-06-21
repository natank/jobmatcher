import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client");
vi.mock("@/lib/db/job");
vi.mock("@/lib/db/github");
vi.mock("@/lib/db/resume");
vi.mock("@/lib/db/interview");
vi.mock("@/lib/db/usage");
vi.mock("@/lib/limits");
vi.mock("@/lib/ai/client");
vi.mock("node:fs/promises");

import { POST } from "./route";
import * as dbClient from "@/lib/db/client";
import * as dbJob from "@/lib/db/job";
import * as dbGithub from "@/lib/db/github";
import * as dbResume from "@/lib/db/resume";
import * as dbInterview from "@/lib/db/interview";
import * as dbUsage from "@/lib/db/usage";
import * as limits from "@/lib/limits";
import * as aiClient from "@/lib/ai/client";
import * as fs from "node:fs/promises";
import type { JobPosting } from "@/types/job";
import type { GitHubProfile } from "@/types/github";
import type { Question } from "@/types/interview";

// ---------------------------------------------------------------------------
// Mock fixtures
// ---------------------------------------------------------------------------

const MOCK_USER = { id: "user-abc", email: "dev@example.com", user_metadata: {} };

const MOCK_JOB_POSTING: JobPosting = {
  id: "job-456",
  source: "text",
  source_url: null,
  title: "Senior Backend Engineer",
  company: "Acme Corp",
  seniority: "senior",
  required_skills: ["go", "postgresql", "kubernetes"],
  preferred_skills: ["grpc"],
  responsibilities: ["Design distributed systems", "Own production on-call"],
  keywords: ["backend", "infra"],
  raw_text: "We are looking for a Senior Backend Engineer.",
};

const MOCK_JOB_ROW = {
  id: "job-456",
  user_id: MOCK_USER.id,
  source: "text",
  source_url: null,
  parsed: MOCK_JOB_POSTING,
  created_at: "2024-01-01T00:00:00Z",
  posting: MOCK_JOB_POSTING,
};

const MOCK_GITHUB_PROFILE: GitHubProfile = {
  login: "devuser",
  name: "Dev User",
  fetched_at: "2024-01-01T00:00:00.000Z",
  languages: [{ name: "Go", bytes: 50000, percent: 80 }],
  repos: [
    {
      name: "go-api",
      url: "https://github.com/devuser/go-api",
      description: "REST API in Go",
      primary_language: "Go",
      languages: [{ name: "Go", percent: 100 }],
      stars: 12,
      topics: ["go", "rest", "api"],
      authored_commits: 80,
      first_commit_at: "2023-01-01T00:00:00Z",
      last_commit_at: "2024-01-01T00:00:00Z",
      readme_excerpt: "A REST API built with Go and PostgreSQL.",
      signal_score: 0.85,
    },
    {
      name: "k8s-operator",
      url: "https://github.com/devuser/k8s-operator",
      description: "Kubernetes operator",
      primary_language: "Go",
      languages: [{ name: "Go", percent: 95 }],
      stars: 7,
      topics: ["kubernetes", "operator"],
      authored_commits: 40,
      first_commit_at: "2023-06-01T00:00:00Z",
      last_commit_at: "2024-01-01T00:00:00Z",
      readme_excerpt: "A K8s custom operator.",
      signal_score: 0.72,
    },
  ],
};

const MOCK_RESUME_ROW = {
  id: "resume-123",
  user_id: MOCK_USER.id,
  version: 1,
  base_resume_id: null,
  job_id: null,
  content: { summary: "Backend engineer.", skills: ["go", "postgresql"] },
  status: "active",
  created_at: "2024-01-01T00:00:00Z",
};

const MOCK_QUESTIONS: Question[] = [
  {
    index: 0,
    text: "Walk me through your architecture decisions in go-api.",
    type: "technical",
    repo_ref: "go-api",
  },
  {
    index: 1,
    text: "How did you handle failure modes in k8s-operator?",
    type: "technical",
    repo_ref: "k8s-operator",
  },
  {
    index: 2,
    text: "How do you approach schema design in PostgreSQL for high-write workloads?",
    type: "job",
    repo_ref: null,
  },
  {
    index: 3,
    text: "Describe how you would design a horizontally scalable service.",
    type: "job",
    repo_ref: null,
  },
  {
    index: 4,
    text: "Tell me about a time you had to balance speed of delivery with technical quality.",
    type: "behavioral",
    repo_ref: null,
  },
];

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost:3000/api/interview/start", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/interview/start", () => {
  let mockSupabase: { auth: { getUser: ReturnType<typeof vi.fn> } };

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
    vi.mocked(dbJob.getJob).mockResolvedValue(MOCK_JOB_ROW as never);
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(MOCK_GITHUB_PROFILE);
    vi.mocked(dbResume.listResumes).mockResolvedValue([MOCK_RESUME_ROW as never]);
    vi.mocked(dbInterview.createSession).mockResolvedValue({ id: "session-789" });
    vi.mocked(dbUsage.currentPeriod).mockReturnValue("2024-01");
    // Default: within limit
    vi.mocked(limits.checkUsageLimit).mockResolvedValue({ allowed: true, remaining: 1 });
    vi.mocked(aiClient.callClaude).mockResolvedValue(MOCK_QUESTIONS);
    vi.mocked(fs.readFile).mockResolvedValue("interview questions system prompt" as never);
  });

  // --- Auth ---

  it("returns 401 when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest({ job_id: "job-456" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  // --- Input validation ---

  it("returns 400 when job_id is missing", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("job_id");
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/interview/start", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  // --- Resource lookups ---

  it("returns 404 when job is not found", async () => {
    vi.mocked(dbJob.getJob).mockResolvedValue(null);

    const res = await POST(makeRequest({ job_id: "job-999" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Job");
  });

  it("returns 400 when GitHub profile is not found", async () => {
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(null);

    const res = await POST(makeRequest({ job_id: "job-456" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("GitHub");
  });

  // --- Free-tier gate (now via checkUsageLimit) ---

  it("returns 429 when checkUsageLimit reports not allowed", async () => {
    vi.mocked(limits.checkUsageLimit).mockResolvedValue({ allowed: false, remaining: 0 });

    const res = await POST(makeRequest({ job_id: "job-456" }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("free_tier_limit");
  });

  it("allows when checkUsageLimit reports allowed", async () => {
    vi.mocked(limits.checkUsageLimit).mockResolvedValue({ allowed: true, remaining: 1 });

    const res = await POST(makeRequest({ job_id: "job-456" }));

    expect(res.status).toBe(200);
  });

  it("calls checkUsageLimit with correct feature and period", async () => {
    await POST(makeRequest({ job_id: "job-456" }));

    expect(limits.checkUsageLimit).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      "interviews",
      "2024-01"
    );
  });

  // --- Happy path ---

  it("happy path: generates 5 questions, persists session, returns session_id + questions", async () => {
    const res = await POST(makeRequest({ job_id: "job-456" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_id).toBe("session-789");
    expect(body.questions).toHaveLength(5);
  });

  it("calls callClaude with temperature 0.5 and correct feature label", async () => {
    await POST(makeRequest({ job_id: "job-456" }));

    expect(aiClient.callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "interview-start",
        temperature: 0.5,
        systemPrompt: "interview questions system prompt",
      })
    );
  });

  it("passes compact job context without raw_text to Claude", async () => {
    await POST(makeRequest({ job_id: "job-456" }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const context = JSON.parse(opts.userMessage);

    expect(context.job.title).toBe("Senior Backend Engineer");
    expect(context.job.required_skills).toEqual(expect.arrayContaining(["go", "postgresql"]));
    expect(context.job.raw_text).toBeUndefined();
  });

  it("passes top repos sorted by signal_score to Claude", async () => {
    await POST(makeRequest({ job_id: "job-456" }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const context = JSON.parse(opts.userMessage);

    expect(context.repos).toHaveLength(2);
    // go-api has higher signal_score (0.85) so should come first
    expect(context.repos[0].name).toBe("go-api");
    expect(context.repos[1].name).toBe("k8s-operator");
    // Raw README excerpts should not be included
    expect(context.repos[0].readme_excerpt).toBeUndefined();
  });

  it("includes resume summary and skills in Claude context when resume is available", async () => {
    await POST(makeRequest({ job_id: "job-456" }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const context = JSON.parse(opts.userMessage);

    expect(context.resume).toBeDefined();
    expect(context.resume.summary).toBe("Backend engineer.");
    expect(context.resume.skills).toEqual(expect.arrayContaining(["go"]));
  });

  it("omits resume from Claude context when no resume exists", async () => {
    vi.mocked(dbResume.listResumes).mockResolvedValue([]);

    await POST(makeRequest({ job_id: "job-456" }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const context = JSON.parse(opts.userMessage);

    expect(context.resume).toBeUndefined();
  });

  it("persists session with correct userId and jobId", async () => {
    await POST(makeRequest({ job_id: "job-456" }));

    expect(dbInterview.createSession).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      "job-456",
      MOCK_QUESTIONS
    );
  });

  // --- Error handling ---

  it("returns 500 with retry suggestion when AIValidationError is thrown", async () => {
    const { ZodError } = await import("zod");
    const zodErr = new ZodError([]);
    vi.mocked(aiClient.callClaude).mockRejectedValue(
      new aiClient.AIValidationError("Schema mismatch", zodErr)
    );

    const res = await POST(makeRequest({ job_id: "job-456" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValue(new Error("Network failure"));

    const res = await POST(makeRequest({ job_id: "job-456" }));

    expect(res.status).toBe(500);
  });
});
