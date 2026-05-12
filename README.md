# Cinematic Creator Tool

PAI-style cinematic video planning + generation app. Upload a script → review derived
brief → generate characters → lay out a storyboard → edit keyframes (with masking) →
generate per-scene video clips. Multi-device, BYO API keys, no audio (handled in your
video editor).

See `/Users/travisames/.claude/plans/wiggly-hopping-yao.md` for the full plan and
phased build order.

## Phase 0 — first-time setup

These are manual, one-time steps that need your accounts.

### 1. Create a Supabase project

1. Go to https://supabase.com → **New project**.
2. Region: closest to you. Save the database password somewhere safe.
3. Once provisioned, open **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Apply the schema

In the Supabase Dashboard → **SQL Editor** → paste the contents of
`supabase/migrations/0001_init.sql` and run. This creates all tables, indexes, RLS
policies, and triggers.

### 3. Create the storage bucket

In Supabase Dashboard → **Storage** → **New bucket**:
- Name: `project-assets`
- Public: **No** (private)

### 4. Configure auth

Supabase Dashboard → **Authentication → URL Configuration**:
- Site URL: `http://localhost:3000` for local; your Vercel URL for production.
- Redirect URLs: add `http://localhost:3000/auth/callback` and the production equivalent.

### 5. Create an Inngest account

1. Go to https://inngest.com → sign up (free tier is fine).
2. Create an app → copy the **Event Key** and **Signing Key**.

### 6. Generate the credentials encryption key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the output as `CREDENTIALS_ENCRYPTION_KEY` in `.env.local`. **Do not lose it** —
without it, encrypted API keys in `provider_credentials` cannot be decrypted.

### 7. Create `.env.local`

Copy `.env.local.example` → `.env.local` and fill in everything from steps 1, 5, and 6.

### 8. Run locally

In two terminals:

```bash
# terminal 1 — Next.js
npm run dev

# terminal 2 — Inngest dev server
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Visit http://localhost:3000 → sign in with magic link → land on Projects dashboard.

### 9. Add your AI provider keys

Settings → API Keys. Paste your Anthropic, Google AI Studio, and Kling keys. They're
encrypted with AES-256-GCM before being stored.

## Deploy to Vercel

1. Push this repo to GitHub.
2. https://vercel.com/new → import the repo.
3. Add all env vars from your `.env.local` to the Vercel project settings.
4. Set `NEXT_PUBLIC_SITE_URL` to your Vercel URL.
5. Update Supabase Auth redirect URLs to include the Vercel URL.
6. Connect Inngest to Vercel (https://www.inngest.com/docs/deploy/vercel).

## Architecture

- **Next.js 16** (App Router) on Vercel
- **Supabase** (Postgres + Storage + Auth + Realtime)
- **Inngest** for background jobs (image gen, video gen)
- **Anthropic Claude** Opus 4.7 (creative actions) + Sonnet 4.6 (routine)
- **Google AI Studio** — `gemini-3-pro-image` ONLY (Nano Banana Pro)
- **Kling** 2.6 + 3.0 multi-shot for video

No global chat. All AI actions are per-asset RPC.

## Project layout

```
app/                   # routes (App Router)
  (auth)/login         # magic-link login
  (auth)/auth/callback # supabase OAuth code exchange
  (app)/               # auth-guarded shell + nav
    page.tsx           # projects dashboard
    settings/keys      # BYO key management
  api/inngest          # Inngest webhook
components/            # UI building blocks
lib/
  supabase/            # server, client, proxy, service
  crypto/keys.ts       # AES-256-GCM for stored API keys
  inngest/             # job client + functions
  env.ts               # required env helpers
supabase/migrations/   # SQL migrations (apply manually in dashboard)
proxy.ts               # session refresh on every request
```
