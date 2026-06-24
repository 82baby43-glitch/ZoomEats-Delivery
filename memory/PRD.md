# ZoomEats PRD

## Original problem statement
> "build this" — uploaded artifact named "cd Desktop zoomeats" (empty file). Confirmed concept: food delivery marketplace.

## User selections (Iteration 1, 2026-01-25)
- App concept: Food delivery marketplace (Uber-Eats-like)
- Roles: Customer + Restaurant/Vendor + Delivery Partner + Admin
- Core features: Browse + cart + checkout + tracking + payments (Stripe) + AI chatbot
- Auth: Emergent Google social login (single SSO, role chosen at onboarding; admin auto-promoted via email allowlist)
- Design: distinctive aesthetic chosen by design agent — "Organic & Earthy" (terracotta + sand + forest, Cabinet Grotesk + Manrope)

## Architecture
- **Backend**: FastAPI (Python) at `/app/backend/server.py`, Mongo via Motor, all routes prefixed `/api`.
- **Frontend**: React 19 + react-router-dom v7 + Tailwind, framer-motion for animation, lucide-react icons.
- **Auth**: Emergent Google OAuth → backend verifies session_id with `demobackend.emergentagent.com`, stores 7-day session in Mongo + HttpOnly cookie.
- **Payments**: Stripe Checkout via `emergentintegrations.payments.stripe.checkout` (key `sk_test_emergent`). Webhook `/api/webhook/stripe`. Frontend polls `/api/checkout/status/{sid}` after redirect.
- **AI**: `LlmChat` with `claude-sonnet-4-5-20250929` via Emergent LLM key. System prompt grounds replies in seeded restaurants & menu items.

## User personas
- **Hungry diner** — discovers restaurants, asks Zoey for recs, orders via Stripe, tracks delivery.
- **Restaurant owner** — runs a kitchen on ZoomEats; CRUD menu; advances order status.
- **Delivery partner** — sees ready orders, accepts pickups, marks delivered.
- **Platform admin** — approves restaurants, monitors metrics & orders.

## Implemented (2026-01-25)
- Landing with hero + search + 3 seeded restaurants (Terra Verde, Hachi Roll Co., Ember & Oak)
- Restaurant detail with categorized menu + add-to-cart
- Cart drawer page with checkout (Stripe redirect) + delivery fee $2.99
- Stripe checkout session create + status polling page (`/checkout/success`) with graceful soft-pending fallback
- Onboarding role picker (vendor/delivery/customer)
- My Orders + Order tracking with 6-step timeline (auto-refresh every 5s)
- Vendor dashboard: profile, menu CRUD, incoming orders with status advance buttons
- Delivery dashboard: available orders, accept pickup, mark delivered
- Admin panel: 5-tile metrics, users table, restaurants approve, orders table
- AI floating chatbot ("Zoey") — Claude Sonnet 4.5, persists chat history per user
- Auth: Emergent Google login, 7-day cookie session, role guards, admin email allowlist
- Backend tests: 18/18 passing (after soft-pending fix on checkout/status)

