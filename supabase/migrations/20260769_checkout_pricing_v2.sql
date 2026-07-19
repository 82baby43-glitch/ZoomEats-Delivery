-- Intelligent Checkout Pricing v2 — regulatory fee + free delivery threshold rules

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
