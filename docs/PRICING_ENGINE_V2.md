# Pricing Engine V2 — Application Integration

Additive upgrade on top of the V1 database foundation.

## Single source of truth

`lib/pricing/PricingEngine.ts` (mirrored to `supabase/functions/_shared/pricing/`)

All money flows through `calculateOrderPricing()`:

- Customer checkout (`POST /orders`, `POST /checkout/session`)
- Cart quote preview (`POST /pricing/quote`)
- Driver acceptance offers (`GET /delivery/available` + `/pricing/driver-offer/:id`)
- Stripe payment confirmation → immutable ledgers
- Admin control center (`/admin/pricing`)

## Key guarantees

- Tips never reduce base/guaranteed driver pay (tips stack on top)
- Stripe amounts are revalidated server-side before session creation
- Clients cannot write financial tables (RLS + service-role writes)
- Pricing rules are cached (~60s) for <200ms quote targets
- Snapshots are immutable (DB trigger + unique order_id)

## Admin

`/admin/pricing` — edit fees/pay rates/limits, view analytics, AI recommendations, promotions.

## Tests

```bash
npm run test:pricing
npm run db:validate-pricing
```
