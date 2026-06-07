import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ResumeContent } from "@/types/resume";

type Supabase = SupabaseClient<Database>;
export type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];

export async function createResume(
  supabase: Supabase,
  userId: string,
  content: ResumeContent
): Promise<{ id: string }> {
  const { data, error } = await (
    supabase.from("resumes") as unknown as {
      insert: (row: object) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .insert({ user_id: userId, content })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create resume: ${error?.message}`);
  return { id: data.id };
}

export async function getResume(
  supabase: Supabase,
  userId: string,
  resumeId: string
): Promise<ResumeRow | null> {
  const result = await supabase
    .from("resumes")
    .select("*")
    .eq("id", resumeId)
    .eq("user_id", userId)
    .maybeSingle();

  return (result.data as ResumeRow | null) ?? null;
}

export async function updateResume(
  supabase: Supabase,
  userId: string,
  resumeId: string,
  content: ResumeContent
): Promise<void> {
  const { error } = await (
    supabase.from("resumes") as unknown as {
      update: (row: object) => {
        eq: (
          col: string,
          val: string
        ) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
      };
    }
  )
    .update({ content })
    .eq("id", resumeId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to update resume: ${error.message}`);
}

export async function listResumes(supabase: Supabase, userId: string): Promise<ResumeRow[]> {
  const result = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (result.error) throw new Error(`Failed to list resumes: ${result.error.message}`);
  return (result.data as ResumeRow[]) ?? [];
}
