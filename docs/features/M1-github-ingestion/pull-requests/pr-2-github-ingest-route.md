# PR-2: GitHub Ingest Route

## Summary

`POST /api/github/ingest` API route that orchestrates GitHub profile ingestion: authentication check, cache lookup (7-day TTL), fresh ingestion via `lib/github/ingest.ts`, and Supabase upsert. Handles rate limit errors with `retry_after` header.

## Changes

### Step 3 — Ingest API Route

- `app/api/github/ingest/route.ts` — `POST` handler:
  1. `getUser()` → 401 if not authenticated
  2. `getSession()` → 401 if `provider_token` is absent
  3. Cache check via `getGitHubProfile()` — return stored profile if `fetched_at` < 7 days
  4. `ingest(providerToken)` → `upsertGitHubProfile()` → return `{ profile }`
  5. `GitHubRateLimitError` → 429 + `retry_after`; any other error → 500

### Step 9 — Tests

- `app/api/github/ingest/route.test.ts` — 8 integration tests:
  - 401 when user not authenticated
  - 401 when provider token missing
  - 401 when session is null
  - Cache hit (within 7 days) — skips ingestion
  - Stale cache (older than 7 days) — re-ingests
  - Happy path — asserts `ingest` + `upsert` called with correct args
  - Rate limit error → 429 with `retry_after`
  - Unexpected error → 500

### Type System Fix

- `lib/db/client.ts` — Exported `TypedSupabaseClient` type derived from `createSupabaseServerClient` return type
- `lib/db/github.ts` — Switched from `SupabaseClient<Database>` to `TypedSupabaseClient` to match factory's exact generic instantiation
- `lib/db/resume.ts` — Same type switch for consistency

**Rationale:** `createSupabaseServerClient()` returns `SupabaseClient<Database, "public", Schema>` (3 params fully bound), but the helpers previously declared `SupabaseClient<Database>` (defaults unresolved). This caused type mismatches when passing the client to DB helpers.

## Testing Evidence

```bash
$ pnpm test
Test Files  5 passed (5)
     Tests  39 passed (39)
  Duration  831ms
```

```bash
$ pnpm typecheck
✅ No TypeScript errors
```

## Merge Gate Verification

- ✅ Unit tests pass (`pnpm test` green)
- ✅ `pnpm typecheck` green
- ✅ Route follows spec §8: 7-day cache TTL, 429 on rate limit with `retry_after`
- ✅ Uses `lib/github/ingest.ts` from PR-1 (no duplication)
- ✅ Token stored as-is for MVP (encryption deferred to M4 hardening per spec)

## Dependencies

- PR-1 (Library Foundation) — required for `lib/github/ingest.ts`, `lib/db/github.ts`, and type definitions

## Dependent PRs

- PR-4 (Dashboard UI) — will call this route to trigger and display GitHub profile data
