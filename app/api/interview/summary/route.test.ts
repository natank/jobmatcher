import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client");
vi.mock("@/lib/db/interview");
vi.mock("@/lib/db/job");
vi.mock("@/lib/db/answer");
vi.mock("@/lib/db/summary");
vi.mock("@/lib/db/usage");
vi.mock("@/lib/ai/client");
vi.mock("node:fs/promises");

import { POST } from "./route";
import * as dbClient from "@/lib/db/client";
import * as dbInterview from "@/lib/db/interview";
import * as dbJob from "@/lib/db/job";
import * as dbAnswer from "@/lib/db/answer";
import * as dbSummary from "@/lib/db/summary";
import * as dbUsage from "@/lib/db/usage";
import * as aiClient from "@/lib/ai/client";
import * as fs from "node:fs/promises";
import type { JobPosting } from "@/types/job";
import type { Question } from "@/types/interview";
import type { AnswerFeedback } from "@/types/feedback";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER = { id: "00000000-0000-0000-0000-000000000001", email: "dev@example.com" };
const MOCK_SESSION_ID = "00000000-0000-0000-0000-000000000002";
const MOCK_JOB_ID = "00000000-0000-0000-0000-000000000003";

const MOCK_QUESTIONS: Question[] = [
  { index: 0, text: "Walk me through go-api architecture.", type: "technical", repo_ref: "go-api" },
  { index: 1, text: "Challenges in k8s-operator?", type: "technical", repo_ref: "k8s-operator" },
  {
    index: 2,
    text: "How do you approach schema design in PostgreSQL?",
    type: "job",
    repo_ref: null,
  },
  { index: 3, text: "Describe a horizontally scalable service.", type: "job", repo_ref: null },
  { index: 4, text: "Balancing speed and quality?", type: "behavioral", repo_ref: null },
];

const MOCK_SESSION = {
  id: MOCK_SESSION_ID,
  user_id: MOCK_USER.id,
  job_id: MOCK_JOB_ID,
  status: "active",
  questions: MOCK_QUESTIONS,
  started_at: "2024-01-01T00:00:00Z",
  completed_at: null,
};

const MOCK_JOB_POSTING: JobPosting = {
  id: MOCK_JOB_ID,
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
  id: MOCK_JOB_ID,
  user_id: MOCK_USER.id,
  source: "text",
  source_url: null,
  parsed: MOCK_JOB_POSTING,
  created_at: "2024-01-01T00:00:00Z",
  posting: MOCK_JOB_POSTING,
};

function makeFeedback(overrides: Partial<AnswerFeedback> = {}): AnswerFeedback {
  return {
    relevance: 4,
    depth: 3,
    clarity: 5,
    overall: 4,
    strengths: ["Good clarity"],
    improvements: ["Add more depth"],
    model_answer_hint: "Cover trade-offs more explicitly.",
    ...overrides,
  };
}

function makeAnswerRow(index: number, feedback: AnswerFeedback) {
  return {
    id: `answer-${index}`,
    session_id: MOCK_SESSION_ID,
    question_index: index,
    answer_text: `Answer for question ${index}`,
    feedback,
    created_at: "2024-01-01T00:00:00Z",
  };
}

// 5 answers, each with relevance=4, depth=3, clarity=5, overall=4
const MOCK_ANSWERS = Array.from({ length: 5 }, (_, i) => makeAnswerRow(i, makeFeedback()));

const MOCK_AI_OUTPUT = {
  top_strengths: ["Strong system design thinking", "Clear communication"],
  key_gaps: ["Limited depth on error handling", "Kubernetes concepts need work"],
  recommended_actions: [
    "Practice explaining distributed system trade-offs",
    "Build a small k8s operator from scratch",
    "Read 'Designing Data-Intensive Applications'",
  ],
  readiness: "moderate" as const,
};

const MOCK_SUMMARY_ROW = {
  id: "summary-001",
  session_id: MOCK_SESSION_ID,
  summary: {
    session_id: MOCK_SESSION_ID,
    avg_relevance: 4,
    avg_depth: 3,
    avg_clarity: 5,
    overall_score: 4,
    top_strengths: MOCK_AI_OUTPUT.top_strengths,
    key_gaps: MOCK_AI_OUTPUT.key_gaps,
    recommended_actions: MOCK_AI_OUTPUT.recommended_actions,
    readiness: "moderate",
  },
  created_at: "2024-01-01T00:00:00Z",
};

