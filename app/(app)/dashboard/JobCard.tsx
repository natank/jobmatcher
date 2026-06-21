"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Briefcase,
  Loader2,
  AlertCircle,
  ChevronRight,
  Link as LinkIcon,
  FileText,
} from "lucide-react";
import type { JobRow } from "@/lib/db/job";
import type { JobPosting } from "@/types/job";

interface JobCardProps {
  initialJobs: JobRow[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getJobTitle(row: JobRow): string {
  const parsed = row.parsed as JobPosting | null;
  if (parsed && typeof parsed === "object" && "title" in parsed) {
    return String(parsed.title);
  }
  return "Untitled job";
}

function getJobCompany(row: JobRow): string | null {
  const parsed = row.parsed as JobPosting | null;
  if (parsed && typeof parsed === "object" && "company" in parsed && parsed.company) {
    return String(parsed.company);
  }
  return null;
}

export function JobCard({ initialJobs }: JobCardProps) {
  const [jobs, setJobs] = useState<JobRow[]>(initialJobs);
  const [mode, setMode] = useState<"text" | "url">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const handleParse = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);

    const body = mode === "url" ? { url: url.trim() } : { text: text.trim() };
    const inputValue = mode === "url" ? url.trim() : text.trim();

    if (!inputValue) {
      setError(
        mode === "url" ? "Please enter a job posting URL." : "Please paste a job description."
      );
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/jobs/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as {
        job?: JobRow;
        warning?: string;
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? `Request failed (${res.status})`);
      }

      if (data.warning === "low_confidence") {
        setWarning("This may not be a job posting. The job was saved but results may be limited.");
      }

      if (data.job) {
        setJobs((prev) => [data.job!, ...prev]);
        setText("");
        setUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse job posting");
    } finally {
      setLoading(false);
    }
  }, [mode, text, url]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Job Postings</h2>
            <p className="text-sm text-slate-500">
              {jobs.length === 0
                ? "No jobs added yet"
                : `${jobs.length} job${jobs.length !== 1 ? "s" : ""} saved`}
            </p>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mt-5 flex rounded-lg border border-slate-200 p-1">
        <button
          onClick={() => setMode("text")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition ${
            mode === "text" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Paste text
        </button>
        <button
          onClick={() => setMode("url")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition ${
            mode === "url" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <LinkIcon className="h-3.5 w-3.5" />
          URL
        </button>
      </div>

      {/* Input */}
      <div className="mt-3">
        {mode === "text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste the full job description here…"
            className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
          />
        ) : (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://jobs.example.com/senior-engineer"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
          />
        )}
      </div>

      {/* Warning */}
      {warning && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-100">
          {jobs.map((job) => {
            const company = getJobCompany(job);
            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3.5 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {getJobTitle(job)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {company ? `${company} · ` : ""}
                      {formatDate(job.created_at)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => void handleParse()}
        disabled={loading}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
        {loading ? "Parsing…" : "Parse Job"}
      </button>
    </div>
  );
}
