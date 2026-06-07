# PR-4: Dashboard UI

## Summary

Rewrote the dashboard page (`app/(app)/dashboard/page.tsx`) as a server component that loads `GitHubProfile` and `resumes` from Supabase, then renders two client-side cards: `GitHubSyncCard` (with consent modal) and `ResumeCard` (with generate button and resume list). Users can now sync their GitHub profile and generate resumes directly from the dashboard.

## Changes

### Dashboard Page Rewrite

- `app/(app)/dashboard/page.tsx` — Server component:
  - Parallel loads `getGitHubProfile` and `listResumes` via Supabase
  - Passes `initialProfile` and `initialResumes` as props to client cards
  - 2-column grid layout (responsive on mobile)
  - Removed placeholder content

### GitHub Sync Card

- `app/(app)/dashboard/GitHubSyncCard.tsx` — Client component:
  - **Consent modal** (Radix Dialog) — before first ingest, shows what data will be fetched (public repos, commits, languages, READMEs, stars, topics); user must explicitly confirm
  - Calls `POST /api/github/ingest` on sync
  - Shows connection status, last-synced timestamp, repo count, top 4 languages
  - Error handling with user-friendly messages (including GitHub rate limit `retry_after`)
  - Loading states with spinner

### Resume Card

- `app/(app)/dashboard/ResumeCard.tsx` — Client component:
  - Calls `POST /api/resume/generate` with empty body
  - Optimistic list update — adds new resume immediately to list
  - Links each resume to `/resume/[id]` (editor page, to be implemented in PR-5)
  - Shows summary preview, created date, version, status
  - Disabled when no GitHub profile exists (with warning banner)
  - Error handling with user-friendly messages

## Testing Evidence

```bash
$ pnpm test
Test Files  7 passed (7)
     Tests  58 passed (58)
  Duration  889ms
```

```bash
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ No regressions on existing auth flow (dashboard still requires authentication)
- ✅ Consent modal renders and gates first ingest per spec §10
- ✅ Sync button calls `POST /api/github/ingest`
- ✅ Generate button calls `POST /api/resume/generate`
- ✅ Resume list links to `/resume/[id]` (editor placeholder for PR-5)
- ✅ All existing tests pass (58/58)
- ✅ `pnpm typecheck` green

## Dependencies

- PR-2 (GitHub Ingest Route) — `POST /api/github/ingest` must exist
- PR-3 (AI Client + Resume Generate Route) — `POST /api/resume/generate` must exist

## Dependent PRs

- PR-5 (Resume Editor + PDF Export) — will implement `/resume/[id]` page and PDF export
