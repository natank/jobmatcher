# M4 Implementation Plan — Hardening

> M4 exit criteria (from `09-development-plan.md`): NFRs met, billing tiers gated.

## Applicable Documents

1. M4 feature kickoff: `docs/features/M4-HARDENING/M4-feature-Kickoff.md`
2. Technical architecture: `docs/08-technical-architecture.md`
3. Development plan: `docs/09-development-plan.md`
4. Feature specs: `docs/specs/`

## Scope

M4 is a non-functional requirements (NFR) hardening phase. No new user-facing features are added. The phase covers:

1. **Usage limits & free-tier enforcement** — enforce per-user monthly caps for all AI features (resumes, interviews), not just interview sessions. All users are on the free tier for MVP; no payment or plan-selection UI exists yet.
2. **Cost controls** — per-feature token budgets, structured cost logging, model fallback for non-critical calls.
3. **Analytics** — funnel event tracking (PostHog or compatible) for the core user journey.
4. **Privacy & data deletion** — "Delete my data" endpoint that purges all user-keyed rows and Supabase Storage objects.
5. **Observability** — structured logs per AI call, Sentry error tracking, `/api/health` hardening.
6. **Abandoned-session cleanup** — mark interview sessions as `abandoned` after inactivity (deferred from M3, spec §7).
7. **Full E2E test** — Playwright happy-path: login → ingest → generate resume → parse job → fit score → interview → summary.

---

## Current State (M3 baseline)

- Auth + GitHub ingestion + signal scoring ✅
- AI client (`lib/ai/client.ts`) with retry, timeout, Zod validation ✅
- Resume generation + editor + PDF export ✅
- Job ingestion + fit scoring + resume tailoring ✅
- Interview: question generation, per-answer feedback, session summary ✅
- Free-tier limit enforced for interviews only (1 session/month) ✅
- `usage_counters` table with `resumes_count` + `interviews_count` columns ✅
- `users` table has `plan text default 'free'` column ✅ — but no UI or mechanism exists to set it to any other value
- **Plan-reading bug**: the existing interview gate reads `user.user_metadata?.plan` (Supabase Auth metadata), which is never set by any app code. In practice every user falls through the `|| !user.user_metadata?.plan` branch and is always treated as free-tier. M4 fixes this by reading `users.plan` from the DB instead.
- Structured AI logs: **partially** — client logs retries but no token/cost fields yet
- Sentry: **not integrated**
- Analytics (PostHog): **not integrated**
- "Delete my data": **not implemented**
- Abandoned-session cleanup: **not implemented**
- E2E happy-path: smoke test only (login + health endpoint) ✅ — full flow **not implemented**

### Existing schema relevant to M4

```
users(id, email, display_name, plan, created_at)
usage_counters(user_id, period, resumes_count, interviews_count)
interview_sessions(id, user_id, job_id, status, questions, started_at, completed_at)
github_profiles(id, user_id, login, access_token_enc, profile_json, fetched_at)
resumes(id, user_id, ...)
jobs(id, user_id, ...)
fit_results(id, user_id, ...)
answers(id, session_id, ...)
interview_summaries(id, session_id, ...)
```

---

## Dependency Order

```
Types/Config (Step 1)
  └─ Usage limits enforcement across all AI routes (Step 2)
       └─ Cost controls & structured AI logging (Step 3)
            └─ Observability: Sentry + /api/health hardening (Step 4)
                 └─ Analytics: funnel events (Step 5)
                      └─ Privacy: delete-my-data endpoint (Step 6)
                           └─ Abandoned-session cleanup (Step 7)
                                └─ Full E2E test (Step 8)
```

---

## Pull Request Groupings

```
PR1: Usage Limits + Plan Gating (all routes)
  └─ PR2: Cost Controls + Structured AI Logging
       └─ PR3: Observability (Sentry + health hardening)
            └─ PR4: Analytics (funnel events)
                 └─ PR5: Privacy — Delete-My-Data + Abandoned Sessions
                      └─ PR6: Full E2E Happy-Path Test
```

