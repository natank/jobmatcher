# PR-2: Question Generation Route + Prompt

## Summary

Adds `POST /api/interview/start` — the route that creates an interview session. On each request it validates the caller, enforces the free-tier monthly limit, loads job + GitHub profile context, calls Claude to generate exactly 5 grounded questions (2 technical referencing real repos, 2 job-requirement, 1 behavioral), persists the session, and returns `{ session_id, questions }`. Includes the Claude system prompt at `prompts/interview-questions.md` and 17 integration tests.

## Changes

### Step 3 — System Prompt

- `prompts/interview-questions.md` — Claude system prompt for question generation:
  - Instructs Claude to produce **exactly 5** questions in a fixed order and type mix:
    - index 0 & 1: `type: "technical"` — each must reference a specific repo from the input list by name (`repo_ref = <repo name>`); no invented projects
    - index 2 & 3: `type: "job"` — drawn from `required_skills` or `responsibilities` (`repo_ref: null`)
    - index 4: `type: "behavioral"` — open-ended, relevant to the seniority level (`repo_ref: null`)
  - Rules: questions must be open-ended (no yes/no), 1–3 sentences, answerable in 2–4 minutes of text; no fabrication of skills or projects not in the input
  - Output format: JSON array of 5 objects matching `QuestionSchema` — only valid JSON, no markdown fencing
  - Temperature: 0.5 (passed via `callClaude` options)

### Step 3 — Route Handler

- `app/api/interview/start/route.ts` — `POST /api/interview/start`:
  1. `supabase.auth.getUser()` → 401 if not authenticated
  2. Validate `body.job_id` present → 400 `{ error: "Provide 'job_id' in the request body." }`
  3. **Free-tier gate**: read `usage_counters` via `getUsage(supabase, userId, currentPeriod())`; if `interviews_count >= 1` for a free-plan user → 429 `{ error: "free_tier_limit", message: "..." }`. Counter is incremented at session _completion_ (PR-4), not start — so this gate only fires when the user has already finished a session this month
  4. Load job via `getJob(supabase, userId, jobId)` → 404 if missing
  5. Load GitHub profile via `getGitHubProfile(supabase, userId)` → 400 `{ error: "GitHub profile not found. Sync your GitHub account first." }` if missing (required for technical question grounding)
  6. Load latest resume via `listResumes(supabase, userId)[0]` — optional; omitted from AI context if no resume exists
  7. Build compact AI context:
     - `job`: `{ title, seniority, required_skills, preferred_skills, responsibilities }` — `raw_text` excluded
     - `repos`: top 5 repos sorted by `signal_score` descending, each projected to `{ name, description, languages[], topics[] }` — `readme_excerpt` excluded to control token cost
     - `resume` (optional): `{ summary, skills }` — only present when a resume exists
  8. Load system prompt from `prompts/interview-questions.md` via `fs.readFile`
  9. Call `callClaude({ schema: z.array(QuestionSchema).length(5), temperature: 0.5, feature: "interview-start", ... })`
  10. Persist via `createSession(supabase, userId, jobId, questions)` → returns `{ id: session_id }`
  11. Return `{ session_id, questions }`, 200

  Error handling:
  - `AIValidationError` → 500 `{ error: "Question generation failed schema validation. Please try again." }`
  - Any other error → 500 `{ error: "Internal server error" }`

### Step 7 — Tests

- `app/api/interview/start/route.test.ts` — 17 integration tests (mocked Claude + Supabase):

  | Group            | Tests                                                                                                                                                                                                                                                                                                                                                                                                        |
  | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Auth             | 401 when unauthenticated                                                                                                                                                                                                                                                                                                                                                                                     |
  | Input validation | 400 when `job_id` missing; 400 when body is unparseable JSON                                                                                                                                                                                                                                                                                                                                                 |
  | Resource lookups | 404 when job not found; 400 when GitHub profile not found                                                                                                                                                                                                                                                                                                                                                    |
  | Free-tier gate   | 429 when free user has `interviews_count = 1`; 200 when free user has `interviews_count = 0`; 200 when no usage row exists                                                                                                                                                                                                                                                                                   |
  | Happy path       | Returns `session_id` + 5 questions; `callClaude` called with `temperature: 0.5` + `feature: "interview-start"`; compact context excludes `raw_text`; repos sorted by `signal_score` with highest-score repo first; `readme_excerpt` excluded from repo context; resume context included when resume exists; resume context omitted when no resumes; `createSession` called with correct `userId` and `jobId` |
  | Error handling   | `AIValidationError` → 500 with "validation" in message; unexpected error → 500                                                                                                                                                                                                                                                                                                                               |

## Testing Evidence

```
$ pnpm test
Test Files  15 passed (15)
     Tests  180 passed (180)
  Duration  1.92s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ All tests pass (`pnpm test` green) — 17 new tests, all 163 prior tests still green
- ✅ `pnpm typecheck` green
- ✅ Auth gate: `getUser()` before any DB read or write
- ✅ Free-tier limit enforced at session start (429 when `interviews_count >= 1`)
- ✅ Claude called with `temperature: 0.5` per spec §4 ("~0.5 for questions")
- ✅ AI output validated against `z.array(QuestionSchema).length(5)` — exactly 5 questions required
- ✅ Session persisted via `createSession` with `status: "active"` and `started_at: now()`
- ✅ No `raw_text` or `readme_excerpt` in AI context — token budget respected
- ✅ No secrets in client bundle

## Notes

- **GitHub profile is required; resume is optional**: Technical questions must reference a real repo — without a GitHub profile this is impossible. A resume adds grounding but is not strictly necessary; the prompt degrades gracefully when `resume` is absent from the context.
- **Free-tier gate reads `user_metadata.plan`**: Supabase Auth stores the plan in `user_metadata`. Users without a `plan` key (i.e., those who signed up before billing tiers were introduced) are treated as `"free"`. This is a conservative default; a migration to set `plan = "free"` on all users would remove the need for the fallback.
- **Counter incremented at completion, not start**: Abandoned sessions (inactive > 30 min, deferred to M4) do not burn the monthly quota because `incrementInterviews` is only called in the summary route (PR-4) once all 5 questions are answered. The start route only _reads_ the counter.
- **Top-5 repos by signal score**: The context is capped at 5 repos to stay within a reasonable token budget. `signal_score` already combines recency, commit volume, language weight, README quality, and popularity (computed in M1), so the top 5 represent the most relevant projects for question grounding.
- **`QuestionsOutputSchema`**: Defined inline in the route as `z.array(QuestionSchema).length(5)`. This is the AI output contract for this route — it maps directly to the shared `QuestionSchema` from PR-1, so no separate route-local schema is needed (unlike the fit-score route which has a route-local `AiOutputSchema` that differs from the shared `FitResultSchema`).

## Dependencies

- PR-1 (Types + DB Helpers) — `QuestionSchema`, `createSession`, `getUsage`, `currentPeriod`

## Dependent PRs

- PR-3 (Answer Feedback Route) — loads sessions created by this route via `getSession`
- PR-4 (Session Summary Route) — marks sessions created here as `completed` and increments the usage counter
- PR-5 (Interview UI) — calls this route via the "Start Interview" button in `InterviewPanel`
