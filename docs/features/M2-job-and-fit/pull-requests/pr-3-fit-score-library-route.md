# PR-3: Fit Score Library + Route

## Summary

Deterministic skill-coverage scoring library and `POST /api/fit/score` API route. Computes a hybrid fit score by combining a formula-based coverage score (required skills, preferred skills, seniority alignment) with a qualitative AI assessment of depth-of-evidence. Includes the Claude system prompt, `FitResult` persistence, and 25 tests across unit and integration levels.

## Changes

### Step 5 — Fit Score Library

- `lib/fit/score.ts` — Pure scoring functions and types:
  - `CoverageResult` interface — `coverage`, `matched_required`, `missing_required`, `matched_preferred`

  - `computeCoverage(resumeSkills, resumeTech, jobRequired, jobPreferred, seniority, resumeSeniority?)` — Deterministic coverage formula:
    - Merges `resumeSkills` + `resumeTech` into a single canonicalized skill set (via `canonicalizeSkills()` from PR-1)
    - Canonicalizes job skill lists before matching to ensure synonym consistency
    - `required_coverage = matched_required / total_required` (0 when list is empty)
    - `preferred_coverage = matched_preferred / total_preferred` (0 when list is empty)
    - `seniority_match`: 1.0 (same level), 0.5 (adjacent: junior↔mid, mid↔senior, senior↔lead), 0.0 (gap ≥ 2 levels), 0.5 (unknown/missing resume seniority — conservative default)
    - `coverage = 0.6 × required_coverage + 0.25 × preferred_coverage + 0.15 × seniority_match`

  - `combinedScore(coverage, aiQuality)` — Blends deterministic + AI signals into a final 1–5 integer:
    - `raw = 0.7 × coverage + 0.3 × aiQuality`
    - `score = clamp(round(1 + raw × 4), 1, 5)`

  - `collectResumeSkills(resume)` — Extracts `skills` array and flattened `technologies` from all experience entries as two separate lists for use as `resumeSkills` / `resumeTech` inputs

- `prompts/fit-score.md` — Claude system prompt for qualitative fit assessment:
  - Instructs the model to assess depth of evidence (bullet impact, project relevance, role alignment) beyond keyword presence
  - Defines the `ai_quality` 0–1 scoring rubric (0.8–1.0 strong, 0.5–0.8 moderate, 0.2–0.5 weak, 0–0.2 poor)
  - Restricts output to `{ ai_quality, rationale, gaps[] }` — no fabricated skills or experiences
  - Caps `gaps` at 5 items (most critical missing required skills only); rationale under 150 words
  - Gap severity taxonomy: `high` (core, significant ramp-up), `medium` (important, learnable), `low` (nice-to-have)

### Step 6 — Fit Score API Route

- `app/api/fit/score/route.ts` — `POST /api/fit/score` handler:
  1. `getUser()` → 401 if not authenticated
  2. Validate body: must have both `resume_id` and `job_id` → 400 otherwise
  3. `getResume(supabase, userId, resumeId)` → 404 if not found
  4. `getJob(supabase, userId, jobId)` → 404 if not found
  5. Parse and validate resume `content` against `ResumeContentSchema` → 500 if malformed
  6. Run `computeCoverage()` deterministically using `collectResumeSkills(resume)` outputs
  7. Build compact AI context: resume `{ summary, skills, experience }` + job `{ title, seniority, required_skills, preferred_skills, responsibilities }` — `raw_text` is deliberately excluded to control token size
  8. Call `callClaude` with `prompts/fit-score.md` at temperature 0.2; validate against inline `AiOutputSchema` (`ai_quality`, `rationale`, `gaps[]`)
  9. Call `combinedScore(coverage, ai_quality)` → final 1–5 score
  10. Assemble and validate full `FitResult` against `FitResultSchema`
  11. Persist via `createFitResult()` from PR-1
  12. Return `{ fit: { ...fitResult, id } }`, 200
  13. `AIValidationError` → 500 with retry suggestion
  14. Unexpected errors → 500

### Step 10 — Tests

