# PR-1: Types + Skill Canonicalization + DB Helpers

## Summary

Pure TypeScript library code for job ingestion, fit scoring, and resume tailoring data structures. No routes or UI — foundational types, skill canonicalization logic, and Supabase query helpers required by all subsequent M2 PRs.

## Changes

### Step 1 — Shared Types & Zod Schemas

- `types/job.ts` — `JobPostingSchema` Zod schema + `JobPosting` type (matches job ingestion spec §5):
  - Fields: `id`, `source` (url|text), `source_url`, `title`, `company`, `seniority` (junior|mid|senior|lead|unknown)
  - Skill lists: `required_skills`, `preferred_skills`, `keywords` (capped at 30 items each)
  - `responsibilities` array, `raw_text` (capped at 12,000 chars)
- `types/fit.ts` — `GapSchema`, `FitResultSchema` Zod schemas + `Gap`, `FitResult` types (matches fit score spec §6):
  - `Gap`: `skill`, `severity` (high|medium|low), `suggestion`
  - `FitResult`: `score` (1–5), `coverage` (0–1), `ai_quality` (0–1), matched/missing arrays, `gaps[]`, `rationale`

### Step 2 — Skill Canonicalization

- `lib/jobs/canonicalize.ts` — Skill synonym map and normalization functions:
  - `SYNONYMS` constant: 40+ mappings (js→javascript, k8s→kubernetes, postgres→postgresql, golang→go, etc.)
  - `canonicalizeSkill(raw: string): string` — lowercase, trim, map to canonical form, passthrough unknown
  - `canonicalizeSkills(skills: string[]): string[]` — map each skill, deduplicate via Set

### Step 4 — DB Job Helpers

- `lib/db/job.ts` — `jobs` table helpers (follows same patterns as `lib/db/resume.ts`):
  - `createJob(supabase, userId, posting)` — insert and return `{ id }`
  - `getJob(supabase, userId, jobId)` — fetch single row, parse and validate `parsed` JSON against `JobPostingSchema`
  - `listJobs(supabase, userId)` — list all user jobs, ordered by `created_at` desc

### Step 7 — DB Fit Helpers

- `lib/db/fit.ts` — `fit_results` table helpers:
  - `createFitResult(supabase, userId, resumeId, jobId, result)` — insert and return `{ id }`
  - `getFitResult(supabase, userId, fitId)` — fetch single row, parse and validate `result` JSON against `FitResultSchema`
  - `getFitResultByJobResume(supabase, userId, jobId, resumeId)` — fetch most recent fit for a (job, resume) pair, ordered by `created_at` desc

### Step 10 — Tests

- `lib/jobs/canonicalize.test.ts` — 10 unit tests:
  - Synonym mapping correctness (js→javascript, k8s→kubernetes, etc.)
  - Case-insensitivity and whitespace trimming
  - Passthrough of unknown skills
  - Deduplication of skills that map to same canonical form
  - Mixed known/unknown skill handling

## Testing Evidence

```bash
$ pnpm test
Test Files  8 passed (8)
     Tests  68 passed (68)
  Duration  1.27s
```

```bash
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ Unit tests pass (`pnpm test` green)
- ✅ `pnpm typecheck` green
- ✅ All files are pure TypeScript library code (no routes, no UI)
- ✅ Zod schemas match job ingestion spec §5 and fit score spec §6
- ✅ Skill canonicalization covers common tech stack synonyms
- ✅ DB helpers follow existing patterns from `lib/db/resume.ts` and `lib/db/github.ts`

## Notes

- **Supabase type inference**: Same workaround as M1 PR-1 — SDK's generic type inference resolves `.update()`/`.insert()` arguments to `never` for this schema shape. Used typed `as unknown as` cast narrowed to just those two operations, consistent with existing DB helpers.
- **Skill synonym coverage**: 40+ mappings cover the most common tech stack variations. Extensible — new synonyms can be added to the `SYNONYMS` constant without changing function signatures.
- **`getJob` return type**: Returns `(JobRow & { posting: JobPosting })` — the parsed and validated `JobPosting` is included as a convenience for consumers, avoiding a second Zod parse call.

## Dependencies

None — this PR creates foundational library code for M2.

## Dependent PRs

- PR-2 (Job Parse Route) — depends on `types/job.ts`, `lib/jobs/canonicalize.ts`, and `lib/db/job.ts`
- PR-3 (Fit Score Library + Route) — depends on `types/fit.ts` and `lib/db/fit.ts`
- PR-4 (Resume Tailoring Route) — depends on `types/job.ts`, `types/fit.ts`, and all DB helpers
