# M2 Implementation Plan — Job & Fit

> M2 exit criteria (from `09-development-plan.md`): Paste job → score + tailored resume.

## Applicable Documents

1. M2 feature kickoff: `docs/features/M2-job-and-fit/M2-feature-kickoff.md`
2. Technical architecture: `docs/08-technical-architecture.md`
3. Development plan: `docs/09-development-plan.md`
4. Job ingestion spec: `docs/specs/03-job-ingestion-spec.md`
5. Fit score spec: `docs/specs/04-fit-score-spec.md`
6. Resume tailoring spec: `docs/specs/05-resume-tailoring-spec.md`

## Scope

Job ingestion (paste/URL → `JobPosting`) + fit scoring (deterministic coverage + AI judgment) + resume tailoring (job-specific variant) + UI wiring.

---

## Current State (M1 baseline)

- Auth + GitHub ingestion + signal scoring ✅
- AI client (`lib/ai/client.ts`) with retry, timeout, Zod validation ✅
- Resume generation + editor + PDF export ✅
- `types/resume.ts` (`ResumeContentSchema`) ✅
- `lib/db/resume.ts` — `createResume`, `getResume`, `updateResume`, `listResumes` ✅
- `jobs` and `fit_results` tables exist in DB schema ✅
- `lib/db/job.ts`, `lib/db/fit.ts` — **not yet created** ✅
- `types/job.ts`, `types/fit.ts` — **not yet created** ✅
- `app/api/jobs/parse/`, `app/api/fit/score/` — **not yet created** ✅
- `app/(app)/jobs/[id]/` — **not yet created** ✅

---

## Dependency Order

```
Types/Schemas (Step 1)
  └─ Skill canonicalization (Step 2)
       └─ Job parse API route (Step 3)
            └─ DB job helpers (Step 4, alongside Step 3)
  └─ Fit score library (Step 5)
       └─ Fit score API route (Step 6)
            └─ DB fit helpers (Step 7, alongside Step 6)
  └─ Resume tailoring API route (Step 8)
       └─ Job + Fit UI (Step 9)
Tests throughout (Step 10)
```

---

## Pull Request Groupings

```
PR1: Types + Skill Canonicalization + DB Helpers
  └─ PR2: Job Parse Route + Prompts
       └─ PR3: Fit Score Library + Route
            └─ PR4: Resume Tailoring Route + Prompt
                 └─ PR5: Job & Fit UI
```

### PR 1 — Types + Skill Canonicalization + DB Helpers **COMPLETE**

**Steps:** 1 (Types), 2 (Canonicalization), 4 (DB job helpers), 7 (DB fit helpers)

Pure TypeScript library code — no routes, no UI. Dependency of all subsequent PRs.

| Files                                                                          | Step |
| ------------------------------------------------------------------------------ | ---- |
| `types/job.ts` — `JobPostingSchema` + `JobPosting` type                        | 1    |
| `types/fit.ts` — `FitResultSchema` + `FitResult` type                          | 1    |
| `lib/jobs/canonicalize.ts` — skill synonym map + `canonicalizeSkill()`         | 2    |
| `lib/db/job.ts` — `createJob`, `getJob`, `listJobs`                            | 4    |
| `lib/db/fit.ts` — `createFitResult`, `getFitResult`, `getFitResultByJobResume` | 7    |
| `lib/jobs/canonicalize.test.ts`                                                | 10   |

**Merge gate:** unit tests pass, `pnpm typecheck` green.

---

### PR 2 — Job Parse Route + Prompt **COMPLETE**

**Steps:** 3 (Job parse API route)

**Depends on:** PR 1

| Files                                         | Step |
| --------------------------------------------- | ---- |
| `prompts/job-parse.md` — Claude system prompt | 3    |
| `app/api/jobs/parse/route.ts`                 | 3    |
| `app/api/jobs/parse/route.test.ts`            | 10   |

**Merge gate:** integration tests (mock Claude + Supabase) cover happy path, URL input, text input, non-job detection; 401 case.

