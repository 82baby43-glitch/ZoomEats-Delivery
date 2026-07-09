-- ZoomEats Intelligent Pricing Engine — Functions + RLS (ADDITIVE ONLY)
-- Requires: 20260725_pricing_engine_foundation.sql
-- All financial writes are service-role only. Clients get scoped SELECT.

-- =============================================================================
-- Rule lookup helper
-- =============================================================================

create or replace function public.get_active_pricing_rule(p_rule_type text)
returns public.pricing_rules
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.pricing_rules
  where rule_type = p_rule_type
    and active = true
    and effective_date <= now()
  order by effective_date desc, created_at desc
  limit 1;
$$;

revoke all on function public.get_active_pricing_rule(text) from public;
grant execute on function public.get_active_pricing_rule(text) to service_role;

-- =============================================================================
-- calculate_order_pricing()
-- Server-side customer total breakdown
-- =============================================================================

create or replace function public.calculate_order_pricing(
  p_subtotal numeric,
  p_distance_miles numeric default 0,
  p_tip_amount numeric default 0,
  p_discount_amount numeric default 0,
  p_surge_multiplier numeric default 1,
  p_weather_active boolean default false,
  p_promo_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_delivery public.pricing_rules;
  v_service public.pricing_rules;
  v_small_fee public.pricing_rules;
  v_small_thr public.pricing_rules;
  v_distance public.pricing_rules;
  v_surge_cap public.pricing_rules;
  v_weather_fee public.pricing_rules;
  v_tax public.pricing_rules;
  v_promo public.promotions;

  v_subtotal numeric(12,2) := greatest(coalesce(p_subtotal, 0), 0);
  v_delivery_fee numeric(12,2) := 0;
  v_service_fee numeric(12,2) := 0;
  v_small_order_fee numeric(12,2) := 0;
  v_distance_fee numeric(12,2) := 0;
  v_surge_fee numeric(12,2) := 0;
  v_weather_fee_amt numeric(12,2) := 0;
  v_tax_amount numeric(12,2) := 0;
  v_discount numeric(12,2) := greatest(coalesce(p_discount_amount, 0), 0);
  v_tip numeric(12,2) := greatest(coalesce(p_tip_amount, 0), 0);
  v_customer_total numeric(12,2) := 0;
  v_miles numeric := greatest(coalesce(p_distance_miles, 0), 0);
  v_surge numeric := greatest(coalesce(p_surge_multiplier, 1), 1);
begin
  v_delivery := public.get_active_pricing_rule('delivery_fee');
  v_service := public.get_active_pricing_rule('service_fee');
  v_small_fee := public.get_active_pricing_rule('small_order_fee');
  v_small_thr := public.get_active_pricing_rule('small_order_threshold');
  v_distance := public.get_active_pricing_rule('distance_fee');
  v_surge_cap := public.get_active_pricing_rule('surge_limit');
  v_weather_fee := public.get_active_pricing_rule('weather_fee');
  v_tax := public.get_active_pricing_rule('tax_rate');

  v_delivery_fee := coalesce(v_delivery.value, 2.99);
  if v_delivery.minimum_amount is not null then
    v_delivery_fee := greatest(v_delivery_fee, v_delivery.minimum_amount);
  end if;
  if v_delivery.maximum_amount is not null then
    v_delivery_fee := least(v_delivery_fee, v_delivery.maximum_amount);
  end if;

  -- Membership free delivery handled by caller via discount / promo; keep base fee here
  if v_service.percentage is not null and v_service.percentage > 0 then
    v_service_fee := round(v_subtotal * (v_service.percentage / 100.0), 2);
  else
    v_service_fee := coalesce(v_service.value, 0);
  end if;
  if v_service.minimum_amount is not null then
    v_service_fee := greatest(v_service_fee, v_service.minimum_amount);
  end if;
  if v_service.maximum_amount is not null then
    v_service_fee := least(v_service_fee, v_service.maximum_amount);
  end if;

  if v_small_thr.value is not null and v_subtotal < v_small_thr.value then
    v_small_order_fee := coalesce(v_small_fee.value, 0);
  end if;

  if v_miles > 0 then
    v_distance_fee := round(v_miles * coalesce(v_distance.value, 0), 2);
    if v_distance.maximum_amount is not null then
      v_distance_fee := least(v_distance_fee, v_distance.maximum_amount);
    end if;
  end if;

  if v_surge > 1 then
    v_surge_fee := round(v_delivery_fee * (v_surge - 1), 2);
    if v_surge_cap.value is not null then
      v_surge_fee := least(v_surge_fee, v_surge_cap.value);
    end if;
  end if;

  if coalesce(p_weather_active, false) then
    v_weather_fee_amt := coalesce(v_weather_fee.value, 0);
  end if;

  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo
    from public.promotions
    where lower(code) = lower(trim(p_promo_code))
      and active = true
      and (expiration_date is null or expiration_date > now())
      and (usage_limit is null or usage_count < usage_limit)
    limit 1;

    if found then
      if v_promo.minimum_subtotal is null or v_subtotal >= v_promo.minimum_subtotal then
        if v_promo.discount_type = 'percent' then
          v_discount := v_discount + round(v_subtotal * (v_promo.discount_value / 100.0), 2);
        elsif v_promo.discount_type = 'fixed' then
          v_discount := v_discount + v_promo.discount_value;
        elsif v_promo.discount_type = 'free_delivery' then
          v_discount := v_discount + v_delivery_fee;
        end if;
      end if;
    end if;
  end if;

  v_discount := least(v_discount, v_subtotal + v_delivery_fee + v_service_fee + v_small_order_fee + v_distance_fee + v_surge_fee + v_weather_fee_amt);

  if v_tax.percentage is not null and v_tax.percentage > 0 then
    v_tax_amount := round(greatest(v_subtotal - least(v_discount, v_subtotal), 0) * (v_tax.percentage / 100.0), 2);
  end if;

  v_customer_total := round(
    v_subtotal
    + v_tax_amount
    + v_delivery_fee
    + v_service_fee
    + v_small_order_fee
    + v_distance_fee
    + v_surge_fee
    + v_weather_fee_amt
    - v_discount
    + v_tip
  , 2);

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'tax_amount', v_tax_amount,
    'delivery_fee', v_delivery_fee,
    'service_fee', v_service_fee,
    'small_order_fee', v_small_order_fee,
    'distance_fee', v_distance_fee,
    'surge_fee', v_surge_fee,
    'weather_fee', v_weather_fee_amt,
    'discount_amount', v_discount,
    'tip_amount', v_tip,
    'customer_total', greatest(v_customer_total, 0),
    'promo_code', p_promo_code,
    'distance_miles', v_miles,
    'surge_multiplier', v_surge
  );
