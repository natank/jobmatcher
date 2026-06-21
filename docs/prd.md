# JobMatcher

## AI-Powered Job Search SaaS

### Product Requirements Document | v0.2

| Version | Status     | Owner | Date     |
| ------- | ---------- | ----- | -------- |
| v0.1    | Superseded | Natan | May 2026 |
| v0.2    | Active     | Natan | Jun 2026 |

---

## 1. Product Overview

JobMatcher is a SaaS platform that automates the end-to-end job search workflow. The core differentiator is a two-part AI pipeline: (1) GitHub-to-Resume generation that builds a technical resume from real code contributions, and (2) an interactive AI mock interview that understands the candidate's actual codebase — not generic templates.

### Problem Statement

- Job seekers spend 45+ minutes manually tailoring resumes per application
- Resume content is often disconnected from real technical contributions
- Mock interview tools use generic questions unrelated to the candidate's actual work
- No existing tool combines GitHub signal + resume generation + interview prep in one flow

### Value Proposition

- **Resume built from real code — not self-reported skills**
- **Mock interview that knows what you actually built**
- **Full pipeline: GitHub → Resume → Job Match → Interview Prep**

---

## 2. Target Users

### Primary Persona — Technical Job Seeker

- Software engineers, full-stack devs, ML engineers
- Has active GitHub profile with public/private repos
- Applying to 5–30 positions in a job search cycle
- Frustrated by generic resume advice and irrelevant interview prep

### Secondary Persona — Career Switcher

- Developer transitioning from one stack to another
- Wants GitHub activity to compensate for lack of formal experience
- Needs resume that highlights transferable technical skills

---

## 3. Core Features — MVP Scope

| Module             | Description                                                                    | Priority |
| ------------------ | ------------------------------------------------------------------------------ | -------- |
| GitHub Ingestion   | OAuth GitHub login, read repos/commits/languages, extract contribution signals | 🔴 MVP   |
| Resume Generator   | AI-built resume from GitHub data + user-provided context (role, experience)    | 🔴 MVP   |
| Job Ingestion      | Paste job URL or description text; AI parses requirements and keywords         | 🔴 MVP   |
| Fit Score          | 1–5 score matching resume signals to job requirements with gap analysis        | 🔴 MVP   |
| Resume Tailoring   | Auto-adapt resume sections to highlight relevant projects for each job         | 🔴 MVP   |
| Mock Interview     | Text-based AI interview using job description + candidate's GitHub context     | 🔴 MVP   |
| Interview Feedback | Per-answer scoring: relevance, depth, clarity. Summary report after session    | 🔴 MVP   |
| Job Tracker        | Dashboard to track applications, scores, and interview sessions                | 🟡 v1.1  |
| Company Scan       | Auto-scrape job boards for new openings matching user profile                  | 🟡 v1.1  |
| Voice Interview    | Upgrade text mock interview to voice-based interaction                         | 🔵 v2.0  |

---

## 4. Core User Flow (MVP)

1. User signs up → connects GitHub via OAuth
2. System reads repos, commits, languages, README files
3. User fills short form: target role, years of experience, preferred tech
4. AI generates base resume — user reviews and edits
5. User pastes job description → receives Fit Score + tailored resume version
6. User starts Mock Interview → AI generates questions from job + GitHub context
7. User types answers → receives real-time feedback per answer
8. Session ends → summary report with strengths, gaps, suggested improvements

---

## 5. Technical Architecture

### Frontend

- React + TypeScript + Tailwind CSS
- Vercel deployment
- Component library: shadcn/ui

### Backend

- Next.js 14 API routes (App Router route handlers + server actions)
- GitHub OAuth via **Supabase Auth (GitHub provider)** — locked in v0.2
- GitHub REST API v3 for repo/commit ingestion

### AI Layer

- Claude API (claude-sonnet-4) as primary AI engine
- Structured system prompts per feature (resume, interview, scoring)
- Engineering docs injected as context into each AI session
- Prompt versioning maintained in `/prompts` directory

### Data

- Supabase (PostgreSQL + Auth + Storage)
- Tables: `users`, `github_profiles`, `resumes`, `jobs`, `interview_sessions`, `answers`

---

## 6. AI Context Strategy

All AI features are powered by context-rich prompts. Engineering documents (this PRD and feature specs) are injected as system context. This ensures consistent, accurate outputs across all AI interactions.

### Context Documents (planned)

