import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { createSupabaseServerClient } from "@/lib/db/client";
import { getGitHubProfile } from "@/lib/db/github";
import { createResume } from "@/lib/db/resume";
import { callClaude, AIValidationError } from "@/lib/ai/client";
import { ResumeContentSchema } from "@/types/resume";

async function getSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "prompts", "resume-generate.md"), "utf-8");
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getGitHubProfile(supabase, user.id);
  if (!profile) {
    return NextResponse.json(
      { error: "GitHub profile not found. Please sync your GitHub account first." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    target_role?: string;
    target_languages?: string[];
  };

  const systemPrompt = await getSystemPrompt();

  const contextLines = [
    "Here is the developer's GitHub profile:",
    "```json",
    JSON.stringify(profile, null, 2),
    "```",
    body.target_role ? `\nTarget role: ${body.target_role}` : "",
    body.target_languages?.length
      ? `\nPreferred technologies: ${body.target_languages.join(", ")}`
      : "",
    "\nGenerate a resume JSON matching the ResumeContent schema.",
  ];
  const userMessage = contextLines.filter(Boolean).join("\n");

  try {
    const content = await callClaude({
      systemPrompt,
      userMessage,
      schema: ResumeContentSchema,
      feature: "resume-generate",
    });

    const { id: resume_id } = await createResume(supabase, user.id, content);

    return NextResponse.json({ resume_id, content });
  } catch (err) {
    if (err instanceof AIValidationError) {
      console.error("[resume/generate] Schema validation failed:", err.message);
      return NextResponse.json(
        { error: "Resume generation failed schema validation. Please try again." },
        { status: 500 }
      );
    }
    console.error("[resume/generate] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