- `lib/fit/score.test.ts` — 14 unit tests for `computeCoverage` and `combinedScore`:
  - Full required skill match (all matched, none missing, correct formula output)
  - Zero required skill match (all missing)
  - Preferred skill partial match included in coverage
  - Seniority: exact match → 1.0, adjacent → 0.5, far (≥ 2 levels) → 0.0
  - Unknown and undefined resume seniority both default to 0.5
  - Empty required skills list (returns 0 required_coverage, no missing)
  - `resumeTech` collected alongside `resumeSkills` for matching
  - Synonym canonicalization (`ReactJS` → `react`) applied at match time
  - `combinedScore` min (coverage=0, aiQuality=0 → 1), max (1, 1 → 5), midpoint (0.5, 0.5 → 3)
  - `combinedScore` weighting: high coverage + low AI → 4; low coverage + high AI → 2
  - `combinedScore` clamps out-of-range inputs

- `app/api/fit/score/route.test.ts` — 11 integration tests (mock Claude + Supabase):
  - 401 when user not authenticated
  - 400 when `resume_id` missing
  - 400 when `job_id` missing
  - 404 when resume not found
  - 404 when job not found
  - Happy path — asserts Claude called at temperature 0.2, `createFitResult` called with correct shape, response includes `fit.id`, score in 1–5, coverage in 0–1
  - Coverage correctness — fully matched required skills produce empty `missing_required`
  - AI context shape — response includes `summary`, `skills`, `experience`; `raw_text` is absent from job context
  - `AIValidationError` → 500 with "validation" in error message
  - Unexpected errors → 500
  - Gaps propagation — AI-returned gaps appear in `fit.gaps` with correct `skill` and `severity`

## Testing Evidence

```
$ pnpm test
Test Files  11 passed (11)
     Tests  106 passed (106)
  Duration  1.61s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ Unit tests for `computeCoverage` with known inputs (all formula branches verified)
- ✅ `combinedScore` tested with boundary values (0, 0.5, 1 coverage and aiQuality inputs)
- ✅ AI contract test: mocked Claude → valid `FitResult` output assembled and persisted
- ✅ Fit score route is auth-gated via `getUser()` before any DB access
- ✅ Claude called at temperature ≤ 0.2 as required by spec
- ✅ `raw_text` excluded from AI context (token efficiency, verified by test)
- ✅ `FitResultSchema` (from PR-1) used to validate assembled result before persistence
- ✅ `pnpm typecheck` green

## Notes

- **Two-stage scoring**: The deterministic coverage pass runs first (no network call) and produces `matched_required`, `missing_required`, `matched_preferred`, and a `coverage` value. Claude only receives a compact context object — never raw job text — keeping the AI call lean and deterministic scoring independent of it.
- **AI context design**: Resume is passed as `{ summary, skills, experience: [{ project, bullets, technologies, period }] }`. The `experience.url` field and education are omitted; they carry no signal for fit assessment. Job context includes `responsibilities` but omits `raw_text`, `source_url`, and `keywords`.
- **Seniority conservatism**: The route currently does not infer resume seniority from content (deferred per M2 implementation plan §Notes). `seniorityMatch` returns 0.5 when resume seniority is unknown, which is intentionally neutral — it neither penalizes nor rewards.
- **`AiOutputSchema` is route-local**: Claude's output schema (`ai_quality`, `rationale`, `gaps`) is defined inline in the route rather than exported from `types/fit.ts`. The full `FitResult` (which adds the deterministic fields) is only assembled after both passes complete and is validated against the shared `FitResultSchema`.
- **Gap limit**: The prompt instructs Claude to return at most 5 gaps. This is a soft cap enforced by prompt instruction, not schema validation, consistent with the approach used in PR-2 for skill list limits.

## Dependencies

- PR-1 (Types + Skill Canonicalization + DB Helpers) — required for `types/fit.ts` (`FitResultSchema`, `FitResult`), `types/job.ts` (`JobPosting`), `lib/jobs/canonicalize.ts` (`canonicalizeSkills`), `lib/db/fit.ts` (`createFitResult`), and `lib/db/job.ts` (`getJob`)
- PR-2 (Job Parse Route) — jobs must exist in the `jobs` table before fit scoring can be requested

## Dependent PRs

- PR-4 (Resume Tailoring Route) — will call this route's logic inline when `fit_id` is not provided; depends on `lib/fit/score.ts` for on-the-fly coverage computation
- PR-5 (Job & Fit UI) — `FitScoreCard` component will call this route and display `score`, `coverage`, `matched_required`, `missing_required`, and `gaps`
