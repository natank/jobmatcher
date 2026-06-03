# Resume Generator Spec

> Feature: AI-built resume from GitHub data + user context, with a strict schema.

## 1. Goal

Generate a structured, accurate resume grounded in real GitHub contributions and user-supplied context. Every technical claim must trace to evidence.

## 2. Inputs

- `GitHubProfile` (see GitHub Ingestion Spec).
- User context form: `target_role`, `years_experience`, `preferred_tech[]`, `seniority`, optional `summary_notes`.

## 3. Resume Schema (`Resume`)

```json
{
  "id": "uuid",
  "version": 1,
  "contact": { "name": "string", "email": "string", "github": "url", "location": "string|null" },
  "headline": "string",
  "summary": "string (<= 60 words)",
  "skills": [{ "name": "string", "evidence_repos": ["repo-name"] }],
  "projects": [{
    "name": "string",
    "repo_url": "string",
    "description": "string",
    "highlights": ["string"],
    "tech": ["string"],
    "evidence": { "repo": "string", "commits": 0, "stars": 0 }
  }],
  "experience": [{ "title": "string", "org": "string", "start": "string", "end": "string|null", "bullets": ["string"] }],
  "education": [{ "school": "string", "degree": "string", "year": "string|null" }]
}
```

> `experience` and `education` are user-entered (not fabricated). Projects/skills are AI-generated from GitHub evidence.

## 4. Grounding Rules (anti-hallucination)

- AI may only list skills/projects backed by `GitHubProfile` data or user input.
- Every `skill` must reference ≥ 1 `evidence_repos`.
- Every `project.highlight` must derive from repo description, README, topics, or commit signal — no invented metrics.
- If evidence is insufficient, omit rather than guess.

## 5. Generation Flow

1. Select top N repos by `signal_score` (default 6).
2. Build context block: profile summary + selected repos + user form.
3. Call Claude with system prompt `prompts/resume_generate.md`.
4. Validate output against `Resume` JSON schema; reject + retry once on failure.
5. Persist to `resumes` table (status `draft`).
6. Return to editor for user review/edit.

## 6. Output Quality Bar

- Summary ≤ 60 words, role-aligned.
- 3–6 projects, each with 2–3 highlights.
- Skills grouped, deduplicated, evidence-linked.
- No first-person fluff ("passionate", "hard-working") unless user-supplied.

## 7. Editing

- Structured editor: per-section fields (not freeform blob) to keep schema valid.
- Edits create a new `version`; original retained for diff/audit.

## 8. Export (MVP)

- **PDF only**, server-rendered from the structured schema (deterministic template).
- DOCX deferred to v1.1.

## 9. Errors

- Schema validation failure → one retry, then surface "regenerate" with partial draft.
- AI timeout → retry with reduced repo context (N=3).
