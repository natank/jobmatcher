import { redirect } from "next/navigation";
import { getUser, signOut } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/db/client";
import { getGitHubProfile } from "@/lib/db/github";
import { listResumes } from "@/lib/db/resume";
import { listJobs } from "@/lib/db/job";
import { Github, LogOut } from "lucide-react";
import { GitHubSyncCard } from "./GitHubSyncCard";
import { ResumeCard } from "./ResumeCard";
import { JobCard } from "./JobCard";

export default async function DashboardPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = user.user_metadata?.full_name ?? user.user_metadata?.user_name ?? user.email;

  const supabase = createSupabaseServerClient();
  const [profile, resumes, jobs] = await Promise.all([
    getGitHubProfile(supabase, user.id).catch(() => null),
    listResumes(supabase, user.id).catch(() => []),
    listJobs(supabase, user.id).catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-lg font-bold text-slate-900">JobMatcher</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Github className="h-4 w-4" />
              <span>{displayName}</span>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {displayName}!</h1>
          <p className="mt-1 text-slate-500">
            Sync your GitHub profile, generate a resume, and score it against job postings.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <GitHubSyncCard initialProfile={profile} />
          <ResumeCard initialResumes={resumes} hasProfile={profile !== null} />
          <JobCard initialJobs={jobs} />
        </div>
      </main>
    </div>
  );
}
