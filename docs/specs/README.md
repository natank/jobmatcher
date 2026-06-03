# JobMatcher Feature Specs

Specs for each MVP module from `prd.md`. Each is injected as AI context per its feature (see PRD §6).

| # | Spec | Module | Status |
|---|------|--------|--------|
| 01 | [GitHub Ingestion](01-github-ingestion-spec.md) | GitHub Ingestion | Draft |
| 02 | [Resume Generator](02-resume-generator-spec.md) | Resume Generator + Schema | Draft |
| 03 | [Job Ingestion](03-job-ingestion-spec.md) | Job Ingestion | Draft |
| 04 | [Fit Score](04-fit-score-spec.md) | Fit Score | Draft |
| 05 | [Resume Tailoring](05-resume-tailoring-spec.md) | Resume Tailoring | Draft |
| 06 | [Mock Interview](06-mock-interview-spec.md) | Mock Interview | Draft |
| 07 | [Interview Feedback](07-interview-feedback-spec.md) | Interview Feedback | Draft |

## Data flow

```
GitHub OAuth → GitHub Ingestion → GitHubProfile
                                      │
        user context form ───────────┤
                                      ▼
                              Resume Generator → Resume
                                      │
Job URL/text → Job Ingestion → JobPosting
                                      │
              Resume + JobPosting → Fit Score → FitResult
                                      │
        Resume + Job + FitResult → Resume Tailoring → Tailored Resume
                                      │
   Job + GitHubProfile + Resume → Mock Interview → answers
                                      │
                         answers → Interview Feedback → Summary Report
```
