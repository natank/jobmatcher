"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ResumeContent } from "@/types/resume";

interface ResumeEditorProps {
  resumeId: string;
  initialContent: ResumeContent;
  version: number;
  status: string;
  createdAt: string;
  userName: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ResumeEditor({
  resumeId,
  initialContent,
  version,
  status,
  createdAt,
  userName,
}: ResumeEditorProps) {
  const [content, setContent] = useState<ResumeContent>(initialContent);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set([0]));

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/resume/${resumeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(content),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [resumeId, content]);

  const handleExportPdf = () => {
    window.open(`/api/resume/${resumeId}/pdf`, "_blank");
  };

  const addSkill = () => {
    const trimmed = newSkill.trim();
    if (!trimmed || content.skills.includes(trimmed)) return;
    setContent((c) => ({ ...c, skills: [...c.skills, trimmed] }));
    setNewSkill("");
  };

  const removeSkill = (skill: string) => {
    setContent((c) => ({ ...c, skills: c.skills.filter((s) => s !== skill) }));
  };

  const updateBullet = (projectIdx: number, bulletIdx: number, value: string) => {
    setContent((c) => {
      const exp = c.experience.map((e, i) =>
        i === projectIdx
          ? { ...e, bullets: e.bullets.map((b, j) => (j === bulletIdx ? value : b)) }
          : e
      );
      return { ...c, experience: exp };
    });
  };

  const addBullet = (projectIdx: number) => {
    setContent((c) => {
      const exp = c.experience.map((e, i) =>
        i === projectIdx ? { ...e, bullets: [...e.bullets, ""] } : e
      );
      return { ...c, experience: exp };
    });
  };

  const removeBullet = (projectIdx: number, bulletIdx: number) => {
    setContent((c) => {
      const exp = c.experience.map((e, i) =>
        i === projectIdx ? { ...e, bullets: e.bullets.filter((_, j) => j !== bulletIdx) } : e
      );
      return { ...c, experience: exp };
    });
  };

  const toggleProject = (idx: number) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-900">Resume · v{version}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-500">
              {status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-400 sm:block">
              Created {formatDate(createdAt)}
            </span>

            {saved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved
              </span>
            )}

            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export PDF
            </button>

            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {saveError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="text-sm text-slate-500">
          Editing as <span className="font-medium text-slate-900">{userName}</span>
        </div>

        {/* Summary */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Summary
          </h2>
          <textarea
            value={content.summary}
            onChange={(e) => setContent((c) => ({ ...c, summary: e.target.value }))}
            rows={4}
            className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none"
            placeholder="A brief professional summary…"
          />
          <p className="mt-1 text-right text-xs text-slate-400">
            {content.summary.split(/\s+/).filter(Boolean).length} / 60 words
          </p>
        </section>

        {/* Skills */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Skills
          </h2>
          <div className="flex flex-wrap gap-2">
            {content.skills.map((skill) => (
              <span
                key={skill}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-sm text-slate-700"
              >
                {skill}
                <button
                  onClick={() => removeSkill(skill)}
                  className="ml-0.5 rounded-full text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
              placeholder="Add skill…"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
            <button
              onClick={addSkill}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </section>

        {/* Projects / Experience */}
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Projects
          </h2>
          <div className="space-y-3">
            {content.experience.map((exp, projIdx) => (
              <div key={projIdx} className="rounded-lg border border-slate-200">
                <button
                  onClick={() => toggleProject(projIdx)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{exp.project}</p>
                    <p className="text-xs text-slate-400">
                      {exp.technologies.join(" · ")}
                      {exp.period ? ` · ${exp.period}` : ""}
                    </p>
                  </div>
                  {expandedProjects.has(projIdx) ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                {expandedProjects.has(projIdx) && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                    <p className="mb-2 text-xs font-medium text-slate-500">Highlights</p>
                    <div className="space-y-2">
                      {exp.bullets.map((bullet, bIdx) => (
                        <div key={bIdx} className="flex items-start gap-2">
                          <span className="mt-2 text-slate-300">•</span>
                          <textarea
                            value={bullet}
                            onChange={(e) => updateBullet(projIdx, bIdx, e.target.value)}
                            rows={2}
                            className="flex-1 resize-none rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                          />
                          <button
                            onClick={() => removeBullet(projIdx, bIdx)}
                            className="mt-2 text-slate-300 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => addBullet(projIdx)}
                      className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add bullet
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Education */}
        {content.education && content.education.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Education
            </h2>
            <div className="space-y-2">
              {content.education.map((edu, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium text-slate-900">{edu.degree}</p>
                  <p className="text-slate-500">
                    {edu.institution}
                    {edu.year ? ` · ${edu.year}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
