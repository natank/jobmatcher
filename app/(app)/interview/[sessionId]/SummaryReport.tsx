import Link from "next/link";
import { CheckCircle2, AlertCircle, ArrowRight, TrendingUp } from "lucide-react";
import type { InterviewSummary } from "@/types/feedback";

interface SummaryReportProps {
  summary: InterviewSummary;
  jobId: string;
}

const READINESS_CONFIG = {
  high: {
    label: "High readiness",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    barColor: "bg-emerald-500",
  },
  moderate: {
    label: "Moderate readiness",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
    barColor: "bg-amber-400",
  },
  low: {
    label: "Low readiness",
    classes: "bg-red-50 text-red-700 border-red-200",
    barColor: "bg-red-400",
  },
} as const;

const SCORE_COLORS = [
  "",
  "text-red-600",
  "text-orange-500",
  "text-amber-500",
  "text-emerald-500",
  "text-emerald-600",
] as const;

function AverageBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{value.toFixed(1)}/5</span>
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

export function SummaryReport({ summary, jobId }: SummaryReportProps) {
  const readinessCfg = READINESS_CONFIG[summary.readiness];
  const overallColor = SCORE_COLORS[summary.overall_score] ?? "text-slate-900";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Session Report</h2>
        <p className="mt-1 text-sm text-slate-500">
          Here&apos;s how you performed across all 5 questions.
        </p>

        <div className="mt-5 flex items-center gap-6">
          {/* Overall score */}
          <div className="text-center">
            <p className={`text-5xl font-bold tabular-nums ${overallColor}`}>
              {summary.overall_score}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">out of 5</p>
          </div>

          {/* Averages */}
          <div className="flex-1 space-y-2">
            <AverageBar label="Relevance" value={summary.avg_relevance} />
            <AverageBar label="Depth" value={summary.avg_depth} />
            <AverageBar label="Clarity" value={summary.avg_clarity} />
          </div>
        </div>

        {/* Readiness badge */}
        <div className="mt-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${readinessCfg.classes}`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {readinessCfg.label}
          </span>
        </div>
      </div>

      {/* Strengths */}
      {summary.top_strengths.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Top strengths</p>
          <ul className="space-y-2">
            {summary.top_strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key gaps */}
      {summary.key_gaps.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Key gaps</p>
          <ul className="space-y-2">
            {summary.key_gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended actions */}
      {summary.recommended_actions.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Recommended actions</p>
          <ol className="space-y-2">
            {summary.recommended_actions.map((action, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Back to job */}
      <Link
        href={`/jobs/${jobId}`}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Back to job
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
