# M3 Implementation Plan — Interview

> M3 exit criteria (from `09-development-plan.md`): Complete a 5-question session with report.

## Applicable Documents

1. M3 feature kickoff: `docs/features/M3-Interview/M3-feature-Kickoff.md`
2. Technical architecture: `docs/08-technical-architecture.md`
3. Development plan: `docs/09-development-plan.md`
4. Mock interview spec: `docs/specs/06-mock-interview-spec.md`
5. Interview feedback spec: `docs/specs/07-interview-feedback-spec.md`

## Scope

Text-based mock interview grounded in the target `JobPosting` + candidate `GitHubProfile` + latest `Resume`. A session has a fixed **5 questions** (2 technical from GitHub projects, 2 job-requirement, 1 behavioral) generated up front. The user answers one question at a time; each answer is scored on **relevance / depth / clarity** (1–5). After Q5, the session is marked `completed` and a **summary report** (strengths, gaps, recommended actions, readiness) is generated. Includes free-tier gating (1 completed session/month), abandoned-session handling, and UI wiring.

---

## Current State (M2 baseline)

- Auth + GitHub ingestion + signal scoring ✅
- AI client (`lib/ai/client.ts`) with retry, timeout, Zod validation, per-feature temperature ✅
- Resume generation + editor + PDF export ✅
- Job ingestion + fit scoring + resume tailoring (M2) ✅
- `interview_sessions`, `answers`, `interview_summaries`, `usage_counters` tables exist in DB schema **with RLS already defined** ✅
- `types/interview.ts`, `types/feedback.ts` — **not yet created**
- `lib/db/interview.ts`, `lib/db/answer.ts`, `lib/db/summary.ts`, `lib/db/usage.ts` — **not yet created**
- `app/api/interview/start/`, `app/api/interview/answer/`, `app/api/interview/summary/` — **not yet created**
- `app/(app)/interview/[sessionId]/` — **not yet created**
- `prompts/interview-questions.md`, `prompts/interview-feedback.md`, `prompts/interview-summary.md` — **not yet created**

### Existing schema (from `supabase/migrations/20240101000000_initial_schema.sql` + `types/database.ts`)

```
interview_sessions(id, user_id, job_id, status, questions jsonb, started_at, completed_at)
answers(id, session_id, question_index, answer_text, feedback jsonb)
interview_summaries(id, session_id, summary jsonb, created_at)
usage_counters(user_id, period, resumes_count, interviews_count)
```

- RLS already in place: `interview_sessions` keyed by `user_id`; `answers` and `interview_summaries` gated via session ownership; `usage_counters` by `user_id`.
- **No new migration is expected** for M3 unless a gap is found (see Notes — possible `updated_at` for abandonment tracking).

---

## Dependency Order

```
Types/Schemas (Step 1)
  └─ DB helpers: interview, answer, summary, usage (Step 2)
       └─ Question generation route + prompt (Step 3)
            └─ Answer feedback route + prompt (Step 4)
                 └─ Session summary route + prompt (Step 5)
                      └─ Interview UI (Step 6)
Tests throughout (Step 7)
```

---

## Pull Request Groupings

```
PR1: Types + DB Helpers
  └─ PR2: Question Generation Route + Prompt
       └─ PR3: Answer Feedback Route + Prompt
            └─ PR4: Session Summary Route + Prompt
                 └─ PR5: Interview UI
```

### PR 1 — Types + DB Helpers **COMPLETE**

**Steps:** 1 (Types), 2 (DB helpers)

Pure TypeScript library code — no routes, no UI. Dependency of all subsequent PRs.

| Files                                                                                        | Step |
| -------------------------------------------------------------------------------------------- | ---- |
| `types/interview.ts` — `QuestionSchema`, `InterviewSessionSchema` + types                    | 1    |
| `types/feedback.ts` — `AnswerFeedbackSchema`, `InterviewSummarySchema` + types               | 1    |
| `lib/db/interview.ts` — `createSession`, `getSession`, `listSessions`, `updateSessionStatus` | 2    |
| `lib/db/answer.ts` — `createAnswer`, `getAnswer`, `listAnswers`                              | 2    |
| `lib/db/summary.ts` — `createSummary`, `getSummary`                                          | 2    |
| `lib/db/usage.ts` — `getUsage`, `incrementInterviews`                                        | 2    |
| `types/interview.test.ts`, `types/feedback.test.ts`                                          | 7    |

