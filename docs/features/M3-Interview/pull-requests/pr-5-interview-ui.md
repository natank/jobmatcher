# PR-5: Interview UI

## Summary

Adds the complete interview UI: an `InterviewPanel` on the job detail page (start button + session history), a server-rendered session page, and three client sub-components (`InterviewRunner`, `FeedbackCard`, `SummaryReport`). Together they deliver the full user flow: start → answer Q1–5 one at a time → per-answer feedback → finish → summary report. Mid-session resumption and completed-session replay are both supported. No new API routes — this PR is pure UI wired to the three routes from PRs 2–4.

## Changes

### Job detail page update

- `app/(app)/jobs/[id]/page.tsx` (updated):
  - Added `getGitHubProfile` and `listSessionsByJob` to the parallel `Promise.all` alongside the existing `getJob`/`listResumes`/`getFitResultByJobResume` calls
  - Renders `<InterviewPanel>` below the fit/tailor grid, passing `jobId`, `hasGitHubProfile`, and `initialSessions`

### `InterviewPanel.tsx` (new, client component)

- Renders below the 2-column fit/tailor grid on the job detail page
- **Start Interview button** → `POST /api/interview/start` → `router.push('/interview/[session_id]')` on success; teal colour scheme matching the interview feature accent
- **Disabled state**: button is disabled + helper text shown when `hasGitHubProfile=false` ("Sync your GitHub profile first — it's used to generate technical questions grounded in your real projects")
- **Free-tier 429 handling**: inline amber banner ("You've used your 1 free interview session this month. Upgrade to run more.") — set on 429, cleared on next attempt
- **Previous sessions list**: renders each `SessionRow` with status badge (icon + label + colour) and formatted start date; each entry links to `/interview/[sessionId]`
  - `active` → amber Clock badge
  - `completed` → emerald CheckCircle badge
  - `abandoned` → slate Ban badge

### `app/(app)/interview/[sessionId]/page.tsx` (new, Server Component)

- Runs `getSession`, `listAnswers`, `getSummary` in parallel; redirects to `/dashboard` if session not found
- Safely parses stored `AnswerFeedback` rows via `AnswerFeedbackSchema.safeParse` — malformed rows are silently dropped (graceful degradation on DB schema drift)
- Safely parses stored `InterviewSummary` via `InterviewSummarySchema.safeParse`
- Passes typed `initialAnswers` and `initialSummary` down to `<InterviewRunner>` for mid-session resume and completed-session replay
- Header breadcrumb: "← Back to job / Mock Interview"

### `InterviewRunner.tsx` (new, client component)

- **Progress bar**: 5 fixed-width slots — teal for answered, light teal for current, slate for upcoming; answered count `N/5` shown inline
- **Question card**: type badge (`technical` / `job` / `behavioral`) + `repo_ref` chip if set + question text
- **Answering phase**:
  - Resizable textarea with placeholder; focused automatically when advancing questions
  - Live 4 KB byte-length check via `TextEncoder` — inline error message when exceeded; Submit button disabled
  - "Submit Answer" → `POST /api/interview/answer` → on success transitions to feedback phase
- **Feedback phase**: renders `<FeedbackCard>`; "Next question" advances (or auto-populates from `initialAnswers` if resuming); after Q5 with all answered shows "Finish & Get Report"
- **"Finish & Get Report"** → `POST /api/interview/summary` → on success renders `<SummaryReport>` in place of the runner
- **Mid-session resume**: `initialAnswers` pre-populates `answeredMap`; `startIndex` is the first unanswered question; if resuming on a question that was already answered, the feedback phase is shown immediately
- **Completed session replay**: if `initialSummary` is non-null on mount, renders `<SummaryReport>` immediately with no API calls

### `FeedbackCard.tsx` (new, server-compatible pure component)

- **Overall score**: large colour-coded number (1=red → 5=emerald)
- **Score bars**: relevance, depth, clarity — animated fill bars with colour-coded percentage
- **Strengths**: CheckCircle icon (emerald) per item
- **Improvements**: AlertCircle icon (amber) per item
- **Model answer hint**: blue hint box with Lightbulb icon

### `SummaryReport.tsx` (new, server-compatible pure component)

- **Header card**: overall score (large, colour-coded) + avg bars for relevance/depth/clarity (shown as `X.X/5`) + readiness badge
  - `high` → emerald badge; `moderate` → amber; `low` → red
- **Top strengths**: CheckCircle/emerald list
- **Key gaps**: AlertCircle/amber list
- **Recommended actions**: numbered list with blue circle badges
- **Back to job** link (`/jobs/[jobId]`)

## Testing Evidence

```
$ pnpm test
Test Files  17 passed (17)
     Tests  218 passed (218)
  Duration  2.04s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

No new unit/integration tests are added in this PR — the UI components are pure presentational (FeedbackCard, SummaryReport) or wire to already-tested API routes (InterviewRunner, InterviewPanel). The server page (`page.tsx`) follows the same SSR-redirect pattern as the existing job detail and dashboard pages.

## Merge Gate Verification

- ✅ All tests pass — all 218 prior tests still green; no regressions
- ✅ `pnpm typecheck` green
- ✅ No secrets in client bundle
- ✅ Auth enforced: server page calls `getUser()` and redirects to `/login` if not authenticated
- ✅ Session ownership enforced: `getSession(supabase, user.id, sessionId)` — not found → redirect to `/dashboard`
- ✅ 4 KB textarea guard matches the API route limit exactly (both use byte-length, not character count)
- ✅ Free-tier 429 surfaced as inline UI message (not a thrown error)
- ✅ Mid-session resume: server passes stored answers; `InterviewRunner` skips already-answered questions
- ✅ Completed session: server passes stored summary; `InterviewRunner` renders `SummaryReport` without any API calls
- ✅ M3 Definition of Done checklist fully green (see `M3-implementation-plan.md` §8)

## Notes

- **`FeedbackCard` and `SummaryReport` are server-compatible**: they take typed props and render no hooks — they could be used in both server and client contexts. They are co-located with the session page for discoverability.
- **`InterviewRunner` client-only state design**: `answeredMap` is a `Record<number, StoredAnswer>` keyed by question index. On submit, the API response `feedback` is merged in. `listAnswers` is not re-fetched client-side after submission — the map is the source of truth for the current session.
- **Byte-length guard via `TextEncoder`**: the same approach as the API route's `Buffer.byteLength` check — both count UTF-8 bytes, not JavaScript character codes. The client-side guard prevents a server-side 400 in the common case.
- **`initialSummary` parsed server-side**: the server page runs `InterviewSummarySchema.safeParse` and passes `null` on failure, rather than passing raw JSON. This means `InterviewRunner` never needs to handle an invalid summary shape at runtime.
- **`getSummary` access without `userId`**: `getSummary` queries by `session_id` only. Session ownership was already asserted by `getSession` (which filters by both `session_id` and `user_id`) earlier in the same server render. Passing the same `sessionId` to `getSummary` therefore cannot expose another user's summary.
- **`listAnswers` access without `userId`**: same rationale — called only after `getSession` asserts ownership.

## Dependencies

- PR-1 (Types + DB Helpers) — `SessionRow`, `getSession`, `listSessionsByJob`, `listAnswers`, `getSummary`, `AnswerFeedbackSchema`, `InterviewSummarySchema`
- PR-2 (Start Route) — `POST /api/interview/start` called by `InterviewPanel`
- PR-3 (Answer Route) — `POST /api/interview/answer` called by `InterviewRunner`
- PR-4 (Summary Route) — `POST /api/interview/summary` called by `InterviewRunner`
