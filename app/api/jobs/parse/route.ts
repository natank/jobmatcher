import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { createSupabaseServerClient } from "@/lib/db/client";
import { callClaude, AIValidationError } from "@/lib/ai/client";
import { createJob } from "@/lib/db/job";
import { canonicalizeSkills } from "@/lib/jobs/canonicalize";
import { JobPostingSchema } from "@/types/job";

async function getSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "prompts", "job-parse.md"), "utf-8");
}

/** Strip HTML tags, collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract the main content block from HTML (prefers <main> or <article>). */
function extractMainContent(html: string): string {
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return stripHtml(mainMatch[1]);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) return stripHtml(articleMatch[1]);
  return stripHtml(html);
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    url?: string;
  };

  const hasText = typeof body.text === "string" && body.text.trim().length > 0;
  const hasUrl = typeof body.url === "string" && body.url.trim().length > 0;

  if (!hasText && !hasUrl) {
    return NextResponse.json(
      { error: "Provide either 'text' or 'url' in the request body." },
      { status: 400 }
    );
  }

  let rawText: string;
  let source: "text" | "url";
  let sourceUrl: string | null = null;

  if (hasUrl) {
    source = "url";
    sourceUrl = body.url!.trim();

    let html: string;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8_000);
      let response = await fetch(sourceUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 JobMatcher/1.0" },
      });
      clearTimeout(timeoutId);

      // Handle up to 3 manual redirects (fetch follows automatically, but cap just in case)
      let redirectCount = 0;
      while (response.redirected && redirectCount < 3) {
        redirectCount++;
      }

      html = await response.text();
    } catch {
      return NextResponse.json(
        {
          error: "url_blocked",
          message: "Failed to fetch the URL. It may be blocked or unreachable.",
        },
        { status: 422 }
      );
    }

    rawText = extractMainContent(html);

    if (rawText.length < 50) {
      return NextResponse.json(
        {
          error: "url_blocked",
          message: "The fetched content is too short to parse as a job description.",
        },
        { status: 422 }
      );
    }
  } else {
    source = "text";
    rawText = body.text!.trim();
  }

  // Truncate to 12,000 characters
  rawText = rawText.slice(0, 12_000);

  const systemPrompt = await getSystemPrompt();

  const userMessage = [
    `Parse the following job posting. Set \`source\` to "${source}" and \`source_url\` to ${sourceUrl ? `"${sourceUrl}"` : "null"}.`,
    "",
    "Job posting text:",
    "```",
    rawText,
    "```",
  ].join("\n");

  try {
    const parsed = await callClaude({
      systemPrompt,
      userMessage,
      schema: JobPostingSchema,
      feature: "job-parse",
    });

    // Canonicalize skills
    const canonicalized = {
      ...parsed,
      source,
      source_url: sourceUrl,
      raw_text: rawText,
      required_skills: canonicalizeSkills(parsed.required_skills),
      preferred_skills: canonicalizeSkills(parsed.preferred_skills),
      keywords: canonicalizeSkills(parsed.keywords),
    };

    const { id } = await createJob(supabase, user.id, canonicalized);

    const isLowConfidence =
      canonicalized.seniority === "unknown" && canonicalized.required_skills.length === 0;

    const responseBody: Record<string, unknown> = { job: { ...canonicalized, id } };
    if (isLowConfidence) {
      responseBody.warning = "low_confidence";
    }

    return NextResponse.json(responseBody, { status: 200 });
  } catch (err) {
    if (err instanceof AIValidationError) {
      console.error("[jobs/parse] Schema validation failed:", err.message);
      return NextResponse.json(
        { error: "Job parsing failed schema validation. Please try again." },
        { status: 500 }
      );
    }
    console.error("[jobs/parse] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