**Merge gate:** unit tests pass, `pnpm typecheck` green.

---

### PR 2 — Question Generation Route + Prompt **COMPLETE**

**Steps:** 3 (question generation)

**Depends on:** PR 1

| Files                                            | Step |
| ------------------------------------------------ | ---- |
| `prompts/interview-questions.md` — Claude prompt | 3    |
| `app/api/interview/start/route.ts`               | 3    |
| `app/api/interview/start/route.test.ts`          | 7    |

**Merge gate:** integration tests (mock Claude + Supabase) cover happy path (5 questions generated + session persisted), free-tier limit (429), missing job/resume (404/400), 401 case.

---

### PR 3 — Answer Feedback Route + Prompt **COMPLETE**

**Steps:** 4 (per-answer scoring)

**Depends on:** PR 1, PR 2

| Files                                           | Step |
| ----------------------------------------------- | ---- |
| `prompts/interview-feedback.md` — Claude prompt | 4    |
| `app/api/interview/answer/route.ts`             | 4    |
| `app/api/interview/answer/route.test.ts`        | 7    |

**Merge gate:** AI contract test (mocked Claude → valid `AnswerFeedback`); short-answer cap rule enforced; answer length cap (4 KB) enforced; 401 + ownership checks.

---

### PR 4 — Session Summary Route + Prompt

**Steps:** 5 (session summary)

**Depends on:** PR 1, PR 2, PR 3

| Files                                          | Step |
| ---------------------------------------------- | ---- |
| `prompts/interview-summary.md` — Claude prompt | 5    |
| `app/api/interview/summary/route.ts`           | 5    |
| `app/api/interview/summary/route.test.ts`      | 7    |

**Merge gate:** AI contract test (mocked Claude → valid `InterviewSummary`); averages computed deterministically from stored answers; session marked `completed`; usage counter incremented once.

---

### PR 5 — Interview UI

**Steps:** 6 (UI pages)

**Depends on:** PR 2, PR 3, PR 4

| Files                                                             | Step |
| ----------------------------------------------------------------- | ---- |
| `app/(app)/interview/[sessionId]/page.tsx` — session runner       | 6    |
| `app/(app)/interview/[sessionId]/InterviewRunner.tsx`             | 6    |
| `app/(app)/interview/[sessionId]/FeedbackCard.tsx`                | 6    |
| `app/(app)/interview/[sessionId]/SummaryReport.tsx`               | 6    |
| `app/(app)/jobs/[id]/page.tsx` (update) — add "Start Interview"   | 6    |
| `app/(app)/jobs/[id]/InterviewPanel.tsx` — start button + history | 6    |

**Merge gate:** M3 Definition of Done checklist fully green; full manual flow verified (start → answer ×5 → summary).

---

## Step 1 — Shared Types & Zod Schemas

### `types/interview.ts`

```ts
import { z } from "zod";

export const QuestionTypeSchema = z.enum(["technical", "job", "behavioral"]);

export const QuestionSchema = z.object({
  index: z.number().int().min(0).max(4),
  text: z.string(),
  type: QuestionTypeSchema,
  repo_ref: z.string().nullable(),
});

export const SessionStatusSchema = z.enum(["active", "completed", "abandoned"]);

export const InterviewSessionSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  job_id: z.string().uuid(),
  status: SessionStatusSchema,
  questions: z.array(QuestionSchema).length(5),
  started_at: z.string().optional(),
  completed_at: z.string().nullable().optional(),
});

export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;
```

### `types/feedback.ts`

