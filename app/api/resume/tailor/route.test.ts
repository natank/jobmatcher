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
import type { FitResult } from "@/types/fit";

const MOCK_USER = { id: "user-abc", email: "dev@example.com" };

const MOCK_RESUME_CONTENT: ResumeContent = {
  summary: "Experienced full-stack engineer with 5+ years in React and Node.js.",
  skills: ["react", "typescript", "node.js", "postgresql"],
  experience: [
    {
      project: "E-commerce Platform",
      url: "https://github.com/dev/ecommerce",
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
  raw_text: "We are looking for a Senior Frontend Engineer with React and TypeScript skills.",
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

const MOCK_FIT_RESULT: FitResult = {
  score: 4,
  coverage: 0.85,
  ai_quality: 0.8,
  matched_required: ["react", "typescript"],
  missing_required: [],
  matched_preferred: [],
  gaps: [],
  rationale: "Strong React and TypeScript background.",
};

const MOCK_FIT_ROW = {
  id: "fit-789",
  user_id: MOCK_USER.id,
  resume_id: "resume-123",
  job_id: "job-456",
  result: MOCK_FIT_RESULT,
  created_at: "2024-01-01T00:00:00Z",
  fitResult: MOCK_FIT_RESULT,
};

const MOCK_TAILORED_CONTENT: ResumeContent & { changes?: { field: string; reason: string }[] } = {
  summary:
    "Senior frontend engineer with deep React and TypeScript expertise, focused on scalable UI systems.",
  skills: ["react", "typescript", "node.js", "postgresql"],
  experience: [
    {
      project: "E-commerce Platform",
      url: "https://github.com/dev/ecommerce",
      bullets: [
        "Architected product catalog UI with React and TypeScript for improved maintainability",
        "Designed REST API with Node.js",
      ],
      technologies: ["react", "typescript", "node.js", "postgresql"],
      period: "2021–2023",
    },
  ],
  education: [{ institution: "State University", degree: "B.Sc. Computer Science", year: "2018" }],
  changes: [
    { field: "summary", reason: "Emphasised React and TypeScript to match required skills" },
    {
      field: "experience[0].bullets[0]",
      reason: "Added TypeScript mention to surface relevant keyword",
    },
  ],
};

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost:3000/api/resume/tailor", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/resume/tailor", () => {
  let mockSupabase: {
    auth: { getUser: ReturnType<typeof vi.fn> };
    from: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    const mockUpdateChain = {
      eq: vi.fn().mockReturnThis(),
    };

    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue(mockUpdateChain),
      }),
    };

    vi.mocked(dbClient.createSupabaseServerClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof dbClient.createSupabaseServerClient>
    );
    vi.mocked(dbResume.getResume).mockResolvedValue(MOCK_RESUME_ROW as never);
    vi.mocked(dbResume.createResume).mockResolvedValue({ id: "tailored-resume-999" });
    vi.mocked(dbJob.getJob).mockResolvedValue(MOCK_JOB_ROW as never);
    vi.mocked(dbFit.getFitResult).mockResolvedValue(MOCK_FIT_ROW as never);
    vi.mocked(dbFit.getFitResultByJobResume).mockResolvedValue(MOCK_FIT_ROW as never);
    vi.mocked(dbFit.createFitResult).mockResolvedValue({ id: "fit-789" });
    vi.mocked(aiClient.callClaude).mockResolvedValue(MOCK_TAILORED_CONTENT);
    vi.mocked(fs.readFile).mockResolvedValue("tailor system prompt" as never);
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

  it("happy path: uses provided fit_id, calls Claude, persists tailored resume", async () => {
    const res = await POST(
      makeRequest({ resume_id: "resume-123", job_id: "job-456", fit_id: "fit-789" })
    );

    expect(res.status).toBe(200);

    expect(aiClient.callClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "resume-tailor",
        systemPrompt: "tailor system prompt",
      })
    );

    expect(dbResume.createResume).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      expect.objectContaining({ summary: expect.any(String), skills: expect.any(Array) })
    );

    const body = await res.json();
    expect(body.tailored_resume_id).toBe("tailored-resume-999");
    expect(body.content).toBeDefined();
    expect(body.changes).toBeDefined();
  });

  it("happy path without fit_id: looks up existing fit by job+resume pair", async () => {
    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    expect(res.status).toBe(200);

    expect(dbFit.getFitResultByJobResume).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      "job-456",
      "resume-123"
    );

    // Should NOT call getFitResult when fit_id not provided
    expect(dbFit.getFitResult).not.toHaveBeenCalled();
  });

  it("computes fit on-the-fly when no existing fit result is found", async () => {
    vi.mocked(dbFit.getFitResultByJobResume).mockResolvedValue(null);
    // First callClaude call = fit-score-inline, second = resume-tailor
    vi.mocked(aiClient.callClaude)
      .mockResolvedValueOnce({
        ai_quality: 0.75,
        rationale: "Decent fit.",
        gaps: [],
      })
      .mockResolvedValueOnce(MOCK_TAILORED_CONTENT);

    const res = await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456" }));

    expect(res.status).toBe(200);

    const calls = vi.mocked(aiClient.callClaude).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].feature).toBe("fit-score-inline");
    expect(calls[1][0].feature).toBe("resume-tailor");

    // The computed fit result should be persisted
    expect(dbFit.createFitResult).toHaveBeenCalledWith(
      mockSupabase,
      MOCK_USER.id,
      "resume-123",
      "job-456",
      expect.objectContaining({ score: expect.any(Number) })
    );
  });

  it("grounding check: tailored output skills are a subset of base resume skills + technologies", async () => {
    const res = await POST(
      makeRequest({ resume_id: "resume-123", job_id: "job-456", fit_id: "fit-789" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // Collect all valid skills from the base resume
    const baseSkills = new Set([
      ...MOCK_RESUME_CONTENT.skills,
      ...MOCK_RESUME_CONTENT.experience.flatMap((e) => e.technologies),
    ]);

    // Every skill in the tailored output must be in the base resume
    for (const skill of body.content.skills as string[]) {
      expect(baseSkills.has(skill)).toBe(true);
    }
  });

  it("passes fit result context (matched/missing skills, gaps, rationale) to Claude", async () => {
    await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456", fit_id: "fit-789" }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const context = JSON.parse(opts.userMessage);

    expect(context.fit).toBeDefined();
    expect(context.fit.matched_required).toEqual(
      expect.arrayContaining(MOCK_FIT_RESULT.matched_required)
    );
    expect(context.fit.missing_required).toBeDefined();
    expect(context.fit.gaps).toBeDefined();
    expect(context.fit.rationale).toBeDefined();
  });

  it("does not include raw_text beyond 4096 chars in job context sent to Claude", async () => {
    const longRawText = "x".repeat(8000);
    const jobWithLongText: JobPosting = { ...MOCK_JOB_POSTING, raw_text: longRawText };
    vi.mocked(dbJob.getJob).mockResolvedValue({
      ...MOCK_JOB_ROW,
      posting: jobWithLongText,
    } as never);

    await POST(makeRequest({ resume_id: "resume-123", job_id: "job-456", fit_id: "fit-789" }));

    const [opts] = vi.mocked(aiClient.callClaude).mock.calls[0];
    const context = JSON.parse(opts.userMessage);
    expect(context.job.raw_text.length).toBeLessThanOrEqual(4096);
  });

  it("returns changes array in response", async () => {
    const res = await POST(
      makeRequest({ resume_id: "resume-123", job_id: "job-456", fit_id: "fit-789" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.changes)).toBe(true);
    expect(body.changes.length).toBeGreaterThan(0);
    expect(body.changes[0]).toHaveProperty("field");
    expect(body.changes[0]).toHaveProperty("reason");
  });

  it("returns 500 with retry suggestion when AIValidationError is thrown by tailor call", async () => {
    const { ZodError } = await import("zod");
    const zodErr = new ZodError([]);
    vi.mocked(aiClient.callClaude).mockRejectedValue(
      new aiClient.AIValidationError("Schema mismatch", zodErr)
    );

    const res = await POST(
      makeRequest({ resume_id: "resume-123", job_id: "job-456", fit_id: "fit-789" })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(aiClient.callClaude).mockRejectedValue(new Error("Network failure"));

    const res = await POST(
      makeRequest({ resume_id: "resume-123", job_id: "job-456", fit_id: "fit-789" })
    );

    expect(res.status).toBe(500);
  });

  it("tailored resume is persisted as new row with tailored status", async () => {
    const res = await POST(
      makeRequest({ resume_id: "resume-123", job_id: "job-456", fit_id: "fit-789" })
    );

    expect(res.status).toBe(200);

    // createResume is called to persist the new tailored resume
    expect(dbResume.createResume).toHaveBeenCalledOnce();

    // update is called on the resumes table to set base_resume_id, job_id, status
    expect(mockSupabase.from).toHaveBeenCalledWith("resumes");
  });
});