---

### PR 1 — Usage Limits + Free-Tier Enforcement **Complete**

**Steps:** 1 (config), 2 (limit enforcement)

Extends the existing free-tier guard (interview-only) to cover all AI features. Centralises limits in a single config object. Fixes the plan-reading bug in the interview route (reads from the `users` DB table instead of `user_metadata`).

**Key constraint:** There is no payment flow or plan-selection UI in the app. The `users.plan` column always contains `'free'` for all users in MVP. The `pro` tier exists in the config as a forward-compatible stub — the bypass branch is reachable only by directly updating the DB row (e.g. via Supabase dashboard for manual overrides). No upgrade path is built in M4.

| Files                                                                              | Notes      |
| ---------------------------------------------------------------------------------- | ---------- |
| `lib/limits.ts` — `PLAN_LIMITS` config + `checkUsageLimit()` helper                | New        |
| `lib/db/usage.ts` — add `incrementResumes()`, `getOrCreateUsage()`                 | Update     |
| `lib/db/user.ts` — add `getUserPlan(supabase, userId): Promise<Plan>`              | New/Update |
| `app/api/resume/generate/route.ts` — add usage check + increment                   | Update     |
| `app/api/interview/start/route.ts` — fix plan read; migrate to `checkUsageLimit()` | Update     |

**`PLAN_LIMITS` shape:**

```ts
// lib/limits.ts
export const PLAN_LIMITS = {
  free: { resumes_per_month: 3, interviews_per_month: 1 },
  // pro: stub only — no upgrade UI exists in MVP. Reachable only via direct DB update.
  pro: { resumes_per_month: Infinity, interviews_per_month: Infinity },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;
export type LimitedFeature = "resumes" | "interviews";

export async function checkUsageLimit(
  supabase: SupabaseClient,
  userId: string,
  feature: LimitedFeature,
  period: string // YYYY-MM
): Promise<{ allowed: boolean; remaining: number }>;
// Reads plan from users table (not user_metadata). All MVP users are 'free'.
```

**Merge gate:** unit tests for `checkUsageLimit` (under-limit, at-limit); `getUserPlan` returns `'free'` for a standard user row; `pnpm typecheck` green.

---

### PR 2 — Cost Controls + Structured AI Logging **Complete**

**Steps:** 3

Enriches the AI client to emit structured cost/token logs per call and enforce per-feature max-token budgets.

| Files                                                                                                 | Notes  |
| ----------------------------------------------------------------------------------------------------- | ------ |
| `lib/ai/client.ts` — add `inputTokens`, `outputTokens`, `costEstimateUsd`, `durationMs` to log output | Update |
| `lib/ai/pricing.ts` — `estimateCost(model, inputTokens, outputTokens): number`                        | New    |
| `lib/ai/token-budgets.ts` — per-feature `maxInputTokens` + `maxOutputTokens` constants                | New    |
| All `callClaude` call-sites — pass `maxTokens` from budget constants                                  | Update |

**Structured log format (JSON line per call):**

```json
{
  "event": "ai_call",
  "feature": "resume_generate",
  "model": "claude-sonnet-4-5",
  "inputTokens": 1240,
  "outputTokens": 890,
  "costEstimateUsd": 0.0042,
  "durationMs": 3820,
  "retryCount": 0,
  "success": true
}
```

**Token budgets (initial values, tunable):**

| Feature             | maxInputTokens | maxOutputTokens |
| ------------------- | -------------- | --------------- |
| resume_generate     | 8 000          | 4 000           |
| job_parse           | 4 000          | 1 500           |
| fit_score           | 6 000          | 1 000           |
| resume_tailor       | 8 000          | 4 000           |
| interview_questions | 4 000          | 1 000           |
| interview_feedback  | 3 000          | 800             |
| interview_summary   | 5 000          | 1 200           |

**Merge gate:** existing AI integration tests still pass; no token values hardcoded outside `token-budgets.ts`; `pnpm typecheck` green.

---

### PR 3 — Observability: Sentry + Health Hardening

