import { Github } from "lucide-react";
import { signInWithGitHub } from "@/lib/auth/actions";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Sign in to JobMatcher</h1>
          <p className="mt-2 text-sm text-slate-400">Connect your GitHub account to get started.</p>
        </div>

        <form action={signInWithGitHub}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-semibold text-slate-900 shadow transition hover:bg-blue-50"
          >
            <Github className="h-5 w-5" />
            Continue with GitHub
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500">
          By continuing, you agree to our Terms of Service and Privacy Policy.
          <br />
          Only your public GitHub repositories will be read.
        </p>
      </div>
    </main>
  );
}
