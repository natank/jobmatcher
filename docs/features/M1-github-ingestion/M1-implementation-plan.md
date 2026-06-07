# M1 Implementation Plan — GitHub Ingestion → Resume

> M1 exit criteria (from `09-development-plan.md`): User can produce a grounded resume from their GitHub profile.

## Scope

GitHub OAuth ingestion + signal scoring + resume generation + resume editor + PDF export.

---

## Current State (M0 baseline)

- Auth: Supabase GitHub OAuth, session middleware, sign-in/sign-out ✅
- DB schema + RLS: all tables including `github_profiles` and `resumes` ✅
- `lib/db/client.ts`: server + admin Supabase clients ✅
- Dashboard: placeholder page ✅
- `lib/github/`, `lib/ai/`, `lib/pdf/`: empty ✅
- `app/api/github/ingest`, `app/api/resume/generate`: not yet created ✅

---

## Dependency Order

```
Types/Schemas (Step 1)
  └─ GitHub client + signal scoring (Step 2)
       └─ Ingest API route (Step 3)
            └─ DB query helpers (Step 4, usable alongside Step 3)
  └─ AI client (Step 5)
       └─ Resume generate API route (Step 6)
            └─ Resume editor UI (Step 7)
                 └─ PDF export (Step 8)
Tests run throughout (Step 9)
```

---

## Pull Request Groupings

```
PR1: Library Foundation
  └─ PR2: GitHub Ingest Route
  └─ PR3: AI + Resume Generate Route (can be developed in parallel with PR2)
       └─ PR4: Dashboard UI  ← merges after both PR2 and PR3
            └─ PR5: Resume Editor + PDF
```

### PR 1 — Library Foundation

**Steps:** 1 (Types), 2 (GitHub client + scoring), 4 (DB helpers)

Pure TypeScript library code — no routes, no UI. Reviewable in isolation and required by every subsequent PR.

| Files                                                                             | Step        |
| --------------------------------------------------------------------------------- | ----------- |
| `types/github.ts`, `types/resume.ts`                                              | 1           |
| `lib/github/client.ts`, `lib/github/scoring.ts`, `lib/github/ingest.ts`           | 2           |
| `lib/db/github.ts`, `lib/db/resume.ts`                                            | 4           |
| `lib/github/scoring.test.ts`, `lib/github/ingest.test.ts`, `types/github.test.ts` | 9 (partial) |

**Merge gate:** unit tests pass, `pnpm typecheck` green.

---

### PR 2 — GitHub Ingest Route

**Steps:** 3 (Ingest API route)

**Depends on:** PR 1

| Files                                 | Step        |
| ------------------------------------- | ----------- |
| `app/api/github/ingest/route.ts`      | 3           |
| `app/api/github/ingest/route.test.ts` | 9 (partial) |

**Merge gate:** integration tests (mocked GitHub API + Supabase) pass; 401, cache-hit, and happy-path cases covered.

---

### PR 3 — AI Client + Resume Generate Route

**Steps:** 5 (AI client), 6 (Resume generate route)

**Depends on:** PR 1. Can be developed in parallel with PR 2; merge order does not matter since the generate route reads `github_profiles` from DB directly.

| Files                                                            | Step        |
| ---------------------------------------------------------------- | ----------- |
| `lib/ai/client.ts`                                               | 5           |
| `prompts/resume-generate.md`                                     | 5           |
| `app/api/resume/generate/route.ts`                               | 6           |
| `lib/ai/client.test.ts`, `app/api/resume/generate/route.test.ts` | 9 (partial) |

**Merge gate:** AI contract test (mock Claude → asserts output validates `ResumeContent` schema); retry + timeout unit tests pass.

---

### PR 4 — Dashboard UI

**Steps:** 7 (dashboard portion only — consent modal, sync card, resume list card)

**Depends on:** PR 2 + PR 3 (both routes must exist).

| Files                                    | Step |
| ---------------------------------------- | ---- |
| `app/(app)/dashboard/page.tsx` (rewrite) | 7    |

**Merge gate:** no regressions on existing auth flow; consent modal renders; buttons call correct API routes.

---

### PR 5 — Resume Editor + PDF Export

**Steps:** 7 (resume editor page), 8 (PDF renderer + route)

**Depends on:** PR 3 (resume data in DB), PR 4 (resume list links to editor).

| Files                                  | Step |
| -------------------------------------- | ---- |
| `app/(app)/resume/[id]/page.tsx`       | 7    |
| `lib/pdf/resume-pdf.tsx`               | 8    |
| `app/api/resume/[id]/route.ts` (PATCH) | 8    |
| `app/api/resume/[id]/pdf/route.ts`     | 8    |

**Merge gate:** editor loads, saves, and exports PDF; M1 Definition of Done checklist fully green.

---

## Step 1 — Shared Types & Zod Schemas

**Files to create:**

- `types/github.ts` — Zod schema + TS type for `GitHubProfile` (matches spec §7 output contract)
- `types/resume.ts` — Zod schema + TS type for `ResumeContent` (structured resume JSON)

**`GitHubProfile` schema (from spec §7):**

