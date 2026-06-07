# PR-1: Library Foundation

## Summary

Pure TypeScript library code for GitHub ingestion and resume data structures. No routes or UI — foundational types, GitHub API client, signal scoring, orchestrator, and Supabase query helpers required by all subsequent PRs.

## Changes

### Step 1 — Shared Types & Zod Schemas

- `types/github.ts` — `GitHubProfileSchema` Zod schema + `GitHubProfile` type (matches spec §7 output contract)
- `types/resume.ts` — `ResumeContentSchema` Zod schema + `ResumeContent` type (structured resume JSON)

### Step 2 — GitHub Ingestion Client & Signal Scoring

- `lib/github/client.ts` — Typed GitHub REST API calls:
  - `fetchUser`, `fetchRepos`, `fetchLanguages`, `fetchCommits`, `fetchReadme`
  - ETag cache support (`If-None-Match` header, 304 handling)
  - Custom error classes: `GitHubApiError`, `GitHubRateLimitError`
- `lib/github/scoring.ts` — `computeSignalScore(repo, userLogin, targetLanguages?)`:
  - 5-factor weighted formula: recency (30%), commit volume (25%), language weight (20%), readme quality (15%), popularity (10%)
  - Supports optional `targetLanguages` for weighted language scoring
- `lib/github/ingest.ts` — Orchestrator:
  - Concurrency pool (≤5 parallel repo fetches via `pMap`)
  - Filtering: exclude forks with 0 authored commits, exclude repos with 0 commits
  - Hard cap: scan at most 100 repos
  - Compute signal score per repo, sort descending, take top 20
  - Aggregate language totals across all filtered repos
  - Return validated `GitHubProfile`

### Step 4 — DB Query Helpers

- `lib/db/github.ts` — `github_profiles` table helpers:
  - `getGitHubProfile(supabase, userId)` — fetch and validate with Zod
  - `upsertGitHubProfile(supabase, userId, login, profile, tokenEnc?)` — select→update or insert (no unique constraint on `user_id`)
- `lib/db/resume.ts` — `resumes` table helpers:
  - `createResume(supabase, userId, content)` — insert and return `{ id }`
  - `getResume(supabase, userId, resumeId)` — fetch single row
  - `updateResume(supabase, userId, resumeId, content)` — update content
  - `listResumes(supabase, userId)` — list all user resumes, ordered by `created_at` desc

### Step 9 — Tests (partial)

- `types/github.test.ts` — 6 Zod schema validation tests
- `lib/github/scoring.test.ts` — 14 formula correctness tests (recency, commits, language, readme, popularity)
- `lib/github/ingest.test.ts` — 8 filtering/orchestration tests (fork exclusion, 0-commit exclusion, top-20 cap, language aggregation)

## Testing Evidence

```bash
$ pnpm test
Test Files  4 passed (4)
     Tests  31 passed (31)
  Duration  744ms
```

```bash
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ Unit tests pass (`pnpm test` green)
- ✅ `pnpm typecheck` green
- ✅ All files are pure TypeScript library code (no routes, no UI)
- ✅ Zod schemas match spec §7 and §6 requirements
- ✅ Signal scoring formula matches spec §6 weights

## Notes

- **Supabase type inference**: The SDK's generic type inference resolves `.update()`/`.insert()` arguments to `never` for this schema shape. Worked around with a typed `as unknown as` cast narrowed to just those two operations, documented inline in `lib/db/github.ts` and `lib/db/resume.ts`.
- **ETag cache**: Optional `ETagCache` parameter on all fetch functions; not used in this PR but available for ingest route caching in PR-2.
- **Token encryption**: `upsertGitHubProfile` accepts optional `tokenEnc` parameter but stores as-is for MVP (encryption deferred to hardening M4 per spec).

## Dependencies

None — this PR creates foundational library code.

## Dependent PRs

- PR-2 (GitHub Ingest Route) — depends on `lib/github/*` and `lib/db/github.ts`
- PR-3 (AI Client + Resume Generate Route) — depends on `types/resume.ts` and `lib/db/resume.ts`