**Steps:** 4

Adds Sentry error tracking and hardens the `/api/health` endpoint.

| Files                                                                                           | Notes  |
| ----------------------------------------------------------------------------------------------- | ------ |
| `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` — Sentry SDK init | New    |
| `next.config.mjs` — Sentry webpack plugin                                                       | Update |
| `lib/errors.ts` — `captureException(err, context)` wrapper                                      | New    |
| `app/api/health/route.ts` — add DB ping + env checks                                            | Update |
| `.env.example` — add `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`                               | Update |

**Health endpoint response (updated):**

```json
{
  "status": "ok",
  "db": "ok",
  "timestamp": "2026-06-21T10:00:00Z",
  "version": "git-sha or package version"
}
```

- DB ping: `SELECT 1` via service-role client; sets `"db": "error"` (not 5xx) if it fails, so Vercel health check still succeeds on non-DB outages.
- Sentry is initialised but only captures unhandled errors and explicit `captureException` calls — no PII.

**Merge gate:** `pnpm build` green with Sentry plugin; health endpoint returns 200 with all fields; no PII in Sentry context.

---

### PR 4 — Analytics: Funnel Events

**Steps:** 5

Adds PostHog (or a thin abstraction over it) server-side event tracking for the core funnel.

| Files                                                                | Notes  |
| -------------------------------------------------------------------- | ------ |
| `lib/analytics.ts` — `trackEvent(userId, event, props)` thin wrapper | New    |
| `app/api/github/ingest/route.ts` — emit `github_synced`              | Update |
| `app/api/resume/generate/route.ts` — emit `resume_generated`         | Update |
| `app/api/jobs/parse/route.ts` — emit `job_parsed`                    | Update |
| `app/api/fit/score/route.ts` — emit `fit_scored`                     | Update |
| `app/api/interview/start/route.ts` — emit `interview_started`        | Update |
| `app/api/interview/summary/route.ts` — emit `interview_completed`    | Update |
| `.env.example` — add `POSTHOG_API_KEY`, `POSTHOG_HOST`               | Update |

**Events to track:**

| Event                 | Properties                               |
| --------------------- | ---------------------------------------- |
| `github_synced`       | `{ repoCount, topLanguage }`             |
| `resume_generated`    | `{ hasJobContext: bool }`                |
| `job_parsed`          | `{ skillCount }`                         |
| `fit_scored`          | `{ overallScore }`                       |
| `resume_tailored`     | `{ fitScoreBefore }`                     |
| `interview_started`   | `{ jobId }`                              |
| `interview_completed` | `{ overallScore, readiness }`            |
| `free_tier_blocked`   | `{ feature }` — emitted on 429 responses |

- Analytics calls are **fire-and-forget** (non-blocking); errors are swallowed (logged, not thrown).
- No PII in event properties (no email, no resume text, no answer content).

**Merge gate:** `trackEvent` is a no-op when `POSTHOG_API_KEY` is absent (dev/test environment safe); `pnpm test` green.

---

### PR 5 — Privacy: Delete-My-Data + Abandoned Sessions

**Steps:** 6, 7

Implements the GDPR-style full user purge and the abandoned-session cleanup deferred from M3.

#### Part A — Delete My Data

| Files                                                                         | Notes |
| ----------------------------------------------------------------------------- | ----- |
| `app/api/user/delete/route.ts` — `DELETE /api/user/delete`                    | New   |
| `lib/db/user.ts` — `deleteUserData(supabase, userId)`                         | New   |
| `app/(app)/settings/page.tsx` — settings page with "Delete my account" button | New   |
| `app/(app)/settings/DeleteAccountDialog.tsx` — confirmation dialog            | New   |

**`deleteUserData` purge order** (respects FK constraints):

1. Delete Supabase Storage objects: `resumes/{userId}/*`
2. Delete `answers` (via `session_id` in `interview_sessions` owned by user)
3. Delete `interview_summaries` (via same)
4. Delete `interview_sessions`
5. Delete `fit_results`
6. Delete `resumes`
7. Delete `jobs`
8. Delete `usage_counters`
9. Delete `github_profiles`
10. Delete `users` row (or call `supabase.auth.admin.deleteUser(userId)`)