```ts
import { z } from "zod";

export const AnswerFeedbackSchema = z.object({
  relevance: z.number().int().min(1).max(5),
  depth: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  overall: z.number().int().min(1).max(5),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  model_answer_hint: z.string(),
});

export const ReadinessSchema = z.enum(["low", "moderate", "high"]);

export const InterviewSummarySchema = z.object({
  session_id: z.string().uuid().optional(),
  avg_relevance: z.number().min(0).max(5),
  avg_depth: z.number().min(0).max(5),
  avg_clarity: z.number().min(0).max(5),
  overall_score: z.number().int().min(1).max(5),
  top_strengths: z.array(z.string()),
  key_gaps: z.array(z.string()),
  recommended_actions: z.array(z.string()),
  readiness: ReadinessSchema,
});

export type AnswerFeedback = z.infer<typeof AnswerFeedbackSchema>;
export type Readiness = z.infer<typeof ReadinessSchema>;
export type InterviewSummary = z.infer<typeof InterviewSummarySchema>;
```

**Note:** The AI feedback prompt returns `relevance`, `depth`, `clarity`, `strengths`, `improvements`, `model_answer_hint`. `overall` is computed deterministically server-side as `round(mean(relevance, depth, clarity))` per spec §2, then validated. The route-local AI output schema (no `overall`) follows the M2 pattern (`AiOutputSchema` in `fit/score`).

---

## Step 2 — DB Helpers

All helpers follow the established `lib/db/*.ts` pattern: typed Supabase client, RLS via `user_id` (or session-ownership for `answers`/`summaries`), `as unknown as { ... }` casts for insert/update to work around Supabase generic inference.

### `lib/db/interview.ts`

```ts
createSession(supabase, userId, jobId: string, questions: Question[]): Promise<{ id: string }>
getSession(supabase, userId, sessionId): Promise<(SessionRow & { session: InterviewSession }) | null>
listSessions(supabase, userId): Promise<SessionRow[]>
updateSessionStatus(supabase, userId, sessionId, status: SessionStatus, completedAt?: string | null): Promise<void>
```

- `createSession` inserts `{ user_id, job_id, status: "active", questions, started_at: now }`.
- `getSession` selects by `id` + `user_id`, validates `questions` against `z.array(QuestionSchema)`; returns null on parse failure (mirrors `getJob`).

### `lib/db/answer.ts`

```ts
createAnswer(supabase, sessionId, questionIndex: number, answerText: string, feedback: AnswerFeedback): Promise<{ id: string }>
getAnswer(supabase, sessionId, questionIndex): Promise<AnswerRow | null>
listAnswers(supabase, sessionId): Promise<AnswerRow[]>
```

- RLS on `answers` is enforced via session ownership; helpers filter by `session_id`. The route loads the session via `getSession(... userId ...)` **first** to assert ownership before writing answers.
- `createAnswer` should upsert on `(session_id, question_index)` so re-answering a question overwrites prior feedback (or document as insert-only — see Notes).

### `lib/db/summary.ts`

```ts
createSummary(supabase, sessionId, summary: InterviewSummary): Promise<{ id: string }>
getSummary(supabase, sessionId): Promise<(SummaryRow & { summary: InterviewSummary }) | null>
```

### `lib/db/usage.ts`

```ts
getUsage(supabase, userId, period: string): Promise<UsageRow | null>
incrementInterviews(supabase, userId, period: string): Promise<void>
```

- `period` format: `YYYY-MM` (current calendar month) — computed in the route.
- `incrementInterviews` upserts the `(user_id, period)` row and bumps `interviews_count`.
- Used to enforce the free-tier limit (1 completed session / month).

---

## Step 3 — Question Generation API Route

**File:** `prompts/interview-questions.md`

System prompt instructing Claude to:

- Generate **exactly 5** interview questions for the given job + candidate context.
- Mix: **2 technical** (each must reference a specific repo/project by name → `repo_ref`), **2 job-requirement** (drawn from `required_skills` / `responsibilities`, `repo_ref: null`), **1 behavioral** (`repo_ref: null`).
- Order questions `index` 0–4; set `type` and `repo_ref` per question.
- Ground technical questions in the candidate's real repos (names, languages, topics) — no invented projects.
- Output a JSON array of 5 question objects matching `QuestionSchema`.
- Temperature ~0.5 (passed in `callClaude` options).

