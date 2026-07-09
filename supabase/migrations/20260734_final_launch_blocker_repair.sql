-- Final launch blocker repair: backfill restaurant owner_id from onboarding

update public.restaurants r
set owner_id = ro.user_id,
    updated_at = now()
from public.restaurant_onboarding ro
where r.restaurant_id = ro.restaurant_id
  and (r.owner_id is null or r.owner_id = '')
  and ro.user_id is not null;

-- Re-sync launch_status for restaurants with coords + menu (stripe may still be pending_payout)
update public.restaurants r
set launch_status = case
  when r.latitude is null or r.longitude is null or r.latitude = 0 or r.longitude = 0 then 'pending_location'
  when not exists (
    select 1 from public.menu_items m
    where m.restaurant_id = r.restaurant_id and m.available = true
  ) then 'pending_menu'
  when not exists (
    select 1 from public.restaurant_onboarding ro
    where ro.restaurant_id = r.restaurant_id
      and ro.stripe_connect_id is not null
      and ro.stripe_connect_complete = true
  ) then 'pending_payout'
  else 'ready'
end
where r.approved = true;
