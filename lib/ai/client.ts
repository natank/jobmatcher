import Anthropic from "@anthropic-ai/sdk";
import { type ZodType, ZodError } from "zod";
import { estimateCost } from "./pricing";
import { TOKEN_BUDGETS } from "./token-budgets";

export class AIValidationError extends Error {
  constructor(
    message: string,
    public readonly zodError: ZodError
  ) {
    super(message);
    this.name = "AIValidationError";
  }
}

export interface CallClaudeOptions<T> {
  systemPrompt: string;
  userMessage: string;
  schema: ZodType<T>;
  maxTokens?: number;
  temperature?: number;
  feature: string;
}

const TIMEOUT_MS = 30_000;
const MODEL = "claude-sonnet-4-5";

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  const status = (err as { status?: number }).status;
  return typeof status === "number" && status >= 500;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

export async function callClaude<T>(opts: CallClaudeOptions<T>): Promise<T> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const startMs = Date.now();
  let retryCount = 0;

  // Resolve max_tokens: explicit > budget constant > SDK default
  const budget = TOKEN_BUDGETS[opts.feature];
  const maxTokens = opts.maxTokens ?? budget?.maxOutputTokens ?? 4096;

  async function tryOnce(): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await anthropic.messages.create(
        {
          model: MODEL,
          max_tokens: maxTokens,
          temperature: opts.temperature ?? 0,
          system: opts.systemPrompt,
          messages: [{ role: "user", content: opts.userMessage }],
        },
        { signal: controller.signal }
      );
      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const raw: unknown = JSON.parse(extractJson(text));
      const data = opts.schema.parse(raw);
      const durationMs = Date.now() - startMs;
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      console.log(
        JSON.stringify({
          event: "ai_call",
          feature: opts.feature,
          model: MODEL,
          inputTokens,
          outputTokens,
          costEstimateUsd: estimateCost(MODEL, inputTokens, outputTokens),
          durationMs,
          retryCount,
          success: true,
        })
      );
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  try {
    return await tryOnce();
  } catch (firstErr) {
    const isRetryable =
      isTransientError(firstErr) || firstErr instanceof ZodError || firstErr instanceof SyntaxError;

    if (!isRetryable) {
      console.error(
        JSON.stringify({
          event: "ai_call",
          feature: opts.feature,
          model: MODEL,
          durationMs: Date.now() - startMs,
          retryCount: 0,
          success: false,
          error: String(firstErr),
        })
      );
      throw firstErr;
    }

    retryCount = 1;

    try {
      return await tryOnce();
    } catch (secondErr) {
      console.error(
        JSON.stringify({
          event: "ai_call",
          feature: opts.feature,
          model: MODEL,
          durationMs: Date.now() - startMs,
          retryCount: 1,
          success: false,
          error: String(secondErr),
        })
      );
      if (secondErr instanceof ZodError) {
        throw new AIValidationError(
          `Claude response did not match ${opts.feature} schema after retry`,
          secondErr
        );
      }
      throw secondErr;
    }
  }
}