**File:** `app/api/interview/start/route.ts`

```
POST /api/interview/start
Auth: session cookie
Body: { job_id: string }
```

Handler logic:

1. `getUser()` → 401 if not authenticated.
2. Validate body: `job_id` present → 400 otherwise.
3. **Free-tier gate:** if `user.plan === "free"`, check `getUsage(supabase, userId, currentPeriod)`; if `interviews_count >= 1` → 429 `{ error: "free_tier_limit", message: "..." }`. (Counter is incremented at _completion_, not start — see Notes.)
4. Load `job` via `getJob(supabase, userId, jobId)` → 404 if missing.
5. Load `GitHubProfile` via `getGitHubProfile(supabase, userId)` → 400 if missing ("sync GitHub first").
6. Load latest resume via `listResumes(supabase, userId)[0]` (optional context; proceed if absent).
7. Build compact AI context: job `{ title, seniority, required_skills, preferred_skills, responsibilities }` + top repos `{ name, description, languages, topics }` (top 5 by signal) + resume `{ summary, skills }`.
8. Call `callClaude` with `prompts/interview-questions.md` at temperature 0.5; validate against `z.array(QuestionSchema).length(5)`.
9. Persist via `createSession(supabase, userId, jobId, questions)`.
10. Return `{ session_id, questions }`, 200.

Error handling:

- Schema validation failure → 500 with retry suggestion (mirrors M2 routes).

---

## Step 4 — Answer Feedback API Route

**File:** `prompts/interview-feedback.md`

System prompt instructing Claude to:

- Score a single answer on **relevance**, **depth**, **clarity** (each 1–5) using the spec §2 anchors.
- Return `strengths[]`, `improvements[]`, and a `model_answer_hint` (1–2 sentences, direction only — never a full rewrite).
- Feedback must reference the actual answer content — no generic boilerplate.
- Edge case: empty/very short answer → cap `relevance` and `depth` at 2 and prompt the user to elaborate.
- Output JSON matching the route-local AI schema (no `overall`).
- Temperature ≤ 0.3 (passed in `callClaude` options).

**File:** `app/api/interview/answer/route.ts`

```
POST /api/interview/answer
Auth: session cookie
Body: { session_id: string; question_index: number; answer_text: string }
```

Handler logic:

1. `getUser()` → 401.
2. Validate body: `session_id`, `question_index` (0–4), `answer_text` present → 400 otherwise.
3. Enforce answer length cap: truncate/reject `answer_text` > 4 KB → 400 (or truncate; see Notes).
4. Load session via `getSession(supabase, userId, sessionId)` → 404 (also asserts ownership). Reject if `status !== "active"` → 409.
5. Resolve the question at `question_index` from `session.questions`.
6. Build AI context: question `{ text, type, repo_ref }` + answer + compact job + repo context.
7. Call `callClaude` with `prompts/interview-feedback.md` at temperature 0.3; validate AI output.
8. Compute `overall = round(mean(relevance, depth, clarity))`; assemble + validate full `AnswerFeedback` against `AnswerFeedbackSchema`.
9. Persist via `createAnswer(supabase, sessionId, questionIndex, answerText, feedback)`.
10. Return `{ feedback, answered_count }` (so UI knows progress). 200.

---

## Step 5 — Session Summary API Route

**File:** `prompts/interview-summary.md`

System prompt instructing Claude to:

- Receive: the 5 questions + per-answer scores + per-answer strengths/improvements (compact).
- Produce `top_strengths[]`, `key_gaps[]`, `recommended_actions[]`, and a `readiness` rating (`low | moderate | high`).
- Be specific; synthesize across answers, don't restate per-answer feedback verbatim.
- Output JSON matching the route-local AI schema (no numeric averages or `overall_score`).
- Temperature ≤ 0.3.

**File:** `app/api/interview/summary/route.ts`

```
POST /api/interview/summary
Auth: session cookie
Body: { session_id: string }
```

