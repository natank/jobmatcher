"use client";

import { useState, useCallback } from "react";
import { Loader2, AlertCircle, CheckCircle2, XCircle, BarChart2, Zap } from "lucide-react";
import type { FitResult } from "@/types/fit";
import type { ResumeRow } from "@/lib/db/resume";

interface FitScoreCardProps {
  jobId: string;
  initialFit: FitResult | null;
  latestResume: ResumeRow | null;
}

const SEVERITY_COLORS = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const SCORE_COLORS = [
  "",
  "text-red-600",
  "text-orange-500",
  "text-amber-500",
  "text-emerald-500",
  "text-emerald-600",
];

function CoverageBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="mt-1">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>Coverage</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function FitScoreCard({ jobId, initialFit, latestResume }: FitScoreCardProps) {
  const [fit, setFit] = useState<FitResult | null>(initialFit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = useCallback(async () => {
    if (!latestResume) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fit/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resume_id: latestResume.id, job_id: jobId }),
      });
      const data = (await res.json().catch(() => ({}))) as { fit?: FitResult; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      if (data.fit) setFit(data.fit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate fit score");
    } finally {
      setLoading(false);
    }
  }, [jobId, latestResume]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
          <BarChart2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Fit Score</h2>
          <p className="text-sm text-slate-500">How well your resume matches this job</p>
        </div>
      </div>

      {fit ? (
        <div className="mt-5 space-y-5">
          {/* Score + coverage */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p
                className={`text-5xl font-bold tabular-nums ${SCORE_COLORS[fit.score] ?? "text-slate-900"}`}
              >
                {fit.score}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">out of 5</p>
            </div>
            <div className="flex-1">
              <CoverageBar value={fit.coverage} />
            </div>
          </div>

          {/* Matched required */}
          {fit.matched_required.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Matched required skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {fit.matched_required.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing required */}
          {fit.missing_required.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Missing required skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {fit.missing_required.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600"
                  >
                    <XCircle className="h-3 w-3" />
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {fit.gaps.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Gaps
              </p>
              <ul className="space-y-2">
                {fit.gaps.map((gap, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">{gap.skill}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_COLORS[gap.severity]}`}
                      >
                        {gap.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{gap.suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rationale */}
          {fit.rationale && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assessment
              </p>
              <p className="text-sm text-slate-600">{fit.rationale}</p>
            </div>
          )}

          {/* Recalculate */}
          {latestResume && (
            <button
              onClick={() => void handleCalculate()}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {loading ? "Recalculating…" : "Recalculate"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {!latestResume ? (
            <p className="text-sm text-slate-500">
              Generate a resume first, then calculate your fit score for this job.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              No fit score yet. Click below to calculate how well your latest resume matches this
              job.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={() => void handleCalculate()}
            disabled={loading || !latestResume}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading ? "Calculating…" : "Calculate Fit"}
          </button>
        </div>
      )}

      {error && fit && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
