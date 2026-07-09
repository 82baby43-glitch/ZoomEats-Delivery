-- Grandfather existing drivers with approved car delivery mode
insert into public.driver_delivery_modes (user_id, driver_id, mode_key, approval_status, approved_at, safety_acknowledged)
select d.user_id, d.driver_id, 'car', 'approved', now(), true
from public.drivers d
where not exists (
  select 1 from public.driver_delivery_modes m
  where m.user_id = d.user_id and m.mode_key = 'car'
);
