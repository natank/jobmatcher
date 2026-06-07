in this conversation we will be creating a youtube playlist for the foundation video tutorial.
the foundation will be based on the M0-Setup-Guide.md file. (ref 1)

## Applicable documents

1. M0-Setup-Guide.md: `docs/features/M0/M0-Setup-Guide.md`
2. youtube video creation workflow: `/Users/nati-home/Projects/LLM-CODING-COURSE/docs/youtube/youtube-video-workflow.md`

## Playlist structure

**Playlist title:** "Build a Full-Stack AI SaaS from Scratch — Foundation Setup"
**Format:** Track B — New videos, 3–5 min each, 16:9
**Target viewer:** Developer who wants to ship a production-ready Next.js + Supabase app

---

### Video 1 — The Stack & Scaffold Tour

**Hook:** "Most developers spend a week on boilerplate. Here's how to skip it."
**Value:** Tour the scaffold — Next.js 14 App Router, Supabase, GitHub OAuth, CI/CD, Vercel. Show what's already wired up and why each piece exists.
**CTA:** Subscribe + watch next video to go live.
**Source:** Codebase walkthrough (screen recording)
**Estimated length:** 4 min

---

### Video 2 — Supabase: Create Project, Push Migrations & Enable GitHub OAuth

**Hook:** "One command deploys your entire database schema to production."
**Value:** Create Supabase project → install CLI → `supabase link` + `supabase db push` → enable GitHub OAuth provider → configure redirect URL allowlist (and why it matters).
**CTA:** "Next video: create the GitHub OAuth App."
**Source:** Screen recording of Supabase dashboard + terminal
**Estimated length:** 4 min
**Covers:** M0-Setup-Guide §2

---

### Video 3 — GitHub OAuth App in 3 Minutes

**Hook:** "Your users will log in with GitHub — here's the 3-minute setup."
**Value:** Create OAuth App on GitHub → set callback URL to Supabase → copy Client ID & Secret.
**CTA:** "Next: wire it all together with environment variables."
**Source:** Screen recording of GitHub settings
**Estimated length:** 3 min
**Covers:** M0-Setup-Guide §3

---

### Video 4 — Environment Variables & Local Auth Flow

**Hook:** "If your auth redirects to localhost in production, watch this."
**Value:** Copy `.env.example` → fill in all keys → `pnpm dev` → test GitHub login end-to-end → explain the `APP_URL` + Supabase redirect allowlist pitfall.
**CTA:** "Next: deploy to Vercel."
**Source:** Screen recording of terminal + browser
**Estimated length:** 4 min
**Covers:** M0-Setup-Guide §4–5

---

### Video 5 — Deploy to Vercel (Avoid the Gotchas)

**Hook:** "Vercel says 'No Next.js detected' — here's why and how to fix it."
**Value:** Push code to GitHub first → import to Vercel → set Framework Preset to Next.js → add env vars for Production → redeploy → update Supabase Site URL → verify production login works.
**CTA:** "Last step: set up CI/CD secrets so your pipeline runs automatically."
**Source:** Screen recording of Vercel + Supabase dashboards
**Estimated length:** 5 min
**Covers:** M0-Setup-Guide §6

---

### Video 6 — GitHub Actions CI/CD Secrets

**Hook:** "Your CI pipeline will silently fail without these 5 secrets."
**Value:** Add all required secrets to GitHub repo → walk through what each CI workflow does (lint, test, migrate).
**CTA:** Subscribe — next series covers building the AI features.
**Source:** Screen recording of GitHub Settings + workflow files
**Estimated length:** 3 min
**Covers:** M0-Setup-Guide §7

---

## Production notes

- Each video follows the 3-act structure: Hook (0–10s) → Value → CTA (last 10–15s)
- No lesson number references — titles must work as standalone search queries
- Thumbnail concept: terminal/dashboard screenshot with bold text overlay
- All videos go into one playlist in order
