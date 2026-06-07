import Link from "next/link";
import { Github, Zap, FileText, Target, MessageSquare } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Zap className="h-8 w-8 text-blue-400" />
          <span className="text-2xl font-bold tracking-tight">JobMatcher</span>
        </div>

        <h1 className="mb-4 text-5xl font-extrabold tracking-tight sm:text-6xl">
          Your GitHub profile is your resume.{" "}
          <span className="text-blue-400">Let AI prove it.</span>
        </h1>

        <p className="mb-8 text-lg text-slate-300 sm:text-xl">
          Build a grounded technical resume from real code contributions, match it to job
          descriptions, and prep for interviews — all in one flow.
        </p>

        <div className="mb-12 flex flex-wrap justify-center gap-4">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-slate-900 shadow-lg transition hover:bg-blue-50"
          >
            <Github className="h-5 w-5" />
            Connect GitHub &amp; Get Started
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <FileText className="mb-3 h-6 w-6 text-blue-400" />
            <h3 className="mb-1 font-semibold">Resume from Code</h3>
            <p className="text-sm text-slate-400">
              AI reads your repos, commits, and languages to build a grounded, evidence-linked
              resume.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <Target className="mb-3 h-6 w-6 text-blue-400" />
            <h3 className="mb-1 font-semibold">Fit Score &amp; Tailoring</h3>
            <p className="text-sm text-slate-400">
              Paste a job description — get a 1–5 match score, gap analysis, and a tailored resume
              version.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <MessageSquare className="mb-3 h-6 w-6 text-blue-400" />
            <h3 className="mb-1 font-semibold">Mock Interview</h3>
            <p className="text-sm text-slate-400">
              AI interviews you using your real codebase context, with per-answer feedback and a
              session report.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
