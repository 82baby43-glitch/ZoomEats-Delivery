-- Driver Earnings Engine Patch 1: long-distance bonus + enhanced calculate_driver_pay

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
    'long_distance_bonus',
    'long_distance_threshold',
    'guaranteed_pay',
    'min_platform_profit',
    'subsidy_enabled',
    'promotion_budget',
    'pricing_version',
    'other'
  )
);

insert into public.pricing_rules (rule_name, rule_type, value, percentage, minimum_amount, maximum_amount, active)
select v.rule_name, v.rule_type, v.value, v.percentage, v.minimum_amount, v.maximum_amount, true
from (values
  ('Long Distance Bonus', 'long_distance_bonus', 4.00, null::numeric, null::numeric, null::numeric),
  ('Long Distance Threshold (miles)', 'long_distance_threshold', 8.00, null, null, null)
) as v(rule_name, rule_type, value, percentage, minimum_amount, maximum_amount)
where not exists (
  select 1 from public.pricing_rules pr
  where pr.rule_name = v.rule_name and pr.rule_type = v.rule_type and pr.active = true
);

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
  v_long_bonus public.pricing_rules;
  v_long_thr public.pricing_rules;
  v_guarantee public.pricing_rules;

  v_base_pay numeric(12,2) := 0;
  v_mileage_pay numeric(12,2) := 0;
  v_time_pay numeric(12,2) := 0;
  v_wait_pay numeric(12,2) := 0;
  v_bonus numeric(12,2) := greatest(coalesce(p_bonus_pay, 0), 0);
  v_weather_bonus numeric(12,2) := 0;
  v_peak_bonus numeric(12,2) := 0;
  v_large_order_bonus numeric(12,2) := 0;
  v_long_distance_bonus numeric(12,2) := 0;
  v_tip numeric(12,2) := greatest(coalesce(p_tip_amount, 0), 0);
  v_guaranteed numeric(12,2) := 0;
  v_computed numeric(12,2) := 0;
  v_pre_tip numeric(12,2) := 0;
  v_final numeric(12,2) := 0;
  v_miles numeric := greatest(coalesce(p_distance_miles, 0), 0);
begin
  v_base := public.get_active_pricing_rule('driver_base_pay');
  v_mile := public.get_active_pricing_rule('mileage_rate');
  v_time := public.get_active_pricing_rule('time_rate');
  v_wait := public.get_active_pricing_rule('wait_rate');
  v_weather := public.get_active_pricing_rule('weather_fee');
  v_peak := public.get_active_pricing_rule('peak_bonus');
  v_large_bonus := public.get_active_pricing_rule('large_order_bonus');
  v_large_thr := public.get_active_pricing_rule('large_order_threshold');
  v_long_bonus := public.get_active_pricing_rule('long_distance_bonus');
  v_long_thr := public.get_active_pricing_rule('long_distance_threshold');
  v_guarantee := public.get_active_pricing_rule('guaranteed_pay');

  v_base_pay := coalesce(v_base.value, 3.00);
  v_mileage_pay := round(v_miles * coalesce(v_mile.value, 0.75), 2);
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
  if v_long_thr.value is not null and v_miles >= v_long_thr.value then
    v_long_distance_bonus := coalesce(v_long_bonus.value, 4.00);
  end if;

  v_guaranteed := coalesce(v_guarantee.value, 0);
  v_computed := v_base_pay + v_mileage_pay + v_time_pay + v_wait_pay
    + v_bonus + v_weather_bonus + v_peak_bonus + v_large_order_bonus + v_long_distance_bonus;
  v_pre_tip := round(greatest(v_computed, v_guaranteed), 2);
  v_final := round(v_pre_tip + v_tip, 2);

  return jsonb_build_object(
    'base_pay', v_base_pay,
    'mileage_pay', v_mileage_pay,
    'time_pay', v_time_pay,
    'wait_pay', v_wait_pay,
    'bonus_pay', v_bonus,
    'weather_bonus', v_weather_bonus,
    'peak_bonus', v_peak_bonus,
    'large_order_bonus', v_large_order_bonus,
    'long_distance_bonus', v_long_distance_bonus,
    'customer_tip', v_tip,
    'guaranteed_pay', v_guaranteed,
    'pre_tip_pay', v_pre_tip,
    'guaranteed_top_up', round(greatest(0, v_guaranteed - v_computed), 2),
    'final_driver_pay', v_final,
    'distance_miles', v_miles,
    'peak_active', coalesce(p_peak_active, false)
  );
end;
$$;

revoke all on function public.calculate_driver_pay(numeric, numeric, numeric, numeric, numeric, boolean, boolean, numeric) from public;
grant execute on function public.calculate_driver_pay(numeric, numeric, numeric, numeric, numeric, boolean, boolean, numeric) to service_role;

-- Persist long-distance bonus on driver_earnings ledger rows
alter table public.driver_earnings
  add column if not exists long_distance_bonus numeric(12,2) not null default 0,
  add column if not exists pre_tip_pay numeric(12,2) not null default 0,
  add column if not exists guaranteed_top_up numeric(12,2) not null default 0;
