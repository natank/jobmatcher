import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client");
vi.mock("@/lib/db/interview");
vi.mock("@/lib/db/github");
vi.mock("@/lib/db/job");
vi.mock("@/lib/db/answer");
vi.mock("@/lib/ai/client");
vi.mock("node:fs/promises");

import { POST } from "./route";
import * as dbClient from "@/lib/db/client";
import * as dbInterview from "@/lib/db/interview";
import * as dbGithub from "@/lib/db/github";
import * as dbJob from "@/lib/db/job";
import * as dbAnswer from "@/lib/db/answer";
import * as aiClient from "@/lib/ai/client";
import * as fs from "node:fs/promises";
import type { GitHubProfile } from "@/types/github";
import type { JobPosting } from "@/types/job";
import type { Question } from "@/types/interview";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER = { id: "user-abc", email: "dev@example.com" };

const MOCK_QUESTIONS: Question[] = [
  {
    index: 0,
    text: "Walk me through your go-api architecture.",
    type: "technical",
    repo_ref: "go-api",
  },
  {
    index: 1,
    text: "What challenges did you face in k8s-operator?",
    type: "technical",
    repo_ref: "k8s-operator",
  },
  { index: 2, text: "How do you approach database schema design?", type: "job", repo_ref: null },
  {
    index: 3,
    text: "Describe a horizontally scalable service design.",
    type: "job",
    repo_ref: null,
  },
  {
    index: 4,
    text: "Tell me about balancing speed and quality.",
    type: "behavioral",
    repo_ref: null,
  },
];

const MOCK_SESSION = {
  id: "session-789",
  user_id: MOCK_USER.id,
  job_id: "job-456",
  status: "active",
  questions: MOCK_QUESTIONS,
  started_at: "2024-01-01T00:00:00Z",
  completed_at: null,
};

const MOCK_JOB_POSTING: JobPosting = {
  id: "job-456",
  source: "text",
  source_url: null,
  title: "Senior Backend Engineer",
  company: "Acme Corp",
  seniority: "senior",
  required_skills: ["go", "postgresql", "kubernetes"],
  preferred_skills: ["grpc"],
  responsibilities: ["Design distributed systems"],
  keywords: ["backend"],
  raw_text: "We need a senior backend engineer.",
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
  languages: [{ name: "Go", bytes: 50000, percent: 100 }],
  repos: [
    {
      name: "go-api",
      url: "https://github.com/devuser/go-api",
      description: "REST API in Go",
      primary_language: "Go",
      languages: [{ name: "Go", percent: 100 }],
      stars: 12,
      topics: ["go", "rest"],
      authored_commits: 80,
      first_commit_at: "2023-01-01T00:00:00Z",
      last_commit_at: "2024-01-01T00:00:00Z",
      readme_excerpt: "A Go REST API.",
      signal_score: 0.85,
    },
  ],
};

// AI output from Claude — no `overall` (computed server-side)
const MOCK_AI_OUTPUT = {
  relevance: 4,
  depth: 3,
  clarity: 5,
  strengths: ["Clear explanation of the routing layer"],
  improvements: ["Could discuss error handling more"],
  model_answer_hint: "Mention how you handle backpressure and retry logic.",
};