- `PRD_v0.1.md` (this document) — product overview and feature definitions
- `GitHub_Ingestion_Spec.md` — what data is extracted and how it is structured
- `Resume_Schema_Spec.md` — resume format, sections, field definitions
- `Interview_Engine_Spec.md` — question generation logic, scoring rubric
- `Fit_Score_Spec.md` — matching algorithm and scoring criteria

### Prompt Engineering Principles

- Each feature has a dedicated system prompt file in `/prompts`
- Prompts reference schema definitions from spec docs
- Context window managed: inject only relevant docs per feature call
- Outputs are structured JSON where downstream processing is required

---

## 7. Monetization Model

| Tier  | Features                                                        | Price     |
| ----- | --------------------------------------------------------------- | --------- |
| Free  | GitHub connect, 1 resume, 1 mock interview / month              | $0        |
| Pro   | Unlimited resumes, 10 interviews/month, fit scoring, export PDF | $15/month |
| Power | Unlimited everything, company scan, priority AI, API access     | $29/month |

---

## 8. Out of Scope — MVP

- Auto-submitting applications on behalf of the user
- Voice or video interview mode (planned v2.0)
- LinkedIn profile parsing or integration
- Company scraping / job board scanning (planned v1.1)
- Mobile native app

---

## 9. Locked Decisions (v0.2)

All open questions from v0.1 are resolved for MVP:

| Decision                 | Resolution                                                               | Deferred                    |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------- |
| GitHub repo access       | **Public repos only** (scopes: `read:user`, `user:email`, `public_repo`) | Private opt-in post-MVP     |
| Resume export format     | **PDF only** (server-rendered from schema)                               | DOCX in v1.1                |
| Interview session length | **Fixed 5 questions** (2 technical, 2 job-req, 1 behavioral)             | Variable length post-MVP    |
| Onboarding flow          | **GitHub-first**                                                         | Manual paste entry post-MVP |
| Language support         | **English-only**                                                         | Hebrew in v1.1              |
| Auth library             | **Supabase Auth with GitHub OAuth provider**                             | —                           |

---

## 10. Non-Functional Requirements

| NFR                   | MVP Target                       |
| --------------------- | -------------------------------- |
| API latency (non-AI)  | p95 < 400 ms                     |
| AI feature latency    | p95 < 12 s                       |
| Availability          | 99% (best-effort)                |
| AI timeout            | 30 s, 1 retry                    |
| Max job text input    | 12 KB                            |
| Max interview answer  | 4 KB                             |
| Token budget per call | Enforced per-feature (see specs) |
| Data deletion         | Full user purge within request   |

---

## 11. Privacy & Compliance

- Explicit consent screen before first GitHub ingestion.
- GitHub data (including README/commit text) is stored only as user's own public content.
- All user data encrypted at rest (Supabase default + `access_token` app-layer encryption).
- "Delete my data" purges all user-keyed rows and storage objects.
- Privacy policy must disclose third-party LLM (Anthropic) processing user content.
- English-only MVP eliminates immediate GDPR translation obligation.

---

## 12. Success Metrics (North Star)

**North Star**: % of new users who complete the full core flow (GitHub connect → resume generated → job pasted → interview completed) within first session.

| Metric                              | Target (90 days post-launch)         |
| ----------------------------------- | ------------------------------------ |
| Core flow completion rate           | ≥ 25% of signups                     |
| Resume generation success rate      | ≥ 90% (no schema validation failure) |
| Mock interview completion rate      | ≥ 60% of started sessions            |
| Free → Pro conversion               | ≥ 5%                                 |
| AI error rate (timeout/schema fail) | < 5%                                 |

---

## 13. AI Cost & Safety

- Single `lib/ai/client.ts` wrapper: enforces token budget, temperature, timeout, and 1 retry per call.
- Temperature: ≤ 0.2 for scoring/parsing; ~0.5 for question/resume generation.
- Grounding rules in resume prompts prevent hallucinated skills/metrics (evidence-linked schema).
- Per-user monthly usage counters enforce free-tier limits before any AI call.
- Model fallback to cheaper variant on non-critical calls (job parsing) if cost threshold exceeded.

---

## 14. Next Steps (v0.2)

Specs and architecture are complete (see `docs/`). Build order follows milestones in `docs/09-development-plan.md`:

1. **M0** — Bootstrap repo: Next.js 14 + Supabase + Auth + CI/CD (GitHub Actions) + Vercel
2. **M1** — GitHub ingestion → Resume generation + editor + PDF export
3. **M2** — Job ingestion → Fit score → Resume tailoring
4. **M3** — Mock interview → per-answer feedback → summary report
5. **M4** — Usage limits, cost controls, analytics, privacy/delete, observability
