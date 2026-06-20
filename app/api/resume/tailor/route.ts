import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client";
import { callClaude, AIValidationError } from "@/lib/ai/client";
import { getResume, createResume } from "@/lib/db/resume";
import { getJob } from "@/lib/db/job";
import { getFitResult, getFitResultByJobResume, createFitResult } from "@/lib/db/fit";
import { computeCoverage, combinedScore, collectResumeSkills } from "@/lib/fit/score";
import { ResumeContentSchema } from "@/types/resume";
import { FitResultSchema } from "@/types/fit";

async function getSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "prompts", "resume-tailor.md"), "utf-8");
}

const TailoredResumeOutputSchema = ResumeContentSchema.extend({
  changes: z
    .array(
      z.object({
        field: z.string(),
        reason: z.string(),
      })
    )
    .optional(),
});

type TailoredResumeOutput = z.infer<typeof TailoredResumeOutputSchema>;

async function getFitScorePrompt(): Promise<string> {
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
    fit_id?: string;
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

  // Load or compute fit result
  let fitResult: z.infer<typeof FitResultSchema> | null = null;

  if (body.fit_id) {
    const fitRow = await getFitResult(supabase, user.id, body.fit_id);
    fitResult = fitRow?.fitResult ?? null;
  }

  if (!fitResult) {
    // Look up latest fit result for this (job, resume) pair
    const existingFit = await getFitResultByJobResume(
      supabase,
      user.id,
      body.job_id,
      body.resume_id
    );
    fitResult = existingFit?.fitResult ?? null;
  }

  if (!fitResult) {
    // Compute on-the-fly (inline, not persisted separately)
    const { skills, tech } = collectResumeSkills(resume);
    const coverageResult = computeCoverage(
      skills,
      tech,
      job.required_skills,
      job.preferred_skills,
      job.seniority
    );

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

    const fitSystemPrompt = await getFitScorePrompt();

    try {
      const aiOutput = await callClaude({
        systemPrompt: fitSystemPrompt,
        userMessage: JSON.stringify(aiContext),
        schema: AiOutputSchema,
        temperature: 0.2,
        feature: "fit-score-inline",
      });

      const score = combinedScore(coverageResult.coverage, aiOutput.ai_quality);

      fitResult = FitResultSchema.parse({
        score,
        coverage: coverageResult.coverage,
        ai_quality: aiOutput.ai_quality,
        matched_required: coverageResult.matched_required,
        missing_required: coverageResult.missing_required,
        matched_preferred: coverageResult.matched_preferred,
        gaps: aiOutput.gaps,
        rationale: aiOutput.rationale,
      });

      // Persist the computed fit result
      await createFitResult(supabase, user.id, body.resume_id, body.job_id, fitResult);
    } catch (err) {
      if (err instanceof AIValidationError) {
        console.error("[resume/tailor] Fit score validation failed:", err.message);
        return NextResponse.json(
          { error: "Fit scoring failed schema validation. Please try again." },
          { status: 500 }
        );
      }
      throw err;
    }
  }

  // Build tailor context — resume + job (truncated to 4 KB) + fit
  const jobForContext = {
    title: job.title,
    seniority: job.seniority,
    required_skills: job.required_skills,
    preferred_skills: job.preferred_skills,
    responsibilities: job.responsibilities,
    keywords: job.keywords,
    raw_text: job.raw_text.slice(0, 4096),
  };

  const tailorContext = {
    resume,
    job: jobForContext,
    fit: {
      matched_required: fitResult.matched_required,
      missing_required: fitResult.missing_required,
      matched_preferred: fitResult.matched_preferred,
      gaps: fitResult.gaps,
      rationale: fitResult.rationale,
    },
  };

  const systemPrompt = await getSystemPrompt();

  try {
    const tailored: TailoredResumeOutput = await callClaude({
      systemPrompt,
      userMessage: JSON.stringify(tailorContext),
      schema: TailoredResumeOutputSchema,
      feature: "resume-tailor",
    });

    const { changes, ...content } = tailored;

    const { id: tailored_resume_id } = await createResume(supabase, user.id, content);

    // Update the new resume row with base_resume_id and job_id
    // We use a raw update via the supabase client
    await (
      supabase.from("resumes") as unknown as {
        update: (row: object) => {
          eq: (
            col: string,
            val: string
          ) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      }
    )
      .update({
        base_resume_id: body.resume_id,
        job_id: body.job_id,
        status: "tailored",
      })
      .eq("id", tailored_resume_id)
      .eq("user_id", user.id);

    return NextResponse.json({ tailored_resume_id, content, changes: changes ?? [] });
  } catch (err) {
    if (err instanceof AIValidationError) {
      console.error("[resume/tailor] Schema validation failed:", err.message);
      return NextResponse.json(
        { error: "Resume tailoring failed schema validation. Please try again." },
        { status: 500 }
      );
    }
    console.error("[resume/tailor] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