end;
$$;

revoke all on function public.calculate_order_pricing(numeric, numeric, numeric, numeric, numeric, boolean, text) from public;
grant execute on function public.calculate_order_pricing(numeric, numeric, numeric, numeric, numeric, boolean, text) to service_role;

-- =============================================================================
-- calculate_driver_pay()
-- =============================================================================

create or replace function public.calculate_driver_pay(
  p_distance_miles numeric default 0,
  p_duration_minutes numeric default 0,
  p_wait_minutes numeric default 0,
  p_tip_amount numeric default 0,
  p_order_subtotal numeric default 0,
  p_weather_active boolean default false,
  p_peak_active boolean default false,
  p_bonus_pay numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base public.pricing_rules;
  v_mile public.pricing_rules;
  v_time public.pricing_rules;
  v_wait public.pricing_rules;
  v_weather public.pricing_rules;
  v_peak public.pricing_rules;
  v_large_bonus public.pricing_rules;
  v_large_thr public.pricing_rules;
  v_guarantee public.pricing_rules;

  v_base_pay numeric(12,2) := 0;
  v_mileage_pay numeric(12,2) := 0;
  v_time_pay numeric(12,2) := 0;
  v_wait_pay numeric(12,2) := 0;
  v_bonus numeric(12,2) := greatest(coalesce(p_bonus_pay, 0), 0);
  v_weather_bonus numeric(12,2) := 0;
  v_peak_bonus numeric(12,2) := 0;
  v_large_order_bonus numeric(12,2) := 0;
  v_tip numeric(12,2) := greatest(coalesce(p_tip_amount, 0), 0);
  v_guaranteed numeric(12,2) := 0;
  v_computed numeric(12,2) := 0;
  v_final numeric(12,2) := 0;
begin
  v_base := public.get_active_pricing_rule('driver_base_pay');
  v_mile := public.get_active_pricing_rule('mileage_rate');
  v_time := public.get_active_pricing_rule('time_rate');
  v_wait := public.get_active_pricing_rule('wait_rate');
  v_weather := public.get_active_pricing_rule('weather_fee');
  v_peak := public.get_active_pricing_rule('peak_bonus');
  v_large_bonus := public.get_active_pricing_rule('large_order_bonus');
  v_large_thr := public.get_active_pricing_rule('large_order_threshold');
  v_guarantee := public.get_active_pricing_rule('guaranteed_pay');

  v_base_pay := coalesce(v_base.value, 3.00);
  v_mileage_pay := round(greatest(coalesce(p_distance_miles, 0), 0) * coalesce(v_mile.value, 0.75), 2);
  v_time_pay := round(greatest(coalesce(p_duration_minutes, 0), 0) * coalesce(v_time.value, 0.20), 2);
  v_wait_pay := round(greatest(coalesce(p_wait_minutes, 0), 0) * coalesce(v_wait.value, 0.15), 2);

  if coalesce(p_weather_active, false) then
    v_weather_bonus := coalesce(v_weather.value, 1.00);
  end if;
  if coalesce(p_peak_active, false) then
    v_peak_bonus := coalesce(v_peak.value, 2.00);
  end if;
  if v_large_thr.value is not null and coalesce(p_order_subtotal, 0) >= v_large_thr.value then
    v_large_order_bonus := coalesce(v_large_bonus.value, 3.00);
  end if;

  v_guaranteed := coalesce(v_guarantee.value, 0);
  v_computed := v_base_pay + v_mileage_pay + v_time_pay + v_wait_pay
    + v_bonus + v_weather_bonus + v_peak_bonus + v_large_order_bonus;
  v_final := round(greatest(v_computed, v_guaranteed) + v_tip, 2);

  return jsonb_build_object(
    'base_pay', v_base_pay,
    'mileage_pay', v_mileage_pay,
    'time_pay', v_time_pay,
    'wait_pay', v_wait_pay,
    'bonus_pay', v_bonus,
    'weather_bonus', v_weather_bonus,
    'peak_bonus', v_peak_bonus,
    'large_order_bonus', v_large_order_bonus,
    'customer_tip', v_tip,
    'guaranteed_pay', v_guaranteed,
    'final_driver_pay', v_final
  );
end;
$$;

revoke all on function public.calculate_driver_pay(numeric, numeric, numeric, numeric, numeric, boolean, boolean, numeric) from public;
grant execute on function public.calculate_driver_pay(numeric, numeric, numeric, numeric, numeric, boolean, boolean, numeric) to service_role;

-- =============================================================================
-- calculate_restaurant_payout()
-- =============================================================================

create or replace function public.calculate_restaurant_payout(
  p_gross_sales numeric,
  p_promotion_adjustment numeric default 0,
  p_refund_adjustment numeric default 0,
  p_chargeback_adjustment numeric default 0,
  p_include_stripe_fee boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_commission public.pricing_rules;
  v_stripe_pct public.pricing_rules;
  v_stripe_fixed public.pricing_rules;

  v_gross numeric(12,2) := greatest(coalesce(p_gross_sales, 0), 0);
  v_commission_amt numeric(12,2) := 0;
  v_promo numeric(12,2) := coalesce(p_promotion_adjustment, 0);
  v_refund numeric(12,2) := coalesce(p_refund_adjustment, 0);
  v_chargeback numeric(12,2) := coalesce(p_chargeback_adjustment, 0);
  v_stripe_fee numeric(12,2) := 0;
  v_net numeric(12,2) := 0;
begin
  v_commission := public.get_active_pricing_rule('commission_rate');
  v_stripe_pct := public.get_active_pricing_rule('stripe_fee_percent');
  v_stripe_fixed := public.get_active_pricing_rule('stripe_fee_fixed');

  if v_commission.percentage is not null then
    v_commission_amt := round(v_gross * (v_commission.percentage / 100.0), 2);
  else
    v_commission_amt := coalesce(v_commission.value, 0);
  end if;

  if coalesce(p_include_stripe_fee, false) then
    v_stripe_fee := round(
      v_gross * (coalesce(v_stripe_pct.percentage, 2.9) / 100.0)
      + coalesce(v_stripe_fixed.value, 0.30)
    , 2);
  end if;

  v_net := round(v_gross - v_commission_amt + v_promo - v_refund - v_chargeback - v_stripe_fee, 2);

  return jsonb_build_object(
    'gross_sales', v_gross,
    'commission_amount', v_commission_amt,
    'promotion_adjustment', v_promo,
    'refund_adjustment', v_refund,
    'chargeback_adjustment', v_chargeback,
    'stripe_fee', v_stripe_fee,
    'net_payout', v_net,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.calculate_restaurant_payout(numeric, numeric, numeric, numeric, boolean) from public;
grant execute on function public.calculate_restaurant_payout(numeric, numeric, numeric, numeric, boolean) to service_role;

-- =============================================================================
-- calculate_platform_profit()
-- =============================================================================

create or replace function public.calculate_platform_profit(
  p_delivery_revenue numeric default 0,
  p_service_fee_revenue numeric default 0,
  p_commission_revenue numeric default 0,
  p_advertising_revenue numeric default 0,
  p_subscription_revenue numeric default 0,
  p_driver_cost numeric default 0,
  p_restaurant_cost numeric default 0,
  p_stripe_cost numeric default 0,
  p_refund_cost numeric default 0,
  p_promotion_cost numeric default 0
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_rev numeric(12,2);
  v_cost numeric(12,2);
  v_net numeric(12,2);
begin
  v_rev := round(
    coalesce(p_delivery_revenue, 0)
    + coalesce(p_service_fee_revenue, 0)
    + coalesce(p_commission_revenue, 0)
    + coalesce(p_advertising_revenue, 0)
    + coalesce(p_subscription_revenue, 0)
  , 2);

  v_cost := round(
    coalesce(p_driver_cost, 0)
    + coalesce(p_restaurant_cost, 0)
    + coalesce(p_stripe_cost, 0)
    + coalesce(p_refund_cost, 0)
    + coalesce(p_promotion_cost, 0)
  , 2);

  v_net := round(v_rev - v_cost, 2);

  return jsonb_build_object(
    'delivery_revenue', coalesce(p_delivery_revenue, 0),
    'service_fee_revenue', coalesce(p_service_fee_revenue, 0),
    'commission_revenue', coalesce(p_commission_revenue, 0),
    'advertising_revenue', coalesce(p_advertising_revenue, 0),
    'subscription_revenue', coalesce(p_subscription_revenue, 0),
    'driver_cost', coalesce(p_driver_cost, 0),
    'restaurant_cost', coalesce(p_restaurant_cost, 0),
    'stripe_cost', coalesce(p_stripe_cost, 0),
    'refund_cost', coalesce(p_refund_cost, 0),
    'promotion_cost', coalesce(p_promotion_cost, 0),
    'net_profit', v_net
  );
end;
$$;

revoke all on function public.calculate_platform_profit(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.calculate_platform_profit(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to service_role;

-- =============================================================================
-- RLS — enable + policies
-- Clients: scoped SELECT only. No client INSERT/UPDATE/DELETE on financial tables.
-- =============================================================================

alter table public.pricing_rules enable row level security;
alter table public.pricing_snapshots enable row level security;
alter table public.driver_earnings enable row level security;
alter table public.restaurant_settlements enable row level security;
alter table public.platform_revenue enable row level security;
alter table public.pricing_audit_logs enable row level security;
alter table public.driver_metrics enable row level security;
alter table public.restaurant_metrics enable row level security;
alter table public.customer_memberships enable row level security;
alter table public.promotions enable row level security;

-- pricing_rules: authenticated can read active rules (for display); no client writes
drop policy if exists pricing_rules_read_active on public.pricing_rules;
create policy pricing_rules_read_active on public.pricing_rules
  for select to authenticated
  using (active = true or public.is_admin());

-- pricing_snapshots: customer sees own; restaurant owner sees own; admin all
drop policy if exists pricing_snapshots_customer_read on public.pricing_snapshots;
create policy pricing_snapshots_customer_read on public.pricing_snapshots
  for select to authenticated
  using (
    customer_id = auth.uid()::text
    or exists (
      select 1 from public.users u
      where u.auth_id = auth.uid() and u.user_id = pricing_snapshots.customer_id
    )
    or public.is_admin()
  );

drop policy if exists pricing_snapshots_restaurant_read on public.pricing_snapshots;
create policy pricing_snapshots_restaurant_read on public.pricing_snapshots
  for select to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = pricing_snapshots.restaurant_id
        and r.owner_id = auth.uid()::text
    )
  );

-- driver_earnings: driver own + admin
drop policy if exists driver_earnings_driver_read on public.driver_earnings;
create policy driver_earnings_driver_read on public.driver_earnings
  for select to authenticated
  using (
    exists (
      select 1 from public.drivers d
      where d.driver_id = driver_earnings.driver_id
        and d.user_id = auth.uid()::text
    )
    or public.is_admin()
  );

-- restaurant_settlements: restaurant own + admin
drop policy if exists restaurant_settlements_vendor_read on public.restaurant_settlements;
create policy restaurant_settlements_vendor_read on public.restaurant_settlements
  for select to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_settlements.restaurant_id
        and r.owner_id = auth.uid()::text
    )
    or public.is_admin()
  );

-- platform_revenue + pricing_audit_logs: admin only
drop policy if exists platform_revenue_admin_read on public.platform_revenue;
create policy platform_revenue_admin_read on public.platform_revenue
  for select to authenticated
  using (public.is_admin());

drop policy if exists pricing_audit_logs_admin_read on public.pricing_audit_logs;
create policy pricing_audit_logs_admin_read on public.pricing_audit_logs
  for select to authenticated
  using (public.is_admin());

-- driver_metrics: driver own + admin
drop policy if exists driver_metrics_driver_read on public.driver_metrics;
create policy driver_metrics_driver_read on public.driver_metrics
  for select to authenticated
  using (
    exists (
      select 1 from public.drivers d
      where d.driver_id = driver_metrics.driver_id
        and d.user_id = auth.uid()::text
    )
    or public.is_admin()
  );

-- restaurant_metrics: vendor own + admin; public rating fields still via restaurants table
drop policy if exists restaurant_metrics_vendor_read on public.restaurant_metrics;
create policy restaurant_metrics_vendor_read on public.restaurant_metrics
  for select to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.restaurant_id = restaurant_metrics.restaurant_id
        and r.owner_id = auth.uid()::text
    )
    or public.is_admin()
  );

