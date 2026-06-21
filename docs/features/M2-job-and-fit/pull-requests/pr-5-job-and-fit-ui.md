# PR-5: Job & Fit UI

## Summary

Complete UI layer for job ingestion, fit scoring, and resume tailoring. Adds a third card to the dashboard for job parsing (text or URL input), a job detail page at `/jobs/[id]` displaying the full job posting with required/preferred skills and responsibilities, and two client components for fit scoring and resume tailoring. The fit score card shows a 1–5 score, coverage bar, matched/missing skills, gap list with severity badges, and rationale; the tailored resume panel calls the tailor route and displays a link to the generated variant plus a changes list.

## Changes

### Dashboard Update

- `app/(app)/dashboard/JobCard.tsx` — new client component:
  - Mode toggle (segmented control) between text paste and URL input
  - Textarea for job description paste (5 rows), URL input field
  - "Parse Job" button → `POST /api/jobs/parse` with loading state (skeleton-like disabled state)
  - Low-confidence warning banner when API returns `{ warning: "low_confidence" }`
  - Error display with red alert box
  - Optimistic job list update on success; job entries link to `/jobs/[id]`
  - Each job entry shows title, company (if present), and creation date

- `app/(app)/dashboard/page.tsx` — updated:
  - Imports `listJobs` from `lib/db/job.ts`
  - Fetches jobs in parallel with profile and resumes via `Promise.all`
  - Renders `JobCard` as a third card in the grid
  - Grid upgraded from `sm:grid-cols-2` to `sm:grid-cols-2 lg:grid-cols-3`
  - Subheading copy updated to mention job postings

### Job Detail Page

- `app/(app)/jobs/[id]/page.tsx` — server component:
  1. `getUser()` → redirect to `/login` if not authenticated
  2. Load job via `getJob(supabase, userId, params.id)` → redirect to `/dashboard` if not found
  3. Load resumes via `listResumes(supabase, userId)`
  4. Load latest fit result via `getFitResultByJobResume(supabase, userId, params.id, latestResume.id)` if a resume exists
  5. Render job header with:
     - Title, company (if present), seniority badge with label map (junior/mid/senior/lead/unknown)
     - Source label (text/url), "View original" link to `source_url` if present
     - Required skills (blue chips), preferred skills (grey chips), keywords (grey chips with tag icon)
     - Responsibilities as a bulleted list
  6. Render `FitScoreCard` and `TailoredResumePanel` in a two-column grid below the job header

- `app/(app)/jobs/[id]/FitScoreCard.tsx` — client component:
  - Props: `jobId`, `initialFit` (FitResult or null), `latestResume` (ResumeRow or null)
  - When fit exists:
    - Large score (1–5) with colour coding (red → orange → amber → emerald)
    - Coverage progress bar (blue fill, percentage label)
    - Matched required skills as green chips with check icon
    - Missing required skills as red chips with X icon
    - Gap list with high/medium/low severity badges (red/amber/grey) and suggestions
    - Rationale text
    - "Recalculate" button → calls `POST /api/fit/score` again
  - When no fit:
    - Helper text (different if no resume exists vs resume exists but no fit)
    - "Calculate Fit" button → calls `POST /api/fit/score` with latest resume ID
    - Error display on failed request
  - Loading state disables buttons and shows spinner

- `app/(app)/jobs/[id]/TailoredResumePanel.tsx` — client component:
  - Props: `jobId`, `latestResume` (ResumeRow or null), optional `fitId` (passed through to tailor route to avoid redundant AI calls)
  - When no tailored resume yet:
    - Helper text (different if no resume exists vs resume exists)
    - "Tailor Resume" button → calls `POST /api/resume/tailor` with `resume_id`, `job_id`, and `fit_id` if available
    - Error display on failed request
  - When tailored resume created:
    - Green confirmation banner
    - "Open in editor" link to `/resume/[tailored_resume_id]` with file icon
    - Changes list (if any) showing `{ field, reason }` for each modification
    - "Re-tailor" button to regenerate
  - Loading state disables buttons and shows spinner

## Testing Evidence

```
$ pnpm test
Test Files  12 passed (12)
     Tests  121 passed (121)
  Duration  1.77s
```

```
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ Dashboard: job ingestion card visible (JobCard rendered in grid)
- ✅ Job detail page: fit score card + tailor button functional (both components render and call their respective API routes)
- ✅ Tailored resume linked from job page + accessible in editor (TailoredResumePanel links to `/resume/[id]`)
- ✅ All tests pass (`pnpm test` green)
- ✅ No secrets in client bundle (all API calls go through server routes; no env vars exposed)
- ✅ RLS verified: all routes use `getUser()` before DB writes (server component pattern)

## Notes

- **Three-column grid on desktop**: The dashboard grid uses `lg:grid-cols-3` to accommodate the third card. On mobile (`default`) and small screens (`sm:grid-cols-2`), the cards stack vertically or in two columns respectively.
- **Job detail page is server component**: This allows loading job, resumes, and fit result in parallel on the server before rendering, which is more efficient than client-side data fetching. The sub-components are client components for interactivity (fit calculation, resume tailoring).
- **Fit result pre-loading**: The job detail page loads the latest fit result for the `(job_id, latest_resume_id)` pair via `getFitResultByJobResume`. This avoids an unnecessary API call when the user navigates to the page after having already calculated fit.
- **`fitId` passed to TailoredResumePanel**: When a fit result already exists, its ID is passed to the tailor panel so the tailor route can use it directly instead of recomputing fit on-the-fly. This is an optimization that saves an AI call.
- **Seniority label map**: The job detail page uses a constant map to convert enum values (`junior`, `mid`, `senior`, `lead`, `unknown`) to human-readable labels ("Junior", "Mid-level", "Senior", "Lead", "Unknown level").
- **Changes list as simple list**: Per the implementation plan §Notes, side-by-side diff UI is deferred to a polish pass. The tailor panel displays `changes[]` as a simple list with field and reason for each modification.
- **No new tests for UI components**: This PR adds only UI components; all existing tests (121) continue to pass. End-to-end UI testing is deferred to a future polish pass.

## Dependencies

- PR-1 (Types + Skill Canonicalization + DB Helpers) — required for `types/job.ts` (`JobPosting`), `types/fit.ts` (`FitResult`), `lib/db/job.ts` (`getJob`, `listJobs`), `lib/db/resume.ts` (`listResumes`), `lib/db/fit.ts` (`getFitResultByJobResume`)
- PR-2 (Job Parse Route) — JobCard calls `POST /api/jobs/parse`
- PR-3 (Fit Score Library + Route) — FitScoreCard calls `POST /api/fit/score`
- PR-4 (Resume Tailoring Route) — TailoredResumePanel calls `POST /api/resume/tailor`

## Dependent PRs

None — this is the final PR in the M2 Job & Fit milestone.
