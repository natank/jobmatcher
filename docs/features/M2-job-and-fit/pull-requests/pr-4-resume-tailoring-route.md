# PR-4: Resume Tailoring Route + Prompt

## Summary

`POST /api/resume/tailor` API route that produces a job-targeted variant of an existing resume using Claude. Loads the base resume, job posting, and fit result (resolving or computing fit on-the-fly if not provided), calls Claude with grounding rules that forbid adding skills or experiences absent from the base resume, persists the tailored variant as a new resume row linked back to the original, and returns the tailored content plus a `changes[]` explanation array. Includes the Claude system prompt and 15 integration tests.

## Changes

### Step 8 — Resume Tailoring Route + Prompt

- `prompts/resume-tailor.md` — Claude system prompt defining the tailoring contract:
  - Defines **allowed transformations**: reorder `skills` array (job-relevant first), reorder `experience` entries (most relevant first), rephrase `summary` to emphasise alignment with the job title and required skills, rephrase experience bullets to surface job keywords where the underlying fact truthfully supports it, surface an existing `url` from a project entry
  - Defines **forbidden transformations**: adding any skill not present in the base resume `skills` array or any `experience[].technologies` list; adding a project, role, or experience entry not in the base; inflating or fabricating metrics, team sizes, or outcomes; changing education; introducing first-person language; changing dates or periods
  - Includes an explicit **grounding check** instruction: every skill in the output `skills` array must appear in the input resume's `skills` or at least one `experience[].technologies`
  - Output schema: full `ResumeContent` JSON + `changes[]` array (up to 10 items) each with `{ field, reason }` referencing a specific field and the job requirement that motivated the change

- `app/api/resume/tailor/route.ts` — `POST /api/resume/tailor` handler:
  1. `getUser()` → 401 if not authenticated
  2. Validate body: must have both `resume_id` and `job_id` → 400 otherwise
  3. `getResume(supabase, userId, resumeId)` → 404 if not found; validate content against `ResumeContentSchema` → 500 if malformed
  4. `getJob(supabase, userId, jobId)` → 404 if not found
  5. **Fit resolution** (three-stage waterfall):
     - If `fit_id` provided: load via `getFitResult()` and use it
     - If no `fit_id` (or load failed): look up latest fit for the `(job_id, resume_id)` pair via `getFitResultByJobResume()`
     - If still no fit result: compute on-the-fly using `collectResumeSkills()` + `computeCoverage()` + `callClaude` at temperature 0.2 (feature `fit-score-inline`), assemble via `FitResultSchema`, persist via `createFitResult()`
  6. Build tailor context: full base resume + job `{ title, seniority, required_skills, preferred_skills, responsibilities, keywords, raw_text (truncated to 4 096 chars) }` + fit `{ matched_required, missing_required, matched_preferred, gaps, rationale }`
  7. Call `callClaude` with `prompts/resume-tailor.md`; validate against `TailoredResumeOutputSchema` (extends `ResumeContentSchema` with optional `changes[]`)
  8. Strip `changes` from content; persist tailored content as a new resume row via `createResume()`
  9. Update the new row: `base_resume_id = resume_id`, `job_id`, `status = "tailored"`
  10. Return `{ tailored_resume_id, content, changes }`, 200
  11. `AIValidationError` from fit-score step → 500 with retry suggestion
  12. `AIValidationError` from tailor step → 500 with retry suggestion
  13. Unexpected errors → 500

### Step 10 — Tests

