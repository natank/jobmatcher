# JobMatcher
## AI-Powered Job Search SaaS
### Product Requirements Document | v0.1

| Version | Status | Owner | Date |
|---------|--------|-------|------|
| v0.1 | Draft | Natan | May 2026 |

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

| Module | Description | Priority |
|--------|-------------|----------|
| GitHub Ingestion | OAuth GitHub login, read repos/commits/languages, extract contribution signals | 🔴 MVP |
| Resume Generator | AI-built resume from GitHub data + user-provided context (role, experience) | 🔴 MVP |
| Job Ingestion | Paste job URL or description text; AI parses requirements and keywords | 🔴 MVP |
| Fit Score | 1–5 score matching resume signals to job requirements with gap analysis | 🔴 MVP |
| Resume Tailoring | Auto-adapt resume sections to highlight relevant projects for each job | 🔴 MVP |
| Mock Interview | Text-based AI interview using job description + candidate's GitHub context | 🔴 MVP |
| Interview Feedback | Per-answer scoring: relevance, depth, clarity. Summary report after session | 🔴 MVP |
| Job Tracker | Dashboard to track applications, scores, and interview sessions | 🟡 v1.1 |
| Company Scan | Auto-scrape job boards for new openings matching user profile | 🟡 v1.1 |
| Voice Interview | Upgrade text mock interview to voice-based interaction | 🔵 v2.0 |

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
- Node.js + Express (or Next.js API routes)
- GitHub OAuth via Passport.js / NextAuth
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

| Tier | Features | Price |
|------|----------|-------|
| Free | GitHub connect, 1 resume, 1 mock interview / month | $0 |
| Pro | Unlimited resumes, 10 interviews/month, fit scoring, export PDF | $15/month |
| Power | Unlimited everything, company scan, priority AI, API access | $29/month |

---

## 8. Out of Scope — MVP

- Auto-submitting applications on behalf of the user
- Voice or video interview mode (planned v2.0)
- LinkedIn profile parsing or integration
- Company scraping / job board scanning (planned v1.1)
- Mobile native app

---

## 9. Open Questions

- GitHub private repos — do we request private access or public only?
- Resume export format — PDF only, or also DOCX?
- Interview session length — fixed number of questions or time-boxed?
- Onboarding flow — GitHub-first or allow manual resume upload as alternative entry?
- Multi-language support — English-only MVP or Hebrew from day one?

---

## 10. Next Steps

1. Write GitHub Ingestion Spec (data model, API scope, edge cases)
2. Write Resume Schema Spec (sections, fields, AI generation rules)
3. Write Interview Engine Spec (question types, scoring rubric)
4. Design Supabase schema based on above specs
5. Bootstrap Next.js project with GitHub OAuth
6. Build GitHub ingestion module + first resume generation prompt