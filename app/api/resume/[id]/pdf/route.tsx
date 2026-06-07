import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/db/client";
import { getResume } from "@/lib/db/resume";
import { ResumeContentSchema } from "@/types/resume";
import { ResumePdf } from "@/lib/pdf/resume-pdf";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row = await getResume(supabase, user.id, params.id);
    if (!row) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    const parsed = ResumeContentSchema.safeParse(row.content);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid resume content" }, { status: 422 });
    }

    const name: string = user.user_metadata?.full_name ?? user.user_metadata?.user_name ?? "Resume";
    const githubUrl: string | undefined = user.user_metadata?.user_name
      ? `https://github.com/${String(user.user_metadata.user_name)}`
      : undefined;

    const buffer = await renderToBuffer(
      <ResumePdf content={parsed.data} name={name} githubUrl={githubUrl} />
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume-${params.id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[resume/pdf] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
