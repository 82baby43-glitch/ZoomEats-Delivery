# ZoomEats Dispatch Layer — Supabase Deliverables

This folder contains the **Supabase-side artifacts** for the autonomous dispatch flow.
The actual dispatch engine (scoring, driver selection, Uber Direct call) lives **server-side** in the FastAPI backend at `/app/backend/dispatch.py`. These Supabase artifacts simply wire the Postgres `INSERT` event into a call to the backend.

## Architecture

```
INSERT INTO orders  ─▶  pg_trigger (after_order_insert)
                         │
                         ▼
                   pg_net.http_post  ─▶  Supabase Edge Function `dispatch-order`
                                                │
                                                ▼
                                         FastAPI  POST /api/dispatch/trigger/{order_id}
                                                │
                                                ▼
                                         dispatch.py runs scoring + assignment
                                                │
                            ┌───────────────────┴───────────────────┐
                            ▼                                       ▼
                   internal driver (assign)              Uber Direct (fallback)
                            │                                       │
                            └───────────────────┬───────────────────┘
                                                ▼
                                  UPDATE orders + INSERT deliveries
                                                │
                                                ▼
                                  Supabase Realtime broadcasts row changes
                                                │
                                                ▼
                       Customer / restaurant / driver dashboards update instantly
```

## Files

- **`functions/dispatch-order/index.ts`** — Edge Function that proxies the trigger payload to the FastAPI backend.
- **`migrations/20260101_dispatch_trigger.sql`** — Postgres trigger + helper that calls `pg_net.http_post`. Apply once in the Supabase SQL Editor.
- **`migrations/20260101_realtime.sql`** — Enables Supabase Realtime on the relevant tables (orders, deliveries, drivers).

## Deployment

### 1. Apply the migrations
Open Supabase Dashboard → SQL Editor and paste / run:
1. `migrations/20260101_realtime.sql`
2. `migrations/20260101_dispatch_trigger.sql`
3. `migrations/20260201_rls.sql` — enables Row Level Security on all public tables (deny-all for anon/authenticated). The backend connects as the table-owner `postgres` role and bypasses RLS, so SQLAlchemy queries continue to work. Frontend Realtime subscriptions will no longer broadcast row changes to anon — the 5-10s polling fallback already in `OrderDetail.jsx` and `VendorDashboard.jsx` keeps the UI live.

### 2. Deploy the Edge Function
```
cd /app/supabase
supabase login
supabase link --project-ref njrrhckegbfqhwkqkzvw
supabase functions deploy dispatch-order --no-verify-jwt
```

### 3. Set the secrets
```
supabase secrets set FASTAPI_BASE_URL=https://your-backend.example.com
supabase secrets set DISPATCH_TRIGGER_TOKEN=zoomeats_dispatch_change_me_in_prod
```
(Match `DISPATCH_TRIGGER_TOKEN` to `/app/backend/.env`.)

### 4. (Optional) Configure Uber Direct fallback
Add to `/app/backend/.env`:
```
UBER_DIRECT_CLIENT_ID=...
UBER_DIRECT_CLIENT_SECRET=...
UBER_DIRECT_CUSTOMER_ID=...
```
Without these, the engine still runs — it logs Uber-fallback intent as a stub delivery so internal-driver dispatch is unaffected.

## What runs without the Edge Function?
**Everything.** The FastAPI backend already calls `dispatch_order()` directly on payment confirmation (in `checkout_status` and the Stripe webhook). The Edge Function path is the **belt-and-suspenders** trigger for any order inserts that bypass the normal payment flow.