-- customer_memberships: own + admin
drop policy if exists customer_memberships_own on public.customer_memberships;
create policy customer_memberships_own on public.customer_memberships
  for select to authenticated
  using (
    customer_id = auth.uid()::text
    or exists (
      select 1 from public.users u
      where u.auth_id = auth.uid() and u.user_id = customer_memberships.customer_id
    )
    or public.is_admin()
  );

-- promotions: anyone authenticated can read active codes (redemption validated server-side)
-- Writes are service-role only (no client edits to pricing/promotions)
drop policy if exists promotions_read_active on public.promotions;
create policy promotions_read_active on public.promotions
  for select to authenticated
  using (active = true or public.is_admin());

-- =============================================================================
-- Grants — SELECT for authenticated where policies allow; NO write grants
-- =============================================================================

grant select on public.pricing_rules to authenticated;
grant select on public.pricing_snapshots to authenticated;
grant select on public.driver_earnings to authenticated;
grant select on public.restaurant_settlements to authenticated;
grant select on public.platform_revenue to authenticated;
grant select on public.pricing_audit_logs to authenticated;
grant select on public.driver_metrics to authenticated;
grant select on public.restaurant_metrics to authenticated;
grant select on public.customer_memberships to authenticated;
grant select on public.promotions to authenticated;