const VALID_BODY = { session_id: MOCK_SESSION_ID };

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost:3000/api/interview/summary", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/interview/summary", () => {
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
    vi.mocked(dbAnswer.listAnswers).mockResolvedValue(MOCK_ANSWERS as never);
    vi.mocked(dbSummary.getSummary).mockResolvedValue(null);
    vi.mocked(dbSummary.createSummary).mockResolvedValue({ id: "summary-001" });
    vi.mocked(dbInterview.updateSessionStatus).mockResolvedValue(undefined);
    vi.mocked(dbUsage.incrementInterviews).mockResolvedValue(undefined);
    vi.mocked(dbUsage.currentPeriod).mockReturnValue("2024-01");
    vi.mocked(aiClient.callClaude).mockResolvedValue(MOCK_AI_OUTPUT);
    vi.mocked(fs.readFile).mockResolvedValue("interview summary system prompt" as never);
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
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("session_id");
  });

  // --- Resource lookups ---

  it("returns 404 when session is not found", async () => {
    vi.mocked(dbInterview.getSession).mockResolvedValue(null);

    const res = await POST(makeRequest({ session_id: "00000000-0000-0000-0000-000000000099" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Session");
  });

  it("returns 400 with incomplete_session when fewer than 5 answers exist", async () => {
    vi.mocked(dbAnswer.listAnswers).mockResolvedValue(MOCK_ANSWERS.slice(0, 3) as never);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("incomplete_session");
    expect(body.message).toContain("3/5");
  });

  // --- Idempotency ---

  it("returns existing summary without calling Claude when summary already exists", async () => {
    vi.mocked(dbSummary.getSummary).mockResolvedValue(MOCK_SUMMARY_ROW as never);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(aiClient.callClaude).not.toHaveBeenCalled();
    expect(dbSummary.createSummary).not.toHaveBeenCalled();
    expect(dbUsage.incrementInterviews).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(body.summary.readiness).toBe("moderate");
  });

  // --- Happy path ---

  it("happy path: returns summary with correct averages and AI output", async () => {
    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();

    // avg_relevance = avg of 5 × 4 = 4.0
    expect(body.summary.avg_relevance).toBe(4);
    // avg_depth = avg of 5 × 3 = 3.0
    expect(body.summary.avg_depth).toBe(3);
    // avg_clarity = avg of 5 × 5 = 5.0
    expect(body.summary.avg_clarity).toBe(5);
    // overall_score = round(avg of 5 × 4) = 4
    expect(body.summary.overall_score).toBe(4);
    expect(body.summary.readiness).toBe("moderate");
    expect(body.summary.top_strengths).toEqual(MOCK_AI_OUTPUT.top_strengths);
    expect(body.summary.key_gaps).toEqual(MOCK_AI_OUTPUT.key_gaps);
    expect(body.summary.recommended_actions).toEqual(MOCK_AI_OUTPUT.recommended_actions);
  });

  it("computes averages correctly for mixed scores", async () => {
    // Answers: overall scores [5, 4, 3, 2, 1] → avg = 3.0 → round = 3
    const mixedAnswers = [
      makeAnswerRow(0, makeFeedback({ relevance: 5, depth: 5, clarity: 5, overall: 5 })),
      makeAnswerRow(1, makeFeedback({ relevance: 4, depth: 4, clarity: 4, overall: 4 })),
      makeAnswerRow(2, makeFeedback({ relevance: 3, depth: 3, clarity: 3, overall: 3 })),
      makeAnswerRow(3, makeFeedback({ relevance: 2, depth: 2, clarity: 2, overall: 2 })),
      makeAnswerRow(4, makeFeedback({ relevance: 1, depth: 1, clarity: 1, overall: 1 })),
    ];
    vi.mocked(dbAnswer.listAnswers).mockResolvedValue(mixedAnswers as never);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.avg_relevance).toBe(3);
    expect(body.summary.avg_depth).toBe(3);
    expect(body.summary.avg_clarity).toBe(3);
    expect(body.summary.overall_score).toBe(3);
  });

  it("calls callClaude with temperature 0.3 and correct feature label", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(aiClient.callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "interview-summary",
        temperature: 0.3,
        systemPrompt: "interview summary system prompt",
      })
    );
  });

  it("passes compact transcript (no model_answer_hint) and job context to Claude", async () => {
    await POST(makeRequest(VALID_BODY));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const ctx = JSON.parse(opts.userMessage);

    expect(ctx.transcript).toHaveLength(5);
    expect(ctx.transcript[0].question.text).toBe(MOCK_QUESTIONS[0].text);
    expect(ctx.transcript[0].feedback.relevance).toBe(4);
    // model_answer_hint should NOT be in the summary context (not needed for synthesis)
    expect(ctx.transcript[0].feedback.model_answer_hint).toBeUndefined();
    expect(ctx.job.title).toBe("Senior Backend Engineer");
    expect(ctx.job.raw_text).toBeUndefined();
  });

  it("persists summary via createSummary with session_id included", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(dbSummary.createSummary).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_SESSION_ID,
      expect.objectContaining({ session_id: MOCK_SESSION_ID, overall_score: 4 })
    );
  });

  it("marks session as completed with a completedAt timestamp", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(dbInterview.updateSessionStatus).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      MOCK_SESSION_ID,
      "completed",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    );
  });

  it("increments interviews usage counter exactly once on success", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(dbUsage.incrementInterviews).toHaveBeenCalledTimes(1);
    expect(dbUsage.incrementInterviews).toHaveBeenCalledWith(mockSupabase, MOCK_USER.id, "2024-01");
  });

  it("proceeds and returns summary even when job row is not found", async () => {
    vi.mocked(dbJob.getJob).mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const ctx = JSON.parse(opts.userMessage);
    expect(ctx.job).toBeNull();
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

  it("does not increment usage counter when Claude fails", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValue(new Error("Claude down"));

    await POST(makeRequest(VALID_BODY));

    expect(dbUsage.incrementInterviews).not.toHaveBeenCalled();
  });

  it("does not mark session completed when Claude fails", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValue(new Error("Claude down"));

    await POST(makeRequest(VALID_BODY));

    expect(dbInterview.updateSessionStatus).not.toHaveBeenCalled();
  });
});
