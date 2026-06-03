# Interview Feedback Spec

> Feature: per-answer scoring + end-of-session summary report.

## 1. Goal

Give actionable feedback on each answer (relevance, depth, clarity) and a session summary with strengths, gaps, and improvements.

## 2. Per-Answer Scoring

Three dimensions, each scored **1–5** with anchors:

| Dimension | 1 | 3 | 5 |
|-----------|---|---|---|
| Relevance | Off-topic | Partially addresses question | Directly answers, on point |
| Depth | Surface-level | Some specifics/examples | Concrete, technical, evidence-backed |
| Clarity | Hard to follow | Understandable | Crisp, well-structured |

`overall = round(mean(relevance, depth, clarity))`.

## 3. Inputs

- Question (text, type, `repo_ref`), candidate answer, job + GitHub context.

## 4. Scoring Flow

1. Call Claude `prompts/interview_feedback.md` with the question, answer, and context.
2. Require structured JSON output.
3. Validate; store on the `answers.feedback` field.

## 5. Per-Answer Output Contract

```json
{
  "relevance": 4,
  "depth": 3,
  "clarity": 5,
  "overall": 4,
  "strengths": ["string"],
  "improvements": ["string"],
  "model_answer_hint": "string (1-2 sentences, no full rewrite)"
}
```

## 6. Session Summary Report

Generated after Q5:

```json
{
  "session_id": "uuid",
  "avg_relevance": 0.0,
  "avg_depth": 0.0,
  "avg_clarity": 0.0,
  "overall_score": 4,
  "top_strengths": ["string"],
  "key_gaps": ["string"],
  "recommended_actions": ["string"],
  "readiness": "low|moderate|high"
}
```

## 7. Rules

- Feedback must be specific and reference the answer content; no generic boilerplate.
- `model_answer_hint` gives direction, not a full answer to copy.
- Temperature ≤ 0.3 for consistency.

## 8. Edge Cases

- Empty/very short answer → relevance/depth capped at 2, prompt user to elaborate.
- Abandoned session → no summary generated; per-answer feedback retained.
