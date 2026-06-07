# M0 External Setup Guide

Follow these steps after the code scaffold is committed.

---

## 1. Install dependencies

```bash
pnpm install
```

---

## 2. Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Note your **Project URL** and **Publishable key** (also called anon key) from _Settings → API_.
3. Note the **service role key** (keep secret — never commit).
4. Note your **project ref** (short ID in the URL, e.g. `abcdefghijklmnop`).

### Apply migrations to the hosted project

```bash
# One-time: link to your Supabase project
supabase link --project-ref <YOUR_PROJECT_REF>

# Push migrations
supabase db push
```

### Enable GitHub OAuth in Supabase Auth

1. Go to _Authentication → Providers_ tab (not "Third-Party Auth").
2. Find **GitHub** in the list → toggle **Enabled**.
3. Paste the **Client ID** and **Client Secret** from step 3 below.
4. Copy the **Callback URL** shown (it looks like `https://<ref>.supabase.co/auth/v1/callback`) — you'll need it for GitHub.

### Configure Supabase URL settings

1. Go to _Authentication → URL Configuration_.
2. Set **Site URL** to your production domain (e.g. `https://jobmatcher-two.vercel.app`).
3. Under **Redirect URLs**, add:
   - `https://<your-vercel-domain>/auth/callback`
   - `http://localhost:3000/auth/callback` (for local dev)

> **Why this matters:** Supabase enforces an allowlist of redirect URLs as a security measure. If `redirectTo` in the app isn't in this list, Supabase falls back to the Site URL and ignores the requested redirect.

---

## 3. Create a GitHub OAuth App

1. Go to [https://github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**.
2. Fill in:
   - **Application name**: `JobMatcher` (or any name)
   - **Homepage URL**: `http://localhost:3000` (update to prod URL later)
   - **Authorization callback URL**: the Supabase callback URL from step 2.3
3. Click **Register application**.
4. On the next screen, note the **Client ID**.
5. Click **Generate a new client secret** and note the **Client Secret**.

---

## 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
GITHUB_OAUTH_CLIENT_ID=<github-client-id>
GITHUB_OAUTH_CLIENT_SECRET=<github-client-secret>
ANTHROPIC_API_KEY=<your-anthropic-key>
APP_URL=http://localhost:3000
```

---

## 5. Run locally

```bash
pnpm dev
# → http://localhost:3000
```

Test the login flow: click _Continue with GitHub_ → authorize → should redirect to `/dashboard`.

---

## 6. Connect Vercel

1. Push all code to GitHub **before** importing to Vercel (Vercel detects the framework from the repo contents).
2. Go to [https://vercel.com/new](https://vercel.com/new) → import this GitHub repo.
3. Framework preset: **Next.js** (auto-detected). If it shows "Other", set it manually under _Settings → Build and Deployment_.
4. Leave **Root Directory** empty.
5. Add all env vars from `.env.local` under _Settings → Environment Variables_ — set `APP_URL` to your Vercel domain.
6. Deploy.

> **Note:** If framework is not detected, go to _Settings → Build and Deployment_ → set Framework Preset to **Next.js** → save → redeploy.

---

## 7. Add GitHub Actions secrets

In your GitHub repo → _Settings → Secrets and variables → Actions_, add:

| Secret                          | Value                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL                                                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key (anon key)                                                                 |
| `SUPABASE_ACCESS_TOKEN`         | From [https://supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD`          | Your Supabase database password (set during project creation)                                       |
| `APP_URL`                       | Your production Vercel URL                                                                          |

---

## 8. M0 exit criteria verification

- [ ] `pnpm dev` runs without errors
- [ ] Login with GitHub works end-to-end → `/dashboard` loads
- [ ] `pnpm test` passes (unit tests green)
- [ ] `pnpm build` succeeds
- [ ] CI workflow passes on a PR
- [ ] `supabase db push` applies migrations without errors
- [ ] Vercel preview deploy works on a PR
