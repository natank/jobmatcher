import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client";
import { callClaude, AIValidationError } from "@/lib/ai/client";
import { getJob } from "@/lib/db/job";
import { getGitHubProfile } from "@/lib/db/github";
import { listResumes } from "@/lib/db/resume";
import { createSession } from "@/lib/db/interview";
import { currentPeriod } from "@/lib/db/usage";
import { checkUsageLimit } from "@/lib/limits";
import { QuestionSchema } from "@/types/interview";

async function getSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "prompts", "interview-questions.md"), "utf-8");
}

const QuestionsOutputSchema = z.array(QuestionSchema).length(5);

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    job_id?: string;
  };

  if (!body.job_id) {
    return NextResponse.json({ error: "Provide 'job_id' in the request body." }, { status: 400 });
  }

  // Free-tier gate — reads plan from users table (not user_metadata, which is never set).
  // Counter is incremented at session completion (summary route), not at start.
  const period = currentPeriod();
  const { allowed } = await checkUsageLimit(supabase, user.id, "interviews", period);
  if (!allowed) {
    return NextResponse.json(
      {
        error: "free_tier_limit",
        message:
          "You have reached the free tier limit of 1 completed interview session per month. Upgrade to run more sessions.",
      },
      { status: 429 }
    );
  }

  const jobRow = await getJob(supabase, user.id, body.job_id);
  if (!jobRow) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const githubProfile = await getGitHubProfile(supabase, user.id);
  if (!githubProfile) {
    return NextResponse.json(
      { error: "GitHub profile not found. Sync your GitHub account first." },
      { status: 400 }
    );
  }

  // Latest resume is optional context — proceed without it
  const resumes = await listResumes(supabase, user.id).catch(() => []);
  const latestResume = resumes[0] ?? null;

  const job = jobRow.posting;

  // Top 5 repos by signal score (compact — no raw README)
  const topRepos = [...githubProfile.repos]
    .sort((a, b) => b.signal_score - a.signal_score)
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      description: r.description,
      languages: r.languages.map((l) => l.name),
      topics: r.topics,
    }));

  const aiContext: Record<string, unknown> = {
    job: {
      title: job.title,
      seniority: job.seniority,
      required_skills: job.required_skills,
      preferred_skills: job.preferred_skills,
      responsibilities: job.responsibilities,
    },
    repos: topRepos,
  };

  if (latestResume) {
    const content = latestResume.content as { summary?: string; skills?: string[] } | null;
    if (content) {
      aiContext.resume = {
        summary: content.summary ?? "",
        skills: content.skills ?? [],
      };
    }
  }

  const systemPrompt = await getSystemPrompt();

  try {
    const questions = await callClaude({
      systemPrompt,
      userMessage: JSON.stringify(aiContext),
      schema: QuestionsOutputSchema,
      temperature: 0.5,
      feature: "interview-start",
    });

    const { id: session_id } = await createSession(supabase, user.id, body.job_id, questions);

    return NextResponse.json({ session_id, questions }, { status: 200 });
  } catch (err) {
    if (err instanceof AIValidationError) {
      console.error("[interview/start] Schema validation failed:", err.message);
      return NextResponse.json(
        { error: "Question generation failed schema validation. Please try again." },
        { status: 500 }
      );
    }
    console.error("[interview/start] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