- Uses service-role client (server-only route).
- Returns 204 on success; signs the user out on the client after confirmation.
- Emits `account_deleted` analytics event before purge.

#### Part B — Abandoned Session Cleanup

| Files                                                                                                                | Notes          |
| -------------------------------------------------------------------------------------------------------------------- | -------------- |
| `supabase/migrations/YYYYMMDD_add_last_activity_at.sql` — add `last_activity_at timestamptz` to `interview_sessions` | New            |
| `lib/db/interview.ts` — update `updateSessionStatus` + add `touchSession()`                                          | Update         |
| `app/api/interview/answer/route.ts` — call `touchSession()` on each answer                                           | Update         |
| `app/api/interview/abandon/route.ts` — `POST /api/interview/abandon` for explicit abandonment                        | New            |
| `supabase/functions/abandon-stale-sessions/index.ts` — edge function (cron)                                          | New (optional) |

**Abandonment rules:**

- A session is `abandoned` if `last_activity_at` is more than 30 minutes ago and `status = 'active'`.
- Explicit abandonment: `POST /api/interview/abandon { session_id }` → sets `status = 'abandoned'` immediately.
- Automatic cleanup: Supabase edge function on a cron schedule (every 15 min) marks stale active sessions as `abandoned`. This is optional for MVP — document if deferred.

**Merge gate:** `deleteUserData` integration test (mock Supabase); settings page renders; no FK violation on delete; `pnpm typecheck` green.

---

### PR 6 — Full E2E Happy-Path Test

**Steps:** 8

Extends the existing Playwright smoke test to cover the complete user journey.

| Files                                             | Notes           |
| ------------------------------------------------- | --------------- |
| `e2e/happy-path.spec.ts` — full flow E2E test     | New             |
| `e2e/helpers/` — auth helper, mock-api intercepts | New (if needed) |

**Test scenario (happy path):**

```
1. Navigate to /login → GitHub OAuth (mocked/seeded test account)
2. Dashboard loads → "Sync GitHub" → wait for sync complete
3. "Generate Resume" → wait for resume card
4. Navigate to /resume/[id] → resume editor visible
5. Navigate to /jobs → paste job description → "Parse Job" → job card visible
6. Open job detail → "Score Fit" → fit score displayed
7. "Tailor Resume" → tailored resume generated
8. "Start Interview" → interview session begins (Q1 displayed)
9. Answer all 5 questions → submit each → feedback shown after each
10. "Finish & Get Report" → summary report rendered with readiness badge
```

- Uses test credentials seeded in Supabase staging; Claude calls intercepted with `page.route()` or MSW to return fixture responses.
- Runs in Chromium only (matches existing CI config).
- Target: < 90 s total runtime.

**Merge gate:** E2E test passes in CI (both locally and in GitHub Actions); existing smoke test still passes.

---

## Step 1 — Plan Limits Config

### `lib/limits.ts`

```ts
import type { TypedSupabaseClient } from "@/lib/db/client";
import { getUsage } from "./db/usage";
import { getUserPlan } from "./db/user";

export const PLAN_LIMITS = {
  free: { resumes_per_month: 3, interviews_per_month: 1 },
  // pro: stub only — no upgrade UI exists in MVP. Reachable only via direct DB update.
  pro: { resumes_per_month: Infinity, interviews_per_month: Infinity },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;
export type LimitedFeature = "resumes" | "interviews";

/**
 * Checks whether userId is allowed to make another AI call for `feature` this period.
 * Reads plan from the `users` DB table — NOT user_metadata (which is never set).
 * In MVP all users are 'free'; the pro branch is a forward-compatible stub.
 */
export async function checkUsageLimit(
  supabase: TypedSupabaseClient,
  userId: string,
  feature: LimitedFeature,
  period: string // YYYY-MM
): Promise<{ allowed: boolean; remaining: number }> {
  const plan = await getUserPlan(supabase, userId); // always 'free' in MVP
  const limit = PLAN_LIMITS[plan][`${feature}_per_month`];
  if (limit === Infinity) return { allowed: true, remaining: Infinity };

  const usage = await getUsage(supabase, userId, period);
  const count =
    feature === "resumes" ? (usage?.resumes_count ?? 0) : (usage?.interviews_count ?? 0);

  return { allowed: count < limit, remaining: Math.max(0, limit - count) };
}
```

