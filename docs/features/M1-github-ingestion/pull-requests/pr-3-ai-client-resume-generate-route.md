# PR-3: AI Client + Resume Generate Route

## Summary

Anthropic Claude wrapper (`lib/ai/client.ts`) with 30s timeout, 1 retry on transient errors, Zod validation, and structured logging. Resume generation route (`POST /api/resume/generate`) that loads `GitHubProfile` from DB, calls Claude with a grounding-focused system prompt, validates output against `ResumeContent` schema, and persists to the `resumes` table.

## Changes

### Step 5 — AI Client

- `lib/ai/client.ts` — `callClaude<T>({ systemPrompt, userMessage, schema, maxTokens, temperature, feature })`:
  - 30s timeout via `AbortController`
  - 1 retry on transient errors (5xx, `AbortError`, Zod validation failure, JSON parse failure)
  - `AIValidationError` thrown on second Zod failure
  - Structured JSON logging: `{ feature, inputTokens, outputTokens, latencyMs, retried, error }`
  - Extracts JSON from fenced code blocks (` ```json ... ``` `)
  - Uses `claude-3-5-sonnet-20241022` model

### Step 5 — Resume Generate Prompt

- `prompts/resume-generate.md` — Claude system prompt:
  - Evidence-only rules: only use data from `GitHubProfile`, link skills to repos, derive highlights from description/README/topics/commits
  - Omit rather than guess; no fluff; summary ≤ 60 words
  - Output exactly matches `ResumeContent` schema
  - Select top 6 repos by `signal_score` for experience section

### Step 6 — Resume Generate API Route

- `app/api/resume/generate/route.ts` — `POST /api/resume/generate`:
  1. `getUser()` → 401 if not authenticated
  2. Load `GitHubProfile` from DB → 400 if not ingested yet
  3. Read system prompt from `prompts/resume-generate.md`
  4. Build user message: profile JSON + optional `target_role` + optional `target_languages`
  5. `callClaude` with `ResumeContentSchema` validation
  6. `createResume` → return `{ resume_id, content }`
  7. `AIValidationError` → 500 with user-facing message; any other error → 500

### Step 9 — Tests

- `lib/ai/client.test.ts` — 12 unit tests:
  - Happy path: validated output, fenced JSON extraction, option forwarding
  - Retry on transient errors: 5xx, `AbortError`, throws after 2 failures
  - Retry on Zod failure: retry once, `AIValidationError` on second failure (carries `ZodError`)
  - Retry on JSON parse failure
  - No retry on 4xx client errors (400, 401)

- `app/api/resume/generate/route.test.ts` — 7 integration tests:
  - 401 when not authenticated
  - 400 when no GitHub profile exists
  - Happy path: asserts `callClaude` + `createResume` called with correct args
  - `target_languages` forwarded to user message
  - System prompt read from file system
  - `AIValidationError` → 500
  - Unexpected error → 500

## Testing Evidence

```bash
$ pnpm test
Test Files  7 passed (7)
     Tests  58 passed (58)
  Duration  1.04s
```

```bash
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ Unit tests pass (`pnpm test` green)
- ✅ `pnpm typecheck` green
- ✅ AI contract test: mock Claude → asserts output validates `ResumeContent` schema
- ✅ Retry + timeout unit tests pass
- ✅ Route reads `github_profiles` from DB directly (no dependency on PR-2 route)
- ✅ Uses `lib/db/resume.ts` from PR-1
- ✅ Grounding rules in prompt match spec §4 (evidence-only, no hallucination)

## Dependencies

- PR-1 (Library Foundation) — required for `ResumeContentSchema`, `lib/db/resume.ts`, and `lib/db/github.ts`

## Dependent PRs

- PR-4 (Dashboard UI) — will call this route to trigger resume generation
- PR-5 (Resume Editor + PDF) — will edit and export resumes persisted by this route
