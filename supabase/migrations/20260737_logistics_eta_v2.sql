-- Live logistics map + intelligent ETA engine v2 (additive)

create table if not exists public.order_eta_snapshots (
  id bigserial primary key,
  order_id text not null references public.orders(order_id) on delete cascade,
  driver_id text,
  eta_pickup_min numeric,
  eta_dropoff_min numeric,
  live_status text,
  driver_lat numeric,
  driver_lng numeric,
  heading_deg numeric,
  speed_kmh numeric,
  route_polyline jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_eta_snapshots_order on public.order_eta_snapshots (order_id, created_at desc);

create table if not exists public.driver_gps_samples (
  id bigserial primary key,
  driver_id text not null,
  order_id text,
  lat numeric not null,
  lng numeric not null,
  heading_deg numeric,
  speed_mps numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_driver_gps_samples_driver on public.driver_gps_samples (driver_id, created_at desc);
create index if not exists idx_driver_gps_samples_order on public.driver_gps_samples (order_id, created_at desc);

create table if not exists public.delivery_route_history (
  id bigserial primary key,
  order_id text not null references public.orders(order_id) on delete cascade,
  driver_id text,
  route_points jsonb not null default '[]'::jsonb,
  total_distance_km numeric,
  total_eta_min numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_route_history_order on public.delivery_route_history (order_id, created_at desc);

alter table public.order_eta_snapshots enable row level security;
alter table public.driver_gps_samples enable row level security;
alter table public.delivery_route_history enable row level security;

-- Customers read ETA history for their orders; drivers read own GPS trail
drop policy if exists "customers_read_order_eta" on public.order_eta_snapshots;
create policy "customers_read_order_eta" on public.order_eta_snapshots
  for select using (
    order_id in (select order_id from public.orders where customer_id = auth.uid())
  );

drop policy if exists "drivers_read_own_gps" on public.driver_gps_samples;
create policy "drivers_read_own_gps" on public.driver_gps_samples
  for select using (
    driver_id in (select driver_id from public.drivers where user_id = auth.uid())
  );

drop policy if exists "customers_read_route_history" on public.delivery_route_history;
create policy "customers_read_route_history" on public.delivery_route_history
  for select using (
    order_id in (select order_id from public.orders where customer_id = auth.uid())
  );

grant select on public.order_eta_snapshots to authenticated;
grant select on public.driver_gps_samples to authenticated;
grant select on public.delivery_route_history to authenticated;
grant all on public.order_eta_snapshots to service_role;
grant all on public.driver_gps_samples to service_role;
grant all on public.delivery_route_history to service_role;
