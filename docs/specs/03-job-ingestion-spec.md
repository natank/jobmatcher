# Job Ingestion Spec

> Feature: parse a pasted job URL or description into structured requirements.

## 1. Goal

Convert raw job text/URL into a normalized `JobPosting` used by Fit Score and Resume Tailoring.

## 2. Inputs

- Pasted **plain text** job description, OR
- Job **URL** (server fetches HTML, extracts main content).

## 3. URL Handling (MVP)

- Fetch with timeout 8s, follow ≤ 3 redirects.
- Extract readable content (Readability-style main-content extraction).
- If fetch blocked (login wall, JS-only), prompt user to paste text instead.
- No headless browser in MVP (cost/complexity); pure HTTP + HTML parse.

## 4. Parsing Flow

1. Normalize input to clean text (strip nav/boilerplate).
2. Call Claude with `prompts/job_parse.md` → structured JSON.
3. Validate against `JobPosting` schema.
4. Persist to `jobs` table.

## 5. Output Contract (`JobPosting`)

```json
{
  "id": "uuid",
  "source": "url|text",
  "source_url": "string|null",
  "title": "string",
  "company": "string|null",
  "seniority": "junior|mid|senior|lead|unknown",
  "required_skills": ["string"],
  "preferred_skills": ["string"],
  "responsibilities": ["string"],
  "keywords": ["string"],
  "raw_text": "string (truncated 12 KB)"
}
```

## 6. Normalization Rules

- Skills lowercased + canonicalized via a synonym map (`js`→`javascript`, `reactjs`→`react`).
- Distinguish required vs preferred by section/verb cues ("must", "required" vs "nice to have").
- Dedup keywords; cap each list at 30 items.

## 7. Edge Cases

- Non-job text → low-confidence flag, ask user to confirm.
- Very long postings → truncate `raw_text`, keep parsed structure full.
- Non-English (MVP) → reject with message (English-only).
