-- Logistics performance: latest-location upserts, query indexes, history pruning

create table if not exists public.driver_latest_locations (
  driver_id text primary key,
  order_id text references public.orders(order_id) on delete set null,
  latitude numeric not null,
  longitude numeric not null,
  heading numeric,
  speed numeric,
  accuracy numeric,
  battery_level numeric,
  status text not null default 'online',
  updated_at timestamptz not null default now()
);

create index if not exists idx_driver_latest_locations_order
  on public.driver_latest_locations (order_id)
  where order_id is not null;

create index if not exists idx_driver_latest_locations_updated
  on public.driver_latest_locations (updated_at desc);

alter table public.driver_latest_locations enable row level security;

drop policy if exists "drivers_read_own_latest_location" on public.driver_latest_locations;
create policy "drivers_read_own_latest_location" on public.driver_latest_locations
  for select using (
    driver_id in (select driver_id from public.drivers where user_id = auth.uid())
  );

drop policy if exists "customers_read_order_latest_driver_location" on public.driver_latest_locations;
create policy "customers_read_order_latest_driver_location" on public.driver_latest_locations
  for select using (
    order_id in (select order_id from public.orders where customer_id = auth.uid())
  );

drop policy if exists "restaurants_read_order_latest_driver_location" on public.driver_latest_locations;
create policy "restaurants_read_order_latest_driver_location" on public.driver_latest_locations
  for select using (
    order_id in (
      select o.order_id from public.orders o
      join public.restaurants r on r.restaurant_id = o.restaurant_id
      where r.owner_id = auth.uid()
    )
  );

grant select on public.driver_latest_locations to authenticated;
grant all on public.driver_latest_locations to service_role;

-- Query + retention indexes on high-volume location tables
create index if not exists idx_driver_gps_samples_created
  on public.driver_gps_samples (created_at);

create index if not exists idx_driver_locations_created
  on public.driver_locations (created_at);

create index if not exists idx_order_eta_snapshots_created
  on public.order_eta_snapshots (created_at);

create index if not exists idx_delivery_route_history_created
  on public.delivery_route_history (created_at);

-- Drop append-only driver_locations from realtime (broadcast channel is primary)
do $$
begin
  alter publication supabase_realtime drop table public.driver_locations;
exception
  when undefined_object then null;
  when others then
    raise notice 'driver_locations realtime drop skipped: %', sqlerrm;
end $$;

create or replace function public.prune_logistics_location_history(
  gps_retention_days int default 14,
  location_retention_days int default 7,
  eta_retention_days int default 30,
  route_history_retention_days int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gps_deleted bigint := 0;
  loc_deleted bigint := 0;
  eta_deleted bigint := 0;
  route_deleted bigint := 0;
begin
  delete from public.driver_gps_samples
  where created_at < now() - make_interval(days => gps_retention_days);
  get diagnostics gps_deleted = row_count;

  delete from public.driver_locations
  where created_at < now() - make_interval(days => location_retention_days);
  get diagnostics loc_deleted = row_count;

  delete from public.order_eta_snapshots
  where created_at < now() - make_interval(days => eta_retention_days);
  get diagnostics eta_deleted = row_count;

  delete from public.delivery_route_history
  where created_at < now() - make_interval(days => route_history_retention_days);
  get diagnostics route_deleted = row_count;

  return jsonb_build_object(
    'driver_gps_samples', gps_deleted,
    'driver_locations', loc_deleted,
    'order_eta_snapshots', eta_deleted,
    'delivery_route_history', route_deleted
  );
end;
$$;

grant execute on function public.prune_logistics_location_history(int, int, int, int) to service_role;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'zoomeats-prune-logistics-history';

  perform cron.schedule(
    'zoomeats-prune-logistics-history',
    '15 4 * * *',
    $cron$select public.prune_logistics_location_history();$cron$
  );
exception
  when others then
    raise notice 'logistics prune cron schedule skipped: %', sqlerrm;
end $$;
