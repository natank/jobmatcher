import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/actions";
import { signOut } from "@/lib/auth/actions";
import { Github, LogOut } from "lucide-react";

export default async function DashboardPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = user.user_metadata?.full_name ?? user.user_metadata?.user_name ?? user.email;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">JobMatcher</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Github className="h-4 w-4" />
              <span>{displayName}</span>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900">Welcome, {displayName}!</h1>
        <p className="mt-2 text-slate-500">Your workspace is ready. More features coming in M1.</p>

        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm text-slate-400">
            GitHub ingestion, resume generation, and job matching will appear here.
          </p>
        </div>
      </main>
    </div>
  );
}
