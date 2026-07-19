-- Patch 5: Pricing Rules Dashboard — configurable surge multipliers

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
    'surge_multiplier_peak',
    'surge_multiplier_max',
    'surge_demand_cap',
    'surge_traffic_floor',
    'weather_multiplier',
    'weather_fee',
    'tax_rate',
    'stripe_fee_percent',
    'stripe_fee_fixed',
    'peak_bonus',
    'large_order_bonus',
    'large_order_threshold',
    'guaranteed_pay',
    'long_distance_bonus',
    'long_distance_threshold',
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
  ('Surge Peak Floor Multiplier', 'surge_multiplier_peak', 1.1500, null::numeric, 1.0000, 2.0000),
  ('Surge Maximum Multiplier', 'surge_multiplier_max', 2.0000, null, 1.0000, 3.0000),
  ('Surge Demand Cap', 'surge_demand_cap', 0.5000, null, 0.1000, 1.0000),
  ('Surge Traffic Floor Multiplier', 'surge_traffic_floor', 1.1000, null, 1.0000, 2.0000)
) as v(rule_name, rule_type, value, percentage, minimum_amount, maximum_amount)
where not exists (
  select 1 from public.pricing_rules pr
  where pr.rule_name = v.rule_name and pr.rule_type = v.rule_type and pr.active = true
);
