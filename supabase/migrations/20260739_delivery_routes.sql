-- Completed delivery route archive for future optimization

create table if not exists public.delivery_routes (
  id bigserial primary key,
  driver_id text not null,
  order_id text not null references public.orders(order_id) on delete cascade,
  pickup_coordinates jsonb not null,
  dropoff_coordinates jsonb not null,
  distance_miles numeric,
  delivery_duration numeric,
  average_speed numeric,
  completed_at timestamptz not null default now()
);

create unique index if not exists idx_delivery_routes_order on public.delivery_routes (order_id);
create index if not exists idx_delivery_routes_driver_completed on public.delivery_routes (driver_id, completed_at desc);

alter table public.delivery_routes enable row level security;

drop policy if exists "drivers_read_own_delivery_routes" on public.delivery_routes;
create policy "drivers_read_own_delivery_routes" on public.delivery_routes
  for select using (
    driver_id in (select driver_id from public.drivers where user_id = auth.uid())
  );

drop policy if exists "customers_read_own_delivery_routes" on public.delivery_routes;
create policy "customers_read_own_delivery_routes" on public.delivery_routes
  for select using (
    order_id in (select order_id from public.orders where customer_id = auth.uid())
  );

grant select on public.delivery_routes to authenticated;
grant all on public.delivery_routes to service_role;
