import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@anthropic-ai/sdk");

import Anthropic from "@anthropic-ai/sdk";
import { callClaude, AIValidationError } from "./client";

const TestSchema = z.object({ name: z.string(), value: z.number() });
type TestOutput = z.infer<typeof TestSchema>;

const VALID_OUTPUT: TestOutput = { name: "hello", value: 42 };

function makeClaudeResponse(text: string, inputTokens = 10, outputTokens = 20) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const BASE_OPTS = {
  systemPrompt: "You are a test assistant.",
  userMessage: "Generate output.",
  schema: TestSchema,
  feature: "test",
} as const;

const MockAnthropic = vi.mocked(Anthropic);
let mockCreate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate = vi.fn();
  MockAnthropic.mockImplementation(
    () => ({ messages: { create: mockCreate } }) as unknown as Anthropic
  );
});

describe("callClaude", () => {
  describe("happy path", () => {
    it("returns validated output on a successful call", async () => {
      mockCreate.mockResolvedValue(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      const result = await callClaude(BASE_OPTS);
      expect(result).toEqual(VALID_OUTPUT);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("extracts JSON from a fenced code block", async () => {
      const fenced = "```json\n" + JSON.stringify(VALID_OUTPUT) + "\n```";
      mockCreate.mockResolvedValue(makeClaudeResponse(fenced));

      const result = await callClaude(BASE_OPTS);
      expect(result).toEqual(VALID_OUTPUT);
    });

    it("passes system prompt, user message, and options to the SDK", async () => {
      mockCreate.mockResolvedValue(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      await callClaude({ ...BASE_OPTS, maxTokens: 1024, temperature: 0.5 });

      const [params] = mockCreate.mock.calls[0];
      expect(params.system).toBe(BASE_OPTS.systemPrompt);
      expect(params.messages[0].content).toBe(BASE_OPTS.userMessage);
      expect(params.max_tokens).toBe(1024);
      expect(params.temperature).toBe(0.5);
    });
  });

  describe("structured log output", () => {
    it("emits all required fields on success", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockCreate.mockResolvedValue(makeClaudeResponse(JSON.stringify(VALID_OUTPUT), 1240, 890));

      await callClaude(BASE_OPTS);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(logged.event).toBe("ai_call");
      expect(logged.feature).toBe("test");
      expect(logged.model).toBe("claude-sonnet-4-5");
      expect(logged.inputTokens).toBe(1240);
      expect(logged.outputTokens).toBe(890);
      expect(typeof logged.costEstimateUsd).toBe("number");
      expect(logged.costEstimateUsd).toBeGreaterThan(0);
      expect(typeof logged.durationMs).toBe("number");
      expect(logged.retryCount).toBe(0);
      expect(logged.success).toBe(true);

      logSpy.mockRestore();
    });

    it("emits retryCount = 1 after a transient error is retried successfully", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const serverErr = Object.assign(new Error("Internal Server Error"), { status: 500 });
      mockCreate
        .mockRejectedValueOnce(serverErr)
        .mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      await callClaude(BASE_OPTS);

      const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(logged.retryCount).toBe(1);
      expect(logged.success).toBe(true);

      logSpy.mockRestore();
    });

    it("emits success: false and error field on non-retryable failure", async () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const clientErr = Object.assign(new Error("Bad Request"), { status: 400 });
      mockCreate.mockRejectedValue(clientErr);

      await callClaude(BASE_OPTS).catch(() => {});

      const logged = JSON.parse(errSpy.mock.calls[0][0] as string);
      expect(logged.event).toBe("ai_call");
      expect(logged.success).toBe(false);
      expect(logged.retryCount).toBe(0);
      expect(logged.error).toContain("Bad Request");

      errSpy.mockRestore();
    });

    it("emits success: false and retryCount: 1 after exhausting retries", async () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const serverErr = Object.assign(new Error("Gateway Timeout"), { status: 504 });
      mockCreate.mockRejectedValue(serverErr);

      await callClaude(BASE_OPTS).catch(() => {});

      const logged = JSON.parse(errSpy.mock.calls[0][0] as string);
      expect(logged.success).toBe(false);
      expect(logged.retryCount).toBe(1);

      errSpy.mockRestore();
    });
  });

  describe("token budget application", () => {
    it("uses max_tokens from TOKEN_BUDGETS when feature matches", async () => {
      mockCreate.mockResolvedValue(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      // "resume-generate" budget has maxOutputTokens: 4000
      await callClaude({ ...BASE_OPTS, feature: "resume-generate" });

      const [params] = mockCreate.mock.calls[0];
      expect(params.max_tokens).toBe(4_000);
    });

    it("prefers explicit maxTokens over budget constant", async () => {
      mockCreate.mockResolvedValue(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      await callClaude({ ...BASE_OPTS, feature: "resume-generate", maxTokens: 512 });

      const [params] = mockCreate.mock.calls[0];
      expect(params.max_tokens).toBe(512);
    });

    it("falls back to 4096 for unknown feature keys", async () => {
      mockCreate.mockResolvedValue(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      await callClaude({ ...BASE_OPTS, feature: "unknown-feature" });

      const [params] = mockCreate.mock.calls[0];
      expect(params.max_tokens).toBe(4096);
    });
  });

  describe("retry on transient errors", () => {
    it("retries once on a 5xx status error and succeeds", async () => {
      const serverErr = Object.assign(new Error("Internal Server Error"), {
        status: 500,
      });
      mockCreate
        .mockRejectedValueOnce(serverErr)
        .mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      const result = await callClaude(BASE_OPTS);
      expect(result).toEqual(VALID_OUTPUT);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("retries once on an AbortError (timeout simulation) and succeeds", async () => {
      const abortErr = Object.assign(new Error("Aborted"), {
        name: "AbortError",
      });
      mockCreate
        .mockRejectedValueOnce(abortErr)
        .mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      const result = await callClaude(BASE_OPTS);
      expect(result).toEqual(VALID_OUTPUT);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("throws after two transient failures", async () => {
      const serverErr = Object.assign(new Error("Gateway Timeout"), {
        status: 504,
      });
      mockCreate.mockRejectedValue(serverErr);

      await expect(callClaude(BASE_OPTS)).rejects.toThrow("Gateway Timeout");
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe("retry on Zod validation failure", () => {
    it("retries once when Zod validation fails and succeeds on retry", async () => {
      const invalidOutput = JSON.stringify({ name: 123, value: "wrong" });
      mockCreate
        .mockResolvedValueOnce(makeClaudeResponse(invalidOutput))
        .mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      const result = await callClaude(BASE_OPTS);
      expect(result).toEqual(VALID_OUTPUT);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("throws AIValidationError when Zod validation fails twice", async () => {
      const invalidOutput = JSON.stringify({ name: 123, value: "wrong" });
      mockCreate.mockResolvedValue(makeClaudeResponse(invalidOutput));

      await expect(callClaude(BASE_OPTS)).rejects.toThrow(AIValidationError);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("AIValidationError carries the ZodError", async () => {
      const invalidOutput = JSON.stringify({ name: 123, value: "wrong" });
      mockCreate.mockResolvedValue(makeClaudeResponse(invalidOutput));

      const err = await callClaude(BASE_OPTS).catch((e) => e);
      expect(err).toBeInstanceOf(AIValidationError);
      expect(err.zodError).toBeDefined();
    });
  });

  describe("retry on JSON parse failure", () => {
    it("retries once on malformed JSON and succeeds on retry", async () => {
      mockCreate
        .mockResolvedValueOnce(makeClaudeResponse("not valid json {{{}"))
        .mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(VALID_OUTPUT)));

      const result = await callClaude(BASE_OPTS);
      expect(result).toEqual(VALID_OUTPUT);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe("no retry on non-transient errors", () => {
    it("does not retry on a 4xx client error", async () => {
      const clientErr = Object.assign(new Error("Bad Request"), {
        status: 400,
      });
      mockCreate.mockRejectedValue(clientErr);

      await expect(callClaude(BASE_OPTS)).rejects.toThrow("Bad Request");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("does not retry on a 401 authentication error", async () => {
      const authErr = Object.assign(new Error("Unauthorized"), { status: 401 });
      mockCreate.mockRejectedValue(authErr);

      await expect(callClaude(BASE_OPTS)).rejects.toThrow("Unauthorized");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
});
