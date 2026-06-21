"use client";

import { useState, useCallback, useRef } from "react";
import { Loader2, AlertCircle, ChevronRight, Send, Flag } from "lucide-react";
import type { Question } from "@/types/interview";
import type { AnswerFeedback, InterviewSummary } from "@/types/feedback";
import { FeedbackCard } from "./FeedbackCard";
import { SummaryReport } from "./SummaryReport";

interface StoredAnswer {
  answer_text: string;
  feedback: AnswerFeedback;
}

interface InterviewRunnerProps {
  sessionId: string;
  jobId: string;
  questions: Question[];
  /** Answers already persisted (for mid-session resume) */
  initialAnswers: StoredAnswer[];
  /** Pre-existing summary if this session was already completed */
  initialSummary: InterviewSummary | null;
}

const ANSWER_MAX_BYTES = 4 * 1024;

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

type QuestionPhase = "answering" | "feedback";

export function InterviewRunner({
  sessionId,
  jobId,
  questions,
  initialAnswers,
  initialSummary,
}: InterviewRunnerProps) {
  // Build initial answered map from persisted answers
  const initialAnsweredMap: Record<number, StoredAnswer> = {};
  initialAnswers.forEach((a, i) => {
    initialAnsweredMap[i] = a;
  });

  // Start at first unanswered question
  const firstUnanswered = questions.findIndex((_, i) => !initialAnsweredMap[i]);
  const startIndex = firstUnanswered === -1 ? questions.length - 1 : firstUnanswered;
  const startPhase: QuestionPhase =
    initialAnsweredMap[startIndex] !== undefined ? "feedback" : "answering";

  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [phase, setPhase] = useState<QuestionPhase>(startPhase);
  const [answeredMap, setAnsweredMap] = useState<Record<number, StoredAnswer>>(initialAnsweredMap);
  const [answerText, setAnswerText] = useState("");
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InterviewSummary | null>(initialSummary);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answeredMap).length;
  const allAnswered = answeredCount === questions.length;
  const overBytes = byteLength(answerText) > ANSWER_MAX_BYTES;

  const handleSubmitAnswer = useCallback(async () => {
    if (!answerText.trim() || overBytes) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          question_index: currentIndex,
          answer_text: answerText,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        feedback?: AnswerFeedback;
        answered_count?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      if (data.feedback) {
        setAnsweredMap((prev) => ({
          ...prev,
          [currentIndex]: { answer_text: answerText, feedback: data.feedback! },
        }));
        setPhase("feedback");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setLoading(false);
    }
  }, [answerText, currentIndex, sessionId, overBytes]);

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      // If next question already answered (resume), show its feedback; else start fresh
      if (answeredMap[nextIndex]) {
        setAnswerText(answeredMap[nextIndex].answer_text);
        setPhase("feedback");
      } else {
        setAnswerText("");
        setPhase("answering");
      }
      setError(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [currentIndex, questions.length, answeredMap]);

  const handleGetReport = useCallback(async () => {
    setSummaryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        summary?: InterviewSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setSummaryLoading(false);
    }
  }, [sessionId]);

  // --- Completed session view ---
  if (summary) {
    return <SummaryReport summary={summary} jobId={jobId} />;
  }

  const currentFeedback = answeredMap[currentIndex]?.feedback ?? null;
  const isLastQuestion = currentIndex === questions.length - 1;

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-2 w-8 rounded-full transition-colors ${
                answeredMap[i] ? "bg-teal-500" : i === currentIndex ? "bg-teal-200" : "bg-slate-200"
              }`}
            />
          ))}
        </div>
        <span className="text-sm text-slate-500">
          {answeredCount}/{questions.length} answered
        </span>
      </div>

      {/* Question card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
            Q{currentIndex + 1} of {questions.length}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600">
            {currentQuestion.type}
          </span>
          {currentQuestion.repo_ref && (
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-500">
              {currentQuestion.repo_ref}
            </span>
          )}
        </div>
        <p className="mt-3 text-base font-medium text-slate-900">{currentQuestion.text}</p>
      </div>

      {/* Answer phase */}
      {phase === "answering" && (
        <div className="space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Type your answer here…"
              rows={8}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            {overBytes && (
              <p className="mt-1 text-xs text-red-600">
                Answer exceeds the 4 KB limit. Please shorten your response.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={() => void handleSubmitAnswer()}
            disabled={loading || !answerText.trim() || overBytes}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? "Submitting…" : "Submit Answer"}
          </button>
        </div>
      )}

      {/* Feedback phase */}
      {phase === "feedback" && currentFeedback && (
        <div className="space-y-4">
          <FeedbackCard feedback={currentFeedback} />

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isLastQuestion ? (
            <button
              onClick={handleNext}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700"
            >
              Next question
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : allAnswered ? (
            <button
              onClick={() => void handleGetReport()}
              disabled={summaryLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {summaryLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Flag className="h-4 w-4" />
              )}
              {summaryLoading ? "Generating report…" : "Finish & Get Report"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