### `lib/db/user.ts` (addition)

```ts
/** Returns the user's plan from the users table. Defaults to 'free' if row is missing. */
export async function getUserPlan(supabase: TypedSupabaseClient, userId: string): Promise<Plan> {
  const { data } = await supabase.from("users").select("plan").eq("id", userId).maybeSingle();
  return (data?.plan as Plan) ?? "free";
}
```

---

## Step 2 — DB Usage Helpers Update

Add to `lib/db/usage.ts`:

```ts
export async function incrementResumes(
  supabase: SupabaseClient,
  userId: string,
  period: string
): Promise<void>;
// upsert (user_id, period) and bump resumes_count — mirrors incrementInterviews

export async function getOrCreateUsage(
  supabase: SupabaseClient,
  userId: string,
  period: string
): Promise<UsageRow>;
// upsert with all-zero defaults if row is absent; returns the row
```

---

## Step 3 — AI Client Structured Logging

### `lib/ai/pricing.ts`

```ts
// Per-token cost in USD (as of initial M4 implementation; update as pricing changes)
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-sonnet-4-5": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-3-5": { inputPer1M: 0.8, outputPer1M: 4.0 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number;
```

### `lib/ai/token-budgets.ts`

```ts
export const TOKEN_BUDGETS: Record<string, { maxInputTokens: number; maxOutputTokens: number }> = {
  resume_generate: { maxInputTokens: 8_000, maxOutputTokens: 4_000 },
  job_parse: { maxInputTokens: 4_000, maxOutputTokens: 1_500 },
  fit_score: { maxInputTokens: 6_000, maxOutputTokens: 1_000 },
  resume_tailor: { maxInputTokens: 8_000, maxOutputTokens: 4_000 },
  interview_questions: { maxInputTokens: 4_000, maxOutputTokens: 1_000 },
  interview_feedback: { maxInputTokens: 3_000, maxOutputTokens: 800 },
  interview_summary: { maxInputTokens: 5_000, maxOutputTokens: 1_200 },
};
```

---

## Step 4 — `/api/health` Hardening

Updated `app/api/health/route.ts`:

```ts
export async function GET() {
  const start = Date.now();
  let dbStatus: "ok" | "error" = "ok";

  try {
    const supabase = createServiceClient();
    await supabase.from("users").select("id").limit(1);
  } catch {
    dbStatus = "error";
  }

  return NextResponse.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    db: dbStatus,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
  });
}
```

---

## Step 5 — Analytics Abstraction

### `lib/analytics.ts`

```ts
type EventName =
  | "github_synced"
  | "resume_generated"
  | "job_parsed"
  | "fit_scored"
  | "resume_tailored"
  | "interview_started"
  | "interview_completed"
  | "free_tier_blocked"
  | "account_deleted";

export function trackEvent(
  userId: string,
  event: EventName,
  props?: Record<string, string | number | boolean>
): void {
  // Fire-and-forget; swallow errors; no-op if POSTHOG_API_KEY absent
}
```

---

## Step 6 — Delete My Data

### `DELETE /api/user/delete`

```
Auth: session cookie
Body: none
Response: 204 No Content
```

Handler:

1. `getUser()` → 401 if not authenticated.
2. `deleteUserData(serviceSupabase, userId)` — purge in FK-safe order (see PR5 above).
3. `supabase.auth.admin.deleteUser(userId)` — remove auth user.
4. Emit `account_deleted` analytics event.
5. Return 204.

---

## Step 7 — Abandoned Sessions

### Migration

