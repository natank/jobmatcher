"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Github, RefreshCw, Loader2, AlertCircle, CheckCircle2, X, Code2 } from "lucide-react";
import type { GitHubProfile } from "@/types/github";

interface GitHubSyncCardProps {
  initialProfile: GitHubProfile | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GitHubSyncCard({ initialProfile }: GitHubSyncCardProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<GitHubProfile | null>(initialProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);

  const runSync = useCallback(async () => {
    setShowConsent(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/github/ingest", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const retryAfter = (body as { retry_after?: number }).retry_after;
        throw new Error(
          retryAfter
            ? `GitHub rate limit hit. Retry in ${retryAfter}s.`
            : (body.error ?? `Request failed (${res.status})`)
        );
      }
      const { profile: fresh } = (await res.json()) as { profile: GitHubProfile };
      setProfile(fresh);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleSyncClick = () => {
    if (!profile) {
      setShowConsent(true);
    } else {
      void runSync();
    }
  };

  const topLanguages =
    profile?.languages
      .slice()
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 4) ?? [];

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900">
              <Github className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">GitHub Profile</h2>
              <p className="text-sm text-slate-500">
                {profile
                  ? `@${profile.login} · ${profile.repos.length} repo${profile.repos.length !== 1 ? "s" : ""}`
                  : "Not connected"}
              </p>
            </div>
          </div>

          {profile && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Connected</span>
            </div>
          )}
        </div>

        {profile ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Last synced {formatDate(profile.fetched_at)}</span>
            </div>

            {topLanguages.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Top languages
                </p>
                <div className="flex flex-wrap gap-2">
                  {topLanguages.map((lang) => (
                    <span
                      key={lang.name}
                      className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                    >
                      <Code2 className="h-3 w-3" />
                      {lang.name}
                      <span className="text-slate-400">{lang.percent.toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Connect your GitHub account to analyse your public repositories and generate a tailored
            resume.
          </p>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleSyncClick}
          disabled={loading}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
          {loading ? "Syncing…" : profile ? "Sync Again" : "Connect GitHub"}
        </button>
      </div>

      <Dialog.Root open={showConsent} onOpenChange={setShowConsent}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl focus:outline-none">
            <div className="flex items-start justify-between">
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Allow GitHub access?
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded p-1 text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <Dialog.Description className="mt-2 text-sm text-slate-600">
              To generate your resume, JobMatcher will read the following data from your GitHub
              account:
            </Dialog.Description>

            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {[
                "Public repositories (up to 100, top 20 selected)",
                "Your authored commit counts per repo",
                "Programming language breakdown",
                "README excerpts for context",
                "Star counts and repository topics",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-slate-400">
              Private repositories are never accessed. Data is stored only for your account.
            </p>

            <div className="mt-6 flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => void runSync()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                <Github className="h-4 w-4" />
                Allow &amp; Sync
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