Handler logic:

1. `getUser()` → 401.
2. Load session via `getSession(supabase, userId, sessionId)` → 404.
3. Load answers via `listAnswers(supabase, sessionId)`. Require all 5 answered → 400 `{ error: "incomplete_session" }` otherwise.
4. Compute deterministic averages: `avg_relevance`, `avg_depth`, `avg_clarity` (mean over 5 answers) and `overall_score = round(mean(per-answer overall))`.
5. Build AI context from questions + per-answer feedback; call `callClaude` with `prompts/interview-summary.md` at temperature 0.3; validate AI output (`top_strengths`, `key_gaps`, `recommended_actions`, `readiness`).
6. Assemble + validate full `InterviewSummary` against `InterviewSummarySchema`.
7. Persist via `createSummary(supabase, sessionId, summary)`.
8. Mark session completed: `updateSessionStatus(supabase, userId, sessionId, "completed", now)`.
9. Increment usage: `incrementInterviews(supabase, userId, currentPeriod)` (once, on completion).
10. Return `{ summary }`, 200.

Idempotency: if a summary already exists for the session, return it without re-calling Claude or re-incrementing the counter (see Notes).

---

## Step 6 — Interview UI

### Job detail update (`app/(app)/jobs/[id]/page.tsx`)

Add an **`InterviewPanel.tsx`** (new client component) below the fit/tailor grid:

- "Start Interview" button → `POST /api/interview/start` → on success, `router.push('/interview/[session_id]')`.
- Disabled with helper text if no GitHub profile / no resume.
- List of previous sessions for this job (status badge, link to `/interview/[sessionId]`).
- Surfaces free-tier limit (429) as an inline message.

### Interview runner page (`app/(app)/interview/[sessionId]/page.tsx`)

Server Component that loads the session + existing answers + summary (if any); redirects to `/dashboard` if not found. Passes data to `InterviewRunner`.

Sub-components:

- **`InterviewRunner.tsx`** (client): presents **one question at a time** with progress indicator (Q n/5), a 4 KB-capped textarea, "Submit Answer" → `POST /api/interview/answer`. Shows `FeedbackCard` for the just-answered question, then "Next". After Q5 → "Finish & Get Report" → `POST /api/interview/summary` → renders `SummaryReport`. Resumes mid-session from stored answers.
- **`FeedbackCard.tsx`**: relevance/depth/clarity/overall scores (1–5 with colour coding), strengths, improvements, `model_answer_hint`.
- **`SummaryReport.tsx`**: average bars, overall score, readiness badge, `top_strengths`, `key_gaps`, `recommended_actions`.

---

## Step 7 — Tests

| Test                                                                                                                       | File                                      | Type                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| `QuestionSchema` / `InterviewSessionSchema` validation + boundaries                                                        | `types/interview.test.ts`                 | Unit                                 |
| `AnswerFeedbackSchema` / `InterviewSummarySchema` validation + boundaries                                                  | `types/feedback.test.ts`                  | Unit                                 |
| `POST /api/interview/start` — happy path, free-tier 429, 401, missing job/profile                                          | `app/api/interview/start/route.test.ts`   | Integration (mock Claude + Supabase) |
| `POST /api/interview/answer` — happy path, overall computation, 4 KB cap, short-answer cap, 401, non-active session        | `app/api/interview/answer/route.test.ts`  | Integration / AI contract            |
| `POST /api/interview/summary` — happy path, deterministic averages, incomplete-session 400, idempotency, counter increment | `app/api/interview/summary/route.test.ts` | Integration / AI contract            |

---

## Step 8 — Definition of Done Checklist