- `app/api/resume/tailor/route.test.ts` — 15 integration tests (mock Claude + Supabase):
  - 401 when user not authenticated
  - 400 when `resume_id` missing
  - 400 when `job_id` missing
  - 404 when resume not found
  - 404 when job not found
  - Happy path with `fit_id` — asserts Claude called with `feature: "resume-tailor"`, `createResume` called with correct content shape, response includes `tailored_resume_id`, `content`, `changes`
  - Happy path without `fit_id` — asserts `getFitResultByJobResume` called, `getFitResult` not called
  - On-the-fly fit computation — when no existing fit found, asserts two `callClaude` calls in order (`fit-score-inline` then `resume-tailor`), and `createFitResult` called with the computed result
  - Grounding check — every skill in the tailored output `skills` array is present in the base resume's `skills` or `experience[].technologies`
  - Fit context shape — Claude receives `fit.matched_required`, `fit.missing_required`, `fit.gaps`, `fit.rationale`
  - `raw_text` truncation — job context `raw_text` is ≤ 4 096 chars even when source is longer
  - `changes` array — response includes an array of objects each with `field` and `reason`
  - Tailored resume persistence — `createResume` called once; `resumes` table updated with `base_resume_id`, `job_id`, `status="tailored"`
  - `AIValidationError` → 500 with "validation" in error message
  - Unexpected errors → 500

## Testing Evidence

```
$ pnpm test
Test Files  12 passed (12)
     Tests  121 passed (121)
  Duration  1.68s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ AI contract test: mocked Claude → valid tailored `ResumeContent` assembled and persisted
- ✅ Grounding rule enforced: test verifies no skill appears in output that is not in the base resume
- ✅ Route is auth-gated via `getUser()` before any DB access or AI call
- ✅ Tailored resume persisted as new row with `base_resume_id`, `job_id`, and `status="tailored"`
- ✅ Fit result resolved without requiring a separate prior call (waterfall: `fit_id` → lookup → on-the-fly)
- ✅ On-the-fly fit result persisted so it is available to subsequent calls
- ✅ `raw_text` truncated to 4 096 chars before being sent to Claude (verified by test)
- ✅ `pnpm typecheck` green

## Notes

- **`TailoredResumeOutputSchema` is route-local**: The schema extends `ResumeContentSchema` with an optional `changes[]` field. `changes` is stripped before calling `createResume` so the persisted `content` stays compatible with the existing `ResumeContent` type used throughout the app.
- **Fit waterfall design**: The three-stage fit resolution (explicit ID → lookup → on-the-fly) means the caller never needs to pre-compute a fit score before tailoring. When fit is computed on-the-fly it is also persisted, so the `POST /api/fit/score` result will be available if the job detail page loads the fit card afterward.
- **Context size management**: The job's `raw_text` is included in the tailor context (unlike the fit score route, where it is excluded) because the tailoring prompt benefits from the full job description language to produce natural rephrasing. It is hard-capped at 4 096 chars to keep the total context manageable.
- **No diff UI in M2**: The `changes[]` array is returned to the caller for display as a simple list. Side-by-side diff rendering is deferred to a post-M2 polish pass per implementation plan §Notes.
- **`status="tailored"` flag**: Set on the new resume row to distinguish tailored variants from base resumes in `listResumes` queries. The `base_resume_id` column (already in the DB schema from M1) links back to the originating resume for provenance.

## Dependencies

- PR-1 (Types + Skill Canonicalization + DB Helpers) — required for `types/resume.ts` (`ResumeContentSchema`), `types/fit.ts` (`FitResultSchema`), `lib/db/resume.ts` (`getResume`, `createResume`), `lib/db/job.ts` (`getJob`), `lib/db/fit.ts` (`getFitResult`, `getFitResultByJobResume`, `createFitResult`)
- PR-2 (Job Parse Route) — jobs must exist in the `jobs` table before tailoring can be requested
- PR-3 (Fit Score Library + Route) — `lib/fit/score.ts` (`computeCoverage`, `combinedScore`, `collectResumeSkills`) used for on-the-fly fit computation; `prompts/fit-score.md` reused for the inline fit AI call

## Dependent PRs

- PR-5 (Job & Fit UI) — `TailoredResumePanel` component will call this route and display `changes[]` below a link to the tailored resume in the editor
