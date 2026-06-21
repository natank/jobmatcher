import type { TypedSupabaseClient } from "@/lib/db/client";
import type { Database } from "@/types/database";

type Supabase = TypedSupabaseClient;
export type UsageRow = Database["public"]["Tables"]["usage_counters"]["Row"];

export async function getUsage(
  supabase: Supabase,
  userId: string,
  period: string
): Promise<UsageRow | null> {
  const result = await supabase
    .from("usage_counters")
    .select("*")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();

  return (result.data as UsageRow | null) ?? null;
}

export async function incrementInterviews(
  supabase: Supabase,
  userId: string,
  period: string
): Promise<void> {
  // Fetch-then-upsert to avoid requiring a DB-level upsert function.
  // The summary route calls this at most once per session (idempotency is
  // the caller's responsibility via the getSummary check).
  const existing = await getUsage(supabase, userId, period);

  if (existing) {
    const { error } = await (
      supabase.from("usage_counters") as unknown as {
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
      .update({ interviews_count: existing.interviews_count + 1 })
      .eq("user_id", userId)
      .eq("period", period);

    if (error) throw new Error(`Failed to increment interviews_count: ${error.message}`);
  } else {
    const { error } = await (
      supabase.from("usage_counters") as unknown as {
        insert: (row: object) => Promise<{ error: { message: string } | null }>;
      }
    ).insert({ user_id: userId, period, resumes_count: 0, interviews_count: 1 });

    if (error) throw new Error(`Failed to create usage row: ${error.message}`);
  }
}

export async function incrementResumes(
  supabase: Supabase,
  userId: string,
  period: string
): Promise<void> {
  const existing = await getUsage(supabase, userId, period);

  if (existing) {
    const { error } = await (
      supabase.from("usage_counters") as unknown as {
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
      .update({ resumes_count: existing.resumes_count + 1 })
      .eq("user_id", userId)
      .eq("period", period);

    if (error) throw new Error(`Failed to increment resumes_count: ${error.message}`);
  } else {
    const { error } = await (
      supabase.from("usage_counters") as unknown as {
        insert: (row: object) => Promise<{ error: { message: string } | null }>;
      }
    ).insert({ user_id: userId, period, resumes_count: 1, interviews_count: 0 });

    if (error) throw new Error(`Failed to create usage row: ${error.message}`);
  }
}

/** Returns the current calendar period string, e.g. "2025-07". */
export function currentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
