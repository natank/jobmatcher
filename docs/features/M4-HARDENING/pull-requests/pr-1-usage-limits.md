# PR-1: Usage Limits + Free-Tier Enforcement

## Summary

Centralises all free-tier usage gating in a single `checkUsageLimit()` helper and extends enforcement to the resume generation route (previously ungated). Fixes a plan-reading bug in the interview start route where `user.user_metadata?.plan` was read — a field that Supabase Auth never populates from app code — making every user always fall through to free-tier by accident rather than by design. All plan reads now query the `users.plan` DB column explicitly. No new user-facing features; `pnpm typecheck` and `pnpm test` (239 tests) both green.

## Changes

### `lib/limits.ts` (new)

- **`PLAN_LIMITS`** — single source of truth for per-plan monthly caps:
  ```ts
  free: { resumes_per_month: 3, interviews_per_month: 1 }
  pro:  { resumes_per_month: Infinity, interviews_per_month: Infinity }
  ```
  The `pro` tier is a forward-compatible stub. No upgrade UI exists in MVP; it is reachable only by directly setting `users.plan = 'pro'` in the DB (e.g. for internal testing via the Supabase dashboard).
- **`Plan`** type (`"free" | "pro"`) and **`LimitedFeature`** type (`"resumes" | "interviews"`)
- **`checkUsageLimit(supabase, userId, feature, period)`** — reads plan from the `users` table (not `user_metadata`), short-circuits with `{ allowed: true, remaining: Infinity }` for `pro`, otherwise reads the usage counter and returns `{ allowed, remaining }`

### `lib/db/user.ts` (new)

- **`getUserPlan(supabase, userId): Promise<Plan>`** — queries `users.plan`, casts to `Plan`, defaults to `"free"` when the row is absent or `plan` is null. All MVP users return `"free"`.

### `lib/db/usage.ts` (updated)

- Added **`getOrCreateUsage(supabase, userId, period): Promise<UsageRow>`** — returns the existing row or inserts a zero-count row (`resumes_count: 0, interviews_count: 0`) and returns it. Useful when a caller needs a guaranteed non-null row without incrementing any counter.

### `app/api/resume/generate/route.ts` (updated)

- Calls `checkUsageLimit(supabase, userId, "resumes", period)` before the Claude call. Returns `429 free_tier_limit` when not allowed.
- Calls `incrementResumes(supabase, userId, period)` **after** successful resume creation and persistence (counter is not bumped on AI or DB errors).
- Response body now includes a `remaining` field (decremented client-facing count).

### `app/api/interview/start/route.ts` (updated)

- Removed the hardcoded `FREE_TIER_INTERVIEW_LIMIT = 1` constant and the direct `getUsage` call.
- Removed the buggy `user.user_metadata?.plan === "free" || !user.user_metadata?.plan` check — this condition was always `true` because `user_metadata.plan` is never set by any app code, making every user free-tier by accident.
- Replaced with `checkUsageLimit(supabase, userId, "interviews", period)` — functionally equivalent for MVP (all users are free), but now reads the actual DB value and will correctly honour a `pro` plan if one is set.

## Tests

### New test files

- **`lib/limits.test.ts`** — 8 unit tests for `checkUsageLimit`:
  - Resumes: under-limit (allowed, correct `remaining`), at-limit (blocked, `remaining: 0`), over-limit (blocked), null usage row (treated as count 0 → allowed)
  - Interviews: under-limit, at-limit
  - Pro plan bypass: always allowed with `remaining: Infinity`; `getUsage` is not called (short-circuit verified)

- **`lib/db/user.test.ts`** — 4 unit tests for `getUserPlan`:
  - Row with `plan = 'free'` → returns `'free'`
  - Row with `plan = 'pro'` → returns `'pro'`
  - Absent row (`data: null`) → defaults to `'free'`
  - Row with `plan: null` → defaults to `'free'`

- **`lib/db/usage.test.ts`** — 5 unit tests:
  - `getOrCreateUsage`: returns existing row; inserts zero-count row when absent; throws on insert error
  - `incrementResumes`: increments `resumes_count` when row exists; inserts row with `resumes_count: 1` when absent

### Updated test files

- **`app/api/interview/start/route.test.ts`** — migrated from mocking `getUsage` to mocking `checkUsageLimit`:
  - Removed `MOCK_USER_FREE` fixture (plan no longer read from `user_metadata`)
  - Added `vi.mock("@/lib/limits")` with default `{ allowed: true, remaining: 1 }`
  - 429 test now asserts `checkUsageLimit` returns `{ allowed: false }` rather than checking usage counts directly
  - New test: verifies `checkUsageLimit` is called with `("interviews", currentPeriod())`

- **`app/api/resume/generate/route.test.ts`** — added coverage for the new usage gate:
  - 429 when `checkUsageLimit` returns `{ allowed: false }` — asserts `callClaude` is not called
  - `checkUsageLimit` called with `("resumes", currentPeriod())`
  - `incrementResumes` called after successful generation
  - `incrementResumes` NOT called when Claude throws
  - `remaining` field present in 200 response

## Testing Evidence

```
$ pnpm test
Test Files  20 passed (20)
     Tests  239 passed (239)
  Duration  2.51s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ `PLAN_LIMITS` centralised — single file controls all monthly caps
- ✅ `checkUsageLimit()` reads plan from `users` DB table — `user_metadata` is no longer referenced
- ✅ Plan-reading bug fixed in `app/api/interview/start/route.ts`
- ✅ `incrementResumes()` called on successful resume generation; free-tier cap enforced
- ✅ `pnpm typecheck` green
- ✅ `pnpm test` green — 239 tests, 0 failures, no regressions
- ✅ No secrets in any file
- ✅ RLS respected — all DB calls go through the session-cookie client; no cross-user data access

## Notes

- **`pro` plan is dead code in MVP**: The `Infinity` bypass in `checkUsageLimit` is never reached in production because no code sets `users.plan = 'pro'`. It exists solely so that the config shape is forward-compatible and a manual DB override works correctly when needed for testing.
- **Counter increment placement**: `incrementResumes` is called after both the Claude call _and_ the `createResume` DB write succeed. A failed AI call or a resume persistence error leaves the counter unchanged — the user's quota is not consumed by an attempt that produced no stored result. The interview route already followed this convention (counter incremented at summary completion, not at session start); resume generation now matches.
- **`getOrCreateUsage` vs `getUsage`**: `checkUsageLimit` uses `getUsage` (returns null on missing row) and treats null as a zero count — no row insertion needed just to check limits. `getOrCreateUsage` is provided for callers that need a guaranteed non-null row (e.g. future analytics or admin tooling).
- **Supabase `as unknown as` cast pattern**: `getUserPlan` uses the same `result.data as Pick<UserRow, "plan"> | null` cast established by `lib/db/github.ts` and `lib/db/resume.ts` — the SDK's generic inference resolves select-column result types to `never` for these table shapes.

## Dependencies

This PR has no dependencies on other M4 PRs. It builds on the M3 baseline:

- `lib/db/usage.ts` (`getUsage`, `incrementInterviews`, `incrementResumes`, `currentPeriod`) — updated in place
- `app/api/interview/start/route.ts` — updated in place
- `app/api/resume/generate/route.ts` — updated in place

## Dependent PRs

- PR-2 (Cost Controls + Structured AI Logging) — no dependency on PR-1, but both modify `app/api/resume/generate/route.ts` and `app/api/interview/start/route.ts`; merge PR-1 first to avoid conflicts