```ts
z.object({
  login: z.string(),
  name: z.string(),
  fetched_at: z.string().datetime(),
  languages: z.array(z.object({ name: z.string(), bytes: z.number(), percent: z.number() })),
  repos: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      description: z.string().nullable(),
      primary_language: z.string().nullable(),
      languages: z.array(z.object({ name: z.string(), percent: z.number() })),
      stars: z.number(),
      topics: z.array(z.string()),
      authored_commits: z.number(),
      first_commit_at: z.string().nullable(),
      last_commit_at: z.string().nullable(),
      readme_excerpt: z.string(),
      signal_score: z.number(),
    })
  ),
});
```

**`ResumeContent` schema:**

```ts
z.object({
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(
    z.object({
      project: z.string(),
      url: z.string().optional(),
      bullets: z.array(z.string()),
      technologies: z.array(z.string()),
      period: z.string().optional(),
    })
  ),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string(),
        year: z.string().optional(),
      })
    )
    .optional(),
});
```

---

## Step 2 — GitHub Ingestion Client & Signal Scoring

**Files to create:**

- `lib/github/client.ts` — typed GitHub REST API calls
- `lib/github/scoring.ts` — `computeSignalScore(repo, userLogin, targetLanguages?)` pure function
- `lib/github/ingest.ts` — orchestrator: fetch → filter → score → top-20 → build `GitHubProfile`

**Key logic per spec:**

### `client.ts`

- `fetchUser(token)` → `GET /user`
- `fetchRepos(token)` → `GET /user/repos?type=owner&sort=pushed&per_page=100`
- `fetchLanguages(token, owner, repo)` → `GET /repos/{owner}/{repo}/languages`
- `fetchCommits(token, owner, repo, author)` → `GET /repos/{owner}/{repo}/commits?author={login}&per_page=100`
- `fetchReadme(token, owner, repo)` → `GET /repos/{owner}/{repo}/readme` (base64 decode, truncate 4 KB)
- All calls include `Authorization: Bearer {token}`, `Accept: application/vnd.github+json`
- ETag support: pass `If-None-Match` header, handle `304` by returning cached value

### `scoring.ts` — signal score formula (spec §6)

```
signal_score =
  0.30 * recency_factor    // exp(-ln2 * daysSincePush / 180)
+ 0.25 * commit_volume     // Math.log1p(authoredCommits) / Math.log1p(100) capped at 1
+ 0.20 * language_weight   // byte share in primary language, 0–1
+ 0.15 * readme_quality    // length>200 + has headings + has code blocks → 0..1
+ 0.10 * popularity        // Math.log1p(stars) / Math.log1p(1000) capped at 1
```

### `ingest.ts`

1. Fetch user, repos, verified emails.
2. Filter: exclude `fork:true` repos without user-authored commits; exclude repos with 0 authored commits.
3. Hard cap: scan at most 100 repos.
4. Per-repo: fetch languages + commits (with per-repo concurrency ≤ 5 via Promise pool) + README.
5. Compute `signal_score` per repo; sort descending; take top 20.
6. Aggregate language totals across all repos.
7. Return validated `GitHubProfile`.

---

## Step 3 — Ingest API Route

**File:** `app/api/github/ingest/route.ts`

```
POST /api/github/ingest
Auth: session cookie (server-side getUser())
Body: {} (token comes from Supabase session provider token)
```

**Handler logic:**

1. `getUser()` → 401 if not authenticated.
2. Retrieve provider access token from Supabase session (`session.provider_token`).
3. Check cache: query `github_profiles` for this user; if `fetched_at` within 7 days, return cached `profile_json` (spec §8).
4. Call `ingest(token)` from `lib/github/ingest.ts`.
5. Upsert row in `github_profiles` (`user_id`, `login`, `profile_json`, `fetched_at = now()`). Token stored as-is for MVP (encryption deferred to hardening M4).
6. Return `{ profile }` JSON, 200.
7. Error handling: GitHub rate limit → 429 with `retry_after`; validation failure → 500.

---

## Step 4 — DB Query Helpers

**File:** `lib/db/github.ts`

```ts
getGitHubProfile(supabase, userId): Promise<GitHubProfile | null>
upsertGitHubProfile(supabase, userId, login, profile, tokenEnc?): Promise<void>
```

**File:** `lib/db/resume.ts`

```ts
createResume(supabase, userId, content): Promise<{ id: string }>
getResume(supabase, userId, resumeId): Promise<ResumeRow | null>
updateResume(supabase, userId, resumeId, content): Promise<void>
listResumes(supabase, userId): Promise<ResumeRow[]>
```

---

## Step 5 — AI Client

**File:** `lib/ai/client.ts`

Single wrapper around `@anthropic-ai/sdk`:

- `callClaude({ systemPrompt, userMessage, schema, maxTokens, temperature, feature })` → validated output T
- Timeout: 30 s
- Retry: 1x on transient errors (5xx, timeout)
- Zod validation on response; throws `AIValidationError` on second failure
- Structured logging: `{ feature, inputTokens, outputTokens, latencyMs, retried, error }`

**File:** `prompts/resume-generate.md`