-- Service role full access (bypasses RLS by default in Supabase, grants for clarity)
grant select, insert, update, delete on public.pricing_rules to service_role;
grant select, insert, update, delete on public.pricing_snapshots to service_role;
grant select, insert, update, delete on public.driver_earnings to service_role;
grant select, insert, update, delete on public.restaurant_settlements to service_role;
grant select, insert, update, delete on public.platform_revenue to service_role;
grant select, insert, update, delete on public.pricing_audit_logs to service_role;
grant select, insert, update, delete on public.driver_metrics to service_role;
grant select, insert, update, delete on public.restaurant_metrics to service_role;
grant select, insert, update, delete on public.customer_memberships to service_role;
grant select, insert, update, delete on public.promotions to service_role;

-- Explicitly revoke write from anon/authenticated on financial ledgers
-- (admin policy on pricing_rules/promotions still requires INSERT/UPDATE grants for authenticated)
revoke insert, update, delete on public.pricing_snapshots from anon, authenticated;
revoke insert, update, delete on public.driver_earnings from anon, authenticated;
revoke insert, update, delete on public.restaurant_settlements from anon, authenticated;
revoke insert, update, delete on public.platform_revenue from anon, authenticated;
revoke insert, update, delete on public.pricing_audit_logs from anon, authenticated;
revoke insert, update, delete on public.driver_metrics from anon, authenticated;
revoke insert, update, delete on public.restaurant_metrics from anon, authenticated;
revoke insert, update, delete on public.customer_memberships from anon, authenticated;
revoke insert, update, delete on public.pricing_rules from anon, authenticated;
revoke insert, update, delete on public.promotions from anon, authenticated;
