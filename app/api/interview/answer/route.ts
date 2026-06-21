import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client";
import { callClaude, AIValidationError } from "@/lib/ai/client";
import { getSession } from "@/lib/db/interview";
import { getGitHubProfile } from "@/lib/db/github";
import { getJob } from "@/lib/db/job";
import { createAnswer, listAnswers } from "@/lib/db/answer";
import { AnswerFeedbackSchema } from "@/types/feedback";

async function getSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "prompts", "interview-feedback.md"), "utf-8");
}

// Route-local AI output schema — `overall` is computed server-side, not by Claude
const AiFeedbackOutputSchema = z.object({
  relevance: z.number().int().min(1).max(5),
  depth: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  model_answer_hint: z.string(),
});

const ANSWER_MAX_BYTES = 4 * 1024; // 4 KB

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
    question_index?: number;
    answer_text?: string;
  };

  if (!body.session_id || body.question_index === undefined || !body.answer_text) {
    return NextResponse.json(
      {
        error:
          "Provide 'session_id', 'question_index' (0–4), and 'answer_text' in the request body.",
      },
      { status: 400 }
    );
  }

  if (
    body.question_index < 0 ||
    body.question_index > 4 ||
    !Number.isInteger(body.question_index)
  ) {
    return NextResponse.json(
      { error: "'question_index' must be an integer between 0 and 4." },
      { status: 400 }
    );
  }

  // Enforce 4 KB answer length cap
  if (Buffer.byteLength(body.answer_text, "utf-8") > ANSWER_MAX_BYTES) {
    return NextResponse.json(
      { error: "Answer exceeds the 4 KB limit. Please shorten your response." },
      { status: 400 }
    );
  }

  const session = await getSession(supabase, user.id, body.session_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  if (session.status !== "active") {
    return NextResponse.json(
      { error: "Session is no longer active.", status: session.status },
      { status: 409 }
    );
  }

  const question = session.questions[body.question_index];
  if (!question) {
    return NextResponse.json(
      { error: `No question at index ${body.question_index}.` },
      { status: 400 }
    );
  }

  // Build compact AI context
  const [jobRow, githubProfile] = await Promise.all([
    getJob(supabase, user.id, session.job_id).catch(() => null),
    getGitHubProfile(supabase, user.id).catch(() => null),
  ]);

  const aiContext = {
    question: {
      text: question.text,
      type: question.type,
      repo_ref: question.repo_ref,
    },
    answer: body.answer_text,
    context: {
      job: jobRow
        ? {
            title: jobRow.posting.title,
            seniority: jobRow.posting.seniority,
            required_skills: jobRow.posting.required_skills,
          }
        : null,
      repos: githubProfile
        ? githubProfile.repos
            .sort((a, b) => b.signal_score - a.signal_score)
            .slice(0, 5)
            .map((r) => ({
              name: r.name,
              languages: r.languages.map((l) => l.name),
              topics: r.topics,
            }))
        : [],
    },
  };

  const systemPrompt = await getSystemPrompt();

  try {
    const aiOutput = await callClaude({
      systemPrompt,
      userMessage: JSON.stringify(aiContext),
      schema: AiFeedbackOutputSchema,
      temperature: 0.3,
      feature: "interview-answer",
    });

    // Compute `overall` deterministically: round(mean(relevance, depth, clarity))
    const overall = Math.round((aiOutput.relevance + aiOutput.depth + aiOutput.clarity) / 3);

    const feedback = AnswerFeedbackSchema.parse({ ...aiOutput, overall });

    await createAnswer(supabase, body.session_id, body.question_index, body.answer_text, feedback);

    // Count answered questions (including this one) for UI progress
    const allAnswers = await listAnswers(supabase, body.session_id);
    const answered_count = allAnswers.length;

    return NextResponse.json({ feedback, answered_count }, { status: 200 });
  } catch (err) {
    if (err instanceof AIValidationError) {
      console.error("[interview/answer] Schema validation failed:", err.message);
      return NextResponse.json(
        { error: "Feedback generation failed schema validation. Please try again." },
        { status: 500 }
      );
    }
    console.error("[interview/answer] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
