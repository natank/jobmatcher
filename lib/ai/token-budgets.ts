/**
 * Per-feature token budgets for Claude API calls.
 *
 * `maxOutputTokens` is passed directly to the Claude SDK as `max_tokens`.
 * `maxInputTokens` is informational — used to emit a warning when the
 * estimated input size exceeds the budget (context truncation is handled
 * upstream in each route handler).
 *
 * Keys match the `feature` strings passed to `callClaude`.
 */
export const TOKEN_BUDGETS: Record<string, { maxInputTokens: number; maxOutputTokens: number }> = {
  "resume-generate": { maxInputTokens: 8_000, maxOutputTokens: 4_000 },
  "job-parse": { maxInputTokens: 4_000, maxOutputTokens: 1_500 },
  "fit-score": { maxInputTokens: 6_000, maxOutputTokens: 1_000 },
  "fit-score-inline": { maxInputTokens: 6_000, maxOutputTokens: 1_000 },
  "resume-tailor": { maxInputTokens: 8_000, maxOutputTokens: 4_000 },
  "interview-start": { maxInputTokens: 4_000, maxOutputTokens: 1_000 },
  "interview-answer": { maxInputTokens: 3_000, maxOutputTokens: 800 },
  "interview-summary": { maxInputTokens: 5_000, maxOutputTokens: 1_200 },
};