---

### PR 3 — Fit Score Library + Route **COMPLETE**

**Steps:** 5 (deterministic fit scoring), 6 (fit score API route)

**Depends on:** PR 1, PR 2

| Files                                                       | Step |
| ----------------------------------------------------------- | ---- |
| `lib/fit/score.ts` — `computeCoverage()`, `combinedScore()` | 5    |
| `prompts/fit-score.md` — Claude system prompt               | 5    |
| `app/api/fit/score/route.ts`                                | 6    |
| `lib/fit/score.test.ts`                                     | 10   |
| `app/api/fit/score/route.test.ts`                           | 10   |

**Merge gate:** unit tests for `computeCoverage` with known inputs; AI contract test (mocked Claude → valid `FitResult` output).

---

### PR 4 — Resume Tailoring Route + Prompt **COMPLETE**

**Steps:** 8 (resume tailoring)

**Depends on:** PR 1, PR 2, PR 3

| Files                                             | Step |
| ------------------------------------------------- | ---- |
| `prompts/resume-tailor.md` — Claude system prompt | 8    |
| `app/api/resume/tailor/route.ts`                  | 8    |
| `app/api/resume/tailor/route.test.ts`             | 10   |

**Merge gate:** AI contract test (mocked Claude → valid tailored `ResumeContent`); grounding rules enforced (no new skills added).

---

### PR 5 — Job & Fit UI **COMPLETE**

**Steps:** 9 (UI pages)

**Depends on:** PR 2, PR 3, PR 4

| Files                                                                   | Step |
| ----------------------------------------------------------------------- | ---- |
| `app/(app)/jobs/[id]/page.tsx` — job detail + fit score + tailor button | 9    |
| `app/(app)/jobs/[id]/FitScoreCard.tsx`                                  | 9    |
| `app/(app)/jobs/[id]/TailoredResumePanel.tsx`                           | 9    |
| `app/(app)/dashboard/page.tsx` (update) — add job ingestion card        | 9    |
| `app/(app)/dashboard/JobCard.tsx` — paste/URL input, job list           | 9    |

**Merge gate:** M2 Definition of Done checklist fully green; full manual flow verified.

---

## Step 1 — Shared Types & Zod Schemas

### `types/job.ts`

```ts
import { z } from "zod";

export const JobPostingSchema = z.object({
  id: z.string().uuid().optional(), // set after DB persist
  source: z.enum(["url", "text"]),
  source_url: z.string().url().nullable().optional(),
  title: z.string(),
  company: z.string().nullable().optional(),
  seniority: z.enum(["junior", "mid", "senior", "lead", "unknown"]),
  required_skills: z.array(z.string()).max(30),
  preferred_skills: z.array(z.string()).max(30),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()).max(30),
  raw_text: z.string().max(12_000),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;
```

### `types/fit.ts`

```ts
import { z } from "zod";

export const GapSchema = z.object({
  skill: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  suggestion: z.string(),
});

export const FitResultSchema = z.object({
  score: z.number().int().min(1).max(5),
  coverage: z.number().min(0).max(1),
  ai_quality: z.number().min(0).max(1),
  matched_required: z.array(z.string()),
  missing_required: z.array(z.string()),
  matched_preferred: z.array(z.string()),
  gaps: z.array(GapSchema),
  rationale: z.string(),
});

export type FitResult = z.infer<typeof FitResultSchema>;
export type Gap = z.infer<typeof GapSchema>;
```

---

## Step 2 — Skill Canonicalization

**File:** `lib/jobs/canonicalize.ts`

A synonym map and a pure `canonicalizeSkill(skill: string): string` function.

```ts
const SYNONYMS: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  reactjs: "react",
  "react.js": "react",
  vuejs: "vue",
  "vue.js": "vue",
  nodejs: "node.js",
  node: "node.js",
  k8s: "kubernetes",
  kube: "kubernetes",
  pg: "postgresql",
  postgres: "postgresql",
  mongo: "mongodb",
  tf: "terraform",
  py: "python",
  // extend as needed
};

export function canonicalizeSkill(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return SYNONYMS[lower] ?? lower;
}

export function canonicalizeSkills(skills: string[]): string[] {
  return [...new Set(skills.map(canonicalizeSkill))];
}
```

