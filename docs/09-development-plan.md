# Development Plan

> Covers tech stack, dev environment, CI/CD (GitHub Actions), branching, and deployment for JobMatcher MVP.

## Status

_Last updated: 2026-06-19_

| Phase                | Status          |
| -------------------- | --------------- |
| M0 — Foundation      | **Complete**    |
| M1 — GitHub → Resume | **Complete**    |
| M2 — Job & Fit       | **Complete**    |
| M3 — Interview       | **In progress** |
| M4 — Hardening       | Not started     |

## 1. Tech Stack (confirmed)

See `08-technical-architecture.md` §2. Summary: Next.js 14 + TypeScript, Tailwind + shadcn/ui, Supabase (Auth/Postgres/Storage), Claude `claude-sonnet-4-5`, Zod, `@react-pdf/renderer`, hosted on Vercel.

## 2. Tooling

| Concern                | Tool                          |
| ---------------------- | ----------------------------- |
| Package manager        | pnpm                          |
| Lint                   | ESLint (next/core-web-vitals) |
| Format                 | Prettier                      |
| Type check             | `tsc --noEmit`                |
| Unit/integration tests | Vitest                        |
| E2E tests              | Playwright                    |
| Git hooks              | Husky + lint-staged           |
| Commit style           | Conventional Commits          |

## 3. Local Dev Environment Setup

```bash
# prerequisites: Node 20+, pnpm, Supabase CLI, Docker (for local Supabase)
pnpm install
cp .env.example .env.local        # fill secrets
supabase start                    # local Postgres + Auth
pnpm db:migrate                   # apply migrations
pnpm dev                          # http://localhost:3000
```

### `.env.example`

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
ANTHROPIC_API_KEY=
APP_URL=http://localhost:3000
```

> Secrets never committed. Production secrets live in Vercel + Supabase project settings; rotated quarterly.

## 4. Repository & Branching

- Trunk-based with short-lived feature branches.
- `main` is always deployable (protected; requires green CI + 1 review).
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/`.
- PRs squash-merge with Conventional Commit title.

## 5. Environments

| Env        | Branch  | URL                   | Data                     |
| ---------- | ------- | --------------------- | ------------------------ |
| Preview    | each PR | Vercel preview URL    | Supabase staging project |
| Production | `main`  | jobmatcher app domain | Supabase prod project    |

## 6. CI/CD — GitHub Actions

> Both workflows are **implemented and active**.

### 6.1 CI (`.github/workflows/ci.yml`) — on every PR and push to `main`

Implemented steps (matching the plan exactly):

