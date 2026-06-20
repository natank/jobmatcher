import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client";
import { callClaude, AIValidationError } from "@/lib/ai/client";
import { getResume } from "@/lib/db/resume";
import { getJob } from "@/lib/db/job";
import { createFitResult } from "@/lib/db/fit";
import { computeCoverage, combinedScore, collectResumeSkills } from "@/lib/fit/score";
import { FitResultSchema } from "@/types/fit";
import { ResumeContentSchema } from "@/types/resume";

async function getSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "prompts", "fit-score.md"), "utf-8");
}

const AiOutputSchema = z.object({
  ai_quality: z.number().min(0).max(1),
  rationale: z.string(),
  gaps: z.array(
    z.object({
      skill: z.string(),
      severity: z.enum(["high", "medium", "low"]),
      suggestion: z.string(),
    })
  ),
});

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    resume_id?: string;
    job_id?: string;
  };

  if (!body.resume_id || !body.job_id) {
    return NextResponse.json(
      { error: "Provide both 'resume_id' and 'job_id' in the request body." },
      { status: 400 }
    );
  }

  const resumeRow = await getResume(supabase, user.id, body.resume_id);
  if (!resumeRow) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  const jobRow = await getJob(supabase, user.id, body.job_id);
  if (!jobRow) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const resumeContent = ResumeContentSchema.safeParse(resumeRow.content);
  if (!resumeContent.success) {
    return NextResponse.json({ error: "Invalid resume content." }, { status: 500 });
  }

  const resume = resumeContent.data;
  const job = jobRow.posting;

  // Deterministic coverage computation
  const { skills, tech } = collectResumeSkills(resume);
  const coverageResult = computeCoverage(
    skills,
    tech,
    job.required_skills,
    job.preferred_skills,
    job.seniority
  );

  // Build AI context (compact — no raw text)
  const aiContext = {
    resume: {
      summary: resume.summary,
      skills: resume.skills,
      experience: resume.experience.map((e) => ({
        project: e.project,
        bullets: e.bullets,
        technologies: e.technologies,
        period: e.period,
      })),
    },
    job: {
      title: job.title,
      seniority: job.seniority,
      required_skills: job.required_skills,
      preferred_skills: job.preferred_skills,
      responsibilities: job.responsibilities,
    },
  };

  const systemPrompt = await getSystemPrompt();

  try {
    const aiOutput = await callClaude({
      systemPrompt,
      userMessage: JSON.stringify(aiContext),
      schema: AiOutputSchema,
      temperature: 0.2,
      feature: "fit-score",
    });

    const score = combinedScore(coverageResult.coverage, aiOutput.ai_quality);

    const fitResult = FitResultSchema.parse({
      score,
      coverage: coverageResult.coverage,
      ai_quality: aiOutput.ai_quality,
      matched_required: coverageResult.matched_required,
      missing_required: coverageResult.missing_required,
      matched_preferred: coverageResult.matched_preferred,
      gaps: aiOutput.gaps,
      rationale: aiOutput.rationale,
    });

    const { id } = await createFitResult(supabase, user.id, body.resume_id, body.job_id, fitResult);

    return NextResponse.json({ fit: { ...fitResult, id } }, { status: 200 });
  } catch (err) {
    if (err instanceof AIValidationError) {
      console.error("[fit/score] Schema validation failed:", err.message);
      return NextResponse.json(
        { error: "Fit scoring failed schema validation. Please try again." },
        { status: 500 }
      );
    }
    console.error("[fit/score] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