**Tests (`lib/jobs/canonicalize.test.ts`):**

- `js` → `javascript`
- `ReactJS` → `react`
- `unknown-thing` → `unknown-thing` (passthrough)
- deduplication on `canonicalizeSkills`

---

## Step 3 — Job Parse API Route

**File:** `prompts/job-parse.md`

System prompt instructing Claude to:

- Extract structured `JobPosting` fields from the provided job text
- Distinguish required vs preferred skills by verb/section cues
- Canonicalize skills using the synonym rules
- Output valid JSON matching `JobPosting` schema
- If non-job content detected, set `seniority: "unknown"` and minimal required_skills

**File:** `app/api/jobs/parse/route.ts`

```
POST /api/jobs/parse
Auth: session cookie
Body: { text?: string; url?: string }
```

Handler logic:

1. `getUser()` → 401 if not authenticated.
2. Validate body: must have `text` or `url` (not both empty); error 400 otherwise.
3. If `url`:
   - Fetch with 8s timeout, ≤ 3 redirects.
   - Extract `<main>` or `<article>` content, strip HTML tags.
   - On fetch failure → 422 with `{ error: "url_blocked", message: "..." }`.
4. Truncate raw text to 12,000 chars.
5. Call `callClaude` with `prompts/job-parse.md`; validate against `JobPostingSchema`.
6. Canonicalize `required_skills`, `preferred_skills`, `keywords` via `canonicalizeSkills()`.
7. Persist to `jobs` table via `createJob()`.
8. Return `{ job }` JSON, 200.

Error handling:

- Non-job text detected (Claude returns seniority `unknown` + empty skills) → still persist but include `{ warning: "low_confidence" }`.
- Schema validation failure → 500 with retry suggestion.

---

## Step 4 — DB Job Helpers

**File:** `lib/db/job.ts`

```ts
createJob(supabase, userId, posting: Omit<JobPosting, "id">): Promise<{ id: string }>
getJob(supabase, userId, jobId): Promise<JobRow | null>
listJobs(supabase, userId): Promise<JobRow[]>
```

Follows same patterns as `lib/db/resume.ts` — typed Supabase client, RLS via `user_id` filter.

---

## Step 5 — Fit Score Library

**File:** `lib/fit/score.ts`

Pure function implementing the deterministic coverage formula from spec §3:

```ts
export interface CoverageResult {
  coverage: number;
  matched_required: string[];
  missing_required: string[];
  matched_preferred: string[];
}

export function computeCoverage(
  resumeSkills: string[], // canonical
  resumeTech: string[], // from all project.technologies
  jobRequired: string[], // canonical
  jobPreferred: string[], // canonical
  seniority: string, // job seniority
  resumeSeniority?: string // inferred from experience (optional)
): CoverageResult & { coverage: number };

export function combinedScore(coverage: number, aiQuality: number): number {
  const raw = 0.7 * coverage + 0.3 * aiQuality;
  return Math.min(5, Math.max(1, Math.round(1 + raw * 4)));
}
```

Matching logic:

- Collect all resume skills: `canonicalizeSkills(resume.skills)` + all `canonicalizeSkills(project.technologies)` from every project.
- `required_coverage = matched_required.length / jobRequired.length` (0 if empty).
- `preferred_coverage = matched_preferred.length / jobPreferred.length` (0 if empty).
- `seniority_match`: compare job seniority vs resume seniority → 1 (aligned), 0.5 (adjacent), 0 (far). Adjacent pairs: junior↔mid, mid↔senior, senior↔lead.
- `coverage = 0.6 * required_coverage + 0.25 * preferred_coverage + 0.15 * seniority_match`.

**File:** `prompts/fit-score.md`

System prompt instructing Claude to:

