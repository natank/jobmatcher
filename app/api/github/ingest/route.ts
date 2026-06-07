import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/client";
import { getGitHubProfile, upsertGitHubProfile } from "@/lib/db/github";
import { ingest } from "@/lib/github/ingest";
import { GitHubRateLimitError } from "@/lib/github/client";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const providerToken = session?.provider_token;
  if (!providerToken) {
    return NextResponse.json(
      { error: "GitHub access token unavailable. Please re-authenticate." },
      { status: 401 }
    );
  }

  const cached = await getGitHubProfile(supabase, user.id);
  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return NextResponse.json({ profile: cached });
    }
  }

  try {
    const profile = await ingest(providerToken);
    await upsertGitHubProfile(supabase, user.id, profile.login, profile);
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof GitHubRateLimitError) {
      return NextResponse.json(
        { error: "GitHub rate limit exceeded", retry_after: err.retryAfter },
        { status: 429 }
      );
    }
    console.error("[github/ingest] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