```sql
-- supabase/migrations/YYYYMMDD_add_last_activity_at.sql
ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now();
```

### `touchSession(supabase, sessionId)`

Updates `last_activity_at = now()` on `interview_sessions` by `id`. Called from the answer route after each answer is persisted.

### Abandonment cron (optional for MVP)

A Supabase edge function scheduled every 15 minutes:

```sql
UPDATE interview_sessions
SET status = 'abandoned'
WHERE status = 'active'
  AND last_activity_at < now() - interval '30 minutes';
```

Document explicitly if the edge function is deferred beyond the initial M4 merge.

---

## Step 8 — Full E2E Test

See PR 6 description above. Key decisions:

- Claude API calls are intercepted using `page.route('/api/**', ...)` to return fixture JSON, keeping tests deterministic and free.
- Supabase is seeded with a test user + GitHub profile fixture before the test run.
- The test file is `e2e/happy-path.spec.ts`; the existing `e2e/smoke.spec.ts` is unchanged.

---

## Tests Summary

| Test                                                                                    | File                                      | Type             |
| --------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------- |
| `checkUsageLimit` — under-limit, at-limit, over-limit                                   | `lib/limits.test.ts`                      | Unit             |
| `getUserPlan` — returns `'free'` for standard row, defaults to `'free'` when row absent | `lib/db/user.test.ts`                     | Unit             |
| `incrementResumes` + `getOrCreateUsage`                                                 | `lib/db/usage.test.ts`                    | Unit             |
| `estimateCost`                                                                          | `lib/ai/pricing.test.ts`                  | Unit             |
| AI client structured log fields present                                                 | `lib/ai/client.test.ts` (update)          | Unit             |
| `GET /api/health` — db ok, db error                                                     | `app/api/health/route.test.ts`            | Integration      |
| `DELETE /api/user/delete` — happy path, 401                                             | `app/api/user/delete/route.test.ts`       | Integration      |
| `POST /api/interview/abandon` — happy path, ownership                                   | `app/api/interview/abandon/route.test.ts` | Integration      |
| Full happy path (login → ingest → resume → job → fit → interview)                       | `e2e/happy-path.spec.ts`                  | E2E (Playwright) |

---

## Definition of Done Checklist

- [ ] `PLAN_LIMITS` config centralised; `checkUsageLimit()` reads plan from `users` DB table (not `user_metadata`); used by resume + interview routes
- [ ] `incrementResumes()` called on successful resume generation; free-tier cap enforced
- [ ] Structured AI log emitted per call: `feature`, `model`, `inputTokens`, `outputTokens`, `costEstimateUsd`, `durationMs`, `retryCount`, `success`
- [ ] Token budgets enforced: `maxInputTokens` + `maxOutputTokens` passed to all `callClaude` call-sites
- [ ] Sentry integrated: unhandled errors captured; no PII in payloads
- [ ] `/api/health` returns `db` status field and `timestamp`
- [ ] PostHog (or analytics wrapper) emits all 8 funnel events; no-op when key absent
- [ ] `DELETE /api/user/delete` purges all user data in FK-safe order; responds 204
- [ ] Settings page with "Delete my account" dialog reachable from authenticated app
- [ ] `last_activity_at` column added to `interview_sessions`; `touchSession()` called per answer
- [ ] Explicit session abandonment via `POST /api/interview/abandon` working
- [ ] Abandoned-session auto-cleanup documented (edge function implemented or explicitly deferred)
- [ ] Full E2E happy-path test passes in CI (Chromium)
- [ ] All unit + integration tests pass (`pnpm test` green); `pnpm typecheck` green
- [ ] No secrets in client bundle
- [ ] RLS verified for new routes (`/api/user/delete`, `/api/interview/abandon`)

---

## File Creation Summary

