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
| `api` | Main API router — replaces FastAPI `/api/*` routes |
| `dispatch-order` | Autonomous driver assignment on paid orders |

## Deployment

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy api --no-verify-jwt
supabase functions deploy dispatch-order --no-verify-jwt
```

### Secrets

```bash
supabase secrets set STRIPE_API_KEY=sk_live_...
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ADMIN_EMAILS=admin@zoomeats.com
```

### Migrations

Apply in order via Supabase SQL Editor:
1. `migrations/20260101_realtime.sql`
2. `migrations/20260101_dispatch_trigger.sql`
3. `migrations/20260201_rls.sql`
4. `migrations/20260628_supabase_auth_rls.sql`
