# PR-4: Session Summary Route + Prompt

## Summary

Adds `POST /api/interview/summary` — the route that closes out a completed interview session. On each request it authenticates the caller, enforces the 5-answers requirement, short-circuits idempotently if a summary already exists, computes deterministic score averages from stored per-answer feedback, calls Claude to synthesise the session into strengths/gaps/actions/readiness, persists the summary, marks the session `completed`, and increments the monthly usage counter. Includes the Claude system prompt at `prompts/interview-summary.md` and 17 integration tests.

## Changes

### Step 5 — System Prompt

- `prompts/interview-summary.md` — Claude system prompt for session synthesis at temperature ≤ 0.3:
  - Receives a compact transcript of all 5 questions with per-answer scores (`relevance`, `depth`, `clarity`, `overall`, `strengths`, `improvements`) plus job context (`title`, `seniority`, `required_skills`)
  - Produces:
    - **`top_strengths`**: 2–4 recurring or standout strengths across the full session (not copied verbatim from per-answer output)
    - **`key_gaps`**: 2–4 areas of consistent underperformance relative to the target role
    - **`recommended_actions`**: 3–5 specific, actionable steps (topic, skill, or practice type named explicitly)
    - **`readiness`**: `"high"` | `"moderate"` | `"low"` — overall hiring readiness for this role
  - Rules: synthesise across answers, don't restate individual feedback; reference role title and required skills; actions must name specific topics/practices
  - Output: JSON without numeric averages or `overall_score` (computed server-side)

### Step 5 — Route Handler

- `app/api/interview/summary/route.ts` — `POST /api/interview/summary`:
  1. `supabase.auth.getUser()` → 401 if not authenticated
  2. Validate `body.session_id` present → 400 `{ error: "Provide 'session_id' in the request body." }`
  3. Load session via `getSession(supabase, userId, sessionId)` → 404 if not found (ownership asserted)
  4. **Idempotency**: call `getSummary(supabase, sessionId)`; if a summary already exists, return `{ summary }` immediately — no Claude call, no counter increment
  5. Load answers via `listAnswers(supabase, sessionId)`; if `answers.length < 5` → 400 `{ error: "incomplete_session", message: "N/5 answered." }`
  6. Compute deterministic averages from stored `AnswerFeedback` objects:
     - `avg_relevance = mean(relevance × 5)`
     - `avg_depth = mean(depth × 5)`
     - `avg_clarity = mean(clarity × 5)`
     - `overall_score = Math.round(mean(overall × 5))`
  7. Load job via `getJob` with `.catch(() => null)` — graceful degradation, no hard fail if missing
  8. Build compact AI context: `{ job: { title, seniority, required_skills } | null, transcript: [{ question, answer, feedback }] }` — `model_answer_hint` excluded (not useful for synthesis); `raw_text` excluded
  9. Load system prompt from `prompts/interview-summary.md`; call `callClaude` with route-local `AiSummaryOutputSchema` (`top_strengths`, `key_gaps`, `recommended_actions`, `readiness` — no numeric fields) at `temperature: 0.3, feature: "interview-summary"`
  10. Assemble and validate full `InterviewSummary` via `InterviewSummarySchema.parse({session_id, avg_relevance, avg_depth, avg_clarity, overall_score, ...aiOutput})`
  11. Persist: `createSummary(supabase, sessionId, summary)`
  12. Complete session: `updateSessionStatus(supabase, userId, sessionId, "completed", new Date().toISOString())`
  13. Increment usage: `incrementInterviews(supabase, userId, currentPeriod())` — **once**, on completion only; never on idempotent re-requests
  14. Return `{ summary }`, 200

  Error handling:
  - `AIValidationError` → 500 `{ error: "Summary generation failed schema validation. Please try again." }`
  - Any other error → 500 `{ error: "Internal server error" }` — `updateSessionStatus` and `incrementInterviews` are **not** called on failure

### Step 7 — Tests

