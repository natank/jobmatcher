# Technical Architecture

> JobMatcher MVP. Aligns with PRD §5 and resolves the auth ambiguity in favor of Supabase Auth.

## 1. High-Level Architecture

```
                    ┌─────────────────────────────┐
                    │        Browser (SPA)        │
                    │  Next.js App Router + React  │
                    │  Tailwind + shadcn/ui        │
                    └──────────────┬──────────────┘
                                   │ HTTPS
                    ┌──────────────▼──────────────┐
                    │     Next.js (Vercel)        │
                    │  - UI routes (RSC)          │
                    │  - API routes / route hdlrs │
                    │  - Server actions           │
                    └───┬───────────┬──────────┬──┘
                        │           │          │
            ┌───────────▼──┐  ┌─────▼─────┐  ┌─▼─────────────┐
            │  Supabase    │  │  GitHub   │  │  Claude API   │
            │  Postgres    │  │  REST v3  │  │ (sonnet-4)    │
            │  Auth        │  │  OAuth    │  │ AI engine     │
            │  Storage     │  └───────────┘  └───────────────┘
            │  RLS         │
            └──────────────┘
```

## 2. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 14+ (App Router) + TypeScript** | Single deployable for UI + API |
| Styling | Tailwind CSS + shadcn/ui + Lucide | Per PRD |
| Auth | **Supabase Auth (GitHub provider)** | Resolves NextAuth/Passport ambiguity |
| DB | Supabase Postgres + RLS | Row-level security per user |
| Storage | Supabase Storage | Generated PDFs |
| AI | Anthropic Claude `claude-sonnet-4` | Structured JSON outputs |
| Validation | Zod | Validate AI JSON + API I/O |
| PDF | `@react-pdf/renderer` (server) | Deterministic resume export |
| Hosting | Vercel | Per PRD |
| Queue (light) | Vercel background / DB job rows | GitHub ingestion async |

## 3. Application Structure

```
/app                    # Next.js App Router (UI + route handlers)
  /(auth)               # login, oauth callback
  /(app)                # authenticated app
    /dashboard
    /resume
    /jobs/[id]
    /interview/[sessionId]
  /api                  # route handlers (server-only)
    /github/ingest
    /resume/generate
    /jobs/parse
    /fit/score
    /interview/...
/lib
  /github               # ingestion client + signal scoring
  /ai                   # Claude client, schema validation, retries
  /db                   # Supabase client + typed queries
  /pdf                  # resume PDF renderer
/prompts                # versioned system prompts (PRD §6)
/types                  # shared Zod schemas + TS types (contracts)
/supabase/migrations    # SQL migrations
```

## 4. Data Model (Supabase)

```sql
users(id uuid pk, email, display_name, plan text default 'free', created_at)
github_profiles(id uuid pk, user_id fk, login, access_token_enc, profile_json jsonb, fetched_at)
resumes(id uuid pk, user_id fk, version int, base_resume_id uuid null, job_id uuid null,
        content jsonb, status text, created_at)
jobs(id uuid pk, user_id fk, source text, source_url text, parsed jsonb, created_at)
fit_results(id uuid pk, user_id fk, resume_id fk, job_id fk, result jsonb, created_at)
interview_sessions(id uuid pk, user_id fk, job_id fk, status text, questions jsonb,
                   started_at, completed_at)
answers(id uuid pk, session_id fk, question_index int, answer_text text, feedback jsonb)
interview_summaries(id uuid pk, session_id fk, summary jsonb, created_at)
usage_counters(user_id fk, period text, resumes_count int, interviews_count int)
```

- **RLS**: every table keyed by `user_id`; policies restrict rows to `auth.uid()`.
- `access_token_enc`: encrypted at rest (pgcrypto or app-layer); never returned to client.

## 5. AI Layer Design

- Single `lib/ai/client.ts` wraps Claude with: timeout, retry (1x), token budget, temperature per feature.
- Each feature loads its prompt from `/prompts/<feature>.md` (versioned).
- Context injection: only the relevant spec/data per call (PRD §6) to control window + cost.
- All AI outputs validated by Zod against the contracts in `/types`; invalid → single retry → graceful error.
- **Cost controls**: max input tokens per feature, model fallback to a cheaper model on non-critical calls, per-user usage counters.

## 6. Request Flows (key paths)

**Resume generation**
`client → POST /api/resume/generate → load GitHubProfile + form → Claude → Zod validate → persist draft → return`

**Fit score**
`client → POST /api/fit/score → deterministic coverage (lib) + Claude judgment → combine → persist → return`

**Interview answer**
`client → POST /api/interview/answer → store answer → Claude feedback → validate → persist → return per-answer feedback`

## 7. Security

- Supabase Auth sessions (httpOnly cookies); server verifies on every route handler.
- Secrets in Vercel env vars: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, GitHub OAuth secret. Never in client bundle.
- Service-role key used only server-side; client uses anon key + RLS.
- Input size caps on job text and interview answers.

## 8. Non-Functional Requirements

| NFR | Target (MVP) |
|-----|--------------|
| API latency (non-AI) | p95 < 400 ms |
| AI feature latency | p95 < 12 s (with streaming where useful) |
| Availability | 99% (best-effort MVP) |
| AI timeout | 30 s, 1 retry |
| Data deletion | full user purge within request |

## 9. Privacy & Compliance

- Consent screen before GitHub ingestion.
- "Delete my data" purges all user-keyed rows + storage objects.
- Privacy policy must disclose third-party LLM processing.

## 10. Observability

- Structured logs per AI call (feature, tokens, latency, retry, cost estimate).
- Error tracking (Sentry).
- Funnel analytics events for the core flow (PostHog or similar).
