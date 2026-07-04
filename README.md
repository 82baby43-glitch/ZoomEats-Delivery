# ZoomEats

Production food delivery platform built with **Next.js** (Vercel) and **Supabase** (Auth, Database, Storage, Edge Functions).

## Stack

- **Frontend**: Next.js 15 App Router on Vercel
- **Auth**: Supabase Google OAuth → `/auth/callback`
- **Database**: Supabase Postgres with RLS
- **API**: Supabase Edge Function `api` (replaces legacy FastAPI backend)
- **Realtime**: Supabase Realtime + polling fallback

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ADMIN_EMAILS=admin@example.com
```

Edge Function secrets (set via `supabase secrets set`):

```env
STRIPE_API_KEY=
STRIPE_WEBHOOK_SECRET=
ANTHROPIC_API_KEY=
ADMIN_EMAILS=
```

## Local Development

```bash
npm install
cp .env.example .env.local   # add your Supabase URL + anon key
npm run check:supabase         # verify connection
npm run dev
```

Auth callback URLs:
- Production: `https://zoom-eats-delivery.vercel.app/auth/callback`
- Local: `http://localhost:3000/auth/callback`

## Deploy

1. Push to Vercel (auto-deploys Next.js)
2. Enable Google OAuth: Supabase Dashboard → Auth → Providers → Google (or `npm run auth:google`)
   - Google Cloud redirect URI: `https://njrrhckegbfqhwkqkzvw.supabase.co/auth/v1/callback`
3. Apply RLS migration: `npm run db:migrate` (needs `SUPABASE_ACCESS_TOKEN` or `DATABASE_URL` in `.env.local`)
4. Deploy Edge Functions:
   ```bash
   supabase functions deploy api
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy dispatch-order --no-verify-jwt
   supabase functions deploy reconcile-payments --no-verify-jwt
   ```
   Or rely on `verify_jwt = false` in `supabase/config.toml` and run `supabase functions deploy`.
5. **Stripe webhook** — Stripe Dashboard → Developers → Webhooks → Add endpoint:
   - **URL:** `{SUPABASE_URL}/functions/v1/stripe-webhook` (from Supabase Dashboard → Settings → API)
   - **Events:** `checkout.session.created`, `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Copy the **Signing secret** (`whsec_...`) → `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
   - Also set on Vercel if using `/api/stripe/webhook` as a fallback
6. Apply migrations: `20260704_stripe_idempotency.sql` and `20260705_payment_production.sql`
7. Schedule reconciliation: POST `/api/admin/reconcile` every 5–10 min (set `RECONCILE_CRON_SECRET`)