const MOCK_ANSWER_ROW = {
  id: "answer-001",
  session_id: "session-789",
  question_index: 0,
  answer_text: "I designed the API with three layers: handler, service, and repository.",
  feedback: null,
};

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost:3000/api/interview/answer", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  session_id: "session-789",
  question_index: 0,
  answer_text: "I designed the API with three layers: handler, service, and repository.",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/interview/answer", () => {
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
    vi.mocked(dbInterview.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(dbJob.getJob).mockResolvedValue(MOCK_JOB_ROW as never);
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(MOCK_GITHUB_PROFILE);
    vi.mocked(dbAnswer.createAnswer).mockResolvedValue({ id: "answer-001" });
    vi.mocked(dbAnswer.listAnswers).mockResolvedValue([MOCK_ANSWER_ROW as never]);
    vi.mocked(aiClient.callClaude).mockResolvedValue(MOCK_AI_OUTPUT);
    vi.mocked(fs.readFile).mockResolvedValue("interview feedback system prompt" as never);
  });

  // --- Auth ---

  it("returns 401 when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  // --- Input validation ---

  it("returns 400 when session_id is missing", async () => {
    const { session_id: _s, ...rest } = VALID_BODY;
    const res = await POST(makeRequest(rest));

    expect(res.status).toBe(400);
  });

  it("returns 400 when question_index is missing", async () => {
    const { question_index: _q, ...rest } = VALID_BODY;
    const res = await POST(makeRequest(rest));

    expect(res.status).toBe(400);
  });

  it("returns 400 when answer_text is missing", async () => {
    const { answer_text: _a, ...rest } = VALID_BODY;
    const res = await POST(makeRequest(rest));

    expect(res.status).toBe(400);
  });

  it("returns 400 when question_index is below 0", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, question_index: -1 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("question_index");
  });

  it("returns 400 when question_index is above 4", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, question_index: 5 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("question_index");
  });

  it("returns 400 when answer_text exceeds 4 KB", async () => {
    const longAnswer = "a".repeat(4097);
    const res = await POST(makeRequest({ ...VALID_BODY, answer_text: longAnswer }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("4 KB");
  });

  it("accepts an answer_text exactly at the 4 KB boundary", async () => {
    const exactAnswer = "a".repeat(4096);
    const res = await POST(makeRequest({ ...VALID_BODY, answer_text: exactAnswer }));

    expect(res.status).toBe(200);
  });

  // --- Resource lookups ---

  it("returns 404 when session is not found", async () => {
    vi.mocked(dbInterview.getSession).mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Session");
  });

  it("returns 409 when session status is completed", async () => {
    vi.mocked(dbInterview.getSession).mockResolvedValue({
      ...MOCK_SESSION,
      status: "completed",
    } as never);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("active");
  });

  it("returns 409 when session status is abandoned", async () => {
    vi.mocked(dbInterview.getSession).mockResolvedValue({
      ...MOCK_SESSION,
      status: "abandoned",
    } as never);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(409);
  });

  // --- Happy path ---

  it("happy path: returns feedback with computed overall + answered_count", async () => {
    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();

    // overall = round((4 + 3 + 5) / 3) = round(4.0) = 4
    expect(body.feedback.overall).toBe(4);
    expect(body.feedback.relevance).toBe(4);
    expect(body.feedback.depth).toBe(3);
    expect(body.feedback.clarity).toBe(5);
    expect(body.feedback.strengths).toEqual(MOCK_AI_OUTPUT.strengths);
    expect(body.feedback.improvements).toEqual(MOCK_AI_OUTPUT.improvements);
    expect(body.feedback.model_answer_hint).toBe(MOCK_AI_OUTPUT.model_answer_hint);
    expect(body.answered_count).toBe(1);
  });

  it("computes overall correctly for different score combinations", async () => {
    // round((1 + 1 + 2) / 3) = round(1.33) = 1
    vi.mocked(aiClient.callClaude).mockResolvedValue({
      ...MOCK_AI_OUTPUT,
      relevance: 1,
      depth: 1,
      clarity: 2,
    });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.feedback.overall).toBe(1);
  });

  it("computes overall = 5 when all scores are 5", async () => {
    vi.mocked(aiClient.callClaude).mockResolvedValue({
      ...MOCK_AI_OUTPUT,
      relevance: 5,
      depth: 5,
      clarity: 5,
    });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.feedback.overall).toBe(5);
  });

  it("calls callClaude with temperature 0.3 and correct feature label", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(aiClient.callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "interview-answer",
        temperature: 0.3,
        systemPrompt: "interview feedback system prompt",
      })
    );
  });

  it("passes question, answer, and compact context to Claude", async () => {
    await POST(makeRequest(VALID_BODY));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const ctx = JSON.parse(opts.userMessage);

    expect(ctx.question.text).toBe(MOCK_QUESTIONS[0].text);
    expect(ctx.question.repo_ref).toBe("go-api");
    expect(ctx.answer).toBe(VALID_BODY.answer_text);
    expect(ctx.context.job.title).toBe("Senior Backend Engineer");
    // raw_text must NOT be included
    expect(ctx.context.job.raw_text).toBeUndefined();
  });

  it("persists answer with correct session_id, index, text, and feedback", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(dbAnswer.createAnswer).toHaveBeenCalledWith(
      mockSupabase,
      "session-789",
      0,
      VALID_BODY.answer_text,
      expect.objectContaining({ overall: 4, relevance: 4, depth: 3, clarity: 5 })
    );
  });

  it("answered_count reflects all stored answers after submission", async () => {
    // Simulate 3 prior answers already stored
    vi.mocked(dbAnswer.listAnswers).mockResolvedValue([
      MOCK_ANSWER_ROW as never,
      { ...MOCK_ANSWER_ROW, id: "answer-002", question_index: 1 } as never,
      { ...MOCK_ANSWER_ROW, id: "answer-003", question_index: 2 } as never,
    ]);

    const res = await POST(makeRequest({ ...VALID_BODY, question_index: 2 }));
    const body = await res.json();
    expect(body.answered_count).toBe(3);
  });

  it("proceeds without job or GitHub profile context (graceful degradation)", async () => {
    vi.mocked(dbJob.getJob).mockResolvedValue(null);
    vi.mocked(dbGithub.getGitHubProfile).mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const ctx = JSON.parse(opts.userMessage);
    expect(ctx.context.job).toBeNull();
    expect(ctx.context.repos).toEqual([]);
  });

  // --- Error handling ---

  it("returns 500 with retry suggestion when AIValidationError is thrown", async () => {
    const { ZodError } = await import("zod");
    const zodErr = new ZodError([]);
    vi.mocked(aiClient.callClaude).mockRejectedValue(
      new aiClient.AIValidationError("Schema mismatch", zodErr)
    );

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValue(new Error("Network failure"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(500);
  });
});
