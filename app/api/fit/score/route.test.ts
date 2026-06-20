import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/client");
vi.mock("@/lib/db/resume");
vi.mock("@/lib/db/job");
vi.mock("@/lib/db/fit");
vi.mock("@/lib/ai/client");
vi.mock("node:fs/promises");

import { POST } from "./route";
import * as dbClient from "@/lib/db/client";
import * as dbResume from "@/lib/db/resume";
import * as dbJob from "@/lib/db/job";
import * as dbFit from "@/lib/db/fit";
import * as aiClient from "@/lib/ai/client";
import * as fs from "node:fs/promises";
import type { ResumeContent } from "@/types/resume";
import type { JobPosting } from "@/types/job";

const MOCK_USER = { id: "user-abc", email: "dev@example.com" };

const MOCK_RESUME_CONTENT: ResumeContent = {
  summary: "Experienced full-stack engineer with 5+ years in React and Node.js.",
  skills: ["react", "typescript", "node.js", "postgresql"],
  experience: [
    {
      project: "E-commerce Platform",
      bullets: ["Built product catalog UI with React", "Designed REST API with Node.js"],
      technologies: ["react", "node.js", "postgresql"],
      period: "2021–2023",
    },
  ],
  education: [{ institution: "State University", degree: "B.Sc. Computer Science", year: "2018" }],
};

const MOCK_RESUME_ROW = {
  id: "resume-123",
  user_id: MOCK_USER.id,
  version: 1,
  base_resume_id: null,
  job_id: null,
  content: MOCK_RESUME_CONTENT,
  status: "active",
  created_at: "2024-01-01T00:00:00Z",
};

const MOCK_JOB_POSTING: JobPosting = {
  id: "job-456",
  source: "text",
  source_url: null,
  title: "Senior Frontend Engineer",
  company: "Acme Corp",
  seniority: "senior",
  required_skills: ["react", "typescript"],
  preferred_skills: ["docker"],
  responsibilities: ["Build UI components", "Collaborate with design"],
  keywords: ["frontend", "spa"],
  raw_text: "We are looking for a Senior Frontend Engineer...",
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

const MOCK_AI_OUTPUT = {
  ai_quality: 0.8,
  rationale: "Strong React and TypeScript background with relevant project experience.",
  gaps: [],
};

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost:3000/api/fit/score", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/fit/score", () => {
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
    vi.mocked(dbResume.getResume).mockResolvedValue(MOCK_RESUME_ROW as never);
    vi.mocked(dbJob.getJob).mockResolvedValue(MOCK_JOB_ROW as never);
    vi.mocked(dbFit.createFitResult).mockResolvedValue({ id: "fit-789" });
    vi.mocked(aiClient.callClaude).mockResolvedValue(MOCK_AI_OUTPUT);
    vi.mocked(fs.readFile).mockResolvedValue("fit score system prompt" as never);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when resume_id is missing", async () => {
    const res = await POST(makeRequest({ job_id: "job-456" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("resume_id");
  });

  it("returns 400 when job_id is missing", async () => {
    const res = await POST(makeRequest({ resume_id: "resume-123" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("job_id");
  });

  it("returns 404 when resume is not found", async () => {
    vi.mocked(dbResume.getResume).mockResolvedValue(null);

    const res = await POST(makeRequest({ resume_id: "resume-999", job_id: "job-456" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Resume");
  });

  it("returns 404 when job is not found", async () => {
    vi.mocked(dbJob.getJob).mockResolvedValue(null);

    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-999" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Job");
  });

  it("happy path: computes fit score, persists result, returns fit", async () => {
    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    expect(res.status).toBe(200);

    // Verify callClaude was called with temperature 0.2
    expect(aiClient.callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "fit-score",
        temperature: 0.2,
        systemPrompt: "fit score system prompt",
      })
    );

    // Verify fit result was persisted
    expect(dbFit.createFitResult).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      "resume-123",
      "job-456",
      expect.objectContaining({
        score: expect.any(Number),
        coverage: expect.any(Number),
        ai_quality: 0.8,
        matched_required: expect.arrayContaining(["react", "typescript"]),
        rationale: MOCK_AI_OUTPUT.rationale,
      })
    );

    const body = await res.json();
    expect(body.fit).toBeDefined();
    expect(body.fit.id).toBe("fit-789");
    expect(body.fit.score).toBeGreaterThanOrEqual(1);
    expect(body.fit.score).toBeLessThanOrEqual(5);
    expect(body.fit.coverage).toBeGreaterThanOrEqual(0);
    expect(body.fit.coverage).toBeLessThanOrEqual(1);
  });

  it("computes correct coverage for fully matched required skills", async () => {
    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    expect(res.status).toBe(200);
    const body = await res.json();

    // Resume has react + typescript (both required). matched_required should contain both.
    expect(body.fit.matched_required).toEqual(expect.arrayContaining(["react", "typescript"]));
    expect(body.fit.missing_required).toHaveLength(0);
  });

  it("uses callClaude with AI context containing resume summary and job details (no raw_text)", async () => {
    await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const context = JSON.parse(opts.userMessage);

    // Resume context should have summary, skills, experience
    expect(context.resume.summary).toBeDefined();
    expect(context.resume.skills).toBeDefined();
    expect(context.resume.experience).toBeDefined();

    // Job context should not include raw_text
    expect(context.job.raw_text).toBeUndefined();
    expect(context.job.title).toBe("Senior Frontend Engineer");
    expect(context.job.required_skills).toEqual(expect.arrayContaining(["react", "typescript"]));
  });

  it("returns 500 with retry suggestion when AIValidationError is thrown", async () => {
    const { ZodError } = await import("zod");
    const zodErr = new ZodError([]);
    vi.mocked(aiClient.callClaude).mockRejectedValue(
      new aiClient.AIValidationError("Schema mismatch", zodErr)
    );

    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValue(new Error("Network failure"));

    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    expect(res.status).toBe(500);
  });

  it("includes gaps from AI output in the fit result", async () => {
    const gapOutput = {
      ...MOCK_AI_OUTPUT,
      gaps: [{ skill: "kubernetes", severity: "medium", suggestion: "Take a K8s course" }],
    };
    vi.mocked(aiClient.callClaude).mockResolvedValue(gapOutput);

    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fit.gaps).toHaveLength(1);
    expect(body.fit.gaps[0].skill).toBe("kubernetes");
    expect(body.fit.gaps[0].severity).toBe("medium");
  });
});