- [ ] `QuestionSchema`, `InterviewSessionSchema`, `AnswerFeedbackSchema`, `InterviewSummarySchema` defined and exported
- [ ] DB helpers for interview sessions, answers, summaries, usage implemented (RLS-respecting)
- [ ] Question generation route: auth-gated, 5 questions (2 technical w/ `repo_ref`, 2 job, 1 behavioral), persists session
- [ ] Answer feedback route: auth-gated, relevance/depth/clarity 1–5, `overall` computed server-side, 4 KB cap, short-answer cap
- [ ] Summary route: auth-gated, deterministic averages + AI synthesis, marks session `completed`, increments usage once
- [ ] Free-tier limit enforced (1 completed session / month)
- [ ] AI calls: temperature ~0.5 for questions, ≤ 0.3 for feedback + summary; prompts in `prompts/`
- [ ] Interview UI: start from job page, one-question-at-a-time runner, per-answer feedback, summary report
- [ ] All tests pass (`pnpm test` green); `pnpm typecheck` green
- [ ] No secrets in client bundle
- [ ] RLS verified: all routes use `getUser()` before DB writes; answer/summary writes gated by session ownership

---

## File Creation Summary

```
types/
  interview.ts          ← QuestionSchema, InterviewSessionSchema + types
  interview.test.ts
  feedback.ts           ← AnswerFeedbackSchema, InterviewSummarySchema + types
  feedback.test.ts

lib/
  db/
    interview.ts        ← createSession, getSession, listSessions, updateSessionStatus
    answer.ts           ← createAnswer, getAnswer, listAnswers
    summary.ts          ← createSummary, getSummary
    usage.ts            ← getUsage, incrementInterviews

app/
  api/
    interview/
      start/
        route.ts
        route.test.ts
      answer/
        route.ts
        route.test.ts
      summary/
        route.ts
        route.test.ts
  (app)/
    interview/
      [sessionId]/
        page.tsx
        InterviewRunner.tsx
        FeedbackCard.tsx
        SummaryReport.tsx
    jobs/
      [id]/
        page.tsx          ← updated: add InterviewPanel
        InterviewPanel.tsx ← new: start button + session history

prompts/
  interview-questions.md
  interview-feedback.md
  interview-summary.md
```

---

## Notes & Decisions

- **Prompt file naming**: The specs reference `prompts/interview_questions.md` / `interview_feedback.md` (underscores). This plan uses **hyphens** (`interview-questions.md`) to match the existing repo convention (`job-parse.md`, `fit-score.md`, `resume-tailor.md`). Functionally identical.
- **`overall` and averages are deterministic**: Per feedback spec §2, `overall = round(mean(relevance, depth, clarity))` and the summary averages are computed in TypeScript, not by the model. The model only returns the qualitative pieces, mirroring the M2 fit-score split (route-local `AiOutputSchema` vs. shared `FitResultSchema`).
- **Usage counter timing**: The free-tier limit counts **completed** sessions. The counter is incremented in the summary route (on completion), and the start route only _reads_ it to block a new session when the cap is already reached. This avoids burning the monthly quota on abandoned sessions.
- **Abandoned sessions**: Spec §7 says mark `abandoned` after 30 min inactivity. The DB schema has no `updated_at`/`last_activity_at` column. **Options:** (a) defer automatic abandonment to M4 and only support explicit abandonment / completion in M3; (b) add a lightweight migration adding `last_activity_at timestamptz` to `interview_sessions` and a cron/edge function. **Recommendation:** option (a) for M3 (no new migration), revisit in M4 hardening. Document the gap explicitly.
- **Re-answering a question**: `createAnswer` should upsert on `(session_id, question_index)` so editing an answer replaces prior feedback. If a unique constraint is absent in the schema, either add one via migration or enforce "answer once, no edits" in the route. **Recommendation:** answer-once for M3 simplicity; allow re-answer in a polish pass.
- **Summary idempotency**: If `getSummary` returns an existing row, the summary route returns it directly (no second Claude call, no double counter increment).
- **Context size**: Question generation and feedback pass only compact context (job fields + top-5 repo metadata + resume summary/skills) — never raw job text or full READMEs — consistent with M2 token-budget discipline.
- **Resume context optional**: A session can start without a resume (GitHub profile is the minimum for technical questions); the prompt degrades gracefully. GitHub profile is required.
- **Streaming deferred**: MVP returns full JSON per call (no token streaming), consistent with existing routes. AI latency NFR (p95 < 12 s) applies.
