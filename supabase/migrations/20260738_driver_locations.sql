-- Real-time driver location tracking (GPS service foundation)

create table if not exists public.driver_locations (
  id bigserial primary key,
  driver_id text not null,
  order_id text references public.orders(order_id) on delete set null,
  latitude numeric not null,
  longitude numeric not null,
  heading numeric,
  speed numeric,
  accuracy numeric,
  battery_level numeric,
  status text not null default 'online',
  created_at timestamptz not null default now()
);

create index if not exists idx_driver_locations_driver on public.driver_locations (driver_id, created_at desc);
create index if not exists idx_driver_locations_order on public.driver_locations (order_id, created_at desc);

alter table public.driver_locations enable row level security;

drop policy if exists "drivers_read_own_locations" on public.driver_locations;
create policy "drivers_read_own_locations" on public.driver_locations
  for select using (
    driver_id in (select driver_id from public.drivers where user_id = auth.uid())
  );

drop policy if exists "customers_read_order_driver_locations" on public.driver_locations;
create policy "customers_read_order_driver_locations" on public.driver_locations
  for select using (
    order_id in (select order_id from public.orders where customer_id = auth.uid())
  );

drop policy if exists "restaurants_read_order_driver_locations" on public.driver_locations;
create policy "restaurants_read_order_driver_locations" on public.driver_locations
  for select using (
    order_id in (
      select o.order_id from public.orders o
      join public.restaurants r on r.restaurant_id = o.restaurant_id
      where r.owner_id = auth.uid()
    )
  );

grant select on public.driver_locations to authenticated;
grant all on public.driver_locations to service_role;

do $$
begin
  alter publication supabase_realtime add table public.driver_locations;
exception
  when duplicate_object then null;
end $$;
