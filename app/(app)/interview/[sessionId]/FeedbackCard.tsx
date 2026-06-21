import { CheckCircle2, AlertCircle, Lightbulb } from "lucide-react";
import type { AnswerFeedback } from "@/types/feedback";

interface FeedbackCardProps {
  feedback: AnswerFeedback;
}

const SCORE_COLORS = [
  "",
  "text-red-600",
  "text-orange-500",
  "text-amber-500",
  "text-emerald-500",
  "text-emerald-600",
] as const;

const BAR_COLORS = [
  "",
  "bg-red-400",
  "bg-orange-400",
  "bg-amber-400",
  "bg-emerald-400",
  "bg-emerald-500",
] as const;

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = BAR_COLORS[value] ?? "bg-slate-300";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className={`font-semibold ${SCORE_COLORS[value] ?? "text-slate-900"}`}>
          {value}/5
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function FeedbackCard({ feedback }: FeedbackCardProps) {
  const overallColor = SCORE_COLORS[feedback.overall] ?? "text-slate-900";

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Overall score */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className={`text-4xl font-bold tabular-nums ${overallColor}`}>{feedback.overall}</p>
          <p className="mt-0.5 text-xs text-slate-400">overall</p>
        </div>
        <div className="flex-1 space-y-2">
          <ScoreBar label="Relevance" value={feedback.relevance} />
          <ScoreBar label="Depth" value={feedback.depth} />
          <ScoreBar label="Clarity" value={feedback.clarity} />
        </div>
      </div>

      {/* Strengths */}
      {feedback.strengths.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Strengths
          </p>
          <ul className="space-y-1">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {feedback.improvements.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Improvements
          </p>
          <ul className="space-y-1">
            {feedback.improvements.map((imp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                {imp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Model answer hint */}
      {feedback.model_answer_hint && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <p className="text-sm text-blue-800">{feedback.model_answer_hint}</p>
        </div>
      )}
    </div>
  );
}
