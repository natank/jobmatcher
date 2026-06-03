# Fit Score Spec

> Feature: 1–5 match score between a resume and a job, with gap analysis.

## 1. Goal

Produce an explainable, stable 1–5 fit score plus a gap analysis. Hybrid approach: **deterministic coverage math + AI qualitative judgment**, combined.

## 2. Inputs

- `Resume` (skills, projects, tech).
- `JobPosting` (required_skills, preferred_skills, keywords, seniority).

## 3. Deterministic Coverage (0–1)

```
required_coverage  = matched_required  / total_required
preferred_coverage = matched_preferred / total_preferred
seniority_match    = 1 if aligned, 0.5 if adjacent, 0 if far

coverage = 0.6*required_coverage + 0.25*preferred_coverage + 0.15*seniority_match
```

Matching uses the same canonicalized skill synonyms as Job Ingestion; a resume skill matches if present in skills or project tech.

## 4. AI Judgment (0–1)

- Claude (`prompts/fit_score.md`) assesses depth of evidence (commit volume, project relevance) beyond keyword presence.
- Returns `ai_quality` (0–1) + rationale.

## 5. Final Score

```
raw = 0.7*coverage + 0.3*ai_quality        // 0..1
score = clamp(round(1 + raw*4), 1, 5)      // 1..5
```

## 6. Output Contract (`FitResult`)

```json
{
  "score": 4,
  "coverage": 0.78,
  "ai_quality": 0.71,
  "matched_required": ["react", "typescript"],
  "missing_required": ["graphql"],
  "matched_preferred": ["docker"],
  "gaps": [{ "skill": "graphql", "severity": "high", "suggestion": "Add a project using GraphQL or note exposure" }],
  "rationale": "string"
}
```

## 7. Stability Requirements

- Deterministic part is fully reproducible (no AI variance).
- AI temperature ≤ 0.2 for scoring calls.
- Same inputs → score must not drift by more than ±0 (deterministic) / display rationale may vary.

## 8. Severity Rubric (gaps)

| Severity | Meaning |
|----------|---------|
| high | required skill missing |
| medium | preferred skill missing or weak evidence |
| low | nice-to-have / keyword only |
