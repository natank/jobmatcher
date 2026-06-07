import type { TypedSupabaseClient } from "@/lib/db/client";
import type { Database } from "@/types/database";
import { GitHubProfileSchema, type GitHubProfile } from "@/types/github";

type Supabase = TypedSupabaseClient;

export async function getGitHubProfile(
  supabase: Supabase,
  userId: string
): Promise<GitHubProfile | null> {
  const result = await supabase
    .from("github_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const row = result.data as Database["public"]["Tables"]["github_profiles"]["Row"] | null;

  if (!row?.profile_json) return null;

  const parsed = GitHubProfileSchema.safeParse(row.profile_json);
  return parsed.success ? parsed.data : null;
}

export async function upsertGitHubProfile(
  supabase: Supabase,
  userId: string,
  login: string,
  profile: GitHubProfile,
  tokenEnc?: string
): Promise<void> {
  const existingResult = await supabase
    .from("github_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const existing = existingResult.data as
    | Database["public"]["Tables"]["github_profiles"]["Row"]
    | null;

  // Supabase generic type inference resolves update/insert args to `never` in
  // some SDK versions; cast to any here and rely on function-level types.
  const q = supabase.from("github_profiles") as unknown as {
    update: (row: object) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
    insert: (row: object) => Promise<{ error: { message: string } | null }>;
  };

  const writePayload: object = {
    login,
    profile_json: profile,
    fetched_at: profile.fetched_at,
    ...(tokenEnc !== undefined ? { access_token_enc: tokenEnc } : {}),
  };

  if (existing) {
    const { error } = await q.update(writePayload).eq("user_id", userId);
    if (error) throw new Error(`Failed to update GitHub profile: ${error.message}`);
  } else {
    const { error } = await q.insert({ user_id: userId, ...writePayload });
    if (error) throw new Error(`Failed to insert GitHub profile: ${error.message}`);
  }
}