1. Checkout + setup pnpm/Node.
2. `pnpm install --frozen-lockfile`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test` (Vitest, coverage)
6. `pnpm build`
7. Playwright E2E (smoke, Chromium only) against the running server.
8. Post-deploy health check job (`/api/health`) — runs on push to `main` after Vercel deploys.

Required to pass before merge (branch protection).

### 6.2 Migrations (`.github/workflows/migrate.yml`) — on merge to `main`

1. `supabase db push` against prod using `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` (GitHub secrets).
   Triggers only when files under `supabase/migrations/**` change.

### 6.3 Deployment

- **Vercel Git integration** handles preview (per PR) and production (`main`) deploys automatically. No manual deploy step.
- Post-deploy smoke check (curl health route) as a final Actions job (`health-check` in `ci.yml`).

### Actual CI skeleton (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test -- --coverage
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm start & # server started in workflow step
      - run: pnpm test:e2e
  health-check:
    needs: verify
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - run: curl /api/health # post-deploy smoke check
```

## 7. Testing Strategy

Implemented so far:

- **Unit**: signal scoring (`lib/github/scoring.test.ts`), GitHub types (`types/github.test.ts`), utils (`lib/utils.test.ts`).
- **Integration**: GitHub ingest API (`app/api/github/ingest/route.test.ts`), resume generate API (`app/api/resume/generate/route.test.ts`), AI client (`lib/ai/client.test.ts`), GitHub ingest lib (`lib/github/ingest.test.ts`).
- **AI contract tests**: resume generation endpoint validates output against `ResumeContentSchema` (Zod); mocked Claude in tests.
- **E2E (Playwright)**: smoke test (`e2e/smoke.spec.ts`) — login page loads and health endpoint returns 200.

Still to implement (M2+):

- Unit tests for fit-score math and skill canonicalization.
- E2E for the full happy path: login → ingest → generate resume → parse job → fit score → interview → summary.

## 8. Delivery Milestones

| Phase                | Scope                                                                 | Exit criteria                             | Status      |
| -------------------- | --------------------------------------------------------------------- | ----------------------------------------- | ----------- |
| M0 — Foundation      | Repo, CI, Supabase schema + RLS, auth, env                            | Login works, CI green, migrations apply   | **Done**    |
| M1 — GitHub → Resume | Ingestion + signal scoring + resume generate + editor + PDF           | User can produce a grounded resume        | **Done**    |
| M2 — Job & Fit       | Job ingestion + fit score + tailoring                                 | Paste job → score + tailored resume       | Not started |
| M3 — Interview       | Mock interview + per-answer feedback + summary                        | Complete a 5-question session with report | Not started |
| M4 — Hardening       | Usage limits, cost controls, analytics, privacy/delete, observability | NFRs met, billing tiers gated             | Not started |

### M0 — Foundation (Done)

- Next.js 14 + TypeScript project scaffolded with pnpm.
- Supabase schema with all MVP tables (`users`, `github_profiles`, `resumes`, `jobs`, `fit_results`, `interview_sessions`, `answers`, `interview_summaries`, `usage_counters`) and full RLS policies.
- GitHub OAuth login flow (`app/(auth)/login/`, `app/auth/callback/`, `lib/auth/actions.ts`, `middleware.ts`).
- `.env.example` with all required secrets documented.
- Husky pre-commit hook (lint-staged: ESLint + Prettier).
- Both CI/CD workflows live and tested (`ci.yml`, `migrate.yml`).
- `/api/health` route for post-deploy checks.

### M1 — GitHub → Resume (Done)

- **GitHub ingestion** (`lib/github/client.ts`, `lib/github/ingest.ts`, `app/api/github/ingest/`) — fetches user profile, up to 100 repos (top 20 kept), languages, commits, READMEs; ETag caching.
- **Signal scoring** (`lib/github/scoring.ts`) — weighted formula: recency (0.3), commit volume (0.25), language weight (0.2), README quality (0.15), popularity (0.1).
- **DB persistence** (`lib/db/github.ts`, `lib/db/resume.ts`) — upsert GitHub profile, create/update resumes.
- **Resume generation** (`app/api/resume/generate/`, `lib/ai/client.ts`) — Claude `claude-sonnet-4-5` with retry logic, Zod schema validation, system prompt in `prompts/resume-generate.md`.
- **Resume editor** (`app/(app)/resume/[id]/ResumeEditor.tsx`) — in-browser editing of generated resume content.
- **PDF export** (`app/api/resume/[id]/pdf/`, `lib/pdf/resume-pdf.tsx`) — `@react-pdf/renderer` server-side PDF generation.
- **Dashboard UI** (`app/(app)/dashboard/`) — `GitHubSyncCard` + `ResumeCard` components.
- Tests: 6 test files covering scoring, ingest lib, ingest API, resume generate API, AI client, and types.

## 9. Definition of Done (per feature)

- Matches its spec contract (validated by Zod).
- Unit + integration tests added; CI green.
- RLS verified for new tables.
- AI calls have timeout, retry, token budget, and logging.
- No secrets in client bundle.

## 10. Risks & Mitigations

| Risk                        | Mitigation                                             |
| --------------------------- | ------------------------------------------------------ |
| AI cost overrun             | Per-user usage counters, token budgets, model fallback |
| GitHub rate limits          | Caching, ETags, repo caps, async ingestion             |
| AI hallucination in resumes | Evidence-linked grounding rules + schema validation    |
| Scope creep                 | Roadmap gates (v1.1/v2.0 features out of MVP)          |
