# PR-3: Answer Feedback Route + Prompt

## Summary

Adds `POST /api/interview/answer` — the route that scores a single candidate answer and stores it. On each request it authenticates the caller, validates the 4 KB answer cap, asserts session ownership and active status, calls Claude to score the answer on relevance, depth, and clarity (1–5 each), computes `overall` deterministically server-side, persists the result, and returns `{ feedback, answered_count }`. Includes the Claude system prompt at `prompts/interview-feedback.md` and 21 integration tests.

## Changes

### Step 4 — System Prompt

- `prompts/interview-feedback.md` — Claude system prompt for per-answer feedback at temperature ≤ 0.3:
  - Scores on three dimensions using the spec §2 anchors (full scoring table included):
    - **Relevance** 1–5: off-topic → directly and fully answers
    - **Depth** 1–5: surface-level → concrete, technical, evidence-backed
    - **Clarity** 1–5: hard to follow → crisp, well-structured
  - Returns `strengths[]`, `improvements[]`, `model_answer_hint` (1–2 sentences of direction, never a full rewrite)
  - Edge case rule: if `answer_text` is fewer than 20 words or clearly incomplete, cap `relevance` and `depth` at 2 and include "Your answer is too brief — please elaborate." in `improvements`
  - Technical question rule: if `repo_ref` is set, feedback accounts for whether the candidate discussed that specific project
  - Output: JSON without `overall` (computed deterministically in the route — see Notes)
  - No generic boilerplate; every piece of feedback must reference actual content from the answer

### Step 4 — Route Handler

- `app/api/interview/answer/route.ts` — `POST /api/interview/answer`:
  1. `supabase.auth.getUser()` → 401 if not authenticated
  2. Parse body `{ session_id, question_index, answer_text }` → 400 if any field is missing
  3. Validate `question_index` is integer in `[0, 4]` → 400 with "question_index must be an integer between 0 and 4"
  4. Enforce 4 KB answer cap via `Buffer.byteLength(answer_text, "utf-8") > 4096` → 400 "Answer exceeds the 4 KB limit"
  5. Load session via `getSession(supabase, userId, sessionId)` → 404 if not found (ownership asserted via `user_id` filter in helper)
  6. Reject if `session.status !== "active"` → 409 `{ error: "Session is no longer active.", status: <current status> }`
  7. Resolve `question = session.questions[question_index]` → 400 if out of range
  8. Load job + GitHub profile in parallel via `Promise.all([getJob, getGitHubProfile])` — both `catch(() => null)` so the route degrades gracefully if either is missing
  9. Build compact AI context:
     - `question`: `{ text, type, repo_ref }`
     - `answer`: `answer_text`
     - `context.job`: `{ title, seniority, required_skills }` or `null`
     - `context.repos`: top-5 repos by `signal_score` projected to `{ name, languages[], topics[] }`, or `[]` — no `raw_text`, no `readme_excerpt`
  10. Load system prompt from `prompts/interview-feedback.md`; call `callClaude` with route-local `AiFeedbackOutputSchema` (no `overall`) at `temperature: 0.3, feature: "interview-answer"`
  11. Compute `overall = Math.round((relevance + depth + clarity) / 3)`; assemble and validate against shared `AnswerFeedbackSchema`
  12. Persist via `createAnswer(supabase, sessionId, questionIndex, answerText, feedback)`
  13. Fetch `listAnswers(supabase, sessionId)` to count total stored answers → `answered_count`
  14. Return `{ feedback, answered_count }`, 200

  Error handling:
  - `AIValidationError` → 500 `{ error: "Feedback generation failed schema validation. Please try again." }`
  - Any other error → 500 `{ error: "Internal server error" }`

### Step 7 — Tests

