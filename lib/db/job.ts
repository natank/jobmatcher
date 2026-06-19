import type { TypedSupabaseClient } from "@/lib/db/client";
import type { Database } from "@/types/database";
import { JobPostingSchema, type JobPosting } from "@/types/job";

type Supabase = TypedSupabaseClient;
export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export async function createJob(
  supabase: Supabase,
  userId: string,
  posting: Omit<JobPosting, "id">
): Promise<{ id: string }> {
  const { data, error } = await (
    supabase.from("jobs") as unknown as {
      insert: (row: object) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .insert({
      user_id: userId,
      source: posting.source,
      source_url: posting.source_url ?? null,
      parsed: posting,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create job: ${error?.message}`);
  return { id: data.id };
}

export async function getJob(
  supabase: Supabase,
  userId: string,
  jobId: string
): Promise<(JobRow & { posting: JobPosting }) | null> {
  const result = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  const row = result.data as JobRow | null;
  if (!row) return null;

  const parsed = JobPostingSchema.safeParse(row.parsed);
  if (!parsed.success) return null;

  return { ...row, posting: parsed.data };
}

export async function listJobs(supabase: Supabase, userId: string): Promise<JobRow[]> {
  const result = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (result.error) throw new Error(`Failed to list jobs: ${result.error.message}`);
  return (result.data as JobRow[]) ?? [];
}