System prompt for resume generation — instructs Claude to:

- Use only evidence from the provided `GitHubProfile`
- Output JSON matching `ResumeContent` schema
- Link each bullet to a specific repo/commit evidence

---

## Step 6 — Resume Generate API Route

**File:** `app/api/resume/generate/route.ts`

```
POST /api/resume/generate
Auth: session cookie
Body: { target_role?: string, target_languages?: string[] }
```

**Handler logic:**

1. Auth check → 401.
2. Load `GitHubProfile` from DB (must exist; 400 if not ingested yet).
3. Load system prompt from `prompts/resume-generate.md`.
4. Call `callClaude` with profile + optional role context; validate against `ResumeContent` schema.
5. Persist to `resumes` table via `createResume()`.
6. Return `{ resume_id, content }`.

---

## Step 7 — UI Pages

### Dashboard update (`app/(app)/dashboard/page.tsx`)

Replace placeholder with:

- **GitHub sync card**: "Connect GitHub" button (calls `POST /api/github/ingest`), shows last-synced timestamp, repo count, top languages.
- **Resume card**: "Generate Resume" button (calls `POST /api/resume/generate`), list of generated resumes with links.
- Optimistic loading states with shadcn/ui Skeleton.

### Consent screen (inline modal or separate page)

- Before first ingest: display what data will be fetched (public repos, READMEs, commit counts).
- User must explicitly confirm before `POST /api/github/ingest` fires (spec §10).

### Resume editor (`app/(app)/resume/[id]/page.tsx`)

- Load resume by ID (Server Component → pass to client editor).
- Editable fields: summary, skills (tag input), experience bullets (inline edit).
- "Save" → `PATCH /api/resume/[id]` (or server action).
- "Export PDF" → triggers PDF download via `GET /api/resume/[id]/pdf`.

---

## Step 8 — PDF Export

**File:** `lib/pdf/resume-pdf.tsx`

- React PDF component (`@react-pdf/renderer`) rendering `ResumeContent` into a styled single-page PDF.
- Section: Header (name, GitHub URL), Summary, Skills, Experience (bullets), Education (if present).

**File:** `app/api/resume/[id]/pdf/route.ts`

```
GET /api/resume/[id]/pdf
Auth: session cookie
Response: application/pdf stream
```

---

## Step 9 — Tests

| Test                                                              | File                                    | Type                                   |
| ----------------------------------------------------------------- | --------------------------------------- | -------------------------------------- |
| `computeSignalScore` formula correctness                          | `lib/github/scoring.test.ts`            | Unit (Vitest)                          |
| `ingest` filtering rules (fork exclusion, 0-commit exclusion)     | `lib/github/ingest.test.ts`             | Unit                                   |
| `GitHubProfile` Zod schema validation                             | `types/github.test.ts`                  | Unit                                   |
| `POST /api/github/ingest` — happy path, cache hit, 401            | `app/api/github/ingest/route.test.ts`   | Integration (mocked GitHub + Supabase) |
| `POST /api/resume/generate` — valid profile → valid ResumeContent | `app/api/resume/generate/route.test.ts` | AI contract (mock Claude)              |
| `callClaude` retry + timeout behaviour                            | `lib/ai/client.test.ts`                 | Unit                                   |

---

## Step 10 — Definition of Done Checklist

- [ ] `GitHubProfile` and `ResumeContent` Zod schemas defined and exported
- [ ] Signal scoring formula implemented and unit-tested
- [ ] GitHub client fetches all required endpoints with ETag support
- [ ] Ingest route: auth-gated, caches profile (7-day TTL), returns `GitHubProfile`
- [ ] AI client: 30 s timeout, 1 retry, structured logging, Zod validation
- [ ] Resume generate route: auth-gated, loads profile, calls Claude, persists resume
- [ ] Dashboard: consent modal, sync button, resume generate button, status display
- [ ] Resume editor: load, edit summary/bullets/skills, save
- [ ] PDF export: downloadable PDF from resume ID
- [ ] All tests pass (`pnpm test` green)
- [ ] No secrets in client bundle (token never returned in API response)
- [ ] RLS verified: each route uses `getUser()` server-side before any DB write

---

## File Creation Summary

```
types/
  github.ts          ← GitHubProfile Zod schema
  resume.ts          ← ResumeContent Zod schema

lib/
  github/
    client.ts        ← GitHub REST API calls
    scoring.ts       ← computeSignalScore()
    ingest.ts        ← orchestrator
  ai/
    client.ts        ← Claude wrapper
  db/
    github.ts        ← github_profiles queries
    resume.ts        ← resumes queries
  pdf/
    resume-pdf.tsx   ← @react-pdf/renderer component

app/
  api/
    github/
      ingest/
        route.ts
    resume/
      generate/
        route.ts
      [id]/
        route.ts     ← PATCH (update)
        pdf/
          route.ts   ← GET PDF stream
  (app)/
    dashboard/
      page.tsx       ← updated with ingest + resume cards
    resume/
      [id]/
        page.tsx     ← resume editor

prompts/
  resume-generate.md ← Claude system prompt
```
