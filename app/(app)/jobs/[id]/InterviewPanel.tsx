"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  CheckCircle2,
  Clock,
  Ban,
} from "lucide-react";
import type { SessionRow } from "@/lib/db/interview";

interface InterviewPanelProps {
  jobId: string;
  hasGitHubProfile: boolean;
  initialSessions: SessionRow[];
}

const STATUS_CONFIG = {
  active: {
    label: "In progress",
    icon: Clock,
    classes: "bg-amber-50 text-amber-700 border-amber-200",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  abandoned: {
    label: "Abandoned",
    icon: Ban,
    classes: "bg-slate-100 text-slate-500 border-slate-200",
  },
} as const;

type StartResponse = { session_id?: string; error?: string; message?: string };

export function InterviewPanel({ jobId, hasGitHubProfile, initialSessions }: InterviewPanelProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeTierBlocked, setFreeTierBlocked] = useState(false);

  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFreeTierBlocked(false);
    try {
      const res = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = (await res.json().catch(() => ({}))) as StartResponse;

      if (res.status === 429) {
        setFreeTierBlocked(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      if (data.session_id) {
        router.push(`/interview/${data.session_id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start interview");
    } finally {
      setLoading(false);
    }
  }, [jobId, router]);

  const disabled = loading || !hasGitHubProfile;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
          <MessageSquare className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Mock Interview</h2>
          <p className="text-sm text-slate-500">Practice with AI-generated questions</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {/* Precondition messages */}
        {!hasGitHubProfile && (
          <p className="text-sm text-slate-500">
            Sync your GitHub profile first — it&apos;s used to generate technical questions grounded
            in your real projects.
          </p>
        )}

        {hasGitHubProfile && sessions.length === 0 && (
          <p className="text-sm text-slate-500">
            Get 5 personalised questions based on your GitHub projects and this job, then receive
            per-answer feedback and a readiness report.
          </p>
        )}

        {/* Free-tier limit banner */}
        {freeTierBlocked && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              You&apos;ve used your 1 free interview session this month. Upgrade to run more.
            </span>
          </div>
        )}

        {/* Generic error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Start button */}
        <button
          onClick={() => void handleStart()}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquare className="h-4 w-4" />
          )}
          {loading ? "Starting…" : "Start Interview"}
        </button>

        {/* Previous sessions */}
        {sessions.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Previous sessions
            </p>
            <ul className="space-y-2">
              {sessions.map((s) => {
                const cfg =
                  STATUS_CONFIG[s.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.abandoned;
                const Icon = cfg.icon;
                const startedAt = s.started_at
                  ? new Date(s.started_at as string).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Unknown date";

                return (
                  <li key={s.id as string}>
                    <Link
                      href={`/interview/${s.id}`}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 transition hover:bg-slate-100"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.classes}`}
                        >
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                        <span className="truncate text-xs text-slate-400">{startedAt}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
