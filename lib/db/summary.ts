import type { TypedSupabaseClient } from "@/lib/db/client";
import type { Database } from "@/types/database";
import { InterviewSummarySchema, type InterviewSummary } from "@/types/feedback";

type Supabase = TypedSupabaseClient;
export type SummaryRow = Database["public"]["Tables"]["interview_summaries"]["Row"];

export async function createSummary(
  supabase: Supabase,
  sessionId: string,
  summary: InterviewSummary
): Promise<{ id: string }> {
  const { data, error } = await (
    supabase.from("interview_summaries") as unknown as {
      insert: (row: object) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .insert({ session_id: sessionId, summary })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create interview summary: ${error?.message}`);
  return { id: data.id };
}

export async function getSummary(
  supabase: Supabase,
  sessionId: string
): Promise<(SummaryRow & { summary: InterviewSummary }) | null> {
  const result = await supabase
    .from("interview_summaries")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  const row = result.data as SummaryRow | null;
  if (!row) return null;

  const parsed = InterviewSummarySchema.safeParse(row.summary);
  if (!parsed.success) return null;

  return { ...row, summary: parsed.data };
}
