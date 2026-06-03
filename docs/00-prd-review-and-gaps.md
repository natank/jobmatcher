# PRD Review & Gap Analysis

> Reviews `prd.md` v0.1 and identifies gaps to resolve before build.

## 1. Summary

The PRD is well-scoped for an MVP with a clear differentiator (GitHub-grounded resume + codebase-aware interview). Feature priorities, personas, and the core user flow are coherent. The main risks are **legal/privacy around GitHub data**, **AI cost/latency control**, and several **undefined data contracts** between modules.

## 2. Strengths

- **Clear differentiation** — resume from real code, interview that knows the codebase.
- **Tight MVP scope** with explicit out-of-scope and a phased roadmap (v1.1, v2.0).
- **Architecture direction is decided** (Next.js, Supabase, Claude), reducing decision overhead.
- **AI context strategy** is defined up front (spec docs injected as system context).

## 3. Gaps & Open Issues

### 3.1 Product / Scope
- **No success metrics / KPIs.** No activation, conversion, or retention targets. Add North Star metric (e.g., "resume generated + 1 interview completed in first session").
- **No analytics/event taxonomy.** Needed to measure the funnel in the core flow.
- **Free-tier abuse path** undefined (AI cost per free user, rate limits).
- **Resume editing fidelity** — flow says "user reviews and edits" but no editor spec (rich text? structured fields?).

### 3.2 GitHub Ingestion
- **Private repo decision unresolved** (Open Question #1). Drives OAuth scopes and privacy policy. Recommendation: **public-only for MVP**, opt-in private later.
- **Rate limits** — GitHub REST API 5,000 req/hr/token; no strategy for large accounts. Need pagination + caching + selective fetch.
- **Signal extraction logic undefined** — what makes a "contribution signal"? Need ranking (commit volume, recency, language %, README quality, stars).
- **Monorepo / forks / org repos** — how are forks and non-authored commits filtered? Need author-email matching.

### 3.3 Resume Generation
- **Resume schema not defined** (the spec doc is only "planned"). Blocks generation + tailoring + export.
- **Hallucination control** — AI must not invent experience. Need grounding rules + "evidence" linking each claim to a repo/commit.
- **PDF vs DOCX** export unresolved (Open Question #2). Recommendation: **PDF for MVP**.

### 3.4 Fit Score
- **Algorithm undefined** — is the 1–5 score AI-judged, rule-based, or hybrid? Need a deterministic rubric to keep scores stable/explainable.
- **Gap analysis output format** unspecified.

### 3.5 Mock Interview & Feedback
- **Session length unresolved** (Open Question #3). Recommendation: **fixed 5 questions for MVP**.
- **Scoring rubric** (relevance, depth, clarity) needs concrete 1–5 anchors.
- **Abandoned sessions** — how are partial sessions stored/scored?

### 3.6 Technical / NFRs
- **No non-functional requirements** — latency targets, availability, AI timeout/retry, max input sizes.
- **Secrets & key management** — Claude key, GitHub OAuth secret, Supabase service role: storage + rotation undefined.
- **Cost controls** — no token budget per request, no model fallback strategy.
- **Data retention / deletion** — GDPR-style "delete my data" not addressed; GitHub data is personal data.
- **Auth model** — PRD lists both NextAuth and Passport.js; must pick one. Recommendation: **Supabase Auth with GitHub provider** (single source of truth, aligns with chosen DB).

### 3.7 Legal / Compliance
- **GitHub ToS / data usage** — storing repo content and feeding to a third-party LLM needs user consent + privacy policy.
- **PII handling** — resumes contain PII; define encryption at rest and access controls.

## 4. Recommended Resolutions (defaults to unblock MVP)

| Open Question | Recommended MVP Decision |
|---------------|--------------------------|
| Private repos | Public repos only; private opt-in post-MVP |
| Export format | PDF only |
| Interview length | Fixed 5 questions |
| Onboarding entry | GitHub-first; manual paste fallback post-MVP |
| Languages | English-only |
| Auth library | Supabase Auth (GitHub OAuth provider) |

## 5. Suggested Additions to PRD v0.2

- Success metrics & analytics event list.
- Non-functional requirements section (latency, availability, limits).
- Privacy, consent, and data-deletion section.
- AI cost & safety section (token budgets, grounding, fallback model).
- Confirmed answers to all Open Questions.
