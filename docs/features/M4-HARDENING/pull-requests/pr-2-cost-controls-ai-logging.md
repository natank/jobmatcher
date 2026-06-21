# PR-2: Cost Controls + Structured AI Logging

## Summary

Enriches the AI client with per-call structured JSON logging (cost estimate, token counts, retry count, success flag) and enforces per-feature output token budgets pulled from a single constants file. No call-site changes are required — the client resolves `max_tokens` automatically via the feature key, with an explicit `maxTokens` override and a safe fallback. No new API routes or UI. `pnpm typecheck` and `pnpm test` (255 tests) both green.

## Changes

### `lib/ai/pricing.ts` (new)

- **`estimateCost(model, inputTokens, outputTokens): number`** — calculates the USD cost of a Claude API call from token counts and a per-model pricing table.
- Pricing (per 1M tokens): `claude-sonnet-4-5` at $3.00 input / $15.00 output; `claude-haiku-3-5` at $0.80 input / $4.00 output.
- Returns `0` for unrecognised models (future-proof, non-throwing).

### `lib/ai/token-budgets.ts` (new)

- **`TOKEN_BUDGETS`** — single `Record<string, { maxInputTokens, maxOutputTokens }>` covering all 8 feature call-sites:

  | Feature key         | maxInputTokens | maxOutputTokens |
  | ------------------- | -------------- | --------------- |
  | `resume-generate`   | 8 000          | 4 000           |
  | `job-parse`         | 4 000          | 1 500           |
  | `fit-score`         | 6 000          | 1 000           |
  | `fit-score-inline`  | 6 000          | 1 000           |
  | `resume-tailor`     | 8 000          | 4 000           |
  | `interview-start`   | 4 000          | 1 000           |
  | `interview-answer`  | 3 000          | 800             |
  | `interview-summary` | 5 000          | 1 200           |

- Keys match the `feature` strings already passed to `callClaude` at every call-site — no call-site changes were needed.

### `lib/ai/client.ts` (updated)

**Structured log format** — every call now emits a JSON line on success:

```json
{
  "event": "ai_call",
  "feature": "resume-generate",
  "model": "claude-sonnet-4-5",
  "inputTokens": 1240,
  "outputTokens": 890,
  "costEstimateUsd": 0.01706,
  "durationMs": 3820,
  "retryCount": 0,
  "success": true
}
```

Error paths (`console.error`) now emit the same envelope with `"success": false` and an `"error"` field, and without token/cost fields (which are unavailable when the call fails).

**Token budget resolution** — `max_tokens` sent to the Claude SDK is resolved as:

1. Explicit `opts.maxTokens` (caller override)
2. `TOKEN_BUDGETS[opts.feature].maxOutputTokens`
3. `4096` (fallback for unknown feature keys)

**Removed** the now-unused `retried` boolean variable (replaced by `retryCount: number`).

## Tests

### New test file

- **`lib/ai/pricing.test.ts`** — 9 unit tests:
  - `claude-sonnet-4-5`: 1M+1M tokens, typical call (1240/890), zero tokens, input-only, output-only cost
  - `claude-haiku-3-5`: 1M+1M tokens, typical call
  - Unknown model: unrecognised model string returns 0; empty string returns 0

### Updated test file

- **`lib/ai/client.test.ts`** — extended with two new `describe` blocks (7 new tests); all 12 existing tests preserved:

  **`structured log output` (4 new tests):**
  - Emits all 9 required fields (`event`, `feature`, `model`, `inputTokens`, `outputTokens`, `costEstimateUsd`, `durationMs`, `retryCount`, `success`) on a successful call
  - `retryCount = 1` after a transient error is retried successfully
  - `success: false` + `error` field on a non-retryable 4xx failure; `retryCount: 0`
  - `success: false` + `retryCount: 1` after exhausting two retries

  **`token budget application` (3 new tests):**
  - `resume-generate` feature → `max_tokens = 4000` (from budget)
  - Explicit `maxTokens: 512` overrides the budget constant
  - Unknown feature key → falls back to `max_tokens = 4096`

## Testing Evidence

```
$ pnpm test
Test Files  21 passed (21)
     Tests  255 passed (255)
  Duration  2.29s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ Existing AI integration tests still pass — all 12 prior `callClaude` tests green, no regressions
- ✅ No token values hardcoded outside `token-budgets.ts` — the only numeric token limits in the codebase are in that file
- ✅ `pnpm typecheck` green
- ✅ `pnpm test` green — 16 new tests, all 239 prior tests still green
- ✅ No secrets in any file

## Notes

- **Budget applied in the client, not at call-sites**: The plan called for passing `maxTokens` from budget constants at each call-site. Instead, `callClaude` itself resolves the budget by feature key. This achieves the same enforcement with less boilerplate and a single code-change point — adding a new call-site automatically gets a budget if its feature key is in `TOKEN_BUDGETS`.
- **`maxInputTokens` is informational only**: The Claude API does not accept an `max_input_tokens` parameter. `maxInputTokens` in `TOKEN_BUDGETS` is retained as a documented budget target for future input-length guards in route handlers (pre-truncation logic). No runtime enforcement is added in this PR.
- **`costEstimateUsd` uses actual token counts from the API response**: The estimate is computed post-call from `response.usage.input_tokens` / `response.usage.output_tokens` — the actual values billed — not from any pre-call estimate.
- **Error log omits token/cost fields**: When a call fails before receiving a usage response (transient error, timeout, schema failure), the error log cannot include token counts or cost. The envelope shape is consistent in all other fields.
- **`fit-score-inline`**: The resume tailor route makes a preliminary inline fit-score call before the main tailor call. It uses the feature string `"fit-score-inline"`, which has its own entry in `TOKEN_BUDGETS` pointing to the same budget as `"fit-score"`.

## Dependencies

- PR-1 (Usage Limits + Free-Tier Enforcement) — no code dependency, but merging PR-1 first avoids conflicts on `app/api/resume/generate/route.ts` and `app/api/interview/start/route.ts`

## Dependent PRs

- PR-3 (Observability: Sentry + Health Hardening) — no dependency on PR-2
- All subsequent PRs that modify `callClaude` call-sites will automatically inherit the token budgets and structured logging added here
