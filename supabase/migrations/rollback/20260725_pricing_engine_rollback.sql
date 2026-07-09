-- ROLLBACK: ZoomEats Pricing Engine foundation
-- Drops ONLY objects created by 20260725 / 20260726 migrations.
-- Does NOT touch orders, users, restaurants, drivers, payments, Stripe, compliance.

begin;

-- Drop policies (ignore missing)
drop policy if exists pricing_rules_read_active on public.pricing_rules;
drop policy if exists pricing_snapshots_customer_read on public.pricing_snapshots;
drop policy if exists pricing_snapshots_restaurant_read on public.pricing_snapshots;
drop policy if exists driver_earnings_driver_read on public.driver_earnings;
drop policy if exists restaurant_settlements_vendor_read on public.restaurant_settlements;
drop policy if exists platform_revenue_admin_read on public.platform_revenue;
drop policy if exists pricing_audit_logs_admin_read on public.pricing_audit_logs;
drop policy if exists driver_metrics_driver_read on public.driver_metrics;
drop policy if exists restaurant_metrics_vendor_read on public.restaurant_metrics;
drop policy if exists customer_memberships_own on public.customer_memberships;
drop policy if exists promotions_read_active on public.promotions;

-- Drop functions created for pricing engine
drop function if exists public.calculate_order_pricing(numeric, numeric, numeric, numeric, numeric, boolean, text);
drop function if exists public.calculate_driver_pay(numeric, numeric, numeric, numeric, numeric, boolean, boolean, numeric);
drop function if exists public.calculate_restaurant_payout(numeric, numeric, numeric, numeric, boolean);
drop function if exists public.calculate_platform_profit(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
drop function if exists public.get_active_pricing_rule(text);
drop function if exists public.prevent_pricing_snapshot_mutation();
drop function if exists public.is_admin();

-- Drop tables (new only)
drop table if exists public.pricing_audit_logs cascade;
drop table if exists public.platform_revenue cascade;
drop table if exists public.restaurant_settlements cascade;
drop table if exists public.driver_earnings cascade;
drop table if exists public.pricing_snapshots cascade;
drop table if exists public.pricing_rules cascade;
drop table if exists public.driver_metrics cascade;
drop table if exists public.restaurant_metrics cascade;
drop table if exists public.customer_memberships cascade;
drop table if exists public.promotions cascade;

-- NOTE: public.set_updated_at() may be shared — intentionally NOT dropped

commit;
