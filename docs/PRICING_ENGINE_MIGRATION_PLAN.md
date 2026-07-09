# Pricing Engine Migration Execution Plan

## 1. Database backup checkpoint

Before applying:

1. Supabase Dashboard → Project Settings → Database → **Create backup / PITR checkpoint**
2. Optional dump:

```bash
pg_dump "$DATABASE_URL" --schema=public --format=custom -f zoomeats-public-$(date +%Y%m%d).dump
```

3. Record current counts:

```sql
SELECT count(*) FROM public.orders;
SELECT count(*) FROM public.users;
SELECT count(*) FROM public.drivers;
SELECT count(*) FROM public.restaurants;
SELECT count(*) FROM public.payments;
```

## 2. Migration files

| File | Purpose |
| --- | --- |
| `supabase/migrations/20260725_pricing_engine_foundation.sql` | New tables, indexes, seed rules, immutability trigger |
| `supabase/migrations/20260726_pricing_engine_functions_rls.sql` | `calculate_*` functions, RLS, grants |
| `supabase/migrations/rollback/20260725_pricing_engine_rollback.sql` | Drop **only** new objects |

Apply:

```bash
npm run db:migrate -- --file supabase/migrations/20260725_pricing_engine_foundation.sql
npm run db:migrate -- --file supabase/migrations/20260726_pricing_engine_functions_rls.sql
```

## 3. Rollback strategy

If validation fails:

1. Stop API traffic that writes to new tables (none yet if foundation-only)
2. Run rollback SQL via Management API / `db:migrate --file ...rollback...`
3. Confirm core tables unchanged:

```sql
SELECT count(*) FROM public.orders;
SELECT count(*) FROM public.users;
```

Rollback **does not** touch orders, users, restaurants, drivers, payments, Stripe, or compliance tables.

## 4. Testing environment validation

```bash
node scripts/validate-pricing-engine.mjs
```

Checks:

- New tables exist
- Seed pricing rules present
- `calculate_order_pricing` / `calculate_driver_pay` / `calculate_restaurant_payout` / `calculate_platform_profit` callable
- RLS enabled on financial tables
- Core table row counts unchanged vs pre-check (when provided)

## 5. Production deployment checklist

- [ ] Backup / PITR checkpoint created
- [ ] Audit report reviewed (`docs/PRICING_ENGINE_DATABASE_AUDIT.md`)
- [ ] Conflicts confirmed (no name collisions)
- [ ] Foundation migration applied
- [ ] Functions + RLS migration applied
- [ ] Validation script green
- [ ] Spot-check: existing login, order read, Stripe webhook path still healthy
- [ ] Confirm clients cannot INSERT/UPDATE financial tables (anon + authenticated)
- [ ] Confirm service role can INSERT snapshots/earnings/settlements
- [ ] Document API cutover plan (call `calculate_*` from checkout / dispatch / settlement jobs)
- [ ] Keep rollback SQL ready for 24h post-deploy

## Post-foundation (future, not in this PR)

- Replace hardcoded `delivery_fee = 2.99` with `calculate_order_pricing`
- Persist `pricing_snapshots` at payment confirmation
- Persist `driver_earnings` on delivery complete
- Persist `restaurant_settlements` + Stripe Connect transfer linkage
- Nightly `driver_metrics` / `restaurant_metrics` refresh
- Membership + promo redemption at checkout
