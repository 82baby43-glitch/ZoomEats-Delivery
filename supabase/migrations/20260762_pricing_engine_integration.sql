-- Pricing Engine app integration: order columns, snapshot extensions, merchant commission, new rules

-- Per-merchant commission override (null = use platform default)
alter table public.restaurants
  add column if not exists commission_rate numeric(8,4);

comment on column public.restaurants.commission_rate is 'Optional merchant-specific commission %; null uses platform pricing_rules';

-- Order pricing breakdown columns
alter table public.orders
  add column if not exists tax_amount numeric(12,2) default 0,
  add column if not exists service_fee numeric(12,2) default 0,
  add column if not exists tip_amount numeric(12,2) default 0,
  add column if not exists discount_amount numeric(12,2) default 0,
  add column if not exists small_order_fee numeric(12,2) default 0,
  add column if not exists pricing_version text;

-- Extended pricing snapshot for analytics / auditing
alter table public.pricing_snapshots
  add column if not exists driver_payout numeric(12,2) default 0,
  add column if not exists restaurant_payout numeric(12,2) default 0,
  add column if not exists platform_revenue numeric(12,2) default 0,
  add column if not exists stripe_fee numeric(12,2) default 0,
  add column if not exists estimated_profit numeric(12,2) default 0,
  add column if not exists pricing_version text;

-- Extend rule_type check for profit protection + admin controls
alter table public.pricing_rules drop constraint if exists pricing_rules_rule_type_check;
alter table public.pricing_rules add constraint pricing_rules_rule_type_check check (
  rule_type in (
    'driver_base_pay',
    'mileage_rate',
    'time_rate',
    'wait_rate',
    'service_fee',
    'commission_rate',
    'delivery_fee',
    'small_order_fee',
    'small_order_threshold',
    'distance_fee',
    'surge_fee',
    'surge_limit',
    'weather_multiplier',
    'weather_fee',
    'tax_rate',
    'stripe_fee_percent',
    'stripe_fee_fixed',
    'peak_bonus',
    'large_order_bonus',
    'large_order_threshold',
    'guaranteed_pay',
    'min_platform_profit',
    'subsidy_enabled',
    'promotion_budget',
    'pricing_version',
    'other'
  )
);

-- Seed admin control rules
insert into public.pricing_rules (rule_name, rule_type, value, percentage, minimum_amount, maximum_amount, active)
select v.rule_name, v.rule_type, v.value, v.percentage, v.minimum_amount, v.maximum_amount, true
from (values
  ('Minimum Platform Profit', 'min_platform_profit', 1.50, null::numeric, null::numeric, null::numeric),
  ('Subsidy Mode Enabled', 'subsidy_enabled', 0, null, null, null),
  ('Promotion Budget Cap', 'promotion_budget', 500.00, null, null, null),
  ('Pricing Engine Version', 'pricing_version', 1, null, null, null)
) as v(rule_name, rule_type, value, percentage, minimum_amount, maximum_amount)
where not exists (
  select 1 from public.pricing_rules pr
  where pr.rule_name = v.rule_name and pr.rule_type = v.rule_type and pr.active = true
);

-- Restaurant payout with optional per-merchant commission override
create or replace function public.calculate_restaurant_payout(
  p_gross_sales numeric,
  p_promotion_adjustment numeric default 0,
  p_refund_adjustment numeric default 0,
  p_chargeback_adjustment numeric default 0,
  p_include_stripe_fee boolean default false,
  p_commission_percent numeric default null
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
  v_commission_pct numeric(8,4);
  v_promo numeric(12,2) := coalesce(p_promotion_adjustment, 0);
  v_refund numeric(12,2) := coalesce(p_refund_adjustment, 0);
  v_chargeback numeric(12,2) := coalesce(p_chargeback_adjustment, 0);
  v_stripe_fee numeric(12,2) := 0;
  v_net numeric(12,2) := 0;
begin
  v_commission := public.get_active_pricing_rule('commission_rate');
  v_stripe_pct := public.get_active_pricing_rule('stripe_fee_percent');
  v_stripe_fixed := public.get_active_pricing_rule('stripe_fee_fixed');

  v_commission_pct := coalesce(p_commission_percent, v_commission.percentage);
  if v_commission_pct is not null then
    v_commission_amt := round(v_gross * (v_commission_pct / 100.0), 2);
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
    'commission_percent', v_commission_pct,
    'promotion_adjustment', v_promo,
    'refund_adjustment', v_refund,
    'chargeback_adjustment', v_chargeback,
    'stripe_fee', v_stripe_fee,
    'net_payout', v_net,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.calculate_restaurant_payout(numeric, numeric, numeric, numeric, boolean, numeric) from public;
grant execute on function public.calculate_restaurant_payout(numeric, numeric, numeric, numeric, boolean, numeric) to service_role;
