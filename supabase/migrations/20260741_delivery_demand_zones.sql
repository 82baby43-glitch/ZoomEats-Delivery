-- Driver heat map foundation: persisted demand zones for positioning intelligence

create table if not exists public.delivery_demand_zones (
  id bigserial primary key,
  latitude numeric not null,
  longitude numeric not null,
  order_count integer not null default 0,
  time_window text not null default '1h',
  demand_score numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_demand_zones_window_created
  on public.delivery_demand_zones (time_window, created_at desc);

create index if not exists idx_delivery_demand_zones_score
  on public.delivery_demand_zones (demand_score desc);

create index if not exists idx_delivery_demand_zones_lat_lng
  on public.delivery_demand_zones (latitude, longitude);

alter table public.delivery_demand_zones enable row level security;

drop policy if exists "authenticated_read_delivery_demand_zones" on public.delivery_demand_zones;
create policy "authenticated_read_delivery_demand_zones" on public.delivery_demand_zones
  for select using (auth.uid() is not null);

grant select on public.delivery_demand_zones to authenticated;
grant all on public.delivery_demand_zones to service_role;
