# Development Plan

> Covers tech stack, dev environment, CI/CD (GitHub Actions), branching, and deployment for JobMatcher MVP.

## 1. Tech Stack (confirmed)

See `08-technical-architecture.md` §2. Summary: Next.js 14 + TypeScript, Tailwind + shadcn/ui, Supabase (Auth/Postgres/Storage), Claude `claude-sonnet-4`, Zod, `@react-pdf/renderer`, hosted on Vercel.

## 2. Tooling

| Concern | Tool |
|---------|------|
| Package manager | pnpm |
| Lint | ESLint (next/core-web-vitals) |
| Format | Prettier |
| Type check | `tsc --noEmit` |
| Unit/integration tests | Vitest |
| E2E tests | Playwright |
| Git hooks | Husky + lint-staged |
| Commit style | Conventional Commits |

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

| Env | Branch | URL | Data |
|-----|--------|-----|------|
| Preview | each PR | Vercel preview URL | Supabase staging project |
| Production | `main` | jobmatcher app domain | Supabase prod project |

## 6. CI/CD — GitHub Actions

### 6.1 CI (`.github/workflows/ci.yml`) — on every PR

1. Checkout + setup pnpm/Node.
2. `pnpm install --frozen-lockfile`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test` (Vitest, coverage)
6. `pnpm build`
7. Playwright E2E (smoke) against the build.

Required to pass before merge (branch protection).

### 6.2 Migrations (`.github/workflows/migrate.yml`) — on merge to `main`

1. `supabase db push` against prod using `SUPABASE_ACCESS_TOKEN` + project ref (GitHub secrets).

### 6.3 Deployment

- **Vercel Git integration** handles preview (per PR) and production (`main`) deploys automatically. No manual deploy step.
- Post-deploy smoke check (curl health route) as a final Actions job.

### Example CI skeleton

```yaml
name: ci
on: { pull_request: {} }
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test -- --coverage
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps
      - run: pnpm test:e2e
```

## 7. Testing Strategy

- **Unit**: signal scoring, fit-score deterministic math, skill canonicalization, Zod schemas.
- **Integration**: API route handlers with mocked Claude + Supabase.
- **AI contract tests**: golden-input → assert output validates against schema (mock the model; do not assert exact text).
- **E2E (Playwright)**: core flow happy path — login → ingest (mocked) → generate resume → parse job → fit score → interview → summary.

## 8. Delivery Milestones

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| M0 — Foundation | Repo, CI, Supabase schema + RLS, auth, env | Login works, CI green, migrations apply |
| M1 — GitHub → Resume | Ingestion + signal scoring + resume generate + editor + PDF | User can produce a grounded resume |
| M2 — Job & Fit | Job ingestion + fit score + tailoring | Paste job → score + tailored resume |
| M3 — Interview | Mock interview + per-answer feedback + summary | Complete a 5-question session with report |
| M4 — Hardening | Usage limits, cost controls, analytics, privacy/delete, observability | NFRs met, billing tiers gated |

## 9. Definition of Done (per feature)

- Matches its spec contract (validated by Zod).
- Unit + integration tests added; CI green.
- RLS verified for new tables.
- AI calls have timeout, retry, token budget, and logging.
- No secrets in client bundle.

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AI cost overrun | Per-user usage counters, token budgets, model fallback |
| GitHub rate limits | Caching, ETags, repo caps, async ingestion |
| AI hallucination in resumes | Evidence-linked grounding rules + schema validation |
| Scope creep | Roadmap gates (v1.1/v2.0 features out of MVP) |