- `app/api/interview/answer/route.test.ts` — 21 integration tests (mocked Claude + Supabase):

  | Group                | Tests                                                                                                                                                                                                                         |
  | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Auth                 | 401 when unauthenticated                                                                                                                                                                                                      |
  | Input validation     | 400 when `session_id` missing; 400 when `question_index` missing; 400 when `answer_text` missing; 400 when `question_index < 0`; 400 when `question_index > 4`; 400 when answer exceeds 4 KB; 200 when answer is exactly 4 KB |
  | Resource lookups     | 404 when session not found; 409 when session is `completed`; 409 when session is `abandoned`                                                                                                                                  |
  | Happy path           | Returns `{ feedback, answered_count }` with correct scores; `overall` computed correctly for MOCK scores (4+3+5)/3=4; `overall` computed correctly for low scores (1+1+2)/3=1; `overall` = 5 when all scores are 5            |
  | Claude contract      | Called with `temperature: 0.3` and `feature: "interview-answer"`; context includes question text, `repo_ref`, and answer; `raw_text` excluded from job context                                                                |
  | Persistence          | `createAnswer` called with correct `sessionId`, `questionIndex`, `answerText`, and assembled feedback including computed `overall`; `answered_count` reflects `listAnswers` length                                            |
  | Graceful degradation | 200 returned when job and GitHub profile are both unavailable; context degrades to `null` job and `[]` repos                                                                                                                  |
  | Error handling       | `AIValidationError` → 500 with "validation" in message; unexpected error → 500                                                                                                                                                |

## Testing Evidence

```
$ pnpm test
Test Files  16 passed (16)
     Tests  201 passed (201)
  Duration  1.94s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ All tests pass (`pnpm test` green) — 21 new tests, all 180 prior tests still green
- ✅ `pnpm typecheck` green
- ✅ Auth gate: `getUser()` before any DB read or write
- ✅ Session ownership asserted: `getSession` filters by both `session_id` and `user_id`
- ✅ 4 KB answer cap enforced via `Buffer.byteLength` (byte-accurate for Unicode text)
- ✅ `overall` computed server-side: `Math.round((relevance + depth + clarity) / 3)` per spec §2
- ✅ Claude called at `temperature: 0.3` per spec §7 ("temperature ≤ 0.3 for consistency")
- ✅ `AiFeedbackOutputSchema` (route-local, no `overall`) separates AI contract from storage contract
- ✅ `AnswerFeedbackSchema` (shared, with `overall`) validates the assembled feedback before persisting
- ✅ Graceful degradation: missing job or GitHub profile does not block feedback generation
- ✅ No `raw_text` or `readme_excerpt` in AI context — token budget respected
- ✅ No secrets in client bundle

## Notes

- **Route-local `AiFeedbackOutputSchema`**: Claude returns `relevance`, `depth`, `clarity`, `strengths`, `improvements`, `model_answer_hint` — no `overall`. This mirrors the M2 fit-score split (`AiOutputSchema` vs. `FitResultSchema`): the AI contract and the storage contract are kept separate so the computed field is never delegated to the model.
- **`overall` formula**: `Math.round((relevance + depth + clarity) / 3)` matches the spec exactly (`overall = round(mean(relevance, depth, clarity))`). Three tests verify specific numeric outcomes (4, 1, and 5) to guard against rounding regressions.
- **4 KB cap via `Buffer.byteLength`**: `string.length` counts UTF-16 code units; `Buffer.byteLength(..., "utf-8")` counts actual bytes, which is what matters for token cost and storage. A multibyte Unicode character would pass a naive `length > 4096` check but fail the byte check.
- **`answered_count` from `listAnswers`**: The route fetches all answers after inserting the current one. This is simple and correct but incurs an extra DB round-trip. For an MVP with at most 5 answers per session this is acceptable; it could be replaced with an in-memory increment in a later optimisation pass.
- **Graceful degradation for job + GitHub profile**: Both are loaded with `.catch(() => null)` via `Promise.all`. If they fail (e.g. row deleted between session start and answer submission), Claude still receives the question and answer — enough to produce meaningful feedback, just without job-specific or repo-specific context.
- **409 response includes `status` field**: The conflict response body includes `{ error: "...", status: <session status> }` so the UI can distinguish `completed` (offer to view summary) from `abandoned` (offer to start fresh) without a separate lookup.

## Dependencies

- PR-1 (Types + DB Helpers) — `AnswerFeedbackSchema`, `getSession`, `createAnswer`, `listAnswers`
- PR-2 (Question Generation Route) — sessions answered here were created by `POST /api/interview/start`

## Dependent PRs

- PR-4 (Session Summary Route) — requires all 5 answers from this route before generating the summary
- PR-5 (Interview UI) — `InterviewRunner` calls this route on each answer submission
