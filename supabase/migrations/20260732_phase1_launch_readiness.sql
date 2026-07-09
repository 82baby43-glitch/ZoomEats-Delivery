-- Phase 1 launch readiness: restaurant location + launch status

alter table public.restaurants
  add column if not exists city text,
  add column if not exists zip_code text,
  add column if not exists address_validated boolean not null default false,
  add column if not exists launch_status text not null default 'pending_menu';

comment on column public.restaurants.launch_status is 'pending_location | pending_menu | ready';

-- latitude/longitude/state/address already exist on most deployments
alter table public.restaurants
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7);

-- Backfill launch_status for existing rows
update public.restaurants r
set launch_status = case
  when r.latitude is null or r.longitude is null or r.latitude = 0 or r.longitude = 0 then 'pending_location'
  when not exists (
    select 1 from public.menu_items m
    where m.restaurant_id = r.restaurant_id and m.available = true
  ) then 'pending_menu'
  else 'ready'
end
where r.launch_status is null or r.launch_status = 'pending_menu';

-- Only accepting orders when launch-ready
update public.restaurants r
set accepting_orders = (
  r.approved = true
  and r.latitude is not null and r.longitude is not null
  and r.latitude <> 0 and r.longitude <> 0
  and exists (
    select 1 from public.menu_items m
    where m.restaurant_id = r.restaurant_id and m.available = true
  )
)
where r.approved = true;

create index if not exists idx_restaurants_launch_status on public.restaurants(launch_status);