- Assess depth of evidence (commit volume, project relevance, role alignment) beyond keywords
- Return JSON `{ ai_quality: number (0-1), rationale: string, gaps: GapSchema[] }`
- Temperature ≤ 0.2 (passed in `callClaude` options)

---

## Step 6 — Fit Score API Route

**File:** `app/api/fit/score/route.ts`

```
POST /api/fit/score
Auth: session cookie
Body: { resume_id: string; job_id: string }
```

Handler logic:

1. `getUser()` → 401.
2. Load `resume` via `getResume(supabase, userId, resumeId)` → 404 if missing.
3. Load `job` via `getJob(supabase, userId, jobId)` → 404 if missing.
4. Run `computeCoverage()` deterministically.
5. Build AI context: resume summary + skills + project names + job title/required/preferred (no raw text).
6. Call `callClaude` (temperature 0.2) with `prompts/fit-score.md`; validate `{ ai_quality, rationale, gaps }`.
7. Call `combinedScore(coverage, ai_quality)` → final score 1–5.
8. Assemble `FitResult`; validate against `FitResultSchema`.
9. Persist via `createFitResult()`.
10. Return `{ fit }`.

---

## Step 7 — DB Fit Helpers

**File:** `lib/db/fit.ts`

```ts
createFitResult(supabase, userId, resumeId, jobId, result: FitResult): Promise<{ id: string }>
getFitResult(supabase, userId, fitId): Promise<FitRow | null>
getFitResultByJobResume(supabase, userId, jobId, resumeId): Promise<FitRow | null>
```

---

## Step 8 — Resume Tailoring Route + Prompt

**File:** `prompts/resume-tailor.md`

System prompt instructing Claude to:

- Receive: base resume JSON + job posting JSON + fit result JSON
- Allowed transformations: reorder projects/skills by relevance, rephrase summary/highlights using job keywords only where truthful, surface relevant evidence repos
- Forbidden: adding skills/projects not in base resume, inflating metrics, changing experience/education facts
- Output: full `ResumeContent` JSON + `changes[]` array

Output schema (extend `ResumeContentSchema`):

```ts
const TailoredResumeOutputSchema = ResumeContentSchema.extend({
  changes: z
    .array(
      z.object({
        field: z.string(),
        reason: z.string(),
      })
    )
    .optional(),
});
```

**File:** `app/api/resume/tailor/route.ts`

```
POST /api/resume/tailor
Auth: session cookie
Body: { resume_id: string; job_id: string; fit_id?: string }
```

Handler logic:

1. `getUser()` → 401.
2. Load resume, job, fit result (compute fit on-the-fly if `fit_id` not provided).
3. Build context: resume JSON + job JSON + fit result JSON.
4. Call `callClaude` with `prompts/resume-tailor.md`; validate against `TailoredResumeOutputSchema`.
5. Persist as a new resume row: `base_resume_id = resume_id`, `job_id`, `status = "tailored"`.
6. Return `{ tailored_resume_id, content, changes }`.

---

## Step 9 — UI Pages

### Dashboard update (`app/(app)/dashboard/page.tsx`)

Add third card alongside GitHub sync + resume cards:

**`app/(app)/dashboard/JobCard.tsx`** (new client component):

- Textarea for job description paste
- URL input field (alternative to paste)
- "Parse Job" button → calls `POST /api/jobs/parse`
- Loading state (shadcn Skeleton)
- List of previously parsed jobs with links to `/jobs/[id]`

### Job detail page (`app/(app)/jobs/[id]/page.tsx`)

Server Component that loads job + fit result (if exists) + resume list.

Sub-components:

- **`FitScoreCard.tsx`**: displays score 1–5, coverage bar, matched/missing skills, gap list with severity badges, rationale text. "Calculate Fit" button if no fit result yet (picks latest resume, calls `POST /api/fit/score`).
- **`TailoredResumePanel.tsx`**: "Tailor Resume" button → calls `POST /api/resume/tailor` → shows changes diff + link to tailored resume in editor.

