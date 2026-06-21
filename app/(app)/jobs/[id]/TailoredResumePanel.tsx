"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Sparkles, ChevronRight, CheckCircle2, FileText } from "lucide-react";
import type { ResumeRow } from "@/lib/db/resume";
import type { ResumeContent } from "@/types/resume";

interface Change {
  field: string;
  reason: string;
}

interface TailoredResumePanelProps {
  jobId: string;
  latestResume: ResumeRow | null;
  /** Pre-computed fit ID if available — passed through to the tailor route */
  fitId?: string;
}

export function TailoredResumePanel({ jobId, latestResume, fitId }: TailoredResumePanelProps) {
  const [tailoredResumeId, setTailoredResumeId] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTailor = useCallback(async () => {
    if (!latestResume) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        resume_id: latestResume.id,
        job_id: jobId,
      };
      if (fitId) body.fit_id = fitId;

      const res = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as {
        tailored_resume_id?: string;
        content?: ResumeContent;
        changes?: Change[];
        error?: string;
      };

      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

      setTailoredResumeId(data.tailored_resume_id ?? null);
      setChanges(data.changes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to tailor resume");
    } finally {
      setLoading(false);
    }
  }, [jobId, latestResume, fitId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Tailored Resume</h2>
          <p className="text-sm text-slate-500">Generate a job-specific resume variant</p>
        </div>
      </div>

      {tailoredResumeId ? (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Tailored resume created successfully.</span>
          </div>

          <Link
            href={`/resume/${tailoredResumeId}`}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-violet-500" />
              Open in editor
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>

          {changes.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Changes made
              </p>
              <ul className="space-y-2">
                {changes.map((change, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-700">{change.field}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{change.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => void handleTailor()}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? "Tailoring…" : "Re-tailor"}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {!latestResume ? (
            <p className="text-sm text-slate-500">
              Generate a resume first, then tailor it for this job.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Create a job-specific resume variant. Skills and experience are reordered and
              rephrased to match this role — nothing is fabricated.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={() => void handleTailor()}
            disabled={loading || !latestResume}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? "Tailoring…" : "Tailor Resume"}
          </button>
        </div>
      )}
    </div>
  );
}
