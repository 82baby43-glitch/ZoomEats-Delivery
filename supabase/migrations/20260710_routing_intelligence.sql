-- Uber-grade routing intelligence layer (does not replace dispatch-order)

create table if not exists public.driver_route_states (
  driver_id text primary key,
  active_orders jsonb not null default '[]'::jsonb,
  current_location jsonb not null default '{}'::jsonb,
  current_route jsonb not null default '[]'::jsonb,
  remaining_stops jsonb not null default '[]'::jsonb,
  total_eta_minutes numeric default 0,
  total_distance_km numeric default 0,
  last_reroute_timestamp timestamptz,
  fallback_mode boolean default false,
  last_good_route jsonb,
  earnings_per_hour_estimate numeric,
  updated_at timestamptz default now()
);

create table if not exists public.routing_metrics_log (
  id bigserial primary key,
  driver_id text,
  event_type text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_routing_metrics_driver on public.routing_metrics_log (driver_id, created_at desc);
create index if not exists idx_driver_route_states_updated on public.driver_route_states (updated_at desc);

alter table public.driver_route_states enable row level security;
alter table public.routing_metrics_log enable row level security;

-- Drivers read own route; service role writes
drop policy if exists "drivers_read_own_route" on public.driver_route_states;
create policy "drivers_read_own_route" on public.driver_route_states
  for select using (
    driver_id in (select driver_id from public.drivers where user_id = auth.uid())
  );

grant select on public.driver_route_states to authenticated;
grant all on public.driver_route_states to service_role;
grant all on public.routing_metrics_log to service_role;

-- Realtime for route state updates
do $$
begin
  alter publication supabase_realtime add table public.driver_route_states;
exception
  when duplicate_object then null;
end $$;
