-- Intelligent Checkout Pricing v2 — regulatory fee + free delivery threshold rules

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
    'free_delivery_threshold',
    'regulatory_fee',
    'other'
  )
);

insert into public.pricing_rules (rule_name, rule_type, value, percentage, active, effective_date)
select 'Free Delivery Threshold', 'free_delivery_threshold', 25.00, null, true, now()
where not exists (
  select 1 from public.pricing_rules where rule_type = 'free_delivery_threshold' and active = true
);

insert into public.pricing_rules (rule_name, rule_type, value, percentage, active, effective_date)
select 'Regulatory Fee', 'regulatory_fee', 0, null, false, now()
where not exists (
  select 1 from public.pricing_rules where rule_type = 'regulatory_fee' and active = true
);