- `app/api/interview/summary/route.test.ts` — 17 integration tests (mocked Claude + Supabase):

  | Group                | Tests                                                                                                                                                                                                |
  | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Auth                 | 401 when unauthenticated                                                                                                                                                                             |
  | Input validation     | 400 when `session_id` missing                                                                                                                                                                        |
  | Resource lookups     | 404 when session not found; 400 `incomplete_session` when < 5 answers (message includes "3/5")                                                                                                       |
  | Idempotency          | Existing summary returned; `callClaude`, `createSummary`, `incrementInterviews` all NOT called                                                                                                       |
  | Happy path           | Returns `{ summary }` with correct `avg_relevance=4`, `avg_depth=3`, `avg_clarity=5`, `overall_score=4`; AI output fields (`readiness`, `top_strengths`, etc.) present                               |
  | Average computation  | Mixed scores [5,4,3,2,1] per dimension all average to 3; `overall_score = round(3.0) = 3`                                                                                                            |
  | Claude contract      | Called with `temperature: 0.3` and `feature: "interview-summary"`; transcript has 5 entries; `model_answer_hint` absent from transcript feedback; `raw_text` absent from job context                 |
  | Persistence          | `createSummary` called with `session_id` and `overall_score: 4`; `updateSessionStatus` called with `"completed"` and ISO timestamp; `incrementInterviews` called exactly once with `currentPeriod()` |
  | Graceful degradation | Null job row → `context.job` is `null`; still returns 200                                                                                                                                            |
  | Error isolation      | Claude failure → `updateSessionStatus` NOT called; Claude failure → `incrementInterviews` NOT called                                                                                                 |
  | Error handling       | `AIValidationError` → 500 with "validation" in message; unexpected error → 500                                                                                                                       |

## Testing Evidence

```
$ pnpm test
Test Files  17 passed (17)
     Tests  218 passed (218)
  Duration  ~2s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ All tests pass — 17 new tests, all 201 prior tests still green
- ✅ `pnpm typecheck` green
- ✅ Auth gate: `getUser()` before any DB read or write
- ✅ Session ownership asserted via `getSession` (filters by both `session_id` and `user_id`)
- ✅ Idempotency: `getSummary` checked before Claude; no double-counting of usage
- ✅ `incomplete_session` gate: exactly 5 answers required before summary
- ✅ Numeric averages computed server-side from stored data — not delegated to Claude
- ✅ `overall_score` formula: `Math.round(mean(per-answer overall))` per spec §6
- ✅ Claude called at `temperature: 0.3` per spec §7
- ✅ Session marked `completed` only on successful Claude + persist path
- ✅ Usage counter incremented only on success (never on Claude failure or idempotent re-request)
- ✅ `model_answer_hint` excluded from transcript sent to Claude (not needed for synthesis, reduces tokens)
- ✅ No `raw_text` in AI context — token budget respected

## Notes

- **Idempotency via `getSummary` pre-check**: the route checks for an existing summary before doing any expensive work. This means calling `POST /api/interview/summary` twice on the same session returns the same result without re-calling Claude or double-counting the usage counter. The PR description spec explicitly calls this out.
- **`AiSummaryOutputSchema` (route-local)**: Claude only returns `top_strengths`, `key_gaps`, `recommended_actions`, `readiness`. All numeric fields (`avg_relevance`, `avg_depth`, `avg_clarity`, `overall_score`) are computed server-side from the stored per-answer data and merged in before calling `InterviewSummarySchema.parse`. This is the same pattern as PR-3 (`AiFeedbackOutputSchema` without `overall`).
- **Usage counter incremented at completion, not start**: consistent with the PR-2 gate design. The PR-2 start route reads the counter but never writes it. This route is the single writer. Idempotency (above) ensures a retry after a partial failure cannot double-count.
- **`model_answer_hint` excluded from transcript**: the per-answer `model_answer_hint` is directional coaching for the candidate, not a signal useful for session-level synthesis. Excluding it reduces context size without any loss of synthesis quality.
- **Sequence matters for side-effects**: `createSummary` → `updateSessionStatus` → `incrementInterviews` are called in sequence after a validated Claude response. A failure before `incrementInterviews` (rare, but possible) means the session is marked `completed` but the counter is not incremented — the usage gate in PR-2 will let the user retry the summary route, which will short-circuit via `getSummary` and return the persisted summary without re-incrementing. This is the safer failure mode compared to incrementing before persisting.
- **UUID fixtures in tests**: `InterviewSummarySchema` validates `session_id` as `z.string().uuid()`. All test session IDs use proper UUID format (`00000000-0000-0000-0000-000000000002`) to pass Zod's uuid validator.

## Dependencies

- PR-1 (Types + DB Helpers) — `InterviewSummarySchema`, `getSession`, `updateSessionStatus`, `listAnswers`, `createSummary`, `getSummary`, `incrementInterviews`, `currentPeriod`
- PR-2 (Start Route) — sessions summarised here were created by `POST /api/interview/start`
- PR-3 (Answer Route) — `answers` rows read here were created by `POST /api/interview/answer`

## Dependent PRs

- PR-5 (Interview UI) — `InterviewRunner` calls this route after Q5 to render `SummaryReport`
