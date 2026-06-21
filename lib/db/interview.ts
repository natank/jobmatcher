import type { TypedSupabaseClient } from "@/lib/db/client";
import type { Database } from "@/types/database";
import { z } from "zod";
import {
  QuestionSchema,
  SessionStatusSchema,
  type Question,
  type SessionStatus,
} from "@/types/interview";

type Supabase = TypedSupabaseClient;
export type SessionRow = Database["public"]["Tables"]["interview_sessions"]["Row"];

export async function createSession(
  supabase: Supabase,
  userId: string,
  jobId: string,
  questions: Question[]
): Promise<{ id: string }> {
  const { data, error } = await (
    supabase.from("interview_sessions") as unknown as {
      insert: (row: object) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .insert({
      user_id: userId,
      job_id: jobId,
      status: "active",
      questions,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create interview session: ${error?.message}`);
  return { id: data.id };
}

export async function getSession(
  supabase: Supabase,
  userId: string,
  sessionId: string
): Promise<(SessionRow & { questions: Question[] }) | null> {
  const result = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  const row = result.data as SessionRow | null;
  if (!row) return null;

  const parsed = z.array(QuestionSchema).safeParse(row.questions);
  if (!parsed.success) return null;

  return { ...row, questions: parsed.data };
}

export async function listSessions(supabase: Supabase, userId: string): Promise<SessionRow[]> {
  const result = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });

  if (result.error) throw new Error(`Failed to list interview sessions: ${result.error.message}`);
  return (result.data as SessionRow[]) ?? [];
}

export async function listSessionsByJob(
  supabase: Supabase,
  userId: string,
  jobId: string
): Promise<SessionRow[]> {
  const result = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .order("started_at", { ascending: false });

  if (result.error) throw new Error(`Failed to list sessions for job: ${result.error.message}`);
  return (result.data as SessionRow[]) ?? [];
}

export async function updateSessionStatus(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  status: SessionStatus,
  completedAt?: string | null
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (completedAt !== undefined) patch.completed_at = completedAt;

  const { error } = await (
    supabase.from("interview_sessions") as unknown as {
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
    .update(patch)
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to update session status: ${error.message}`);
}

// Validate that a status string is a valid SessionStatus (useful in route handlers)
export function parseSessionStatus(value: unknown): SessionStatus | null {
  const result = SessionStatusSchema.safeParse(value);
  return result.success ? result.data : null;
}
