"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { FileText, Sparkles, Loader2, AlertCircle, ChevronRight, Github } from "lucide-react";
import type { ResumeRow } from "@/lib/db/resume";
import type { ResumeContent } from "@/types/resume";

interface ResumeCardProps {
  initialResumes: ResumeRow[];
  hasProfile: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSummary(row: ResumeRow): string {
  const content = row.content as ResumeContent | null;
  if (content && typeof content === "object" && "summary" in content) {
    const text = String(content.summary);
    return text.length > 90 ? text.slice(0, 90) + "…" : text;
  }
  return "Draft resume";
}

export function ResumeCard({ initialResumes, hasProfile }: ResumeCardProps) {
  const [resumes, setResumes] = useState<ResumeRow[]>(initialResumes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { resume_id, content } = (await res.json()) as {
        resume_id: string;
        content: ResumeContent;
      };
      const optimistic: ResumeRow = {
        id: resume_id,
        user_id: "",
        version: 1,
        base_resume_id: null,
        job_id: null,
        content: content as ResumeRow["content"],
        status: "draft",
        created_at: new Date().toISOString(),
      };
      setResumes((prev) => [optimistic, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Resumes</h2>
            <p className="text-sm text-slate-500">
              {resumes.length === 0
                ? "No resumes yet"
                : `${resumes.length} resume${resumes.length !== 1 ? "s" : ""} generated`}
            </p>
          </div>
        </div>
      </div>

      {!hasProfile && (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <Github className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Sync your GitHub account first to generate a resume.</span>
        </div>
      )}

      {resumes.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-100">
          {resumes.map((resume) => (
            <li key={resume.id}>
              <Link
                href={`/resume/${resume.id}`}
                className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3.5 transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {getSummary(resume)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDate(resume.created_at)} · v{resume.version} ·{" "}
                    <span className="capitalize">{resume.status}</span>
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={() => void handleGenerate()}
        disabled={loading || !hasProfile}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Generating…" : "Generate Resume"}
      </button>
    </div>
  );
}
