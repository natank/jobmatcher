# Resume Tailoring Spec

> Feature: adapt a base resume to highlight relevant work for a specific job.

## 1. Goal

Produce a job-specific resume variant that reorders/rephrases existing content to surface the most relevant projects and skills — **without inventing new claims**.

## 2. Inputs

- Base `Resume` (latest version).
- `JobPosting`.
- `FitResult` (matched/missing skills, gaps).

## 3. Allowed Transformations

- Reorder `projects` and `skills` by relevance to the job.
- Rephrase `summary` and project `highlights` to use job keywords **only where truthful**.
- Emphasize matched skills; surface evidence repos relevant to the role.
- Suggest (not auto-add) ways to address `missing_required` gaps.

## 4. Forbidden

- Adding skills/projects not in the base resume.
- Inflating metrics or fabricating responsibilities.
- Changing `experience`/`education` facts.

## 5. Flow

1. Load base resume + job + fit result.
2. Call Claude `prompts/resume_tailor.md` with grounding rules.
3. Validate output against `Resume` schema.
4. Persist as a tailored variant linked to `job_id` (does not overwrite base).

## 6. Output Contract

- A `Resume` object (same schema) plus:

```json
{
  "tailored_from_resume_id": "uuid",
  "job_id": "uuid",
  "changes": [{ "field": "projects.order", "reason": "moved GraphQL API project to top (matches required skill)" }]
}
```

`changes[]` gives the user a transparent diff of what was tailored and why.

## 7. UX

- Side-by-side base vs tailored view.
- One-click "accept" → becomes exportable; user can still edit fields.
