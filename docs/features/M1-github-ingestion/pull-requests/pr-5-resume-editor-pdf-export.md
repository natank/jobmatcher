# PR-5: Resume Editor + PDF Export

## Summary

Implemented the resume editor page (`/resume/[id]`) and PDF export functionality. Users can now view, edit, and export their AI-generated resumes as PDFs. The editor allows structured editing of summary, skills, project bullets, and education. Changes are persisted via `PATCH /api/resume/[id]` and PDFs are generated server-side via `GET /api/resume/[id]/pdf`.

## Changes

### PDF Renderer

- `lib/pdf/resume-pdf.tsx` — React PDF component using `@react-pdf/renderer`:
  - Renders a single-page A4 PDF with sections: Header (name, GitHub URL), Summary, Skills (chips), Projects (with bullets), Education
  - Styled with Helvetica font, consistent spacing, and professional layout
  - Server-rendered (via `serverComponentsExternalPackages` in `next.config.mjs`)

### API Routes

- `app/api/resume/[id]/route.ts` — `PATCH /api/resume/[id]`:
  - Auth-gated via `getUser()`
  - Validates request body against `ResumeContentSchema`
  - Calls `updateResume` to persist changes
  - Returns 400 on validation error, 401 on auth failure, 500 on unexpected errors

- `app/api/resume/[id]/pdf/route.tsx` — `GET /api/resume/[id]/pdf`:
  - Auth-gated via `getUser()`
  - Loads resume by ID and user
  - Validates content against `ResumeContentSchema`
  - Renders PDF server-side using `renderToBuffer`
  - Returns `application/pdf` stream with `Content-Disposition: attachment` header
  - Includes user name and GitHub URL in PDF header

### Resume Editor Page

- `app/(app)/resume/[id]/page.tsx` — Server component:
  - Loads resume by ID and user via `getResume`
  - Validates content schema; redirects to `/dashboard` on 404 or validation failure
  - Passes `resumeId`, `initialContent`, `version`, `status`, `createdAt`, `userName` to client editor

- `app/(app)/resume/[id]/ResumeEditor.tsx` — Client component:
  - **Header**: Back link to dashboard, version/status badges, Export PDF button, Save button
  - **Summary**: editable textarea with word count (target ≤ 60 words)
  - **Skills**: tag input with add/remove chips
  - **Projects**: collapsible accordion per project, editable bullet textareas, add/remove bullets
  - **Education**: read-only display of degree, institution, year
  - **Save**: calls `PATCH /api/resume/[id]`, shows loading spinner, success toast, error banner
  - **Export PDF**: opens `/api/resume/[id]/pdf` in new tab

## Testing Evidence

```bash
$ pnpm typecheck
✅ No TypeScript errors

$ pnpm test
Test Files  7 passed (7)
     Tests  58 passed (58)
  Duration  1.17s
```

## Merge Gate Verification

- ✅ Editor loads at `/resume/[id]` for valid resume IDs
- ✅ Editor redirects to `/dashboard` on 404 or invalid resume
- ✅ Save button calls `PATCH /api/resume/[id]` with validated content
- ✅ Export PDF button downloads a PDF via `GET /api/resume/[id]/pdf`
- ✅ PDF includes name, GitHub URL, summary, skills, projects, education
- ✅ All existing tests pass (58/58)
- ✅ `pnpm typecheck` green

## Dependencies

- PR-3 (AI Client + Resume Generate Route) — resume data in DB
- PR-4 (Dashboard UI) — resume list links to editor
- `@react-pdf/renderer` (already in `package.json`)

## Dependent PRs

None — this completes the M1 GitHub Ingestion feature.

## M1 Definition of Done Checklist

- [x] `GitHubProfile` and `ResumeContent` Zod schemas defined and exported
- [x] Signal scoring formula implemented and unit-tested
- [x] GitHub client fetches all required endpoints with ETag support
- [x] Ingest route: auth-gated, caches profile (7-day TTL), returns `GitHubProfile`
- [x] AI client: 30 s timeout, 1 retry, structured logging, Zod validation
- [x] Resume generate route: auth-gated, loads profile, calls Claude, persists resume
- [x] Dashboard: consent modal, sync button, resume generate button, status display
- [x] Resume editor: load, edit summary/bullets/skills, save
- [x] PDF export: downloadable PDF from resume ID
- [x] All tests pass (`pnpm test` green)
- [x] No secrets in client bundle (token never returned in API response)
- [x] RLS verified: each route uses `getUser()` server-side before any DB write
