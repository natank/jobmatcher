# PR-2: Job Parse Route + Prompt

## Summary

`POST /api/jobs/parse` API route that ingests job descriptions from text or URL, extracts structured data via Claude, canonicalizes skills, and persists to the `jobs` table. Includes a Claude system prompt for structured job posting extraction and integration tests covering happy paths, error cases, and non-job content detection.

## Changes

### Step 3 — Job Parse API Route

- `prompts/job-parse.md` — Claude system prompt instructing the model to:
  - Extract structured `JobPosting` fields from job text
  - Distinguish required vs preferred skills by linguistic cues (required/must have vs nice to have/preferred)
  - Infer seniority from explicit level labels or year requirements (junior/mid/senior/lead/unknown)
  - Canonicalize skill names using synonym rules (js→javascript, k8s→kubernetes, etc.)
  - Detect non-job content (set seniority=unknown, empty skills, title="Unknown")
  - Output valid JSON matching `JobPostingSchema`

- `app/api/jobs/parse/route.ts` — `POST` handler:
  1. `getUser()` → 401 if not authenticated
  2. Validate body: must have `text` or `url` (not both empty) → 400 otherwise
  3. If `url`:
     - Fetch with 8s timeout, ≤ 3 redirects
     - Extract `<main>` or `<article>` content, strip HTML tags
     - On fetch failure → 422 with `{ error: "url_blocked", message: "..." }`
     - On thin content (< 50 chars after strip) → 422
  4. Truncate raw text to 12,000 chars
  5. Call `callClaude` with `prompts/job-parse.md`; validate against `JobPostingSchema`
  6. Canonicalize `required_skills`, `preferred_skills`, `keywords` via `canonicalizeSkills()`
  7. Persist to `jobs` table via `createJob()`
  8. Return `{ job }` JSON, 200
  9. Non-job text detected (seniority=unknown + empty skills) → include `{ warning: "low_confidence" }`
  10. Schema validation failure → 500 with retry suggestion

### Step 10 — Tests

- `app/api/jobs/parse/route.test.ts` — 12 integration tests (mock Claude + Supabase):
  - 401 when user not authenticated
  - 400 when neither text nor url provided
  - 400 when body is missing entirely
  - Happy path (text input) — asserts Claude called, skills canonicalized, DB persisted
  - URL input — sets source="url", includes source_url in user message
  - URL input — returns 422 when fetch fails
  - Non-job content — returns `low_confidence` warning when seniority=unknown + no required skills
  - Returns 500 with retry suggestion when `AIValidationError` is thrown
  - Returns 500 on unexpected errors
  - Reads system prompt from file system
  - Canonicalizes synonyms in required_skills (e.g. 'ReactJS' → 'react')
  - Truncates raw text to 12,000 characters

## Testing Evidence

```bash
$ pnpm test
Test Files  9 passed (9)
     Tests  80 passed (80)
  Duration  1.35s
```

```bash
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ Integration tests pass (`pnpm test` green)
- ✅ `pnpm typecheck` green
- ✅ Route follows job ingestion spec §5: text/URL input, 8s timeout, HTML stripping, 12,000 char truncation
- ✅ Skill canonicalization applied to required_skills, preferred_skills, and keywords
- ✅ Non-job content detection with `low_confidence` warning
- ✅ Auth-gated via `getUser()` before any DB writes
- ✅ Uses `lib/db/job.ts` from PR-1 for persistence
- ✅ Uses `lib/jobs/canonicalize.ts` from PR-1 for skill normalization

## Notes

- **HTML stripping**: Simple regex-based approach strips `<style>`, `<script>`, and all tags, then collapses whitespace. Prefers `<main>` or `<article>` elements for content extraction. No `jsdom` dependency — suitable for route handler context.
- **URL fetching timeout**: 8-second timeout prevents hanging on slow/blocking sites. Redirects are capped at 3 via fetch's built-in `redirect: "follow"` behavior.
- **Non-job detection**: Claude is instructed to set `seniority: "unknown"` and empty skill arrays when input is clearly not a job posting. The route adds a `low_confidence` warning in the response so the UI can surface this to the user.
- **Skill canonicalization**: Applied to all three skill-related fields (`required_skills`, `preferred_skills`, `keywords`) to ensure consistent matching in downstream fit scoring.

## Dependencies

- PR-1 (Types + Skill Canonicalization + DB Helpers) — required for `types/job.ts`, `lib/jobs/canonicalize.ts`, and `lib/db/job.ts`

## Dependent PRs

- PR-3 (Fit Score Library + Route) — will depend on `types/job.ts` and `lib/db/job.ts` for job data access
- PR-4 (Resume Tailoring Route) — will depend on `types/job.ts` for job context
- PR-5 (Job & Fit UI) — will call this route to ingest job descriptions
