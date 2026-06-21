import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUser } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/db/client";
import { getSession } from "@/lib/db/interview";
import { listAnswers } from "@/lib/db/answer";
import { getSummary } from "@/lib/db/summary";
import { AnswerFeedbackSchema } from "@/types/feedback";
import { InterviewSummarySchema } from "@/types/feedback";
import { InterviewRunner } from "./InterviewRunner";

export default async function InterviewSessionPage({ params }: { params: { sessionId: string } }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseServerClient();

  const [session, answers, summaryRow] = await Promise.all([
    getSession(supabase, user.id, params.sessionId).catch(() => null),
    listAnswers(supabase, params.sessionId).catch(() => []),
    getSummary(supabase, params.sessionId).catch(() => null),
  ]);

  if (!session) redirect("/dashboard");

  // Parse stored answers into typed objects for the runner
  const initialAnswers = answers
    .map((a) => {
      const parsed = AnswerFeedbackSchema.safeParse(a.feedback);
      if (!parsed.success) return null;
      return {
        answer_text: (a.answer_text as unknown as string) ?? "",
        feedback: parsed.data,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  // Parse stored summary if present
  const parsedSummary = summaryRow
    ? (InterviewSummarySchema.safeParse(summaryRow.summary).data ?? null)
    : null;

  const jobId = session.job_id as unknown as string;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/jobs/${jobId}`}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to job
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-900">Mock Interview</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <InterviewRunner
          sessionId={params.sessionId}
          jobId={jobId}
          questions={session.questions}
          initialAnswers={initialAnswers}
          initialSummary={parsedSummary}
        />
      </main>
    </div>
  );
}
