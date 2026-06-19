import type { TypedSupabaseClient } from "@/lib/db/client";
import type { Database } from "@/types/database";
import { FitResultSchema, type FitResult } from "@/types/fit";

type Supabase = TypedSupabaseClient;
export type FitRow = Database["public"]["Tables"]["fit_results"]["Row"];

export async function createFitResult(
  supabase: Supabase,
  userId: string,
  resumeId: string,
  jobId: string,
  result: FitResult
): Promise<{ id: string }> {
  const { data, error } = await (
    supabase.from("fit_results") as unknown as {
      insert: (row: object) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .insert({ user_id: userId, resume_id: resumeId, job_id: jobId, result })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create fit result: ${error?.message}`);
  return { id: data.id };
}

export async function getFitResult(
  supabase: Supabase,
  userId: string,
  fitId: string
): Promise<(FitRow & { fitResult: FitResult }) | null> {
  const result = await supabase
    .from("fit_results")
    .select("*")
    .eq("id", fitId)
    .eq("user_id", userId)
    .maybeSingle();

  const row = result.data as FitRow | null;
  if (!row) return null;

  const parsed = FitResultSchema.safeParse(row.result);
  if (!parsed.success) return null;

  return { ...row, fitResult: parsed.data };
}

export async function getFitResultByJobResume(
  supabase: Supabase,
  userId: string,
  jobId: string,
  resumeId: string
): Promise<(FitRow & { fitResult: FitResult }) | null> {
  const result = await supabase
    .from("fit_results")
    .select("*")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: false })
    .maybeSingle();

  const row = result.data as FitRow | null;
  if (!row) return null;

  const parsed = FitResultSchema.safeParse(row.result);
  if (!parsed.success) return null;

  return { ...row, fitResult: parsed.data };
}
