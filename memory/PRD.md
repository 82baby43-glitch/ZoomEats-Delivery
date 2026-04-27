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
- **P1**: Replace soft-pending checkout/status with real Stripe key once user provides one (current `sk_test_emergent` placeholder fails on session retrieval).
- **P1**: Server-side re-pricing in `POST /api/orders` from `db.menu_items` (security hardening).
- **P2**: Restaurant filters (cuisine chips, delivery time slider).
- **P2**: Image uploads for vendor menu items (currently URL paste).
- **P2**: Real-time order updates via WebSocket instead of 5s polling.
- **P2**: Split `server.py` (740 LOC) into routers per domain.
- **P3**: Order ratings & reviews; tip-on-delivery.

## Iteration 2 update (2026-01-27)
- Replaced header logo with user-provided ZoomEats wordmark (black tile + neon-green swoosh).
- Rebranded entire app to bold black + neon-green dark theme to match logo:
  - `--bg #0A0A0A`, `--surface #141414`, `--primary #B6F127` (neon), white text
  - All inline contrast issues fixed (chatbot bubbles, onboarding role icons, admin tables, cart count badge → black text on neon)
- Stripe stays on `sk_test_emergent` (user has no Stripe key); soft-pending fallback on `/checkout/status` keeps frontend unbroken. To upgrade: replace `STRIPE_API_KEY=` in `/app/backend/.env` and restart backend.
