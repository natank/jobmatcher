# Foundation

This document kicks off Milestone 0 (M0) of the JobMatcher project.

## Applicable documents

- PRD: prd.md
- Development plan: docs/09-development-plan.md

## Tasks

- [x] Create repository
- [x] Set up CI/CD — `.github/workflows/ci.yml` + `migrate.yml`
- [x] Set up Supabase — create project, run `supabase db push` (see M0-Setup-Guide.md §2)
- [x] Set up Auth — Supabase GitHub OAuth, middleware, login page, callback route
- [x] Set up environment variables — `.env.example` with all required keys
- [x] Set up Vercel — import repo, add env vars (see M0-Setup-Guide.md §6) → https://jobmatcher-two.vercel.app

## Scaffold completed

- `package.json`, `tsconfig.json`, `next.config.ts`, Tailwind, PostCSS, ESLint, Prettier, Husky
- App Router: `/`, `/login`, `/dashboard`, `/auth/callback`, `/api/health`
- `lib/db/client.ts` — Supabase server + admin clients
- `lib/auth/actions.ts` — signIn, signOut, getUser server actions
- `middleware.ts` — session-based route protection
- `types/database.ts` — full typed DB schema
- `supabase/migrations/20240101000000_initial_schema.sql` — all tables + RLS + auto-user trigger
- `supabase/config.toml` — local dev config with GitHub OAuth
- `vitest.config.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `lib/utils.test.ts`
- Placeholder dirs: `lib/github/`, `lib/ai/`, `lib/pdf/`, `prompts/`

## Next step

Run `pnpm install` then follow **M0-Setup-Guide.md** to wire up Supabase and Vercel.
