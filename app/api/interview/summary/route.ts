import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client";
import { callClaude, AIValidationError } from "@/lib/ai/client";
import { getSession, updateSessionStatus } from "@/lib/db/interview";
import { getJob } from "@/lib/db/job";
import { listAnswers } from "@/lib/db/answer";
import { createSummary, getSummary } from "@/lib/db/summary";
import { incrementInterviews, currentPeriod } from "@/lib/db/usage";
import { InterviewSummarySchema } from "@/types/feedback";
import type { AnswerFeedback } from "@/types/feedback";

async function getSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "prompts", "interview-summary.md"), "utf-8");
}

// Route-local AI output schema — numeric averages and overall_score are
// computed deterministically server-side, not delegated to Claude
const AiSummaryOutputSchema = z.object({
  top_strengths: z.array(z.string()),
  key_gaps: z.array(z.string()),
  recommended_actions: z.array(z.string()),
  readiness: z.enum(["low", "moderate", "high"]),
});

const REQUIRED_ANSWER_COUNT = 5;

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    session_id?: string;
  };

  if (!body.session_id) {
    return NextResponse.json(
      { error: "Provide 'session_id' in the request body." },
      { status: 400 }
    );
  }

  const session = await getSession(supabase, user.id, body.session_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Idempotency: return existing summary without re-calling Claude or re-incrementing counter
  const existingSummary = await getSummary(supabase, body.session_id);
  if (existingSummary) {
    return NextResponse.json({ summary: existingSummary.summary }, { status: 200 });
  }

  const answers = await listAnswers(supabase, body.session_id);
  if (answers.length < REQUIRED_ANSWER_COUNT) {
    return NextResponse.json(
      {
        error: "incomplete_session",
        message: `All 5 questions must be answered before generating a summary. ${answers.length}/5 answered.`,
      },
      { status: 400 }
    );
  }

  // Compute deterministic averages from stored per-answer feedback
  const feedbacks = answers.map((a) => a.feedback as unknown as AnswerFeedback);
  const avg_relevance = feedbacks.reduce((sum, f) => sum + f.relevance, 0) / REQUIRED_ANSWER_COUNT;
  const avg_depth = feedbacks.reduce((sum, f) => sum + f.depth, 0) / REQUIRED_ANSWER_COUNT;
  const avg_clarity = feedbacks.reduce((sum, f) => sum + f.clarity, 0) / REQUIRED_ANSWER_COUNT;
  const overall_score = Math.round(
    feedbacks.reduce((sum, f) => sum + f.overall, 0) / REQUIRED_ANSWER_COUNT
  );

  // Build AI context — compact: questions + scores + strengths/improvements only
  const jobRow = await getJob(supabase, user.id, session.job_id).catch(() => null);

  const transcript = session.questions.map((q, i) => {
    const answer = answers.find((a) => (a.question_index as unknown as number) === i);
    const fb = answer ? (answer.feedback as unknown as AnswerFeedback) : null;
    return {
      question: { text: q.text, type: q.type, repo_ref: q.repo_ref },
      answer: answer ? (answer.answer_text as unknown as string) : "",
      feedback: fb
        ? {
            relevance: fb.relevance,
            depth: fb.depth,
            clarity: fb.clarity,
            overall: fb.overall,
            strengths: fb.strengths,
            improvements: fb.improvements,
          }
        : null,
    };
  });

  const aiContext = {
    job: jobRow
      ? {
          title: jobRow.posting.title,
          seniority: jobRow.posting.seniority,
          required_skills: jobRow.posting.required_skills,
        }
      : null,
    transcript,
  };

  const systemPrompt = await getSystemPrompt();

  try {
    const aiOutput = await callClaude({
      systemPrompt,
      userMessage: JSON.stringify(aiContext),
      schema: AiSummaryOutputSchema,
      temperature: 0.3,
      feature: "interview-summary",
    });

    const summary = InterviewSummarySchema.parse({
      session_id: body.session_id,
      avg_relevance,
      avg_depth,
      avg_clarity,
      overall_score,
      top_strengths: aiOutput.top_strengths,
      key_gaps: aiOutput.key_gaps,
      recommended_actions: aiOutput.recommended_actions,
      readiness: aiOutput.readiness,
    });

    await createSummary(supabase, body.session_id, summary);
    await updateSessionStatus(
      supabase,
      user.id,
      body.session_id,
      "completed",
      new Date().toISOString()
    );
    await incrementInterviews(supabase, user.id, currentPeriod());

    return NextResponse.json({ summary }, { status: 200 });
  } catch (err) {
    if (err instanceof AIValidationError) {
      console.error("[interview/summary] Schema validation failed:", err.message);
      return NextResponse.json(
        { error: "Summary generation failed schema validation. Please try again." },
        { status: 500 }
      );
    }
    console.error("[interview/summary] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
