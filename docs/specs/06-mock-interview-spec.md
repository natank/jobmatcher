# Mock Interview Spec

> Feature: text-based AI interview using job description + candidate's GitHub context.

## 1. Goal

Run a focused, codebase-aware text interview that asks questions grounded in both the target job and the candidate's real repos.

## 2. Session Config (MVP)

- **Fixed 5 questions** per session.
- Question mix: 2 technical (from GitHub projects), 2 job-requirement, 1 behavioral.
- Text-only (voice deferred to v2.0).

## 3. Inputs

- `JobPosting`, `GitHubProfile` (top repos), latest `Resume`.

## 4. Question Generation

- System prompt `prompts/interview_questions.md` generates all 5 up front (consistent, ordered) OR adaptively one-by-one (MVP: generate up front for simplicity + cost).
- Technical questions must reference a specific repo/project by name.

## 5. Data Model

```json
// interview_sessions
{
  "id": "uuid",
  "user_id": "uuid",
  "job_id": "uuid",
  "status": "active|completed|abandoned",
  "questions": [{ "index": 0, "text": "string", "type": "technical|job|behavioral", "repo_ref": "string|null" }],
  "started_at": "ISO-8601",
  "completed_at": "ISO-8601|null"
}

// answers
{
  "id": "uuid",
  "session_id": "uuid",
  "question_index": 0,
  "answer_text": "string",
  "feedback": { /* see Interview Feedback Spec */ }
}
```

## 6. Flow

1. User starts interview for a job → session created, 5 questions generated.
2. UI presents one question at a time.
3. User submits answer → backend calls feedback scoring (see Feedback Spec), stores `answer` + per-answer feedback.
4. After Q5 → session `completed`, generate summary report.

## 7. State & Edge Cases

- **Abandoned sessions**: if inactive > 30 min, mark `abandoned`; partial answers retained, no summary.
- **Free tier**: 1 completed session / month (enforced at session creation).
- **Resume context** keeps interview consistent with what the candidate claimed.

## 8. Constraints

- Answer length cap (e.g., 4 KB) to bound token cost.
- Claude temperature ~0.5 for questions, ≤0.3 for scoring.
