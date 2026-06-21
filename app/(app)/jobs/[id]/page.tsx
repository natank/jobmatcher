import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, Building2, Tag } from "lucide-react";
import { getUser } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/db/client";
import { getJob } from "@/lib/db/job";
import { listResumes } from "@/lib/db/resume";
import { getFitResultByJobResume } from "@/lib/db/fit";
import { getGitHubProfile } from "@/lib/db/github";
import { listSessionsByJob } from "@/lib/db/interview";
import { FitScoreCard } from "./FitScoreCard";
import { TailoredResumePanel } from "./TailoredResumePanel";
import { InterviewPanel } from "./InterviewPanel";

const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
  unknown: "Unknown level",
};

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseServerClient();

  const [jobRow, resumes, githubProfile, sessions] = await Promise.all([
    getJob(supabase, user.id, params.id).catch(() => null),
    listResumes(supabase, user.id).catch(() => []),
    getGitHubProfile(supabase, user.id).catch(() => null),
    listSessionsByJob(supabase, user.id, params.id).catch(() => []),
  ]);

  if (!jobRow) redirect("/dashboard");

  const job = jobRow.posting;
  const latestResume = resumes.length > 0 ? resumes[0] : null;

  const existingFit = latestResume
    ? await getFitResultByJobResume(supabase, user.id, params.id, latestResume.id).catch(() => null)
    : null;

  const fitResult = existingFit?.fitResult ?? null;
  const fitId = existingFit?.id;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <span className="text-slate-300">/</span>
            <span className="max-w-xs truncate text-sm font-medium text-slate-900">
              {job.title}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        {/* Job header */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-600">
              <Briefcase className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-slate-900">{job.title}</h1>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                {job.company && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {job.company}
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600">
                  {SENIORITY_LABELS[job.seniority] ?? job.seniority}
                </span>
                <span className="text-xs capitalize text-slate-400">{job.source}</span>
                {job.source_url && (
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-xs truncate text-xs text-blue-500 hover:underline"
                  >
                    View original
                  </a>
                )}
              </div>

              {/* Skills */}
              <div className="mt-4 space-y-3">
                {job.required_skills.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Required skills
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.required_skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {job.preferred_skills.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Preferred skills
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.preferred_skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {job.keywords.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Keywords
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.keywords.map((k) => (
                        <span
                          key={k}
                          className="flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-0.5 text-xs text-slate-500"
                        >
                          <Tag className="h-3 w-3" />
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Responsibilities */}
              {job.responsibilities.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Responsibilities
                  </p>
                  <ul className="space-y-1">
                    {job.responsibilities.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fit score + tailor panels */}
        <div className="grid gap-6 sm:grid-cols-2">
          <FitScoreCard jobId={params.id} initialFit={fitResult} latestResume={latestResume} />
          <TailoredResumePanel jobId={params.id} latestResume={latestResume} fitId={fitId} />
        </div>

        {/* Interview panel */}
        <InterviewPanel
          jobId={params.id}
          hasGitHubProfile={githubProfile !== null}
          initialSessions={sessions}
        />
      </main>
    </div>
  );
}
