# AGENTS.md

## Cursor Cloud specific instructions

ZoomEats is a **Next.js 15 (App Router)** frontend backed by a **hosted Supabase**
project (Auth, Postgres, Edge Functions). There is no local backend server to run —
all data access goes through Supabase.

### Required environment variables
The app does not run without these. Set them as Cursor **Secrets** so they are
injected into future VMs (the dev/build commands also read a local `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser/client)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `NEXT_PUBLIC_ADMIN_EMAILS` (comma-separated admin emails)

Non-obvious: the browser never calls Supabase directly for app data. Every data
request goes to the Next.js route `app/api/backend/route.ts` → `lib/server/apiHandler.ts`,
which uses the **service role key**. So if `SUPABASE_SERVICE_ROLE_KEY` is missing,
the landing page renders but shows "No restaurants" (the API returns 500). The anon
key alone is not enough.

### Run / build / verify
- Dev server: `npm run dev` (http://localhost:3000).
- Build (also type-checks): `npm run build`.
- Connectivity check: `npm run check:supabase`. The `Edge Function 'api'` line may
  report a non-2xx status — that is expected and harmless; the app uses `/api/backend`,
  not the deployed edge function.

### Lint is not configured
`npm run lint` (`next lint`) prompts interactively to create an ESLint config because
none is committed, and CI (`.github/workflows/node.js.yml`) only runs `npm run build`.
Do not rely on `npm run lint`; treat `npm run build` as the gating check.

### Auth & testable flows
Login is **Google OAuth only** (`signInWithGoogle`), so authenticated flows
(placing orders, checkout, admin/vendor/delivery dashboards) cannot be exercised
headlessly without a real Google account — log in via the browser to test them.
The public flow works without auth: browse/search restaurants, open a restaurant,
and add items to the cart (cart is client-side `localStorage`).

### Database schema
The base schema lives in the hosted Supabase project. The repo's
`supabase/migrations/*` only `ALTER`/add policies to pre-existing tables (no
`CREATE TABLE`), so spinning up a from-scratch local Supabase is not supported
out of the box. Develop against the hosted project.
