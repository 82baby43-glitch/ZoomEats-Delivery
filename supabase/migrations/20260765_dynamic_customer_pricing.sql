-- Patch 2: seed free delivery promotions for dynamic customer pricing

insert into public.promotions (code, discount_type, discount_value, usage_limit, active, minimum_subtotal, expiration_date)
select v.code, v.discount_type, v.discount_value, v.usage_limit, true, v.minimum_subtotal, v.expiration_date
from (values
  ('FREEDELIVERY', 'free_delivery', 0, 10000, 15.00::numeric, null::timestamptz),
  ('FIRSTORDER', 'percent', 10, 5000, 10.00::numeric, null::timestamptz),
  ('SAVE5', 'fixed', 5, 2000, 20.00::numeric, null::timestamptz)
) as v(code, discount_type, discount_value, usage_limit, minimum_subtotal, expiration_date)
where not exists (
  select 1 from public.promotions p where lower(p.code) = lower(v.code)
);
