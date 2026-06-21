import type { TypedSupabaseClient } from "@/lib/db/client";
import type { Database } from "@/types/database";
import { AnswerFeedbackSchema, type AnswerFeedback } from "@/types/feedback";

type Supabase = TypedSupabaseClient;
export type AnswerRow = Database["public"]["Tables"]["answers"]["Row"];

export async function createAnswer(
  supabase: Supabase,
  sessionId: string,
  questionIndex: number,
  answerText: string,
  feedback: AnswerFeedback
): Promise<{ id: string }> {
  const { data, error } = await (
    supabase.from("answers") as unknown as {
      insert: (row: object) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .insert({
      session_id: sessionId,
      question_index: questionIndex,
      answer_text: answerText,
      feedback,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create answer: ${error?.message}`);
  return { id: data.id };
}

export async function getAnswer(
  supabase: Supabase,
  sessionId: string,
  questionIndex: number
): Promise<(AnswerRow & { feedback: AnswerFeedback }) | null> {
  const result = await supabase
    .from("answers")
    .select("*")
    .eq("session_id", sessionId)
    .eq("question_index", questionIndex)
    .maybeSingle();

  const row = result.data as AnswerRow | null;
  if (!row) return null;

  const parsed = AnswerFeedbackSchema.safeParse(row.feedback);
  if (!parsed.success) return null;

  return { ...row, feedback: parsed.data };
}

export async function listAnswers(
  supabase: Supabase,
  sessionId: string
): Promise<(AnswerRow & { feedback: AnswerFeedback | null })[]> {
  const result = await supabase
    .from("answers")
    .select("*")
    .eq("session_id", sessionId)
    .order("question_index", { ascending: true });

  if (result.error) throw new Error(`Failed to list answers: ${result.error.message}`);

  const rows = (result.data as AnswerRow[]) ?? [];
  return rows.map((row) => {
    const parsed = AnswerFeedbackSchema.safeParse(row.feedback);
    return { ...row, feedback: parsed.success ? parsed.data : null };
  });
}