## Backlog / next priorities
- **P0**: Server-side menu re-pricing in `POST /api/orders` from `db.menu_items` (security hardening — trust user-supplied prices currently).
- **P1**: Wire `useWebPush` into `VendorDashboard.jsx` — call `request()` once per session and `fire()` on realtime new-order events (currently the hook exists but isn't invoked).
- **P1**: Cache geocoded customer coords on `orders.customer_lat / customer_lng` so `/orders/{oid}/tracking` doesn't re-hit Nominatim on every poll (rate-limit risk at 1 req/s).
- **P1**: Admin trend charts (orders/revenue over 7/30 days) + user search + role editor.
- **P1**: Replace soft-pending checkout/status with real Stripe key once user provides one (currently `sk_test_emergent`).
- **P2**: Restaurant filters (cuisine chips, delivery time slider).
- **P2**: Image uploads for vendor menu items (currently URL paste).
- **P2**: CSV export of users/orders/restaurants.
- **P2**: Split `server.py` (1078 LOC) into routers per domain (`/app/backend/routes/`).
- **P3**: Order ratings & reviews; tip-on-delivery.
- **P3**: (Future) Supabase JWT minting for re-enabling per-user Realtime broadcasts under RLS.

## Iteration 5b update (2026-06-24) — Web Push wired into VendorDashboard
- Wired `useWebPush` hook into `/app/frontend/src/pages/VendorDashboard.jsx`:
  - "Enable notifications" pill next to the Live indicator (states: enable / blocked / pings on).
  - `notifiedRef` Set tracks already-pinged order_ids → never double-fire.
  - `primedRef` ensures the first load on mount is silent (no ping for orders that existed before the vendor opened the page).
  - On every refresh (realtime tick or 10s poll), any **newly-placed paid order** triggers `fire("New order · $X", "<customer> — <items>")` with a unique `tag` per order so the OS dedupes.
- Verified via screenshot — Smoke Test Kitchen renders the new "Enable notifications" button with the correct disabled-blocked state under Playwright (headless browsers deny notifications by default).

## Iteration 5 update (2026-06-24) — Live Map + Web Push + RLS
- **Customer live tracking map** (`/app/frontend/src/components/LiveMap.jsx`) — react-leaflet on a CARTO dark tile layer with neon SVG pins for restaurant / customer / driver. Auto-fit bounds; updates whenever `drivers.latitude/longitude` mutates via the existing Supabase Realtime row hook.
- **Vendor web push** (`/app/frontend/src/lib/useWebPush.js`) — minimal wrapper around the browser Notification API. Persists user choice to localStorage; ready to wire into VendorDashboard alongside the existing realtime pulse.
- **Order address geocoding on-demand** — `GET /api/orders/{oid}/tracking` geocodes `orders.address` via Nominatim and returns a `customer` payload `{lat,lng,address}`. The LiveMap consumes it. (Performance note: not yet cached — see backlog.)
- **🛡️ Supabase RLS posture (the previously-skipped item)** — new alembic migration `c1e3f0a01f03` + `/app/supabase/migrations/20260201_rls.sql` enables Row Level Security on all 9 public tables (`users`, `user_sessions`, `restaurants`, `menu_items`, `orders`, `payment_transactions`, `chat_messages`, `drivers`, `deliveries`). All grants to `anon` and `authenticated` revoked → anon-key access returns HTTP 401 `permission denied`. The backend connects as the `postgres` (table-owner) role via the Supabase pooler and bypasses RLS, so SQLAlchemy queries are unaffected. Frontend Realtime broadcasts to anon no longer leak — the 8-10s polling fallback in `OrderDetail.jsx` / `VendorDashboard.jsx` keeps the UI live. `useRealtime.js` silently swallows the expected `CHANNEL_ERROR`.
- **Tests**: 14 new P0 tests (`/app/backend/tests/test_p0_rls_geocode_tracking.py`) — RLS lockdown on 6 sensitive tables via anon HTTP, geocoding happy path (1600 Amphitheatre Pkwy → lat≈37.42), geocoding graceful failure, tracking endpoint shape + auth guards, driver heartbeat. 20/20 regression in `backend_test.py` + 18/18 dispatch (after relaxing one stale Uber-stub assertion now that real Uber Direct creds are live). **52 tests passing.**

## Iteration 4 update (2026-06-24) — Autonomous Dispatch Layer (additive)
- **Goal**: when an order is paid, auto-pick the best internal driver or fall back to Uber Direct. ZERO changes to existing functionality.
- **New tables**: `drivers` (driver_id, user_id unique, availability, lat/lng, workload, last_seen) + `deliveries` (delivery_id, order_id, provider, tracking_id, eta, status, driver_id, meta jsonb).
- **Additive columns on `orders`**: `delivery_type`, `driver_id`, `tracking_id` — all nullable, backward compatible.
- **New module `dispatch.py`**: scoring engine (40% dist-to-restaurant + 40% dist-to-customer + 20% workload, lowest wins), Haversine distance, internal-driver selector, Uber Direct integration with clean stub fallback when keys are blank.
- **Hook**: `run_dispatch()` is auto-called from `/checkout/status` and `/webhook/stripe` on payment confirmation. Idempotent — safe to call multiple times.
- **New endpoints**: `POST /api/driver/location`, `POST /api/driver/availability`, `GET /api/driver/active`, `GET /api/orders/{oid}/tracking`, `POST /api/dispatch/trigger/{oid}` (admin).
- **Bug fix**: workload decrement on delivery completion (`/delivery/orders/{oid}/deliver`) so drivers don't saturate forever.
- **Supabase deliverables** at `/app/supabase/` (Edge Function + trigger SQL + Realtime SQL + README) ready to deploy.
- **Tests**: 38/38 pass — 20 regression (no breakage) + 18 new dispatch-layer tests.
- **Stub mode**: Uber Direct env vars (`UBER_DIRECT_CLIENT_ID/SECRET/CUSTOMER_ID`) intentionally blank in `.env` — the fallback path creates a delivery row with `status='pending_credentials'` so the flow is end-to-end testable. Drop real keys in to go live.

## Iteration 3 update (2026-06-23) — Supabase migration
- **MongoDB → Supabase Postgres** full migration. Backend now uses SQLAlchemy + asyncpg via the Supabase Transaction Pooler URI (`aws-1-us-west-2.pooler.supabase.com:6543`). 
- New files: `database.py`, `models.py`, `alembic/` (initial schema migration applied to Supabase project `njrrhckegbfqhwkqkzvw`).
- `server.py` fully rewritten using SQLAlchemy ORM (~852 LOC). Every endpoint preserved with identical request/response shapes — frontend zero changes.
- Tables: `users`, `user_sessions`, `restaurants`, `menu_items`, `orders` (JSONB items), `payment_transactions` (JSONB metadata), `chat_messages`. Indexes on hot columns.
- Seed (3 restaurants + 9 items + demo vendor) auto-runs on startup if `restaurants` table is empty — now in Postgres.
- Backend test suite re-run on Postgres: **20/20 passing**. Stripe-status NoneType indent bug spotted by testing agent — fixed.
- Old MongoDB stack still present in `requirements.txt` (motor) but unused; can be removed later.

## Iteration 2 update (2026-04-27) — Admin Platform Pulse
- Live Pulse view in `/admin`: auto-refreshing metrics (every 8s), Today's digest powered by Claude Sonnet 4.5, Needs-attention panel (pending approvals + stuck orders + failed payments), live activity feed (30 events) with color-coded type icons & relative timestamps.
- Header now shows live attention badge count on the "Admin" nav link (polls every 15s).
- New backend endpoints: `/api/admin/activity`, `/api/admin/attention`, `/api/admin/digest`.
- "Switch mode" in user menu — re-triggers onboarding without sign-out.
- Onboarding now shows for vendor/delivery/admin on EVERY sign-in (customer skips); admins see a 4-tile layout with Platform Owner highlighted as "Current".

## Iteration 2 update (2026-01-27) — Rebrand
- Replaced header logo with user-provided ZoomEats wordmark (black tile + neon-green swoosh).
- Rebranded entire app to bold black + neon-green dark theme to match logo:
  - `--bg #0A0A0A`, `--surface #141414`, `--primary #B6F127` (neon), white text
  - All inline contrast issues fixed (chatbot bubbles, onboarding role icons, admin tables, cart count badge → black text on neon)
- Stripe stays on `sk_test_emergent` (user has no Stripe key); soft-pending fallback on `/checkout/status` keeps frontend unbroken. To upgrade: replace `STRIPE_API_KEY=` in `/app/backend/.env` and restart backend.
