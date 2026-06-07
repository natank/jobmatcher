import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/db/client";
import { getResume } from "@/lib/db/resume";
import { ResumeContentSchema } from "@/types/resume";
import { ResumeEditor } from "./ResumeEditor";

export default async function ResumePage({ params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseServerClient();
  const row = await getResume(supabase, user.id, params.id).catch(() => null);
  if (!row) redirect("/dashboard");

  const parsed = ResumeContentSchema.safeParse(row.content);
  if (!parsed.success) redirect("/dashboard");

  const userName: string =
    user.user_metadata?.full_name ?? user.user_metadata?.user_name ?? user.email ?? "";

  return (
    <ResumeEditor
      resumeId={row.id}
      initialContent={parsed.data}
      version={row.version}
      status={row.status}
      createdAt={row.created_at}
      userName={userName}
    />
  );
}
