import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/client";
import { updateResume } from "@/lib/db/resume";
import { ResumeContentSchema } from "@/types/resume";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = ResumeContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid resume content", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await updateResume(supabase, user.id, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[resume/patch] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