---

## Step 10 — Tests

| Test                                                                          | File                                  | Type                                 |
| ----------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| `canonicalizeSkill` synonym map + passthrough                                 | `lib/jobs/canonicalize.test.ts`       | Unit                                 |
| `computeCoverage` formula with known inputs                                   | `lib/fit/score.test.ts`               | Unit                                 |
| `combinedScore` formula                                                       | `lib/fit/score.test.ts`               | Unit                                 |
| `POST /api/jobs/parse` — happy path (text), URL input, 401, non-job detection | `app/api/jobs/parse/route.test.ts`    | Integration (mock Claude + Supabase) |
| `POST /api/fit/score` — happy path, 401, missing resume/job                   | `app/api/fit/score/route.test.ts`     | Integration                          |
| `POST /api/resume/tailor` — happy path, grounding check (no new skills)       | `app/api/resume/tailor/route.test.ts` | AI contract                          |

---

## Step 11 — Definition of Done Checklist

- [ ] `JobPostingSchema` and `FitResultSchema` Zod schemas defined and exported
- [ ] `canonicalizeSkill` + `canonicalizeSkills` implemented and unit-tested
- [ ] `computeCoverage` deterministic formula implemented and unit-tested
- [ ] `combinedScore` formula tested with boundary values (0, 1 inputs)
- [ ] Job parse route: auth-gated, handles text + URL, canonicalizes skills, persists to DB
- [ ] Fit score route: auth-gated, deterministic + AI hybrid, persists `FitResult`
- [ ] Resume tailor route: auth-gated, no new skills added, persists variant with `base_resume_id`
- [ ] AI calls: temperature ≤ 0.2 for fit score, prompts in `prompts/` directory
- [ ] Dashboard: job ingestion card visible
- [ ] Job detail page: fit score card + tailor button functional
- [ ] Tailored resume linked from job page + accessible in editor
- [ ] All tests pass (`pnpm test` green)
- [ ] No secrets in client bundle
- [ ] RLS verified: all routes use `getUser()` before DB writes

---

## File Creation Summary

```
types/
  job.ts               ← JobPostingSchema + JobPosting
  fit.ts               ← FitResultSchema + FitResult + Gap

lib/
  jobs/
    canonicalize.ts    ← canonicalizeSkill(), canonicalizeSkills(), SYNONYMS
    canonicalize.test.ts
  fit/
    score.ts           ← computeCoverage(), combinedScore()
    score.test.ts
  db/
    job.ts             ← createJob, getJob, listJobs
    fit.ts             ← createFitResult, getFitResult, getFitResultByJobResume

app/
  api/
    jobs/
      parse/
        route.ts
        route.test.ts
    fit/
      score/
        route.ts
        route.test.ts
    resume/
      tailor/
        route.ts
        route.test.ts
  (app)/
    dashboard/
      page.tsx         ← updated: add JobCard
      JobCard.tsx      ← new: paste/URL input + job list
    jobs/
      [id]/
        page.tsx
        FitScoreCard.tsx
        TailoredResumePanel.tsx

prompts/
  job-parse.md
  fit-score.md
  resume-tailor.md
```

---

## Notes & Decisions

- **URL fetching**: Use `fetch()` with `AbortSignal.timeout(8000)` — no external library needed. Strip HTML with a simple regex (no `jsdom` in route handler); if content is too thin, fall back gracefully.
- **Seniority inference from resume**: M2 will not infer seniority from the resume itself (insufficient data); `seniority_match` will use `0.5` as default when resume seniority is unknown — conservative and safe.
- **Tailoring AI context size**: Pass only resume skills + project names + summary (not full bullets) to keep token count manageable. Full job text truncated to 4 KB.
- **Side-by-side diff UI**: Deferred to a polish pass; M2 UI shows `changes[]` as a simple list below the tailored resume.
- **`fit_id` on tailor route**: If not provided, look up latest fit result for the `(job_id, resume_id)` pair. If none exists, compute on-the-fly (inline, not persisted separately).
