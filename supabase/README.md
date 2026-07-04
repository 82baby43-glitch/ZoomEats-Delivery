# ZoomEats — Supabase Backend

All backend logic runs on Supabase. No external Python or Node servers.

## Architecture

```
Next.js (Vercel)  ──▶  Supabase Auth (Google OAuth)
       │
       ├──▶  Supabase Client (direct queries + RLS)
       │
       └──▶  Edge Function `api` (orders, checkout, admin, chat)
                    │
                    ▼
              Supabase Postgres

INSERT INTO orders (paid)  ──▶  pg_trigger  ──▶  Edge Function `dispatch-order`
```

## Edge Functions

| Function | Purpose |
|----------|---------|
| `api` | Main API router — checkout, orders, admin, chat |
| `stripe-webhook` | Stripe `checkout.session.completed` → mark order paid |
| `dispatch-order` | Driver assignment on paid orders |
| `reconcile-payments` | Optional cron reconciliation (disabled in rollback mode) |

## Stripe → Supabase

Edge functions read Stripe from **Supabase secrets** (not committed to git).

### One-command setup

```bash
# From .env.local or exported vars:
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_WEBHOOK_SECRET=whsec_...      # Stripe Dashboard → Webhooks
export STRIPE_PUBLISHABLE_KEY=pk_test_...   # optional

npm run stripe:supabase
```

This sets all secret aliases and deploys `api`, `stripe-webhook`, `dispatch-order`, `reconcile-payments`.

### Secret names (any alias works)

| Secret | Used by |
|--------|---------|
| `STRIPE_API_KEY` / `STRIPE_SECRET_KEY` / `Stripe_Secret_Key` | `api` checkout |
| `STRIPE_WEBHOOK_SECRET` / `Stripe_Webhook_Secret` | `stripe-webhook` |
| `STRIPE_PUBLISHABLE_KEY` | optional (redirect checkout does not require it) |

### Stripe webhook URL

```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Events: `checkout.session.completed`

## Deployment

```bash
supabase login
supabase link --project-ref njrrhckegbfqhwkqkzvw
npm run stripe:supabase
```

### Other secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ADMIN_EMAILS=admin@zoomeats.com
```

### Migrations

Apply in order via Supabase SQL Editor:
1. `migrations/20260101_realtime.sql`
2. `migrations/20260101_dispatch_trigger.sql`
3. `migrations/20260201_rls.sql`
4. `migrations/20260628_supabase_auth_rls.sql`
