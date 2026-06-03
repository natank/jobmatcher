# GitHub Ingestion Spec

> Feature: extract structured contribution signals from a user's GitHub account.

## 1. Goal

Turn a connected GitHub account into a structured, AI-ready profile of real technical contributions used by the Resume Generator and Mock Interview.

## 2. Scope (MVP)

- **In:** public repos owned by the user, languages, commit activity, READMEs, topics, stars.
- **Out:** private repos, org-owned repos the user didn't author, PR review history, CI logs.

## 3. OAuth & Permissions

- Provider: **Supabase Auth → GitHub OAuth**.
- Scopes (MVP): `read:user`, `user:email`, `public_repo` (public read).
- Store the provider access token in `github_profiles.access_token` (encrypted); never expose to client.

## 4. Data Fetched

| Source | GitHub API | Fields used |
|--------|-----------|-------------|
| User | `GET /user` | login, name, avatar, bio, public_repos |
| Repos | `GET /user/repos?type=owner&sort=pushed&per_page=100` | name, description, language, languages_url, stargazers_count, topics, fork, pushed_at, html_url |
| Languages | `GET /repos/{owner}/{repo}/languages` | bytes per language |
| Commits | `GET /repos/{owner}/{repo}/commits?author={login}&per_page=100` | count, dates, messages (first line only) |
| README | `GET /repos/{owner}/{repo}/readme` | decoded text (truncated to 4 KB) |

## 5. Filtering Rules

- Exclude `fork: true` repos unless the user has commits authored by their email.
- Exclude repos with 0 commits authored by the user.
- Authorship match: commit `author.login == user.login` OR commit email ∈ user's verified emails.
- Cap: top **20 repos** by `signal_score` for ingestion to control cost.

## 6. Signal Scoring (per repo)

```
signal_score =
    0.30 * recency_factor    // exp decay on pushed_at (half-life 180 days)
  + 0.25 * commit_volume     // log-scaled authored commit count
  + 0.20 * language_weight   // bytes in user's target languages
  + 0.15 * readme_quality    // length + headings + code blocks present
  + 0.10 * popularity        // log-scaled stars
```

Used to rank repos and to weight resume bullet generation.

## 7. Output Contract (`GitHubProfile`)

```json
{
  "login": "string",
  "name": "string",
  "fetched_at": "ISO-8601",
  "languages": [{ "name": "TypeScript", "bytes": 120345, "percent": 42.1 }],
  "repos": [{
    "name": "string",
    "url": "string",
    "description": "string|null",
    "primary_language": "string|null",
    "languages": [{ "name": "string", "percent": 0 }],
    "stars": 0,
    "topics": ["string"],
    "authored_commits": 0,
    "first_commit_at": "ISO-8601",
    "last_commit_at": "ISO-8601",
    "readme_excerpt": "string",
    "signal_score": 0.0
  }]
}
```

## 8. Caching & Rate Limits

- GitHub REST limit: 5,000 req/hr/token. Use conditional requests (`ETag`) and per-repo concurrency ≤ 5.
- Cache full `GitHubProfile` in DB; re-ingest only on manual refresh or if `fetched_at` > 7 days.

## 9. Edge Cases

- **No public repos** → prompt user to make a repo public or use manual entry (post-MVP).
- **Huge accounts** → hard cap of 100 repos scanned, 20 ingested.
- **Rate-limited** → queue + exponential backoff, surface "still importing" state.
- **Revoked token** → mark profile stale, re-trigger OAuth.

## 10. Privacy

- Explicit consent screen before first ingestion.
- README/commit text stored is user's own public content.
- Support full deletion of `github_profiles` row on account deletion.