```
lib/
  limits.ts                        ← PLAN_LIMITS config + checkUsageLimit()
  limits.test.ts
  analytics.ts                     ← trackEvent() wrapper
  errors.ts                        ← captureException() Sentry wrapper
  ai/
    pricing.ts                     ← estimateCost()
    pricing.test.ts
    token-budgets.ts               ← per-feature token budget constants
  db/
    usage.ts                       ← add incrementResumes(), getOrCreateUsage()
    user.ts                        ← deleteUserData()

app/
  api/
    health/
      route.ts                     ← updated: db ping + timestamp
      route.test.ts
    user/
      delete/
        route.ts                   ← DELETE /api/user/delete
        route.test.ts
    interview/
      abandon/
        route.ts                   ← POST /api/interview/abandon
        route.test.ts
    resume/
      generate/
        route.ts                   ← updated: usage check + increment + analytics
    interview/
      start/
        route.ts                   ← updated: use checkUsageLimit() + analytics
      answer/
        route.ts                   ← updated: touchSession() + analytics
      summary/
        route.ts                   ← updated: analytics
    github/
      ingest/
        route.ts                   ← updated: analytics
    jobs/
      parse/
        route.ts                   ← updated: analytics (note: route may be at /api/jobs/parse)
    fit/
      score/
        route.ts                   ← updated: analytics
  (app)/
    settings/
      page.tsx                     ← settings page with delete account section
      DeleteAccountDialog.tsx      ← confirmation dialog

supabase/
  migrations/
    YYYYMMDD_add_last_activity_at.sql

sentry.client.config.ts
sentry.server.config.ts
sentry.edge.config.ts              ← Sentry SDK initialisation

e2e/
  happy-path.spec.ts               ← full journey E2E

.env.example                       ← add SENTRY_DSN, POSTHOG_API_KEY, POSTHOG_HOST
next.config.mjs                    ← add Sentry webpack plugin
```

---

## Notes & Decisions

- **Analytics library choice**: PostHog is specified in the architecture doc (`08-technical-architecture.md §10`). The `trackEvent` wrapper abstracts the SDK so the library can be swapped without touching call-sites.
- **Sentry vs. console.error**: Existing routes use `console.error`. M4 adds a `captureException` wrapper that calls both Sentry and `console.error` so dev logging is unchanged.
- **Delete order**: FK constraints require deleting child rows before parent rows. `answers` and `interview_summaries` reference `interview_sessions`; `fit_results` references `resumes` and `jobs`; all reference `users`. The purge helper must follow this order.
- **`supabase.auth.admin.deleteUser`**: Requires the service-role client. The delete route is server-only and already uses the service-role client for the data purge.
- **No payment or plan-selection UI**: The `users.plan` column exists in the DB with `default 'free'`, but there is no upgrade flow, Stripe integration, or plan-selection screen in the app. All users are effectively on the free tier for the entirety of MVP. The `pro` entry in `PLAN_LIMITS` is a forward-compatible stub — its unlimited bypass is dead code in practice, reachable only by manually updating a row in the DB (e.g. via the Supabase dashboard for internal testing). M4 does **not** build an upgrade path; that is a post-MVP concern.
- **Plan-reading bug fix**: The existing `app/api/interview/start/route.ts` reads `user.user_metadata?.plan`, which Supabase Auth never populates from our app code. This means the check `|| !user.user_metadata?.plan` is always true and every user is always treated as free-tier — correct by accident, but fragile. M4 fixes all plan reads to use `getUserPlan()` (queries the `users` table) so the logic is explicit and correct.
- **Token budget enforcement**: The Claude SDK accepts `max_tokens` for output. Input truncation is harder — context is pre-trimmed in route handlers (already done for M2/M3). M4 adds a logged warning when estimated input tokens exceed the budget constant.
- **Edge function for abandoned sessions**: Supabase edge functions require a separate deploy step. If not set up before M4 merge, document the gap in this plan and create a follow-up task.
- **E2E test credentials**: Use a dedicated test account in the Supabase staging project. The `SUPABASE_TEST_USER_EMAIL` and `SUPABASE_TEST_USER_PASSWORD` env vars are added to `.env.example` and documented in CI secrets.
- **Streaming**: Still deferred (consistent with M3 decision). All AI calls return full JSON.

```

```
