# ZoomEats Pricing Engine — Current Database Structure & Migration Plan

**Audit date:** 2026-07-09  
**Project:** `njrrhckegbfqhwkqkzvw`  
**Method:** Live Supabase PostgreSQL introspection via Management API (read-only)  
**Scope:** Additive foundation only — no destructive changes to existing tables

---

## CURRENT DATABASE STRUCTURE

### Summary

| Metric | Count |
| --- | ---: |
| Public tables | 51 |
| Primary keys | 50 tables with PKs |
| Foreign keys (enforced) | 9 |
| RLS policies | 78 |
| Triggers | 14 |
| Public functions | 12 |
| Indexes | 136 |
| Orders (live) | 129 total / 11 paid |
| User roles | customer 104, vendor 34, admin 27, delivery 15 |

### Core marketplace tables (must not break)

| Table | PK | Key columns / notes |
| --- | --- | --- |
| `users` | `user_id` (text) | `auth_id`, `email`, `role`, compliance flags |
| `restaurants` | `restaurant_id` (text) | `owner_id` → users, Stripe Connect fields, approval |
| `drivers` | `driver_id` (text) | `user_id` → users, rating, workload, Stripe Connect |
| `menu_items` | `item_id` (text) | `restaurant_id` → restaurants |
| `orders` | `order_id` (text) | `customer_id`, `restaurant_id`, `driver_id`, money cols as `double precision`, Stripe IDs, dispatch fields |
| `deliveries` | `delivery_id` | `order_id` → orders |
| `payments` / `payment_transactions` / `payment_logs` | various | Stripe payment trail |
| `stripe_connect_accounts` | `account_id` | Connect payouts for drivers/restaurants |
| `contractor_payments` | `payment_id` | Tax/1099 contractor payment records (≠ driver earnings ledger) |

### Existing money fields on `orders`

`subtotal`, `delivery_fee`, `total`, `amount_paid`, `amount_total`, `total_amount`, `currency`

Pricing today is **hardcoded in API** (`delivery_fee = 2.99`). No fee breakdown, driver pay ledger, restaurant settlement, or platform P&L tables exist.

### Enforced foreign keys today

- `orders.customer_id` → `users.user_id`
- `orders.restaurant_id` → `restaurants.restaurant_id`
- `restaurants.owner_id` → `users.user_id`
- `drivers.user_id` → `users.user_id`
- `menu_items.restaurant_id` → `restaurants.restaurant_id`
- `deliveries.order_id` → `orders.order_id`
- `payments.order_id` → `orders.order_id`
- `user_sessions.user_id` → `users.user_id`
- `notification_deliveries.notification_id` → `compliance_notifications.notification_id`

**Note:** `orders.driver_id` has **no** FK today (soft reference). New pricing tables follow the same pattern for optional `driver_id`.

### Existing RLS (relevant)

- Customers / drivers / vendors can **read** their own orders
- Authenticated clients generally **cannot update** orders (`orders_no_update_for_authenticated`)
- Service role performs payment + dispatch writes
- Financial-ish tables (`contractor_payments`, `stripe_connect_accounts`) are own-read / service-write style

### Existing triggers (do not disturb)

- Auth signup: `handle_new_user` on `auth.users`
- Orders: dispatch notify, status transition enforcement, `updated_at`, payment→status sync
- Payments: upsert log + `updated_at`
- Agreement acceptances: driver activation

### Existing functions (do not replace)

`handle_new_user`, `normalize_signup_role`, `fn_dispatch_order_notify`, `enforce_order_status_transition`, `enforce_order_state_transition`, `set_orders_*`, `on_payment_upsert`, `activate_driver_after_all_acceptances`, `log_auth_event`, `set_updated_at`

### Orders indexes already present

`orders_pkey (order_id)`, plus customer/driver/restaurant/status/payment/stripe indexes. **Do not recreate** `orders.order_id` index.

### Target tables — existence check (pre-migration)

| Proposed table | Exists? |
| --- | --- |
| `pricing_rules` | No |
| `pricing_snapshots` | No |
| `driver_earnings` | No |
| `restaurant_settlements` | No |
| `platform_revenue` | No |
| `pricing_audit_logs` | No |
| `driver_metrics` | No |
| `restaurant_metrics` | No |
| `customer_memberships` | No |
| `promotions` | No |

---

## CONFLICT ANALYSIS

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| Name collision with `audit_logs` / `payment_audit_log` | Low — different names | Use `pricing_audit_logs` |
| Collision with `contractor_payments` | Low — tax ledger vs per-order earnings | Keep both; document relationship |
| Altering `orders` money columns | High if done | **Do not alter** — snapshots store expanded breakdown |
| Hard FK on `driver_id` | Medium — orphans possible | Soft reference (no FK) matching `orders.driver_id` |
| Hard FK on `order_id` | Low — PK exists | Use `REFERENCES public.orders(order_id)` |
| Client write access to financial tables | High | RLS deny writes for `anon`/`authenticated`; service role only |
| Replacing auth/dispatch functions | Critical | New function names only (`calculate_*`) |
| Double-precision money on orders | Existing debt | New tables use `numeric(12,2)` |

---

## RECOMMENDED MIGRATION PLAN

### Principles

1. **Additive only** — `CREATE TABLE IF NOT EXISTS`, no `DROP`, no column removals on live tables
2. **Preserve** users, auth, profiles, restaurants, drivers, orders, items, dispatch, Stripe, analytics
3. **Server-side money** — calculation functions + service-role writes; clients read-only where allowed
4. **Immutable snapshots** — block UPDATE/DELETE on completed pricing snapshots
5. **Rollback ready** — companion rollback SQL drops **only** new objects

### Execution order

1. Backup checkpoint (Supabase dashboard snapshot / `pg_dump` of public schema)
2. Apply `20260725_pricing_engine_foundation.sql` (tables, indexes, seed rules, immutability)
3. Apply `20260726_pricing_engine_functions_rls.sql` (calc functions + RLS + grants)
4. Validate with `scripts/validate-pricing-engine.mjs`
5. Wire API later (out of scope for this foundation) to call `calculate_*` and persist rows via service role

### Rollback

Run `supabase/migrations/rollback/20260725_pricing_engine_rollback.sql` — drops new tables/functions/policies only.

### Production checklist

See `docs/PRICING_ENGINE_MIGRATION_PLAN.md`.
